"""Rastreo de punta a punta contra el periódico de prueba (necesita Chromium)."""

import pytest

from centinela import db
from centinela.rastreo.cortesia import Robots
from centinela.rastreo.inspeccion import inspeccionar
from centinela.rastreo.navegador import Navegador
from centinela.rastreo.rastreador import rastrear_medio

pytestmark = pytest.mark.usefixtures("con_navegador")


def test_lee_comentarios_cargando_todo_y_con_respuestas(servidor, ajustes, medio):
    robots = Robots(ajustes.user_agent)
    with Navegador(ajustes, robots) as navegador:
        resultado = navegador.leer_comentarios(f"{servidor}/noticias/uno.html", medio)

    assert resultado.bloqueo is None
    por_id = {c.id_externo: c for c in resultado.comentarios}
    assert set(por_id) == {"c1", "c1r1", "c1r1r1", "c2", "c3", "c4", "c5"}
    assert por_id["c1r1"].respuesta_a == "c1"
    assert por_id["c1r1r1"].respuesta_a == "c1r1"
    assert por_id["c2"].texto == "Segundo comentario\ncon dos líneas."
    assert por_id["c1"].cuenta == "usuario_uno"
    assert por_id["c1"].fecha_publicacion == "2026-10-19T10:00:00Z"
    assert por_id["c1"].fecha_texto == "hace un rato"
    # La página pide /api/secreta y robots.txt lo prohíbe: no se hace.
    assert resultado.bloqueadas_robots == [f"{servidor}/api/secreta"]


def test_comentarios_sin_id_y_sin_fecha_propia(servidor, ajustes, medio):
    with Navegador(ajustes) as navegador:
        resultado = navegador.leer_comentarios(f"{servidor}/noticias/dos.html", medio)

    padre, respuesta, repetido = resultado.comentarios
    assert padre.id_externo.startswith("h:")
    assert padre.fecha_texto == ""  # no se queda con la fecha de su respuesta
    assert respuesta.respuesta_a == padre.id_externo
    assert respuesta.fecha_texto == "hace 1 hora"
    assert repetido.id_externo == padre.id_externo + "~2"


def test_si_el_medio_nos_frena_se_para(servidor, ajustes, medio):
    with Navegador(ajustes) as navegador:
        resultado = navegador.leer_comentarios(f"{servidor}/limite.html", medio)
    assert resultado.bloqueo and "429" in resultado.bloqueo
    assert resultado.comentarios == []


def test_rastreo_completo(servidor, ajustes, medio):
    con = db.conectar(ajustes.base_datos)
    resumen = rastrear_medio(medio, ajustes, con)

    # uno, dos, sin_comentarios y privado/tres (fuera: el de otro medio y la columna de opinión)
    assert resumen.descubiertos == 4
    assert resumen.omitidos_por_robots == 1
    assert resumen.rastreados == 3
    assert resumen.comentarios_nuevos == 10
    assert resumen.detenido_por is None
    urls = {f["url"] for f in con.execute("SELECT url FROM articulos")}
    assert f"{servidor}/noticias/uno.html" in urls  # sin utm ni fragmento
    assert not con.execute("SELECT 1 FROM comentarios WHERE id_externo = 'no-debe-leerse'").fetchall()

    segunda = rastrear_medio(medio, ajustes, con)
    assert segunda.rastreados == 3
    assert segunda.comentarios_nuevos == 0
    assert con.execute("SELECT COUNT(*) FROM rastreos").fetchone()[0] == 2


def test_inspeccion(servidor, ajustes, medio):
    informe = inspeccionar(f"{servidor}/noticias/uno.html", ajustes, {"prueba": medio})
    assert informe.permitido_por_robots
    assert ("section#comentarios", 1) in informe.candidatos
    assert informe.bloqueadas_robots == [f"{servidor}/api/secreta"]
    assert (informe.carpeta / "captura.png").exists()
    assert len(informe.comentarios) == 7  # con la config del medio sí se despliegan

    privado = inspeccionar(f"{servidor}/noticias/privado/tres.html", ajustes, {})
    assert not privado.permitido_por_robots and privado.carpeta is None
