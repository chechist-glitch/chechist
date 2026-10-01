# Serie 3: 50 estilos mezclados

Mezclas raras de estilos y, sobre todo, formas distintas de hacer cada imagen. Salen en `../salida-serie-3/`. Los comandos se lanzan desde `experimentos/imagenes/`.

```bash
node render.mjs serie-3              # las 48 que se hacen en el navegador
MUESTRAS=2 node render.mjs serie-3 25 # vista previa rápida de una con shader
bash serie-3/ffmpeg.sh               # las dos que se hacen solo con ffmpeg (49 y 50)
```

`assets/mas.js` tiene las utilidades comunes de esta serie (rampas de color, píxel a píxel, Poisson disc, papel, grano).

| # | Pieza | Cómo está hecha |
|---|-------|-----------------|
| 01 | Hokusai ciberpunk | Canvas: ola como banda en espiral, garras de espuma recursivas, neón con `shadowBlur` |
| 02 | Alhambra de neón | Canvas: lacería por el método de Hankin sobre el mosaico 4.8.8 |
| 03 | Rosetón de circuito | Canvas píxel a píxel en coordenadas polares plegadas + pistas vectoriales |
| 04 | Art déco | SVG generado con JS |
| 05 | Constructivismo | SVG puro con filtros `feTurbulence` / `feDisplacementMap` |
| 06 | Vaporwave Windows 95 | CSS puro (bordes biselados, máscaras, degradados) + SVG |
| 07 | Modernismo | SVG generado con JS |
| 08 | 3D a lápiz | Three.js: pases de luz y normales + shader de contornos y tramado |
| 09 | Gouache | Canvas + filtro Kuwahara generalizado de 8 sectores |
| 10 | Macintosh 1 bit | Trazado de rayos en JS + tramado Atkinson |
| 11 | Punto de cruz | Diseño en rejilla 72×90, cada puntada con degradado y torsión |
| 12 | Mosaico romano | Teselas pegadas a las curvas de nivel de una distancia con signo |
| 13 | Mosaico de piezas | Cuantización a paleta de plástico, tetones sombreados |
| 14 | Jersey de punto | Cada punto son dos lazadas, tela ondulada con ruido |
| 15 | Marquetería | Shader: vetas procedurales por especie de madera |
| 16 | Kilim | Pasadas de trama, ranuras y abrash |
| 17 | Sashiko | SVG con `stroke-dasharray` y filtros de tela |
| 18 | Plastilina | Raymarching con smooth-min, huellas y sombras suaves |
| 19 | Pizarra | Capa limpia + máscara de grano de tiza |
| 20 | Grafiti | Capas de spray, extrusión, chorretones y juntas del ladrillo |
| 21 | Cianotipia | Máscara de luz bloqueada + emulsión a brochazos |
| 22 | Colodión | Shader: escena + química de la placa (bordes, cometas, arañazos) |
| 23 | Cámara térmica | Temperaturas en gris → sensor de baja resolución → paleta hierro |
| 24 | Rayos X | Densidades sumadas en modo `lighter` → curva de placa |
| 25 | Tilt-shift | Raymarching de un pueblo por celdas + lente con gran apertura |
| 26 | Anáglifo | Dos cámaras en el shader, una por canal |
| 27 | Estereograma | Algoritmo clásico de autoestereograma |
| 28 | Cuatricromía | Separación CMYK, tramas a 15/75/0/45º, lupa ×4,5 |
| 29 | Pixel sorting | Ordenación de tramos por luminancia |
| 30 | Slit-scan | Cada fila calculada en un instante distinto |
| 31 | Xilografía | Líneas moduladas píxel a píxel con supermuestreo |
| 32 | Una sola línea | Espiral modulada por la oscuridad |
| 33 | Hilo y clavos | Algoritmo voraz sobre una rejilla de 300×300 |
| 34 | Sumi-e | Pincel de cerdas que se queda sin tinta |
| 35 | Patente | SVG a mano |
| 36 | Manuscrito | Canvas + pan de oro con relieve + foto en el atril |
| 37 | Armonógrafo | Senos amortiguados en modo `multiply` |
| 38 | Op art | Celdas deformadas por una lente esférica |
| 39 | Agujero negro | Shader: integración de rayos en Schwarzschild, Doppler |
| 40 | Nubes | Shader volumétrico: Beer–Lambert, Henyey–Greenstein |
| 41 | Pompas | Shader: interferencia de película fina por longitud de onda |
| 42 | Cáusticas | Shader: intensidad = 1/det del jacobiano de la refracción |
| 43 | Copos de nieve | Autómata de Reiter en rejilla hexagonal |
| 44 | Coral | Agregación limitada por difusión |
| 45 | Nervaduras | Colonización del espacio + modelo de tuberías |
| 46 | Pueblo WFC | Wave Function Collapse con losetas en pixel art |
| 47 | Diatomeas | Campo oscuro con aberración cromática |
| 48 | Relieve suizo | Mapa de alturas, sombreado, curvas de nivel y ríos |
| 49 | Mandelbrot | Solo ffmpeg: filtro `mandelbrot` + `geq` |
| 50 | Juego de la vida | Solo ffmpeg: filtro `life` + `tmix` |
