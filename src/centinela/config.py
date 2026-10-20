"""Configuración: ajustes generales (config/ajustes.toml) y un TOML por medio
(config/medios/<id>.toml). Los ficheros que empiezan por "_" son plantillas y
no se cargan."""

from __future__ import annotations

import re
import tomllib
from dataclasses import MISSING, Field, dataclass, field, fields
from pathlib import Path
from typing import Any


class ErrorConfig(Exception):
    """Fallo en la configuración que hay que arreglar a mano."""


@dataclass
class Ajustes:
    base_datos: Path = Path("datos/centinela.sqlite")
    carpeta_datos: Path = Path("datos")
    # Nos identificamos tal cual: un medio tiene que poder saber quién lee y escribirnos.
    user_agent: str = "CentinelaBot/0.1"
    segundos_entre_peticiones: float = 8.0
    timeout_segundos: float = 30.0
    # Ruta a un Chromium concreto; vacío = el que instala Playwright.
    chromium: str = ""
    # Tipos de recurso que no se descargan al rastrear (menos carga para el medio).
    bloquear_recursos: list[str] = field(default_factory=lambda: ["image", "media", "font"])
    # Aplicar robots.txt también a las peticiones de datos (XHR/fetch) que la
    # página hace a su propio dominio, como la API de comentarios.
    robots_en_peticiones_internas: bool = True


@dataclass
class Descubrimiento:
    """De dónde salen los artículos a rastrear."""

    fuentes: list[str] = field(default_factory=list)  # RSS, Atom o sitemap de noticias
    incluir: list[str] = field(default_factory=list)  # regex: solo URLs que casen con alguna
    excluir: list[str] = field(default_factory=list)  # regex: fuera las que casen con alguna
    max_articulos: int = 30  # por pasada
    ventana_horas: float = 48.0  # se siguen revisando los artículos de las últimas N horas
    horas_entre_rastreos: float = 6.0  # cada cuánto se vuelve a mirar un mismo artículo


@dataclass
class SelectoresComentarios:
    """Cómo encontrar los comentarios en la página (selectores CSS)."""

    item: str  # cada comentario
    texto: str  # dentro del comentario: el texto
    cuenta: str = ""  # dentro del comentario: el nombre de la cuenta
    contenedor: str = ""  # la zona de comentarios, para hacer scroll hasta ella
    id_atributo: str = ""  # atributo del item con el id del comentario
    respuesta_a_atributo: str = ""  # atributo con el id del padre (si no, se usa el anidamiento)
    fecha: str = ""
    fecha_atributo: str = ""  # p. ej. "datetime" en <time datetime="...">
    iframe: str = ""  # si los comentarios van dentro de un iframe
    consentimiento: str = ""  # botón del aviso de cookies
    consentimiento_iframe: str = ""  # si ese aviso va dentro de un iframe
    abrir: str = ""  # botón para desplegar los comentarios
    cargar_mas: str = ""  # botón "cargar más", se pulsa hasta que desaparece
    max_cargar_mas: int = 20
    expandir_respuestas: str = ""  # botones "ver respuestas"
    espera_ms: int = 1500  # pausa tras cada clic para que cargue
    timeout_aparicion_ms: int = 10000  # cuánto esperar a que salga el primer comentario


@dataclass
class Medio:
    id: str
    nombre: str
    dominio: str
    descubrimiento: Descubrimiento
    comentarios: SelectoresComentarios


def _tipo_esperado(campo: Field) -> type:
    if campo.default_factory is not MISSING:
        return type(campo.default_factory())
    if campo.default is not MISSING:
        return type(campo.default)
    return str  # los campos obligatorios son todos texto


def _tipo_ok(valor: Any, esperado: type) -> bool:
    if esperado is bool:
        return isinstance(valor, bool)
    if isinstance(valor, bool):
        return False
    if esperado is float:
        return isinstance(valor, (int, float))
    if issubclass(esperado, Path):
        return isinstance(valor, str)
    if esperado is list:
        return isinstance(valor, list) and all(isinstance(v, str) for v in valor)
    return isinstance(valor, esperado)


def _construir(clase: type, datos: Any, donde: str):
    if not isinstance(datos, dict):
        raise ErrorConfig(f"{donde}: se esperaba una tabla")
    campos = {c.name: c for c in fields(clase)}
    sobran = sorted(set(datos) - set(campos))
    if sobran:
        raise ErrorConfig(f"{donde}: clave(s) desconocida(s): {', '.join(sobran)}")
    faltan = [
        nombre
        for nombre, c in campos.items()
        if nombre not in datos and c.default is MISSING and c.default_factory is MISSING
    ]
    if faltan:
        raise ErrorConfig(f"{donde}: falta(n): {', '.join(faltan)}")
    valores = {}
    for nombre, valor in datos.items():
        esperado = _tipo_esperado(campos[nombre])
        if not _tipo_ok(valor, esperado):
            raise ErrorConfig(f"{donde}: '{nombre}' tiene un tipo que no toca ({valor!r})")
        valores[nombre] = Path(valor) if issubclass(esperado, Path) else valor
    return clase(**valores)


def _leer_toml(ruta: Path) -> dict:
    try:
        with ruta.open("rb") as f:
            return tomllib.load(f)
    except FileNotFoundError:
        raise ErrorConfig(f"no existe {ruta}") from None
    except tomllib.TOMLDecodeError as e:
        raise ErrorConfig(f"{ruta}: TOML mal formado: {e}") from None


def cargar_ajustes(ruta: Path) -> Ajustes:
    return _construir(Ajustes, _leer_toml(ruta), str(ruta))


@dataclass
class _Cabecera:
    id: str
    nombre: str
    dominio: str


def cargar_medio(ruta: Path) -> Medio:
    datos = _leer_toml(ruta)
    donde = str(ruta)
    cabecera = _construir(
        _Cabecera,
        {k: v for k, v in datos.items() if k not in ("descubrimiento", "comentarios")},
        donde,
    )
    if "comentarios" not in datos:
        raise ErrorConfig(f"{donde}: falta la tabla [comentarios]")
    descubrimiento = _construir(
        Descubrimiento, datos.get("descubrimiento", {}), f"{donde} [descubrimiento]"
    )
    if not descubrimiento.fuentes:
        raise ErrorConfig(f"{donde}: hace falta al menos una fuente (RSS o sitemap)")
    for patron in descubrimiento.incluir + descubrimiento.excluir:
        try:
            re.compile(patron)
        except re.error as e:
            raise ErrorConfig(f"{donde}: expresión regular inválida {patron!r}: {e}") from None
    comentarios = _construir(
        SelectoresComentarios, datos["comentarios"], f"{donde} [comentarios]"
    )
    return Medio(
        id=cabecera.id,
        nombre=cabecera.nombre,
        dominio=cabecera.dominio,
        descubrimiento=descubrimiento,
        comentarios=comentarios,
    )


def cargar_medios(carpeta: Path) -> dict[str, Medio]:
    medios: dict[str, Medio] = {}
    for ruta in sorted(carpeta.glob("*.toml")):
        if ruta.name.startswith("_"):
            continue
        medio = cargar_medio(ruta)
        if medio.id in medios:
            raise ErrorConfig(f"{ruta}: el id '{medio.id}' ya lo usa otro medio")
        medios[medio.id] = medio
    return medios
