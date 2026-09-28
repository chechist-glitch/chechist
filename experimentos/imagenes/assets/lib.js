// Utilidades compartidas: azar con semilla, ruido y lienzo a tamaño fijo.
// Todo es determinista: la misma semilla da siempre la misma imagen.

const W = 1080;
const H = 1350;

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ruido de valor 2D suavizado con octavas
function makeNoise(seed) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = r();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  function n2(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const v = (i, j) => vals[perm[perm[xi + i] + yi + j]];
    const u = fade(xf);
    const w = fade(yf);
    return lerp(lerp(v(0, 0), v(1, 0), u), lerp(v(0, 1), v(1, 1), u), w);
  }
  return function (x, y, oct = 4) {
    let s = 0;
    let amp = 0.5;
    let f = 1;
    let norm = 0;
    for (let o = 0; o < oct; o++) {
      s += amp * n2(x * f, y * f);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / norm;
  };
}

function canvas2d(id = "c") {
  const c = document.getElementById(id);
  c.width = W;
  c.height = H;
  return c.getContext("2d", { willReadFrequently: true });
}

// Señal para el script de render: la pieza está lista
function listo() {
  document.fonts.ready.then(() => {
    window.__listo = true;
  });
}

// Si algo peta, se avisa al script de render en vez de dejarlo esperando
window.addEventListener("error", (e) => { window.__error = String(e.message); });
window.addEventListener("unhandledrejection", (e) => { window.__error = String(e.reason && e.reason.message || e.reason); });
