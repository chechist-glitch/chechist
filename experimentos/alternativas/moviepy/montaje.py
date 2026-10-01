# MoviePy: montaje editado con código. Las 8 imágenes "analógicas" con zoom lento (Ken Burns),
# fundidos encadenados, rótulos y una guitarra sintetizada con Karplus–Strong tocando
# la cadencia andaluza (Lam – Sol – Fa – Mi).
# Render: python montaje.py
import glob
import numpy as np
from moviepy import ImageClip, TextClip, CompositeVideoClip, ColorClip, vfx
from moviepy.audio.AudioClip import AudioArrayClip

W, H, FPS = 720, 900, 30
DUR, FUNDE = 3.2, 0.8
FUENTE = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
FUENTE2 = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
imagenes = sorted(glob.glob("../../imagenes/salida-serie-4/0*.png"))
nombres = ["Acuarela", "Óleo con empaste", "Carboncillo", "Polaroids", "Azulejos de Triana", "Bordado", "Boli bic", "Linograbado"]

clips = []
t = 0
for i, (ruta, nombre) in enumerate(zip(imagenes, nombres)):
    zoom_ini, zoom_fin = (1.0, 1.12) if i % 2 == 0 else (1.12, 1.0)
    base = ImageClip(ruta).resized(width=W)
    img = (base.with_duration(DUR)
           .resized(lambda tt, a=zoom_ini, b=zoom_fin: a + (b - a) * tt / DUR)
           .with_position("center")
           .with_start(t))
    if i > 0:
        img = img.with_effects([vfx.CrossFadeIn(FUNDE)])
    rotulo = (TextClip(font=FUENTE, text=nombre, font_size=44, color="white", stroke_color="black", stroke_width=2, margin=(20, 10))
              .with_duration(DUR - 0.6).with_start(t + 0.4).with_position(("center", H - 140))
              .with_effects([vfx.CrossFadeIn(0.4), vfx.CrossFadeOut(0.4)]))
    clips += [img, rotulo]
    t += DUR - FUNDE
total = t + FUNDE
titulo = (TextClip(font=FUENTE2, text="Montado con MoviePy", font_size=26, color="#f2e6c9", margin=(14, 8), bg_color="#00000088")
          .with_duration(total).with_position((24, 24)))
video = CompositeVideoClip([ColorClip((W, H), color=(20, 16, 12)).with_duration(total)] + clips + [titulo], size=(W, H))

# Guitarra: Karplus–Strong (una cuerda = ruido que pasa por un retardo con filtro paso bajo)
SR = 44100
def cuerda(f, dur, amp=0.4):
    n = int(SR * dur)
    p = int(SR / f)
    buf = np.random.uniform(-1, 1, p)
    out = np.zeros(n)
    for k in range(n):
        out[k] = buf[k % p]
        buf[k % p] = 0.5 * (buf[k % p] + buf[(k + 1) % p]) * 0.996
    return out * amp

notas = {"La": 110.0, "Do": 130.81, "Mi": 82.41, "Sol": 98.0, "Si": 123.47, "Re": 146.83, "Fa": 87.31, "Sol#": 103.83}
acordes = [["La", "Mi", "La", "Do", "Mi"], ["Sol", "Re", "Sol", "Si", "Re"], ["Fa", "Do", "Fa", "La", "Do"], ["Mi", "Si", "Mi", "Sol#", "Si"]]
audio = np.zeros(int(SR * total) + SR)
paso = total / 8
for i in range(8):
    acorde = acordes[i % 4]
    ini = int(i * paso * SR)
    for j, nom in enumerate(acorde):
        f = notas[nom] * (2 if j > 1 else 1)
        s = cuerda(f, 2.6, 0.22)
        o = ini + int(j * 0.035 * SR)  # rasgueo: cada cuerda un poco después
        audio[o:o + len(s)] += s[: len(audio) - o]
audio = audio[: int(SR * total)]
audio = audio / np.max(np.abs(audio)) * 0.8
video = video.with_audio(AudioArrayClip(np.stack([audio, audio], axis=1), fps=SR))
video.write_videofile("moviepy.mp4", fps=FPS, codec="libx264", audio_codec="aac", preset="medium", logger=None)
print("ok", total)
