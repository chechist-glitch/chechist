// Vídeo "se va haciendo por fases" para piezas de Canvas que se dibujan en orden.
// La pieza llama a marca() después de cada fase; al acabar, preparar() deja window.pintar listo.
// Cada fase entra con una máscara (ruido = como agua que moja, barrido = como una pluma que avanza).
function crearFases({ fuente = "c", VW = 720, VH = 900, t0 = 0.3, t1 = 8.8, entrada = 0.85, mascara = "ruido", semilla = 70 }) {
  const fotos = [];
  const src = document.getElementById(fuente);
  const marca = () => {
    if (src.width < 500) return; // el lienzo aún no tiene su tamaño
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
    // Fuera las fases que no acercan a la imagen final (lienzos usados de borrador, mapas
    // intermedios...) y las que casi no cambian nada. Cada transición dura según lo que cambia.
    const fin = fotos[fotos.length - 1];
    const dist = (a) => { let s = 0, c = 0; for (let k = 0; k < a.length; k += 4 * 7) { s += Math.abs(a[k] - fin[k]) + Math.abs(a[k + 1] - fin[k + 1]) + Math.abs(a[k + 2] - fin[k + 2]); c++; } return s / c; };
    const ds = fotos.map(dist);
    // una fase vale si casi todos sus píxeles son o como al principio o como al final
    // (un lienzo usado de borrador tiene muchos píxeles que no son ni una cosa ni otra)
    const ini = fotos[0];
    const coherente = (a) => { let ok = 0, c = 0; for (let k = 0; k < a.length; k += 4 * 11) { const df = Math.abs(a[k] - fin[k]) + Math.abs(a[k + 1] - fin[k + 1]) + Math.abs(a[k + 2] - fin[k + 2]); const di = Math.abs(a[k] - ini[k]) + Math.abs(a[k + 1] - ini[k + 1]) + Math.abs(a[k + 2] - ini[k + 2]); if (df < 40 || di < 40) ok++; c++; } return ok / c; };
    const quedan = [0];
    for (let k = 1; k < fotos.length; k++) {
      const ult = ds[quedan[quedan.length - 1]];
      if (k === fotos.length - 1 || (ds[k] < ult - 2 && coherente(fotos[k]) > 0.8)) quedan.push(k);
    }
    const sel = quedan.map((k) => fotos[k]);
    fotos.length = 0; fotos.push(...sel);
    const N = fotos.length;
    const pesos = [];
    for (let k = 1; k < N; k++) pesos.push(Math.pow(Math.max(1, ds[quedan[k - 1]] - ds[quedan[k]]), 0.6) + 2);
    const totalP = pesos.reduce((a, b) => a + b, 0) || 1;
    const inicio = [t0];
    for (const w of pesos) inicio.push(inicio[inicio.length - 1] + (t1 - t0) * w / totalP);
    window.pintar = (t) => {
      let i = 0;
      while (i < N - 1 && t >= inicio[i + 1]) i++;
      const dur = (inicio[i + 1] || t1) - inicio[i];
      const u = i >= N - 1 ? 1 : Math.min(1, Math.max(0, (t - inicio[i]) / (dur * entrada)));
      const d = img.data;
      if (t < t0) d.set(fotos[0]);
      else if (i >= N - 1 || u <= 0) d.set(fotos[i]);
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
