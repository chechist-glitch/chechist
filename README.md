# chechist
life

## Proyectos

- [`simulador-robot-tatuador/`](simulador-robot-tatuador/index.html): banco de pruebas virtual en 3D de un brazo robot que tatúa sobre un cuerpo humano entero tumbado en una camilla. El cuerpo es una sola malla lisa con esqueleto de 21 huesos que se puede articular (cuello, espalda, cintura, hombros, codos, muñecas, caderas, rodillas y tobillos), y lleva un mapa de piel con dureza, grosor, cuánto se estira, sequedad, dolor, vello y cuánto aguanta la tinta en cada zona. Se puede tatuar en cualquier sitio: el cliente se coloca boca arriba, boca abajo o de lado según la zona, y el robot va sobre un carro con columna que se pone al lado. Cambia de cartucho (RL, RS, M1 y RM) en una estación con horquillas, carga tintas de colores y se enjuaga entre colores, hace líneas, rellenos sólidos, puntillismo y sombras (por presión a medio péndulo o con diluciones de gris), letras góticas y caligrafía con el texto que quieras, y ajusta la profundidad según la piel. El tatuaje se arrastra por el cuerpo con tiradores, al terminar se puede quitar la plantilla para ver el resultado, y un corte de la piel enseña hasta qué capa ha llegado cada pinchazo. Se abre en el navegador, sin instalar nada (necesita internet para cargar el motor 3D).
  - [`version-antebrazo.html`](simulador-robot-tatuador/version-antebrazo.html): la versión anterior, solo con un antebrazo.
  - [`version-2d.html`](simulador-robot-tatuador/version-2d.html): la primera versión, en 2D y vista desde arriba.
