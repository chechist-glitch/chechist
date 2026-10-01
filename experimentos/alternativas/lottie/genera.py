# Lottie: animación vectorial en un JSON (el formato que exportan After Effects o Cavalry).
# Aquí el JSON se escribe con código: un abanico flamenco que se abre varilla a varilla,
# lunares que saltan y un sol que late. Luego lottie-web lo reproduce (y lo capturamos).
import json, math

FPS, DUR, W, H = 30, 6, 1280, 720
N = FPS * DUR

def k(t, v, e=(0.33, 0.0, 0.2, 1.0)):
    # fotograma clave con curva de aceleración (easing)
    return {"t": t, "s": v if isinstance(v, list) else [v], "o": {"x": [e[0]], "y": [e[1]]}, "i": {"x": [e[2]], "y": [e[3]]}}

def anim(*claves):
    return {"a": 1, "k": list(claves)}

def fijo(v):
    return {"a": 0, "k": v}

def capa(nombre, formas, pos, rot=fijo(0), esc=fijo([100, 100, 100]), opa=fijo(100), ancla=fijo([0, 0, 0]), ip=0):
    return {"ty": 4, "nm": nombre, "ip": ip, "op": N, "st": 0, "ks": {"p": pos, "r": rot, "s": esc, "o": opa, "a": ancla}, "shapes": formas}

def grupo(*items):
    return {"ty": "gr", "it": list(items) + [{"ty": "tr", "p": fijo([0, 0]), "a": fijo([0, 0]), "s": fijo([100, 100]), "r": fijo(0), "o": fijo(100)}]}

def relleno(rgb):
    return {"ty": "fl", "c": fijo([*rgb, 1]), "o": fijo(100)}

def trazo(rgb, w):
    return {"ty": "st", "c": fijo([*rgb, 1]), "o": fijo(100), "w": fijo(w), "lc": 2, "lj": 2}

def elipse(w, h, p=(0, 0)):
    return {"ty": "el", "p": fijo(list(p)), "s": fijo([w, h])}

def rect(w, h, r=0, p=(0, 0)):
    return {"ty": "rc", "p": fijo(list(p)), "s": fijo([w, h]), "r": fijo(r)}

def camino(puntos, cerrado=True):
    return {"ty": "sh", "ks": fijo({"c": cerrado, "v": puntos, "i": [[0, 0]] * len(puntos), "o": [[0, 0]] * len(puntos)})}

def hex2(c):
    return [int(c[i:i + 2], 16) / 255 for i in (1, 3, 5)]

capas = []
# Fondo
capas.append(capa("fondo", [grupo(rect(W, H), relleno(hex2("#1b1030")))], fijo([W / 2, H / 2, 0])))
# Sol que late detrás
capas.append(capa("sol", [grupo(elipse(260, 260), relleno(hex2("#ffb547")))], fijo([W / 2, 300, 0]),
                  esc=anim(*[k(t, [100 + (8 if (t // 15) % 2 else 0)] * 3) for t in range(0, N + 1, 15)]), opa=fijo(55)))
# Abanico: 15 varillas que giran desde cerrado hasta abierto, cada una con su tela
NV = 15
colores = ["#d7263d", "#f7e8c4"]
for i in range(NV):
    ang_fin = -80 + i * (160 / (NV - 1))
    ini = 18 + i * 3
    tela = grupo(camino([[0, 0], [-34, -330], [34, -330]]), relleno(hex2(colores[i % 2])))
    varilla = grupo(rect(6, 330, 3, (0, -165)), relleno(hex2("#5a3418")))
    lunar = grupo(elipse(22, 22, (0, -250)), relleno(hex2("#1b1030" if i % 2 else "#d7263d")))
    capas.append(capa(f"varilla{i}", [lunar, varilla, tela], fijo([W / 2, 620, 0]),
                      rot=anim(k(0, 0), k(ini, 0), k(ini + 24, ang_fin, (0.2, 0.0, 0.1, 1.0)), k(N - 30, ang_fin), k(N - 6, ang_fin * 1.04))))
# Clavillo del abanico
capas.append(capa("clavo", [grupo(elipse(34, 34), relleno(hex2("#e2b04a")))], fijo([W / 2, 620, 0])))
# Lunares que saltan en la parte de abajo
for j in range(9):
    x = 140 + j * 125
    capas.append(capa(f"lunar{j}", [grupo(elipse(36, 36), relleno(hex2("#f7e8c4" if j % 2 else "#d7263d")))],
                      anim(*[k(t, [x, 690 - (40 if ((t // 10) + j) % 2 else 0), 0]) for t in range(0, N + 1, 10)])))
data = {"v": "5.9.0", "fr": FPS, "ip": 0, "op": N, "w": W, "h": H, "nm": "abanico", "ddd": 0, "assets": [], "layers": list(reversed(capas))}
json.dump(data, open("abanico.json", "w"))
print("capas:", len(capas), "bytes:", len(json.dumps(data)))
