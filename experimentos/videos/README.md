# Vídeos a lo bestia (sin HyperFrames)

Para cosas muy pesadas (shaders con miles de pasos por píxel) uso un motor propio:

- `comun/motor.js`: pinta cada fotograma con un shader (WebGL2), con varias muestras por píxel promediadas, tono y grano.
- `rodaje.mjs`: abre la página en Chromium, llama a `window.pintar(t, fotograma)` para cada fotograma, guarda los PNG (se puede parar y seguir) y monta el MP4 en `renders/` con ffmpeg.

```bash
cd experimentos/videos
node rodaje.mjs fagos --hilos 2                       # 24 s a 24 fps, 1280×720
node rodaje.mjs cuarta-dimension --dur 30 --hilos 1
node rodaje.mjs fagos --desde 0 --hasta 576 --paso 96 # solo unos fotogramas de prueba
```

## `fagos/` — virus al microscopio electrónico

Bacteriófagos T4 sobre E. coli con estética de microscopio electrónico de barrido (color falso). Un solo zoom continuo de ~2 µm a ~1 nm: bacterias sobre un filtro con poros, fagos con su cápside icosaédrica, vaina contráctil, placa basal y seis fibras; los capsómeros hexagonales con la proteína Hoc; y, al final, los átomos de la cápside coloreados por elemento. Uno de los fagos contrae la vaina para inyectar el ADN. La barra de escala, el aumento y las etiquetas se calculan con la misma cámara que el shader.

Es todo una función de distancia con signo en raymarching; el detalle se activa según el tamaño del píxel (nivel de detalle continuo) para que el mismo modelo sirva a todas las escalas.

## `cuarta-dimension/` — el tiempo hecho espacio

1. Péndulo doble integrado con Runge–Kutta 4; su recorrido en el tiempo se convierte en una escultura 3D (el tiempo pasa a ser el eje z).
2. Conjunto de Julia en los cuaterniones (un fractal de 4 dimensiones) en raymarching: lo que se ve es un corte 3D que gira en el plano z–w.
3. Hipercubo rotando en el plano x–w con proyección en perspectiva.
4. Fibración de Hopf: círculos de la 3-esfera, todos enlazados, en proyección estereográfica.

Mezcla dos motores: Three.js (con bloom) para 1, 3 y 4, y el motor de shaders para 2.
