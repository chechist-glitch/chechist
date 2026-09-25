#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Atardecer en tres lenguas
=========================

Ilustración 100 % procedural, sin ninguna IA generativa de imagen. Todo sale de
este fichero: matemáticas, ruido y unas cuantas decisiones de pintor.

Tres lenguajes metidos en la misma escena:

  · 3D     -> raytracer propio (numba): esfera de cromo que se voxeliza, cubos que
              salen volando, palmeras de vóxeles y un mar con olas y Fresnel.
  · Óleo   -> pintor de pinceladas por capas (estilo Hertzmann) con cerdas, pintura
              que se acaba al final del trazo, mezcla húmeda y relieve de empaste.
  · Pixel  -> rejilla global única, paleta sacada por k-means del propio cuadro y
              tramado Bayer 4x4.

La gracia es que se contaminan entre sí: la esfera 3D refleja el cielo pintado al
óleo, el mar refleja el sol pixelado y luego se repinta a brochazos, la esfera se
deshace en vóxeles -> píxeles planos -> pinceladas, y al final todo recibe el
mismo relieve de pintura y la misma trama de lienzo.

Uso:
    pip install numpy scipy pillow numba
    python art/fusion.py --width 2400 --out art/atardecer_en_tres_lenguas.png
"""
import argparse
import math
import time

import numpy as np
from numba import njit, prange
from PIL import Image
from scipy import ndimage

T0 = time.time()


def log(msg):
    print(f"[{time.time() - T0:7.1f}s] {msg}", flush=True)


# =============================================================================
#  Utilidades numba: ruido, mezcla
# =============================================================================
@njit(cache=True, inline="always")
def clamp(x, a, b):
    return a if x < a else (b if x > b else x)


@njit(cache=True, inline="always")
def sstep(a, b, x):
    t = (x - a) / (b - a)
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    return t * t * (3.0 - 2.0 * t)


@njit(cache=True, inline="always")
def hash3(ix, iy, iz):
    h = ix * 374761393 + iy * 668265263 + iz * 1440662683
    h = (h ^ (h >> 13)) * 1274126177
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF) / 16777215.0


@njit(cache=True)
def vnoise3(x, y, z):
    x0 = math.floor(x)
    y0 = math.floor(y)
    z0 = math.floor(z)
    fx = x - x0
    fy = y - y0
    fz = z - z0
    ix = int(x0)
    iy = int(y0)
    iz = int(z0)
    ux = fx * fx * (3.0 - 2.0 * fx)
    uy = fy * fy * (3.0 - 2.0 * fy)
    uz = fz * fz * (3.0 - 2.0 * fz)
    a = hash3(ix, iy, iz)
    b = hash3(ix + 1, iy, iz)
    c = hash3(ix, iy + 1, iz)
    d = hash3(ix + 1, iy + 1, iz)
    e = hash3(ix, iy, iz + 1)
    f = hash3(ix + 1, iy, iz + 1)
    g = hash3(ix, iy + 1, iz + 1)
    h = hash3(ix + 1, iy + 1, iz + 1)
    k0 = a + (b - a) * ux
    k1 = c + (d - c) * ux
    k2 = e + (f - e) * ux
    k3 = g + (h - g) * ux
    l0 = k0 + (k1 - k0) * uy
    l1 = k2 + (k3 - k2) * uy
    return l0 + (l1 - l0) * uz


@njit(cache=True)
def fbm3(x, y, z, octs):
    s = 0.0
    a = 0.5
    n = 0.0
    for _ in range(octs):
        s += a * vnoise3(x, y, z)
        n += a
        # rotación + escala entre octavas para que no se note la rejilla
        x, y, z = (1.60 * y + 1.20 * z + 3.1,
                   -1.60 * x + 0.72 * y - 0.96 * z + 7.7,
                   -1.20 * x - 0.96 * y + 1.28 * z + 1.3)
        a *= 0.5
    return s / n


@njit(parallel=True, cache=True)
def noise_field(H, W, scale, ox, oy, oz, octs):
    out = np.zeros((H, W), np.float32)
    for j in prange(H):
        for i in range(W):
            out[j, i] = fbm3(i * scale + ox, j * scale + oy, oz, octs)
    return out


# =============================================================================
#  Cielo (función de dirección) — base que luego se pinta al óleo
# =============================================================================
WARM_E = np.array([-0.10, 0.00, 0.045, 0.11, 0.24, 0.45, 0.80, 1.60])
WARM_C = np.array([
    [0.93, 0.52, 0.36],
    [1.00, 0.80, 0.50],
    [1.00, 0.60, 0.30],
    [0.96, 0.40, 0.30],
    [0.80, 0.26, 0.42],
    [0.50, 0.16, 0.44],
    [0.23, 0.09, 0.33],
    [0.08, 0.05, 0.19]])
COOL_E = np.array([-0.10, 0.00, 0.035, 0.10, 0.22, 0.45, 0.80, 1.60])
COOL_C = np.array([
    [0.22, 0.22, 0.40],
    [0.34, 0.33, 0.54],
    [0.47, 0.40, 0.60],
    [0.82, 0.56, 0.66],
    [0.64, 0.50, 0.71],
    [0.40, 0.33, 0.63],
    [0.19, 0.15, 0.42],
    [0.08, 0.05, 0.19]])


@njit(cache=True)
def grad_lookup(E, C, e):
    n = E.shape[0]
    if e <= E[0]:
        return C[0, 0], C[0, 1], C[0, 2]
    for i in range(n - 1):
        if e <= E[i + 1]:
            t = (e - E[i]) / (E[i + 1] - E[i])
            t = t * t * (3.0 - 2.0 * t)
            return (C[i, 0] + (C[i + 1, 0] - C[i, 0]) * t,
                    C[i, 1] + (C[i + 1, 1] - C[i, 1]) * t,
                    C[i, 2] + (C[i + 1, 2] - C[i, 2]) * t)
    return C[n - 1, 0], C[n - 1, 1], C[n - 1, 2]


@njit(cache=True)
def sky_grad(dx, dy, dz, sun):
    e = math.asin(clamp(dy, -1.0, 1.0))
    cg = dx * sun[0] + dy * sun[1] + dz * sun[2]
    w = (cg * 0.5 + 0.5)
    w = w * w * math.sqrt(w)
    wr, wg, wb = grad_lookup(WARM_E, WARM_C, e)
    cr, cgg, cb = grad_lookup(COOL_E, COOL_C, e)
    r = cr + (wr - cr) * w
    g = cgg + (wg - cgg) * w
    b = cb + (wb - cb) * w
    gam = math.acos(clamp(cg, -1.0, 1.0))
    hz = math.exp(-max(e, 0.0) / 0.22)
    glow = 0.50 * math.exp(-gam / 0.07) + 0.28 * math.exp(-gam / 0.32) * hz
    r += 1.00 * glow
    g += 0.70 * glow
    b += 0.40 * glow
    return r, g, b


@njit(cache=True)
def sky_fn(dx, dy, dz, sun):
    r, g, b = sky_grad(dx, dy, dz, sun)
    e = math.asin(clamp(dy, -1.0, 1.0))
    cg = dx * sun[0] + dy * sun[1] + dz * sun[2]
    w = cg * 0.5 + 0.5
    w = w * w * w
    if dy > 0.012:
        t = 1.0 / dy
        cx = dx * t
        cz = dz * t
        n = fbm3(cx * 0.30 + 11.3, cz * 0.78 + 2.1, 0.37, 6)
        n2 = fbm3(cx * 0.07 + 1.7, cz * 0.20 + 8.2, 3.3, 3)
        cover = sstep(0.03, 0.10, e) * (1.0 - 0.75 * sstep(0.5, 1.0, e))
        thr = 0.47 - (n2 - 0.5) * 0.40
        dens = sstep(thr, thr + 0.13, n) * cover
        if dens > 0.0:
            # color de la nube: malva lejos del sol, rosa, oro pegado al sol
            lr, lg, lb = 0.58, 0.33, 0.55
            k = sstep(0.15, 0.7, w)
            lr += (0.98 - lr) * k
            lg += (0.42 - lg) * k
            lb += (0.48 - lb) * k
            k = w * w * (1.0 - sstep(0.04, 0.32, e))
            lr += (1.00 - lr) * k
            lg += (0.74 - lg) * k
            lb += (0.44 - lb) * k
            k = sstep(0.28, 0.85, e) * (1.0 - 0.5 * w)
            lr += (0.36 - lr) * k
            lg += (0.17 - lg) * k
            lb += (0.42 - lb) * k
            core = sstep(0.64, 0.88, n) * (0.2 + 0.55 * w)
            lr += (0.30 - lr) * core
            lg += (0.12 - lg) * core
            lb += (0.28 - lb) * core
            edge = (1.0 - sstep(thr + 0.02, thr + 0.12, n)) * w * 0.45
            lr += (1.0 - lr) * edge
            lg += (0.85 - lg) * edge
            lb += (0.6 - lb) * edge
            a = dens * 0.95
            r += (lr - r) * a
            g += (lg - g) * a
            b += (lb - b) * a
    # franjas de estratos oscuros pegadas al horizonte, con el borde encendido cerca del sol
    if dy > 0.0 and e < 0.08:
        az = math.atan2(dx, dz)
        nb = fbm3(az * 2.5 + 3.0, e * 110.0, 5.5, 4)
        band = sstep(0.006, 0.014, e) * (1.0 - sstep(0.028, 0.05, e))
        db = sstep(0.56, 0.62, nb) * band * 0.8
        if db > 0.0:
            rim = (1.0 - sstep(0.56, 0.66, nb)) * w
            sr_ = 0.36 + (1.0 - 0.36) * rim
            sg_ = 0.15 + (0.80 - 0.15) * rim
            sb_ = 0.30 + (0.45 - 0.30) * rim
            a = db * 0.9
            r += (sr_ - r) * a
            g += (sg_ - g) * a
            b += (sb_ - b) * a
    hz = math.exp(-abs(e) / 0.018) * 0.28
    r += (1.00 - r) * hz * (0.5 + 0.5 * w)
    g += (0.78 - g) * hz * (0.5 + 0.5 * w)
    b += (0.62 - b) * hz * (0.5 + 0.5 * w)
    return r, g, b


# =============================================================================
#  Cámara
# =============================================================================
def make_camera(W, H, vfov=46.0, pitch=6.0, pos=(0.0, 0.5, 0.0)):
    p = math.radians(pitch)
    f = (0.0, math.sin(p), math.cos(p))
    r = (1.0, 0.0, 0.0)
    u = (0.0, math.cos(p), -math.sin(p))
    return np.array([*pos, *f, *r, *u, math.tan(math.radians(vfov / 2)), W / H, W, H], np.float64)


@njit(cache=True, inline="always")
def cam_ray(cam, x, y):
    u = (2.0 * x / cam[14] - 1.0) * cam[12] * cam[13]
    v = (1.0 - 2.0 * y / cam[15]) * cam[12]
    dx = cam[3] + u * cam[6] + v * cam[9]
    dy = cam[4] + u * cam[7] + v * cam[10]
    dz = cam[5] + u * cam[8] + v * cam[11]
    l = math.sqrt(dx * dx + dy * dy + dz * dz)
    return dx / l, dy / l, dz / l


@njit(cache=True, inline="always")
def cam_project(cam, dx, dy, dz):
    z = dx * cam[3] + dy * cam[4] + dz * cam[5]
    if z <= 1e-6:
        return -1e9, -1e9, False
    u = (dx * cam[6] + dy * cam[7] + dz * cam[8]) / z
    v = (dx * cam[9] + dy * cam[10] + dz * cam[11]) / z
    x = (u / (cam[12] * cam[13]) + 1.0) * 0.5 * cam[14]
    y = (1.0 - v / cam[12]) * 0.5 * cam[15]
    return x, y, True


def project_point(cam, p):
    x, y, ok = cam_project(cam, p[0] - cam[0], p[1] - cam[1], p[2] - cam[2])
    return np.array([x, y])


@njit(parallel=True, cache=True)
def render_sky_screen(cam, sun, MX, MY, Ws, Hs):
    out = np.zeros((Hs, Ws, 3), np.float32)
    for j in prange(Hs):
        for i in range(Ws):
            dx, dy, dz = cam_ray(cam, i - MX + 0.5, j - MY + 0.5)
            r, g, b = sky_fn(dx, dy, dz, sun)
            out[j, i, 0] = r
            out[j, i, 1] = g
            out[j, i, 2] = b
    return out


@njit(parallel=True, cache=True)
def render_sky_pano(sun, Wp, Hp):
    out = np.zeros((Hp, Wp, 3), np.float32)
    for j in prange(Hp):
        el = (0.5 - (j + 0.5) / Hp) * math.pi
        for i in range(Wp):
            az = ((i + 0.5) / Wp - 0.5) * 2.0 * math.pi
            dx = math.sin(az) * math.cos(el)
            dy = math.sin(el)
            dz = math.cos(az) * math.cos(el)
            r, g, b = sky_fn(dx, dy, dz, sun)
            out[j, i, 0] = r
            out[j, i, 1] = g
            out[j, i, 2] = b
    return out


# =============================================================================
#  Pintor al óleo
# =============================================================================
@njit(cache=True)
def _draw_stroke(canvas, height, mask, pts, n, R, cr, cg, cb, opacity, load, bris, pickup):
    Hh = canvas.shape[0]
    Ww = canvas.shape[1]
    cum = np.zeros(n)
    for i in range(1, n):
        ex = pts[i, 0] - pts[i - 1, 0]
        ey = pts[i, 1] - pts[i - 1, 1]
        cum[i] = cum[i - 1] + math.sqrt(ex * ex + ey * ey)
    L = cum[n - 1] + R
    minx = 1e9
    miny = 1e9
    maxx = -1e9
    maxy = -1e9
    for i in range(n):
        minx = min(minx, pts[i, 0])
        maxx = max(maxx, pts[i, 0])
        miny = min(miny, pts[i, 1])
        maxy = max(maxy, pts[i, 1])
    x0 = max(0, int(minx - R - 2))
    x1 = min(Ww, int(maxx + R + 3))
    y0 = max(0, int(miny - R - 2))
    y1 = min(Hh, int(maxy + R + 3))
    nb = bris.shape[0]
    for py in range(y0, y1):
        qy = py + 0.5
        for px in range(x0, x1):
            qx = px + 0.5
            best = 1e18
            bs = 0.0
            bu = 0.0
            for i in range(n - 1):
                ax = pts[i, 0]
                ay = pts[i, 1]
                ex = pts[i + 1, 0] - ax
                ey = pts[i + 1, 1] - ay
                el2 = ex * ex + ey * ey + 1e-9
                t = ((qx - ax) * ex + (qy - ay) * ey) / el2
                t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
                cx = ax + ex * t - qx
                cy = ay + ey * t - qy
                d2 = cx * cx + cy * cy
                if d2 < best:
                    best = d2
                    el = math.sqrt(el2)
                    bs = cum[i] + t * el
                    bu = (ex * (qy - ay) - ey * (qx - ax)) / el
            d = math.sqrt(best)
            if d > R + 1.0:
                continue
            m = mask[py, px]
            if m <= 0.0:
                continue
            across = d / R
            u = clamp(bu / R, -1.0, 1.0)
            fb = (u * 0.5 + 0.5) * (nb - 1)
            ib = int(fb)
            if ib >= nb - 1:
                ib = nb - 2
            tb = fb - ib
            b = bris[ib] * (1.0 - tb) + bris[ib + 1] * tb
            edge = clamp((R - d) / 1.2 + 0.5, 0.0, 1.0)
            sl = clamp((bs + 0.5 * R) / L, 0.0, 1.0)
            dry = clamp((b + 0.5 - sl * sl * 1.15) * 3.0, 0.0, 1.0)
            a = opacity * edge * (0.55 + 0.45 * b) * dry * m
            if a <= 0.004:
                continue
            v = 0.93 + 0.14 * b
            pk = pickup * sl
            r = cr * v * (1.0 - pk) + canvas[py, px, 0] * pk
            g = cg * v * (1.0 - pk) + canvas[py, px, 1] * pk
            bb = cb * v * (1.0 - pk) + canvas[py, px, 2] * pk
            canvas[py, px, 0] += (r - canvas[py, px, 0]) * a
            canvas[py, px, 1] += (g - canvas[py, px, 1]) * a
            canvas[py, px, 2] += (bb - canvas[py, px, 2]) * a
            h = load * (0.5 + 0.65 * b) * (1.0 - 0.45 * sl) + load * 0.55 * sstep(0.6, 0.95, across)
            height[py, px] = height[py, px] * (1.0 - 0.6 * a) + h * a


@njit(cache=True)
def _make_bristles(bris, tmp):
    nb = bris.shape[0]
    for i in range(nb):
        tmp[i] = np.random.random()
    for i in range(nb):
        a = tmp[max(i - 1, 0)]
        c = tmp[min(i + 1, nb - 1)]
        v = 0.25 * a + 0.5 * tmp[i] + 0.25 * c
        bris[i] = clamp((v - 0.5) * 2.2 + 0.5, 0.0, 1.0)


@njit(cache=True)
def paint_strokes(canvas, height, ref, ang, mask, starts, R, opacity, max_steps, min_steps,
                  tol, load, cjit, seed, pickup, curl):
    Hh = canvas.shape[0]
    Ww = canvas.shape[1]
    np.random.seed(seed)
    pts = np.zeros((max_steps + 2, 2))
    bris = np.zeros(40)
    tmp = np.zeros(40)
    step = max(R * 0.75, 1.0)
    for k in range(starts.shape[0]):
        x0 = starts[k, 0]
        y0 = starts[k, 1]
        ix = int(x0)
        iy = int(y0)
        jv = 1.0 + (np.random.random() - 0.5) * 2.0 * cjit
        cr = ref[iy, ix, 0] * jv + (np.random.random() - 0.5) * cjit
        cg = ref[iy, ix, 1] * jv + (np.random.random() - 0.5) * cjit
        cb = ref[iy, ix, 2] * jv + (np.random.random() - 0.5) * cjit
        pts[0, 0] = x0
        pts[0, 1] = y0
        n = 1
        x = x0
        y = y0
        pdx = 0.0
        pdy = 0.0
        flip = np.random.random() < 0.5
        bend = (np.random.random() - 0.5) * curl
        for s in range(max_steps):
            a = ang[int(y), int(x)] + bend * s
            dx = math.cos(a)
            dy = math.sin(a)
            if s == 0:
                if flip:
                    dx = -dx
                    dy = -dy
            else:
                if dx * pdx + dy * pdy < 0.0:
                    dx = -dx
                    dy = -dy
                dx = 0.65 * dx + 0.35 * pdx
                dy = 0.65 * dy + 0.35 * pdy
                l = math.sqrt(dx * dx + dy * dy) + 1e-9
                dx /= l
                dy /= l
            nx = x + dx * step
            ny = y + dy * step
            if nx < 1.0 or ny < 1.0 or nx >= Ww - 1 or ny >= Hh - 1:
                break
            jx = int(nx)
            jy = int(ny)
            if mask[jy, jx] < 0.5:
                break
            if s >= min_steps:
                d1 = abs(ref[jy, jx, 0] - cr) + abs(ref[jy, jx, 1] - cg) + abs(ref[jy, jx, 2] - cb)
                d2 = abs(ref[jy, jx, 0] - canvas[jy, jx, 0]) + abs(ref[jy, jx, 1] - canvas[jy, jx, 1]) \
                    + abs(ref[jy, jx, 2] - canvas[jy, jx, 2])
                if d1 > tol and d1 > d2:
                    break
            x = nx
            y = ny
            pts[n, 0] = x
            pts[n, 1] = y
            n += 1
            pdx = dx
            pdy = dy
        if n == 1:
            a = ang[iy, ix]
            pts[1, 0] = x0 + math.cos(a) * R * 0.6
            pts[1, 1] = y0 + math.sin(a) * R * 0.6
            n = 2
        _make_bristles(bris, tmp)
        _draw_stroke(canvas, height, mask, pts, n, R, cr, cg, cb, opacity, load, bris, pickup)


@njit(cache=True)
def paint_dab(canvas, height, mask, x0, y0, ang, length, R, cr, cg, cb, opacity, load, seed, bendv):
    np.random.seed(seed)
    nseg = max(2, int(length / max(R * 0.6, 1.0)) + 1)
    pts = np.zeros((nseg, 2))
    for i in range(nseg):
        t = i / (nseg - 1)
        a = ang + bendv * (t - 0.5)
        if i == 0:
            pts[0, 0] = x0
            pts[0, 1] = y0
        else:
            pts[i, 0] = pts[i - 1, 0] + math.cos(a) * length / (nseg - 1)
            pts[i, 1] = pts[i - 1, 1] + math.sin(a) * length / (nseg - 1)
    bris = np.zeros(40)
    tmp = np.zeros(40)
    _make_bristles(bris, tmp)
    _draw_stroke(canvas, height, mask, pts, nseg, R, cr, cg, cb, opacity, load, bris, 0.1)


def gblur(img, s):
    if s <= 0.3:
        return img.copy()
    if img.ndim == 3:
        return ndimage.gaussian_filter(img, sigma=(s, s, 0), mode="nearest")
    return ndimage.gaussian_filter(img, sigma=s, mode="nearest")


def flow_field(ref, R, default_ang, coh_weight):
    lum = ref[..., 0] * 0.30 + ref[..., 1] * 0.59 + ref[..., 2] * 0.11
    gx = ndimage.sobel(lum, 1)
    gy = ndimage.sobel(lum, 0)
    s = max(1.0, R * 1.6)
    jxx = gblur(gx * gx, s)
    jxy = gblur(gx * gy, s)
    jyy = gblur(gy * gy, s)
    tr = jxx + jyy + 1e-12
    diff = np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2)
    coh = diff / tr
    mag = tr / (tr + np.percentile(tr, 70) + 1e-9)
    w = np.clip(coh * mag * coh_weight, 0, 1)
    # ángulo doblado del gradiente; la tangente (a lo largo del borde) es +90º -> vector opuesto
    vx = -(jxx - jyy)
    vy = -(2 * jxy)
    nrm = np.sqrt(vx * vx + vy * vy) + 1e-12
    vx /= nrm
    vy /= nrm
    mx = w * vx + (1 - w) * np.cos(2 * default_ang)
    my = w * vy + (1 - w) * np.sin(2 * default_ang)
    return (0.5 * np.arctan2(my, mx)).astype(np.float64)


def stroke_starts(canvas, ref, mask, R, first, thresh, rng, spacing=1.0):
    H, W = mask.shape
    g = max(2, int(round(R * spacing)))
    ys, xs = np.mgrid[g // 2:H:g, g // 2:W:g]
    xs = xs + rng.uniform(-g / 2, g / 2, xs.shape)
    ys = ys + rng.uniform(-g / 2, g / 2, ys.shape)
    xs = np.clip(xs, 1, W - 2).ravel()
    ys = np.clip(ys, 1, H - 2).ravel()
    xi = xs.astype(int)
    yi = ys.astype(int)
    sel = mask[yi, xi] > 0.5
    if not first:
        err = np.abs(canvas - ref).sum(-1)
        err = ndimage.uniform_filter(err, g)
        sel &= err[yi, xi] > thresh
    pts = np.stack([xs[sel], ys[sel]], 1)
    rng.shuffle(pts)
    return np.ascontiguousarray(pts, np.float64)


def paint(ref_base, mask, layers, default_ang, rng, canvas=None, height=None, coh=0.85, name=""):
    """layers: lista de dicts con R, op, steps, min, tol, thr, load, cj, pick, curl."""
    if canvas is None:
        canvas = gblur(ref_base, layers[0]["R"] * 1.2).astype(np.float32)
    if height is None:
        height = np.zeros(mask.shape, np.float32)
    mask = np.ascontiguousarray(mask, np.float32)
    for li, L in enumerate(layers):
        ref = np.ascontiguousarray(gblur(ref_base, L["R"] * 0.45), np.float32)
        ang = np.ascontiguousarray(flow_field(ref, L["R"], default_ang, coh))
        starts = stroke_starts(canvas, ref, mask, L["R"], li == 0, L["thr"], rng, L.get("sp", 1.0))
        paint_strokes(canvas, height, ref, ang, mask, starts, float(L["R"]), L["op"], L["steps"],
                      L["min"], L["tol"], L["load"], L["cj"], int(rng.integers(1 << 30)),
                      L.get("pick", 0.12), L.get("curl", 0.0))
        log(f"  óleo {name}: capa R={L['R']:.1f}  ({len(starts)} pinceladas)")
    return canvas, height


# =============================================================================
#  Pixel art: paleta, Bayer, bloques
# =============================================================================
BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16.0
PAL_W = np.array([1.0, 1.25, 0.8])


def kmeans_palette(pixels, k, rng, iters=14):
    pix = pixels.reshape(-1, 3)
    pix = pix[rng.choice(len(pix), min(len(pix), 60000), replace=False)]
    cent = [pix[rng.integers(len(pix))]]
    for _ in range(k - 1):  # k-means++
        d = np.min(((pix[:, None, :] - np.array(cent)[None]) ** 2 * PAL_W).sum(-1), 1)
        cent.append(pix[rng.choice(len(pix), p=d / d.sum())])
    cent = np.array(cent)
    for _ in range(iters):
        lab = np.argmin(((pix[:, None, :] - cent[None]) ** 2 * PAL_W).sum(-1), 1)
        for c in range(k):
            m = lab == c
            if m.any():
                cent[c] = pix[m].mean(0)
    return cent


def quantize(cols, pal):
    shp = cols.shape
    c = cols.reshape(-1, 3)
    idx = np.argmin(((c[:, None, :] - pal[None]) ** 2 * PAL_W).sum(-1), 1)
    return pal[idx].reshape(shp)


def tile_profile(B, h=1.0):
    u = (np.arange(B) + 0.5) / B
    e = np.minimum(u, 1 - u)
    p = np.minimum(e[:, None], e[None, :])
    return (h * (0.55 + 0.45 * np.clip(p / 0.2, 0, 1))).astype(np.float32)


def fill_block(img, height, x0, y0, B, col, tile):
    H, W = img.shape[:2]
    xa, ya = max(0, x0), max(0, y0)
    xb, yb = min(W, x0 + B), min(H, y0 + B)
    if xa >= xb or ya >= yb:
        return
    img[ya:yb, xa:xb] = col
    if height is not None:
        height[ya:yb, xa:xb] = tile[ya - y0:yb - y0, xa - x0:xb - x0]


# =============================================================================
#  Raytracer
# =============================================================================
SKY, WATER, CHROME, CUT, VOX, CUBE, PALM = 0, 1, 2, 3, 4, 5, 6


@njit(cache=True)
def bilin(img, x, y):
    H = img.shape[0]
    W = img.shape[1]
    x = clamp(x - 0.5, 0.0, W - 1.001)
    y = clamp(y - 0.5, 0.0, H - 1.001)
    ix = int(x)
    iy = int(y)
    fx = x - ix
    fy = y - iy
    ix1 = min(ix + 1, W - 1)
    iy1 = min(iy + 1, H - 1)
    r = (img[iy, ix, 0] * (1 - fx) + img[iy, ix1, 0] * fx) * (1 - fy) + \
        (img[iy1, ix, 0] * (1 - fx) + img[iy1, ix1, 0] * fx) * fy
    g = (img[iy, ix, 1] * (1 - fx) + img[iy, ix1, 1] * fx) * (1 - fy) + \
        (img[iy1, ix, 1] * (1 - fx) + img[iy1, ix1, 1] * fx) * fy
    b = (img[iy, ix, 2] * (1 - fx) + img[iy, ix1, 2] * fx) * (1 - fy) + \
        (img[iy1, ix, 2] * (1 - fx) + img[iy1, ix1, 2] * fx) * fy
    return r, g, b


@njit(cache=True)
def env_sky(dx, dy, dz, cam, sky, pano, MX, MY):
    Hp = pano.shape[0]
    Wp = pano.shape[1]
    az = math.atan2(dx, dz)
    el = math.asin(clamp(dy, -1.0, 1.0))
    pu = (az / (2.0 * math.pi) + 0.5) * Wp
    pv = (0.5 - el / math.pi) * Hp
    pu = pu % Wp
    r, g, b = bilin(pano, pu, pv)
    x, y, ok = cam_project(cam, dx, dy, dz)
    if ok:
        sx = x + MX
        sy = y + MY
        Hs = sky.shape[0]
        Ws = sky.shape[1]
        m = min(min(sx, Ws - 1 - sx), min(sy, Hs - 1 - sy))
        w = sstep(0.0, 0.6 * MX, m)
        if w > 0.0:
            sr, sg, sb = bilin(sky, sx, sy)
            r += (sr - r) * w
            g += (sg - g) * w
            b += (sb - b) * w
    return r, g, b


@njit(cache=True)
def env(dx, dy, dz, cam, sky, pano, MX, MY):
    if dy < 0.0:
        rr, rg, rb = env_sky(dx, max(-dy, 0.002), dz, cam, sky, pano, MX, MY)
        c = -dy
        F = 0.03 + 0.97 * (1.0 - c) ** 5
        return (0.10 + (rr - 0.10) * F, 0.05 + (rg - 0.05) * F, 0.17 + (rb - 0.17) * F)
    return env_sky(dx, max(dy, 0.002), dz, cam, sky, pano, MX, MY)


@njit(cache=True, inline="always")
def sph_f(px, py, pz, sph):
    qx = px - sph[0]
    qy = py - sph[1]
    qz = pz - sph[2]
    d = qx * sph[4] + qy * sph[5] + qz * sph[6] - sph[7]
    nz = fbm3(px * sph[9] + 5.0, py * sph[9] + 1.0, pz * sph[9] + 3.0, 3) - 0.5
    return d + nz * 2.0 * sph[8]


@njit(cache=True)
def hit_sphere_part(ox, oy, oz, dx, dy, dz, sph, tmax):
    lx = ox - sph[0]
    ly = oy - sph[1]
    lz = oz - sph[2]
    R = sph[3]
    b = lx * dx + ly * dy + lz * dz
    c = lx * lx + ly * ly + lz * lz - R * R
    disc = b * b - c
    if disc < 0.0:
        return -1.0, 0.0, 0.0, 0.0, False
    sq = math.sqrt(disc)
    t0 = -b - sq
    t1 = -b + sq
    if t1 < 1e-4 or t0 > tmax:
        return -1.0, 0.0, 0.0, 0.0, False
    t = max(t0, 1e-4)
    for _ in range(160):
        px = ox + dx * t
        py = oy + dy * t
        pz = oz + dz * t
        qx = px - sph[0]
        qy = py - sph[1]
        qz = pz - sph[2]
        ds = math.sqrt(qx * qx + qy * qy + qz * qz) - R
        f = sph_f(px, py, pz, sph)
        sd = max(ds, f)
        if sd < 3e-4:
            if t > tmax:
                break
            if ds > f:
                l = R + ds
                return t, qx / l, qy / l, qz / l, False
            e = 2e-3
            gx = sph_f(px + e, py, pz, sph) - sph_f(px - e, py, pz, sph)
            gy = sph_f(px, py + e, pz, sph) - sph_f(px, py - e, pz, sph)
            gz = sph_f(px, py, pz + e, sph) - sph_f(px, py, pz - e, sph)
            l = math.sqrt(gx * gx + gy * gy + gz * gz) + 1e-12
            return t, gx / l, gy / l, gz / l, True
        t += max(sd * 0.55, 3e-4)
        if t > t1 + 1e-3 or t > tmax:
            break
    return -1.0, 0.0, 0.0, 0.0, False


@njit(cache=True)
def hit_grid(ox, oy, oz, dx, dy, dz, org, vs, occ, tmax):
    nx = occ.shape[0]
    ny = occ.shape[1]
    nz = occ.shape[2]
    ivx = 1.0 / dx if abs(dx) > 1e-12 else 1e30
    ivy = 1.0 / dy if abs(dy) > 1e-12 else 1e30
    ivz = 1.0 / dz if abs(dz) > 1e-12 else 1e30
    tx0 = (org[0] - ox) * ivx
    tx1 = (org[0] + vs * nx - ox) * ivx
    if tx0 > tx1:
        tx0, tx1 = tx1, tx0
    ty0 = (org[1] - oy) * ivy
    ty1 = (org[1] + vs * ny - oy) * ivy
    if ty0 > ty1:
        ty0, ty1 = ty1, ty0
    tz0 = (org[2] - oz) * ivz
    tz1 = (org[2] + vs * nz - oz) * ivz
    if tz0 > tz1:
        tz0, tz1 = tz1, tz0
    tn = max(tx0, max(ty0, tz0))
    tf = min(tx1, min(ty1, tz1))
    if tn > tf or tf < 0.0 or tn > tmax:
        return -1.0, 0, 0, 0, 0, 0, 0, 0
    axis = 0
    if ty0 >= tx0 and ty0 >= tz0:
        axis = 1
    elif tz0 >= tx0 and tz0 >= ty0:
        axis = 2
    t = max(tn, 0.0)
    px = ox + dx * (t + 1e-7)
    py = oy + dy * (t + 1e-7)
    pz = oz + dz * (t + 1e-7)
    ix = min(max(int((px - org[0]) / vs), 0), nx - 1)
    iy = min(max(int((py - org[1]) / vs), 0), ny - 1)
    iz = min(max(int((pz - org[2]) / vs), 0), nz - 1)
    sx = 1 if dx > 0 else -1
    sy = 1 if dy > 0 else -1
    sz = 1 if dz > 0 else -1
    tmx = ((org[0] + (ix + (1 if dx > 0 else 0)) * vs) - ox) * ivx if abs(dx) > 1e-12 else 1e30
    tmy = ((org[1] + (iy + (1 if dy > 0 else 0)) * vs) - oy) * ivy if abs(dy) > 1e-12 else 1e30
    tmz = ((org[2] + (iz + (1 if dz > 0 else 0)) * vs) - oz) * ivz if abs(dz) > 1e-12 else 1e30
    tdx = vs * abs(ivx)
    tdy = vs * abs(ivy)
    tdz = vs * abs(ivz)
    tend = min(tf, tmax)
    for _ in range(nx + ny + nz + 4):
        if occ[ix, iy, iz]:
            if axis == 0:
                return t, -sx, 0, 0, ix, iy, iz, 1
            elif axis == 1:
                return t, 0, -sy, 0, ix, iy, iz, 1
            return t, 0, 0, -sz, ix, iy, iz, 1
        if tmx < tmy and tmx < tmz:
            t = tmx
            ix += sx
            tmx += tdx
            axis = 0
            if ix < 0 or ix >= nx:
                break
        elif tmy < tmz:
            t = tmy
            iy += sy
            tmy += tdy
            axis = 1
            if iy < 0 or iy >= ny:
                break
        else:
            t = tmz
            iz += sz
            tmz += tdz
            axis = 2
            if iz < 0 or iz >= nz:
                break
        if t > tend:
            break
    return -1.0, 0, 0, 0, 0, 0, 0, 0


@njit(cache=True)
def hit_cubes(ox, oy, oz, dx, dy, dz, cc, ch, crot, cbs, tmax):
    # esfera envolvente de toda la nube de cubos
    lx = ox - cbs[0]
    ly = oy - cbs[1]
    lz = oz - cbs[2]
    b = lx * dx + ly * dy + lz * dz
    c = lx * lx + ly * ly + lz * lz - cbs[3] * cbs[3]
    if b * b - c < 0.0:
        return -1.0, -1, 0.0, 0.0, 0.0, 0.0, 0.0
    best = tmax
    bi = -1
    bnx = 0.0
    bny = 0.0
    bnz = 0.0
    bu = 0.0
    bv = 0.0
    for k in range(cc.shape[0]):
        h = ch[k]
        lx = ox - cc[k, 0]
        ly = oy - cc[k, 1]
        lz = oz - cc[k, 2]
        b = lx * dx + ly * dy + lz * dz
        c = lx * lx + ly * ly + lz * lz - 3.0 * h * h
        if b * b - c < 0.0:
            continue
        # a espacio local
        o0 = crot[k, 0, 0] * lx + crot[k, 1, 0] * ly + crot[k, 2, 0] * lz
        o1 = crot[k, 0, 1] * lx + crot[k, 1, 1] * ly + crot[k, 2, 1] * lz
        o2 = crot[k, 0, 2] * lx + crot[k, 1, 2] * ly + crot[k, 2, 2] * lz
        d0 = crot[k, 0, 0] * dx + crot[k, 1, 0] * dy + crot[k, 2, 0] * dz
        d1 = crot[k, 0, 1] * dx + crot[k, 1, 1] * dy + crot[k, 2, 1] * dz
        d2 = crot[k, 0, 2] * dx + crot[k, 1, 2] * dy + crot[k, 2, 2] * dz
        tn = -1e30
        tf = 1e30
        ax = 0
        sg = 1.0
        oo = (o0, o1, o2)
        dd = (d0, d1, d2)
        ok = True
        for a in range(3):
            o = oo[a]
            d = dd[a]
            if abs(d) < 1e-12:
                if o < -h or o > h:
                    ok = False
                    break
                continue
            ta = (-h - o) / d
            tb = (h - o) / d
            s = -1.0
            if ta > tb:
                ta, tb = tb, ta
                s = 1.0
            if ta > tn:
                tn = ta
                ax = a
                sg = s
            if tb < tf:
                tf = tb
        if not ok or tn > tf or tn < 1e-4 or tn >= best:
            continue
        best = tn
        bi = k
        hx = o0 + d0 * tn
        hy = o1 + d1 * tn
        hz = o2 + d2 * tn
        n0 = 0.0
        n1 = 0.0
        n2 = 0.0
        if ax == 0:
            n0 = sg
            bu = hy
            bv = hz
        elif ax == 1:
            n1 = sg
            bu = hx
            bv = hz
        else:
            n2 = sg
            bu = hx
            bv = hy
        bu = (bu / h + 1.0) * 0.5
        bv = (bv / h + 1.0) * 0.5
        bnx = crot[k, 0, 0] * n0 + crot[k, 0, 1] * n1 + crot[k, 0, 2] * n2
        bny = crot[k, 1, 0] * n0 + crot[k, 1, 1] * n1 + crot[k, 1, 2] * n2
        bnz = crot[k, 2, 0] * n0 + crot[k, 2, 1] * n1 + crot[k, 2, 2] * n2
    if bi < 0:
        return -1.0, -1, 0.0, 0.0, 0.0, 0.0, 0.0
    return best, bi, bnx, bny, bnz, bu, bv


@njit(cache=True)
def intersect(ox, oy, oz, dx, dy, dz, sph, gA_org, gA_vs, gA_occ, gA_col,
              cc, ch, crot, ccol, cbs, gB_org, gB_vs, gB_occ, gB_col):
    best = 1e30
    hid = SKY
    nx = 0.0
    ny = 0.0
    nz = 0.0
    cr = 0.0
    cg = 0.0
    cb = 0.0
    fu = 0.5
    fv = 0.5
    if dy < -1e-7:
        t = -oy / dy
        if t > 1e-4:
            best = t
            hid = WATER
            ny = 1.0
    t, sx, sy, sz, cut = hit_sphere_part(ox, oy, oz, dx, dy, dz, sph, best)
    if t > 0.0 and t < best:
        best = t
        hid = CUT if cut else CHROME
        nx = sx
        ny = sy
        nz = sz
    t, gx, gy, gz, ix, iy, iz, h = hit_grid(ox, oy, oz, dx, dy, dz, gA_org, gA_vs, gA_occ, best)
    if h == 1 and t < best:
        best = t
        hid = VOX
        nx = gx
        ny = gy
        nz = gz
        cr = gA_col[ix, iy, iz, 0]
        cg = gA_col[ix, iy, iz, 1]
        cb = gA_col[ix, iy, iz, 2]
        px = (ox + dx * t - gA_org[0]) / gA_vs - ix
        py = (oy + dy * t - gA_org[1]) / gA_vs - iy
        pz = (oz + dz * t - gA_org[2]) / gA_vs - iz
        if gx != 0:
            fu = py
            fv = pz
        elif gy != 0:
            fu = px
            fv = pz
        else:
            fu = px
            fv = py
    if cc.shape[0] > 0:
        t, k, bx, by, bz, bu, bv = hit_cubes(ox, oy, oz, dx, dy, dz, cc, ch, crot, cbs, best)
        if k >= 0 and t < best:
            best = t
            hid = CUBE
            nx = bx
            ny = by
            nz = bz
            cr = ccol[k, 0]
            cg = ccol[k, 1]
            cb = ccol[k, 2]
            fu = bu
            fv = bv
    t, gx, gy, gz, ix, iy, iz, h = hit_grid(ox, oy, oz, dx, dy, dz, gB_org, gB_vs, gB_occ, best)
    if h == 1 and t < best:
        best = t
        hid = PALM
        nx = gx
        ny = gy
        nz = gz
        cr = gB_col[ix, iy, iz, 0]
        cg = gB_col[ix, iy, iz, 1]
        cb = gB_col[ix, iy, iz, 2]
        px = (ox + dx * t - gB_org[0]) / gB_vs - ix
        py = (oy + dy * t - gB_org[1]) / gB_vs - iy
        pz = (oz + dz * t - gB_org[2]) / gB_vs - iz
        if gx != 0:
            fu = py
            fv = pz
        elif gy != 0:
            fu = px
            fv = pz
        else:
            fu = px
            fv = py
    return best, hid, nx, ny, nz, cr, cg, cb, fu, fv


@njit(cache=True)
def wave_normal(x, z, t, waves, wp):
    # wp: [pixang, camh, isl_x, isl_z, isl_rx, isl_rz]
    fp = t * t * wp[0] / wp[1]
    sx = 0.0
    sz = 0.0
    for i in range(waves.shape[0]):
        kx = waves[i, 0]
        kz = waves[i, 1]
        A = waves[i, 2]
        k = math.sqrt(kx * kx + kz * kz)
        q = fp * k * 0.45
        fade = math.exp(-q * q)
        if fade < 1e-3:
            continue
        c = math.cos(kx * x + kz * z + waves[i, 3]) * A * fade
        sx += c * kx
        sz += c * kz
    # rizado con ruido (ondas cortas de viento)
    q = fp * 9.0
    fade = math.exp(-q * q)
    if fade > 1e-3:
        e = 0.03
        n0 = fbm3(x * 2.2, z * 5.0, 0.0, 3)
        n1 = fbm3((x + e) * 2.2, z * 5.0, 0.0, 3)
        n2 = fbm3(x * 2.2, (z + e) * 5.0, 0.0, 3)
        sx += (n1 - n0) / e * 0.05 * fade
        sz += (n2 - n0) / e * 0.05 * fade
    l = math.sqrt(sx * sx + 1.0 + sz * sz)
    return -sx / l, 1.0 / l, -sz / l


@njit(cache=True)
def shade_block(br, bg, bb, nx, ny, nz, fu, fv, sun, kind):
    if kind != PALM:
        # vóxeles "de píxel": sombreado plano por cara, como en el voxel art, con el color intacto
        la = -0.35 * nx + 0.80 * ny - 0.48 * nz
        k = 0.78 + 0.30 * la
        rim = max(0.0, nx * sun[0] + ny * sun[1] + nz * sun[2]) * 0.35
        e = min(min(fu, 1.0 - fu), min(fv, 1.0 - fv))
        if e < 0.07:
            k *= 0.62
        elif e < 0.15:
            k *= 1.10
        return br * k + rim * 1.0, bg * k + rim * 0.62, bb * k + rim * 0.40
    ux = nx
    uy = ny * 0.6 + 0.55
    uz = nz
    l = math.sqrt(ux * ux + uy * uy + uz * uz)
    ir, ig, ib = sky_grad(ux / l, uy / l, uz / l, sun)
    if ny < -0.5:
        ir, ig, ib = 0.20, 0.11, 0.25
    ndl = max(0.0, nx * sun[0] + ny * sun[1] + nz * sun[2])
    top = sstep(0.3, 1.0, ny)
    sr = 1.0 * ndl * 1.2 + 0.55 * top
    sg = 0.70 * ndl * 1.2 + 0.36 * top
    sb = 0.45 * ndl * 1.2 + 0.26 * top
    r = br * (0.16 + 1.0 * ir + sr)
    g = bg * (0.16 + 1.0 * ig + sg)
    b = bb * (0.16 + 1.0 * ib + sb)
    e = min(min(fu, 1.0 - fu), min(fv, 1.0 - fv))
    ow = 0.075 if kind != PALM else 0.06
    if e < ow:
        k = 0.6
    elif e < ow * 2.0:
        k = 1.12
    else:
        k = 1.0
    return r * k, g * k, b * k


@njit(cache=True)
def trace(ox, oy, oz, dx, dy, dz, cam, sun, sky, pano, MX, MY, sph,
          gA_org, gA_vs, gA_occ, gA_col, cc, ch, crot, ccol, cbs,
          gB_org, gB_vs, gB_occ, gB_col, waves, wp, maxb):
    ar = 0.0
    ag = 0.0
    ab = 0.0
    tr = 1.0
    tg = 1.0
    tb = 1.0
    pid = SKY
    pnx = 0.0
    pny = 0.0
    pnz = 0.0
    pt = 1e30
    done = False
    for bounce in range(maxb):
        t, hid, nx, ny, nz, cr, cg, cb, fu, fv = intersect(
            ox, oy, oz, dx, dy, dz, sph, gA_org, gA_vs, gA_occ, gA_col,
            cc, ch, crot, ccol, cbs, gB_org, gB_vs, gB_occ, gB_col)
        if bounce == 0:
            pid = hid
            pnx = nx
            pny = ny
            pnz = nz
            pt = t
        if hid == SKY:
            er, eg, eb = env(dx, dy, dz, cam, sky, pano, MX, MY)
            ar += tr * er
            ag += tg * eg
            ab += tb * eb
            done = True
            break
        px = ox + dx * t
        py = oy + dy * t
        pz = oz + dz * t
        if hid == CHROME:
            ci = -(dx * nx + dy * ny + dz * nz)
            f5 = (1.0 - clamp(ci, 0.0, 1.0)) ** 5
            tr *= 0.90 + 0.10 * f5
            tg *= 0.87 + 0.13 * f5
            tb *= 0.88 + 0.12 * f5
            dd = 2.0 * (dx * nx + dy * ny + dz * nz)
            dx -= dd * nx
            dy -= dd * ny
            dz -= dd * nz
            ox = px + nx * 1e-3
            oy = py + ny * 1e-3
            oz = pz + nz * 1e-3
            continue
        if hid == WATER:
            wnx, wny, wnz = wave_normal(px, pz, t if bounce == 0 else t * 0.5, waves, wp)
            ci = max(-(dx * wnx + dy * wny + dz * wnz), 0.02)
            F = 0.025 + 0.975 * (1.0 - ci) ** 5
            F = min(1.0, F * 1.3 + 0.03)
            # cuerpo del agua: violeta profundo, más cálido hacia el sol
            hw = max(0.0, dx * sun[0] + dz * sun[2])
            hw = hw ** 12
            wr = 0.09 + 0.30 * hw
            wg = 0.05 + 0.10 * hw
            wb = 0.17 + 0.06 * hw
            # espuma alrededor del islote
            ex = (px - wp[2]) / wp[4]
            ez = (pz - wp[3]) / wp[5]
            ee = math.sqrt(ex * ex + ez * ez)
            if ee < 1.5:
                nn = fbm3(px * 3.0, pz * 3.0, 1.0, 3)
                fo = sstep(1.42, 1.0, ee + (nn - 0.5) * 0.5) * 0.85
                wr += (0.95 - wr) * fo
                wg += (0.70 - wg) * fo
                wb += (0.72 - wb) * fo
                F *= 1.0 - fo
            ar += tr * (1.0 - F) * wr
            ag += tg * (1.0 - F) * wg
            ab += tb * (1.0 - F) * wb
            tr *= F
            tg *= F
            tb *= F
            dd = 2.0 * (dx * wnx + dy * wny + dz * wnz)
            dx -= dd * wnx
            dy -= dd * wny
            dz -= dd * wnz
            if dy < 0.002:
                dy = 0.002
                l = math.sqrt(dx * dx + dy * dy + dz * dz)
                dx /= l
                dy /= l
                dz /= l
            ox = px
            oy = 1e-3
            oz = pz
            continue
        if hid == CUT:
            # cara de corte: metal oscuro con la rejilla de vóxeles encendida
            qx = (px - gA_org[0]) / gA_vs
            qy = (py - gA_org[1]) / gA_vs
            qz = (pz - gA_org[2]) / gA_vs
            fx = abs(qx - math.floor(qx + 0.5))
            fy = abs(qy - math.floor(qy + 0.5))
            fz = abs(qz - math.floor(qz + 0.5))
            dl = min(fx, min(fy, fz))
            glow = sstep(0.07, 0.0, dl)
            halo = sstep(0.25, 0.0, dl) * 0.35
            dd = 2.0 * (dx * nx + dy * ny + dz * nz)
            er, eg, eb = env(dx - dd * nx, dy - dd * ny, dz - dd * nz, cam, sky, pano, MX, MY)
            cr = 0.07 + 0.18 * er + (1.0 * glow + halo) * 1.0
            cg = 0.04 + 0.14 * eg + (0.62 * glow + halo * 0.5) * 1.0
            cb = 0.10 + 0.20 * eb + (0.35 * glow + halo * 0.4) * 1.0
            ar += tr * cr
            ag += tg * cg
            ab += tb * cb
            done = True
            break
        # bloques (vóxeles, cubos, palmeras)
        sr, sg, sb = shade_block(cr, cg, cb, nx, ny, nz, fu, fv, sun, hid)
        gl = 0.08 if hid != PALM else 0.03
        ar += tr * sr * (1.0 - gl)
        ag += tg * sg * (1.0 - gl)
        ab += tb * sb * (1.0 - gl)
        tr *= gl
        tg *= gl
        tb *= gl
        dd = 2.0 * (dx * nx + dy * ny + dz * nz)
        dx -= dd * nx
        dy -= dd * ny
        dz -= dd * nz
        ox = px + nx * 1e-3
        oy = py + ny * 1e-3
        oz = pz + nz * 1e-3
    if not done:
        er, eg, eb = env(dx, dy, dz, cam, sky, pano, MX, MY)
        ar += tr * er
        ag += tg * eg
        ab += tb * eb
    return ar, ag, ab, pid, pnx, pny, pnz, pt


@njit(parallel=True, cache=True)
def render(cam, sun, W, H, ss, sky, pano, MX, MY, sph, gA_org, gA_vs, gA_occ, gA_col,
           cc, ch, crot, ccol, cbs, gB_org, gB_vs, gB_occ, gB_col, waves, wp):
    img = np.zeros((H, W, 3), np.float32)
    ids = np.zeros((H, W), np.uint8)
    cov = np.zeros((H, W, 7), np.float32)
    nrm = np.zeros((H, W, 3), np.float32)
    dep = np.zeros((H, W), np.float32)
    inv = 1.0 / (ss * ss)
    for j in prange(H):
        for i in range(W):
            ar = 0.0
            ag = 0.0
            ab = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    x = i + (sx + 0.5) / ss
                    y = j + (sy + 0.5) / ss
                    dx, dy, dz = cam_ray(cam, x, y)
                    r, g, b, pid, nx, ny, nz, t = trace(
                        cam[0], cam[1], cam[2], dx, dy, dz, cam, sun, sky, pano, MX, MY, sph,
                        gA_org, gA_vs, gA_occ, gA_col, cc, ch, crot, ccol, cbs,
                        gB_org, gB_vs, gB_occ, gB_col, waves, wp, 5)
                    ar += r
                    ag += g
                    ab += b
                    cov[j, i, pid] += inv
                    if sx == ss // 2 and sy == ss // 2:
                        ids[j, i] = pid
                        nrm[j, i, 0] = nx
                        nrm[j, i, 1] = ny
                        nrm[j, i, 2] = nz
                        dep[j, i] = t
            img[j, i, 0] = ar * inv
            img[j, i, 1] = ag * inv
            img[j, i, 2] = ab * inv
    return img, ids, cov, nrm, dep


# =============================================================================
#  Construcción de la escena
# =============================================================================
def build_sphere_voxels(sph, vs, cam, sky, pano, MX, MY, pal, rng):
    C = sph[:3]
    R = sph[3]
    n = int(math.ceil(2 * (R + vs) / vs)) + 1
    org = C - n * vs / 2.0
    occ = np.zeros((n, n, n), np.uint8)
    col = np.zeros((n, n, n, 3), np.float32)
    detached = []
    for ix in range(n):
        for iy in range(n):
            for iz in range(n):
                q = org + (np.array([ix, iy, iz]) + 0.5) * vs
                if np.linalg.norm(q - C) > R - 0.05 * vs:
                    continue
                f = sph_f(q[0], q[1], q[2], sph)
                if f < 0.0:
                    continue
                # color = lo que el cromo reflejaría en ese punto, pasado a paleta
                nn = (q - C) / (np.linalg.norm(q - C) + 1e-9)
                v = q - cam[:3]
                v /= np.linalg.norm(v)
                r = v - 2 * np.dot(v, nn) * nn
                c = np.array(env(r[0], r[1], r[2], cam, sky, pano, MX, MY))
                c = np.clip(c * 1.35 + 0.06, 0, 1)
                c = c + (BAYER4[(ix + iz) % 4, iy % 4] - 0.5) * 0.08
                c = quantize(c[None], pal)[0]
                a = f / (0.6 * R)
                p_det = 0.85 * sstep(0.12, 0.95, a) + 0.04
                if rng.random() < p_det:
                    detached.append((q, c, a))
                else:
                    occ[ix, iy, iz] = 1
                    col[ix, iy, iz] = c
    return org, occ, col, detached


def rot_matrix(axis, ang):
    axis = axis / np.linalg.norm(axis)
    x, y, z = axis
    c, s = math.cos(ang), math.sin(ang)
    C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


def stream_path(t, S0, D, L, bend):
    return S0 + D * L * t + bend * t * t


def build_flying_cubes(detached, vs, S0, D, L, bend, rng, extra=1.0):
    cc, ch, crot, ccol = [], [], [], []
    for q, c, a in detached:
        copies = 1 + (rng.random() < 0.6 * extra)
        for _ in range(copies):
            t = rng.random() ** 1.35
            spread = rng.normal(0, 1, 3) * (0.08 + 0.55 * t)
            p = q + (stream_path(t, S0, D, L, bend) - S0) + spread
            h = vs * 0.5 * (1.0 - 0.55 * t) * rng.uniform(0.8, 1.05)
            ax = rng.normal(0, 1, 3)
            ang = (0.25 + 2.8 * t) * rng.uniform(0.3, 1.0)
            cc.append(p)
            ch.append(h)
            crot.append(rot_matrix(ax, ang))
            ccol.append(c)
    cc = np.array(cc, np.float64).reshape(-1, 3)
    ch = np.array(ch, np.float64)
    crot = np.array(crot, np.float64).reshape(-1, 3, 3)
    ccol = np.array(ccol, np.float32).reshape(-1, 3)
    if len(cc):
        cen = cc.mean(0)
        rad = np.max(np.linalg.norm(cc - cen, axis=1) + ch * 1.8)
    else:
        cen, rad = np.zeros(3), 0.0
    cbs = np.array([*cen, rad], np.float64)
    return cc, ch, crot, ccol, cbs


def build_island(center, vs, rng):
    """Islote de vóxeles con dos palmeras, estilo sprite pero en 3D de verdad."""
    nx, ny, nz = 50, 44, 34
    org = np.array([center[0] - nx * vs / 2, -4 * vs, center[2] - nz * vs / 2])
    occ = np.zeros((nx, ny, nz), np.uint8)
    col = np.zeros((nx, ny, nz, 3), np.float32)

    def put(p, c):
        i = np.floor((p - org) / vs).astype(int)
        if (i >= 0).all() and i[0] < nx and i[1] < ny and i[2] < nz:
            occ[i[0], i[1], i[2]] = 1
            col[i[0], i[1], i[2]] = c

    SAND = [np.array([0.86, 0.60, 0.50]), np.array([0.78, 0.52, 0.46])]
    ROCK = [np.array([0.36, 0.22, 0.32]), np.array([0.28, 0.17, 0.27]), np.array([0.44, 0.28, 0.36])]
    rx, rz = 1.7, 1.15
    top_y = {}
    for ix in range(nx):
        for iz in range(nz):
            x = org[0] + (ix + 0.5) * vs - center[0]
            z = org[2] + (iz + 0.5) * vs - center[2]
            e = (x / rx) ** 2 + (z / rz) ** 2
            e += (vnoise3(x * 1.7, z * 1.7, 4.0) - 0.5) * 0.35
            if e >= 1.0:
                continue
            h = 0.55 * (1 - e) ** 0.6 + (vnoise3(x * 3.0, z * 3.0, 9.0) - 0.5) * 0.12
            iy_top = int((h - org[1]) / vs)
            top_y[(ix, iz)] = iy_top
            for iy in range(0, iy_top + 1):
                if iy == iy_top and e < 0.8:
                    c = SAND[(ix + iz) % 2]
                else:
                    c = ROCK[int(hash3(ix, iy, iz) * 3) % 3]
                occ[ix, iy, iz] = 1
                col[ix, iy, iz] = c

    def palm(bx, bz, height, lean, n_fronds, frond_len, phase):
        ix = int((bx - org[0]) / vs)
        iz = int((bz - org[2]) / vs)
        iy0 = top_y.get((ix, iz), 4) + 1
        TR = [np.array([0.48, 0.30, 0.27]), np.array([0.36, 0.21, 0.22])]
        steps = int(height / vs)
        top = None

        def puti(i, j, k, c):
            if 0 <= i < nx and 0 <= j < ny and 0 <= k < nz:
                occ[i, j, k] = 1
                col[i, j, k] = c

        for s in range(steps):
            t = s / steps
            # índices enteros: el tronco no puede tener huecos
            ti = ix + int(round(lean * t * t / vs))
            tk = iz + int(round(0.15 * lean * t * t / vs))
            c = TR[(s // 2) % 2]
            puti(ti, iy0 + s, tk, c)
            puti(ti + 1, iy0 + s, tk, c * 0.85)
            if t < 0.35:
                puti(ti, iy0 + s, tk + 1, c * 0.8)
                puti(ti + 1, iy0 + s, tk + 1, c * 0.75)
            top = org + (np.array([ti + 1.0, iy0 + s + 1.0, tk + 0.5])) * vs
        LEAF = [np.array([0.20, 0.44, 0.36]), np.array([0.15, 0.34, 0.31]),
                np.array([0.26, 0.52, 0.38]), np.array([0.12, 0.27, 0.27])]
        for f in range(n_fronds):
            phi = phase + 2 * math.pi * f / n_fronds + rng.uniform(-0.25, 0.25)
            L = frond_len * rng.uniform(0.8, 1.1)
            droop = rng.uniform(0.45, 0.7)
            rise = rng.uniform(0.25, 0.45)
            dirv = np.array([math.cos(phi), 0, math.sin(phi) * 0.8])
            side = np.array([-dirv[2], 0, dirv[0]])
            nstep = int(L / (vs * 0.6))
            for k in range(nstep):
                r = k / nstep * L
                p = top + dirv * r + np.array([0, rise * r - droop * r * r, 0])
                c = LEAF[(k + f) % 4]
                put(p, c)
                if r > 0.25 * L:
                    if k % 2 == 0:
                        put(p + side * vs - np.array([0, vs * 0.8, 0]), LEAF[(k + 1) % 4] * 0.9)
                    else:
                        put(p - side * vs - np.array([0, vs * 0.8, 0]), LEAF[(k + 2) % 4] * 0.9)
                    if r > 0.55 * L and k % 3 == 0:
                        put(p - np.array([0, vs * 1.8, 0]), LEAF[3])
        NUT = np.array([0.30, 0.18, 0.14])
        for d in [(-1, -1, 0), (1, -1, 0), (0, -1, -1), (0, -2, 0)]:
            put(top + np.array(d) * vs, NUT)
        return top

    palm(center[0] - 0.35, center[2] + 0.1, 3.5, -0.75, 8, 1.75, 0.3)
    palm(center[0] + 0.75, center[2] - 0.2, 2.3, 0.6, 7, 1.35, 1.1)
    return org, occ, col


def make_waves(rng, K=14):
    w = []
    for i in range(K):
        lam = 5.0 * 0.74 ** i
        k = 2 * math.pi / lam
        th = math.pi / 2 + rng.normal(0, 0.38)
        slope = 0.085 * 0.93 ** i
        A = slope / k
        w.append([math.cos(th) * k, math.sin(th) * k, A, rng.uniform(0, 2 * math.pi)])
    return np.array(w, np.float64)


# =============================================================================
#  Programa principal
# =============================================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=2400)
    ap.add_argument("--out", default="art/atardecer_en_tres_lenguas.png")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--ss", type=int, default=2)
    ap.add_argument("--debug", default="")
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    W = args.width
    H = int(round(W * 2 / 3))
    S = W / 2400.0
    B = max(3, int(round(12 * S)))
    dbg = args.debug

    def save_dbg(name, img):
        if dbg:
            Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(f"{dbg}/{name}.png")

    cam = make_camera(W, H, pos=(0.0, 0.9, 0.0))
    tanh = cam[12]
    horizon = (1 + math.tan(math.radians(6.0)) / tanh) * H / 2
    Rs = 0.13 * H
    sun_xy = np.array([0.60 * W, horizon - 0.5 * Rs])
    sun = np.array(cam_ray(cam, sun_xy[0], sun_xy[1]))
    log(f"lienzo {W}x{H}, bloque pixel {B}px, horizonte y={horizon:.0f}")

    # ------------------------------------------------------------ cielo base
    MX = int(round(0.2 * W / B)) * B
    MY = int(round(0.2 * H / B)) * B
    Ws = W + 2 * MX
    Hs = MY + int(horizon) + 6 * B
    sky_base = render_sky_screen(cam, sun, MX, MY, Ws, Hs)
    Wp, Hp = int(1400 * max(S, 0.5)), int(700 * max(S, 0.5))
    pano_base = render_sky_pano(sun, Wp, Hp)
    log("cielo base calculado")
    save_dbg("01_sky_base", sky_base)

    # ------------------------------------------------------------ cielo al óleo
    yy, xx = np.mgrid[0:Hs, 0:Ws].astype(np.float64)
    nf = noise_field(Hs, Ws, 1.0 / (420 * S), 3.0, 7.0, 0.5, 3).astype(np.float64)
    sky_ang = (nf - 0.5) * 1.5
    # un par de remolinos suaves, guiño a los cielos de Van Gogh
    for (cx, cy, rr, sgn) in [(0.13, 0.12, 0.13, 1), (0.93, 0.22, 0.10, -1), (0.47, 0.06, 0.09, -1)]:
        px, py = cx * W + MX, cy * H + MY
        d = np.hypot(xx - px, yy - py)
        wgt = np.exp(-(d / (rr * W)) ** 2) * 0.85
        tang = np.arctan2(yy - py, xx - px) + math.pi / 2 * sgn
        vx = (1 - wgt) * np.cos(2 * sky_ang) + wgt * np.cos(2 * tang)
        vy = (1 - wgt) * np.sin(2 * sky_ang) + wgt * np.sin(2 * tang)
        sky_ang = 0.5 * np.arctan2(vy, vx)
    sky_mask = (yy < MY + horizon + 2 * B).astype(np.float32)
    sky_layers = [
        dict(R=30 * S, op=0.95, steps=10, min=3, tol=0.20, thr=0.0, load=1.25, cj=0.05, pick=0.15, curl=0.05),
        dict(R=15 * S, op=0.92, steps=12, min=3, tol=0.13, thr=0.07, load=1.0, cj=0.045, pick=0.15, curl=0.05),
        dict(R=7.5 * S, op=0.9, steps=12, min=2, tol=0.10, thr=0.06, load=0.8, cj=0.04, pick=0.12, curl=0.04),
        dict(R=3.6 * S, op=0.85, steps=10, min=2, tol=0.08, thr=0.055, load=0.6, cj=0.03, pick=0.1, curl=0.03),
    ]
    sky_paint, sky_h = paint(sky_base, sky_mask, sky_layers, sky_ang, rng, coh=0.6, name="cielo")
    save_dbg("02_sky_paint", sky_paint)

    pano_ang = (noise_field(Hp, Wp, 1.0 / 180.0, 1.0, 2.0, 3.0, 3).astype(np.float64) - 0.5) * 1.2
    pano_layers = [
        dict(R=16 * max(S, 0.5), op=0.95, steps=10, min=3, tol=0.2, thr=0.0, load=1.0, cj=0.05),
        dict(R=8 * max(S, 0.5), op=0.9, steps=10, min=2, tol=0.12, thr=0.07, load=0.8, cj=0.04),
        dict(R=4 * max(S, 0.5), op=0.85, steps=8, min=2, tol=0.09, thr=0.06, load=0.6, cj=0.03),
    ]
    pano_paint, _ = paint(pano_base, np.ones((Hp, Wp), np.float32), pano_layers, pano_ang, rng,
                          coh=0.5, name="panorama")

    # ------------------------------------------------------------ paleta pixel
    sky_rows = sky_paint[:MY + int(horizon)]
    pal = kmeans_palette(sky_rows, 22, rng)
    extra = np.array([[0.06, 0.04, 0.12], [0.16, 0.08, 0.22], [0.30, 0.14, 0.30],
                      [1.00, 0.95, 0.78], [1.00, 0.84, 0.50], [0.98, 0.62, 0.30]])
    pal = np.concatenate([pal, extra], 0)
    log(f"paleta: {len(pal)} colores")

    # ------------------------------------------------------------ sol pixelado
    tile = tile_profile(B, 1.0)
    tile_h = tile_profile(B, 0.7)
    SUNC = np.array([[1.00, 0.95, 0.66], [1.00, 0.85, 0.45], [1.00, 0.68, 0.32],
                     [0.98, 0.48, 0.32], [0.93, 0.32, 0.40]])
    gaps = [(0.02, 0.022), (0.14, 0.03), (0.25, 0.038), (0.35, 0.045), (0.45, 0.05)]
    bx0 = int((sun_xy[0] - 2.8 * Rs) // B)
    bx1 = int((sun_xy[0] + 2.8 * Rs) // B) + 1
    by0 = int((sun_xy[1] - 2.8 * Rs) // B)
    by1 = int((horizon + 2 * B) // B) + 1
    pix_mask_sky = np.zeros((Hs, Ws), np.float32)
    for by in range(by0, by1):
        for bx in range(bx0, bx1):
            cx, cy = (bx + 0.5) * B, (by + 0.5) * B
            r = math.hypot(cx - sun_xy[0], cy - sun_xy[1]) / Rs
            bay = BAYER4[by % 4, bx % 4]
            X0, Y0 = bx * B + MX, by * B + MY
            if X0 < 0 or Y0 < 0 or X0 + B > Ws or Y0 + B > Hs:
                continue
            rel = (cy - sun_xy[1]) / Rs
            in_gap = any(abs(rel - g0) < gw for g0, gw in gaps)
            if r < 1.0 and not in_gap:
                yy_ = (cy - (sun_xy[1] - Rs)) / (2 * Rs)
                lvl = int(np.clip(round(yy_ * 4.6 - 0.3 + (bay - 0.5) * 0.55), 0, 4))
                c = SUNC[lvl]
                if r > 0.9 and rel < 0:
                    c = np.minimum(c * 1.04, 1)
                fill_block(sky_paint, sky_h, X0, Y0, B, c, tile)
                pix_mask_sky[Y0:Y0 + B, X0:X0 + B] = 1
            elif r < 2.7:
                m = sstep(2.65, 1.2, r + (hash3(bx, by, 3) - 0.5) * 0.5)
                if in_gap and r < 1.0:
                    m = 1.0
                if bay < m:
                    avg = sky_paint[Y0:Y0 + B, X0:X0 + B].mean((0, 1))
                    g = np.clip((2.5 - r) / 1.5, 0, 1)
                    gq = math.floor(g * 3 + bay) / 3.0
                    glow = np.array([1.0, 0.72, 0.42])
                    if in_gap and r < 1.0:
                        c = avg * 0.8 + np.array([0.12, 0.0, 0.06])
                    else:
                        c = avg + (glow - avg) * gq * 0.5
                    c = quantize((c + (bay - 0.5) * 0.05)[None], pal)[0]
                    fill_block(sky_paint, sky_h, X0, Y0, B, c, tile_h)
                    pix_mask_sky[Y0:Y0 + B, X0:X0 + B] = 1
    log("sol pixelado dibujado")
    save_dbg("03_sky_final", sky_paint)

    # ------------------------------------------------------------ escena 3D
    sph_xy = np.array([0.27 * W, 0.355 * H])
    dist = 9.5
    dray = np.array(cam_ray(cam, sph_xy[0], sph_xy[1]))
    C = cam[:3] + dray * dist
    r_tan = 0.152 * H * 2 * tanh / H
    R = dist * math.sin(math.atan(r_tan))
    axis = np.array([0.85, 0.5, -0.32])
    axis /= np.linalg.norm(axis)
    sph = np.array([*C, R, *axis, 0.40 * R, 0.10 * R, 1.3 / R], np.float64)
    vs = R / 6.2
    gA_org, gA_occ, gA_col, detached = build_sphere_voxels(
        sph, vs, cam, sky_paint, pano_paint, MX, MY, pal, rng)
    log(f"esfera: R={R:.2f}, vóxeles pegados={int(gA_occ.sum())}, sueltos={len(detached)}")

    S0 = C + axis * R * 0.55
    D = np.array([1.0, 0.10, -0.05])
    D /= np.linalg.norm(D)
    Lp = 2.6
    bend = np.array([0.0, 0.10, 0.25])
    cc, ch, crot, ccol, cbs = build_flying_cubes(detached, vs, S0, D, Lp, bend, rng)
    log(f"cubos volando: {len(cc)}")

    isl_center = np.array([7.05, 0.0, 15.5])
    gB_vs = 0.13
    gB_org, gB_occ, gB_col = build_island(isl_center, gB_vs, rng)
    waves = make_waves(rng)
    pixang = 2 * tanh / H
    wp = np.array([pixang, cam[1], isl_center[0], isl_center[2], 1.7, 1.15], np.float64)

    img, ids, cov, nrm, dep = render(
        cam, sun, W, H, args.ss, sky_paint, pano_paint, MX, MY, sph,
        gA_org, vs, gA_occ, gA_col, cc, ch, crot, ccol, cbs,
        gB_org, gB_vs, gB_occ, gB_col, waves, wp)
    log("render 3D terminado")
    save_dbg("04_render", img)

    # ------------------------------------------------------------ montaje
    frame_sky = sky_paint[MY:MY + H, MX:MX + W]
    frame_sky_h = sky_h[MY:MY + H, MX:MX + W]
    rows = min(frame_sky.shape[0], H)
    sky_cov = cov[..., SKY][..., None]
    out = img.copy()
    out[:rows] = img[:rows] * (1 - sky_cov[:rows]) + frame_sky[:rows] * sky_cov[:rows]
    height = np.zeros((H, W), np.float32)
    height[:rows] = frame_sky_h[:rows] * sky_cov[:rows, :, 0]
    obj_cov = cov[..., CHROME] + cov[..., CUT] + cov[..., VOX] + cov[..., CUBE] + cov[..., PALM]
    pixmask_frame = np.zeros((H, W), np.float32)
    pixmask_frame[:rows] = pix_mask_sky[MY:MY + rows, MX:MX + W] * sky_cov[:rows, :, 0]

    # ------------------------------------------------------------ mar al óleo
    water_mask = gblur((cov[..., WATER] > 0.5).astype(np.float32), 1.0)
    water_mask[:int(horizon) - 1] = 0
    wy, wx = np.mgrid[0:H, 0:W]
    wang = (noise_field(H, W, 1.0 / (300 * S), 9.0, 1.0, 2.0, 3).astype(np.float64) - 0.5) * 0.14
    water_layers = [
        dict(R=10 * S, op=0.9, steps=14, min=4, tol=0.20, thr=0.0, load=1.0, cj=0.04, pick=0.2, sp=1.1),
        dict(R=5.5 * S, op=0.9, steps=14, min=3, tol=0.13, thr=0.06, load=0.85, cj=0.035, pick=0.15),
        dict(R=2.8 * S, op=0.85, steps=12, min=2, tol=0.09, thr=0.05, load=0.6, cj=0.03, pick=0.1),
    ]
    water_ref = out.copy()
    out, height = paint(water_ref, water_mask, water_layers, wang, rng, canvas=out, height=height,
                        coh=0.25, name="mar")
    save_dbg("05_water_paint", out)

    # reflejo del sol pixelado cerca del horizonte (tipo synthwave) que se disuelve en óleo
    hz_i = int(horizon)
    for by in range(hz_i // B, (hz_i + int(0.30 * (H - hz_i))) // B + 1):
        for bx in range(int((sun_xy[0] - 1.3 * Rs) // B), int((sun_xy[0] + 1.3 * Rs) // B) + 1):
            X0, Y0 = bx * B, by * B
            if Y0 < hz_i or Y0 + B > H or X0 < 0 or X0 + B > W:
                continue
            fy = (Y0 - hz_i) / (0.30 * (H - hz_i))
            fx = abs((X0 + B / 2) - sun_xy[0]) / (1.3 * Rs)
            m = (1 - sstep(0.15, 1.0, fy)) * (1 - sstep(0.45, 1.0, fx + fy * 0.3))
            m *= 0.6 + 0.8 * hash3(bx, by, 11)
            if water_mask[Y0:Y0 + B, X0:X0 + B].min() < 0.9:
                continue
            if BAYER4[by % 4, bx % 4] < m:
                avg = out[Y0:Y0 + B, X0:X0 + B].mean((0, 1))
                c = quantize((avg * 1.05 + (BAYER4[by % 4, bx % 4] - 0.5) * 0.06)[None], pal)[0]
                fill_block(out, height, X0, Y0, B, c, tile_h)
                pixmask_frame[Y0:Y0 + B, X0:X0 + B] = 1

    # ------------------------------------------------------------ borde de la esfera "pintado"
    sph_cov = cov[..., CHROME] + cov[..., CUT]
    rim = np.clip(sph_cov * (1 - gblur((sph_cov > 0.99).astype(np.float32), 3 * S) ** 3) * 1.6, 0, 1)
    rim_mask = (gblur(rim, 2 * S) > 0.25).astype(np.float32) * (1 - pixmask_frame)
    # la normal proyectada en pantalla (y hacia abajo); la pincelada va a lo largo del contorno
    rim_ang = np.arctan2(-nrm[..., 1], nrm[..., 0]).astype(np.float64) + math.pi / 2
    rim_layers = [dict(R=3.0 * S, op=0.55, steps=6, min=2, tol=0.18, thr=0.0, load=0.5, cj=0.02, pick=0.35, sp=1.2)]
    out, height = paint(out.copy(), rim_mask, rim_layers, rim_ang, rng, canvas=out, height=height,
                        coh=0.0, name="borde esfera")

    # ------------------------------------------------------------ estela: vóxel -> píxel -> pincelada
    pix_items = []
    for k in range(int(300)):
        t = 0.85 + rng.random() ** 1.2 * 1.05
        base = stream_path(t, S0, D, Lp, bend)
        spread = rng.normal(0, 1, 3) * (0.18 + 0.35 * (t - 0.85))
        xy = project_point(cam, base + spread)
        c = ccol[rng.integers(len(ccol))] if len(ccol) else pal[rng.integers(len(pal))]
        pix_items.append((t, xy, c))
    # primero los grandes (más cerca de los cubos)
    for t, xy, c in sorted(pix_items, key=lambda z: -z[0]):
        bx, by = int(xy[0] // B), int(xy[1] // B)
        X0, Y0 = bx * B, by * B
        if X0 < 0 or Y0 < 0 or X0 + B > W or Y0 + B > H:
            continue
        under = out[Y0:Y0 + B, X0:X0 + B].mean((0, 1))
        mixk = sstep(1.3, 1.9, t) * 0.45
        cq = quantize((c * (1 - mixk) + under * mixk)[None], pal)[0]
        size = 2 if (t < 1.05 and rng.random() < 0.5) else 1
        for oy in range(size):
            for ox in range(size):
                fill_block(out, height, X0 + ox * B, Y0 + oy * B, B, cq, tile)
                pixmask_frame[Y0 + oy * B:Y0 + (oy + 1) * B, X0 + ox * B:X0 + (ox + 1) * B] = 1
    full = np.ones((H, W), np.float32)
    for k in range(420):
        t = 1.55 + rng.random() ** 0.9 * 1.25
        base = stream_path(t, S0, D, Lp, bend)
        spread = rng.normal(0, 1, 3) * (0.25 + 0.4 * (t - 1.55))
        xy = project_point(cam, base + spread)
        xy2 = project_point(cam, stream_path(t + 0.05, S0, D, Lp, bend) + spread)
        ang = math.atan2(xy2[1] - xy[1], xy2[0] - xy[0]) + rng.normal(0, 0.35)
        if not (0 <= xy[0] < W and 0 <= xy[1] < H):
            continue
        c = ccol[rng.integers(len(ccol))] if len(ccol) else pal[rng.integers(len(pal))]
        under = out[int(xy[1]), int(xy[0])]
        mixk = sstep(1.6, 2.8, t) * 0.6
        c = c * (1 - mixk) + under * mixk
        Rr = (7.5 - 3.5 * (t - 1.55) / 1.25) * S * rng.uniform(0.8, 1.2)
        ln = Rr * rng.uniform(2.5, 5.0)
        op = 0.95 - 0.45 * sstep(2.2, 2.8, t)
        paint_dab(out, height, full, float(xy[0]), float(xy[1]), float(ang), float(ln), float(Rr),
                  float(c[0]), float(c[1]), float(c[2]), float(op), 0.9, int(rng.integers(1 << 30)),
                  float(rng.normal(0, 0.5)))
    log("estela vóxel -> píxel -> óleo")

    # ------------------------------------------------------------ gaviotas: dos en píxel, una a brochazo
    GULL = ["XX.....XX",
            "..X...X..",
            "...XXX..."]
    gcol = np.array([0.20, 0.08, 0.20])
    for gx, gy in [(0.665, 0.415), (0.715, 0.385)]:
        X0, Y0 = int(gx * W // B) * B, int(gy * H // B) * B
        for r_, row in enumerate(GULL):
            for c_, ch_ in enumerate(row):
                if ch_ == "X":
                    fill_block(out, height, X0 + c_ * B, Y0 + r_ * B, B, gcol, tile)
    gx, gy = 0.765 * W, 0.345 * H
    for side in (-1, 1):
        wing = -0.45 if side > 0 else math.pi + 0.45
        paint_dab(out, height, full, float(gx), float(gy), float(wing), float(34 * S), float(3.2 * S),
                  0.22, 0.09, 0.22, 0.95, 0.9, int(rng.integers(1 << 30)), float(0.6 * side))

    # ------------------------------------------------------------ destellos pixel en el cromo y el agua
    def sparkle(cx, cy, size):
        bx, by = int(cx // B), int(cy // B)
        core = np.array([1.0, 0.98, 0.88])
        mid = np.array([1.0, 0.86, 0.60])
        fill_block(out, height, bx * B, by * B, B, core, tile)
        for d in range(1, size + 1):
            c = core if d == 1 else mid
            for ox, oy in [(d, 0), (-d, 0), (0, d), (0, -d)]:
                fill_block(out, height, (bx + ox) * B, (by + oy) * B, B, c, tile)

    lum = out[..., 0] * 0.3 + out[..., 1] * 0.59 + out[..., 2] * 0.11
    chrome_only = ndimage.binary_erosion(cov[..., CHROME] > 0.99, iterations=int(14 * S) + 1)
    if chrome_only.any():
        l2 = np.where(chrome_only, lum, -1)
        j, i = np.unravel_index(np.argmax(l2), l2.shape)
        sparkle(i, j, 2)
    sparkle(sun_xy[0] - 0.55 * Rs, horizon + 0.10 * (H - horizon), 1)
    sparkle(sun_xy[0] + 0.35 * Rs, horizon + 0.22 * (H - horizon), 1)
    save_dbg("06_pre_finish", out)

    # ------------------------------------------------------------ empaste, lienzo, acabado
    obj_mask = np.clip(obj_cov, 0, 1)
    height = height * (1 - obj_mask) + obj_mask * 0.35
    # trama de lino
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    p = 4.2 * max(S, 0.5)
    weave = (np.sin(2 * np.pi * xx / p) * (np.sin(2 * np.pi * yy / (2 * p)) > 0) +
             np.sin(2 * np.pi * yy / p) * (np.sin(2 * np.pi * xx / (2 * p)) <= 0)) * 0.5
    weave += (noise_field(H, W, 0.35 / max(S, 0.5), 2.0, 5.0, 1.0, 2) - 0.5) * 0.6
    hgt = gblur(height, 0.9 * S) * 0.9 + weave * 0.10 * np.exp(-height * 1.2)
    gx = ndimage.sobel(hgt, 1) / 8.0
    gy = ndimage.sobel(hgt, 0) / 8.0
    k = 1.0
    nx, ny, nz = -gx * k, -gy * k, np.ones_like(gx)
    nl = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / nl, ny / nl, nz / nl
    Lx, Ly, Lz = -0.45, -0.55, 0.70
    ll = math.sqrt(Lx * Lx + Ly * Ly + Lz * Lz)
    Lx, Ly, Lz = Lx / ll, Ly / ll, Lz / ll
    diff = (nx * Lx + ny * Ly + nz * Lz) / Lz
    hx, hy, hz = Lx, Ly, Lz + 1.0
    hl = math.sqrt(hx * hx + hy * hy + hz * hz)
    spec = np.clip((nx * hx + ny * hy + nz * hz) / hl, 0, 1) ** 60
    relief = 1 + np.clip(diff - 1, -0.6, 0.6) * 0.30
    fin = out * relief[..., None] + spec[..., None] * np.array([1.0, 0.96, 0.9]) * 0.10 * (1 - obj_mask[..., None] * 0.5)

    # viñeta violeta, curva suave, grano
    vx = (xx / W - 0.5) * 1.1
    vy = (yy / H - 0.52)
    vig = np.clip(1 - (vx * vx + vy * vy) * 0.95, 0, 1) ** 0.9
    fin = fin * (0.72 + 0.28 * vig[..., None]) + (1 - vig[..., None]) * np.array([0.05, 0.0, 0.07]) * 0.35
    fin = np.clip(fin, 0, 1.2)
    fin = fin / (1 + 0.08 * fin)
    fin = np.clip(fin * 1.07, 0, 1)
    fin = fin + rng.normal(0, 0.009, fin.shape)
    fin = np.clip(fin, 0, 1)
    Image.fromarray((fin * 255 + 0.5).astype(np.uint8)).save(args.out, optimize=True)
    log(f"guardado {args.out}")


if __name__ == "__main__":
    main()
