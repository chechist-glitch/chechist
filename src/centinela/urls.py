"""Utilidades de URLs."""

from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Parámetros de campañas y redes que no cambian el artículo.
_SEGUIMIENTO = re.compile(r"^(utm_\w+|fbclid|gclid)$", re.IGNORECASE)


def normalizar(url: str) -> str:
    """Quita el fragmento y los parámetros de seguimiento para no duplicar artículos."""
    partes = urlsplit(url.strip())
    consulta = [
        (clave, valor)
        for clave, valor in parse_qsl(partes.query, keep_blank_values=True)
        if not _SEGUIMIENTO.match(clave)
    ]
    return urlunsplit(
        (partes.scheme.lower(), partes.netloc.lower(), partes.path or "/", urlencode(consulta), "")
    )


def host(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


def sitio(url: str) -> str:
    """Esquema y host con puerto, p. ej. https://www.ejemplo.es"""
    partes = urlsplit(url)
    return f"{partes.scheme}://{partes.netloc}"


def pertenece_a(url: str, dominio: str) -> bool:
    """¿La URL es del dominio del medio (o de un subdominio suyo)?"""
    nombre = host(url)
    base = dominio.lower().removeprefix("www.")
    return nombre == base or nombre.endswith("." + base)
