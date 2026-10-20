"""Servidor local que recibe los casos que envía la extensión del navegador.

La persona selecciona el comentario y pulsa "Enviar a Centinela"; la extensión
manda el texto, el enlace, la cuenta y una captura de lo que hay en pantalla.
Nada se recoge solo: cada caso lo elige alguien, uno a uno.

Solo escucha en 127.0.0.1 y solo acepta peticiones de una extensión de
navegador con la cabecera X-Centinela, para que una web cualquiera no pueda
colar casos falsos desde el navegador.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import sqlite3
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from .. import db
from ..rastreo.extraccion import huella
from ..tiempo import ahora
from ..urls import host, normalizar

log = logging.getLogger(__name__)

PUERTO = 8770
LIMITE_PETICION = 25 * 1024 * 1024
ORIGENES_PERMITIDOS = ("chrome-extension://", "moz-extension://")
PREFIJO_PNG = "data:image/png;base64,"

PLATAFORMAS = {
    "instagram.com": "instagram",
    "facebook.com": "facebook",
    "x.com": "x",
    "twitter.com": "x",
    "tiktok.com": "tiktok",
    "youtube.com": "youtube",
    "threads.net": "threads",
}


class CasoInvalido(ValueError):
    pass


@dataclass
class Caso:
    url: str
    titulo: str
    cuenta: str
    texto: str
    captura: bytes | None


def plataforma_de(url: str) -> str:
    nombre = host(url)
    for dominio, plataforma in PLATAFORMAS.items():
        if nombre == dominio or nombre.endswith("." + dominio):
            return plataforma
    return nombre.removeprefix("www.")


def _texto(datos: dict, clave: str, maximo: int, obligatorio: bool = True) -> str:
    valor = datos.get(clave, "")
    if not isinstance(valor, str):
        raise CasoInvalido(f"'{clave}' tiene que ser texto")
    valor = valor.strip()
    if obligatorio and not valor:
        raise CasoInvalido(f"falta '{clave}'")
    if len(valor) > maximo:
        raise CasoInvalido(f"'{clave}' es demasiado largo")
    return valor


def validar(datos: object) -> Caso:
    if not isinstance(datos, dict):
        raise CasoInvalido("se esperaba un objeto JSON")
    url = _texto(datos, "url", 2000)
    if not url.startswith(("http://", "https://")):
        raise CasoInvalido("la URL no es de una web")
    captura = None
    bruto = datos.get("captura")
    if bruto:
        if not isinstance(bruto, str) or not bruto.startswith(PREFIJO_PNG):
            raise CasoInvalido("la captura tiene que ser un PNG")
        try:
            captura = base64.b64decode(bruto[len(PREFIJO_PNG):], validate=True)
        except ValueError:  # incluye binascii.Error y los caracteres no ASCII
            raise CasoInvalido("la captura está corrupta") from None
    return Caso(
        url=url,
        titulo=_texto(datos, "titulo", 500, obligatorio=False),
        cuenta=_texto(datos, "cuenta", 200),
        texto=_texto(datos, "texto", 10000),
        captura=captura,
    )


def guardar(con: sqlite3.Connection, carpeta_datos: Path, caso: Caso) -> dict:
    momento = ahora()
    url = normalizar(caso.url)
    captura = None
    if caso.captura:
        sha = hashlib.sha256(caso.captura).hexdigest()
        carpeta = carpeta_datos / "capturas"
        carpeta.mkdir(parents=True, exist_ok=True)
        ruta = carpeta / f"{momento:%Y%m%d-%H%M%S}-{sha[:12]}.png"
        ruta.write_bytes(caso.captura)
        captura = (str(ruta), sha)
    comentario_id, nuevo = db.guardar_caso_manual(
        con,
        plataforma=plataforma_de(url),
        url=url,
        titulo=caso.titulo,
        id_externo=huella(caso.cuenta, caso.texto),
        cuenta=caso.cuenta,
        texto=caso.texto,
        captura=captura,
        momento=momento,
    )
    log.info("Caso %d %s (%s)", comentario_id, "nuevo" if nuevo else "ya estaba, captura añadida", url)
    return {
        "id": comentario_id,
        "nuevo": nuevo,
        "captura": captura[0] if captura else None,
        "sha256": captura[1] if captura else None,
    }


class _Servidor(HTTPServer):
    # Un caso cada vez (sin hilos), con su propia conexión a la base de datos.
    def __init__(self, direccion, base_datos: Path, carpeta_datos: Path):
        super().__init__(direccion, _Manejador)
        self.base_datos = base_datos
        self.carpeta_datos = carpeta_datos


class _Manejador(BaseHTTPRequestHandler):
    server: _Servidor

    def log_message(self, formato, *args):
        log.debug(formato, *args)

    def _origen_valido(self) -> str | None:
        origen = self.headers.get("Origin", "")
        return origen if origen.startswith(ORIGENES_PERMITIDOS) else None

    def _responder(self, codigo: int, cuerpo: dict | None = None) -> None:
        datos = json.dumps(cuerpo or {}, ensure_ascii=False).encode()
        self.send_response(codigo)
        origen = self._origen_valido()
        if origen:
            self.send_header("Access-Control-Allow-Origin", origen)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_OPTIONS(self):
        origen = self._origen_valido()
        if not origen:
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", origen)
        self.send_header("Access-Control-Allow-Methods", "GET, POST")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Centinela")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/estado":
            self._responder(200, {"ok": True})
        else:
            self._responder(404, {"error": "no existe"})

    def do_POST(self):
        if self.path != "/api/casos":
            return self._responder(404, {"error": "no existe"})
        if self.headers.get("X-Centinela") != "1" or not self._origen_valido():
            return self._responder(403, {"error": "solo se aceptan casos de la extensión"})
        largo = int(self.headers.get("Content-Length") or 0)
        if largo <= 0 or largo > LIMITE_PETICION:
            return self._responder(413, {"error": "petición vacía o demasiado grande"})
        try:
            caso = validar(json.loads(self.rfile.read(largo)))
        except (CasoInvalido, json.JSONDecodeError) as e:
            return self._responder(400, {"error": str(e)})
        con = db.conectar(self.server.base_datos)
        try:
            resultado = guardar(con, self.server.carpeta_datos, caso)
        finally:
            con.close()
        self._responder(201, resultado)


def crear_servidor(base_datos: Path, carpeta_datos: Path, puerto: int = PUERTO) -> _Servidor:
    db.conectar(base_datos).close()  # crea la base de datos si no existe
    return _Servidor(("127.0.0.1", puerto), base_datos, carpeta_datos)
