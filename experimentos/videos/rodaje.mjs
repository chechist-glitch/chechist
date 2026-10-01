// Rueda un vídeo hecho con una página que expone window.pintar(t, fotograma) y window.__listo.
// Uso: node rodaje.mjs <carpeta> [--fps 24] [--dur 24] [--w 1280] [--h 720] [--hilos 2] [--desde 0] [--hasta N] [--paso 1]
// Guarda los fotogramas en <carpeta>/fotogramas (se puede parar y seguir) y monta renders/<carpeta>.mp4
import { createServer } from "node:http";
import { readFile, mkdir, access } from "node:fs/promises";
import { extname, join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
const args = process.argv.slice(2);
const carpeta = args.shift();
const opt = (k, def) => { const i = args.indexOf("--" + k); return i >= 0 ? Number(args[i + 1]) : def; };
const fps = opt("fps", 24), dur = opt("dur", 24), W = opt("w", 1280), H = opt("h", 720), hilos = opt("hilos", 2);
const total = Math.round(fps * dur);
const desde = opt("desde", 0), hasta = opt("hasta", total), paso = opt("paso", 1);
const dirF = join(AQUI, carpeta, "fotogramas");
await mkdir(dirF, { recursive: true });

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try {
    const ruta = join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname));
    res.writeHead(200, { "Content-Type": TIPOS[extname(ruta)] || "application/octet-stream" });
    res.end(await readFile(ruta));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/videos/${carpeta}/index.html`;

const pendientes = [];
for (let f = desde; f < hasta; f += paso) {
  const nombre = join(dirF, `f${String(f).padStart(5, "0")}.png`);
  try { await access(nombre); } catch { pendientes.push([f, nombre]); }
}
console.log(`${carpeta}: ${pendientes.length} fotogramas pendientes de ${total}`);
const t0 = Date.now();
let hechos = 0;

async function trabajador(id) {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("pageerror", (e) => console.error(`  ✗ [${id}] ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__listo === true || window.__error, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  while (pendientes.length) {
    const [f, nombre] = pendientes.shift();
    await page.evaluate(async ([t, f]) => { await window.pintar(t, f); }, [f / fps, f]);
    await page.screenshot({ path: nombre, timeout: 600000 });
    hechos++;
    const s = (Date.now() - t0) / 1000;
    if (hechos % 10 === 0 || !pendientes.length) console.log(`  ${hechos} · ${(s / hechos).toFixed(1)} s/fotograma · faltan ~${Math.round(((s / hechos) * pendientes.length) / 60)} min`);
  }
  await browser.close();
}
await Promise.all(Array.from({ length: hilos }, (_, i) => trabajador(i)));
server.close();

if (paso === 1 && desde === 0 && hasta === total) {
  await mkdir(join(RAIZ, "..", "renders"), { recursive: true });
  const salida = join(RAIZ, "..", "renders", `${basename(carpeta)}.mp4`);
  const audio = join(AQUI, carpeta, "audio.wav");
  let conAudio = true;
  try { await access(audio); } catch { conAudio = false; }
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(dirF, "f%05d.png"), ...(conAudio ? ["-i", audio, "-shortest", "-c:a", "aac", "-b:a", "192k"] : []), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", salida], { stdio: "inherit" });
  console.log(r.status === 0 ? `  ✓ ${salida}` : "  ✗ ffmpeg falló");
}
