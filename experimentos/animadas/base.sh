#!/bin/bash
# Genera los vídeos base que falten (se puede relanzar: salta los hechos)
cd "$(dirname "$0")"
while read src dst mov acab sem; do
  [ -s "$dst" ] && continue
  echo "$src $dst $mov $acab $sem"
done < lista-base.txt | xargs -P 2 -L 1 sh -c '/root/venv-alt/bin/python camara.py "$0" "$1.tmp.mp4" "$2" "$3" "$4" && mv "$1.tmp.mp4" "$1" && echo "ok $1"'
echo fin
