from pathlib import Path

import pytest

from centinela.config import ErrorConfig, cargar_ajustes, cargar_medio, cargar_medios

RAIZ = Path(__file__).parent.parent


def test_los_ficheros_del_repo_cargan():
    ajustes = cargar_ajustes(RAIZ / "config" / "ajustes.toml")
    assert ajustes.segundos_entre_peticiones >= 5
    assert ajustes.base_datos == Path("datos/centinela.sqlite")
    plantilla = cargar_medio(RAIZ / "config" / "medios" / "_plantilla.toml")
    assert plantilla.comentarios.item


def test_la_plantilla_no_se_carga_como_medio():
    assert "ejemplo" not in cargar_medios(RAIZ / "config" / "medios")


MINIMO = """
id = "x"
nombre = "X"
dominio = "x.es"
[descubrimiento]
fuentes = ["https://x.es/rss"]
[comentarios]
item = ".c"
texto = ".t"
"""


def test_medio_minimo(tmp_path):
    ruta = tmp_path / "x.toml"
    ruta.write_text(MINIMO)
    medio = cargar_medio(ruta)
    assert medio.descubrimiento.max_articulos == 30
    assert medio.comentarios.cuenta == ""


@pytest.mark.parametrize(
    "cambio, mensaje",
    [
        (('texto = ".t"', 'texto = ".t"\ncuentaa = ".a"'), "desconocida"),
        (('texto = ".t"', ""), "falta"),
        (('item = ".c"', "item = 3"), "tipo"),
        (('fuentes = ["https://x.es/rss"]', "fuentes = []"), "fuente"),
        (('fuentes = ["https://x.es/rss"]', 'fuentes = ["https://x.es/rss"]\nincluir = ["("]'), "regular"),
    ],
)
def test_errores_de_config_claros(tmp_path, cambio, mensaje):
    ruta = tmp_path / "x.toml"
    ruta.write_text(MINIMO.replace(*cambio))
    with pytest.raises(ErrorConfig, match=mensaje):
        cargar_medio(ruta)


def test_ids_repetidos(tmp_path):
    (tmp_path / "a.toml").write_text(MINIMO)
    (tmp_path / "b.toml").write_text(MINIMO)
    with pytest.raises(ErrorConfig, match="ya lo usa"):
        cargar_medios(tmp_path)
