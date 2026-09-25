# 蒼キ嬰児 · Los Niños de Azul

Prólogo de anime oscuro, de 42,5 segundos, sobre los bebés gigantes azules. Sale del mar bajo una luna roja, abre los ojos, un HUD militar lo analiza, los misiles no le hacen nada, toca la ciudad con un dedo y la Tierra se agrieta. Luego aparece la horda y el título a lo *Evangelion*.

**Sin imágenes ni vídeo generativo.** Todo sale de código:

- **Imagen**: los gigantes se modelan con SDF y raymarching. Llevan *cel shading* de dos tonos con luz de relleno, luz de borde, línea de terminador y contornos a tinta, que salen de un Sobel sobre la normal y la profundidad. Los ojos son de demonio: esclerótica negra, iris rojo, pupila rasgada y brillos blancos de anime. La sonrisa también es animable. La ciudad es procedural, con ventanas, reflectores y un horizonte lejano en 2,5D. Hay además el mar, las nubes, una cúpula de explosión con onda de choque y pilar de luz, y la Tierra agrietada.
- **Composición de anime**: resplandor, rayos de luz, líneas de velocidad (集中線), *impact frames* en blanco, negro y rojo, destellos anamórficos, lluvia, ceniza, brasas, explosiones de dibujo animado y estelas de misiles tipo *Itano circus*. El 3D se anima "a doses" (12 dibujos/s), como el anime de verdad, y los efectos y la cámara van a 24.
- **HUD** táctico en japonés y español, con el texto de apertura en vertical (縦書き) y un título en kanji al estilo de los años 90.
- **Música** épica y gótica sintetizada con WebAudio: coro con formantes, órgano de tubos, ostinato de cuerdas, taikos, timbales, *braams*, campanas y el *Dies Irae* en los metales sobre una cadencia andaluza (Rem–Do–Si♭–La). Todo va cuadrado a 96 BPM con los cortes, y los golpes caen justo cuando se abren los ojos, cuando toca el dedo y en el título.

## Verlo en el navegador

```bash
cd aoki-eiji
npx serve .          # o: python3 -m http.server
```

Abre la página y dale a **▶ REPRODUCIR**. Parámetros:

| Parámetro | Efecto |
|---|---|
| `?q=low` / `?q=high` | Resolución interna de la escena (0,4 / 1; por defecto 2/3) |
| `?t=25` | Empieza en el segundo 25 |
| `?v` | Versión vertical 9:16 (1080×1920) |

## Sacar el MP4

```bash
npm install
node render.mjs --workers 2          # → aoki-eiji.mp4 (1920×1080, 24 fps, con música)
```

Necesita `ffmpeg` en el `PATH` (o `FFMPEG=/ruta/ffmpeg`). Otras opciones:

```bash
node render.mjs --size 1080x1920 --out vertical.mp4   # versión 9:16 (TikTok, Reels, Shorts)
node render.mjs --size 960x540 --out prueba.mp4        # previsualización rápida
node render.mjs --shots touch@1.0,horde@2.5 --outdir fotos   # plano@segundo_local
node render.mjs --audio-only --out musica.wav
```

## Estructura

```
index.html      reproductor (y modo ?render=1 para render.mjs)
js/shaders.js   GLSL: bebé, ciudad, mar, cielo, cúpula, Tierra, contornos y composición
js/anime.js     guion, cámaras, animación del rig, efectos 2D, HUD, subtítulos y títulos
js/music.js     banda sonora y efectos de sonido
render.mjs      Playwright + ffmpeg, fotograma a fotograma
fonts/          Noto Serif JP / Noto Sans JP (recortadas), Barlow Condensed, Share Tech Mono, Noto Sans (SIL OFL)
```
