# Cuadrador de carteles

Pasa carteles de producto (renders de miniaturas sobre fondo liso) de un
formato a otro (de 4:5 o 2:3 a cuadrado, banner 16:9, historia 9:16…) **sin IA
generativa**. Cada pieza se recorta con su reflejo y se recoloca tal cual: al
100 % no se redibuja ni se reescala ningún píxel de los renders.

Nació para los carteles de una tienda de STL de escenografía: la web donde se
venden pide imágenes cuadradas y ChatGPT se inventaba el fondo, los reflejos y
los detalles de las piezas.

## Cómo se usa

1. Abre `cuadrador.html` con doble clic (o arrástralo a Chrome, Edge, Firefox
   o Safari). Es un solo archivo con todo dentro, así que se puede pasar por
   WhatsApp o correo tal cual. No hay que instalar nada y nada sale de tu
   ordenador: todo se procesa en local.
2. Arrastra tus carteles a **Añadir carteles**. Puedes soltar varios a la vez;
   se analizan en segundo plano (unos segundos cada uno).
3. Elige el **formato final**: 1:1, 4:5, 3:4, 2:3, 9:16, 4:3, 3:2, 16:9, el
   del original u **Otro** (cualquier proporción, p. ej. 5:4). El lienzo es el
   rectángulo más pequeño de esa forma en el que cabe el cartel entero, así que
   nada se recorta. Cada cartel recuerda su colocación en cada formato.
4. Elige cómo recolocar:
   - **Abrir composición**: mantiene tu distribución y la abre hacia el lado
     que crece. Por defecto cuando el lienzo crece poco (p. ej. 4:5 → 1:1).
   - **En filas**: ordena las piezas en filas por tamaño, respetando más o
     menos el orden original. Por defecto cuando crece mucho (2:3 → 1:1,
     banners, historias). Puedes forzar el número de filas.
5. Ajusta el **tamaño de las piezas** (50–150 %) si quedan pequeñas o grandes
   en el formato elegido. Al 100 % son los píxeles originales; con otro valor
   se remuestrean con un filtro de calidad (Mitchell, con alfa premultiplicado,
   sin halos en los bordes).
6. Retoca a mano lo que quieras:
   - Arrastra las piezas. Tienen imanes al centro del cartel y a la línea de
     suelo de las demás piezas (mantén Alt para soltarlos).
   - Flechas: 1 px; con Mayús, 10 px.
   - **+** y **−** agrandan o encogen la selección desde su base; **0** la deja
     al 100 %.
   - Mayús + clic para seleccionar varias. **Unir** hace que se muevan juntas;
     **Separar** las suelta; **Ocultar** (o Supr) las quita del cartel.
   - Ctrl + Z / Ctrl + Mayús + Z para deshacer y rehacer.
   - **Ver recortes** enseña qué ha detectado como pieza (amarillo) y como
     logo o texto (azul).
7. Exporta:
   - **Lado largo**: original (sin reescalar), 1080, 1200, 1500, 1600, 2000,
     2400, 3000, 4000 o el que escribas. El lado corto sale de la proporción
     exacta del formato (9:16 a 1920 da 1080 × 1920).
   - **PNG** (sin pérdidas), **JPG** o **WEBP**, con calidad ajustable.
   - **Descargar este**, **Descargar todos** (.zip con todos los carteles en el
     formato actual) o **Todos en estos formatos**: un .zip con una carpeta por
     formato marcado.

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
4. **Formato nuevo.** Estira el fondo en el eje que crece. A lo ancho no toca
   la franja central donde van el logo, el título y el sello; a lo alto deja
   la cabecera arriba y el sello abajo y estira solo la zona de las piezas.
   Luego coloca las piezas encima: primero se pintan todos los reflejos y
   después los objetos, así un reflejo nunca tapa una pieza.

El tamaño de exportación reescala la imagen final completa (Lanczos). Las
piezas solo se remuestrean por separado si cambias su tamaño.

## Limitaciones

- Pensado para fondos lisos o con degradados suaves. Con fondos fotográficos o
  muy texturizados no funciona bien.
- Las piezas que se tocan en el cartel original se mueven juntas.
- Los textos que no son blancos ni turquesa pueden detectarse como piezas; se
  pueden recolocar a mano.
- Hasta unos 12 megapíxeles por cartel (de sobra para 2400 × 3000).

## Ejecutable para Windows

`lanzador/` genera `CuadradorDeCarteles.exe` (1,5 MB) con `./build.sh`
(necesita Go; con `go-winres` instalado le pone icono y datos de versión).
Al abrirlo guarda `cuadrador.html` en `%LOCALAPPDATA%\CuadradorDeCarteles`
y lo abre en Chrome, o en el navegador por defecto si no hay Chrome. No
instala nada ni se queda abierto.

Como no está firmado, la primera vez Windows avisa con "Windows protegió su
PC": hay que pulsar **Más información → Ejecutar de todas formas**. En Mac o
Linux, usa directamente `cuadrador.html`.

## Archivos

- `cuadrador.html`: la herramienta en un solo archivo, lista para abrir.
  Se genera con `python3 build_standalone.py` a partir de los tres de abajo;
  regénerala si los cambias.
- `index.html`: la página.
- `app.js`: interfaz (lista de carteles, vista previa, arrastre, exportación y
  el cartel de ejemplo, que se dibuja por código).
- `engine.js`: motor de imagen (fondo, recortes, colocación automática y
  composición). Se usa también como Web Worker para no bloquear la página.
- `lanzador/`: el ejecutable de Windows (código en Go, icono y script).
