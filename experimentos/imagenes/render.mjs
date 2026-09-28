// Renderiza cada piezas/*.html a salida/*.png y monta una hoja de contactos.
// Uso: node render.mjs [filtro]            → piezas/ a salida/
//      node render.mjs serie-2 [filtro]    → serie-2/ a salida-serie-2/
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/opt/node22/lib/node_modules/playwright"));
}

const ROOT = dirname(fileURLToPath(import.meta.url));
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  try {
    const ruta = join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    const datos = await readFile(ruta);
    res.writeHead(200, { "Content-Type": TIPOS[extname(ruta)] || "application/octet-stream" });
    res.end(datos);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const args = process.argv.slice(2);
const carpeta = args[0] && args[0].startsWith("serie") ? args.shift() : "piezas";
const destino = carpeta === "piezas" ? "salida" : `salida-${carpeta}`;
const filtro = args[0] || "";
const piezas = (await readdir(join(ROOT, carpeta)))
  .filter((f) => f.endsWith(".html") && filtro.split(",").some((x) => f.includes(x)))
  .sort();
await mkdir(join(ROOT, destino), { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-accelerated-2d-canvas"],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
page.on("pageerror", (e) => console.error(`  ✗ error JS: ${e.message}`));

for (const f of piezas) {
  const t0 = Date.now();
  const m = process.env.MUESTRAS ? `?m=${process.env.MUESTRAS}` : "";
  await page.goto(`${base}/${carpeta}/${f}${m}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__listo === true || window.__error, null, { timeout: 30 * 60000, polling: 1000 });
  const error = await page.evaluate(() => window.__error);
  if (error) {
    console.log(`  ✗ ${f}: ${error}`);
    continue;
  }
  await page.screenshot({ path: join(ROOT, destino, f.replace(".html", ".png")), timeout: 120000 });
  console.log(`  ✓ ${f} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

// Hoja de contactos con todas las salidas
const todas = (await readdir(join(ROOT, destino)))
  .filter((f) => f.endsWith(".png") && !f.startsWith("_"))
  .sort();
const cols = 6;
const celdaW = 300;
const celdaH = 375 + 34;
const filas = Math.ceil(todas.length / cols);
await page.setViewportSize({ width: cols * celdaW + 40, height: filas * celdaH + 40 });
await page.setContent(
  `<body style="margin:0;padding:20px;background:#111;display:grid;grid-template-columns:repeat(${cols},${celdaW}px);font:14px monospace;color:#bbb">` +
    todas
      .map(
        (f) =>
          `<div style="height:${celdaH}px;padding:0 6px"><img src="${base}/${destino}/${f}" style="width:100%;display:block"><div style="padding:6px 0">${f.replace(".png", "")}</div></div>`
      )
      .join("") +
    "</body>"
);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: join(ROOT, destino, "_hoja-de-contactos.png"), fullPage: true });
console.log(`  ✓ hoja de contactos (${todas.length} imágenes)`);

await browser.close();
server.close();
