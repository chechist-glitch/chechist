"""Normas de cortesía al rastrear: robots.txt, ritmo lento y parar si el medio nos frena.

Nada de saltarse captchas ni sistemas anti-bots (línea roja del CLAUDE.md):
si aparece uno, se para y no se insiste.
"""

from __future__ import annotations

import http.client
import logging
import time
import urllib.error
import urllib.request
from typing import Callable
from urllib.robotparser import RobotFileParser

from ..urls import host, sitio

log = logging.getLogger(__name__)

LIMITE_DESCARGA = 10 * 1024 * 1024

Descargador = Callable[[str, str, float], "tuple[int, bytes]"]


def descargar(url: str, user_agent: str, timeout: float) -> tuple[int, bytes]:
    """GET sencillo. Devuelve (código HTTP, cuerpo); los fallos de red lanzan OSError."""
    peticion = urllib.request.Request(
        url, headers={"User-Agent": user_agent, "Accept-Language": "es-ES,es;q=0.9"}
    )
    try:
        with urllib.request.urlopen(peticion, timeout=timeout) as respuesta:
            return respuesta.status, respuesta.read(LIMITE_DESCARGA)
    except urllib.error.HTTPError as e:
        return e.code, b""
    except http.client.HTTPException as e:
        raise OSError(f"respuesta HTTP rota: {e}") from e


class Robots:
    """Lee y cachea el robots.txt de cada sitio.

    Si no se puede leer (caída, 5xx) o responde 401/403, no se rastrea ese
    sitio; si no existe (404), no hay normas y se puede.
    """

    def __init__(self, user_agent: str, timeout: float = 30.0, descargar: Descargador = descargar):
        self.user_agent = user_agent
        self.timeout = timeout
        self._descargar = descargar
        self._cache: dict[str, RobotFileParser] = {}

    def _reglas(self, url: str) -> RobotFileParser:
        clave = sitio(url)
        if clave not in self._cache:
            self._cache[clave] = self._leer(clave + "/robots.txt")
        return self._cache[clave]

    def _leer(self, url_robots: str) -> RobotFileParser:
        reglas = RobotFileParser(url_robots)
        try:
            estado, cuerpo = self._descargar(url_robots, self.user_agent, self.timeout)
        except (OSError, ValueError) as e:
            log.warning("No se pudo leer %s (%s): por prudencia no rastreamos ese sitio", url_robots, e)
            reglas.disallow_all = True
            return reglas
        if estado == 200:
            reglas.parse(cuerpo.decode("utf-8", errors="replace").splitlines())
        elif estado in (401, 403) or estado >= 500:
            log.warning("%s respondió HTTP %s: por prudencia no rastreamos ese sitio", url_robots, estado)
            reglas.disallow_all = True
        else:
            reglas.allow_all = True
        return reglas

    def permitido(self, url: str) -> bool:
        return self._reglas(url).can_fetch(self.user_agent, url)

    def espera_minima(self, url: str) -> float:
        """El Crawl-delay que pida el sitio, si pide alguno."""
        retraso = self._reglas(url).crawl_delay(self.user_agent)
        return float(retraso) if retraso else 0.0


class Ritmo:
    """Deja al menos `segundos` entre dos peticiones al mismo host."""

    def __init__(
        self,
        segundos: float,
        reloj: Callable[[], float] = time.monotonic,
        dormir: Callable[[float], None] = time.sleep,
    ):
        self.segundos = segundos
        self._reloj = reloj
        self._dormir = dormir
        self._ultima: dict[str, float] = {}

    def esperar(self, url: str, minimo: float = 0.0) -> None:
        nombre = host(url)
        pausa = max(self.segundos, minimo)
        ultima = self._ultima.get(nombre)
        if ultima is not None:
            falta = ultima + pausa - self._reloj()
            if falta > 0:
                self._dormir(falta)
        self._ultima[nombre] = self._reloj()


# Títulos de las páginas de verificación anti-bots más comunes (Cloudflare,
# Imperva, Akamai...). Se comparan enteros para no confundirlos con titulares.
_TITULOS_RETO = {
    "just a moment...",
    "just a moment…",
    "un momento...",
    "un momento…",
    "attention required! | cloudflare",
    "access denied",
    "acceso denegado",
    "pardon our interruption",
    "are you a robot?",
    "¿eres un robot?",
}


def parece_bloqueo(estado_http: int | None, titulo: str, hay_reto: bool) -> str | None:
    """Si el medio nos está frenando, devuelve el motivo; si no, None."""
    if estado_http in (403, 429):
        return f"el medio ha respondido HTTP {estado_http}"
    if hay_reto:
        return "la página muestra un captcha o una verificación anti-bots"
    if titulo.strip().lower() in _TITULOS_RETO:
        return f"página de verificación anti-bots ({titulo.strip()!r})"
    return None
