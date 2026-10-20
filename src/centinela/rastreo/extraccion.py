"""Paso de los elementos de la página a comentarios.

El JavaScript corre en el navegador sobre cada elemento que casa con `item`;
el resto es Python puro para poder probarlo sin navegador.
"""

from __future__ import annotations

import hashlib

from ..modelos import Comentario

# Recibe los elementos `item` y la config; devuelve lo mínimo de cada uno.
# `propio` busca dentro del comentario sin meterse en sus respuestas anidadas.
JS_EXTRAER = r"""
(elementos, cfg) => {
  const propio = (el, sel) => {
    if (!sel) return null;
    for (const c of el.querySelectorAll(sel)) {
      if (c.closest(cfg.item) === el) return c;
    }
    return null;
  };
  const linea = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const bloque = (s) => (s || '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return elementos.map((el) => {
    const texto = propio(el, cfg.texto);
    const cuenta = propio(el, cfg.cuenta);
    const fecha = propio(el, cfg.fecha);
    const padre = el.parentElement ? el.parentElement.closest(cfg.item) : null;
    return {
      id: cfg.id_atributo ? el.getAttribute(cfg.id_atributo) : null,
      texto: texto ? bloque(texto.innerText) : '',
      cuenta: cuenta ? linea(cuenta.innerText) : '',
      fecha_texto: fecha ? linea(fecha.innerText) : '',
      fecha_maquina: fecha && cfg.fecha_atributo ? fecha.getAttribute(cfg.fecha_atributo) : null,
      respuesta_a: cfg.respuesta_a_atributo ? el.getAttribute(cfg.respuesta_a_atributo) : null,
      padre_indice: padre ? elementos.indexOf(padre) : -1,
    };
  });
}
"""


def huella(cuenta: str, texto: str) -> str:
    """Id estable para medios que no dan id: no usa la fecha porque suele ser relativa."""
    return "h:" + hashlib.sha256(f"{cuenta}\x1f{texto}".encode()).hexdigest()[:16]


def construir_comentarios(crudos: list[dict]) -> list[Comentario]:
    ids: list[str] = []
    duplicados: set[int] = set()
    usados: dict[str, int] = {}
    for i, crudo in enumerate(crudos):
        propio = (crudo.get("id") or "").strip()
        ident = propio or huella(crudo.get("cuenta") or "", crudo.get("texto") or "")
        veces = usados.get(ident, 0) + 1
        usados[ident] = veces
        if veces > 1 and propio:
            # El medio enseña el mismo comentario dos veces (destacados, etc.).
            duplicados.add(i)
        elif veces > 1:
            # Dos comentarios iguales de la misma cuenta: son distintos.
            ident = f"{ident}~{veces}"
        ids.append(ident)

    comentarios = []
    for i, crudo in enumerate(crudos):
        texto = crudo.get("texto") or ""
        if not texto or i in duplicados:
            continue
        respuesta_a = (crudo.get("respuesta_a") or "").strip() or None
        padre = crudo.get("padre_indice", -1)
        if respuesta_a is None and padre is not None and padre >= 0:
            respuesta_a = ids[padre]
        comentarios.append(
            Comentario(
                id_externo=ids[i],
                texto=texto,
                cuenta=crudo.get("cuenta") or "",
                posicion=i,
                respuesta_a=respuesta_a,
                fecha_publicacion=crudo.get("fecha_maquina") or None,
                fecha_texto=crudo.get("fecha_texto") or "",
            )
        )
    return comentarios
