# Proyecto: sistema contra comentarios de odio online

## Objetivo
Frenar la ola de comentarios de odio en periódicos digitales y redes sociales en España. No se persigue a personas: se ataca lo que les da altavoz (medios, plataformas, anunciantes) y se hace visible que estos comentarios se denuncian de verdad.

## Líneas rojas (no negociables, todo debe ser legal)
- NO investigar ni recopilar información personal de los autores (dirección, trabajo, familia, amigos). Nada de fichas ni perfiles.
- NO guardar en la base de datos nombres reales de autores. El sistema guarda solo: texto del comentario, URL, nombre de la cuenta tal como aparece, fecha y capturas. Si el perfil enlaza públicamente a un nombre real, se añade a mano en el momento de redactar la denuncia y no se almacena.
- NO publicar a personas identificadas: en la cuenta pública, nombre y foto siempre pixelados.
- NO intentar identificar a quién hay detrás de cuentas falsas (eso solo lo hace la policía con orden judicial).
- NO bots que publiquen en plataformas ajenas ni saltarse captchas o sistemas anti-automatización. Las respuestas las envía una persona.
- La IA no decide qué es delito: propone y prioriza; una persona revisa todo antes de denunciar.

## MVP (fase 1): tres frentes que se retroalimentan
1. **Rastreo y clasificación**
   - Recoger comentarios de secciones de comentarios de periódicos (empezar por uno o dos medios) y redes, por medios permitidos.
   - Clasificar con IA: descartar lo meramente ofensivo y marcar candidatos a delito, sobre todo:
     - Art. 510 CP (odio): humillación o menosprecio por raza, origen, religión, sexo, orientación o identidad sexual, género, discapacidad, etc., contra un colectivo o una persona por pertenecer a él.
     - Art. 169 CP (amenazas): anuncio de un mal concreto ("te voy a…"), no simples deseos ("ojalá…").
   - Cola de revisión humana con el contexto completo del hilo.
2. **Prueba y denuncia**
   - Captura certificada de cada caso (servicio de prueba electrónica) + enlace + fecha/hora.
   - Generar un escrito único periódico a la Fiscalía de delitos de odio (Sevilla) con anexo: un caso por ficha, motivo por el que encaja en el tipo penal.
   - Notificación formal al medio o plataforma de cada contenido presuntamente ilegal (Reglamento de Servicios Digitales / LSSI).
3. **Seguimiento y presión**
   - Re-comprobar cada 24 h si el contenido sigue visible; registrar días hasta retirada y si se borra o solo se oculta.
   - Captura de los anuncios que aparecen junto a cada comentario (para presión a anunciantes y redes publicitarias tipo AdSense/Taboola).

## Respuestas en los comentarios
- Cola semiautomática: la IA redacta una respuesta seca y variada ("Comentario denunciado ante la Fiscalía de delitos de odio"), con el enlace; la persona la abre y la envía con un toque.
- Solo responder cuando la denuncia ya está presentada.
- La respuesta enlaza a la cuenta en general, nunca al post concreto donde aparece ese caso pixelado.
- Sin insultos ni tono agresivo.

## Cuenta pública (Instagram, anónima)
- Bio + post fijado + destacadas explicando el proceso que sigue cada comentario. Solo describir lo que realmente se hace.
- Contenido: comentarios pixelados con medio de origen, contador de denuncias, rankings de medios por tiempo de retirada, condenas ya publicadas en prensa.

## Fases posteriores (no ahora)
- Observatorio web con estadísticas, informes mensuales para periodistas y verificadores.
- Constituir asociación → solicitar estatus de alertador fiable (CNMC) y acusación popular en casos claros.
- Quejas ante CNMC/Comisión Europea por incumplimientos de plataformas; litigio estratégico contra un medio (precedente TEDH Delfi c. Estonia).
- Presión a anunciantes, publicidad institucional (vía transparencia) y juntas de accionistas de grupos de medios.
- Alianzas con ONGs, buzón ciudadano, generador de denuncias para cualquiera, dataset anonimizado para universidades, antipremios anuales, prevención en institutos.

## Seguridad operativa
- Equipo aparte (mini PC o portátil) dedicado al proyecto.
- Correo y número de teléfono propios del proyecto, separados de la vida personal.
- VPN para el rastreo; conexión estable para la cuenta de Instagram.

## Antes de lanzar
Revisión del diseño por un abogado de protección de datos y derecho al honor.

## Código (estado actual)
- Python ≥ 3.11, paquete `centinela` en `src/`, CLI `centinela` (ver README).
- `src/centinela/rastreo/`: descubrimiento por RSS/sitemap, cortesía (robots.txt, ritmo, parar ante bloqueos), navegador Playwright, extracción por selectores CSS e inspección de páginas para dar de alta medios.
- `config/medios/<id>.toml`: un fichero por medio con sus selectores; `_plantilla.toml` es la plantilla.
- `src/centinela/db.py`: SQLite local en `datos/` (no se sube al repo). Los estados de los comentarios empiezan en `pendiente_clasificar`; la clasificación, la revisión, la denuncia y el seguimiento irán en paquetes hermanos de `rastreo/`.
- Tests: `pytest` (periódico de prueba en `tests/sitio_prueba/`; `CENTINELA_CHROMIUM` si hace falta indicar Chromium).
