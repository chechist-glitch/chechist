/* ==========================================================================
   LOS BEBÉS AZULES — motor: línea de tiempo, WebGL y rótulos
   ========================================================================== */
window.BBFilm = (function () {
const S = window.BB_SHADERS;
const FPS = 24;

/* ---------------------------------------------------------------- guion -- */
const SHOTS = [
  { name: 'leader',  dur: 4.5 },
  { name: 'eyes',    dur: 6.0,  prog: 'EYES', v: 0 },
  { name: 'earth',   dur: 6.5,  prog: 'EARTH' },
  { name: 'clouds',  dur: 7.0,  prog: 'CLOUDS' },
  { name: 'face',    dur: 7.0,  prog: 'FACE' },
  { name: 'touch',   dur: 10.0, prog: 'TOUCH' },
  { name: 'toy',     dur: 6.0,  prog: 'TOY' },
  { name: 'mars',    dur: 6.0,  prog: 'MARS' },
  { name: 'eye',     dur: 5.0,  prog: 'EYE' },
  { name: 'fin',     dur: 3.0 },
  { name: 'reprise', dur: 3.0,  prog: 'EYES', v: 1 },
];
let acc = 0;
for (const s of SHOTS) { s.start = acc; acc += s.dur; }
const DURATION = acc;
const IMPACT = SHOTS.find(s => s.name === 'touch').start + 4.0;

const SUBS = [
  [11.0, 13.8, 'Durante siglos miramos al cielo buscando respuestas.'],
  [14.0, 16.8, 'Nunca pensamos que el cielo nos devolvería la mirada.'],
  [17.5, 20.5, 'Marzo de 1975. Un piloto informa por radio de algo sobre las nubes.'],
  [20.7, 23.8, '«Es más grande que una montaña... y nos está mirando.»'],
  [24.8, 27.2, 'No lloran. No duermen.'],
  [28.0, 30.7, 'Solo observan.'],
  [31.6, 34.7, 'Y cuando uno de ellos toca la Tierra...'],
  [36.2, 40.6, '...la Tierra arde.'],
  [41.5, 44.0, 'Para ellos no somos un mundo.'],
  [44.3, 46.8, 'Somos un juguete.'],
  [47.5, 50.0, 'Marte fue el primero.'],
  [50.3, 52.8, 'Nadie volvió a hablar de ello.'],
  [53.6, 57.4, 'Y ahora... nos miran a nosotros.'],
  [61.3, 63.3, 'Duérmete niño, duérmete ya...'],
];
const CAPTIONS = [
  [10.8, 16.7, 'OBSERVATORIO DE CALAR ALTO · ALMERÍA · 1975'],
  [17.2, 23.9, 'GRABACIÓN RECUPERADA · VUELO 714'],
  [47.2, 52.8, 'FOTOGRAMA NO PUBLICADO · MARTE, 1976'],
];

function shotAt(t) {
  for (let i = SHOTS.length - 1; i >= 0; i--) if (t >= SHOTS[i].start) return SHOTS[i];
  return SHOTS[0];
}

/* ------------------------------------------------ parámetros de post -- */
function postParams(t) {
  const p = { flash: 0, fade: 1, roll: 0, burn: 0, exposure: 1, bloom: 1, shakeImg: 0, ovShake: 0 };
  const F = 1 / FPS;
  for (const s of SHOTS) {
    const dt = t - s.start;
    if (s.start > 0 && dt >= 0 && dt < F * 0.999 && s.name !== 'fin') p.flash = Math.max(p.flash, 0.3);
  }
  // empalmes que "patinan"
  for (const tr of [SHOTS[3].start, SHOTS[7].start]) {
    const dt = t - tr;
    if (dt >= 0 && dt < 0.2) p.roll = (1 - dt / 0.2) * 0.35;
  }
  // entrada del título desde negro
  const eyes = SHOTS[1];
  if (t >= eyes.start && t < eyes.start + 0.6) p.fade = (t - eyes.start) / 0.6;
  // impacto
  if (t >= IMPACT && t < IMPACT + 1.2) {
    const k = t - IMPACT;
    p.flash = Math.max(p.flash, Math.exp(-k * 5) * 0.92);
    p.shakeImg = Math.exp(-k * 4) * 0.6;
    p.exposure = 1 + Math.exp(-k * 2) * 0.6;
  }
  // el ojo se sobreexpone
  const eye = SHOTS[8];
  if (t >= eye.start + 4.2 && t < eye.start + eye.dur) {
    const k = (t - eye.start - 4.2) / 0.8;
    p.flash = Math.max(p.flash, k * k);
  }
  // epílogo: quemado del fotograma
  const end = DURATION;
  if (t > end - 1.25) p.burn = Math.min(1, (t - (end - 1.25)) / 1.0);
  if (t > end - 0.12) p.fade = 0;
  return p;
}

/* -------------------------------------------------------------- WebGL -- */
function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    throw new Error('Shader ' + label + ':\n' + log);
  }
  return sh;
}
function program(gl, fsSrc, label) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, S.VERT, label + '/vs'));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc, label));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link ' + label + ': ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

class Film {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.W = opts.width || 1440;
    this.H = opts.height || 1080;
    this.sceneScale = opts.sceneScale || 0.5;
    canvas.width = this.W; canvas.height = this.H;
    this.duration = DURATION;
    this.fps = FPS;
    this.frameCount = Math.round(DURATION * FPS);
    this.shots = SHOTS;
  }

  async init(onProgress = () => {}) {
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 no disponible');
    this.gl = gl;
    const hdr = !!gl.getExtension('EXT_color_buffer_float');
    this.fmt = hdr ? { ifmt: gl.RGBA16F, type: gl.HALF_FLOAT } : { ifmt: gl.RGBA8, type: gl.UNSIGNED_BYTE };

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.post = {
      dof: program(gl, S.DOF, 'dof'),
      bright: program(gl, S.BRIGHT, 'bright'),
      blur: program(gl, S.BLUR, 'blur'),
      copy: program(gl, S.COPY, 'copy'),
      final: program(gl, S.FINAL, 'final'),
    };
    const names = [...new Set(SHOTS.filter(s => s.prog).map(s => s.prog))];
    this.progs = {};
    for (let i = 0; i < names.length; i++) {
      onProgress(i / names.length, names[i]);
      await new Promise(r => setTimeout(r, 0));
      this.progs[names[i]] = program(gl, S.sceneSource(names[i]), names[i]);
    }
    onProgress(1, 'ok');

    const sw = Math.round(this.W * this.sceneScale), sh = Math.round(this.H * this.sceneScale);
    this.sw = sw; this.sh = sh;
    const mk = (w, h) => this.target(w, h);
    this.fb = {
      scene: mk(sw, sh), dof: mk(sw, sh),
      b1a: mk(sw >> 1, sh >> 1), b1b: mk(sw >> 1, sh >> 1),
      b2a: mk(sw >> 2, sh >> 2), b2b: mk(sw >> 2, sh >> 2),
      b3a: mk(sw >> 3, sh >> 3), b3b: mk(sw >> 3, sh >> 3),
    };

    this.ov = document.createElement('canvas');
    this.ov.width = this.W; this.ov.height = this.H;
    this.ctx = this.ov.getContext('2d');
    this.ovTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.ovTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (document.fonts) {
      await Promise.all([
        document.fonts.load('40px "Special Elite"'),
        document.fonts.load('40px "IM Fell English SC"'),
        document.fonts.load('italic 40px "IM Fell English"'),
        document.fonts.load('900 40px "Playfair Display"'),
      ]).catch(() => {});
    }
  }

  target(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.fmt.ifmt, w, h, 0, gl.RGBA, this.fmt.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }

  pass(prog, dst, uniforms, textures) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
    gl.viewport(0, 0, dst ? dst.w : this.W, dst ? dst.h : this.H);
    gl.useProgram(prog.p);
    let unit = 0;
    for (const k in textures) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, textures[k]);
      if (prog.u[k]) gl.uniform1i(prog.u[k], unit);
      unit++;
    }
    for (const k in uniforms) {
      const v = uniforms[k], loc = prog.u[k];
      if (!loc) continue;
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  blur(a, b) {
    const P = this.post;
    this.pass(P.blur, b, { uDir: [1 / a.w, 0] }, { uTex: a.tex });
    this.pass(P.blur, a, { uDir: [0, 1 / a.h] }, { uTex: b.tex });
  }

  renderAt(t, override) {
    const gl = this.gl, P = this.post, fb = this.fb;
    t = Math.max(0, Math.min(t, DURATION - 1e-4));
    let shot = shotAt(t);
    let lt = t - shot.start;
    const frame = Math.floor(t * FPS + 1e-4);
    if (override) {
      // modo prueba: un plano concreto, en un instante local concreto, sin rótulos
      shot = { name: 'test', prog: override.prog, dur: override.dur || 6, v: override.v || 0 };
      lt = override.lt;
      this.ctx.clearRect(0, 0, this.W, this.H);
    } else {
      drawOverlay(this.ctx, t, shot, lt, this.W, this.H, frame);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.ovTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.ov);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    let hasScene = 0;
    if (shot.prog) {
      hasScene = 1;
      if (!this.progs[shot.prog]) this.progs[shot.prog] = program(gl, S.sceneSource(shot.prog), shot.prog);
      const prog = this.progs[shot.prog];
      this.pass(prog, fb.scene, { uRes: [fb.scene.w, fb.scene.h], uT: lt, uDur: shot.dur, uG: t, uV: shot.v || 0 }, {});
      this.pass(P.dof, fb.dof, { uTexel: [1 / fb.dof.w, 1 / fb.dof.h] }, { uTex: fb.scene.tex });
      this.pass(P.bright, fb.b1a, { uTexel: [1 / fb.dof.w, 1 / fb.dof.h], uThr: 0.75 }, { uTex: fb.dof.tex });
      this.blur(fb.b1a, fb.b1b);
      this.pass(P.copy, fb.b2a, { uTexel: [1 / fb.b1a.w, 1 / fb.b1a.h] }, { uTex: fb.b1a.tex });
      this.blur(fb.b2a, fb.b2b);
      this.pass(P.copy, fb.b3a, { uTexel: [1 / fb.b2a.w, 1 / fb.b2a.h] }, { uTex: fb.b2a.tex });
      this.blur(fb.b3a, fb.b3b);
      this.blur(fb.b3a, fb.b3b);
    }
    const pp = override ? postParams(-1) : postParams(t);
    this.pass(P.final, null, {
      uRes: [this.W, this.H], uFrame: frame, uFlash: pp.flash, uFade: pp.fade, uRoll: pp.roll, uBurn: pp.burn,
      uHasScene: hasScene, uExposure: pp.exposure, uBloom: pp.bloom, uShakeImg: pp.shakeImg, uOvShake: pp.ovShake,
    }, { uScene: fb.dof.tex, uB1: fb.b1a.tex, uB2: fb.b2a.tex, uB3: fb.b3a.tex, uOverlay: this.ovTex });
  }

  readPixels() {
    const gl = this.gl;
    const px = new Uint8Array(this.W * this.H * 4);
    gl.readPixels(0, 0, this.W, this.H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }
}

/* ------------------------------------------------------------ rótulos -- */
const PAPER = '#ece5d3';

function rnd(seed) { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

function drawOverlay(ctx, t, shot, lt, W, H, frame) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shot.name === 'leader') drawLeader(ctx, lt, W, H, frame);
  if (shot.name === 'eyes') drawTitle(ctx, lt, W, H, frame);
  if (shot.name === 'fin') drawFin(ctx, lt, W, H, frame);
  drawCaption(ctx, t, W, H, frame);
  drawSubs(ctx, t, W, H);
  ctx.restore();
}

function drawLeader(ctx, lt, W, H, frame) {
  if (lt >= 3.5) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    return;
  }
  const n = 5 - Math.floor(lt + 1e-6);
  const f = lt - Math.floor(lt);
  const cx = W / 2, cy = H / 2, R = H * 0.36;
  ctx.fillStyle = '#9c9a92'; ctx.fillRect(0, 0, W, H);
  // barrido de reloj
  ctx.fillStyle = '#6f6d66';
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, W, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
  ctx.closePath(); ctx.fill();
  // cruz
  ctx.strokeStyle = '#1b1a18'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
  // círculos
  ctx.lineWidth = 9; ctx.strokeStyle = '#f2efe6';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 5; ctx.strokeStyle = '#1b1a18';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.86, 0, Math.PI * 2); ctx.stroke();
  // número
  ctx.fillStyle = '#12110f';
  ctx.font = `900 ${Math.round(H * 0.5)}px "Playfair Display", Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(String(n));
  ctx.fillText(String(n), cx, cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  // marcas de laboratorio
  ctx.font = `${Math.round(H * 0.028)}px "Special Elite", monospace`;
  ctx.fillStyle = '#23211d';
  ctx.textAlign = 'left';
  ctx.fillText('ROLLO 7 · COPIA DE TRABAJO', W * 0.06, H * 0.08);
  ctx.textAlign = 'right';
  ctx.fillText('NO PROYECTAR', W * 0.94, H * 0.92);
}

function typed(text, t0, t, cps) {
  const n = Math.max(0, Math.min(text.length, Math.floor((t - t0) * cps)));
  return text.slice(0, n);
}

function drawTitle(ctx, lt, W, H, frame) {
  // tipo de máquina de escribir arriba
  const top = 'ARCHIVO Nº 7  —  MATERIAL DESCLASIFICADO';
  if (lt > 0.35 && lt < 5.7) {
    const a = Math.min(1, (5.7 - lt) / 0.3);
    ctx.globalAlpha = 0.85 * a;
    ctx.font = `${Math.round(H * 0.03)}px "Special Elite", monospace`;
    ctx.fillStyle = PAPER; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const s = typed(top, 0.4, lt, 26);
    ctx.fillText(s + ((frame >> 2) % 2 && s.length < top.length ? '▌' : ''), W / 2, H * 0.12);
    ctx.globalAlpha = 1;
  }
  // título
  if (lt > 2.25 && lt < 5.85) {
    const a = Math.min(1, (lt - 2.25) / 0.35) * Math.min(1, (5.85 - lt) / 0.35);
    const fl = 0.85 + 0.15 * rnd(frame * 1.3);
    ctx.globalAlpha = a * fl;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `900 ${Math.round(H * 0.125)}px "Playfair Display", Georgia, serif`;
    ctx.shadowColor = 'rgba(255,40,10,0.55)'; ctx.shadowBlur = H * 0.03;
    ctx.fillStyle = PAPER;
    const y = H * 0.8;
    ctx.fillText('LOS BEBÉS AZULES', W / 2, y);
    ctx.shadowBlur = 0;
    ctx.font = `italic ${Math.round(H * 0.036)}px "IM Fell English", Georgia, serif`;
    ctx.fillText('— un documento que nunca debió ver la luz —', W / 2, y + H * 0.065);
    ctx.globalAlpha = 1;
  }
  // sello
  if (lt > 3.1 && lt < 5.85) {
    const a = Math.min(1, (5.85 - lt) / 0.3);
    const pop = Math.max(0, 1 - (lt - 3.1) / 0.08);
    ctx.save();
    ctx.translate(W * 0.8, H * 0.27);
    ctx.rotate(-0.16);
    ctx.scale(1 + pop * 0.6, 1 + pop * 0.6);
    ctx.globalAlpha = 0.8 * a;
    ctx.strokeStyle = '#c41f12'; ctx.fillStyle = '#c41f12';
    ctx.lineWidth = H * 0.007;
    const w = H * 0.34, h = H * 0.09;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.font = `${Math.round(H * 0.05)}px "Special Elite", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CLASIFICADO', 0, H * 0.004);
    // tinta irregular
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 90; i++) {
      const x = (rnd(i * 3.1) - 0.5) * w * 1.05, y2 = (rnd(i * 7.7) - 0.5) * h * 1.1;
      ctx.globalAlpha = 0.5 * rnd(i * 1.9);
      ctx.beginPath(); ctx.arc(x, y2, H * 0.004 * (0.4 + rnd(i * 5.3)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

function drawFin(ctx, lt, W, H, frame) {
  ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
  const q = lt > 2.05 && ((frame % 3 === 0) || rnd(frame) > 0.55);
  const a = Math.min(1, lt / 0.4);
  ctx.globalAlpha = a;
  ctx.fillStyle = PAPER; ctx.strokeStyle = PAPER;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(H * 0.19)}px "IM Fell English SC", Georgia, serif`;
  ctx.fillText(q ? '¿FIN?' : 'FIN', W / 2, H * 0.47);
  ctx.lineWidth = 3;
  const yl = H * 0.62, wl = W * 0.16;
  ctx.beginPath(); ctx.moveTo(W / 2 - wl, yl); ctx.lineTo(W / 2 - 18, yl); ctx.moveTo(W / 2 + 18, yl); ctx.lineTo(W / 2 + wl, yl); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, yl, 6, 0, Math.PI * 2); ctx.fill();
  ctx.font = `italic ${Math.round(H * 0.03)}px "IM Fell English", Georgia, serif`;
  ctx.fillText('Archivo Nº 7 — Prohibida su exhibición pública', W / 2, H * 0.69);
  ctx.globalAlpha = 1;
}

function drawCaption(ctx, t, W, H, frame) {
  for (const [a, b, text] of CAPTIONS) {
    if (t < a || t > b) continue;
    const s = typed(text, a, t, 30);
    const al = Math.min(1, (b - t) / 0.3);
    ctx.globalAlpha = 0.9 * al;
    ctx.font = `${Math.round(H * 0.027)}px "Special Elite", monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(s, W * 0.065 + 2, H * 0.095 + 2);
    ctx.fillStyle = PAPER;
    ctx.fillText(s + (s.length < text.length && (frame >> 1) % 2 ? '▌' : ''), W * 0.065, H * 0.095);
    ctx.globalAlpha = 1;
  }
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const tst = cur ? cur + ' ' + w : w;
    if (ctx.measureText(tst).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tst;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawSubs(ctx, t, W, H) {
  for (const [a, b, text] of SUBS) {
    if (t < a || t > b) continue;
    const al = Math.min(1, (t - a) / 0.18, (b - t) / 0.18);
    ctx.globalAlpha = al;
    const fs = Math.round(H * 0.05);
    ctx.font = `italic ${fs}px "IM Fell English", Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const lines = wrap(ctx, text, W * 0.8);
    const lh = fs * 1.18;
    let y = H * 0.9 - (lines.length - 1) * lh;
    for (const ln of lines) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = fs * 0.16; ctx.strokeStyle = 'rgba(8,8,8,0.9)';
      ctx.strokeText(ln, W / 2, y);
      ctx.fillStyle = '#f3efe2';
      ctx.fillText(ln, W / 2, y);
      y += lh;
    }
    ctx.globalAlpha = 1;
  }
}

return { Film, SHOTS, SUBS, DURATION, FPS, IMPACT, shotAt };
})();
