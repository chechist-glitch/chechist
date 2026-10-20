"""Comentarios de YouTube por su API oficial (YouTube Data API v3).

Es la vía permitida: Google da los comentarios públicos de cualquier vídeo con
una clave de API gratuita. Cada consulta gasta 1 unidad del cupo diario
(10.000 por defecto); aquí se lleva la cuenta y se para antes de agotarlo.

De cada comentario se guarda lo mismo que en los periódicos: texto, vídeo,
nombre de la cuenta tal como aparece y fecha. No se guardan el id del canal
del autor, su foto ni el enlace a su perfil, aunque la API los dé.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable
from urllib.parse import urlencode

from .. import db
from ..config import ErrorConfig, _construir, _leer_toml
from ..modelos import Comentario
from ..tiempo import ahora

log = logging.getLogger(__name__)

API = "https://www.googleapis.com/youtube/v3/"
VARIABLE_CLAVE = "YOUTUBE_API_KEY"

Pedidor = Callable[[str], "tuple[int, dict]"]


@dataclass
class AjustesYoutube:
    canales: list[str] = field(default_factory=list)  # "@handle" o id de canal (UC...)
    videos_por_canal: int = 15  # los más recientes de cada canal
    max_comentarios_por_video: int = 2000
    ventana_horas: float = 72.0  # vídeos publicados en las últimas N horas
    horas_entre_rastreos: float = 6.0  # cada cuánto se vuelve a mirar un vídeo
    cuota_maxima_por_pasada: int = 1500  # unidades de la API por pasada


def cargar_ajustes_youtube(ruta: Path) -> AjustesYoutube:
    ajustes = _construir(AjustesYoutube, _leer_toml(ruta), str(ruta))
    if not ajustes.canales:
        raise ErrorConfig(f"{ruta}: pon al menos un canal en 'canales'")
    return ajustes


def leer_clave(ruta_env: Path = Path(".env")) -> str:
    """La clave va en la variable YOUTUBE_API_KEY o en el fichero .env (nunca en el repo)."""
    clave = os.environ.get(VARIABLE_CLAVE, "").strip()
    if not clave and ruta_env.exists():
        for linea in ruta_env.read_text().splitlines():
            nombre, _, valor = linea.partition("=")
            if nombre.strip() == VARIABLE_CLAVE:
                clave = valor.strip().strip("'\"")
    if not clave:
        raise ErrorConfig(f"falta la clave de la API: pon {VARIABLE_CLAVE}=... en el fichero .env")
    return clave


class ErrorYoutube(Exception):
    def __init__(self, estado: int, motivo: str, mensaje: str = ""):
        super().__init__(f"HTTP {estado} {motivo}: {mensaje}".strip())
        self.estado = estado
        self.motivo = motivo


class CuotaAgotada(Exception):
    pass


def pedir_json(url: str, timeout: float = 30.0) -> tuple[int, dict]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as respuesta:
            return respuesta.status, json.load(respuesta)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except ValueError:
            return e.code, {}


class ClienteYoutube:
    def __init__(self, clave: str, cuota_maxima: int, pedir: Pedidor = pedir_json):
        self._clave = clave
        self._pedir = pedir
        self.cuota_maxima = cuota_maxima
        self.unidades = 0

    def _get(self, metodo: str, **parametros) -> dict:
        if self.unidades >= self.cuota_maxima:
            raise CuotaAgotada(f"gastadas {self.unidades} unidades de la API en esta pasada")
        self.unidades += 1
        url = API + metodo + "?" + urlencode({**parametros, "key": self._clave})
        estado, datos = self._pedir(url)
        if estado != 200:
            error = datos.get("error", {})
            motivo = (error.get("errors") or [{}])[0].get("reason", "")
            if motivo in ("quotaExceeded", "dailyLimitExceeded"):
                raise CuotaAgotada("se ha acabado el cupo diario de la API")
            raise ErrorYoutube(estado, motivo, error.get("message", ""))
        return datos

    def lista_de_subidas(self, canal: str) -> str:
        parametros = {"forHandle": canal} if canal.startswith("@") else {"id": canal}
        elementos = self._get("channels", part="contentDetails", **parametros).get("items") or []
        if not elementos:
            raise ErrorYoutube(404, "canalNoEncontrado", canal)
        return elementos[0]["contentDetails"]["relatedPlaylists"]["uploads"]

    def videos_recientes(self, lista: str, cuantos: int) -> list[tuple[str, str, str]]:
        """(id, título, fecha de publicación) de los últimos vídeos subidos."""
        datos = self._get(
            "playlistItems", part="snippet,contentDetails", playlistId=lista, maxResults=min(cuantos, 50)
        )
        videos = []
        for elemento in datos.get("items", []):
            detalles = elemento.get("contentDetails", {})
            videos.append(
                (
                    detalles.get("videoId", ""),
                    elemento.get("snippet", {}).get("title", ""),
                    detalles.get("videoPublishedAt", ""),
                )
            )
        return [v for v in videos if v[0]]

    def comentarios(self, video_id: str, maximo: int) -> list[Comentario]:
        crudos: list[tuple[str, str | None, dict]] = []  # (id, id del padre, snippet)
        pagina = None
        while len(crudos) < maximo:
            parametros = dict(
                part="snippet,replies", videoId=video_id, order="time",
                textFormat="plainText", maxResults=100,
            )
            if pagina:
                parametros["pageToken"] = pagina
            datos = self._get("commentThreads", **parametros)
            for hilo in datos.get("items", []):
                principal = hilo["snippet"]["topLevelComment"]
                crudos.append((principal["id"], None, principal["snippet"]))
                respuestas = hilo.get("replies", {}).get("comments", [])
                if hilo["snippet"].get("totalReplyCount", 0) > len(respuestas):
                    respuestas = self._respuestas(principal["id"])
                crudos.extend((r["id"], principal["id"], r["snippet"]) for r in respuestas)
            pagina = datos.get("nextPageToken")
            if not pagina:
                break
        return [
            Comentario(
                id_externo=ident,
                texto=(snippet.get("textDisplay") or "").strip(),
                cuenta=snippet.get("authorDisplayName", ""),
                posicion=posicion,
                respuesta_a=padre,
                fecha_publicacion=snippet.get("publishedAt"),
            )
            for posicion, (ident, padre, snippet) in enumerate(crudos[:maximo])
            if (snippet.get("textDisplay") or "").strip()
        ]

    def _respuestas(self, padre: str) -> list[dict]:
        respuestas, pagina = [], None
        while True:
            parametros = dict(part="snippet", parentId=padre, textFormat="plainText", maxResults=100)
            if pagina:
                parametros["pageToken"] = pagina
            datos = self._get("comments", **parametros)
            respuestas.extend(datos.get("items", []))
            pagina = datos.get("nextPageToken")
            if not pagina:
                return respuestas


@dataclass
class ResumenYoutube:
    canal: str
    videos_revisados: int = 0
    comentarios_nuevos: int = 0
    errores: int = 0
    detenido_por: str | None = None


def _publicado_hace_menos_de(fecha: str, horas: float, momento: datetime) -> bool:
    try:
        publicado = datetime.fromisoformat(fecha.replace("Z", "+00:00"))
    except ValueError:
        return True  # sin fecha clara, mejor mirarlo
    return publicado >= momento - timedelta(hours=horas)


def rastrear_youtube(
    ajustes: AjustesYoutube,
    cliente: ClienteYoutube,
    con: sqlite3.Connection,
    canales: list[str] | None = None,
) -> list[ResumenYoutube]:
    resumenes = []
    for canal in canales or ajustes.canales:
        resumen = ResumenYoutube(canal)
        resumenes.append(resumen)
        medio_id = f"youtube:{canal}"
        rastreo_id = db.empezar_rastreo(con, medio_id, ahora())
        try:
            lista = cliente.lista_de_subidas(canal)
            for video_id, titulo, publicado in cliente.videos_recientes(lista, ajustes.videos_por_canal):
                if _publicado_hace_menos_de(publicado, ajustes.ventana_horas, ahora()):
                    url = f"https://www.youtube.com/watch?v={video_id}"
                    db.registrar_articulo(con, medio_id, url, titulo, ahora())
            pendientes = db.articulos_para_rastrear(
                con, medio_id,
                ventana_horas=ajustes.ventana_horas,
                horas_entre_rastreos=ajustes.horas_entre_rastreos,
                limite=ajustes.videos_por_canal,
                momento=ahora(),
            )
            for video in pendientes:
                video_id = video["url"].rsplit("v=", 1)[-1]
                try:
                    comentarios = cliente.comentarios(video_id, ajustes.max_comentarios_por_video)
                except ErrorYoutube as e:
                    if e.motivo == "commentsDisabled":
                        comentarios = []
                    else:
                        resumen.errores += 1
                        log.warning("%s: %s", video["url"], e)
                        continue
                nuevos = db.guardar_comentarios(con, video["id"], comentarios, ahora())
                resumen.videos_revisados += 1
                resumen.comentarios_nuevos += nuevos
                log.info("%s «%s»: %d comentarios (%d nuevos)", canal, video["titulo"], len(comentarios), nuevos)
        except CuotaAgotada as e:
            resumen.detenido_por = str(e)
            log.warning("%s: %s. Seguimos en la próxima pasada.", canal, e)
        except ErrorYoutube as e:
            resumen.errores += 1
            log.warning("%s: %s", canal, e)
        finally:
            db.terminar_rastreo(
                con, rastreo_id, ahora(),
                articulos=resumen.videos_revisados, nuevos=resumen.comentarios_nuevos,
                errores=resumen.errores, detenido_por=resumen.detenido_por,
            )
        if resumen.detenido_por:
            break
    log.info("Unidades de la API gastadas en esta pasada: %d", cliente.unidades)
    return resumenes
