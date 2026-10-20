"""Navegador (Chromium vía Playwright) para leer los comentarios como los vería un lector.

Solo hace lo que haría una persona: aceptar el aviso de cookies, abrir los
comentarios, pulsar "cargar más" y "ver respuestas". Ni login ni captchas.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Callable

from playwright.sync_api import Error as ErrorPlaywright
from playwright.sync_api import Locator, Page, Response, Route, sync_playwright

from ..config import Ajustes, Medio, SelectoresComentarios
from ..modelos import Comentario
from ..urls import pertenece_a
from .cortesia import Robots, parece_bloqueo
from .extraccion import JS_EXTRAER, construir_comentarios

log = logging.getLogger(__name__)

# Elementos de los retos anti-bots más comunes. Si aparecen, se para.
SELECTORES_RETO = ", ".join(
    [
        'iframe[src*="captcha-delivery.com"]',  # DataDome
        "#px-captcha",  # HUMAN / PerimeterX
        "#challenge-form",  # Cloudflare
        "#cf-challenge-running",  # Cloudflare
    ]
)

MAX_EXPANSIONES = 300
MARCA_PULSADO = "data-centinela-pulsado"


class ErrorPagina(Exception):
    """La página no se ha podido leer (error HTTP, etc.)."""


@dataclass
class PaginaAbierta:
    pagina: Page
    estado_http: int | None
    titulo: str
    bloqueo: str | None
    bloqueadas_robots: list[str]


@dataclass
class ResultadoPagina:
    url: str
    estado_http: int | None
    titulo: str
    comentarios: list[Comentario]
    bloqueo: str | None = None  # motivo, si el medio nos ha frenado
    bloqueadas_robots: list[str] = field(default_factory=list)


def _pulsar(raiz, selector: str, espera_ms: int = 3000) -> bool:
    """Pulsa el primer elemento visible que case con el selector, si aparece."""
    if not selector:
        return False
    boton = raiz.locator(selector).first
    try:
        boton.wait_for(state="visible", timeout=espera_ms)
        boton.click()
        return True
    except ErrorPlaywright:
        return False


def _desplazar(elemento: Locator) -> None:
    try:
        elemento.scroll_into_view_if_needed(timeout=5000)
    except ErrorPlaywright:
        pass


class Navegador:
    def __init__(
        self,
        ajustes: Ajustes,
        robots: Robots | None = None,
        bloquear_recursos: list[str] | None = None,
    ):
        self.ajustes = ajustes
        self.robots = robots
        self.bloquear = set(
            ajustes.bloquear_recursos if bloquear_recursos is None else bloquear_recursos
        )
        self._consentidos: set[str] = set()

    def __enter__(self) -> Navegador:
        self._pw = sync_playwright().start()
        try:
            self._chromium = self._pw.chromium.launch(
                headless=True, executable_path=self.ajustes.chromium or None
            )
        except Exception:
            self._pw.stop()
            raise
        self._contexto = self._chromium.new_context(
            user_agent=self.ajustes.user_agent,
            locale="es-ES",
            timezone_id="Europe/Madrid",
            viewport={"width": 1280, "height": 900},
        )
        self._contexto.set_default_timeout(self.ajustes.timeout_segundos * 1000)
        return self

    def __exit__(self, *_exc) -> None:
        self._contexto.close()
        self._chromium.close()
        self._pw.stop()

    def abrir(
        self,
        url: str,
        dominio: str,
        al_responder: Callable[[Response], None] | None = None,
    ) -> PaginaAbierta:
        """Abre la URL y comprueba si el medio nos frena. Hay que cerrar la página después."""
        pagina = self._contexto.new_page()
        bloqueadas: list[str] = []

        def filtrar(ruta: Route) -> None:
            peticion = ruta.request
            if peticion.resource_type in self.bloquear:
                ruta.abort()
            elif (
                self.robots is not None
                and self.ajustes.robots_en_peticiones_internas
                and peticion.resource_type in ("xhr", "fetch")
                and pertenece_a(peticion.url, dominio)
                and not self.robots.permitido(peticion.url)
            ):
                bloqueadas.append(peticion.url)
                ruta.abort()
            else:
                ruta.continue_()

        # Chromium no devuelve la respuesta si es un error sin cuerpo (p. ej. un 429
        # pelado): el código se apunta aquí para no perderlo.
        estados: list[int] = []

        def anotar_estado(respuesta: Response) -> None:
            if respuesta.request.is_navigation_request() and respuesta.frame == pagina.main_frame:
                estados.append(respuesta.status)

        pagina.route("**/*", filtrar)
        pagina.on("response", anotar_estado)
        if al_responder:
            pagina.on("response", al_responder)
        try:
            try:
                respuesta = pagina.goto(url, wait_until="domcontentloaded")
                estado = respuesta.status if respuesta else None
            except ErrorPlaywright:
                if not estados:
                    raise
                estado = estados[-1]
            titulo = pagina.title()
            hay_reto = pagina.locator(SELECTORES_RETO).count() > 0
        except Exception:
            pagina.close()
            raise
        return PaginaAbierta(pagina, estado, titulo, parece_bloqueo(estado, titulo, hay_reto), bloqueadas)

    def aceptar_consentimiento(self, pagina: Page, sel: SelectoresComentarios, dominio: str) -> None:
        if not sel.consentimiento or dominio in self._consentidos:
            return
        raiz = pagina.frame_locator(sel.consentimiento_iframe).first if sel.consentimiento_iframe else pagina
        if _pulsar(raiz, sel.consentimiento, espera_ms=4000):
            # La cookie se queda en el contexto: en el resto de artículos ya no sale.
            self._consentidos.add(dominio)

    def leer_comentarios(self, url: str, medio: Medio) -> ResultadoPagina:
        sel = medio.comentarios
        abierta = self.abrir(url, medio.dominio)
        pagina = abierta.pagina
        try:
            if abierta.bloqueo:
                return ResultadoPagina(url, abierta.estado_http, abierta.titulo, [], abierta.bloqueo)
            if abierta.estado_http and abierta.estado_http >= 400:
                raise ErrorPagina(f"el medio respondió HTTP {abierta.estado_http}")
            self.aceptar_consentimiento(pagina, sel, medio.dominio)
            raiz = self._ir_a_comentarios(pagina, sel)
            _pulsar(raiz, sel.abrir)
            items = raiz.locator(sel.item)
            try:
                items.first.wait_for(state="attached", timeout=sel.timeout_aparicion_ms)
            except ErrorPlaywright:
                log.debug("%s: no aparecen comentarios", url)
                return ResultadoPagina(
                    url, abierta.estado_http, abierta.titulo, [],
                    bloqueadas_robots=abierta.bloqueadas_robots,
                )
            self._desplegar(pagina, raiz, items, sel)
            crudos = items.evaluate_all(
                JS_EXTRAER,
                {
                    "item": sel.item,
                    "texto": sel.texto,
                    "cuenta": sel.cuenta,
                    "fecha": sel.fecha,
                    "fecha_atributo": sel.fecha_atributo,
                    "id_atributo": sel.id_atributo,
                    "respuesta_a_atributo": sel.respuesta_a_atributo,
                },
            )
            return ResultadoPagina(
                url,
                abierta.estado_http,
                abierta.titulo,
                construir_comentarios(crudos),
                bloqueadas_robots=abierta.bloqueadas_robots,
            )
        finally:
            pagina.close()

    def _ir_a_comentarios(self, pagina: Page, sel: SelectoresComentarios):
        """Baja hasta los comentarios (muchos medios los cargan al llegar a ellos)."""
        if sel.iframe:
            _desplazar(pagina.locator(sel.iframe).first)
            raiz = pagina.frame_locator(sel.iframe).first
        else:
            raiz = pagina
        if sel.contenedor:
            _desplazar(raiz.locator(sel.contenedor).first)
        else:
            pagina.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        return raiz

    def _desplegar(self, pagina: Page, raiz, items: Locator, sel: SelectoresComentarios) -> None:
        """Pulsa "cargar más" y "ver respuestas" hasta que no quede nada por abrir."""
        sin_avance = 0
        for _ in range(sel.max_cargar_mas if sel.cargar_mas else 0):
            antes = items.count()
            if not _pulsar(raiz, sel.cargar_mas, espera_ms=1000):
                break
            pagina.wait_for_timeout(sel.espera_ms)
            sin_avance = sin_avance + 1 if items.count() == antes else 0
            if sin_avance >= 2:
                break

        if not sel.expandir_respuestas:
            return
        pulsados = 0
        for _ronda in range(5):  # al abrir respuestas pueden salir más botones
            nuevos = 0
            for boton in raiz.locator(sel.expandir_respuestas).all():
                if pulsados >= MAX_EXPANSIONES:
                    break
                try:
                    # Se marca cada botón para no pulsarlo dos veces y volver a cerrarlo.
                    if boton.get_attribute(MARCA_PULSADO) or not boton.is_visible():
                        continue
                    boton.evaluate(f"e => e.setAttribute('{MARCA_PULSADO}', '1')")
                    boton.click(timeout=3000)
                except ErrorPlaywright:
                    continue
                pulsados += 1
                nuevos += 1
            if not nuevos:
                break
            pagina.wait_for_timeout(sel.espera_ms)
