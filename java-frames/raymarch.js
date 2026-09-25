// JavaScript puro (Node, sin librerías): un raymarcher 3D.
// Por cada píxel lanza un rayo y avanza por una escena definida con
// funciones de distancia (SDF): gotas de metal líquido fundiéndose entre sí
// sobre un suelo de ajedrez reflectante, con sombras suaves y niebla.
// El PNG se escribe a mano: cabecera, CRC32 y zlib.
//
// Uso: node raymarch.js salida.png

const fs = require('fs');
const zlib = require('zlib');

const W = 1920, H = 1080;
const out = process.argv[2] || 'raymarch.png';

// ---------- vectores mínimos ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => mul(a, 1 / len(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;

// ---------- escena ----------
const blobs = [
  [0.0, 1.0, 0.0, 0.9],
  [1.25, 0.75, 0.4, 0.6],
  [-1.2, 0.7, 0.3, 0.65],
  [0.55, 1.85, -0.2, 0.45],
  [-0.5, 1.9, 0.5, 0.38],
  [0.2, 0.45, 1.1, 0.4],
];

function smin(a, b, k) {
  const h = clamp(0.5 + 0.5 * (b - a) / k);
  return mix(b, a, h) - k * h * (1 - h);
}

// Devuelve [distancia, material]  (1 = metal, 2 = suelo)
function map(p) {
  let d = 1e9;
  for (const [x, y, z, r] of blobs) {
    const s = len(sub(p, [x, y, z])) - r;
    d = smin(d, s, 0.45);
  }
  // Pequeña ondulación en la superficie del metal
  d += 0.02 * Math.sin(p[0] * 9) * Math.sin(p[1] * 9) * Math.sin(p[2] * 9);
  const floor = p[1];
  return d < floor ? [d, 1] : [floor, 2];
}

function normal(p) {
  const e = 0.0015;
  return norm([
    map([p[0] + e, p[1], p[2]])[0] - map([p[0] - e, p[1], p[2]])[0],
    map([p[0], p[1] + e, p[2]])[0] - map([p[0], p[1] - e, p[2]])[0],
    map([p[0], p[1], p[2] + e])[0] - map([p[0], p[1], p[2] - e])[0],
  ]);
}

function march(ro, rd, maxT = 40) {
  let t = 0.001;
  for (let i = 0; i < 160; i++) {
    const [d, m] = map(add(ro, mul(rd, t)));
    if (d < 0.0008 * t) return [t, m];
    t += d * 0.9;
    if (t > maxT) break;
  }
  return [-1, 0];
}

function softShadow(ro, rd) {
  let res = 1, t = 0.02;
  for (let i = 0; i < 48 && t < 10; i++) {
    const d = map(add(ro, mul(rd, t)))[0];
    if (d < 0.001) return 0;
    res = Math.min(res, 10 * d / t);
    t += clamp(d, 0.02, 0.3);
  }
  return clamp(res);
}

const LIGHT = norm([-0.6, 0.8, -0.4]);

function sky(rd) {
  const t = Math.pow(clamp(rd[1] * 1.6), 0.6);
  // Atardecer: naranja en el horizonte, añil oscuro arriba, y un sol
  const base = [mix(1.3, 0.04, t), mix(0.5, 0.03, t), mix(0.25, 0.16, t)];
  const sun = Math.pow(clamp(dot(rd, LIGHT)), 300) * 6 + Math.pow(clamp(dot(rd, LIGHT)), 8) * 0.3;
  return add(base, [sun, sun * 0.8, sun * 0.6]);
}

function shade(ro, rd, depth) {
  const [t, m] = march(ro, rd);
  if (t < 0) return sky(rd);
  const p = add(ro, mul(rd, t));
  const n = normal(p);
  const sh = softShadow(add(p, mul(n, 0.01)), LIGHT);
  const diff = clamp(dot(n, LIGHT)) * sh;
  const refl = sub(rd, mul(n, 2 * dot(rd, n)));
  let col;
  if (m === 1) {
    // Metal iridiscente: el tono cambia con el ángulo de visión
    const f = 1 - clamp(-dot(rd, n));
    const hue = [0.5 + 0.5 * Math.cos(6.28 * (f + 0.0)), 0.5 + 0.5 * Math.cos(6.28 * (f + 0.33)), 0.5 + 0.5 * Math.cos(6.28 * (f + 0.67))];
    const r = depth < 2 ? shade(add(p, mul(n, 0.01)), refl, depth + 1) : sky(refl);
    col = [0, 1, 2].map((i) => r[i] * (0.35 + 0.65 * hue[i]) + hue[i] * diff * 0.15);
  } else {
    const checker = (Math.floor(p[0]) + Math.floor(p[2])) & 1;
    const albedo = checker ? [0.75, 0.7, 0.68] : [0.03, 0.025, 0.05];
    const r = depth < 1 ? shade(add(p, mul(n, 0.01)), refl, depth + 1) : sky(refl);
    col = [0, 1, 2].map((i) => albedo[i] * (0.08 + diff * 0.9) + r[i] * 0.3);
  }
  // Niebla hacia el color del horizonte
  const fog = 1 - Math.exp(-0.0012 * t * t);
  const fogCol = [1.1, 0.45, 0.22];
  return col.map((c, i) => mix(c, fogCol[i], fog));
}

// ---------- cámara y render ----------
const ro = [2.9, 1.7, -4.1];
const ta = [0, 0.9, 0];
const fw = norm(sub(ta, ro));
const rt = norm(cross(fw, [0, 1, 0]));
const up = cross(rt, fw);

const raw = Buffer.alloc((W * 3 + 1) * H);
let lastPct = -1;
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0; // filtro PNG "None"
  for (let x = 0; x < W; x++) {
    const u = (2 * (x + 0.5) - W) / H, v = -(2 * (y + 0.5) - H) / H;
    const rd = norm(add(add(mul(rt, u), mul(up, v)), mul(fw, 1.9)));
    let c = shade(ro, rd, 0);
    // Tonemapping + gamma
    c = c.map((k) => Math.pow(clamp(1 - Math.exp(-k * 1.3)), 1 / 2.2));
    const o = y * (W * 3 + 1) + 1 + x * 3;
    raw[o] = Math.round(c[0] * 255);
    raw[o + 1] = Math.round(c[1] * 255);
    raw[o + 2] = Math.round(c[2] * 255);
  }
  const pct = Math.floor((y / H) * 10);
  if (pct !== lastPct) { process.stdout.write(`${pct * 10}% `); lastPct = pct; }
}

// ---------- PNG a mano ----------
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body));
  return Buffer.concat([lenBuf, body, crcBuf]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bits por canal
ihdr[9] = 2;  // RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.mkdirSync(require('path').dirname(require('path').resolve(out)), { recursive: true });
fs.writeFileSync(out, png);
console.log(`\n  -> ${out}`);
