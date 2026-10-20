import pytest

from centinela.config import Descubrimiento, Medio, SelectoresComentarios
from centinela.modelos import ArticuloDescubierto
from centinela.rastreo.descubrimiento import filtrar, leer_fuente

RSS = b"""<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>Uno</title><link>https://www.medio.es/sociedad/uno.html</link></item>
  <item><title>Sin enlace</title></item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Dos</title><link rel="alternate" href="https://www.medio.es/espana/dos.html"/></entry>
</feed>"""

SITEMAP_NOTICIAS = b"""<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  <url>
    <loc>https://www.medio.es/sociedad/tres.html</loc>
    <news:news><news:title>Tres</news:title></news:news>
  </url>
</urlset>"""


def test_lee_rss_atom_y_sitemap():
    assert leer_fuente(RSS) == [ArticuloDescubierto("https://www.medio.es/sociedad/uno.html", "Uno")]
    assert leer_fuente(ATOM) == [ArticuloDescubierto("https://www.medio.es/espana/dos.html", "Dos")]
    assert leer_fuente(SITEMAP_NOTICIAS) == [
        ArticuloDescubierto("https://www.medio.es/sociedad/tres.html", "Tres")
    ]


def test_indice_de_sitemaps_pide_el_concreto():
    with pytest.raises(ValueError, match="índice"):
        leer_fuente(b'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>')


def test_filtrar():
    medio = Medio(
        id="m",
        nombre="M",
        dominio="www.medio.es",
        descubrimiento=Descubrimiento(fuentes=["x"], incluir=["/sociedad/", "/espana/"], excluir=["/videos/"]),
        comentarios=SelectoresComentarios(item=".c", texto=".t"),
    )
    entrada = [
        ArticuloDescubierto("https://www.medio.es/sociedad/a.html?utm_source=tw#c", "A"),
        ArticuloDescubierto("https://www.medio.es/sociedad/a.html", "A otra vez"),
        ArticuloDescubierto("https://m.medio.es/espana/b.html", "B en subdominio"),
        ArticuloDescubierto("https://www.medio.es/deportes/c.html", "Fuera de incluir"),
        ArticuloDescubierto("https://www.medio.es/sociedad/videos/d.html", "Excluida"),
        ArticuloDescubierto("https://www.otromedio.es/sociedad/e.html", "Otro dominio"),
        ArticuloDescubierto("https://www.medio.es.timo.com/sociedad/f.html", "Dominio parecido"),
    ]
    assert [a.url for a in filtrar(entrada, medio)] == [
        "https://www.medio.es/sociedad/a.html",
        "https://m.medio.es/espana/b.html",
    ]
