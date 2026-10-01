# Vídeo base de 10 s a partir de la imagen fija: movimiento de cámara suave con
# interpolación subpíxel (sin los saltitos del zoompan de ffmpeg) y un acabado según el estilo.
# Uso: python camara.py <png> <mp4> [movimiento] [acabado] [semilla]
#   movimiento: acercar | alejar | subir | bajar | izquierda | derecha | girar
#   acabado:    nada | pelicula | brillo | crt
import sys, subprocess, math
import numpy as np, cv2

W, H, FPS, DUR = 720, 900, 24, 10
src, dst = sys.argv[1], sys.argv[2]
mov = sys.argv[3] if len(sys.argv) > 3 else "acercar"
acab = sys.argv[4] if len(sys.argv) > 4 else "nada"
sem = int(sys.argv[5]) if len(sys.argv) > 5 else 1
rs = np.random.default_rng(sem)

img = cv2.imread(src, cv2.IMREAD_COLOR)
img = cv2.resize(img, (1080, 1350), interpolation=cv2.INTER_AREA)
img = cv2.GaussianBlur(img, (0, 0), 0.6).astype(np.float32)
ih, iw = img.shape[:2]

# punto de interés: centro de masa de los bordes, sin alejarse mucho del centro
g = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_BGR2GRAY)
e = cv2.GaussianBlur(np.abs(cv2.Laplacian(g, cv2.CV_32F)), (0, 0), 25)
ys, xs = np.mgrid[0:ih, 0:iw]
cx = float((e * xs).sum() / e.sum()); cy = float((e * ys).sum() / e.sum())
cx = iw / 2 + 0.6 * (cx - iw / 2); cy = ih / 2 + 0.6 * (cy - ih / 2)

base = W / iw  # escala que encaja la imagen entera
def suave(t): return t * t * (3 - 2 * t)

def camara(t):
    u = suave(t)
    if mov == "acercar":   z, x, y, r = 1.0 + 0.22 * u, iw/2 + (cx - iw/2) * u, ih/2 + (cy - ih/2) * u, 0
    elif mov == "alejar":  z, x, y, r = 1.24 - 0.24 * u, cx + (iw/2 - cx) * u, cy + (ih/2 - cy) * u, 0
    elif mov == "subir":   z, x, y, r = 1.18, iw/2, ih/2 + ih * 0.075 * (1 - 2*u), 0
    elif mov == "bajar":   z, x, y, r = 1.18, iw/2, ih/2 - ih * 0.075 * (1 - 2*u), 0
    elif mov == "izquierda": z, x, y, r = 1.18, iw/2 + iw * 0.07 * (1 - 2*u), ih/2, 0
    elif mov == "derecha": z, x, y, r = 1.18, iw/2 - iw * 0.07 * (1 - 2*u), ih/2, 0
    else:                  z, x, y, r = 1.12 + 0.1 * u, iw/2, ih/2, -2.5 + 5 * u
    return z, x, y, r

# acabados
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
vin = 1 - 0.35 * (((xx / W - 0.5) ** 2 + (yy / H - 0.5) ** 2) * 2.2)
granos = [rs.normal(0, 1, (H, W)).astype(np.float32) for _ in range(6)]

ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                       "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-maxrate", "1100k", "-bufsize", "2200k",
                       "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst], stdin=subprocess.PIPE)
N = FPS * DUR
for f in range(N):
    t = f / (N - 1)
    z, x, y, r = camara(t)
    if acab == "pelicula":  # traqueteo de proyector
        x += math.sin(f * 1.7) * 1.2 + rs.normal(0, 0.5); y += math.sin(f * 0.9) * 1.5 + rs.normal(0, 0.5)
    s = base * z
    M = cv2.getRotationMatrix2D((x, y), r, s)
    M[0, 2] += W / 2 - x; M[1, 2] += H / 2 - y
    fr = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    if acab == "pelicula":
        fr *= (1 + rs.normal(0, 0.015)) * vin[..., None]
        fr += granos[f % 6][..., None] * 6
        if rs.random() < 0.08:  # una mota de polvo de vez en cuando
            cv2.circle(fr, (int(rs.random() * W), int(rs.random() * H)), int(1 + rs.random() * 3), (20, 20, 20), -1)
    elif acab == "brillo":  # reflejo que cruza en diagonal a mitad del vídeo
        p = (t - 0.35) / 0.35
        d = (xx + yy * 0.6) / (W + H * 0.6) - p
        fr += (np.exp(-(d / 0.06) ** 2) * 55)[..., None]
    elif acab == "crt":
        fr *= (0.88 + 0.12 * np.sin((yy + f * 3) * 0.9))[..., None]
        fr *= (0.97 + 0.03 * np.sin(yy / H * 6.28 - f * 0.2))[..., None]
    ff.stdin.write(np.clip(fr, 0, 255).astype(np.uint8).tobytes())
ff.stdin.close(); ff.wait()
