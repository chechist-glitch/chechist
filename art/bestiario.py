#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bestiario de funciones extrañas — Lámina II
===========================================

Un paisaje imposible en el que cada cosa es una fórmula matemática rara de
narices. Nada está dibujado a mano ni generado por IA: cada píxel sale de
evaluar la fórmula correspondiente.

  I.    Cielo        función zeta de Riemann, coloreada por fase; sus ceros son ojos
  II.   Estrellas    función de Thomae ("palomitas"): f(p/q) = 1/q
  III.  Luna         números primos en polares: (r, θ) = (p, p)
  IV.   Fantasma     atractor de Peter de Jong
  V.    Montañas     función de Weierstrass: continua en todo punto, derivable en ninguno
  VI.   Zigurat      función de Cantor, la "escalera del diablo"
  VII.  Algas        conjetura de Collatz (3n+1)
  VIII. Inscripción  fórmula autorreferente de Tupper, que se dibuja a sí misma

Uso:
    pip install numpy scipy pillow numba
    python art/bestiario.py --out art/bestiario_de_funciones_extranas.png
"""
import argparse
import cmath
import math
import time
from fractions import Fraction
from math import factorial, gcd

import numpy as np
from numba import njit, prange
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

T0 = time.time()
LOG2 = math.log(2.0)
LOGPI = math.log(math.pi)
FONTS = "/usr/share/fonts/truetype/"


def log(msg):
    print(f"[{time.time() - T0:7.1f}s] {msg}", flush=True)


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def gblur(img, s):
    if img.ndim == 3:
        return ndimage.gaussian_filter(img, sigma=(s, s, 0), mode="nearest")
    return ndimage.gaussian_filter(img, sigma=s, mode="nearest")


def lerp_stops(f, stops, cols, cyclic=False):
    """Interpola una rampa de color. f en [0,1]."""
    stops = np.asarray(stops, float)
    cols = np.asarray(cols, float)
    if cyclic:
        f = np.mod(f, 1.0)
        stops = np.append(stops, 1.0)
        cols = np.vstack([cols, cols[:1]])
    out = np.empty(f.shape + (3,))
    for c in range(3):
        out[..., c] = np.interp(f, stops, cols[:, c])
    return out


# =============================================================================
#  I. Zeta de Riemann (Borwein + ecuación funcional)
# =============================================================================
def borwein_coeffs(n=64):
    acc = Fraction(0)
    d = []
    for i in range(n + 1):
        acc += Fraction(factorial(n + i - 1) * 4 ** i, factorial(n - i) * factorial(2 * i))
        d.append(n * acc)
    dn = d[n]
    return np.array([(-1) ** k * float(1 - d[k] / dn) for k in range(n)])


LANCZOS = np.array([0.99999999999980993, 676.5203681218851, -1259.1392167224028,
                    771.32342877765313, -176.61502916214059, 12.507343278686905,
                    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7])


@njit(cache=True)
def eta(s, c, logk):
    acc = 0j
    for k in range(c.shape[0]):
        acc += c[k] * cmath.exp(-s * logk[k])
    return acc


@njit(cache=True)
def lgamma_c(z):
    z = z - 1.0
    x = LANCZOS[0] + 0j
    for i in range(1, 9):
        x = x + LANCZOS[i] / (z + i)
    t = z + 7.5
    return 0.5 * math.log(2.0 * math.pi) + (z + 0.5) * cmath.log(t) - t + cmath.log(x)


@njit(cache=True)
def log_zeta_right(s, c, logk):
    e = eta(s, c, logk)
    den = 1.0 - cmath.exp((1.0 - s) * LOG2)
    return cmath.log(e) - cmath.log(den)


@njit(cache=True)
def log_zeta(s, c, logk):
    if s.real >= 0.5:
        return log_zeta_right(s, c, logk)
    w = 1.0 - s
    return (s * LOG2 + (s - 1.0) * LOGPI + cmath.log(cmath.sin(math.pi * s / 2.0))
            + lgamma_c(w) + log_zeta_right(w, c, logk))


@njit(parallel=True, cache=True)
def zeta_field(Hh, Ww, t_c, x_c, y_crit, ppu, c, logk):
    L = np.zeros((Hh, Ww))
    P = np.zeros((Hh, Ww))
    for j in prange(Hh):
        sig = 0.5 + (y_crit - (j + 0.5)) / ppu
        for i in range(Ww):
            t = t_c + ((i + 0.5) - x_c) / ppu
            lz = log_zeta(complex(sig, t), c, logk)
            L[j, i] = lz.real / LOG2
            P[j, i] = math.atan2(math.sin(lz.imag), math.cos(lz.imag))
    return L, P


# =============================================================================
#  IV. Atractor de Peter de Jong
# =============================================================================
@njit(cache=True)
def dejong(n, a, b, c, d, G, lim):
    dens = np.zeros((G, G))
    spd = np.zeros((G, G))
    x = 0.1
    y = 0.1
    for i in range(n):
        nx = math.sin(a * y) - math.cos(b * x)
        ny = math.sin(c * x) - math.cos(d * y)
        sp = math.sqrt((nx - x) ** 2 + (ny - y) ** 2)
        x = nx
        y = ny
        if i < 200:
            continue
        gx = (x + lim) / (2 * lim) * G
        gy = (lim - y) / (2 * lim) * G
        ix = int(gx)
        iy = int(gy)
        if 0 <= ix < G - 1 and 0 <= iy < G - 1:
            fx = gx - ix
            fy = gy - iy
            dens[iy, ix] += (1 - fx) * (1 - fy)
            dens[iy, ix + 1] += fx * (1 - fy)
            dens[iy + 1, ix] += (1 - fx) * fy
            dens[iy + 1, ix + 1] += fx * fy
            spd[iy, ix] += sp
    return dens, spd


# =============================================================================
#  VII. Algas de Collatz
# =============================================================================
@njit(cache=True)
def collatz_coral(acc, dep, ns, x0, y0, ang0, step, ae, ao, mirror):
    Hh = acc.shape[0]
    Ww = acc.shape[1]
    buf = np.zeros(4000, np.int64)
    for n in ns:
        m = 0
        v = n
        while v != 1 and m < 3998:
            buf[m] = v
            m += 1
            if v % 2 == 0:
                v = v // 2
            else:
                v = 3 * v + 1
        buf[m] = 1
        m += 1
        x = x0
        y = y0
        a = ang0
        for q in range(m - 1, -1, -1):
            v = buf[q]
            if v % 2 == 0:
                a += ae * mirror
            else:
                a -= ao * mirror
            nx = x + math.cos(a) * step
            ny = y + math.sin(a) * step
            depth = (m - 1 - q)
            ns_ = 3
            for k in range(ns_):
                px = x + (nx - x) * (k + 0.5) / ns_
                py = y + (ny - y) * (k + 0.5) / ns_
                ix = int(math.floor(px))
                iy = int(math.floor(py))
                if 0 <= ix < Ww - 1 and 0 <= iy < Hh - 1:
                    fx = px - ix
                    fy = py - iy
                    w00 = (1 - fx) * (1 - fy)
                    w10 = fx * (1 - fy)
                    w01 = (1 - fx) * fy
                    w11 = fx * fy
                    acc[iy, ix] += w00
                    acc[iy, ix + 1] += w10
                    acc[iy + 1, ix] += w01
                    acc[iy + 1, ix + 1] += w11
                    dep[iy, ix] += w00 * depth
                    dep[iy, ix + 1] += w10 * depth
                    dep[iy + 1, ix] += w01 * depth
                    dep[iy + 1, ix + 1] += w11 * depth
            x = nx
            y = ny


@njit(cache=True)
def splat_points(acc, xs, ys, ws):
    Hh = acc.shape[0]
    Ww = acc.shape[1]
    for k in range(xs.shape[0]):
        px = xs[k]
        py = ys[k]
        ix = int(math.floor(px))
        iy = int(math.floor(py))
        if 0 <= ix < Ww - 1 and 0 <= iy < Hh - 1:
            fx = px - ix
            fy = py - iy
            acc[iy, ix] += (1 - fx) * (1 - fy) * ws[k]
            acc[iy, ix + 1] += fx * (1 - fy) * ws[k]
            acc[iy + 1, ix] += (1 - fx) * fy * ws[k]
            acc[iy + 1, ix + 1] += fx * fy * ws[k]


# =============================================================================
#  V. Weierstrass y VI. Cantor
# =============================================================================
def weierstrass(x, a, b, N=26):
    s = np.zeros_like(x)
    for n in range(N):
        s += a ** n * np.cos(b ** n * np.pi * x)
    return s


def cantor(x, it=34):
    x = np.clip(np.asarray(x, float), 0, 1).copy()
    r = np.zeros_like(x)
    s = 0.5
    done = np.zeros(x.shape, bool)
    for _ in range(it):
        x3 = x * 3
        d = np.clip(np.floor(x3), 0, 2)
        x = x3 - d
        one = (d == 1) & ~done
        r[one] += s
        done |= one
        two = (d == 2) & ~done
        r[two] += s
        s *= 0.5
    return r


# =============================================================================
#  VIII. Tupper: la fórmula que se dibuja a sí misma
# =============================================================================
G5 = {
    "0": ["111", "101", "101", "101", "111"],
    "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"],
    "7": ["111", "001", "001", "010", "010"],
    "m": ["00000", "11110", "10101", "10101", "10101"],
    "o": ["000", "111", "101", "101", "111"],
    "d": ["001", "001", "111", "101", "111"],
    "x": ["000", "000", "101", "010", "101"],
    "y": ["101", "101", "111", "001", "110"],
    "<": ["001", "010", "100", "010", "001"],
    "-": ["000", "000", "111", "000", "000"],
    "[": ["10", "10", "10", "10", "11"],
    "]": ["01", "01", "01", "01", "11"],
    "(": ["01", "10", "10", "10", "01"],
    ")": ["10", "01", "01", "01", "10"],
    ",": ["00", "00", "00", "01", "10"],
}


def tupper_bitmap():
    """Maqueta en 17 filas: ½ < ⌊mod(⌊y/17⌋·2^(−17⌊x⌋−mod(⌊y⌋,17)), 2)⌋"""
    W = 200
    bm = np.zeros((17, W), np.uint8)
    cur = [1]

    def glyph(ch, row, x=None):
        g = G5[ch]
        x = cur[0] if x is None else x
        for r, line in enumerate(g):
            for c, v in enumerate(line):
                if v == "1":
                    bm[row + r, x + c] = 1
        return len(g[0])

    def text(s, row, gap=1):
        for ch in s:
            cur[0] += glyph(ch, row) + gap

    def tall(kind, r0, r1):
        x = cur[0]
        if kind == "floorL":
            bm[r0:r1 + 1, x] = 1
            bm[r1, x + 1] = 1
        elif kind == "floorR":
            bm[r0:r1 + 1, x + 1] = 1
            bm[r1, x] = 1
        elif kind == "parL":
            bm[r0 + 1:r1, x] = 1
            bm[r0, x + 1] = 1
            bm[r1, x + 1] = 1
        elif kind == "parR":
            bm[r0 + 1:r1, x + 1] = 1
            bm[r0, x] = 1
            bm[r1, x] = 1
        cur[0] += 3

    def frac(num, den):
        wn = sum(len(G5[c][0]) + 1 for c in num) - 1
        wd = sum(len(G5[c][0]) + 1 for c in den) - 1
        w = max(wn, wd) + 2
        x0 = cur[0]
        cur[0] = x0 + (w - wn) // 2
        text(num, 2)
        cur[0] = x0 + (w - wd) // 2
        text(den, 10)
        bm[8, x0:x0 + w] = 1
        cur[0] = x0 + w + 1

    frac("1", "2")
    cur[0] += 1
    text("<", 6)
    cur[0] += 1
    tall("floorL", 0, 16)
    text("mod", 6)
    tall("parL", 1, 15)
    tall("floorL", 2, 14)
    frac("y", "17")
    tall("floorR", 2, 14)
    text("2", 6)
    text("-17", 1)
    text("[x]", 1)
    text("-", 1)
    text("mod", 1)
    text("([y]", 1)
    text(",", 1)
    text("17)", 1)
    text(",", 6)
    text("2", 6)
    tall("parR", 1, 15)
    tall("floorR", 0, 16)
    return bm[:, :cur[0] + 1]


def tupper_k(bm):
    N = 0
    H, W = bm.shape
    for x in range(W):
        for r in range(H):
            if bm[r, x]:
                N |= 1 << (17 * x + (16 - r))
    return 17 * N


def tupper_plot(k, width):
    """Evalúa la fórmula de Tupper tal cual, con aritmética exacta."""
    out = np.zeros((17, width), np.uint8)
    for x in range(width):
        for j in range(17):
            y = k + j
            val = Fraction(y // 17, 2 ** (17 * x + y % 17))
            m = val - 2 * math.floor(val / 2)          # mod(·, 2)
            if math.floor(m) > Fraction(1, 2):
                out[16 - j, x] = 1                     # y crece hacia arriba
    return out


# =============================================================================
#  Programa
# =============================================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="art/bestiario_de_funciones_extranas.png")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--seed", type=int, default=3)
    ap.add_argument("--debug", default="")
    args = ap.parse_args()
    S = args.scale
    rng = np.random.default_rng(args.seed)

    def save_dbg(name, img):
        if args.debug:
            Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(f"{args.debug}/{name}.png")

    IW, IH = int(2260 * S), int(1400 * S)
    ys, xs = np.mgrid[0:IH, 0:IW].astype(np.float64)
    U, V = (xs + 0.5) / IW, (ys + 0.5) / IH
    y_shore = int(0.72 * IH)

    # ------------------------------------------------------------------ I. cielo zeta
    c = borwein_coeffs(64)
    logk = np.log(np.arange(1, 65, dtype=np.float64))
    ppu = 47.0 * S                        # píxeles por unidad del plano complejo
    y_crit = 0.28 * IH                    # recta crítica Re(s) = 1/2
    t_c = 37.586178158825671              # un cero justo en el eje del cuadro
    L, P = zeta_field(y_shore + 4, IW, t_c, IW / 2.0, y_crit, ppu, c, logk)
    log(f"zeta evaluada en {L.size} puntos")
    sig = 0.5 + (y_crit - (ys[:y_shore + 4] + 0.5)) / ppu

    ph = (P / (2 * np.pi)) + 0.5
    dom = lerp_stops(ph, [0.0, 0.25, 0.5, 0.75],
                     [[0.10, 0.05, 0.28], [0.04, 0.42, 0.52], [0.98, 0.78, 0.42], [0.72, 0.13, 0.50]],
                     cyclic=True)
    band = L - np.floor(L)
    dom *= (0.55 + 0.45 * band ** 0.8)[..., None]
    # isolíneas de fase y de módulo, de un píxel de grosor constante
    e = np.exp(1j * P)
    gy_, gx_ = np.gradient(e)
    gph = np.sqrt(np.abs(gx_) ** 2 + np.abs(gy_) ** 2) + 1e-9
    dph = np.abs(((P + np.pi / 8) % (np.pi / 4)) - np.pi / 8)
    iso_p = np.exp(-(dph / gph) ** 2 / 0.7)
    gL = np.hypot(*np.gradient(L)) + 1e-9
    dL = np.abs(L - np.round(L))
    iso_m = np.exp(-(dL / gL) ** 2 / 0.7)
    dom += (iso_p * 0.30 + iso_m * 0.18)[..., None] * np.array([1.0, 0.85, 0.6])

    vv = V[:y_shore + 4]
    night = lerp_stops(vv, [0.0, 0.18, 0.45, 0.62, 0.72],
                       [[0.012, 0.012, 0.035], [0.03, 0.025, 0.08], [0.07, 0.04, 0.14],
                        [0.20, 0.07, 0.24], [0.38, 0.14, 0.30]])
    lum = dom.mean(-1, keepdims=True)
    low = sstep(-0.5, -4.0, sig)[..., None]
    dom = dom * (1 - 0.4 * low) + lum * 0.4 * low
    w = 0.10 + 0.72 * np.exp(-((sig - 0.5) / 1.25) ** 2) + 0.24 * sstep(0.0, -4.0, sig)
    w *= 1 - 0.55 * sstep(0.55, 0.72, vv)
    w = np.clip(w, 0, 0.88)
    sky = night * (1 - w[..., None]) + dom * w[..., None] * (0.35 + 0.65 * sstep(0.0, 0.2, vv))[..., None]

    img = np.zeros((IH, IW, 3))
    img[:y_shore + 4] = sky
    light = np.zeros((IH, IW, 3))  # capa aditiva de cosas que brillan

    # los ceros: mínimos de |ζ| a lo largo de la recta crítica
    row = int(y_crit)
    lr = L[row]
    zx = [i for i in range(2, IW - 2) if lr[i] < lr[i - 1] and lr[i] <= lr[i + 1] and lr[i] < -3]
    zeros_t = [t_c + ((i + 0.5) - IW / 2) / ppu for i in zx]
    log("ceros encontrados en t = " + ", ".join(f"{t:.2f}" for t in zeros_t))
    for i in zx:
        d2 = (xs - i) ** 2 + (ys - y_crit) ** 2
        g = np.exp(-d2 / (2 * (5 * S) ** 2)) * 1.3 + np.exp(-d2 / (2 * (26 * S) ** 2)) * 0.35
        light += g[..., None] * np.array([1.0, 0.86, 0.62])
    save_dbg("01_zeta", img)

    # ------------------------------------------------------------------ II. estrellas de Thomae
    stars = np.zeros((IH, IW))
    Q = 85
    sx, sy, sw = [], [], []
    for q in range(1, Q + 1):
        for p in range(0, q + 1):
            if gcd(p, q) != 1:
                continue
            u = p / q
            v = 0.012 + 0.205 / q
            sx.append(u * (IW - 1))
            sy.append(v * IH)
            sw.append((1.0 / q) ** 1.05)
    splat_points(stars, np.array(sx), np.array(sy), np.array(sw) * 7.0)
    star_img = gblur(stars, 0.8 * S) * 2.2 + gblur(stars, 3.5 * S) * 0.9 + gblur(stars, 14 * S) * 0.5
    # destellos en cruz para los grandes (q ≤ 4)
    for x0, y0, w0 in zip(sx, sy, sw):
        if w0 > 0.24:
            ln = 60 * S * w0
            m = (np.abs(ys - y0) < 1.2 * S) & (np.abs(xs - x0) < ln)
            m2 = (np.abs(xs - x0) < 1.2 * S) & (np.abs(ys - y0) < ln)
            fall = np.exp(-np.abs(xs - x0) / (ln * 0.35)) * m + np.exp(-np.abs(ys - y0) / (ln * 0.35)) * m2
            star_img += fall * 0.55 * w0
    light += star_img[..., None] * np.array([0.95, 0.93, 1.0])
    log(f"estrellas de Thomae: {len(sx)} racionales")

    # ------------------------------------------------------------------ haz: del zigurat al cero
    zig_cx = IW / 2
    plinth_top = 0.745 * IH
    zig_H = plinth_top - 0.455 * IH
    zig_top = plinth_top - zig_H
    beam_n = ndimage.gaussian_filter1d(rng.normal(0, 1, IH), 6 * S)
    dx = np.abs(xs - zig_cx)
    along = sstep(zig_top, y_crit, ys) * (ys < zig_top) * (ys > y_crit - 10 * S)
    fl = 0.85 + 0.3 * beam_n[:, None] / (np.abs(beam_n).max() + 1e-9)
    beam = (np.exp(-(dx / (2.2 * S)) ** 2) * 0.9 + np.exp(-(dx / (16 * S)) ** 2) * 0.22) * \
        (0.35 + 0.65 * along) * (ys < zig_top) * (ys > y_crit) * fl
    light += beam[..., None] * np.array([1.0, 0.82, 0.55])

    # ------------------------------------------------------------------ III. luna de primos
    N = 36000
    sieve = np.ones(N + 1, bool)
    sieve[:2] = False
    for i in range(2, int(N ** 0.5) + 1):
        if sieve[i]:
            sieve[i * i::i] = False
    pr = np.nonzero(sieve)[0].astype(np.float64)
    gal_c = np.array([0.845 * IW, 0.455 * IH])
    gal_R = 185 * S
    r = pr / N * gal_R
    gx = gal_c[0] + r * np.cos(pr)
    gy = gal_c[1] - r * np.sin(pr) * 0.92
    gal = np.zeros((IH, IW))
    splat_points(gal, gx, gy, np.ones_like(gx))
    gal_col = np.zeros((IH, IW, 3))
    rr = np.hypot(xs - gal_c[0], (ys - gal_c[1]) / 0.92) / gal_R
    tint = lerp_stops(np.clip(rr, 0, 1), [0, 0.2, 0.6, 1.0],
                      [[1.0, 0.92, 0.75], [1.0, 0.75, 0.55], [0.55, 0.65, 1.0], [0.55, 0.40, 0.95]])
    gsh = gblur(gal, 0.7 * S) * 1.6 + gblur(gal, 4 * S) * 0.5
    halo = np.exp(-(rr / 0.35) ** 2) * 0.35 + np.exp(-(rr / 1.1) ** 2) * 0.10
    gal_col = (gsh[..., None] + halo[..., None]) * tint
    log(f"luna: {len(pr)} primos")

    # la luna va detrás de las montañas: se suma ya al cielo
    img[:y_shore + 4] += gal_col[:y_shore + 4]
    img += light
    light[:] = 0

    # ------------------------------------------------------------------ V. montañas de Weierstrass
    x = np.arange(IW) / IW
    ranges = [
        # a, b, escala, desplazamiento, base (v), amplitud (v), color, brillo de cresta
        (0.50, 3.0, 1.35, 0.23, 0.600, 0.062, [0.16, 0.10, 0.25], 0.55),
        (0.56, 2.6, 1.10, 0.71, 0.655, 0.050, [0.085, 0.06, 0.15], 0.35),
        (0.60, 3.3, 0.90, 0.37, 0.700, 0.034, [0.035, 0.03, 0.075], 0.22),
    ]
    for (a, b, sc, off, base, amp, col, rim) in ranges:
        wv = weierstrass(x * sc + off, a, b)
        wv = wv / (1 / (1 - a))
        ridge = (base - amp * wv) * IH
        ridge = np.minimum(ridge, y_shore - 2)
        inside = ys >= ridge[None, :]
        depth = np.clip((ys - ridge[None, :]) / (y_shore - ridge[None, :] + 1), 0, 1)
        # textura: la misma función a otra escala, estirada en vertical (estratos)
        tex = weierstrass(x * sc * 7 + off * 3, a, b, 18)[None, :] * 0.5 + 0.5
        tex = tex / (1 / (1 - a))
        body = np.array(col)[None, None, :] * (0.8 + 0.4 * tex[..., None]) * (1 - 0.35 * depth[..., None])
        # cresta encendida por el cielo
        dr = ys - ridge[None, :]
        glow = np.exp(-np.clip(dr, 0, None) / (2.5 * S)) * rim
        body = body + glow[..., None] * np.array([0.95, 0.55, 0.60])
        body = body * (1 - 0.45 * sstep(0.2, 1.0, depth)[..., None]) + \
            np.array([0.30, 0.10, 0.28])[None, None, :] * 0.25 * (1 - depth[..., None]) * (base < 0.62)
        m = inside & (ys < y_shore)
        img[m] = body[m]
    log("montañas de Weierstrass")

    # ------------------------------------------------------------------ IV. fantasma de De Jong
    G = int(900 * S)
    dens, spd = dejong(60_000_000, -2.0, -2.0, -1.2, 2.0, G, 2.2)
    d = np.log1p(dens) / np.log1p(dens.max())
    sp = spd / (dens + 1e-9)
    sp = np.clip((sp - np.percentile(sp[dens > 0], 5)) / (np.percentile(sp[dens > 0], 95) + 1e-9), 0, 1)
    ghost = lerp_stops(sp, [0, 0.5, 1], [[0.15, 0.95, 0.85], [0.75, 0.60, 1.0], [1.0, 0.45, 0.70]])
    ghost *= (d ** 1.25)[..., None] * 1.25
    ghost += gblur(ghost, 6 * S) * 0.6
    gs = int(560 * S)
    ghost_small = np.stack([np.array(Image.fromarray(ghost[..., k].astype(np.float32)).resize((gs, gs), Image.LANCZOS))
                            for k in range(3)], -1)
    gcx, gcy = int(0.175 * IW), int(0.45 * IH)
    x0, y0 = gcx - gs // 2, gcy - gs // 2
    light[max(0, y0):y0 + gs, max(0, x0):x0 + gs] += ghost_small[max(0, -y0):, max(0, -x0):][:IH - max(0, y0), :IW - max(0, x0)]
    log("fantasma de De Jong (60 millones de iteraciones)")

    img += light
    light[:] = 0
    far_layer = img.copy()

    # ------------------------------------------------------------------ VI. zigurat de Cantor + VIII. Tupper
    zig = np.zeros((IH, IW, 3))
    zmask = np.zeros((IH, IW))
    zx0, zx1 = zig_cx - 0.155 * IW, zig_cx + 0.155 * IW
    s = (x * IW - zx0) / (zx1 - zx0)
    inz = (s >= 0) & (s <= 1)
    peak = np.where(s < 0.5, cantor(2 * s), cantor(2 - 2 * s)) * inz
    top = plinth_top - zig_H * peak
    body = inz[None, :] & (ys >= top[None, :]) & (ys < plinth_top)
    # piedra: color base, degradado y juntas
    stone = np.array([0.34, 0.27, 0.33])
    hh = (plinth_top - ys) / zig_H
    shade = 0.55 + 0.55 * hh - 0.35 * np.abs(s[None, :] - 0.5) * 2
    course = (np.mod(ys, 11 * S) < 1.3 * S)
    joint = (np.mod(xs + (np.floor(ys / (11 * S)) % 2) * 9 * S, 18 * S) < 1.2 * S)
    zcol = stone * shade[..., None]
    zcol = zcol * (1 - 0.35 * (course | joint)[..., None])
    # cornisas en cada meseta diádica j/2^m: labio iluminado arriba, sombra debajo
    for mlev in range(1, 7):
        for j in range(1, 2 ** mlev, 2):
            lev = j / 2 ** mlev
            yl = plinth_top - zig_H * lev
            wid = inz & (peak >= lev - 1e-9)
            strength = 1.0 / mlev
            lip = np.exp(-((ys - yl) / (1.3 * S)) ** 2) * strength
            sh = sstep(0, 6 * S, ys - yl) * (1 - sstep(6 * S, 22 * S, ys - yl)) * strength * 0.9
            zcol = zcol + (lip * wid[None, :])[..., None] * np.array([1.0, 0.80, 0.52]) * 0.9
            zcol = zcol * (1 - (sh * wid[None, :])[..., None] * 0.45)
    # borde superior de la silueta tocado por la luz del cero
    dtop = ys - top[None, :]
    zcol += (np.exp(-np.clip(dtop, 0, None) / (1.8 * S)) * inz[None, :])[..., None] * np.array([1.0, 0.78, 0.5]) * 0.8
    zig[body] = zcol[body]
    zmask[body] = 1

    # zócalo con la inscripción de Tupper
    px0, px1 = zig_cx - 0.168 * IW, zig_cx + 0.168 * IW
    plinth_bot = 0.80 * IH
    pm = (xs >= px0) & (xs < px1) & (ys >= plinth_top) & (ys < plinth_bot)
    pcol = np.array([0.22, 0.17, 0.23]) * (0.8 + 0.25 * (plinth_bot - ys) / (plinth_bot - plinth_top))[..., None]
    pcol = pcol * (1 - 0.3 * ((np.mod(xs - px0, 64 * S) < 1.3 * S))[..., None])
    pcol += (np.exp(-np.clip(ys - plinth_top, 0, None) / (1.6 * S)))[..., None] * np.array([0.8, 0.6, 0.4]) * 0.6
    zig[pm] = pcol[pm]
    zmask[pm] = 1

    bm = tupper_bitmap()
    k = tupper_k(bm)
    tw = bm.shape[1]
    plot = tupper_plot(k, tw)
    assert (plot == bm).all(), "la fórmula de Tupper no ha devuelto su propio dibujo"
    log(f"Tupper: {tw}x17 celdas, k con {len(str(k))} cifras; la fórmula se dibuja a sí misma ✔")
    cell = int(round(min((px1 - px0 - 40 * S) / tw, (plinth_bot - plinth_top - 12 * S) / 17)))
    cell = max(cell, 2)
    ix0 = int(zig_cx - tw * cell / 2)
    iy0 = int((plinth_top + plinth_bot) / 2 - 17 * cell / 2)
    ins = np.zeros((IH, IW))
    for r_ in range(17):
        for c_ in range(tw):
            if plot[r_, c_]:
                ins[iy0 + r_ * cell + 1: iy0 + (r_ + 1) * cell, ix0 + c_ * cell + 1: ix0 + (c_ + 1) * cell] = 1
    ins_glow = ins * 1.0 + gblur(ins, 2.5 * S) * 0.9 + gblur(ins, 9 * S) * 0.5
    zig += ins_glow[..., None] * np.array([1.0, 0.72, 0.38]) * zmask[..., None]
    light += gblur(ins, 9 * S)[..., None] * np.array([1.0, 0.72, 0.38]) * 0.3
    log("zigurat de Cantor + inscripción")

    # ------------------------------------------------------------------ lago espejo
    lake = img.copy()
    rows = np.arange(IH)
    yb = int(plinth_bot)
    for y in range(y_shore, IH):
        depth = (y - y_shore) / (IH - y_shore)
        wob = np.sin(xs[0] * 0.045 / S + y * 0.9 / S) * (0.6 + 3.5 * depth) * S \
            + np.sin(xs[0] * 0.011 / S - y * 0.35 / S) * (0.5 + 2.0 * depth) * S
        src = int(2 * y_shore - y)
        srcx = np.clip((xs[0] + wob).astype(int), 0, IW - 1)
        srcy = np.clip(src + (np.sin(xs[0] * 0.02 / S + y * 0.5) * 2 * depth * S).astype(int), 0, IH - 1)
        lake[y] = far_layer[srcy, srcx] * (0.62 - 0.22 * depth) + np.array([0.02, 0.015, 0.05])
        # reflejo del zigurat, respecto a su propia base
        src2 = 2 * yb - y
        if y >= yb and 0 <= src2 < IH:
            sy2 = np.clip(src2 + (np.sin(xs[0] * 0.02 / S + y * 0.5) * 2 * depth * S).astype(int), 0, IH - 1)
            zm = zmask[sy2, srcx]
            lake[y] = lake[y] * (1 - zm[:, None] * 0.85) + (zig[sy2, srcx] + light[sy2, srcx] * 0.5) * zm[:, None] * 0.55
    # brillos horizontales del agua
    streak = (rng.random((IH, IW)) < 0.004).astype(float)
    streak = ndimage.uniform_filter1d(streak, int(30 * S), axis=1) * 30 * S
    streak = gblur(streak, 0.6 * S) * (ys > y_shore)
    lake += streak[..., None] * lake * 0.5
    img[y_shore:] = lake[y_shore:]
    img = img * (1 - zmask[..., None]) + zig * zmask[..., None]
    img += light
    light[:] = 0
    log("lago espejo")

    # ------------------------------------------------------------------ VII. algas de Collatz
    for side, (rx, ang0, mir) in enumerate([(0.045, -math.pi / 2 + 0.28, 1.0), (0.955, -math.pi / 2 - 0.28, -1.0)]):
        acc = np.zeros((IH, IW))
        dep = np.zeros((IH, IW))
        ns = rng.choice(np.arange(2, 1_000_000), 3200, replace=False).astype(np.int64)
        collatz_coral(acc, dep, ns, rx * IW, IH + 4.0, ang0, 2.5 * S, 0.1325, 0.265, mir)
        md = dep / (acc + 1e-9)
        md = np.clip(md / 200.0, 0, 1)
        tone = np.log1p(acc) / np.log1p(np.percentile(acc[acc > 0], 99.7))
        tone = np.clip(tone, 0, 1.3)
        col = lerp_stops(md, [0, 0.35, 0.7, 1.0], [[0.10, 0.85, 0.80], [0.30, 0.55, 1.0],
                                                   [0.95, 0.35, 0.80], [1.0, 0.80, 0.45]])
        coral = col * tone[..., None] ** 1.3
        img += coral * 0.9 + gblur(coral, 5 * S) * 0.45
    log("algas de Collatz")

    # ------------------------------------------------------------------ acabado
    bright = np.clip(img - 0.55, 0, None)
    img += gblur(bright, 10 * S) * 0.35 + gblur(bright, 40 * S) * 0.25
    vx = (U - 0.5) * 1.15
    vy = V - 0.5
    vig = np.clip(1 - (vx * vx + vy * vy) * 0.9, 0, 1)
    img *= (0.55 + 0.45 * vig)[..., None]
    img = img / (1 + 0.12 * img)
    img = np.clip(img * 1.08, 0, 1) ** 0.95
    img += rng.normal(0, 0.008, img.shape)
    img = np.clip(img, 0, 1)
    save_dbg("09_image", img)

    # ------------------------------------------------------------------ lámina: marco y leyenda
    M = int(70 * S)
    TW, TH = IW + 2 * M, int(2080 * S)
    plate = Image.new("RGB", (TW, TH), (14, 12, 20))
    pd = ImageDraw.Draw(plate)
    plate.paste(Image.fromarray((img * 255 + 0.5).astype(np.uint8)), (M, M))
    gold = (201, 168, 112)
    pd.rectangle([M - 9 * S, M - 9 * S, M + IW + 8 * S, M + IH + 8 * S], outline=gold, width=max(1, int(2 * S)))
    pd.rectangle([M - 15 * S, M - 15 * S, M + IW + 14 * S, M + IH + 14 * S], outline=(90, 76, 60), width=1)

    def font(name, size):
        return ImageFont.truetype(FONTS + name, int(size * S))

    f_title = font("freefont/FreeSerifBold.ttf", 44)
    f_sub = font("freefont/FreeSerifItalic.ttf", 23)
    f_name = font("freefont/FreeSansBold.ttf", 19)
    f_form = font("freefont/FreeSerif.ttf", 25)
    f_desc = font("freefont/FreeSans.ttf", 17.5)
    f_mono = font("dejavu/DejaVuSansMono.ttf", 12)
    ink = (226, 214, 196)
    dim = (160, 150, 140)

    y = M + IH + 48 * S
    pd.text((M, y), "BESTIARIO DE FUNCIONES EXTRAÑAS", font=f_title, fill=ink)
    pd.text((M + pd.textlength("BESTIARIO DE FUNCIONES EXTRAÑAS", font=f_title) + 34 * S, y + 17 * S),
            "Lámina II · aquí no hay nada pintado a mano ni generado por IA: cada píxel es una fórmula",
            font=f_sub, fill=dim)
    y += 78 * S
    pd.line([M, y - 14 * S, M + IW, y - 14 * S], fill=(90, 76, 60), width=1)

    entries = [
        ("I · EL CIELO — función zeta de Riemann",
         "ζ(s) = Σ 1 / nˢ   (prolongada a todo el plano complejo)",
         "El color es la fase y los anillos el módulo. Los ojos en fila son sus ceros no triviales: "
         "todos sobre Re(s) = ½… si Riemann tenía razón (un millón de dólares si lo demuestras)."),
        ("II · LAS ESTRELLAS — función de Thomae, «las palomitas»",
         "f(p/q) = 1/q   ·   f(x) = 0  si x es irracional",
         "Discontinua en todos los racionales y continua en todos los irracionales. Aquí cuelga del cielo boca abajo."),
        ("III · LA LUNA — los primos en coordenadas polares",
         "(r, θ) = (p, p)   para cada primo p < 36 000",
         "Salen brazos de galaxia porque 44 radianes son casi 7 vueltas exactas (44 ≈ 14π), y los primos "
         "esquivan los restos pares."),
        ("IV · EL FANTASMA — atractor de Peter de Jong",
         "xₙ₊₁ = sin(a·yₙ) − cos(b·xₙ)     yₙ₊₁ = sin(c·xₙ) − cos(d·yₙ)",
         "Con a = −2, b = −2, c = −1,2 y d = 2, repetidas 60 millones de veces. Nunca pasa dos veces por el "
         "mismo sitio y aun así no se sale de esa forma."),
        ("V · LAS MONTAÑAS — función de Weierstrass",
         "W(x) = Σ aⁿ cos(bⁿ π x)    0 < a < 1,  ab ≥ 1",
         "Continua en todos sus puntos y derivable en ninguno: un monstruo que sigue teniendo picos "
         "por mucho zoom que le metas."),
        ("VI · EL ZIGURAT — función de Cantor, la «escalera del diablo»",
         "c(x):  x en base 3, corta tras el primer 1, cambia los 2 por 1 y léelo en base 2",
         "Sube de 0 a 1 sin saltos y, sin embargo, es plana en casi todas partes. Cada cornisa es una meseta j/2ᵐ."),
        ("VII · LAS ALGAS — conjetura de Collatz",
         "n → n/2  si n es par   ·   n → 3n + 1  si es impar",
         "Cada rama es el viaje de un número hasta el 1: par gira a un lado, impar al otro. "
         "Nadie ha demostrado que todos lleguen."),
        ("VIII · LA INSCRIPCIÓN — fórmula autorreferente de Tupper",
         "½ < ⌊ mod( ⌊y/17⌋ · 2^(−17⌊x⌋ − mod(⌊y⌋, 17)), 2 ) ⌋",
         "Pintada entre k ≤ y < k + 17 se dibuja a sí misma. El k de esta lámina (calculado para "
         "este dibujo y comprobado con la fórmula) está a la derecha."),
    ]

    def wrap(text, fnt, width):
        words = text.split(" ")
        lines, cur = [], ""
        for w_ in words:
            t = (cur + " " + w_).strip()
            if pd.textlength(t, font=fnt) <= width:
                cur = t
            else:
                lines.append(cur)
                cur = w_
        lines.append(cur)
        return lines

    colw = 790 * S
    cols_x = [M, M + 830 * S]
    for idx, (name, form, desc) in enumerate(entries):
        cx = cols_x[idx // 4]
        cy = y + (idx % 4) * 112 * S
        pd.text((cx, cy), name, font=f_name, fill=gold)
        pd.text((cx, cy + 25 * S), form, font=f_form, fill=ink)
        for li, line in enumerate(wrap(desc, f_desc, colw)[:2]):
            pd.text((cx, cy + 59 * S + li * 21 * S), line, font=f_desc, fill=dim)

    # el número k, entero
    kx = M + 1680 * S
    pd.text((kx, y), "k =", font=f_name, fill=gold)
    ks = str(k)
    per = int((M + IW - kx) / pd.textlength("0", font=f_mono))
    for li in range(0, len(ks), per):
        pd.text((kx, y + 30 * S + (li // per) * 15.5 * S), ks[li:li + per], font=f_mono, fill=dim)

    plate.save(args.out, optimize=True)
    log(f"guardado {args.out}  ({TW}x{TH})")


if __name__ == "__main__":
    main()
