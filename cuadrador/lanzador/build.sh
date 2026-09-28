#!/bin/sh
# Genera CuadradorDeCarteles.exe (Windows, 64 bits) con cuadrador.html dentro.
# Requisitos: Go. Para el icono y los datos de versión, go-winres
# (go install github.com/tc-hib/go-winres@latest); sin él sale sin icono.
set -e
cd "$(dirname "$0")"
python3 ../build_standalone.py
cp ../cuadrador.html cuadrador.html
if command -v go-winres >/dev/null 2>&1; then
  go-winres simply --arch amd64 --icon icono.png --manifest gui \
    --product-name "Cuadrador de carteles" \
    --file-description "Cuadrador de carteles" \
    --original-filename CuadradorDeCarteles.exe \
    --product-version 1.0.0.0 --file-version 1.0.0.0
fi
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath \
  -ldflags "-s -w -H=windowsgui" -o CuadradorDeCarteles.exe .
ls -l CuadradorDeCarteles.exe
