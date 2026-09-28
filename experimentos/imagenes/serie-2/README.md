# Serie 2: hiperrealismo, ilustración y experimentos

Menos piezas y más trabajadas. Salen en `../salida-serie-2/`. Los comandos se lanzan desde `experimentos/imagenes/`.

```bash
node render.mjs serie-2              # todas (las de trazado de rayos tardan varios minutos)
MUESTRAS=2 node render.mjs serie-2 01 # vista previa rápida con pocas muestras
```

Las piezas con shader usan `assets/gl.js`: un pequeño motor que lanza el shader muchas veces con ruido distinto y promedia (así se limpia el ruido del trazado de rayos, se suaviza el antialiasing y sale el desenfoque de lente).

## Hiperrealismo

| # | Pieza | Técnica |
|---|-------|---------|
| 01 | Bodegón | Path tracing: cristal con refracción y cáustica, piel de naranja con relieve, mármol procedural, cromo, muestreo directo de la luz, profundidad de campo · 200 muestras |
| 02 | Sierra al atardecer | Raymarching de terreno fractal "erosionado", sombras suaves, niebla atmosférica, nieve, lago con reflejo |
| 03 | Mar de Alborán | Olas por suma de ondas afiladas, Fresnel, reflejo del cielo, destello del sol, espuma |
| 04 | Planeta azul | Continentes y nubes con ruido 3D, dispersión atmosférica Rayleigh + Mie con valores terrestres, luces de ciudades en la cara nocturna, luna |

## Ilustración

| # | Pieza | Técnica |
|---|-------|---------|
| 06 | Noche estrellada | Óleo: ~90.000 pinceladas con cerdas que siguen un campo de remolinos |
| 07 | Papel recortado | Capas de cartulina con sombras proyectadas, fibra y canto de papel |
| 11 | Billete de 100 Quillos | Guilloché, grabado de líneas de grosor variable, microtexto, hilo de seguridad |
| 12 | Acuarela | Manchas deformadas por capas, grano de pigmento, borde de agua, blancos de reserva |
| 13 | Cómic pop | Puntos Ben-Day, estallido, rotulación con volumen, bocadillos |
| 14 | Lámina botánica | Grabado coloreado a mano: tramado, punteado y aguadas |
| 15 | Puntillismo | ~100.000 puntos de color puro con toques complementarios |

## Experimental

| # | Pieza | Técnica |
|---|-------|---------|
| 05 | Seda | Atractor de Clifford, 40 millones de iteraciones coloreadas por dirección |
| 08 | Mandelbulb | Fractal 3D por distancia estimada, oclusión, sombras suaves y desenfoque |
| 09 | Mármol líquido | Deformación de dominio (ruido sobre ruido sobre ruido) con relieve |
| 10 | Physarum | Simulación de moho: 160.000 agentes que siguen su propio rastro |
