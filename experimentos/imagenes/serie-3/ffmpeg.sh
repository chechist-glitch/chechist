#!/bin/bash
# Las dos piezas de la serie 3 que no usan el navegador: se generan solo con filtros de ffmpeg.
# Uso: bash serie-3/ffmpeg.sh   (desde experimentos/imagenes)
set -e
cd "$(dirname "$0")/.."
mkdir -p salida-serie-3
FUENTE=/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf

# 49 · Mandelbrot del filtro "mandelbrot", recoloreado con curvas y un mapa de color en geq.
# Zoom en el valle del caballito de mar; el interior se pinta según el periodo de la órbita.
ffmpeg -y -loglevel error -f lavfi \
  -i "mandelbrot=size=1080x1350:start_x=-0.7436447860:start_y=0.1318252536:start_scale=0.00012:end_scale=0.00012:maxiter=6000:bailout=64:outer=normalized_iteration_count:inner=period" \
  -vf "format=rgb24,\
geq=r='255*(0.5+0.5*cos(6.2832*((r(X,Y)+g(X,Y)+b(X,Y))/765*2.2+0.00)))':g='255*(0.5+0.45*cos(6.2832*((r(X,Y)+g(X,Y)+b(X,Y))/765*2.2+0.10)))':b='255*(0.45+0.45*cos(6.2832*((r(X,Y)+g(X,Y)+b(X,Y))/765*2.2+0.22)))',\
curves=all='0/0 0.35/0.25 0.7/0.8 1/1',unsharp=5:5:0.8,vignette=PI/5,\
drawtext=fontfile=$FUENTE:text='ffmpeg -f lavfi -i mandelbrot  ·  x=-0.74364  y=0.13183  escala 0.00012':x=40:y=h-50:fontsize=20:fontcolor=white@0.85:box=1:boxcolor=black@0.5:boxborderw=10" \
  -frames:v 1 salida-serie-3/49-ffmpeg-mandelbrot.png

# 50 · Juego de la vida con el filtro "life": las células muertas dejan moho que se va apagando,
# se mezclan 12 generaciones seguidas (tmix) para ver la estela y se amplía sin suavizar.
ffmpeg -y -loglevel error -f lavfi \
  -i "life=size=216x270:rate=25:ratio=0.18:seed=1993:rule=B3/S23:mold=40:life_color=#ffe066:death_color=#07081a:mold_color=#2a1a5e" \
  -vf "tmix=frames=12:weights='1 1 1 1 1 1 1 1 2 3 5 8',\
lagfun=decay=0.97,select='eq(n\,420)',scale=1080:1350:flags=neighbor,\
drawgrid=w=5:h=5:t=1:c=black@0.35,\
drawtext=fontfile=$FUENTE:text='ffmpeg -f lavfi -i life  ·  B3/S23  ·  generación 420':x=40:y=h-50:fontsize=20:fontcolor=white@0.85:box=1:boxcolor=black@0.55:boxborderw=10" \
  -frames:v 1 salida-serie-3/50-ffmpeg-vida.png
echo "  ✓ 49 y 50 generadas con ffmpeg"
