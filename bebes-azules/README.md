# Los Bebés Azules

Falso documental de 1975, 64 segundos, sobre bebés gigantes azules con ojos rojos que tocan la Tierra y la hacen arder.

**No hay ni un fotograma de vídeo generativo.** Todo sale de código:

- **Imagen** — WebGL2 a pelo. Los bebés son funciones de distancia con signo (SDF) renderizadas por *raymarching*: cráneo, mofletes, párpados en almendra, iris con fibras que brillan, manos con el índice estirado, pelele… La Tierra, Marte y el mar de nubes son ruido procedural (fbm, Voronoi deformado para las grietas de lava).
- **Aspecto de película vieja** — profundidad de campo, halación roja, gradación cian/naranja, grano, polvo, pelos en la ventanilla, rayas, parpadeo de exposición, *gate weave*, empalmes que patinan, cuenta atrás de cola de laboratorio y el fotograma quemándose al final.
- **Sonido** — WebAudio sintetizado en un `OfflineAudioContext`: traqueteo del proyector a 24 fps, zumbido de red a 50 Hz, chasquidos de polvo, una nana de Brahms en Fa menor para cajita de música desafinada, latidos, la radio del piloto, el golpe con gong cósmico, coro fantasma y la película soltándose de la bobina.

## Verlo en el navegador

Hace falta un servidor local (por las tipografías):

```bash
cd bebes-azules
npx serve .          # o: python3 -m http.server
```

Abre `http://localhost:3000` y dale a **▶ PROYECTAR**. Parámetros:

| Parámetro | Efecto |
|---|---|
| `?q=low` / `?q=high` | Resolución interna de la escena (0,34 / 0,75; por defecto 0,5) |
| `?t=35` | Empieza en el segundo 35 |

## Sacar el MP4

```bash
npm install
node render.mjs --workers 2          # → bebes-azules.mp4 (1440×1080, 24 fps, con audio)
```

Necesita `ffmpeg` en el `PATH` (o `FFMPEG=/ruta/ffmpeg`). Otras opciones:

```bash
node render.mjs --size 720x540 --no-audio --out prueba.mp4   # previsualización rápida
node render.mjs --from 744 --to 984 --no-audio --out toque.mp4
node render.mjs --stills 8.5,35.2 --outdir fotos           # fotogramas sueltos (segundos)
node render.mjs --audio-only --out banda.wav
```

Renderiza por CPU con SwiftShader si no hay GPU (unos 2 s por fotograma a 1440×1080).

## Estructura

```
index.html      proyector (y modo ?render=1 que usa render.mjs)
js/shaders.js   GLSL: modelo del bebé, planetas, fondos, planos y post-proceso de película
js/film.js      línea de tiempo, guion, subtítulos, rótulos y cadena WebGL
js/audio.js     banda sonora procedural
render.mjs      Playwright + ffmpeg, fotograma a fotograma
fonts/          Special Elite, IM Fell English, Playfair Display (SIL OFL)
```

El guion (planos, subtítulos y rótulos) está al principio de `js/film.js`; cada plano es un `setup()` en `js/shaders.js`.
