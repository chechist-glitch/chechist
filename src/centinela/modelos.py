"""Lo que circula entre el rastreo y la base de datos."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ArticuloDescubierto:
    url: str
    titulo: str = ""


@dataclass(frozen=True)
class Comentario:
    """Un comentario tal como se ve en la página.

    Solo lleva lo que permite el CLAUDE.md: nada de enlaces a perfiles,
    avatares ni nombres reales.
    """

    id_externo: str  # el id que da el medio, o una huella si no da ninguno
    texto: str
    cuenta: str  # nombre de la cuenta tal como aparece
    posicion: int  # orden en la página
    respuesta_a: str | None = None  # id_externo del comentario al que responde
    fecha_publicacion: str | None = None  # la que da el medio en formato máquina
    fecha_texto: str = ""  # la que se ve ("hace 2 horas")
