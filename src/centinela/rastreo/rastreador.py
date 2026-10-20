"""Una pasada de rastreo: descubrir artículos de un medio y leer sus comentarios."""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass

from playwright.sync_api import Error as ErrorPlaywright

from .. import db
from ..config import Ajustes, Medio
from ..tiempo import ahora
from .cortesia import Ritmo, Robots
from .descubrimiento import descubrir
from .navegador import ErrorPagina, Navegador

log = logging.getLogger(__name__)


@dataclass
class Resumen:
    medio: str
    descubiertos: int = 0
    rastreados: int = 0
    comentarios_nuevos: int = 0
    omitidos_por_robots: int = 0
    errores: int = 0
    detenido_por: str | None = None


def rastrear_medio(
    medio: Medio,
    ajustes: Ajustes,
    con: sqlite3.Connection,
    *,
    max_articulos: int | None = None,
) -> Resumen:
    robots = Robots(ajustes.user_agent, ajustes.timeout_segundos)
    ritmo = Ritmo(ajustes.segundos_entre_peticiones)
    resumen = Resumen(medio.id)
    rastreo_id = db.empezar_rastreo(con, medio.id, ahora())
    try:
        descubiertos = descubrir(medio, robots, ritmo, ajustes)
        resumen.descubiertos = len(descubiertos)
        for articulo in descubiertos:
            db.registrar_articulo(con, medio.id, articulo.url, articulo.titulo, ahora())

        conf = medio.descubrimiento
        pendientes = db.articulos_para_rastrear(
            con,
            medio.id,
            ventana_horas=conf.ventana_horas,
            horas_entre_rastreos=conf.horas_entre_rastreos,
            limite=max_articulos or conf.max_articulos,
            momento=ahora(),
        )
        log.info("%s: %d artículos en el feed, %d por revisar", medio.nombre, len(descubiertos), len(pendientes))
        if not pendientes:
            return resumen

        with Navegador(ajustes, robots) as navegador:
            for articulo in pendientes:
                url = articulo["url"]
                if not robots.permitido(url):
                    resumen.omitidos_por_robots += 1
                    log.info("robots.txt no deja leer %s, lo saltamos", url)
                    continue
                ritmo.esperar(url, robots.espera_minima(url))
                try:
                    resultado = navegador.leer_comentarios(url, medio)
                except (ErrorPagina, ErrorPlaywright) as e:
                    resumen.errores += 1
                    log.warning("%s: %s", url, e)
                    continue
                if resultado.bloqueo:
                    resumen.detenido_por = resultado.bloqueo
                    log.warning("%s: %s. Paramos aquí y no insistimos.", medio.nombre, resultado.bloqueo)
                    break
                if resultado.bloqueadas_robots:
                    log.info(
                        "%s: robots.txt no deja cargar %d petición(es) de la página",
                        url, len(resultado.bloqueadas_robots),
                    )
                nuevos = db.guardar_comentarios(con, articulo["id"], resultado.comentarios, ahora())
                resumen.rastreados += 1
                resumen.comentarios_nuevos += nuevos
                log.info("%s: %d comentarios (%d nuevos)", url, len(resultado.comentarios), nuevos)
    finally:
        db.terminar_rastreo(
            con,
            rastreo_id,
            ahora(),
            articulos=resumen.rastreados,
            nuevos=resumen.comentarios_nuevos,
            errores=resumen.errores,
            detenido_por=resumen.detenido_por,
        )
    return resumen
