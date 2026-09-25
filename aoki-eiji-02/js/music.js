/* ==========================================================================
   蒼キ嬰児 · 第二話 — banda sonora de acción, 100 % sintetizada (WebAudio)
   120 BPM · compás = 2 s · Re menor (Rem–Si♭–Do–La)
   Ostinato de cuerdas, bajo distorsionado, taikos, metales, braams, coro con
   formantes y efectos (propulsores, misiles, láseres, cañón, gore) al fotograma.
   ========================================================================== */
window.AEMusic = (function () {
const SR = 44100;
const BPM = 120, BEAT = 60 / BPM, BAR = 4 * BEAT;
const at = (bar, beat = 1) => (bar - 1) * BAR + (beat - 1) * BEAT;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/* ------------------------------------------------------------ utilidades -- */
let ctx, R;   // contexto y generador aleatorio de la sesión de render
const G = (v, dest) => { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };
const F = (type, f, q, dest) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (dest) b.connect(dest); return b; };
const Pan = (p, dest) => { const s = ctx.createStereoPanner(); s.pan.value = p; s.connect(dest); return s; };
function osc(type, f, t0, t1, dest) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(t0); o.stop(t1); return o; }
function env(param, pts) { param.setValueAtTime(pts[0][1], Math.max(0, pts[0][0])); for (let i = 1; i < pts.length; i++) param.linearRampToValueAtTime(pts[i][1], pts[i][0]); }
function adsr(g, t0, a, peak, t1, rel) {
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.setValueAtTime(peak, Math.max(t0 + a, t1)); g.gain.linearRampToValueAtTime(0, Math.max(t0 + a, t1) + rel);
}
function shaper(amount, dest) {
  const ws = ctx.createWaveShaper(), n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  ws.curve = c; ws.oversample = '2x'; if (dest) ws.connect(dest); return ws;
}
function noiseBuf(sec, kind, seed) {
  const n = Math.floor(sec * SR), b = ctx.createBuffer(1, n, SR), d = b.getChannelData(0), r = rng(seed);
  if (kind === 'brown') { let l = 0; for (let i = 0; i < n; i++) { l = (l + 0.02 * (r() * 2 - 1)) / 1.02; d[i] = l * 3.5; } }
  else if (kind === 'pink') { let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < n; i++) { const w = r() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22; } }
  else for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  return b;
}
function crackleBuf(sec, rate, seed) {
  const n = Math.floor(sec * SR), b = ctx.createBuffer(1, n, SR), d = b.getChannelData(0), r = rng(seed), p = rate / SR;
  for (let i = 0; i < n; i++) if (r() < p) { const a = Math.pow(r(), 2.5) * (r() < 0.5 ? -1 : 1), len = 2 + Math.floor(r() * 40); for (let k = 0; k < len && i + k < n; k++) d[i + k] += a * Math.exp(-k / (len * 0.3)) * (k % 2 ? -0.7 : 1); }
  return b;
}
function impulse(sec, decay, seed) {
  const n = Math.floor(sec * SR), b = ctx.createBuffer(2, n, SR);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch), r = rng(seed + ch * 31); let lp = 0;
    for (let i = 0; i < n; i++) { lp += ((r() * 2 - 1) - lp) * (0.55 - 0.45 * i / n); d[i] = lp * Math.pow(1 - i / n, decay) * (i < 200 ? i / 200 : 1); }
  }
  return b;
}
let WN, BN, PN;
function noise(buf, t0, t1, dest) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(dest); s.start(t0, (t0 * 0.618) % buf.duration); s.stop(t1); return s; }
function burst(buf, t, type, f, q, dur, peak, dest, att = 0.003) {
  const a = G(0, dest); a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(peak, t + att); a.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  noise(buf, t, t + dur + 0.05, F(type, f, q, a));
}
function glide(type, f0, f1, t, dur, peak, dest, att = 0.005) {
  const a = G(0, dest); a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(peak, t + att); a.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  const o = osc(type, f0, t, t + dur + 0.05, a); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
}

/* ---------------------------------------------------------- instrumentos -- */
// Coro: sierras con vibrato por un banco de formantes; "a" épica, "o" oscura, "u" susurro
function choir(dest, t0, t1, notes, level, vowel = 'a', att = 0.5, rel = 1.2) {
  const FM = { a: [[760, 9, 1], [1180, 11, 0.55], [2850, 14, 0.18]], o: [[470, 8, 1], [820, 10, 0.45], [2600, 14, 0.1]], u: [[330, 7, 1], [860, 9, 0.3], [2400, 12, 0.07]] }[vowel];
  const out = G(0, dest);
  adsr(out, t0, att, level, t1, rel);
  const bank = FM.map(([f, q, a]) => { const b = F('bandpass', f, q); b.connect(G(a * 4.5, out)); return b; });
  let k = 0;
  for (const m of notes) for (let v = 0; v < 3; v++) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = (v - 1) * 9 + (R() - 0.5) * 6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 4.6 + R() * 0.9;
    const lg = G(0); lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(14, t0 + 0.8);
    lfo.connect(lg); lg.connect(o.detune);
    const vg = G(1 / Math.sqrt(notes.length * 3));
    o.connect(vg); for (const b of bank) vg.connect(b);
    o.start(t0); o.stop(t1 + rel + 0.1); lfo.start(t0); lfo.stop(t1 + rel + 0.1); k++;
  }
  // aliento
  const br = G(level * 0.05, out); noise(PN, t0, t1 + rel, F('bandpass', 2600, 1.2, br));
}
// Órgano de tubos: registros 16', 8', 4', 2 2/3', 2' y trémolo
function organ(dest, t0, t1, notes, level, full = false) {
  const out = G(0, dest);
  adsr(out, t0, 0.09, level, t1, 0.45);
  const trem = ctx.createOscillator(); trem.frequency.value = 5.8; const tg = G(level * 0.05); trem.connect(tg); tg.connect(out.gain); trem.start(t0); trem.stop(t1 + 0.6);
  const stops = full ? [[0.5, 0.7], [1, 1], [2, 0.6], [3, 0.35], [4, 0.3], [6, 0.12], [8, 0.1]] : [[0.5, 0.55], [1, 1], [2, 0.45], [3, 0.2], [4, 0.15]];
  const norm = 1 / Math.sqrt(notes.length * stops.length);
  for (const m of notes) for (const [r, a] of stops) {
    const f = mtof(m) * r; if (f > 9000) continue;
    const o = osc('sine', f, t0, t1 + 0.6, G(a * norm, out)); o.detune.value = (R() - 0.5) * 4;
  }
  burst(WN, t0, 'bandpass', 1800, 1, 0.06, level * 0.08, out);
}
// Ostinato de cuerdas en semicorcheas (acentos 3-3-2 · 3-3-2)
const ACC = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
function ostinato(dest, t0, t1, rootAt, level) {
  const step = BEAT / 4;
  let i = Math.round(t0 / step);
  for (let t = i * step; t < t1 - 0.01; t += step, i++) {
    const acc = ACC[i % 16], m = rootAt(t);
    const g = G(0, dest);
    const lp = F('lowpass', acc ? 2600 : 1500, 1.2, g);
    const pk = level * (acc ? 1 : 0.62);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.006); g.gain.exponentialRampToValueAtTime(pk * 0.2, t + 0.1); g.gain.linearRampToValueAtTime(0, t + step * 0.95);
    for (const det of [-7, 7]) { const o = osc('sawtooth', mtof(m), t, t + step, lp); o.detune.value = det; }
    if (acc) osc('sawtooth', mtof(m + 12), t, t + step, G(0.5, lp));
  }
}
// Metales: sierras con envolvente de filtro (trombones/trompas)
function brass(dest, t, dur, m, level) {
  const g = G(0, dest);
  adsr(g, t, 0.05, level, t + dur, 0.25);
  const lp = F('lowpass', 300, 2, shaper(1.6, g));
  lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(2400, t + 0.09); lp.frequency.linearRampToValueAtTime(1400, t + 0.4);
  for (const det of [-9, 0, 8]) { const o = osc('sawtooth', mtof(m), t, t + dur + 0.3, G(0.3, lp)); o.detune.value = det; }
  osc('sawtooth', mtof(m - 12), t, t + dur + 0.3, G(0.22, lp));
}
// BRAAAM
function braam(dest, t, dur, level, root = 26) {
  const g = G(0, dest);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.03); g.gain.setValueAtTime(level, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  const sat = shaper(3.2, g);
  const lp = F('lowpass', 180, 3, sat);
  lp.frequency.setValueAtTime(180, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.22); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
  for (const m of [root, root + 12, root + 19, root + 24]) for (const det of [-11, 0, 10]) { const o = osc('sawtooth', mtof(m), t, t + dur + 0.1, G(0.12, lp)); o.detune.value = det; }
  glide('sine', mtof(root) * 1.02, mtof(root) * 0.94, t, dur, level * 0.9, dest, 0.01);
}
function taiko(dest, t, level, pitch = 1) {
  glide('sine', 78 * pitch, 44 * pitch, t, 0.75, level, dest, 0.002);
  glide('sine', 150 * pitch, 90 * pitch, t, 0.12, level * 0.35, dest, 0.001);
  burst(WN, t, 'lowpass', 1100, 0.7, 0.09, level * 0.5, dest, 0.001);
  burst(BN, t, 'lowpass', 400, 0.7, 0.3, level * 0.6, dest, 0.001);
}
function timp(dest, t, m, level) {
  const f = mtof(m);
  [[1, 1, 1.8], [1.5, 0.45, 1.0], [1.98, 0.3, 0.7], [2.44, 0.15, 0.45]].forEach(([r, a, d]) => glide('sine', f * r * 1.01, f * r, t, d, level * a, dest, 0.003));
  burst(WN, t, 'bandpass', 600, 1, 0.05, level * 0.3, dest, 0.001);
}
function timpRoll(dest, t0, t1, m, l0, l1) {
  let t = t0;
  while (t < t1) { const k = (t - t0) / (t1 - t0); timp(dest, t, m, l0 + (l1 - l0) * k * k); t += lerpRate(k); }
}
const lerpRate = k => 0.11 - 0.06 * k;
function crash(dest, t, level, dur = 3.2) {
  const g = G(0, dest);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  const hp = F('highpass', 4200, 0.7, g);
  noise(WN, t, t + dur + 0.05, hp);
  for (const f of [3300, 5200, 7600]) noise(WN, t, t + dur + 0.05, F('bandpass', f, 8, G(0.6, g)));
}
function reverseSwell(dest, t0, t1, level) {
  const g = G(0, dest);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(level, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1);
  const bp = F('bandpass', 400, 0.9, g);
  bp.frequency.setValueAtTime(400, t0); bp.frequency.exponentialRampToValueAtTime(9000, t1);
  noise(WN, t0, t1 + 0.02, bp);
  const lp = F('lowpass', 200, 4, G(0.5, g));
  lp.frequency.setValueAtTime(200, t0); lp.frequency.exponentialRampToValueAtTime(3000, t1);
  const o = osc('sawtooth', 70, t0, t1 + 0.02, lp); o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(420, t1);
}
function bell(dest, t, m, level, dur = 7) {
  const f = mtof(m);
  [[0.5, 0.5, 1], [1, 1, 0.8], [1.183, 0.55, 0.6], [1.506, 0.4, 0.5], [2, 0.65, 0.45], [2.514, 0.25, 0.3], [3.011, 0.2, 0.25], [4.166, 0.12, 0.18]].forEach(([r, a, d], i) => {
    const g = G(0, dest);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level * a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0003, t + dur * d);
    const o = osc('sine', f * r, t, t + dur * d + 0.05, g); o.detune.value = (i % 2 ? 3 : -2);
  });
  burst(WN, t, 'bandpass', 2400, 2, 0.04, level * 0.25, dest, 0.001);
}
function subDrop(dest, t, level, dur = 2.4) { glide('sine', 64, 24, t, dur, level, dest, 0.01); }
function heartbeat(dest, t, level) { glide('sine', 62, 36, t, 0.3, level, dest, 0.004); glide('sine', 55, 34, t + 0.23, 0.34, level * 0.7, dest, 0.004); }
function musicBox(dest, notes, t0, beat, level) {
  const w = ctx.createOscillator(); w.frequency.value = 0.5; const wg = G(26); w.connect(wg); w.start(t0);
  let t = t0;
  for (const [m, d] of notes) {
    for (const [r, a, dec] of [[1, 1, 2.0], [2, 0.16, 0.9], [5.93, 0.08, 0.3]]) {
      for (const det of [0, 33]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m + 12) * r; o.detune.value = -40 + det; wg.connect(o.detune);
        const g = G(0, dest); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level * a * (det ? 0.35 : 1), t + 0.002); g.gain.exponentialRampToValueAtTime(0.00005, t + dec);
        o.connect(g); o.start(t); o.stop(t + dec + 0.05);
      }
    }
    t += d * beat;
  }
  w.stop(t + 2);
}

/* ------------------------------------------------------- instrumentos extra -- */
// bajo distorsionado en corcheas
function pulseBass(dest, t0, t1, rootAt, level) {
  const step = BEAT / 2;
  for (let t = Math.round(t0 / step) * step; t < t1 - 0.01; t += step) {
    const m = rootAt(t) - 24, g = G(0, dest);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.005); g.gain.exponentialRampToValueAtTime(level * 0.25, t + step * 0.9); g.gain.linearRampToValueAtTime(0, t + step);
    const lp = F('lowpass', 900, 3, shaper(4, g)); lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(260, t + step);
    for (const det of [-8, 8]) { const o = osc('sawtooth', mtof(m), t, t + step, lp); o.detune.value = det; }
    osc('square', mtof(m - 12), t, t + step, G(0.5, lp));
  }
}
// golpe de tráiler: taiko + chasquido + cola
function thud(dest, t, level) {
  taiko(dest, t, level, 0.9);
  burst(WN, t, 'bandpass', 1800, 0.8, 0.06, level * 0.5, dest, 0.001);
  burst(BN, t, 'lowpass', 180, 0.7, 0.9, level * 0.5, dest, 0.002);
}
function snare(dest, t, level) {
  burst(WN, t, 'bandpass', 2600, 0.6, 0.16, level, dest, 0.001);
  glide('triangle', 240, 160, t, 0.08, level * 0.5, dest, 0.001);
}
// rugido de propulsores
function thruster(dest, t0, t1, level, pan = 0) {
  const g = G(0, Pan(pan, dest)); env(g.gain, [[t0, 0], [t0 + 0.15, level], [t1 - 0.2, level * 0.8], [t1, 0]]);
  noise(BN, t0, t1, F('lowpass', 500, 0.7, g));
  noise(WN, t0, t1, F('bandpass', 1800, 0.6, G(0.25, g)));
}
function whoosh(dest, t, dur, level, f0 = 400, f1 = 3000) {
  const g = G(0, dest); env(g.gain, [[t, 0], [t + dur * 0.7, level], [t + dur, 0]]);
  const bp = F('bandpass', f0, 1.2, g); bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  noise(WN, t, t + dur + 0.02, bp);
}
function boom(dest, t, level) {
  glide('sine', 85, 30, t, 1.1, level * 0.6, dest, 0.002);
  burst(BN, t, 'lowpass', 700, 0.7, 1.4, level * 0.5, dest, 0.002);
  burst(WN, t, 'highpass', 1500, 0.7, 0.1, level * 0.25, dest, 0.001);
  const s = ctx.createBufferSource(); s.buffer = crackleBuf(1.5, 60, Math.floor(t * 100)); s.connect(F('bandpass', 1800, 0.7, G(level * 0.6, dest))); s.start(t);
}
// láser de los ojos: zumbido FM que chisporrotea
function laser(dest, t0, t1, level, f = 110) {
  const g = G(0, dest); env(g.gain, [[t0, 0], [t0 + 0.04, level], [t1 - 0.1, level], [t1, 0]]);
  const car = osc('sawtooth', f, t0, t1, F('bandpass', 1400, 0.8, shaper(3, g)));
  const mod = ctx.createOscillator(); mod.frequency.value = f * 1.49; const mg = G(f * 2.5); mod.connect(mg); mg.connect(car.frequency); mod.start(t0); mod.stop(t1);
  osc('sawtooth', f * 0.5, t0, t1, F('lowpass', 300, 1, G(0.6, g)));
  noise(WN, t0, t1, F('highpass', 5000, 0.5, G(0.15, g)));
}
function pew(dest, t, level, f = 2400) { glide('square', f, f * 0.25, t, 0.18, level, F('lowpass', 5000, 0.7, dest), 0.001); }
// chirrido metálico (corte del brazo)
function screech(dest, t, dur, level) {
  const g = G(0, dest); env(g.gain, [[t, 0], [t + 0.01, level], [t + dur, 0]]);
  for (const [f, r] of [[2800, 1], [3730, 0.6], [5120, 0.4]]) { const o = osc('sawtooth', f, t, t + dur, F('bandpass', f, 12, G(r, g))); o.frequency.linearRampToValueAtTime(f * 0.7, t + dur); }
}
// gore: chapoteo grave con goteo
function gore(dest, t, level) {
  const g = G(0, dest); env(g.gain, [[t, 0], [t + 0.01, level], [t + 0.5, level * 0.3], [t + 0.9, 0]]);
  const bp = F('bandpass', 380, 2.5, g); bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(160, t + 0.6);
  noise(BN, t, t + 0.95, bp);
  glide('sine', 120, 45, t, 0.4, level * 0.6, dest, 0.003);
  for (let i = 0; i < 6; i++) { const td = t + 0.12 + R() * 0.7; glide('sine', 900 + R() * 900, 300, td, 0.05, level * 0.12, dest, 0.001); }
}
function riser(dest, t0, t1, level) {
  reverseSwell(dest, t0, t1, level);
  const g = G(0, dest); env(g.gain, [[t0, 0], [t1 - 0.02, level * 0.7], [t1, 0]]);
  for (const r of [1, 1.5, 2.01]) { const o = osc('sawtooth', 110 * r, t0, t1, F('lowpass', 2500, 1, G(0.3, g))); o.frequency.setValueAtTime(110 * r, t0); o.frequency.exponentialRampToValueAtTime(880 * r, t1); }
}

/* ------------------------------------------------------------ partitura -- */
const CH = {
  Dm: [38, 50, 57, 62, 65, 69], C: [36, 48, 55, 60, 64, 67], Bb: [34, 46, 53, 58, 62, 65], A: [33, 45, 52, 57, 61, 64], Gm: [31, 43, 50, 55, 58, 62], F: [41, 53, 57, 60, 65, 69],
};
const ROOT = { Dm: 50, C: 48, Bb: 46, A: 45, Gm: 43, F: 53 };
// dos compases por acorde (4 s)… salvo en el tramo final
const HARM = [
  [0, 5, 'Dm'], [5, 7, 'Dm'], [7, 9, 'Bb'], [9, 11, 'Dm'], [11, 13, 'Bb'], [13, 14, 'C'], [14, 16, 'A'], [16, 18, 'Dm'], [18, 20, 'Bb'],
  [20, 22, 'Gm'], [22, 24, 'Bb'], [24, 25, 'A'], [25, 27, 'Dm'], [27, 29, 'Bb'], [29, 30, 'A'], [30, 36, 'Dm'],
];
const chordAt = t => { for (const h of HARM) if (t >= h[0] && t < h[1]) return h[2]; return 'Dm'; };
const LULLABY = [[68, 0.5], [68, 0.5], [72, 1.5], [68, 0.5], [68, 0.5], [72, 1.5], [68, 0.5], [72, 0.5], [77, 1]];

async function render(duration, opts = {}) {
  ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
  R = rng(20252);
  WN = noiseBuf(3, 'white', 11); BN = noiseBuf(4, 'brown', 23); PN = noiseBuf(3, 'pink', 37);
  const E = opts.ep2 || {};
  const PODS = E.PODS || [], LASER_EXP = E.LASER_EXP || [], SQUAD_EXP = E.SQUAD_EXP || [];

  // --- buses y mezcla
  const master = G(1);
  // dinámica: la calma es calma y los golpes pegan
  env(master.gain, [[0, 0.3], [1.9, 0.38], [2.0, 0.55], [4.9, 0.7], [5.0, 1], [14.05, 1], [14.2, 0.55], [14.98, 0.6], [15.0, 1], [26.9, 1], [27.0, 1], [30.0, 1], [30.4, 0.45], [34.0, 0.5], [34.05, 1]]);
  const duck = G(1);
  for (const [a, b] of [[4.94, 5.0], [7.94, 8.0], [13.9, 14.0], [26.85, 27.0], [33.98, 34.05]]) {
    duck.gain.setValueAtTime(1, a - 0.04); duck.gain.linearRampToValueAtTime(0.03, a); duck.gain.setValueAtTime(0.03, b - 0.004); duck.gain.linearRampToValueAtTime(1, b);
  }
  const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -14; glue.knee.value = 10; glue.ratio.value = 3; glue.attack.value = 0.008; glue.release.value = 0.2;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
  const hp = F('highpass', 28, 0.7);
  master.connect(duck); duck.connect(hp); hp.connect(glue); glue.connect(lim); lim.connect(ctx.destination);
  const verb = ctx.createConvolver(); verb.buffer = impulse(4.5, 2.4, 77);
  const rv = G(1); rv.connect(verb); verb.connect(G(0.6, master));
  const mus = G(1, master); mus.connect(G(0.3, rv));
  const choirBus = G(1, master); choirBus.connect(G(0.8, rv));
  const drums = G(1, master); drums.connect(G(0.22, rv));
  const sfx = G(0.9, master); sfx.connect(G(0.25, rv));

  const HIT = (t, big = 1) => {
    braam(mus, t, 2.6 * big, 0.75 * big); thud(drums, t, 1.4 * big); taiko(drums, t + 0.01, 0.9 * big, 0.55); crash(drums, t, 0.32 * big); subDrop(mus, t, 0.8 * big);
    choir(choirBus, t, t + 0.45 * big, [50, 57, 62, 65, 69], 0.5 * big, 'a', 0.02, 1.0);
  };
  const groove = (t0, t1, lvl = 1, fill = true) => {
    for (let t = t0; t < t1 - 0.01; t += BAR) {
      const last = t + BAR >= t1 - 0.01;
      thud(drums, t, 0.9 * lvl); taiko(drums, t + BEAT * 1.5, 0.45 * lvl, 1.15); thud(drums, t + BEAT * 2, 0.7 * lvl); taiko(drums, t + BEAT * 2.75, 0.35 * lvl, 1.3);
      snare(drums, t + BEAT, 0.28 * lvl); snare(drums, t + BEAT * 3, 0.32 * lvl);
      if (last && fill) for (let k = 0; k < 8; k++) snare(drums, t + BEAT * 3 + k * BEAT / 8, 0.12 + 0.03 * k);
    }
  };

  /* ================= 0–2: la cara entre el humo ================= */
  { const d = G(0, mus); env(d.gain, [[0, 0], [1.2, 0.07], [4.9, 0.1], [5.0, 0]]);
    const lp = F('lowpass', 180, 1.5, d); for (const [m, det] of [[26, -6], [26, 7], [33, 0]]) { const o = osc('sawtooth', mtof(m), 0, 5.1, lp); o.detune.value = det; } }
  choir(choirBus, 0.1, 2.0, [50, 57, 62], 0.12, 'u', 0.8, 0.4);
  heartbeat(drums, 0.4, 0.4); heartbeat(drums, 1.2, 0.45);
  bell(mus, 0.05, 38, 0.18, 6);
  riser(sfx, 1.1, 2.0, 0.14);
  { const g = G(0, sfx); env(g.gain, [[1.7, 0], [1.9, 0.25], [2.05, 0]]); noise(WN, 1.7, 2.05, F('bandpass', 3000, 1, g)); }

  /* ================= 2–5: el silo ================= */
  thud(drums, 2.0, 1.0); subDrop(mus, 2.0, 0.6, 1.5);
  thruster(sfx, 2.0, 5.0, 0.22);
  ostinato(mus, 2.0, 5.0, t => ROOT[chordAt(t)], 0.045);
  for (let t = 2.0; t < 3.5; t += BEAT) taiko(drums, t, 0.4, 1.2);
  whoosh(sfx, 2.9, 0.6, 0.3, 300, 4000);
  // se encienden los ojos
  brass(mus, 3.6, 1.2, 38, 0.2); brass(mus, 3.6, 1.2, 45, 0.16); thud(drums, 3.6, 1.1); crash(drums, 3.6, 0.2);
  { const g = G(0, sfx); env(g.gain, [[3.6, 0], [3.62, 0.2], [4.4, 0]]); osc('sine', 1760, 3.6, 4.4, g); osc('sine', 2637, 3.6, 4.4, G(0.5, g)); }
  choir(choirBus, 3.6, 4.95, [50, 57, 62, 65], 0.18, 'a', 0.1, 0.1);
  timpRoll(drums, 4.0, 4.93, 38, 0.1, 0.4);
  riser(sfx, 4.1, 4.95, 0.2);

  /* ================= 5: ¡REVIENTA EL ASFALTO! ================= */
  HIT(5.0, 1.1); boom(sfx, 5.0, 1.0); boom(sfx, 5.12, 0.6); boom(sfx, 5.18, 0.6);
  thruster(sfx, 5.0, 7.0, 0.3);
  ostinato(mus, 5.0, 13.9, t => ROOT[chordAt(t)], 0.065);
  pulseBass(mus, 5.0, 13.9, t => ROOT[chordAt(t)], 0.08);
  groove(5.5, 7.0, 0.9, false);
  for (const [t0, t1, c] of HARM.filter(h => h[0] >= 5 && h[0] < 14)) choir(choirBus, t0, t1 - 0.05, CH[c].slice(1, 5), 0.1, 'a', 0.2, 0.3);
  // caída
  whoosh(sfx, 7.0, 1.0, 0.35, 3000, 250);
  riser(sfx, 7.2, 7.95, 0.18);

  /* ================= 8: aterrizaje ================= */
  HIT(8.0, 1.0); boom(sfx, 8.0, 1.1); boom(sfx, 8.06, 0.5);
  { const s = ctx.createBufferSource(); s.buffer = crackleBuf(2, 120, 808); s.connect(F('bandpass', 1400, 0.6, G(0.8, sfx))); s.start(8.0); }
  brass(mus, 8.5, 0.4, 50, 0.1);

  /* ================= 9–13: carga y lluvia de misiles ================= */
  groove(9.0, 13.0, 1);
  thruster(sfx, 9.0, 13.0, 0.26, 0.2);
  // riff de metales
  const RIFF = [[50, 1], [50, 0.5], [53, 0.5], [55, 1], [53, 0.5], [52, 0.5]];
  for (const t0 of [9.0, 11.0]) { let t = t0; for (const [m, d] of RIFF) { brass(mus, t, d * BEAT * 0.85, m - (t0 > 10 ? 4 : 0), 0.12); t += d * BEAT; } }
  for (const p of PODS) {
    const t0 = 9 + p.t0, th = 9 + p.hit;
    const g = G(0, sfx); env(g.gain, [[t0, 0], [t0 + 0.05, 0.08], [th - 0.1, 0.04], [th, 0]]);
    const bp = F('bandpass', 1500, 1.4, g); bp.frequency.setValueAtTime(900, t0); bp.frequency.exponentialRampToValueAtTime(3200, th);
    noise(WN, t0, th, bp);
    boom(sfx, th, 0.45);
  }
  choir(choirBus, 11.9, 13.9, [53, 57, 62, 65], 0.16, 'a', 0.3, 0.1);
  // tensión antes del puñetazo
  riser(sfx, 13.0, 13.9, 0.26); timpRoll(drums, 13.0, 13.88, 38, 0.1, 0.5);
  for (let k = 0; k < 8; k++) snare(drums, 13.4 + k * 0.06, 0.1 + k * 0.03);

  /* ================= 14: ¡PUÑETAZO! (cámara lenta) ================= */
  HIT(14.0, 1.4); boom(sfx, 14.0, 1.2); gore(sfx, 14.02, 0.9); gore(sfx, 14.15, 0.6);
  { const g = G(0, sfx); env(g.gain, [[14.0, 0], [14.01, 0.5], [14.4, 0]]); noise(WN, 14.0, 14.4, F('bandpass', 900, 0.5, g)); }
  choir(choirBus, 14.1, 15.0, [38, 45, 50, 53], 0.2, 'u', 0.3, 0.4);
  heartbeat(drums, 14.35, 0.6); heartbeat(drums, 14.8, 0.5);
  { const d = G(0, mus); env(d.gain, [[14.1, 0], [14.4, 0.12], [15, 0.12], [15.1, 0]]);
    const lp = F('lowpass', 120, 1.5, d); osc('sawtooth', mtof(26), 14.1, 15.1, lp); osc('sawtooth', mtof(33), 14.1, 15.1, lp); }
  reverseSwell(sfx, 14.5, 15.0, 0.2);
  thud(drums, 15.0, 1.1); crash(drums, 15.0, 0.25); boom(sfx, 15.0, 0.5);
  ostinato(mus, 15.0, 20.0, t => ROOT[chordAt(t)], 0.065);
  pulseBass(mus, 15.0, 27.0, t => ROOT[chordAt(t)], 0.085);
  groove(15.0, 16.0, 0.8, false);

  /* ================= 16–20: láseres de los ojos ================= */
  groove(16.0, 20.0, 1);
  laser(sfx, 16.55, 19.6, 0.22, 110); laser(sfx, 16.55, 19.6, 0.12, 165);
  brass(mus, 16.55, 0.8, 45, 0.16); brass(mus, 16.55, 0.8, 52, 0.12);
  for (const e of LASER_EXP) boom(sfx, 16 + e[1], 0.3);
  // el corte
  HIT(17.4, 1.0); screech(sfx, 17.4, 0.9, 0.18); gore(sfx, 17.42, 0.5);
  { const g = G(0, sfx); env(g.gain, [[17.45, 0], [17.5, 0.15], [19.5, 0]]); noise(WN, 17.45, 19.5, F('highpass', 3000, 0.5, g)); } // chorro de refrigerante
  choir(choirBus, 17.4, 19.9, [45, 52, 57, 61, 64], 0.18, 'a', 0.05, 0.3);
  for (const t0 of [18.0, 19.0]) { let t = t0; for (const [m, d] of RIFF) { brass(mus, t, d * BEAT * 0.85, m - 5, 0.11); t += d * BEAT; } }

  /* ================= 20–25: la escuadra ================= */
  for (let i = 0; i < 4; i++) whoosh(sfx, 20.0 + i * 0.3, 1.2, 0.18, 3500, 400);
  thruster(sfx, 20.2, 25.0, 0.2, -0.3);
  ostinato(mus, 20.0, 26.9, t => ROOT[chordAt(t)], 0.07);
  groove(20.0, 24.0, 1);
  for (let t = 21.6; t < 24.9; t += 0.125) if (R() < 0.55) pew(sfx, t, 0.05, 1800 + R() * 1400);
  for (const e of SQUAD_EXP) boom(sfx, 20 + e[1], e[2] > 8 ? 1.0 : 0.3);
  // derriban a uno
  laser(sfx, 22.9, 23.25, 0.25, 130); HIT(23.2, 0.9); screech(sfx, 23.2, 0.5, 0.12);
  for (const [t0, t1, c] of HARM.filter(h => h[0] >= 20 && h[0] < 25)) choir(choirBus, t0, t1 - 0.05, CH[c].slice(1, 5), 0.15, 'a', 0.2, 0.3);
  playDies(22.0, 0.12);
  riser(sfx, 24.2, 24.98, 0.2);

  /* ================= 25–30: el cañón de la boca ================= */
  thud(drums, 25.0, 1.0); crash(drums, 25.0, 0.2);
  { const g = G(0, sfx); env(g.gain, [[25.1, 0], [26.8, 0.2], [26.9, 0]]);
    const o = osc('sawtooth', 120, 25.1, 26.95, F('lowpass', 1600, 6, g)); o.frequency.setValueAtTime(120, 25.1); o.frequency.exponentialRampToValueAtTime(1900, 26.85);
    const cr = crackleBuf(2, 90, 2727); const sb = ctx.createBufferSource(); sb.buffer = cr; sb.connect(F('bandpass', 3000, 0.8, G(1.1, g))); sb.start(25.1); }
  choir(choirBus, 25.0, 26.85, [50, 57, 62, 65, 69, 74], 0.16, 'a', 1.6, 0.05);
  timpRoll(drums, 25.6, 26.85, 38, 0.08, 0.5);
  for (let t = 25.0; t < 26.5; t += BEAT) thud(drums, t, 0.5 + (t - 25) * 0.3);
  for (let k = 0; k < 12; k++) snare(drums, 26.25 + k * 0.05, 0.08 + k * 0.025);
  riser(sfx, 26.0, 26.85, 0.25);
  // ¡FUEGO!
  HIT(27.0, 1.5); braam(mus, 27.0, 4, 0.45, 21); bell(mus, 27.0, 38, 0.3, 8);
  { const g = G(0, sfx); env(g.gain, [[27.0, 0], [27.03, 0.45], [28.3, 0.35], [28.6, 0]]);
    noise(BN, 27.0, 28.7, F('lowpass', 900, 0.7, g)); noise(WN, 27.0, 28.7, F('bandpass', 2400, 0.7, G(0.4, g))); osc('sawtooth', 55, 27.0, 28.7, F('lowpass', 400, 2, shaper(3, G(0.6, g)))); }
  for (const t of [27.02, 27.25, 27.5, 27.9, 28.4]) gore(sfx, t, 0.7);
  boom(sfx, 27.05, 1.0);
  ostinato(mus, 27.0, 29.9, t => ROOT[chordAt(t)], 0.08);
  pulseBass(mus, 27.0, 29.9, t => ROOT[chordAt(t)], 0.09);
  groove(27.0, 30.0, 1.1);
  playDies(27.5, 0.15);
  for (const [t0, t1, c] of HARM.filter(h => h[0] >= 27 && h[0] < 30)) { organ(mus, t0, t1 - 0.03, CH[c], 0.09, true); choir(choirBus, t0, t1 - 0.03, CH[c].slice(0, 5), 0.2, 'a', 0.1, 0.35); }

  /* ================= 30–36: epílogo ================= */
  thud(drums, 30.0, 0.9); bell(mus, 30.0, 38, 0.3, 8); bell(mus, 30.0, 45, 0.18, 7);
  { const d = G(0, mus); env(d.gain, [[30, 0], [30.5, 0.09], [35, 0.09], [35.9, 0]]);
    const lp = F('lowpass', 150, 1.5, d); for (const [m, det] of [[26, -6], [26, 7], [33, 0]]) { const o = osc('sawtooth', mtof(m), 30, 36, lp); o.detune.value = det; } }
  { const g = G(0, sfx); env(g.gain, [[30, 0], [30.4, 0.08], [35, 0.08], [35.8, 0]]); const sb = ctx.createBufferSource(); sb.buffer = crackleBuf(6, 25, 31337); sb.connect(F('bandpass', 2600, 0.5, g)); sb.start(30); }
  musicBox(G(1, mus), LULLABY, 30.6, 0.3, 0.07);
  for (const t of [32.2, 32.6, 33.0]) { glide('sine', 50, 26, t, 1.2, 0.5, sfx, 0.004); burst(BN, t, 'lowpass', 300, 0.7, 0.8, 0.3, sfx, 0.004); }
  choir(choirBus, 32.2, 33.95, [50, 57, 62, 63], 0.16, 'u', 0.6, 0.05);
  reverseSwell(sfx, 33.2, 34.02, 0.2);
  HIT(34.05, 1.2); bell(mus, 34.05, 38, 0.3, 8);

  const buf = await ctx.startRendering();
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  const k = peak > 0 ? 0.89 / peak : 1, fade = Math.floor(0.6 * SR);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
    for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  }
  return buf;

  function playDies(t0, lvl) {
    const DIES = [[53, 0.5], [52, 0.5], [53, 0.5], [50, 0.5], [52, 0.5], [48, 0.5], [50, 1]];
    let t = t0;
    for (const [m, d] of DIES) { brass(mus, t, d * BEAT * 0.9, m + 12, lvl); choir(choirBus, t, t + d * BEAT * 0.9, [m + 24], lvl * 1.3, 'a', 0.03, 0.2); t += d * BEAT; }
  }
}

function toWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  str(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Uint8Array(out.buffer);
}

return { render, toWav };
})();
