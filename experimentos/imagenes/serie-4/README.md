# Serie 4: que parezcan de verdad

En vez de dibujar el estilo, se simula el material y luego se "fotografía". Salen en `../salida-serie-4/`.

```bash
node render.mjs serie-4
```

`assets/analogico.js` tiene las piezas de esa simulación:

- `A.relieve` + `A.iluminar`: relieve de papel o de pasta iluminado con luz rasante (y brillo de aceite o esmalte).
- `A.colocar`: pone la obra en perspectiva sobre una mesa o una pared con homografía, sombra y curvatura.
- `A.pelicula`: halo rojo en las luces, aberración cromática, curva de película, viraje, grano en racimos, viñeta, polvo y pelos.
- `A.mesaMadera`, `A.pared`: superficies para la foto.

| # | Pieza | Qué se simula |
|---|-------|---------------|
| 01 | Acuarela de Vejer | Difusión del pigmento en lo mojado, borde oscuro al secar, granulación, blancos reservados, mezcla por absorción, boceto a lápiz y cinta de carrocero |
| 02 | Óleo con empaste | Cada pincelada deja color y relieve; lienzo con trama; luz rasante y brillo de aceite |
| 03 | Carboncillo | El carbón solo se agarra a las crestas del papel; difuminos, líneas de encaje, borrones |
| 04 | Polaroids | Química de película instantánea sobre renders de la serie 2, marcos y letra a rotulador |
| 05 | Azulejos de Triana | Pigmento embolsado, craquelado (Voronoi), desconchones, esmalte con brillo |
| 06 | Bordado | Puntada de satén hilo a hilo con brillo de seda, nudos franceses, lino y bastidor |
| 07 | Boli en cuaderno | La bola salta en el grano del papel, pegotes, rayado, letra a mano |
| 08 | Linograbado | Dos planchas con desregistro, carga irregular del rodillo, gubias, papel con barbas |
