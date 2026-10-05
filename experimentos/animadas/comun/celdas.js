// La pieza se hace celda a celda, como el oficio que imita: punto de cruz, tesela, ladrillo de
// juguete, punto de jersey, pasada de telar o línea de pantalla. Se parte de la imagen final:
// al principio se ve la "base" (tela, mortero o pantalla vacía, con el dibujo muy tenue) y cada
// fotograma coloca las celdas siguientes, la última con un pequeño salto.
// Uso al final de la pieza: revelarPorCeldas({ cw, ch, ox, oy, cols, filas, orden, base }); listo();
function revelarPorCeldas({ fuente = "c", cw = 12, ch = 12, ox = 0, oy = 0, cols = null, filas = null, orden = "filas", base = null, tenue = 0.12, t0 = 0.3, t1 = 8.8, salto = 1.6 }) {
  const src = document.getElementById(fuente);
  const W0 = src.width, H0 = src.height;
  const fin = document.createElement("canvas"); fin.width = W0; fin.height = H0;
  fin.getContext("2d").drawImage(src, 0, 0);
  cols = cols || Math.ceil((W0 - ox) / cw);
  filas = filas || Math.ceil((H0 - oy) / ch);
  // base: un color liso (la tela) con el dibujo final muy tenue encima, como un patrón impreso
  const fondo = document.createElement("canvas"); fondo.width = W0; fondo.height = H0;
  const fg = fondo.getContext("2d");
  if (typeof base === "function") base(fg, fin);
  else {
    fg.fillStyle = base || "#ece4d2"; fg.fillRect(0, 0, W0, H0);
    fg.globalAlpha = tenue; fg.filter = "grayscale(1) contrast(.8)"; fg.drawImage(fin, 0, 0); fg.globalAlpha = 1; fg.filter = "none";
  }
  // fuera de la rejilla (marcos, rótulos) se ve ya la imagen final
  fg.save(); fg.beginPath(); fg.rect(0, 0, W0, H0); fg.rect(ox, oy, cols * cw, filas * ch); fg.clip("evenodd"); fg.drawImage(fin, 0, 0); fg.restore();
  const celdas = [];
  for (let j = 0; j < filas; j++) for (let i = 0; i < cols; i++) celdas.push([i, j]);
  const r = rng(5);
  if (orden === "filas") celdas.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  else if (orden === "filas-abajo") celdas.sort((a, b) => b[1] - a[1] || ((b[1] % 2) ? a[0] - b[0] : b[0] - a[0]));
  else if (orden === "zigzag") celdas.sort((a, b) => a[1] - b[1] || ((a[1] % 2) ? b[0] - a[0] : a[0] - b[0]));
  else if (orden === "centro") { const cx = cols / 2, cy = filas / 2; celdas.forEach((c) => (c.d = Math.hypot(c[0] - cx, (c[1] - cy) * ch / cw) + r() * 3)); celdas.sort((a, b) => a.d - b.d); }
  else if (orden === "abajo") celdas.sort((a, b) => b[1] - a[1] + (r() - 0.5) * 0.9);
  else for (let k = celdas.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); [celdas[k], celdas[m]] = [celdas[m], celdas[k]]; }
  const acum = document.createElement("canvas"); acum.width = W0; acum.height = H0;
  const ag = acum.getContext("2d");
  ag.drawImage(fondo, 0, 0);
  const v = document.createElement("canvas"); v.className = "full"; v.width = W0; v.height = H0;
  src.after(v); src.style.visibility = "hidden";
  const g = v.getContext("2d");
  let hechas = 0;
  const N = celdas.length;
  const pon = (ctx, [i, j], k = 1) => {
    const x = ox + i * cw, y = oy + j * ch;
    if (k >= 1) ctx.drawImage(fin, x, y, cw, ch, x, y, cw, ch);
    else { const s = k, w = cw * s, h = ch * s; ctx.drawImage(fin, x, y, cw, ch, x + (cw - w) / 2, y + (ch - h) / 2, w, h); }
  };
  window.pintar = (t) => {
    const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const objetivo = Math.floor(N * u);
    // las celdas que ya acabaron su salto se pegan al acumulado
    const ventana = Math.max(1, Math.floor(N * 0.006 * salto));
    while (hechas < objetivo - ventana) pon(ag, celdas[hechas++]);
    g.drawImage(acum, 0, 0);
    for (let k = hechas; k < objetivo; k++) {
      const q = (objetivo - k) / ventana;
      const s = 1 + 0.35 * Math.sin(Math.min(1, q) * Math.PI) * (1 - Math.min(1, q));
      pon(g, celdas[k], Math.min(1.35, 0.4 + q * 0.9));
    }
    if (u >= 1) { while (hechas < N) pon(ag, celdas[hechas++]); g.drawImage(acum, 0, 0); }
  };
}
