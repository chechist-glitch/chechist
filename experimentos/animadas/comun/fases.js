// Vídeo "se va haciendo por fases" para piezas de Canvas que se dibujan en orden.
// La pieza llama a marca() después de cada fase; al acabar, preparar() deja window.pintar listo.
// Cada fase entra con una máscara (ruido = como agua que moja, barrido = como una pluma que avanza).
function crearFases({ fuente = "c", VW = 720, VH = 900, t0 = 0.3, t1 = 8.8, entrada = 0.85, mascara = "ruido", semilla = 70 }) {
  const fotos = [];
  const src = document.getElementById(fuente);
  const marca = () => {
    const c = document.createElement("canvas"); c.width = VW; c.height = VH;
    const g = c.getContext("2d"); g.drawImage(src, 0, 0, VW, VH);
    fotos.push(g.getImageData(0, 0, VW, VH).data);
  };
  const preparar = () => {
    const v = document.createElement("canvas");
    v.className = "full"; v.width = VW; v.height = VH;
    src.after(v); src.style.visibility = "hidden";
    const vc = v.getContext("2d");
    const img = vc.createImageData(VW, VH);
    const m = new Float32Array(VW * VH);
    const ruido = makeNoise(semilla);
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      const k = y * VW + x;
      if (mascara === "barrido") m[k] = (x / VW) * 0.35 + (y / VH) * 0.45 + ruido(x * 0.03, y * 0.03, 3) * 0.2;
      else m[k] = ruido(x * 0.012, y * 0.012, 4);
    }
    const N = fotos.length;
    const paso = (t1 - t0) / Math.max(1, N - 1);
    window.pintar = (t) => {
      const f = Math.max(0, (t - t0) / paso);
      const i = Math.min(N - 1, Math.floor(f));
      const u = Math.min(1, (f - i) / entrada);
      const d = img.data;
      if (i >= N - 1 || u <= 0) d.set(fotos[i]);
      else {
        const a = fotos[i], b = fotos[i + 1];
        for (let k = 0; k < VW * VH; k++) {
          const w = Math.min(1, Math.max(0, (u * 1.6 - m[k]) * 4));
          const q = k * 4;
          d[q] = a[q] + (b[q] - a[q]) * w; d[q + 1] = a[q + 1] + (b[q + 1] - a[q + 1]) * w; d[q + 2] = a[q + 2] + (b[q + 2] - a[q + 2]) * w; d[q + 3] = 255;
        }
      }
      vc.putImageData(img, 0, 0);
    };
  };
  return { marca, preparar, fotos };
}
