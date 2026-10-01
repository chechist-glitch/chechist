// Captura fotograma a fotograma una página que expone window.pintar(t) y window.__listo.
// Uso: node captura.mjs <carpeta> <segundos> [fps] [ancho] [alto]
// Sirve la carpeta alternativas/ con vite (para poder importar paquetes de npm) y monta <carpeta>/<carpeta>.mp4
import { createServer } from "vite";
import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const AQUI = dirname(fileURLToPath(import.meta.url));
const [carpeta, seg, fps = "30", ancho = "1280", alto = "720"] = process.argv.slice(2);
const W = +ancho, H = +alto, F = +fps, N = Math.round(+seg * F);
const dir = join(AQUI, carpeta, "frames");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const servidor = await createServer({ root: AQUI, logLevel: "error", server: { port: 9200 + Math.floor(Math.random() * 500) } });
await servidor.listen();
const url = servidor.resolvedUrls.local[0] + carpeta + "/index.html";
const args = process.env.SIN_GPU ? ["--disable-gpu", "--disable-accelerated-2d-canvas"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const navegador = await chromium.launch({ args });
const pagina = await navegador.newPage({ viewport: { width: W, height: H } });
pagina.on("pageerror", (e) => console.error("  ✗", e.message));
await pagina.goto(url);
await pagina.waitForFunction(() => window.__listo === true, null, { timeout: 120000 });
for (let f = 0; f < N; f++) {
  await pagina.evaluate(async (t) => await window.pintar(t), f / F);
  await pagina.screenshot({ path: join(dir, `f${String(f).padStart(5, "0")}.png`) });
  if (f % 60 === 0) console.log(`  ${carpeta}: ${f}/${N}`);
}
await navegador.close();
await servidor.close();
spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(F), "-i", join(dir, "f%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", join(AQUI, carpeta, `${carpeta}.mp4`)], { stdio: "inherit" });
console.log(`  ✓ ${carpeta}/${carpeta}.mp4`);
