import base64
import hashlib
import http.client
import json
import threading
from pathlib import Path

import pytest

from centinela import db
from centinela.captura.recepcion import crear_servidor, plataforma_de

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
CASO = {
    "url": "https://www.instagram.com/p/ABC123/?igsh=xyz&utm_source=ig_web",
    "titulo": "ABC en Instagram",
    "cuenta": "@cuenta_de_prueba",
    "texto": "Texto del comentario de prueba",
    "captura": "data:image/png;base64," + base64.b64encode(PNG).decode(),
}
EXTENSION = "chrome-extension://abcdefghijklmnop"


@pytest.fixture
def servidor(tmp_path):
    srv = crear_servidor(tmp_path / "c.sqlite", tmp_path, puerto=0)
    hilo = threading.Thread(target=srv.serve_forever, daemon=True)
    hilo.start()
    yield srv, tmp_path
    srv.shutdown()
    srv.server_close()


def enviar(srv, cuerpo, cabeceras):
    con = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=5)
    datos = json.dumps(cuerpo).encode() if not isinstance(cuerpo, bytes) else cuerpo
    con.request("POST", "/api/casos", datos, {"Content-Type": "application/json", **cabeceras})
    respuesta = con.getresponse()
    return respuesta.status, json.loads(respuesta.read() or b"{}"), respuesta.getheader("Access-Control-Allow-Origin")


def test_guarda_el_caso_con_su_captura(servidor):
    srv, carpeta = servidor
    estado, cuerpo, cors = enviar(srv, CASO, {"X-Centinela": "1", "Origin": EXTENSION})
    assert estado == 201 and cuerpo["nuevo"] and cors == EXTENSION
    assert Path(cuerpo["captura"]).read_bytes() == PNG
    assert cuerpo["sha256"] == hashlib.sha256(PNG).hexdigest()

    con = db.conectar(carpeta / "c.sqlite")
    (caso,) = db.casos_manuales(con)
    assert caso["medio_id"] == "instagram"
    assert caso["url"] == "https://www.instagram.com/p/ABC123/?igsh=xyz"
    assert caso["cuenta"] == "@cuenta_de_prueba"

    # El mismo comentario otra vez: no se duplica, se añade la captura.
    estado, cuerpo, _ = enviar(srv, CASO, {"X-Centinela": "1", "Origin": EXTENSION})
    assert estado == 201 and not cuerpo["nuevo"]
    assert con.execute("SELECT COUNT(*) FROM comentarios").fetchone()[0] == 1
    assert con.execute("SELECT COUNT(*) FROM capturas").fetchone()[0] == 2


def test_los_casos_a_mano_no_se_purgan(servidor):
    srv, carpeta = servidor
    enviar(srv, CASO, {"X-Centinela": "1", "Origin": EXTENSION})
    con = db.conectar(carpeta / "c.sqlite")
    from datetime import datetime, timedelta, timezone

    assert db.purgar(con, 0, datetime.now(timezone.utc) + timedelta(days=365)) == 0


@pytest.mark.parametrize(
    "cabeceras",
    [
        {"Origin": EXTENSION},  # sin la cabecera propia
        {"X-Centinela": "1", "Origin": "https://web-cualquiera.com"},
        {"X-Centinela": "1"},  # sin origen
    ],
)
def test_solo_acepta_a_la_extension(servidor, cabeceras):
    srv, _ = servidor
    estado, _, _ = enviar(srv, CASO, cabeceras)
    assert estado == 403


@pytest.mark.parametrize(
    "cambio",
    [
        {"cuenta": ""},
        {"texto": "   "},
        {"url": "javascript:alert(1)"},
        {"captura": "data:image/jpeg;base64,AAAA"},
        {"captura": "data:image/png;base64,¡no es base64!"},
    ],
)
def test_rechaza_casos_mal_formados(servidor, cambio):
    srv, _ = servidor
    estado, cuerpo, _ = enviar(srv, CASO | cambio, {"X-Centinela": "1", "Origin": EXTENSION})
    assert estado == 400 and cuerpo["error"]


def test_plataformas():
    assert plataforma_de("https://www.instagram.com/p/x/") == "instagram"
    assert plataforma_de("https://m.facebook.com/x") == "facebook"
    assert plataforma_de("https://x.com/abc/status/1") == "x"
    assert plataforma_de("https://www.abc.es/espana/x.html") == "abc.es"
