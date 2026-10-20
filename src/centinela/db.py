"""Base de datos local (SQLite).

Por las líneas rojas del CLAUDE.md, aquí solo entra: texto del comentario, URL
del artículo, nombre de la cuenta tal como aparece y fechas. Nada de nombres
reales, enlaces a perfiles, avatares ni nada sobre quién hay detrás.
"""

from __future__ import annotations

import hashlib
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Iterable

from .modelos import Comentario
from .tiempo import hace, iso

PENDIENTE = "pendiente_clasificar"
DESCARTADO = "descartado"
# Lo que no ha llegado a candidato a delito se borra pasado un tiempo (ver purgar).
ESTADOS_PURGABLES = (PENDIENTE, DESCARTADO)

ESQUEMA = """
CREATE TABLE IF NOT EXISTS articulos (
    id                  INTEGER PRIMARY KEY,
    medio_id            TEXT NOT NULL,
    url                 TEXT NOT NULL UNIQUE,
    titulo              TEXT NOT NULL DEFAULT '',
    descubierto_en      TEXT NOT NULL,
    ultimo_rastreo      TEXT,
    comentarios_vistos  INTEGER
);
CREATE INDEX IF NOT EXISTS articulos_medio ON articulos (medio_id, descubierto_en);

CREATE TABLE IF NOT EXISTS comentarios (
    id                 INTEGER PRIMARY KEY,
    articulo_id        INTEGER NOT NULL REFERENCES articulos (id),
    id_externo         TEXT NOT NULL,
    respuesta_a        TEXT,
    posicion           INTEGER NOT NULL,
    cuenta             TEXT NOT NULL,
    texto              TEXT NOT NULL,
    hash_texto         TEXT NOT NULL,
    fecha_publicacion  TEXT,
    fecha_texto        TEXT NOT NULL,
    primera_vez_visto  TEXT NOT NULL,
    ultima_vez_visto   TEXT NOT NULL,
    estado             TEXT NOT NULL DEFAULT 'pendiente_clasificar',
    UNIQUE (articulo_id, id_externo)
);
CREATE INDEX IF NOT EXISTS comentarios_estado ON comentarios (estado);

CREATE TABLE IF NOT EXISTS rastreos (
    id                    INTEGER PRIMARY KEY,
    medio_id              TEXT NOT NULL,
    inicio                TEXT NOT NULL,
    fin                   TEXT,
    articulos_rastreados  INTEGER NOT NULL DEFAULT 0,
    comentarios_nuevos    INTEGER NOT NULL DEFAULT 0,
    errores               INTEGER NOT NULL DEFAULT 0,
    detenido_por          TEXT
);
"""


def conectar(ruta: Path | str) -> sqlite3.Connection:
    if str(ruta) != ":memory:":
        Path(ruta).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(ruta)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(ESQUEMA)
    return con


def registrar_articulo(
    con: sqlite3.Connection, medio_id: str, url: str, titulo: str, momento: datetime
) -> int:
    with con:
        con.execute(
            """
            INSERT INTO articulos (medio_id, url, titulo, descubierto_en) VALUES (?, ?, ?, ?)
            ON CONFLICT (url) DO UPDATE SET
                titulo = CASE WHEN articulos.titulo = '' THEN excluded.titulo ELSE articulos.titulo END
            """,
            (medio_id, url, titulo or "", iso(momento)),
        )
    return con.execute("SELECT id FROM articulos WHERE url = ?", (url,)).fetchone()["id"]


def articulos_para_rastrear(
    con: sqlite3.Connection,
    medio_id: str,
    *,
    ventana_horas: float,
    horas_entre_rastreos: float,
    limite: int,
    momento: datetime,
) -> list[sqlite3.Row]:
    """Artículos recientes que no se han mirado nunca o hace rato. Primero los nunca vistos."""
    return con.execute(
        """
        SELECT id, url, titulo FROM articulos
        WHERE medio_id = ? AND descubierto_en >= ?
          AND (ultimo_rastreo IS NULL OR ultimo_rastreo <= ?)
        ORDER BY ultimo_rastreo IS NOT NULL, ultimo_rastreo, descubierto_en DESC
        LIMIT ?
        """,
        (medio_id, hace(momento, ventana_horas), hace(momento, horas_entre_rastreos), limite),
    ).fetchall()


def guardar_comentarios(
    con: sqlite3.Connection,
    articulo_id: int,
    comentarios: Iterable[Comentario],
    momento: datetime,
) -> int:
    """Guarda los comentarios leídos de un artículo y lo marca como rastreado.

    Devuelve cuántos son nuevos. Si uno ya estaba no se toca su texto: vale la
    primera versión vista, que es la que puede acabar en una denuncia.
    """
    marca = iso(momento)
    vistos = 0
    nuevos = 0
    with con:
        for c in comentarios:
            vistos += 1
            ya_estaba = con.execute(
                "UPDATE comentarios SET ultima_vez_visto = ? WHERE articulo_id = ? AND id_externo = ?",
                (marca, articulo_id, c.id_externo),
            ).rowcount
            if ya_estaba:
                continue
            con.execute(
                """
                INSERT INTO comentarios (
                    articulo_id, id_externo, respuesta_a, posicion, cuenta, texto, hash_texto,
                    fecha_publicacion, fecha_texto, primera_vez_visto, ultima_vez_visto
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    articulo_id,
                    c.id_externo,
                    c.respuesta_a,
                    c.posicion,
                    c.cuenta,
                    c.texto,
                    hashlib.sha256(c.texto.encode()).hexdigest(),
                    c.fecha_publicacion,
                    c.fecha_texto,
                    marca,
                    marca,
                ),
            )
            nuevos += 1
        con.execute(
            "UPDATE articulos SET ultimo_rastreo = ?, comentarios_vistos = ? WHERE id = ?",
            (marca, vistos, articulo_id),
        )
    return nuevos


def purgar(con: sqlite3.Connection, dias: float, momento: datetime) -> int:
    """Borra los comentarios sin interés pasado un tiempo (minimización de datos).

    Se borran los pendientes o descartados de hace más de `dias`, salvo los de
    artículos con algún candidato: esos se quedan como contexto del hilo.
    """
    marcadores = ", ".join("?" * len(ESTADOS_PURGABLES))
    with con:
        cursor = con.execute(
            f"""
            DELETE FROM comentarios
            WHERE estado IN ({marcadores}) AND primera_vez_visto < ?
              AND articulo_id NOT IN (
                  SELECT articulo_id FROM comentarios WHERE estado NOT IN ({marcadores})
              )
            """,
            (*ESTADOS_PURGABLES, hace(momento, dias * 24), *ESTADOS_PURGABLES),
        )
    return cursor.rowcount


def empezar_rastreo(con: sqlite3.Connection, medio_id: str, momento: datetime) -> int:
    with con:
        cursor = con.execute(
            "INSERT INTO rastreos (medio_id, inicio) VALUES (?, ?)", (medio_id, iso(momento))
        )
    return cursor.lastrowid


def terminar_rastreo(
    con: sqlite3.Connection,
    rastreo_id: int,
    momento: datetime,
    *,
    articulos: int,
    nuevos: int,
    errores: int,
    detenido_por: str | None,
) -> None:
    with con:
        con.execute(
            """
            UPDATE rastreos SET fin = ?, articulos_rastreados = ?, comentarios_nuevos = ?,
                                errores = ?, detenido_por = ?
            WHERE id = ?
            """,
            (iso(momento), articulos, nuevos, errores, detenido_por, rastreo_id),
        )


def ultimos_comentarios(
    con: sqlite3.Connection, medio_id: str | None = None, limite: int = 20
) -> list[sqlite3.Row]:
    filtro = "WHERE a.medio_id = ?" if medio_id else ""
    parametros = (medio_id, limite) if medio_id else (limite,)
    return con.execute(
        f"""
        SELECT c.*, a.url, a.medio_id FROM comentarios c
        JOIN articulos a ON a.id = c.articulo_id
        {filtro}
        ORDER BY c.primera_vez_visto DESC, c.posicion
        LIMIT ?
        """,
        parametros,
    ).fetchall()
