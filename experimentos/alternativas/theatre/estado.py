# Genera el estado de Theatre.js (lo que normalmente guarda su editor visual al poner keyframes):
# pistas con fotogramas clave bezier para la cámara, la luz y el color de los farolillos.
import json

def pista(nombre, claves):
    kf = []
    for i, (t, v) in enumerate(claves):
        kf.append({"id": f"{nombre}{i}", "position": t, "connectedRight": i < len(claves) - 1, "handles": [0.5, 1, 0.5, 0], "type": "bezier", "value": v})
    return {"type": "BasicKeyframedTrack", "__debugName": nombre, "keyframes": kf}

pistas = {
    '["camara","x"]': [(0, 9), (3, 2), (6, -6), (9, 0)],
    '["camara","y"]': [(0, 1.2), (3, 3.5), (6, 2), (9, 6)],
    '["camara","z"]': [(0, 9), (3, 7), (6, 6), (9, 0.01)],
    '["luz","intensidad"]': [(0, 0.2), (2, 2.5), (5, 1.2), (9, 3)],
    '["farolillos","giro"]': [(0, 0), (9, 6.28)],
    '["farolillos","altura"]': [(0, 6), (2.5, 3.2), (9, 3.4)],
    '["cielo","tono"]': [(0, 0.62), (4.5, 0.75), (9, 0.95)],
}
tracks = {}
ids = {}
for i, (ruta, claves) in enumerate(pistas.items()):
    obj, prop = json.loads(ruta)
    tid = f"t{i}"
    tracks.setdefault(obj, {"trackData": {}, "trackIdByPropPath": {}})
    tracks[obj]["trackData"][tid] = pista(f"{obj}.{prop}", claves)
    tracks[obj]["trackIdByPropPath"][json.dumps([prop])] = tid

estado = {
    "sheetsById": {"Escena": {"staticOverrides": {"byObject": {}}, "sequence": {"subUnitsPerUnit": 30, "length": 9, "type": "PositionalSequence", "tracksByObject": tracks}}},
    "definitionVersion": "0.4.0",
    "revisionHistory": ["feria2026"],
}
json.dump(estado, open("estado.json", "w"), indent=1)
print("ok")
