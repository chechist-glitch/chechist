/* ==========================================================================
   蒼キ嬰児 — banda sonora épica y gótica, 100 % sintetizada (WebAudio)
   96 BPM · compás = 2,5 s · Re menor · cadencia andaluza (Rem–Do–Si♭–La)
   Coro con formantes, órgano de tubos, ostinato de cuerdas, metales con el
   Dies Irae, braams, taikos, timbales, campanas y efectos sincronizados.
   ========================================================================== */
window.AEMusic = (function () {
const SR = 44100;
const BPM = 96, BEAT = 60 / BPM, BAR = 4 * BEAT;
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

/* ------------------------------------------------------------ partitura -- */
const CH = {
  Dm: [38, 50, 57, 62, 65, 69], C: [36, 48, 55, 60, 64, 67], Bb: [34, 46, 53, 58, 62, 65], A: [33, 45, 52, 57, 64, 69], Gm: [31, 43, 50, 55, 58, 62],
};
const ROOT = { Dm: 50, C: 48, Bb: 46, A: 45, Gm: 43 };
// Mapa de acordes (inicio, fin, acorde)
const HARM = [
  [0, 7.5, 'Dm'], [7.5, 10, 'Bb'], [10, 12.5, 'Dm'], [12.5, 15, 'C'], [15, 17.5, 'Bb'], [17.5, 20, 'A'], [20, 22.5, 'Dm'],
  [22.5, 23.75, 'Bb'], [23.75, 25, 'A'], [25, 27.5, 'Dm'], [27.5, 30, 'C'], [30, 32.5, 'Bb'], [32.5, 35, 'A'], [35, 37.5, 'Dm'], [37.5, 42.5, 'Dm'],
];
const chordAt = t => { for (const h of HARM) if (t >= h[0] && t < h[1]) return h[2]; return 'Dm'; };
const LULLABY = [[68, 0.5], [68, 0.5], [72, 1.5], [68, 0.5], [68, 0.5], [72, 1.5], [68, 0.5], [72, 0.5], [77, 1]];

async function render(duration, opts = {}) {
  ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
  R = rng(20251);
  WN = noiseBuf(3, 'white', 11); BN = noiseBuf(4, 'brown', 23); PN = noiseBuf(3, 'pink', 37);
  const END = duration;
  const missiles = opts.missiles || [];

  // --- buses y mezcla
  const master = G(1);
  const duck = G(1);
  for (const [a, b] of [[9.76, 10.0], [24.6, 25.0], [37.36, 37.5]]) {
    duck.gain.setValueAtTime(1, a - 0.04); duck.gain.linearRampToValueAtTime(0.02, a); duck.gain.setValueAtTime(0.02, b - 0.004); duck.gain.linearRampToValueAtTime(1, b);
  }
  const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -14; glue.knee.value = 10; glue.ratio.value = 2.5; glue.attack.value = 0.01; glue.release.value = 0.25;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
  const hp = F('highpass', 28, 0.7);
  master.connect(duck); duck.connect(hp); hp.connect(glue); glue.connect(lim); lim.connect(ctx.destination);
  const verb = ctx.createConvolver(); verb.buffer = impulse(5.5, 2.2, 77);
  const rv = G(1); rv.connect(verb); verb.connect(G(0.7, master));
  const mus = G(1, master); mus.connect(G(0.35, rv));
  const choirBus = G(1, master); choirBus.connect(G(0.9, rv));
  const drums = G(1, master); drums.connect(G(0.28, rv));
  const sfx = G(1, master); sfx.connect(G(0.3, rv));

  /* ======================== 0–3,75: intro ======================== */
  bell(mus, 0.05, 50, 0.16); bell(mus, at(2), 45, 0.13);
  { const d = G(0, mus); env(d.gain, [[0, 0], [1.5, 0.05], [3.75, 0.05], [9.7, 0.08], [9.75, 0]]);
    const lp = F('lowpass', 160, 1.5, d); for (const [m, det] of [[26, -6], [26, 7], [33, 0]]) { const o = osc('sawtooth', mtof(m), 0, 9.8, lp); o.detune.value = det; } }
  choir(choirBus, 0.6, 3.6, [50, 57, 62], 0.12, 'u', 1.2, 0.8);
  for (const t of [0.7, 1.95, 3.2]) heartbeat(drums, t, 0.28);
  reverseSwell(sfx, 2.9, 3.75, 0.18);

  /* ======================== 3,75–9,75: el mar ======================== */
  taiko(drums, 3.75, 0.6, 0.8); subDrop(mus, 3.75, 0.5, 2);
  { const r = G(0, sfx); env(r.gain, [[3.75, 0], [4.1, 0.09], [9.6, 0.09], [9.75, 0]]);
    noise(PN, 3.75, 9.75, F('highpass', 1400, 0.5, F('lowpass', 9000, 0.5, r))); }
  for (const t of [5.0, 7.5]) {
    burst(WN, t, 'highpass', 1200, 0.7, 0.25, 0.5, sfx, 0.001);
    const g = G(0, sfx); env(g.gain, [[t, 0], [t + 0.08, 0.5], [t + 0.8, 0.3], [t + 2.8, 0]]);
    noise(BN, t, t + 3, F('lowpass', 220, 0.8, g));
  }
  { const g = G(0, sfx); env(g.gain, [[4.4, 0], [7.5, 0.18], [9.5, 0.25], [9.75, 0]]); noise(BN, 4.4, 9.75, F('lowpass', 320, 0.7, g)); }
  organ(mus, at(3), 7.5, [38, 50, 57, 62], 0.1); organ(mus, 7.5, 9.7, [34, 46, 53, 58, 62], 0.12);
  choir(choirBus, at(3), 7.5, [50, 57, 62, 65], 0.16, 'o', 1.4, 0.6); choir(choirBus, 7.5, 9.7, [46, 53, 58, 62], 0.2, 'o', 0.6, 0.1);
  timpRoll(drums, 8.8, 9.7, 38, 0.06, 0.32);
  reverseSwell(sfx, 8.4, 9.74, 0.13);
  heartbeat(drums, 9.76, 0.55);

  /* ======================== 10: ¡LOS OJOS! ======================== */
  const HIT = (t, big = 1) => {
    braam(mus, t, 3.2 * big, 0.8 * big); taiko(drums, t, 1.4 * big, 0.75); taiko(drums, t + 0.01, 0.9 * big, 0.55); crash(drums, t, 0.35 * big); subDrop(mus, t, 0.8 * big);
    choir(choirBus, t, t + 0.5 * big, [50, 57, 62, 65, 69], 0.55 * big, 'a', 0.02, 1.2);
    burst(WN, t, 'highpass', 2500, 0.7, 0.12, 0.3, sfx, 0.001);
  };
  HIT(10.0);
  for (const t of [10.02, 10.06, 10.1]) burst(WN, t, 'bandpass', 5000, 3, 0.05, 0.15, sfx, 0.001);

  /* ======================== 10–24,6: build ======================== */
  ostinato(mus, 10.0, 24.6, t => ROOT[chordAt(t)], 0.06);
  for (const [t0, t1, c] of HARM.filter(h => h[0] >= 10 && h[0] < 25)) {
    organ(mus, t0, t1 - 0.05, CH[c].slice(0, 5), 0.06);
    choir(choirBus, t0, t1 - 0.05, CH[c].slice(1, 5), t0 < 17.5 ? 0.09 : 0.13, t0 < 17.5 ? 'o' : 'a', 0.35, 0.4);
  }
  // taikos
  for (let b = 5; b <= 7; b++) { taiko(drums, at(b, 1), 0.7); taiko(drums, at(b, 3), 0.5, 1.1); taiko(drums, at(b, 4.5), 0.3, 1.25); }
  for (let b = 8; b <= 9; b++) for (let k = 0; k < 8; k++) taiko(drums, at(b, 1 + k * 0.5), k % 4 === 0 ? 0.8 : k % 2 ? 0.28 : 0.45, k % 4 === 0 ? 1 : 1.2);
  taiko(drums, at(10, 1), 0.8);
  // la ciudad: sirenas y pitidos del HUD
  for (const [pan, ph] of [[-0.6, 0], [0.55, 1.7]]) {
    const g = G(0, Pan(pan, sfx)); env(g.gain, [[12.5, 0], [13.2, 0.035], [17.2, 0.035], [17.5, 0]]);
    const o = osc('triangle', 700, 12.5, 17.5, F('bandpass', 900, 1.5, g));
    const l = ctx.createOscillator(); l.frequency.value = 0.28; const lg = G(260); l.connect(lg); lg.connect(o.frequency); l.start(12.5 - ph); l.stop(17.5);
  }
  const blip = (t, f, l = 0.05, d = 0.06) => { const g = G(0, sfx); adsr(g, t, 0.003, l, t + d, 0.02); osc('square', f, t, t + d + 0.05, F('lowpass', 4000, 0.7, g)); };
  blip(12.55, 1800); blip(12.95, 1200, 0.06, 0.12); blip(13.1, 1200, 0.06, 0.12);
  for (let i = 0; i < 4; i++) blip(13.1 + i * 0.08, 2400, 0.04, 0.03);
  for (let r = 0; r < 5; r++) for (let i = 0; i < 6; i++) blip(12.5 + 1.3 + r * 0.5 + i * 0.04, 3200 - r * 120, 0.02, 0.012);
  // el ataque: cazas, misiles y explosiones
  { const g = G(0, sfx); env(g.gain, [[17.5, 0], [17.7, 0.35], [18.4, 0.1], [19, 0]]);
    const pn = Pan(0, g); pn.pan.setValueAtTime(0.8, 17.5); pn.pan.linearRampToValueAtTime(-0.8, 18.6);
    const bp = F('bandpass', 2200, 0.8, pn); bp.frequency.setValueAtTime(2600, 17.5); bp.frequency.exponentialRampToValueAtTime(500, 18.8);
    noise(WN, 17.5, 19, bp); }
  for (const m of missiles) {
    const t0 = 17.5 + m.t0, th = 17.5 + m.hit;
    const g = G(0, sfx); env(g.gain, [[t0, 0], [t0 + 0.1, 0.05], [th - 0.1, 0.03], [th, 0]]);
    const bp = F('bandpass', 1500, 1.4, g); bp.frequency.setValueAtTime(900, t0); bp.frequency.exponentialRampToValueAtTime(3000, th);
    noise(WN, t0, th, bp);
    glide('sine', 90, 38, th, 0.9, 0.28, sfx, 0.002);
    burst(BN, th, 'lowpass', 900, 0.7, 1.1, 0.35, sfx, 0.002);
    burst(WN, th, 'highpass', 1800, 0.7, 0.08, 0.12, sfx, 0.001);
  }
  for (let i = 0; i < 4; i++) brass(mus, at(8, 1 + i), BEAT * 0.45, 45 + (i % 2 ? 7 : 0), 0.09);
  for (let i = 0; i < 4; i++) brass(mus, at(9, 1 + i), BEAT * 0.45, 50 + (i === 3 ? 3 : 0), 0.1);
  // la mano se alza: coro creciente, carga eléctrica, silencio
  choir(choirBus, 21.25, 24.55, [50, 57, 62, 65, 69, 74], 0.15, 'a', 2.5, 0.05);
  timpRoll(drums, 22.6, 24.55, 38, 0.08, 0.38);
  { const g = G(0, sfx); env(g.gain, [[22.6, 0], [24.4, 0.18], [24.55, 0]]);
    const o = osc('sawtooth', 180, 22.6, 24.6, F('lowpass', 1200, 6, g)); o.frequency.setValueAtTime(180, 22.6); o.frequency.exponentialRampToValueAtTime(1500, 24.5);
    const cr = crackleBuf(2.2, 70, 999); const s = ctx.createBufferSource(); s.buffer = cr; s.connect(F('bandpass', 3200, 0.8, G(1.2, g))); s.start(22.6); }
  reverseSwell(sfx, 23.6, 24.58, 0.16);
  { const g = G(0, sfx); env(g.gain, [[24.35, 0], [24.5, 0.3], [24.62, 0]]); const bp = F('bandpass', 3000, 1, g); bp.frequency.setValueAtTime(5000, 24.35); bp.frequency.exponentialRampToValueAtTime(300, 24.62); noise(WN, 24.35, 24.65, bp); }

  /* ======================== 25: EL TOQUE ======================== */
  HIT(25.0, 1.35);
  braam(mus, 25.0, 4.5, 0.4, 21);
  bell(mus, 25.0, 38, 0.3, 9);
  { const g = G(0, sfx); env(g.gain, [[25, 0], [25.05, 0.5], [26.5, 0.3], [29.5, 0]]); noise(BN, 25, 29.6, F('lowpass', 140, 0.8, g)); }
  { const s = ctx.createBufferSource(); s.buffer = crackleBuf(3, 90, 4242); s.connect(F('bandpass', 2200, 0.7, G(0.9, sfx))); s.start(25.02); }
  // Dies Irae (metales + sopranos) sobre Rem–Do–Si♭–La, con órgano pleno
  const DIES = [[53, 1], [52, 1], [53, 1], [50, 1], [52, 1], [48, 1], [50, 2]];
  const playDies = (t0, oct, lvl) => {
    let t = t0;
    for (const [m, d] of DIES) {
      brass(mus, t, d * BEAT * 0.92, m + oct, lvl);
      choir(choirBus, t, t + d * BEAT * 0.9, [m + oct + 12], lvl * 1.5, 'a', 0.04, 0.25);
      t += d * BEAT;
    }
  };
  playDies(at(11), 0, 0.14);
  playDies(at(13), 12, 0.13);
  for (const [t0, t1, c] of HARM.filter(h => h[0] >= 25 && h[0] < 35)) {
    organ(mus, t0, t1 - 0.03, CH[c], 0.1, true);
    choir(choirBus, t0, t1 - 0.03, CH[c].slice(0, 5), 0.2, 'a', 0.15, 0.35);
    timp(drums, t0, ROOT[c] - 12, 0.5);
  }
  ostinato(mus, 25.0, 35.0, t => ROOT[chordAt(t)], 0.07);
  for (let b = 11; b <= 14; b++) {
    taiko(drums, at(b, 1), 1.0, 0.8);
    taiko(drums, at(b, 2.5), 0.4, 1.2); taiko(drums, at(b, 3), 0.7, 1);
    for (let k = 0; k < 4; k++) taiko(drums, at(b, 4 + k * 0.25), 0.25 + k * 0.1, 1.3);
  }
  // la Tierra se agrieta
  { const s = ctx.createBufferSource(); s.buffer = crackleBuf(3, 140, 777); const g = G(0, sfx); env(g.gain, [[27.5, 0], [27.7, 0.9], [30, 0]]); s.connect(F('bandpass', 1600, 0.6, g)); s.start(27.5); }
  crash(drums, 27.5, 0.2); crash(drums, 30.0, 0.22);
  // la horda: campanas y pasos de gigante
  bell(mus, 30.0, 38, 0.3, 8); bell(mus, 30.0, 45, 0.18, 7); bell(mus, 32.5, 45, 0.2, 7);
  for (const t of [30.6, 32.1, 33.6]) { glide('sine', 50, 26, t, 1.4, 0.5, sfx, 0.004); burst(BN, t, 'lowpass', 300, 0.7, 0.8, 0.3, sfx, 0.004); }
  { const g = G(0, sfx); env(g.gain, [[30, 0], [30.5, 0.06], [34.8, 0.06], [35, 0]]); const s = ctx.createBufferSource(); s.buffer = crackleBuf(5, 30, 31337); s.connect(F('bandpass', 2600, 0.5, g)); s.start(30); }

  /* ======================== 35: la sonrisa ======================== */
  choir(choirBus, 35.0, 37.3, [50, 57, 62, 63], 0.14, 'u', 0.3, 0.1);
  { const g = G(0, mus); adsr(g, 35, 0.3, 0.012, 37.3, 0.05); for (const f of [1174.7, 1244.5]) osc('sine', f, 35, 37.4, g); }
  musicBox(G(1, mus), LULLABY, 35.15, 0.3, 0.08);
  heartbeat(drums, 35.3, 0.45); heartbeat(drums, 36.3, 0.5);
  reverseSwell(sfx, 36.5, 37.34, 0.16);

  /* ======================== 37,5: título ======================== */
  HIT(37.5, 1.2);
  bell(mus, 37.5, 38, 0.3, 9);
  taiko(drums, 38.75, 0.7, 0.9);
  HIT(40.0, 1.0);
  bell(mus, 40.0, 50, 0.25, 8); bell(mus, 40.0, 45, 0.2, 8);
  choir(choirBus, 40.0, 41.6, [38, 50, 57, 62, 65], 0.2, 'a', 0.05, 1.0);

  const buf = await ctx.startRendering();
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  const k = peak > 0 ? 0.89 / peak : 1, fade = Math.floor(0.3 * SR);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
    for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  }
  return buf;
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
