#!/usr/bin/env bash
# Genera toda la galería: generadores en Java, JShell y JavaScript, y luego
# las mezclas (filtros Java aplicados encima de otras imágenes).
set -euo pipefail
cd "$(dirname "$0")"

OUT=gallery
BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD"' EXIT
mkdir -p "$OUT"

J="java -Djava.awt.headless=true -cp $BUILD"

echo "Compilando Java..."
javac -d "$BUILD" *.java

echo "Generadores:"
$J FlowField          $OUT/01-campo-de-flujo.png 1234
$J Fractal            $OUT/02-fractal-julia.png
$J Attractor          $OUT/04-atractor-clifford.png
$J ReactionDiffusion  $OUT/06-reaccion-difusion.png
$J Marble             $OUT/07-marmol-warp.png
OUT=$OUT/10-truchet-regla30-jshell.png jshell -R-Djava.awt.headless=true truchet.jsh
node raymarch.js      $OUT/11-metal-liquido-javascript.png

echo "Mezclas:"
$J PixelSort    $OUT/02-fractal-julia.png          $OUT/03-fractal-derretido.png 0.08 1.0
$J Ascii        $OUT/04-atractor-clifford.png      $OUT/05-atractor-ascii.png
$J Halftone     $OUT/07-marmol-warp.png            $OUT/08-marmol-comic.png
$J StainedGlass $OUT/06-reaccion-difusion.png      $OUT/09-vitral-reaccion.png
$J Vhs          $OUT/11-metal-liquido-javascript.png $OUT/12-metal-liquido-vhs.png

$J ContactSheet $OUT $OUT/00-hoja-de-contactos.png 4

echo "Ilustración experimental:"
ILL=$OUT/ilustracion
mkdir -p "$ILL"
$J Bauhaus              $ILL/13-bauhaus.png
$J RisoFiguras          $ILL/14-riso-gente-rara.png
$J CubistFaces          $ILL/15-retratos-cubistas.png
$J Creatures            $ILL/16-bestiario.png
$J MetaphysicalSquare   $ILL/17-plaza-metafisica.png
$J DadaCollage          $OUT $ILL/18-collage-dada.png
$J ConstructivistPoster $ILL/19-cartel-constructivista.png
$J IsoCity              $ILL/20-ciudad-isometrica.png
$J ContactSheet         $ILL $ILL/00-hoja-de-contactos.png 4
echo "Listo."
