# Las Horas Muertas

Sitios liminales del sur: momentos concretos que se han quedado parados.

| Nivel | Sitio | Estado |
| --- | --- | --- |
| 01 | Las Tres de la Tarde | Frame en `tres-de-la-tarde/` |
| — | El Real a las 7 de la mañana | Idea |
| — | La Madrugá | Idea |
| — | El Olivar | Idea |

## Las Tres de la Tarde

Un pueblo blanco en agosto, a las 15:00, para siempre.

Composición de [HyperFrames](https://hyperframes.heygen.com) (16 s, 1920×1080), hecha entera en SVG y GSAP, con audio de chicharras sintetizado con ffmpeg.

- El letrero de la farmacia siempre marca las 15:00. La temperatura, en cambio, no para de subir.
- La cortina de tiras se mueve aunque por la puerta no haya pasado nadie.
- La silla echa la sombra hacia el lado que no toca.
- Hay una persiana que sube a tirones, se queda un rato abierta y luego cae de golpe.

```bash
cd tres-de-la-tarde
npx hyperframes preview                      # previsualizar
npx hyperframes render -o renders/out.mp4    # renderizar
```

El render está en `tres-de-la-tarde/renders/las-tres-de-la-tarde.mp4`.
