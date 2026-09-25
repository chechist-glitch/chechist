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

## Serie 2: ilustración experimental (`gallery/ilustracion/`)

| Imagen | Técnica |
|---|---|
| 13 bauhaus | rejilla de baldosas 1x1, 2x2 y 3x3 con formas geométricas (`Bauhaus`) |
| 14 riso gente rara | personajes surrealistas impresos en risografía de 3 tintas con mal registro (`RisoFiguras`) |
| 15 retratos cubistas | seis caras a lo Picasso generadas al azar (`CubistFaces`) |
| 16 bestiario | 18 bichos con nombre inventado por sílabas (`Creatures`) |
| 17 plaza metafísica | De Chirico con una mini cámara 3D para la perspectiva (`MetaphysicalSquare`) |
| 18 collage dadá | papel rasgado recortado de la serie 1 + letras de anónimo (`DadaCollage`) |
| 19 cartel constructivista | homenaje a El Lissitzky en riso rojo y negro (`ConstructivistPoster`) |
| 20 ciudad isométrica | bloques pastel con agua, parques y personitas (`IsoCity`) |

Todas aceptan una semilla como último argumento: con otro número sale otra ilustración.
