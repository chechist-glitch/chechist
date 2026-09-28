# Cuadrador de carteles

Pasa carteles de producto (renders de miniaturas sobre fondo liso) de formato
vertical (4:5, 2:3…) a cuadrado 1:1 **sin IA generativa**. Cada pieza se
recorta con su reflejo y se recoloca tal cual: no se redibuja ni se reescala
ningún píxel de los renders.

Nació para los carteles de una tienda de STL de escenografía: la web donde se
venden pide imágenes cuadradas y ChatGPT se inventaba el fondo, los reflejos y
los detalles de las piezas.

## Cómo se usa

1. Abre `index.html` en el navegador (Chrome, Edge, Firefox o Safari). No hay
   que instalar nada y nada sale de tu ordenador: todo se procesa en local.
2. Arrastra tus carteles a **Añadir carteles**. Puedes soltar varios a la vez;
   se analizan en segundo plano (unos segundos cada uno).
3. Elige cómo recolocar:
   - **Abrir composición**: mantiene tu distribución y la abre hacia los
     lados. Es la opción por defecto para carteles 4:5.
   - **En filas**: ordena las piezas en filas por tamaño, respetando más o
     menos el orden original. Por defecto en carteles muy alargados.
4. Retoca a mano lo que quieras:
   - Arrastra las piezas. Tienen imanes al centro del cartel y a la línea de
     suelo de las demás piezas (mantén Alt para soltarlos).
   - Flechas: 1 px; con Mayús, 10 px.
   - Mayús + clic para seleccionar varias. **Unir** hace que se muevan juntas;
     **Separar** las suelta; **Ocultar** (o Supr) las quita del cartel.
   - Ctrl + Z / Ctrl + Mayús + Z para deshacer y rehacer.
   - **Ver recortes** enseña qué ha detectado como pieza (amarillo) y como
     logo o texto (azul).
5. Descarga en PNG (sin pérdidas) o JPG. Por defecto el lado del cuadrado es el
   lado largo del original (un 1279 × 1600 sale a 1600 × 1600); también puedes
   sacarlo a 1080, 1200, 1500, 2000 o 3000 px. **Descargar todos** genera un
   .zip con todos los carteles.

## Cómo funciona

1. **Fondo.** Calcula el fondo del cartel a partir de los píxeles que no
   tienen nada encima (degradado, rayos de luz, franja del título) y lo
   rellena por debajo de cada elemento. Cerca de bordes horizontales nítidos,
   como la franja del título, rellena fila a fila para que la franja siga
   recta y con su tono bajo las letras.
2. **Elementos.** Todo lo que se separa claramente del fondo es un elemento.
   Lo blanco o turquesa se agrupa en logo, título y sello; lo demás son piezas.
   Cada pieza se queda con su zona de reflejo y sombra, que llega lejos hacia
   abajo y poco hacia los lados y hacia arriba.
3. **Recortes.** Cada elemento se guarda en dos capas:
   - lo sólido, con el color original exacto;
   - lo suave (reflejos, sombras y bordes con antialias), como transparencia
     calculada contra el fondo, para que se funda igual en cualquier zona del
     fondo nuevo.
4. **Cuadrado.** Estira el fondo hacia los lados sin tocar la franja central
   donde van el logo, el título y el sello, y coloca encima las piezas. Primero
   se pintan todos los reflejos y luego los objetos, así un reflejo nunca tapa
   una pieza.

Si exportas a otro tamaño se reescala la imagen final completa (Lanczos), nunca
las piezas por separado.

## Limitaciones

- Pensado para fondos lisos o con degradados suaves. Con fondos fotográficos o
  muy texturizados no funciona bien.
- Las piezas que se tocan en el cartel original se mueven juntas.
- Los textos que no son blancos ni turquesa pueden detectarse como piezas; se
  pueden recolocar a mano.
- Hasta unos 12 megapíxeles por cartel (de sobra para 2400 × 3000).

## Archivos

- `index.html`: la página.
- `app.js`: interfaz (lista de carteles, vista previa, arrastre, exportación y
  el cartel de ejemplo, que se dibuja por código).
- `engine.js`: motor de imagen (fondo, recortes, colocación automática y
  composición). Se usa también como Web Worker para no bloquear la página.
