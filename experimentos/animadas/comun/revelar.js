// La imagen final "se revela" como en su proceso físico, calculado píxel a píxel:
//   cmyk: imprenta offset, pasa una plancha cada vez (cian, magenta, amarillo, negro), con su rodillo
//   tinta: revelado de papel (cianotipia, foto): salen antes las zonas más oscuras
//   luz:   película o cámara (rayos X, térmica): salen antes las zonas más claras o calientes
// Uso al final de la pieza: revelar({ modo, papel: [r,g,b] }); listo();
function revelar({ fuente = "c", modo = "tinta", papel = null, t0 = 0.3, t1 = 8.6, VW = 720, VH = 900, suave = 0.12, semilla = 3 } = {}) {
  const src = document.getElementById(fuente);
  const c0 = document.createElement("canvas"); c0.width = VW; c0.height = VH;
  const g0 = c0.getContext("2d"); g0.drawImage(src, 0, 0, VW, VH);
  const fin = g0.getImageData(0, 0, VW, VH).data;
  const v = document.createElement("canvas"); v.className = "full"; v.width = VW; v.height = VH;
  src.after(v); src.style.visibility = "hidden";
  const g = v.getContext("2d");
  const img = g.createImageData(VW, VH), o = img.data;
  const n = makeNoise(semilla);
  const N = VW * VH;
  const L = new Float32Array(N), ru = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    L[k] = (fin[k * 4] * 0.3 + fin[k * 4 + 1] * 0.59 + fin[k * 4 + 2] * 0.11) / 255;
    ru[k] = (n((k % VW) * 0.01, ((k / VW) | 0) * 0.01, 3) - 0.5) * 0.25;
  }
  const P = papel || (modo === "luz" ? [6, 8, 12] : [244, 240, 228]);
  let C, Mg, Y, K;
  if (modo === "cmyk") {
    C = new Float32Array(N); Mg = new Float32Array(N); Y = new Float32Array(N); K = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const r = fin[k * 4] / 255, gg = fin[k * 4 + 1] / 255, b = fin[k * 4 + 2] / 255;
      const kk = 1 - Math.max(r, gg, b), d = 1 - kk || 1;
      C[k] = (1 - r - kk) / d; Mg[k] = (1 - gg - kk) / d; Y[k] = (1 - b - kk) / d; K[k] = kk;
    }
  }
  const cl = (u) => Math.min(1, Math.max(0, u));
  window.pintar = (t) => {
    const u = cl((t - t0) / (t1 - t0));
    if (modo === "cmyk") {
      // cada plancha entra barriendo de arriba abajo, con un pelín de descuadre que se corrige
      const plancha = (i) => { const a = i / 4, b = (i + 1) / 4; return cl((u - a) / (b - a)); };
      const pc = plancha(0), pm = plancha(1), py = plancha(2), pk = plancha(3);
      const desc = [pc, pm, py, pk].map((p, i) => Math.round((1 - p) * 6 * (i % 2 ? 1 : -1)));
      for (let y = 0; y < VH; y++) {
        const fy = y / VH;
        const on = [pc, pm, py, pk].map((p) => (fy < p * 1.15 - 0.1 ? 1 : fy < p * 1.15 ? (p * 1.15 - fy) / 0.1 : 0));
        for (let x = 0; x < VW; x++) {
          const k = y * VW + x;
          const kx = (i) => y * VW + Math.min(VW - 1, Math.max(0, x + desc[i]));
          const c = C[kx(0)] * on[0], m = Mg[kx(1)] * on[1], yy = Y[kx(2)] * on[2], kk = K[kx(3)] * on[3];
          o[k * 4] = P[0] * (1 - c) * (1 - kk); o[k * 4 + 1] = P[1] * (1 - m) * (1 - kk); o[k * 4 + 2] = P[2] * (1 - yy) * (1 - kk); o[k * 4 + 3] = 255;
        }
      }
    } else {
      const umbral = -0.15 + u * 1.3;
      for (let k = 0; k < N; k++) {
        const val = (modo === "tinta" ? L[k] : 1 - L[k]) + ru[k];
        const w = cl((umbral - val) / suave + 0.5);
        const q = k * 4;
        o[q] = P[0] + (fin[q] - P[0]) * w; o[q + 1] = P[1] + (fin[q + 1] - P[1]) * w; o[q + 2] = P[2] + (fin[q + 2] - P[2]) * w; o[q + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  };
}
