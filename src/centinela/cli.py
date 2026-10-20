"""Línea de órdenes: `centinela <orden>`. Lánzalo desde la raíz del proyecto."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from . import db
from .config import Ajustes, ErrorConfig, Medio, cargar_ajustes, cargar_medios
from .tiempo import ahora

log = logging.getLogger("centinela")


def _medios(args, ajustes: Ajustes, medios: dict[str, Medio]) -> int:
    if not medios:
        print(f"No hay medios configurados en {args.medios}. Copia la plantilla _plantilla.toml.")
        return 1
    for medio in medios.values():
        print(f"{medio.id}: {medio.nombre} ({medio.dominio})")
        for fuente in medio.descubrimiento.fuentes:
            print(f"    {fuente}")
    return 0


def _rastrear(args, ajustes: Ajustes, medios: dict[str, Medio]) -> int:
    from .rastreo.rastreador import rastrear_medio

    elegidos = args.medio or list(medios)
    if not elegidos:
        print(f"No hay medios configurados en {args.medios}. Copia la plantilla _plantilla.toml.")
        return 1
    desconocidos = [m for m in elegidos if m not in medios]
    if desconocidos:
        print(f"Medio(s) sin configurar: {', '.join(desconocidos)}", file=sys.stderr)
        return 2
    if "CAMBIAR" in ajustes.user_agent:
        log.warning("Pon el correo del proyecto en user_agent (config/ajustes.toml)")

    con = db.conectar(ajustes.base_datos)
    for medio_id in elegidos:
        r = rastrear_medio(medios[medio_id], ajustes, con, max_articulos=args.max_articulos)
        print(
            f"{r.medio}: {r.rastreados} artículos leídos, {r.comentarios_nuevos} comentarios nuevos, "
            f"{r.omitidos_por_robots} saltados por robots.txt, {r.errores} errores"
            + (f". PARADO: {r.detenido_por}" if r.detenido_por else "")
        )
    return 0


def _inspeccionar(args, ajustes: Ajustes, medios: dict[str, Medio]) -> int:
    from .rastreo.inspeccion import formatear, inspeccionar

    print(formatear(inspeccionar(args.url, ajustes, medios)))
    return 0


def _comentarios(args, ajustes: Ajustes, medios: dict[str, Medio]) -> int:
    con = db.conectar(ajustes.base_datos)
    filas = db.ultimos_comentarios(con, args.medio, args.limite)
    if not filas:
        print("Todavía no hay comentarios guardados.")
    for fila in filas:
        texto = fila["texto"].replace("\n", " ")
        if len(texto) > 200:
            texto = texto[:197] + "..."
        print(f"[{fila['primera_vez_visto']}] {fila['medio_id']} · {fila['cuenta'] or '?'}: {texto}")
        print(f"    {fila['url']}")
    return 0


def _recepcion(args, ajustes: Ajustes, medios: dict[str, Medio]) -> int:
    from .captura.recepcion import crear_servidor

    servidor = crear_servidor(ajustes.base_datos, ajustes.carpeta_datos, args.puerto)
    print(f"Esperando casos de la extensión en http://127.0.0.1:{args.puerto} (Ctrl+C para parar)")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()
    return 0


def _casos(args, ajustes: Ajustes, medios: dict[str, Medio]) -> int:
    con = db.conectar(ajustes.base_datos)
    filas = db.casos_manuales(con, args.limite)
    if not filas:
        print("Todavía no hay casos capturados a mano.")
    for fila in filas:
        texto = fila["texto"].replace("\n", " ")
        if len(texto) > 200:
            texto = texto[:197] + "..."
        print(f"#{fila['id']} [{fila['primera_vez_visto']}] {fila['medio_id']} · {fila['cuenta']}: {texto}")
        print(f"    {fila['url']}")
        if fila["captura"]:
            print(f"    captura: {fila['captura']}")
    return 0


def _purgar(args, ajustes: Ajustes, medios: dict[str, Medio]) -> int:
    con = db.conectar(ajustes.base_datos)
    borrados = db.purgar(con, args.dias, ahora())
    print(f"Borrados {borrados} comentarios sin interés de hace más de {args.dias:g} días.")
    return 0


def _analizador() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="centinela", description=__doc__)
    p.add_argument("--config", default="config/ajustes.toml", help="ajustes generales")
    p.add_argument("--medios", default="config/medios", help="carpeta con un TOML por medio")
    p.add_argument("-v", "--detalle", action="store_true", help="más mensajes")
    ordenes = p.add_subparsers(dest="orden", required=True)

    o = ordenes.add_parser("medios", help="lista los medios configurados")
    o.set_defaults(funcion=_medios)

    o = ordenes.add_parser("rastrear", help="una pasada de rastreo")
    o.add_argument("--medio", action="append", help="id del medio (repetible; por defecto, todos)")
    o.add_argument("--max-articulos", type=int, help="tope de artículos por medio en esta pasada")
    o.set_defaults(funcion=_rastrear)

    o = ordenes.add_parser("inspeccionar", help="analiza una página para configurar un medio")
    o.add_argument("url")
    o.set_defaults(funcion=_inspeccionar)

    o = ordenes.add_parser("comentarios", help="muestra los últimos comentarios guardados")
    o.add_argument("--medio")
    o.add_argument("--limite", type=int, default=20)
    o.set_defaults(funcion=_comentarios)

    o = ordenes.add_parser("recepcion", help="recibe los casos que envía la extensión del navegador")
    o.add_argument("--puerto", type=int, default=8770)
    o.set_defaults(funcion=_recepcion)

    o = ordenes.add_parser("casos", help="muestra los últimos casos capturados a mano")
    o.add_argument("--limite", type=int, default=20)
    o.set_defaults(funcion=_casos)

    o = ordenes.add_parser("purgar", help="borra lo que no ha llegado a candidato pasado un tiempo")
    o.add_argument("--dias", type=float, default=30)
    o.set_defaults(funcion=_purgar)
    return p


def main(argv: list[str] | None = None) -> int:
    args = _analizador().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.detalle else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    try:
        ajustes = cargar_ajustes(Path(args.config))
        medios = cargar_medios(Path(args.medios))
    except ErrorConfig as e:
        print(f"Error de configuración: {e}", file=sys.stderr)
        return 2
    return args.funcion(args, ajustes, medios)


if __name__ == "__main__":
    sys.exit(main())
