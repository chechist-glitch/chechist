import pytest

from centinela.rastreo.cortesia import Ritmo, Robots, parece_bloqueo

UA = "CentinelaBot/0.1 (pruebas)"

ROBOTS = b"""
User-agent: *
Disallow: /privado/

User-agent: CentinelaBot
Disallow: /solo-para-nosotros/
Crawl-delay: 20
"""


def robots_con(respuesta):
    llamadas = []

    def descargar(url, user_agent, timeout):
        llamadas.append(url)
        if isinstance(respuesta, Exception):
            raise respuesta
        return respuesta

    return Robots(UA, descargar=descargar), llamadas


def test_robots_aplica_las_reglas_de_nuestro_agente():
    robots, llamadas = robots_con((200, ROBOTS))
    assert robots.permitido("https://medio.es/noticia.html")
    assert not robots.permitido("https://medio.es/solo-para-nosotros/x")
    assert robots.espera_minima("https://medio.es/noticia.html") == 20
    assert llamadas == ["https://medio.es/robots.txt"]  # se cachea por sitio


@pytest.mark.parametrize(
    "respuesta, permitido",
    [
        ((404, b""), True),  # sin robots.txt no hay normas
        ((403, b""), False),
        ((503, b""), False),  # caído: por prudencia, no
        (OSError("sin red"), False),
    ],
)
def test_robots_si_no_se_puede_leer(respuesta, permitido):
    robots, _ = robots_con(respuesta)
    assert robots.permitido("https://medio.es/noticia.html") is permitido


def test_ritmo_espera_entre_peticiones_al_mismo_host():
    reloj = [100.0]
    dormidas = []

    def dormir(s):
        dormidas.append(s)
        reloj[0] += s

    ritmo = Ritmo(8, reloj=lambda: reloj[0], dormir=dormir)
    ritmo.esperar("https://a.es/1")
    ritmo.esperar("https://b.es/1")  # otro host: sin espera
    reloj[0] += 3
    ritmo.esperar("https://a.es/2")
    assert dormidas == [5]
    ritmo.esperar("https://a.es/3", minimo=20)  # Crawl-delay mayor que el nuestro
    assert dormidas == [5, 20]


@pytest.mark.parametrize(
    "estado, titulo, reto, bloqueado",
    [
        (200, "Noticia normal", False, False),
        (429, "", False, True),
        (403, "", False, True),
        (200, "Just a moment...", False, True),
        (200, "Acceso denegado a la sanidad pública para miles de personas", False, False),
        (200, "Noticia normal", True, True),
    ],
)
def test_deteccion_de_bloqueos(estado, titulo, reto, bloqueado):
    assert (parece_bloqueo(estado, titulo, reto) is not None) is bloqueado
