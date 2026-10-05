#!/bin/bash
# Versiones en vídeo de las dos piezas de ffmpeg (49 y 50): 10 s a 720×900.
# 49: zoom de verdad hacia el valle del caballito de mar. 50: el juego de la vida evolucionando.
cd "$(dirname "$0")"
FUENTE=/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf
ENC="-c:v libx264 -preset slow -crf 26 -maxrate 1300k -bufsize 2600k -pix_fmt yuv420p -movflags +faststart"
ffmpeg -y -loglevel error -f lavfi \
  -i "mandelbrot=size=720x900:rate=24:start_x=-0.7436447860:start_y=0.1318252536:start_scale=0.012:end_scale=0.00008:end_pts=240:maxiter=3000:bailout=64:outer=normalized_iteration_count:inner=period" \
  -vf "format=rgb24,\
geq=r='255*(0.5+0.5*cos(6.2832*((r(X,Y)+g(X,Y)+b(X,Y))/765*2.2+0.00)))':g='255*(0.5+0.45*cos(6.2832*((r(X,Y)+g(X,Y)+b(X,Y))/765*2.2+0.10)))':b='255*(0.45+0.45*cos(6.2832*((r(X,Y)+g(X,Y)+b(X,Y))/765*2.2+0.22)))',\
curves=all='0/0 0.35/0.25 0.7/0.8 1/1',unsharp=5:5:0.6,vignette=PI/5,\
drawtext=fontfile=$FUENTE:text='ffmpeg -f lavfi -i mandelbrot  ·  zoom ×150':x=28:y=h-36:fontsize=14:fontcolor=white@0.85:box=1:boxcolor=black@0.5:boxborderw=8" \
  -frames:v 240 $ENC hechos/c-49-ffmpeg-mandelbrot.tmp.mp4 && mv hechos/c-49-ffmpeg-mandelbrot.tmp.mp4 hechos/c-49-ffmpeg-mandelbrot.mp4 && echo "ok 49"
ffmpeg -y -loglevel error -f lavfi \
  -i "life=size=216x270:rate=24:ratio=0.18:seed=1993:rule=B3/S23:mold=40:life_color=#ffe066:death_color=#07081a:mold_color=#2a1a5e" \
  -vf "tmix=frames=12:weights='1 1 1 1 1 1 1 1 2 3 5 8',lagfun=decay=0.97,trim=start_frame=0:end_frame=240,setpts=PTS-STARTPTS,scale=720:900:flags=neighbor,\
drawgrid=w=10/3:h=10/3:t=1:c=black@0.25,\
drawtext=fontfile=$FUENTE:text='ffmpeg -f lavfi -i life  ·  B3/S23  ·  generación %{n}':x=28:y=h-36:fontsize=14:fontcolor=white@0.85:box=1:boxcolor=black@0.55:boxborderw=8" \
  -frames:v 240 $ENC hechos/c-50-ffmpeg-vida.tmp.mp4 && mv hechos/c-50-ffmpeg-vida.tmp.mp4 hechos/c-50-ffmpeg-vida.mp4 && echo "ok 50"
