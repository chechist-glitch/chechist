// Acabado analógico: que lo hecho con código parezca material físico fotografiado.
// Se carga después de lib.js y mas.js. Todo trabaja sobre lienzos 2D.

const A = {
  // Copia de un lienzo con un filtro CSS de canvas (blur, contrast...)
  filtrado(src, filtro, w = src.width, h = src.height) {
    const o = M.lienzo(w, h);
    o.x.filter = filtro;
    o.x.drawImage(src, 0, 0, w, h);
    return o;
  },

  // Ruido gaussiano barato
  gauss(r) {
    return (r() + r() + r() + r() - 2) * 0.866;
  },

  // Relieve de papel: grano fino, fibras y ondulación; devuelve alturas 0..1
  relieve(w, h, semilla = 5, { grano = 1, fibras = 1, escala = 1 } = {}) {
    const n = makeNoise(semilla);
    const r = rng(semilla);
    const alto = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = 0.55 * n(x * 0.22 / escala, y * 0.22 / escala, 3) * grano + 0.3 * n(x * 0.05 / escala, y * 0.05 / escala, 2) + 0.15 * (r() - 0.5) * grano;
      alto[y * w + x] = v;
    }
    // fibras: trazos finos levantados
    for (let k = 0; k < (w * h) / 900 * fibras; k++) {
      let x = r() * w, y = r() * h, a = r() * Math.PI * 2;
      const L = 10 + r() * 50;
      for (let i = 0; i < L; i++) {
        x += Math.cos(a); y += Math.sin(a); a += (r() - 0.5) * 0.3;
        const xi = x | 0, yi = y | 0;
        if (xi >= 0 && yi >= 0 && xi < w && yi < h) alto[yi * w + xi] += 0.12;
      }
    }
    return alto;
  },

  // Sombrea un lienzo con un relieve iluminado con luz rasante (papel, lienzo, empaste)
  iluminar(ctx, alto, { fuerza = 1, luz = [-0.6, -0.7, 0.45], brillo = 0 } = {}) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const lm = Math.hypot(...luz);
    const L = luz.map((v) => v / lm);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const dx = (alto[i + 1] - alto[i - 1]) * fuerza, dy = (alto[i + w] - alto[i - w]) * fuerza;
      const nm = Math.hypot(dx, dy, 1);
      const nx = -dx / nm, ny = -dy / nm, nz = 1 / nm;
      const dif = nx * L[0] + ny * L[1] + nz * L[2];
      let k = (0.55 + 0.6 * dif) / (0.55 + 0.6 * L[2]);
      const k4 = i * 4;
      let s = 0;
      if (brillo) {
        // reflejo especular (óleo, barniz)
        const hz = L[2] + 1, hx = L[0], hy = L[1], hm = Math.hypot(hx, hy, hz);
        s = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hm), 40) * brillo * 255;
      }
      d[k4] = d[k4] * k + s; d[k4 + 1] = d[k4 + 1] * k + s; d[k4 + 2] = d[k4 + 2] * k + s;
    }
    ctx.putImageData(img, 0, 0);
  },

  // Emulación de película: halo rojo en las luces, suavidad de lente, aberración cromática,
  // curva y viraje de color, grano en racimos, viñeta y motas de polvo
  pelicula(ctx, o = {}) {
    const {
      halo = 0.5, florecer = 0.15, suave = 0.7, aberracion = 0.0018, grano = 0.06,
      levantar = 0.04, viraje = 1, saturacion = 0.92, vineta = 0.35, polvo = 0.5, semilla = 77, calido = 1,
    } = o;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const r = rng(semilla);
    const base = ctx.getImageData(0, 0, w, h);
    // luces para el halo
    const luces = M.lienzo(w, h);
    const li = luces.x.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const k = i * 4;
      const L = (base.data[k] * 0.3 + base.data[k + 1] * 0.59 + base.data[k + 2] * 0.11) / 255;
      const v = Math.max(0, (L - 0.72) / 0.28);
      li.data[k] = base.data[k] * v; li.data[k + 1] = base.data[k + 1] * v; li.data[k + 2] = base.data[k + 2] * v; li.data[k + 3] = 255;
    }
    luces.x.putImageData(li, 0, 0);
    const haloC = A.filtrado(luces.c, "blur(16px)");
    const florC = A.filtrado(luces.c, "blur(5px)");
    const blando = A.filtrado(ctx.canvas, `blur(${suave}px)`);
    const hd = haloC.x.getImageData(0, 0, w, h).data;
    const fd = florC.x.getImageData(0, 0, w, h).data;
    const bd = blando.x.getImageData(0, 0, w, h).data;
    // grano en racimos: ruido a baja resolución reescalado
    const gw = Math.ceil(w / 2), gh = Math.ceil(h / 2);
    const gr = M.lienzo(gw, gh);
    const gi = gr.x.createImageData(gw, gh);
    for (let i = 0; i < gw * gh; i++) { const v = 128 + A.gauss(r) * 60; gi.data[i * 4] = gi.data[i * 4 + 1] = gi.data[i * 4 + 2] = v; gi.data[i * 4 + 3] = 255; }
    gr.x.putImageData(gi, 0, 0);
    const grC = M.lienzo(w, h);
    grC.x.drawImage(gr.c, 0, 0, w, h);
    const gd = grC.x.getImageData(0, 0, w, h).data;
    const out = ctx.createImageData(w, h);
    const od = out.data;
    const cx = w / 2, cy = h / 2, diag = Math.hypot(cx, cy);
    const muestra = (x, y, c) => {
      x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y));
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
      const a = bd[(y0 * w + x0) * 4 + c], b = bd[(y0 * w + x1) * 4 + c], e = bd[(y1 * w + x0) * 4 + c], f = bd[(y1 * w + x1) * 4 + c];
      return (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + f * fx) * fy;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, k = i * 4;
      const dx = x - cx, dy = y - cy;
      let R = muestra(cx + dx * (1 + aberracion), cy + dy * (1 + aberracion), 0) / 255;
      let G = bd[k + 1] / 255;
      let B = muestra(cx + dx * (1 - aberracion), cy + dy * (1 - aberracion), 2) / 255;
      // halo rojizo y florecido
      R += (hd[k] / 255) * halo * 1.0 + (fd[k] / 255) * florecer;
      G += (hd[k + 1] / 255) * halo * 0.35 + (fd[k + 1] / 255) * florecer;
      B += (hd[k + 2] / 255) * halo * 0.12 + (fd[k + 2] / 255) * florecer;
      // curva de película: negros levantados y altas luces que se doblan suaves
      const curva = (v) => { v = Math.max(0, v); v = v / (1 + v * 0.35) * 1.18; return levantar + (1 - levantar * 1.6) * (v * v * (3 - 2 * v) * 0.6 + v * 0.4); };
      R = curva(Math.min(1.4, R)); G = curva(Math.min(1.4, G)); B = curva(Math.min(1.4, B));
      const Lm = R * 0.3 + G * 0.59 + B * 0.11;
      R = Lm + (R - Lm) * saturacion; G = Lm + (G - Lm) * saturacion; B = Lm + (B - Lm) * saturacion;
      // viraje: sombras frías y verdosas, luces cálidas
      const sombra = 1 - Lm, luz = Lm;
      R += (-0.015 * sombra + 0.035 * luz * calido) * viraje;
      G += (0.012 * sombra + 0.012 * luz) * viraje;
      B += (0.03 * sombra - 0.035 * luz * calido) * viraje;
      // grano: más en medios tonos
      const g = ((gd[k] - 128) / 60 * 0.6 + A.gauss(r) * 0.55) * grano * (0.45 + Lm * (1 - Lm) * 2.2);
      R += g; G += g * 0.96; B += g * 1.05;
      const v = 1 - vineta * Math.pow(Math.hypot(dx, dy) / diag, 2.2);
      od[k] = R * v * 255; od[k + 1] = G * v * 255; od[k + 2] = B * v * 255; od[k + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    // polvo y pelos del escáner
    for (let i = 0; i < 60 * polvo; i++) {
      ctx.fillStyle = r() < 0.7 ? `rgba(255,255,255,${0.25 + r() * 0.4})` : `rgba(0,0,0,${0.2 + r() * 0.3})`;
      ctx.beginPath();
      ctx.arc(r() * w, r() * h, 0.6 + r() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 4 * polvo; i++) {
      let x = r() * w, y = r() * h, a = r() * 6.28;
      ctx.strokeStyle = `rgba(255,255,255,${0.2 + r() * 0.25})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 30; k++) { x += Math.cos(a) * 2; y += Math.sin(a) * 2; a += (r() - 0.5) * 0.5; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },

  // Homografía: cuadrado unidad → cuadrilátero (y su inversa)
  homografia(q) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
    const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
    const Hm = [a, b, c, d, e, f, g, h, 1];
    // inversa 3×3
    const [A1, B1, C1, D1, E1, F1, G1, H1, I1] = Hm;
    const co = [E1 * I1 - F1 * H1, C1 * H1 - B1 * I1, B1 * F1 - C1 * E1, F1 * G1 - D1 * I1, A1 * I1 - C1 * G1, C1 * D1 - A1 * F1, D1 * H1 - E1 * G1, B1 * G1 - A1 * H1, A1 * E1 - B1 * D1];
    const det = A1 * co[0] + B1 * co[3] + C1 * co[6];
    return co.map((v) => v / det);
  },

  // Coloca una obra (lienzo) en perspectiva sobre lo que ya hay pintado en ctx,
  // con sombra, curvatura del papel y luz de ventana. esquinas: sup-izq, sup-der, inf-der, inf-izq
  colocar(ctx, obra, esquinas, { sombra = 0.45, curva = 6, luz = [0.25, 0.2], brillo = 0.08, borde = true } = {}) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    // sombra difusa
    ctx.save();
    ctx.filter = "blur(22px)";
    ctx.fillStyle = `rgba(20,12,6,${sombra})`;
    ctx.beginPath();
    esquinas.forEach(([x, y], i) => (i ? ctx.lineTo(x + 16, y + 22) : ctx.moveTo(x + 16, y + 22)));
    ctx.fill();
    ctx.restore();
    const Hi = A.homografia(esquinas);
    const sw = obra.width, sh = obra.height;
    const src = obra.getContext("2d").getImageData(0, 0, sw, sh).data;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const xs = esquinas.map((p) => p[0]), ys = esquinas.map((p) => p[1]);
    const X0 = Math.max(0, Math.floor(Math.min(...xs))), X1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
    const Y0 = Math.max(0, Math.floor(Math.min(...ys))), Y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const zz = Hi[6] * x + Hi[7] * y + Hi[8];
      let u = (Hi[0] * x + Hi[1] * y + Hi[2]) / zz, v = (Hi[3] * x + Hi[4] * y + Hi[5]) / zz;
      if (u < 0 || v < 0 || u > 1 || v > 1) continue;
      // curvatura: el papel se ondula un poco hacia los bordes
      const ond = Math.sin(u * Math.PI) * Math.sin(v * Math.PI * 0.5 + 0.3);
      const sx = Math.min(sw - 1.001, Math.max(0, u * (sw - 1))), sy = Math.min(sh - 1.001, Math.max(0, v * (sh - 1) + ond * curva * 0.2));
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const k = (y * w + x) * 4;
      const sombreado = 0.9 + 0.12 * (1 - Math.hypot(u - luz[0], v - luz[1])) + Math.cos(u * 9 + v * 3) * curva * 0.002;
      const reflejo = brillo * Math.exp(-Math.pow((u + v * 0.6 - 0.5) / 0.12, 2));
      let aa = 1;
      if (borde) aa = Math.min(1, Math.min(u, v, 1 - u, 1 - v) * Math.min(sw, sh) * 1.2);
      aa *= src[(y0 * sw + x0) * 4 + 3] / 255;
      if (aa <= 0) continue;
      for (let c = 0; c < 3; c++) {
        const p00 = src[(y0 * sw + x0) * 4 + c], p10 = src[(y0 * sw + x0 + 1) * 4 + c];
        const p01 = src[((y0 + 1) * sw + x0) * 4 + c], p11 = src[((y0 + 1) * sw + x0 + 1) * 4 + c];
        const val = ((p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy) * sombreado + reflejo * 255;
        d[k + c] = d[k + c] * (1 - aa) + val * aa;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  // Superficies para fotografiar encima
  mesaMadera(ctx, semilla = 3, tono = [150, 102, 64]) {
    const n = makeNoise(semilla);
    M.porPixel(ctx, (x, y) => {
      const tabla = Math.floor((x + n(y * 0.002, 1, 1) * 40) / 230);
      const veta = n(x * 0.012 + tabla * 13, y * 0.0012, 4);
      const anillo = 0.5 + 0.5 * Math.sin(veta * 40 + tabla);
      const junta = ((x + n(y * 0.002, 1, 1) * 40) % 230) < 3 ? 0.55 : 1;
      const v = (0.72 + anillo * 0.22 + n(x * 0.3, y * 0.01, 2) * 0.12) * junta;
      return tono.map((c) => c * v);
    });
  },
  pared(ctx, semilla = 4, tono = [214, 206, 192]) {
    const n = makeNoise(semilla);
    M.porPixel(ctx, (x, y) => {
      const v = 0.86 + n(x * 0.01, y * 0.01, 5) * 0.2 + (n(x * 0.15, y * 0.15, 2) - 0.5) * 0.08;
      const mancha = n(x * 0.002, y * 0.003, 3) > 0.6 ? 0.92 : 1;
      return tono.map((c) => c * v * mancha);
    });
  },
};
