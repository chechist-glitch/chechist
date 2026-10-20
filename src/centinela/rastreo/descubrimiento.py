"""Descubrimiento de artículos a partir de los RSS, Atom o sitemaps del medio."""

from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET

from ..config import Ajustes, Medio
from ..modelos import ArticuloDescubierto
from ..urls import normalizar, pertenece_a
from .cortesia import Descargador, Ritmo, Robots, descargar

log = logging.getLogger(__name__)


def _local(etiqueta: str) -> str:
    """Nombre de la etiqueta sin el espacio de nombres."""
    return etiqueta.rsplit("}", 1)[-1]


def _texto_hijo(elemento: ET.Element, nombre: str) -> str:
    for hijo in elemento:
        if _local(hijo.tag) == nombre:
            return (hijo.text or "").strip()
    return ""


def leer_fuente(contenido: bytes) -> list[ArticuloDescubierto]:
    """Saca (url, título) de un RSS 1.0/2.0, un Atom o un sitemap (también de noticias)."""
    raiz = ET.fromstring(contenido)
    tipo = _local(raiz.tag)
    articulos = []
    if tipo in ("rss", "RDF"):
        for item in raiz.iter():
            if _local(item.tag) == "item":
                enlace = _texto_hijo(item, "link")
                if enlace:
                    articulos.append(ArticuloDescubierto(enlace, _texto_hijo(item, "title")))
    elif tipo == "feed":
        for entrada in raiz:
            if _local(entrada.tag) != "entry":
                continue
            enlaces = [
                e.get("href", "")
                for e in entrada
                if _local(e.tag) == "link" and e.get("rel", "alternate") == "alternate"
            ]
            if enlaces and enlaces[0]:
                articulos.append(ArticuloDescubierto(enlaces[0], _texto_hijo(entrada, "title")))
    elif tipo == "urlset":
        for url in raiz:
            if _local(url.tag) != "url":
                continue
            loc = _texto_hijo(url, "loc")
            # En los sitemaps de noticias el título va en <news:news><news:title>.
            titulo = next(
                ((e.text or "").strip() for e in url.iter() if _local(e.tag) == "title"), ""
            )
            if loc:
                articulos.append(ArticuloDescubierto(loc, titulo))
    elif tipo == "sitemapindex":
        raise ValueError("es un índice de sitemaps: pon en la config el sitemap de noticias concreto")
    else:
        raise ValueError(f"formato no reconocido (<{tipo}>)")
    return articulos


def filtrar(articulos: list[ArticuloDescubierto], medio: Medio) -> list[ArticuloDescubierto]:
    """Deja solo artículos del medio que pasen los filtros, sin repetir."""
    incluir = [re.compile(p) for p in medio.descubrimiento.incluir]
    excluir = [re.compile(p) for p in medio.descubrimiento.excluir]
    vistos: set[str] = set()
    salida = []
    for articulo in articulos:
        url = normalizar(articulo.url)
        if not url.startswith(("http://", "https://")) or not pertenece_a(url, medio.dominio):
            continue
        if incluir and not any(p.search(url) for p in incluir):
            continue
        if any(p.search(url) for p in excluir) or url in vistos:
            continue
        vistos.add(url)
        salida.append(ArticuloDescubierto(url, articulo.titulo))
    return salida


def descubrir(
    medio: Medio,
    robots: Robots,
    ritmo: Ritmo,
    ajustes: Ajustes,
    descargar: Descargador = descargar,
) -> list[ArticuloDescubierto]:
    encontrados: list[ArticuloDescubierto] = []
    for fuente in medio.descubrimiento.fuentes:
        if not robots.permitido(fuente):
            log.warning("%s: robots.txt no deja leer %s, la saltamos", medio.nombre, fuente)
            continue
        ritmo.esperar(fuente, robots.espera_minima(fuente))
        try:
            estado, cuerpo = descargar(fuente, ajustes.user_agent, ajustes.timeout_segundos)
        except OSError as e:
            log.warning("%s: no se pudo descargar %s (%s)", medio.nombre, fuente, e)
            continue
        if estado != 200:
            log.warning("%s: %s respondió HTTP %s", medio.nombre, fuente, estado)
            continue
        try:
            encontrados.extend(leer_fuente(cuerpo))
        except (ET.ParseError, ValueError) as e:
            log.warning("%s: no se pudo leer %s (%s)", medio.nombre, fuente, e)
    return filtrar(encontrados, medio)
