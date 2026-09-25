# java-frames

Arte generativo con Java, JShell y JavaScript, sin librerías externas.

```
./render-all.sh     # genera toda la galería en gallery/
```

| Imagen | Técnica | Lenguaje |
|---|---|---|
| 01 campo de flujo | partículas siguiendo ruido Perlin | Java (`FlowField`) |
| 02 fractal julia | conjunto de Julia + orbit trap | Java (`Fractal`) |
| 03 fractal derretido | 02 + pixel sorting | Java (`PixelSort`) |
| 04 atractor clifford | sistema caótico, 40M iteraciones | Java (`Attractor`) |
| 05 atractor ascii | 04 convertido a letras | Java (`Ascii`) |
| 06 reacción-difusión | Gray-Scott con parámetros variables | Java (`ReactionDiffusion`) |
| 07 mármol | domain warping de ruido | Java (`Marble`) |
| 08 mármol cómic | 07 en trama CMYK de imprenta | Java (`Halftone`) |
| 09 vitral | 06 partido en celdas de Voronoi | Java (`StainedGlass`) |
| 10 truchet + regla 30 | baldosas de neón sobre autómata celular | JShell (`truchet.jsh`) |
| 11 metal líquido | raymarcher 3D con SDFs, PNG escrito a mano | JavaScript (`raymarch.js`) |
| 12 metal líquido VHS | 11 pasado por filtro de cinta vieja | JavaScript + Java (`Vhs`) |
