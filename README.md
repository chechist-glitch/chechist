# Centinela

Sistema contra los comentarios de odio en medios digitales españoles. El
objetivo, las líneas rojas y las fases están en [CLAUDE.md](CLAUDE.md).

## Estado de la fase 1

- [x] Rastreo de comentarios de un medio (el código de este repo)
- [x] Captura asistida en redes (extensión del navegador): Instagram y cualquier web
- [x] YouTube automático por su API oficial
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

## YouTube (automático, por la API oficial)

Google da los comentarios públicos de cualquier vídeo con una clave gratuita,
así que aquí sí va solo: `centinela youtube` mira los últimos vídeos de cada
canal y se trae todos sus comentarios y respuestas.

1. Saca una clave (gratis, con la cuenta de Google del proyecto):
   - Entra en https://console.cloud.google.com/ y crea un proyecto.
   - En "APIs y servicios" → "Biblioteca", busca **YouTube Data API v3** y
     dale a "Habilitar".
   - En "APIs y servicios" → "Credenciales" → "Crear credenciales" →
     "Clave de API". Cópiala.
2. Crea un fichero `.env` en la raíz del proyecto con la línea
   `YOUTUBE_API_KEY=tu_clave` (no se sube al repo).
3. Pon los canales en `config/youtube.toml` (por su `@`, el que sale en
   `youtube.com/@nombre`).
4. `centinela youtube`. Con el cupo gratis (10.000 unidades al día, unos
   100 comentarios por unidad) da para una pasada cada 4 horas.

## Captura asistida en redes (Instagram y demás)

En las redes no se rastrea con un bot: con la sesión iniciada va contra sus
condiciones y acaban baneando la cuenta. Lo que se hace es que una persona
navega como siempre y, cuando ve un comentario de odio, lo manda a Centinela
en dos clics con su texto, su enlace y una captura de pantalla.

1. Deja abierta una terminal con:
   ```bash
   centinela recepcion
   ```
2. Instala la extensión una vez: en Chrome (o Edge o Brave) entra en
   `chrome://extensions`, activa el "Modo de desarrollador", pulsa "Cargar
   extensión sin empaquetar" y elige la carpeta `extension/` del proyecto.
3. En Instagram, abre la publicación (que en la barra ponga `/p/…` o
   `/reel/…`), deja el comentario a la vista, selecciona su texto, haz clic
   derecho y elige **Enviar a Centinela**. En el formulario, pega el nombre de
   la cuenta y dale a Guardar.
4. `centinela casos` lista lo capturado. Las capturas van a `datos/capturas/`
   con su huella SHA-256 apuntada en la base de datos.

Estas capturas valen para trabajar y para la revisión. Para la denuncia, la
prueba fuerte sigue siendo la captura certificada de un servicio de prueba
electrónica (frente 2).

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
centinela youtube [--canal @canal]                # comentarios de YouTube
centinela recepcion [--puerto 8770]               # recibe los casos de la extensión
centinela casos [--limite N]                      # casos capturados a mano
```

Para que vaya solo, con cron:

```cron
0 * * * *  cd /ruta/al/proyecto && .venv/bin/centinela rastrear >> datos/rastreo.log 2>&1
15 */4 * * * cd /ruta/al/proyecto && .venv/bin/centinela youtube >> datos/rastreo.log 2>&1
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
