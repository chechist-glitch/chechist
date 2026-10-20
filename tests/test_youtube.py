"""Recogida de YouTube contra respuestas de prueba con la forma de la API real."""

from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

from centinela import db
from centinela.config import ErrorConfig
from centinela.redes.youtube import (
    AjustesYoutube,
    ClienteYoutube,
    cargar_ajustes_youtube,
    leer_clave,
    rastrear_youtube,
)
from centinela.tiempo import ahora, iso

RAIZ = Path(__file__).parent.parent


def snippet(texto, cuenta, **extra):
    return {
        "textDisplay": texto,
        "authorDisplayName": cuenta,
        "authorChannelId": {"value": "UCno-se-guarda"},
        "authorProfileImageUrl": "https://yt3.ggpht.com/no-se-guarda",
        "publishedAt": "2026-10-20T08:00:00Z",
        **extra,
    }


class FalsaApi:
    """Responde como la API de YouTube según el método y los parámetros."""

    def __init__(self, reciente):
        self.llamadas = []
        self.reciente = reciente

    def __call__(self, url):
        partes = urlsplit(url)
        metodo = partes.path.rsplit("/", 1)[-1]
        p = {k: v[0] for k, v in parse_qs(partes.query).items()}
        self.llamadas.append((metodo, p))
        assert p["key"] == "clave-de-prueba"
        if metodo == "channels":
            if p.get("forHandle") == "@noexiste":
                return 200, {"items": []}
            return 200, {"items": [{"contentDetails": {"relatedPlaylists": {"uploads": "UUlista"}}}]}
        if metodo == "playlistItems":
            return 200, {"items": [
                {"snippet": {"title": "Vídeo reciente"},
                 "contentDetails": {"videoId": "v1", "videoPublishedAt": self.reciente}},
                {"snippet": {"title": "Sin comentarios"},
                 "contentDetails": {"videoId": "v2", "videoPublishedAt": self.reciente}},
                {"snippet": {"title": "Vídeo viejo"},
                 "contentDetails": {"videoId": "v3", "videoPublishedAt": "2020-01-01T00:00:00Z"}},
            ]}
        if metodo == "commentThreads":
            if p["videoId"] == "v2":
                return 403, {"error": {"message": "disabled", "errors": [{"reason": "commentsDisabled"}]}}
            if "pageToken" not in p:
                return 200, {"nextPageToken": "pag2", "items": [
                    {"snippet": {"totalReplyCount": 1, "topLevelComment": {
                        "id": "A", "snippet": snippet("Comentario A", "@uno")}},
                     "replies": {"comments": [{"id": "A.1", "snippet": snippet("Respuesta a A", "@dos")}]}},
                    {"snippet": {"totalReplyCount": 7, "topLevelComment": {
                        "id": "B", "snippet": snippet("Comentario B", "@tres")}},
                     "replies": {"comments": [{"id": "B.1", "snippet": snippet("solo una de 7", "@x")}]}},
                ]}
            return 200, {"items": [
                {"snippet": {"totalReplyCount": 0, "topLevelComment": {
                    "id": "C", "snippet": snippet("Comentario C", "@cuatro")}}},
            ]}
        if metodo == "comments":
            assert p["parentId"] == "B"
            return 200, {"items": [
                {"id": f"B.{i}", "snippet": snippet(f"Respuesta {i} a B", "@cinco")} for i in range(1, 8)
            ]}
        raise AssertionError(f"método inesperado {metodo}")


@pytest.fixture
def api():
    return FalsaApi(reciente=iso(ahora()))


def test_recoge_comentarios_y_respuestas(api):
    con = db.conectar(":memory:")
    ajustes = AjustesYoutube(canales=["@canal"], horas_entre_rastreos=0)
    cliente = ClienteYoutube("clave-de-prueba", 100, pedir=api)
    (resumen,) = rastrear_youtube(ajustes, cliente, con)

    assert resumen.videos_revisados == 2  # el viejo ni se mira; el de comentarios cerrados sí
    assert resumen.comentarios_nuevos == 11  # A, A.1, B, B.1..B.7, C
    filas = {f["id_externo"]: f for f in con.execute("SELECT * FROM comentarios")}
    assert filas["B.3"]["respuesta_a"] == "B"
    assert filas["A"]["cuenta"] == "@uno"
    assert filas["A"]["fecha_publicacion"] == "2026-10-20T08:00:00Z"
    # De la cuenta solo el nombre visible: ni id de canal ni foto.
    volcado = "\n".join(str(tuple(f)) for f in con.execute("SELECT * FROM comentarios"))
    assert "UCno-se-guarda" not in volcado and "yt3.ggpht" not in volcado
    urls = {f["url"] for f in con.execute("SELECT url FROM articulos")}
    assert urls == {"https://www.youtube.com/watch?v=v1", "https://www.youtube.com/watch?v=v2"}
    assert cliente.unidades == len(api.llamadas)

    # Segunda pasada: nada nuevo.
    (resumen,) = rastrear_youtube(ajustes, ClienteYoutube("clave-de-prueba", 100, pedir=api), con)
    assert resumen.comentarios_nuevos == 0


def test_para_al_llegar_al_tope_de_cuota(api):
    con = db.conectar(":memory:")
    ajustes = AjustesYoutube(canales=["@canal", "@otro"])
    cliente = ClienteYoutube("clave-de-prueba", 3, pedir=api)
    resumenes = rastrear_youtube(ajustes, cliente, con)
    assert len(resumenes) == 1 and resumenes[0].detenido_por
    assert cliente.unidades == 3


def test_cuota_diaria_agotada_en_google():
    def agotada(url):
        return 403, {"error": {"errors": [{"reason": "quotaExceeded"}]}}

    con = db.conectar(":memory:")
    (resumen,) = rastrear_youtube(
        AjustesYoutube(canales=["@canal"]), ClienteYoutube("k", 100, pedir=agotada), con
    )
    assert "cupo diario" in resumen.detenido_por


def test_canal_que_no_existe(api):
    con = db.conectar(":memory:")
    (resumen,) = rastrear_youtube(
        AjustesYoutube(canales=["@noexiste"]), ClienteYoutube("clave-de-prueba", 100, pedir=api), con
    )
    assert resumen.errores == 1 and resumen.detenido_por is None


def test_clave_desde_env(tmp_path, monkeypatch):
    monkeypatch.delenv("YOUTUBE_API_KEY", raising=False)
    env = tmp_path / ".env"
    with pytest.raises(ErrorConfig, match="YOUTUBE_API_KEY"):
        leer_clave(env)
    env.write_text("OTRA=1\nYOUTUBE_API_KEY='abc123'\n")
    assert leer_clave(env) == "abc123"
    monkeypatch.setenv("YOUTUBE_API_KEY", "de-la-variable")
    assert leer_clave(env) == "de-la-variable"


def test_config_del_repo_carga():
    assert cargar_ajustes_youtube(RAIZ / "config" / "youtube.toml").canales
