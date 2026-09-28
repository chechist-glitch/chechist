# 30 imágenes, 30 estilos

Cada imagen es una página HTML (`piezas/`) que se fotografía con Chromium y se guarda en `salida/` (1080×1350, formato vertical de Instagram).

```bash
node render.mjs          # renderiza todas + hoja de contactos
node render.mjs 07       # solo las que contengan "07" en el nombre
```

Todo es determinista: el azar va con semilla (`assets/lib.js`), así que cada pieza sale igual siempre. Cambia la semilla de `rng(...)` y sale otra versión.

| # | Pieza | Técnica |
|---|-------|---------|
| 01 | Cartel suizo | CSS puro, rejilla y `mix-blend-mode` |
| 02 | Bauhaus de barrio | CSS: formas geométricas colocadas al azar |
| 03 | Azulejo generativo | SVG con simetría de 8 ejes |
| 04 | Viento de Levante | Canvas: campo de flujo con ruido |
| 05 | Almería 86 | CSS: synthwave con perspectiva 3D |
| 06 | Atardecer en Cádiz | Arte ASCII calculado carácter a carácter |
| 07 | Pueblo blanco | Pixel art con tramado |
| 08 | Fractal de Julia | Shader GLSL (WebGL) |
| 09 | Naranjas del futuro | Three.js con materiales físicos |
| 10 | Feria del libro raro | Risografía: dos tintas, semitono y grano |
| 11 | Error 404 | Glitch con CSS |
| 12 | Brutalista | HTML crudo de 1995 |
| 13 | Sierra Nevada | Curvas de nivel con marching squares |
| 14 | El Chechist Diario | Maquetación en columnas + semitono en Canvas |
| 15 | Bar Manolo | Neón con `text-shadow` |
| 16 | Aceitunas | Circle packing |
| 17 | Rosetón | Diagrama de Voronoi píxel a píxel |
| 18 | Mijas | Proyección isométrica en SVG |
| 19 | Terminal | Maqueta de terminal con CSS |
| 20 | El olivo | Árbol fractal recursivo |
| 21 | El laberinto | Azulejos de Truchet |
| 22 | Respira | Gradientes borrosos + grano de película |
| 23 | Guadalquivir | Líneas de cresta tipo Joy Division |
| 24 | El Quillo | Carta de tarot ilustrada en SVG |
| 25 | chechist | Texto convertido en partículas |
| 26 | Memphis | Patrón años 80 en SVG |
| 27 | Botijo | Plano técnico en SVG |
| 28 | Ticket del bar | CSS con borde dentado por máscara |
| 29 | Caleidoscopio | Canvas: cuña reflejada 16 veces |
| 30 | Coral | Reacción-difusión de Gray-Scott |
