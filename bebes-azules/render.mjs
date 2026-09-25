#!/usr/bin/env node
// Renderiza "Los Bebés Azules" a MP4 fotograma a fotograma con Chromium headless.
//
//   node render.mjs                         → bebes-azules.mp4 (vídeo + audio)
//   node render.mjs --from 0 --to 240 --out tramo.mp4 --no-audio
//   node render.mjs --stills 12,35.2 --outdir stills
//   node render.mjs --audio-only --out banda.wav
//
// Requiere: npm i playwright   y   ffmpeg en el PATH (o FFMPEG=/ruta/ffmpeg)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const flag = name => args.includes('--' + name);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css' };
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function openPage(url) {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'],
  });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', e => console.error('[page]', e.message));
  await page.goto(url);
  const info = await page.evaluate(() => window.BB.ready);
  return { browser, page, info };
}

function run(cmd, a, stdin) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, a, { stdio: [stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', c => (c === 0 ? resolve() : reject(new Error(cmd + ' salió con ' + c))));
    if (stdin) stdin(p.stdin);
  });
}

const srv = await serve();
const size = opt('size', '1440x1080').split('x');
const url = `http://127.0.0.1:${srv.address().port}/index.html?render=1&w=${size[0]}&h=${size[1]}&s=${opt('scale', '0.5')}`;
const t0 = Date.now();

try {
  if (opt('shots')) {
    // --shots "EYES@2.5,FACE@3@7" → plano@instante_local[@duración[@variante]]
    const outdir = path.resolve(opt('outdir', 'stills'));
    fs.mkdirSync(outdir, { recursive: true });
    const { browser, page } = await openPage(url);
    for (const spec of opt('shots').split(',')) {
      const [prog, lt, dur, v] = spec.split('@');
      const t1 = Date.now();
      const data = await page.evaluate(([a, b, c, d]) => window.BB.shot(a, b, c, d), [prog, +lt, +(dur || 6), +(v || 0)]);
      const f = path.join(outdir, `shot_${prog}_${lt}${v ? '_v' + v : ''}.png`);
      fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
      console.log(f, ((Date.now() - t1) / 1000).toFixed(1) + 's');
    }
    await browser.close();
  } else if (opt('stills')) {
    const outdir = path.resolve(opt('outdir', 'stills'));
    fs.mkdirSync(outdir, { recursive: true });
    const { browser, page } = await openPage(url);
    for (const s of opt('stills').split(',').map(Number)) {
      const t1 = Date.now();
      const data = await page.evaluate(t => window.BB.still(t), s);
      const f = path.join(outdir, `still_${s.toFixed(2)}.png`);
      fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
      console.log(f, ((Date.now() - t1) / 1000).toFixed(1) + 's');
    }
    await browser.close();
  } else if (flag('audio-only')) {
    const { browser, page } = await openPage(url);
    const b64 = await page.evaluate(() => window.BB.audio());
    fs.writeFileSync(path.resolve(opt('out', 'banda.wav')), Buffer.from(b64, 'base64'));
    await browser.close();
  } else {
    const workers = parseInt(opt('workers', '1'), 10);
    const pages = await Promise.all(Array.from({ length: workers }, () => openPage(url)));
    const { frames, fps, w, h } = pages[0].info;
    const from = parseInt(opt('from', '0'), 10);
    const to = Math.min(parseInt(opt('to', String(frames)), 10), frames);
    const noAudio = flag('no-audio');
    const out = path.resolve(opt('out', 'bebes-azules.mp4'));
    const videoOut = noAudio ? out : out.replace(/\.mp4$/, '') + '.video.mp4';
    console.log(`Renderizando fotogramas ${from}–${to - 1} de ${frames} (${w}x${h} @ ${fps} fps, ${workers} worker/s)`);

    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-',
      '-vf', 'vflip,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', opt('crf', '19'), '-tune', 'grain',
      '-movflags', '+faststart', videoOut], { stdio: ['pipe', 'inherit', 'inherit'] });
    const ffDone = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));

    let next = from, written = from;
    const ready = new Map();
    const write = async () => {
      while (ready.has(written)) {
        const buf = ready.get(written); ready.delete(written);
        if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
        written++;
        if (written % 24 === 0 || written === to) {
          const el = (Date.now() - t0) / 1000, done = written - from, left = to - written;
          console.log(`  ${written}/${to}  ${(el / done).toFixed(2)} s/fot  ~${Math.round(left * el / done / 60)} min restantes`);
        }
      }
    };
    let writing = Promise.resolve();
    await Promise.all(pages.map(async ({ page }) => {
      while (next < to) {
        const i = next++;
        const b64 = await page.evaluate(n => window.BB.frame(n), i);
        ready.set(i, Buffer.from(b64, 'base64'));
        writing = writing.then(write);
        await writing;
      }
    }));
    await writing;
    ff.stdin.end();
    await ffDone;

    if (!noAudio) {
      const wav = out.replace(/\.mp4$/, '') + '.wav';
      const b64 = await pages[0].page.evaluate(() => window.BB.audio());
      fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
      await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', videoOut, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
      fs.unlinkSync(videoOut); fs.unlinkSync(wav);
    }
    await Promise.all(pages.map(p => p.browser.close()));
    console.log('Listo:', out, `(${((Date.now() - t0) / 60000).toFixed(1)} min)`);
  }
} finally {
  srv.close();
}
