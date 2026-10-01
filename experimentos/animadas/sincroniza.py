# Copia a la galería el mejor vídeo disponible de cada imagen: la animación de verdad si ya está
# grabada (hechos/), si no el movimiento de cámara (base/). Escribe galeria/anim/lista.js con
# qué piezas tienen ya animación, para que la página lo diga.
import os, shutil, json
aqui = os.path.dirname(os.path.abspath(__file__))
gal = os.path.join(aqui, "..", "galeria")
dst = os.path.join(gal, "anim")
os.makedirs(dst, exist_ok=True)
claves = sorted(f[:-4] for f in os.listdir(os.path.join(gal, "img")) if f.endswith(".jpg"))
animados, cambiados = [], 0
for k in claves:
    h, b = os.path.join(aqui, "hechos", k + ".mp4"), os.path.join(aqui, "base", k + ".mp4")
    src = h if os.path.exists(h) and os.path.getsize(h) > 1000 else b
    if src == h:
        animados.append(k)
    out = os.path.join(dst, k + ".mp4")
    if not os.path.exists(out) or os.path.getsize(out) != os.path.getsize(src) or os.path.getmtime(out) < os.path.getmtime(src):
        shutil.copy2(src, out)
        cambiados += 1
with open(os.path.join(dst, "lista.js"), "w") as f:
    f.write("// Generado por animadas/sincroniza.py: piezas que ya tienen su animación de verdad\nconst ANIMADOS = new Set(" + json.dumps(animados) + ");\n")
print(f"{len(animados)} animados de {len(claves)}, {cambiados} copiados")
