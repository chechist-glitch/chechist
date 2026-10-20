"""Un periódico de mentira servido en local para probar el rastreo de punta a punta."""

from __future__ import annotations

import http.server
import os
import threading
from pathlib import Path

import pytest

from centinela.config import Ajustes, Descubrimiento, Medio, SelectoresComentarios

SITIO = Path(__file__).parent / "sitio_prueba"
# Ruta a un Chromium concreto; vacío = el que instala `playwright install chromium`.
CHROMIUM = os.environ.get("CENTINELA_CHROMIUM", "")


class _Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITIO), **kwargs)

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.startswith("/limite"):
            self.send_response(429)
            self.end_headers()
            return
        if self.path.endswith(".xml"):
            base = f"http://127.0.0.1:{self.server.server_port}"
            cuerpo = (SITIO / self.path.lstrip("/")).read_text().replace("__BASE__", base).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/rss+xml; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)
            return
        super().do_GET()


@pytest.fixture(scope="session")
def servidor():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Manejador)
    hilo = threading.Thread(target=srv.serve_forever, daemon=True)
    hilo.start()
    yield f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


@pytest.fixture(scope="session")
def con_navegador():
    """Salta los tests que necesitan Chromium si no está disponible."""
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            p.chromium.launch(executable_path=CHROMIUM or None).close()
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"No hay Chromium para Playwright ({e})")


@pytest.fixture
def ajustes(tmp_path):
    return Ajustes(
        base_datos=tmp_path / "prueba.sqlite",
        carpeta_datos=tmp_path,
        user_agent="CentinelaBot/0.1 (pruebas)",
        segundos_entre_peticiones=0,
        timeout_segundos=10,
        chromium=CHROMIUM,
    )


@pytest.fixture
def medio(servidor):
    return Medio(
        id="prueba",
        nombre="Diario de Prueba",
        dominio="127.0.0.1",
        descubrimiento=Descubrimiento(
            fuentes=[f"{servidor}/rss.xml"],
            incluir=[r"/noticias/"],
            max_articulos=10,
            horas_entre_rastreos=0,
        ),
        comentarios=SelectoresComentarios(
            item=".comentario",
            texto=".comentario__texto",
            cuenta=".comentario__cuenta",
            contenedor="#comentarios",
            id_atributo="data-id",
            fecha="time",
            fecha_atributo="datetime",
            consentimiento="#aceptar-cookies",
            abrir="#ver-comentarios",
            cargar_mas="#cargar-mas",
            expandir_respuestas=".ver-respuestas",
            espera_ms=300,
            timeout_aparicion_ms=3000,
        ),
    )
