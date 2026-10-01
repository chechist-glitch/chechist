// Graba una pieza animada a vídeo de 10 s (720×900).
// La página expone window.pintar(t) (t en segundos, puede ser async) y pone window.__listo = true.
// Si usa animaciones CSS o WAAPI, también se paran y se colocan en t (document.getAnimations()).
// Uso: node grabar.mjs <html relativo a experimentos/> <salida.mp4> [--dur 10] [--fps 24] [--previa hoja.jpg]
//   --previa: en vez del vídeo, saca 5 fotogramas sueltos en una tira para revisar rápido.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { writeFileSync, rmSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("/opt/node22/lib/node_modules/playwright");
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".svg": "image/svg+xml" };

const a = process.argv.slice(2);
const opc = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a.splice(i, 2)[1] : d; };
const DUR = +opc("--dur", 10), FPS = +opc("--fps", 24), previa = opc("--previa", null);
const [html, salida] = a;

const server = createServer(async (req, res) => {
  try {
    const ruta = join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname));
    const datos = await readFile(ruta);
    res.writeHead(200, { "Content-Type": TIPOS[extname(ruta)] || "application/octet-stream" });
    res.end(datos);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const navegador = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-accelerated-2d-canvas"] });
const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1350 } });
let fallo = null;
pagina.on("pageerror", (e) => { fallo = e.message; console.error("  ✗", e.message); });
await pagina.goto(`http://127.0.0.1:${server.address().port}/${html}?video=1`, { timeout: 120000 });
await pagina.waitForFunction(() => window.__listo === true || window.__error, null, { timeout: 20 * 60000, polling: 500 });
const err = await pagina.evaluate(() => window.__error);
if (err) { console.error("  ✗", err); process.exit(1); }

const fotograma = async (t) => {
  await pagina.evaluate(async (t) => {
    if (window.pintar) await window.pintar(t);
    for (const an of document.getAnimations()) { an.pause(); an.currentTime = t * 1000; }
  }, t);
  return pagina.screenshot({ type: "jpeg", quality: 92, timeout: 300000 });
};

const t0 = Date.now();
if (previa) {
  const ts = [0, 2.5, 5, 7.5, DUR - 0.05];
  const tmp = [];
  for (const [i, t] of ts.entries()) { const p = `${previa}.${i}.jpg`; writeFileSync(p, await fotograma(t)); tmp.push(p); }
  spawnSync("ffmpeg", ["-v", "error", "-y", ...tmp.flatMap((p) => ["-i", p]), "-filter_complex", tmp.map((_, i) => `[${i}]scale=300:375[s${i}]`).join(";") + ";" + tmp.map((_, i) => `[s${i}]`).join("") + `hstack=${tmp.length}`, previa], { stdio: "inherit" });
  for (const p of tmp) rmSync(p, { force: true });
} else {
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-vf", "scale=720:900:flags=lanczos",
    "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-maxrate", "1300k", "-bufsize", "2600k", "-pix_fmt", "yuv420p", "-movflags", "+faststart", salida], { stdio: ["pipe", "inherit", "inherit"] });
  const N = Math.round(DUR * FPS);
  for (let f = 0; f < N; f++) {
    const b = await fotograma(f / FPS);
    if (!ff.stdin.write(b)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 48 === 0) process.stdout.write(`  ${html}: ${f}/${N} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
}
await navegador.close();
server.close();
console.log(`  ✓ ${salida || previa} (${((Date.now() - t0) / 1000).toFixed(0)} s)${fallo ? " con errores" : ""}`);
