// Utilidades extra para la serie 3 (se carga después de lib.js).
// Todo va dentro de M para no chocar con nombres de las piezas antiguas.

const M = {
  clamp: (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)),
  lerp: (a, b, t) => a + (b - a) * t,
  smooth(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  },
  // Mezcla de colores [r,g,b]
  mezcla: (c1, c2, t) => c1.map((v, i) => v + (c2[i] - v) * Math.max(0, Math.min(1, t))),
  rgb: (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`,
  hex: (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)),

  // Rampa de color con varias paradas: [[t, "#hex"], ...] → función t → [r,g,b]
  rampa(paradas) {
    const p = paradas.map(([t, c]) => [t, typeof c === "string" ? M.hex(c) : c]);
    return (t) => {
      if (t <= p[0][0]) return p[0][1];
      for (let i = 1; i < p.length; i++) {
        if (t <= p[i][0]) return M.mezcla(p[i - 1][1], p[i][1], (t - p[i - 1][0]) / (p[i][0] - p[i - 1][0]));
      }
      return p[p.length - 1][1];
    };
  },

  // Lienzo auxiliar fuera de pantalla
  lienzo(w = W, h = H) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return { c, x: c.getContext("2d", { willReadFrequently: true }) };
  },

  // Pinta píxel a píxel: fn(x, y) → [r,g,b]. Con ss > 1 hace supermuestreo.
  porPixel(ctx, fn, ss = 1) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
          const c = fn(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss);
          r += c[0]; g += c[1]; b += c[2];
        }
        const k = (y * w + x) * 4, n = ss * ss;
        d[k] = r / n; d[k + 1] = g / n; d[k + 2] = b / n; d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  // Grano uniforme (papel o película)
  grano(ctx, fuerza = 10, semilla = 1) {
    const r = rng(semilla);
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = (r() - 0.5) * fuerza;
      d[i] += g; d[i + 1] += g; d[i + 2] += g;
    }
    ctx.putImageData(img, 0, 0);
  },

  // Textura de papel: fibras y manchas suaves, multiplicada sobre lo que haya
  papel(ctx, fuerza = 1, semilla = 3) {
    const r = rng(semilla);
    const n = makeNoise(semilla);
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      const v = 1 + fuerza * ((n(x * 0.004, y * 0.004, 3) - 0.5) * 0.08 + (n(x * 0.08, y * 0.02, 2) - 0.5) * 0.05 + (r() - 0.5) * 0.04);
      d[k] *= v; d[k + 1] *= v; d[k + 2] *= v;
    }
    ctx.putImageData(img, 0, 0);
  },

  // Puntos repartidos sin grumos (Poisson disc, Bridson)
  poisson(radio, rnd, w = W, h = H, intentos = 20) {
    const celda = radio / Math.SQRT2;
    const gw = Math.ceil(w / celda), gh = Math.ceil(h / celda);
    const rejilla = new Int32Array(gw * gh).fill(-1);
    const pts = [];
    const activos = [];
    const mete = (p) => {
      pts.push(p);
      activos.push(pts.length - 1);
      rejilla[Math.floor(p[1] / celda) * gw + Math.floor(p[0] / celda)] = pts.length - 1;
    };
    mete([rnd() * w, rnd() * h]);
    while (activos.length) {
      const ai = Math.floor(rnd() * activos.length);
      const p = pts[activos[ai]];
      let ok = false;
      for (let k = 0; k < intentos; k++) {
        const a = rnd() * Math.PI * 2, d = radio * (1 + rnd());
        const q = [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d];
        if (q[0] < 0 || q[1] < 0 || q[0] >= w || q[1] >= h) continue;
        const gx = Math.floor(q[0] / celda), gy = Math.floor(q[1] / celda);
        let lejos = true;
        for (let y = Math.max(0, gy - 2); y <= Math.min(gh - 1, gy + 2) && lejos; y++)
          for (let x = Math.max(0, gx - 2); x <= Math.min(gw - 1, gx + 2); x++) {
            const i = rejilla[y * gw + x];
            if (i >= 0 && Math.hypot(pts[i][0] - q[0], pts[i][1] - q[1]) < radio) { lejos = false; break; }
          }
        if (lejos) { mete(q); ok = true; break; }
      }
      if (!ok) activos.splice(ai, 1);
    }
    return pts;
  },

  // Espera a que carguen las fuentes que se van a usar en el canvas
  fuentes: (...lista) => Promise.all(lista.map((f) => document.fonts.load(f))),
};
