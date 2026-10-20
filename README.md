# Centinela

Sistema contra los comentarios de odio en medios digitales españoles. El
objetivo, las líneas rojas y las fases están en [CLAUDE.md](CLAUDE.md).

## Estado de la fase 1

- [x] Rastreo de comentarios de un medio (el código de este repo)
- [ ] Dar de alta el primer periódico real (falta inspeccionar sus páginas)
- [ ] Clasificación con IA (arts. 510 y 169 CP): propone y prioriza, no decide
- [ ] Cola de revisión humana con el hilo completo
- [ ] Captura certificada, escrito periódico a la Fiscalía y notificación al medio (DSA/LSSI)
- [ ] Re-comprobación cada 24 h y captura de los anuncios junto a cada comentario

## Cómo rastrea, y lo que no hace

- Solo lee artículos que salen en los RSS o sitemaps del propio medio.
- Respeta robots.txt, también en las peticiones de datos que hace la página a
  su propio dominio (p. ej. la API de comentarios). Si no puede leer el
  robots.txt, no rastrea ese sitio.
- Va despacio: como mínimo 8 s entre peticiones al mismo medio (más si su
  robots.txt lo pide) y sin bajar imágenes, vídeo ni fuentes.
- Se identifica como `CentinelaBot` con el correo del proyecto.
- Si el medio responde 403/429 o sale un captcha o una verificación
  anti-bots, para y no insiste. Ni login, ni saltarse nada.
- Guarda solo el texto, la URL, el nombre de la cuenta tal como aparece y las
  fechas. Nada de perfiles, avatares ni nombres reales.
- Lo que no llega a candidato se borra con `centinela purgar` (30 días por
  defecto). Se conserva el hilo completo de los artículos con algún candidato,
  como contexto para la revisión.

## Instalación (en el equipo del proyecto)

Hace falta Python 3.11 o más nuevo.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
playwright install chromium
```

Luego edita `config/ajustes.toml` y pon el correo del proyecto en `user_agent`.

## Dar de alta un periódico

1. Busca un artículo con comentarios y ejecuta:
   ```bash
   centinela inspeccionar https://www.periodico.es/seccion/noticia.html
   ```
   Te dice qué sistema de comentarios usa, qué elementos parecen comentarios
   y qué peticiones de datos hace, y guarda una captura y el HTML en
   `datos/inspeccion/`.
2. Copia `config/medios/_plantilla.toml` a `config/medios/<id>.toml` y rellena
   los selectores. Puedes sacarlos del HTML guardado o de "Inspeccionar
   elemento" en el navegador.
3. Repite `centinela inspeccionar` con la misma URL hasta que al final diga que
   lee bien los comentarios. Después borra `datos/inspeccion/`.

## Uso

```bash
centinela medios                                  # medios configurados
centinela rastrear [--medio id] [--max-articulos N]
centinela comentarios [--medio id] [--limite N]   # últimos guardados
centinela purgar [--dias 30]
```

Para que vaya solo, con cron:

```cron
0 * * * *  cd /ruta/al/proyecto && .venv/bin/centinela rastrear >> datos/rastreo.log 2>&1
30 3 * * * cd /ruta/al/proyecto && .venv/bin/centinela purgar >> datos/rastreo.log 2>&1
```

## Tests

```bash
pytest
```

Los tests levantan un periódico de prueba en local (`tests/sitio_prueba/`). Si
Chromium no está donde lo espera Playwright, usa
`CENTINELA_CHROMIUM=/ruta/a/chrome pytest`.

## Pendiente de ver con el abogado

- Base legal del tratamiento, plazo de purga y si guardar el hilo completo
  como contexto es proporcionado.
- Si robots.txt basta como criterio de "medios permitidos", y las condiciones
  de uso de cada medio.
- La reserva de minería de textos y datos (art. 4 de la Directiva 2019/790)
  cuando se clasifique con IA.
