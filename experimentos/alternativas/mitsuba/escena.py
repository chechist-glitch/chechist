# Mitsuba 3: renderizador de investigación con luz física de verdad. Escena: una caja de Cornell
# andaluza (paredes de cal y almagre) con una esfera de vidrio dispersivo, otra de oro y una de
# cerámica; la luz atraviesa el vidrio y dibuja cáusticas en el suelo. Trazado de caminos
# espectral con muestreo de luz; la cámara gira despacio (36 fotogramas).
# Render: python escena.py
import os
import numpy as np
import mitsuba as mi

mi.set_variant("llvm_ad_spectral")
T = mi.ScalarTransform4f

def escena(angulo):
    ojo = [5.6 * np.sin(angulo), 0.9, 5.6 * np.cos(angulo)]
    return mi.load_dict({
        "type": "scene",
        "integrator": {"type": "path", "max_depth": 10},
        "sensor": {
            "type": "perspective", "fov": 40,
            "to_world": T().look_at(origin=ojo, target=[0, -0.15, 0], up=[0, 1, 0]),
            "film": {"type": "hdrfilm", "width": 640, "height": 360, "rfilter": {"type": "gaussian"}},
            "sampler": {"type": "independent", "sample_count": 96},
        },
        "cal": {"type": "diffuse", "id": "cal", "reflectance": {"type": "rgb", "value": [0.82, 0.8, 0.74]}},
        "suelo": {"type": "rectangle", "to_world": T().translate([0, -1, 0]).rotate([1, 0, 0], -90).scale(4), "bsdf": {"type": "diffuse", "reflectance": {"type": "checkerboard", "color0": {"type": "rgb", "value": [0.55, 0.22, 0.12]}, "color1": {"type": "rgb", "value": [0.85, 0.82, 0.74]}, "to_uv": mi.ScalarTransform4f().scale([8, 8, 1])}}},
        "fondo": {"type": "rectangle", "to_world": T().translate([0, 1, -2]).scale(4), "bsdf": {"type": "ref", "id": "cal"}},
        "izq": {"type": "rectangle", "to_world": T().translate([-2.2, 1, 0]).rotate([0, 1, 0], 90).scale(4), "bsdf": {"type": "diffuse", "reflectance": {"type": "rgb", "value": [0.6, 0.18, 0.1]}}},
        "der": {"type": "rectangle", "to_world": T().translate([2.2, 1, 0]).rotate([0, 1, 0], -90).scale(4), "bsdf": {"type": "diffuse", "reflectance": {"type": "rgb", "value": [0.12, 0.25, 0.55]}}},
        "luz": {"type": "rectangle", "to_world": T().translate([0.6, 2.4, 0.4]).rotate([1, 0, 0], 90).scale(0.35), "emitter": {"type": "area", "radiance": {"type": "rgb", "value": [60, 52, 40]}}},
        "cielo": {"type": "constant", "radiance": {"type": "rgb", "value": [0.06, 0.07, 0.09]}},
        "vidrio": {"type": "sphere", "center": [-0.25, -0.35, 0.35], "radius": 0.65, "bsdf": {"type": "dielectric", "int_ior": "bk7", "ext_ior": "air"}},
        "oro": {"type": "sphere", "center": [0.95, -0.62, -0.35], "radius": 0.38, "bsdf": {"type": "roughconductor", "material": "Au", "alpha": 0.08}},
        "ceramica": {"type": "sphere", "center": [-1.25, -0.7, -0.6], "radius": 0.3, "bsdf": {"type": "plastic", "diffuse_reflectance": {"type": "rgb", "value": [0.08, 0.2, 0.55]}, "int_ior": 1.5}},
    })

os.makedirs("frames", exist_ok=True)
N = int(os.environ.get("N", 36))
for f in range(N):
    img = mi.render(escena(-0.35 + 0.7 * f / max(1, N - 1)), spp=int(os.environ.get("SPP", 128)))
    bmp = mi.Bitmap(img).convert(mi.Bitmap.PixelFormat.RGB, mi.Struct.Type.UInt8, srgb_gamma=True)
    bmp.write(f"frames/f{f:03d}.png")
    print(f, flush=True)
