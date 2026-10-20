"""Inspección de una página para configurar un medio nuevo.

Abre la URL como lo haría el rastreador y mira qué sistema de comentarios usa,
qué elementos parecen comentarios y qué peticiones de datos hace. Guarda una
captura y el HTML en datos/inspeccion/ para revisarlos con calma.

Lo guardado puede llevar nombres de cuentas: es solo para configurar, bórralo
cuando acabes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from playwright.sync_api import Response

from ..config import Ajustes, Medio
from ..modelos import Comentario
from ..tiempo import ahora
from ..urls import host, pertenece_a
from .cortesia import Robots
from .navegador import Navegador

# Huellas de los sistemas de comentarios de terceros más usados.
PLATAFORMAS = {
    "Disqus": ("disqus.com", "disquscdn.com"),
    "Viafoura": ("viafoura", "vf-conversations"),
    "OpenWeb (antes Spot.IM)": ("spot.im", "openweb", "spotim"),
    "Coral Project": ("coralproject", "coral_thread", "coral-"),
    "Comentarios de Facebook": ("facebook.com/plugins/comments", "fb-comments"),
    "Insticator": ("insticator",),
}

_PETICION_INTERESANTE = re.compile(r"coment|comment|thread|conversation|discus", re.IGNORECASE)

JS_ANALISIS = r"""
() => {
  const fuentes = [];
  document.querySelectorAll('iframe[src], script[src]').forEach((e) => fuentes.push(e.src));
  const etiquetas = new Set();
  document.querySelectorAll('*').forEach((e) => {
    if (e.tagName.includes('-')) etiquetas.add(e.tagName.toLowerCase());
  });
  const patron = /coment|comment/i;
  const veces = new Map();
  const sumar = (k) => veces.set(k, (veces.get(k) || 0) + 1);
  document.querySelectorAll('[id], [class]').forEach((e) => {
    const tag = e.tagName.toLowerCase();
    if (e.id && patron.test(e.id)) sumar(`${tag}#${e.id}`);
    for (const c of e.classList) if (patron.test(c)) sumar(`${tag}.${c}`);
  });
  const candidatos = [...veces.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  return { fuentes, etiquetas: [...etiquetas], candidatos };
}
"""


@dataclass
class Informe:
    url: str
    permitido_por_robots: bool
    estado_http: int | None = None
    titulo: str = ""
    bloqueo: str | None = None
    plataformas: list[str] = field(default_factory=list)
    candidatos: list[tuple[str, int]] = field(default_factory=list)
    peticiones_datos: list[str] = field(default_factory=list)
    bloqueadas_robots: list[str] = field(default_factory=list)
    carpeta: Path | None = None
    medio: str | None = None  # id del medio configurado para ese dominio, si lo hay
    comentarios: list[Comentario] | None = None  # lo que lee la config actual


def detectar_plataformas(textos: list[str]) -> list[str]:
    pajar = "\n".join(textos).lower()
    return [nombre for nombre, huellas in PLATAFORMAS.items() if any(h in pajar for h in huellas)]


def inspeccionar(url: str, ajustes: Ajustes, medios: dict[str, Medio]) -> Informe:
    robots = Robots(ajustes.user_agent, ajustes.timeout_segundos)
    informe = Informe(url, robots.permitido(url))
    if not informe.permitido_por_robots:
        return informe
    medio = next((m for m in medios.values() if pertenece_a(url, m.dominio)), None)
    informe.medio = medio.id if medio else None

    peticiones: list[tuple[str, str]] = []

    def al_responder(respuesta: Response) -> None:
        if respuesta.request.resource_type in ("xhr", "fetch"):
            tipo = respuesta.headers.get("content-type", "").split(";")[0]
            peticiones.append(
                (respuesta.url, f"{respuesta.status} {respuesta.request.method} {respuesta.url} [{tipo}]")
            )

    # Para inspeccionar sí se cargan imágenes: la captura tiene que parecerse a lo que ve un lector.
    with Navegador(ajustes, robots, bloquear_recursos=[]) as navegador:
        abierta = navegador.abrir(url, medio.dominio if medio else host(url), al_responder)
        pagina = abierta.pagina
        try:
            informe.estado_http = abierta.estado_http
            informe.titulo = abierta.titulo
            informe.bloqueo = abierta.bloqueo
            if abierta.bloqueo:
                return informe
            if medio:
                navegador.aceptar_consentimiento(pagina, medio.comentarios, medio.dominio)
            for _ in range(12):  # bajar poco a poco, como un lector, para que cargue todo
                pagina.mouse.wheel(0, 1500)
                pagina.wait_for_timeout(600)
            pagina.wait_for_timeout(1500)

            analisis = pagina.evaluate(JS_ANALISIS)
            informe.plataformas = detectar_plataformas(
                analisis["fuentes"] + analisis["etiquetas"] + [c for c, _ in analisis["candidatos"]]
            )
            informe.candidatos = [(c, n) for c, n in analisis["candidatos"]]
            interesantes = [t for u, t in peticiones if _PETICION_INTERESANTE.search(u)]
            resto = [t for u, t in peticiones if not _PETICION_INTERESANTE.search(u)]
            informe.peticiones_datos = (interesantes + resto)[:40]
            informe.bloqueadas_robots = abierta.bloqueadas_robots

            carpeta = ajustes.carpeta_datos / "inspeccion" / f"{ahora():%Y%m%d-%H%M%S}-{host(url)}"
            carpeta.mkdir(parents=True, exist_ok=True)
            pagina.screenshot(path=carpeta / "captura.png", full_page=True)
            (carpeta / "pagina.html").write_text(pagina.content(), encoding="utf-8")
            informe.carpeta = carpeta
        finally:
            pagina.close()

        if medio:
            informe.comentarios = navegador.leer_comentarios(url, medio).comentarios
    return informe


def formatear(informe: Informe) -> str:
    lineas = [f"URL: {informe.url}"]
    if not informe.permitido_por_robots:
        lineas.append("robots.txt NO permite leer esta página. No se ha abierto.")
        return "\n".join(lineas)
    lineas.append(f"HTTP {informe.estado_http} — {informe.titulo}")
    if informe.bloqueo:
        lineas.append(f"PARADO: {informe.bloqueo}. Con este medio no se puede seguir por esta vía.")
        return "\n".join(lineas)

    lineas.append("")
    lineas.append("Sistema de comentarios detectado: " + (", ".join(informe.plataformas) or "ninguno conocido (propio del medio)"))
    lineas.append("")
    lineas.append("Elementos que parecen de comentarios (selector: veces):")
    lineas += [f"  {c}: {n}" for c, n in informe.candidatos] or ["  (ninguno)"]
    lineas.append("")
    lineas.append("Peticiones de datos (XHR/fetch), primero las que huelen a comentarios:")
    lineas += [f"  {p}" for p in informe.peticiones_datos] or ["  (ninguna)"]
    if informe.bloqueadas_robots:
        lineas.append("")
        lineas.append("Peticiones que robots.txt no deja hacer (no se han hecho):")
        lineas += [f"  {u}" for u in informe.bloqueadas_robots]
    if informe.carpeta:
        lineas.append("")
        lineas.append(f"Captura y HTML guardados en {informe.carpeta} (bórralos cuando acabes).")

    lineas.append("")
    if informe.comentarios is None:
        lineas.append("No hay ningún medio configurado para este dominio todavía.")
    else:
        lineas.append(f"Con la config de '{informe.medio}' se leen {len(informe.comentarios)} comentarios.")
        for c in informe.comentarios[:5]:
            texto = c.texto.replace("\n", " / ")
            texto = texto if len(texto) <= 120 else texto[:117] + "..."
            respuesta = f" (responde a {c.respuesta_a})" if c.respuesta_a else ""
            lineas.append(f"  [{c.id_externo}]{respuesta} {c.cuenta or '?'}: {texto}")
    return "\n".join(lineas)
