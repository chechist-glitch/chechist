#!/bin/bash
# Cola de grabación: graba cada pieza animada (<serie>/<pieza>.html) cuyo vídeo falte o sea más viejo
# que el html. Se pueden lanzar varias a la vez (cada pieza se reserva con un candado).
# Da vueltas hasta que exista el fichero PARAR. Salida: hechos/<serie>-<pieza>.mp4
cd "$(dirname "$0")"
mkdir -p candados
while [ ! -f PARAR ]; do
  hizo=0
  for h in a/*.html b/*.html c/*.html d/*.html; do
    [ -f "$h" ] || continue
    s=$(dirname "$h"); p=$(basename "$h" .html); v="hechos/$s-$p.mp4"
    if [ ! -s "$v" ] || [ "$h" -nt "$v" ]; then
      mkdir "candados/$s-$p" 2>/dev/null || continue
      node grabar.mjs "animadas/$h" "$v.$$.tmp.mp4" && mv "$v.$$.tmp.mp4" "$v" && echo "ok $v $(date +%H:%M)"
      rm -f "$v.$$.tmp.mp4"; rmdir "candados/$s-$p"
      hizo=1
    fi
  done
  [ $hizo = 0 ] && sleep 20
done
