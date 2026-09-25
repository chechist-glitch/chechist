/* ==========================================================================
   LOS BEBÉS AZULES — banda sonora 100 % sintetizada (WebAudio)
   Se renderiza con OfflineAudioContext para que sea idéntica en el
   navegador y en el MP4. Todo el ruido sale de un generador con semilla.
   ========================================================================== */
window.BBAudio = (function () {
const SR = 44100;

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

/* ------------------------------------------------------------ utilidades -- */
function G(ctx, v, dest) { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
function F(ctx, type, f, q, dest) {
  const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f;
  if (q != null) b.Q.value = q;
  if (dest) b.connect(dest);
  return b;
}
function P(ctx, pan, dest) { const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(dest); return p; }
function env(param, pts) {
  param.setValueAtTime(pts[0][1], 0);
  param.setValueAtTime(pts[0][1], pts[0][0]);
  for (let i = 1; i < pts.length; i++) param.linearRampToValueAtTime(pts[i][1], pts[i][0]);
}
function osc(ctx, type, f, t0, t1, dest) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
  o.connect(dest); o.start(t0); o.stop(t1);
  return o;
}
function loopSrc(ctx, buf, t0, t1, dest) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
  s.connect(dest); s.start(t0, (t0 * 0.618) % buf.duration); s.stop(t1);
  return s;
}
function oneShot(ctx, buf, t, dest, rate = 1) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
  s.connect(dest); s.start(t);
  return s;
}
function shaper(ctx, amount, dest) {
  const ws = ctx.createWaveShaper(); const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  ws.curve = c; ws.oversample = '2x';
  if (dest) ws.connect(dest);
  return ws;
}

/* ------------------------------------------------------------- buffers -- */
function noiseBuf(ctx, sec, kind, seed) {
  const n = Math.floor(sec * ctx.sampleRate), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), r = rng(seed);
  if (kind === 'brown') {
    let l = 0; for (let i = 0; i < n; i++) { l = (l + 0.02 * (r() * 2 - 1)) / 1.02; d[i] = l * 3.5; }
  } else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) { const w = r() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22; }
  } else {
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  }
  return b;
}
// el traqueteo del proyector: un "clac" por fotograma, irregular
function clatterBuf(ctx, fps, seed) {
  const sec = 2, n = sec * ctx.sampleRate, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), r = rng(seed);
  const per = ctx.sampleRate / fps;
  for (let k = 0; k < sec * fps; k++) {
    const p0 = Math.floor(k * per + (r() - 0.5) * 40);
    const amp = 0.55 + 0.45 * r();
    for (let i = 0; i < 700; i++) {
      const j = p0 + i; if (j < 0 || j >= n) continue;
      const e = Math.exp(-i / 90);
      d[j] += amp * ((r() * 2 - 1) * e + 0.6 * Math.sin(i * 2 * Math.PI * 130 / ctx.sampleRate) * Math.exp(-i / 260));
    }
  }
  return b;
}
// chasquidos del polvo en la banda óptica
function crackleBuf(ctx, sec, rate, seed) {
  const n = Math.floor(sec * ctx.sampleRate), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), r = rng(seed);
  const p = rate / ctx.sampleRate;
  for (let i = 0; i < n; i++) {
    if (r() < p) {
      const a = Math.pow(r(), 3.5) * (r() < 0.5 ? -1 : 1);
      const len = 2 + Math.floor(r() * 30);
      for (let k = 0; k < len && i + k < n; k++) d[i + k] += a * Math.exp(-k / (len * 0.3)) * (k % 2 ? -0.6 : 1);
    }
  }
  return b;
}
function impulse(ctx, sec, decay, seed) {
  const n = Math.floor(sec * ctx.sampleRate), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch), r = rng(seed + ch * 17);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += ((r() * 2 - 1) - lp) * (0.5 - 0.4 * i / n);
      d[i] = lp * Math.pow(1 - i / n, decay);
    }
  }
  return b;
}

/* ------------------------------------------------------------ elementos -- */
function beep(ctx, dest, t, f, dur, g) {
  const a = G(ctx, 0, dest);
  a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(g, t + 0.002);
  a.gain.setValueAtTime(g, t + dur - 0.003); a.gain.linearRampToValueAtTime(0, t + dur);
  osc(ctx, 'sine', f, t, t + dur + 0.01, a);
}
function thump(ctx, dest, t, f0, f1, dur, g) {
  const a = G(ctx, 0, dest);
  a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(g, t + 0.006);
  a.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  const o = osc(ctx, 'sine', f0, t, t + dur + 0.02, a);
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
}
function noiseHit(ctx, dest, N, t, type, f, q, dur, g) {
  const a = G(ctx, 0, dest);
  a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(g, t + 0.003);
  a.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  const fl = F(ctx, type, f, q, a);
  const s = ctx.createBufferSource(); s.buffer = N; s.connect(fl); s.start(t, (t * 0.37) % 1); s.stop(t + dur + 0.02);
}
function heartbeat(ctx, dest, t, g) {
  thump(ctx, dest, t, 62, 36, 0.28, g);
  thump(ctx, dest, t + 0.24, 55, 34, 0.32, g * 0.7);
}
function heartbeats(ctx, dest, t0, t1, bpm0, bpm1, g) {
  let t = t0;
  while (t < t1) {
    const k = (t - t0) / (t1 - t0);
    heartbeat(ctx, dest, t, g);
    t += 60 / (bpm0 + (bpm1 - bpm0) * k);
  }
}

// cajita de música: láminas con parciales inarmónicos, desafinada con el "wow" de la cinta
function musicBox(ctx, dest, notes, t0, opts) {
  const { beat, gain, cents0 = 0, slow = 0, drop = 0, stopAt = 1e9, wobble = 18 } = opts;
  const w1 = ctx.createOscillator(); w1.frequency.value = 0.55;
  const w2 = ctx.createOscillator(); w2.frequency.value = 0.17;
  const g1 = G(ctx, wobble), g2 = G(ctx, wobble * 1.6);
  w1.connect(g1); w2.connect(g2);
  w1.start(t0); w2.start(t0);
  let t = t0, tot = notes.reduce((a, n) => a + n[1], 0), acc = 0;
  let last = t0;
  for (const [m, d] of notes) {
    if (t > stopAt) break;
    const k = acc / tot;
    const cents = cents0 - drop * k * k;
    const f = mtof(m + 12);
    const parts = [[1, 1, 2.2], [2.0, 0.16, 1.0], [5.93, 0.09, 0.35], [9.8, 0.035, 0.14]];
    for (const [r, a, dec] of parts) {
      for (const det of [0, 31]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * r; o.detune.value = cents + det;
        g1.connect(o.detune); g2.connect(o.detune);
        const ag = ctx.createGain();
        const amp = a * gain * (det ? 0.35 : 1) * (0.8 + 0.2 * Math.sin(acc * 3.1));
        ag.gain.setValueAtTime(0, t); ag.gain.linearRampToValueAtTime(amp, t + 0.002);
        ag.gain.exponentialRampToValueAtTime(0.00005, t + dec * (1 + slow * k));
        o.connect(ag); ag.connect(dest);
        o.start(t); o.stop(t + dec * (1 + slow * k) + 0.05);
      }
    }
    const bd = beat * (1 + slow * k * k);
    t += d * bd; acc += d; last = t;
  }
  w1.stop(last + 3); w2.stop(last + 3);
}

// coro "uuuh" con formantes
function choir(ctx, dest, t0, t1, midis, g, vowel = 'u') {
  const FM = vowel === 'a' ? [[700, 8, 1], [1150, 10, 0.5], [2600, 12, 0.15]] : [[330, 7, 1], [820, 9, 0.4], [2400, 12, 0.1]];
  const sum = G(ctx, 0, dest);
  env(sum.gain, [[t0, 0], [t0 + 1.6, g], [t1 - 1.4, g], [t1, 0]]);
  const fb = FM.map(([f, q, a]) => { const b = F(ctx, 'bandpass', f, q); b.connect(G(ctx, a * 3, sum)); return b; });
  let i = 0;
  for (const m of midis) for (const det of [-9, 8]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
    const v = ctx.createOscillator(); v.frequency.value = 4.6 + (i++ % 5) * 0.23;
    const vg = G(ctx, 11); v.connect(vg); vg.connect(o.detune);
    for (const b of fb) o.connect(b);
    o.start(t0); o.stop(t1 + 0.1); v.start(t0); v.stop(t1 + 0.1);
  }
}

// voz de radio ininteligible (el piloto)
function radioVoice(ctx, dest, N, t0, t1, seed) {
  const r = rng(seed);
  const out = G(ctx, 1, dest);
  const hp = F(ctx, 'highpass', 450, 0.7);
  const lp = F(ctx, 'lowpass', 2900, 0.7, out);
  const sh = shaper(ctx, 3, lp);
  hp.connect(sh);
  const gate = G(ctx, 0, hp);
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 135;
  const f1 = F(ctx, 'bandpass', 600, 5), f2 = F(ctx, 'bandpass', 1400, 6);
  o.connect(f1); o.connect(f2); f1.connect(gate); f2.connect(G(ctx, 0.7, gate));
  const ns = ctx.createBufferSource(); ns.buffer = N; ns.loop = true;
  const nf = F(ctx, 'bandpass', 2500, 2); ns.connect(nf); nf.connect(G(ctx, 0.08, gate));
  let t = t0;
  gate.gain.setValueAtTime(0, 0);
  while (t < t1) {
    const words = 2 + Math.floor(r() * 5);
    for (let w = 0; w < words && t < t1; w++) {
      const syl = 1 + Math.floor(r() * 3);
      for (let s = 0; s < syl; s++) {
        const d = 0.07 + r() * 0.11;
        const f = 115 + r() * 55;
        o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (0.9 + r() * 0.2), t + d);
        f1.frequency.setValueAtTime(350 + r() * 500, t);
        f2.frequency.setValueAtTime(950 + r() * 1300, t);
        gate.gain.setValueAtTime(0, t); gate.gain.linearRampToValueAtTime(0.9, t + 0.015);
        gate.gain.setValueAtTime(0.9, t + d - 0.02); gate.gain.linearRampToValueAtTime(0.05, t + d);
        t += d + 0.015;
      }
      t += 0.04 + r() * 0.1;
    }
    gate.gain.setValueAtTime(0, t);
    t += 0.25 + r() * 0.45;
  }
  o.start(t0); o.stop(t1 + 0.2); ns.start(t0); ns.stop(t1 + 0.2);
}

/* ------------------------------------------------------------ partitura -- */
// Nana de Brahms llevada a Fa menor armónico (una octava arriba en la cajita)
const PHRASE_A = [[68, .5], [68, .5], [72, 1.5], [68, .5], [68, .5], [72, 1.5], [68, .5], [72, .5], [77, 1], [76, 1.5], [73, .5], [73, 1], [72, 1]];
const PHRASE_B = [[67, .5], [68, .5], [70, 1], [67, 1], [67, .5], [68, .5], [70, 1.5], [67, .5], [70, .5], [76, .5], [73, .5], [72, 1], [76, 1], [77, 2]];

async function render(duration) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);

  // cadena maestra: paso banda "óptico", saturación suave, compresor
  const master = G(ctx, 1);
  const hp = F(ctx, 'highpass', 32, 0.7);
  const lp = F(ctx, 'lowpass', 10500, 0.5);
  const sat = shaper(ctx, 1.4);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -15; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.28;
  master.connect(hp); hp.connect(lp); lp.connect(sat); sat.connect(comp); comp.connect(ctx.destination);
  const verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 4.5, 2.4, 91);
  const rv = G(ctx, 1); rv.connect(verb); verb.connect(G(ctx, 0.55, master));

  const WN = noiseBuf(ctx, 3, 'white', 11), BN = noiseBuf(ctx, 4, 'brown', 23), PN = noiseBuf(ctx, 3, 'pink', 37);
  const END = duration;

  /* ---- proyector: traqueteo, motor, siseo, polvo y zumbido de 50 Hz ---- */
  {
    const lvl = G(ctx, 0, master);
    env(lvl.gain, [[0, 0], [0.05, 1], [58, 1], [58.1, 1.35], [61, 1.35], [61.3, 1], [END - 0.25, 1.1], [END, 0]]);
    const clat = clatterBuf(ctx, 24, 5);
    const cf = F(ctx, 'bandpass', 1900, 0.6); cf.connect(G(ctx, 0.07, lvl));
    loopSrc(ctx, clat, 0, END, cf);
    const low = F(ctx, 'lowpass', 220, 0.7); low.connect(G(ctx, 0.05, lvl));
    loopSrc(ctx, clat, 0, END, low);
    const hs = F(ctx, 'highpass', 3200, 0.5); hs.connect(G(ctx, 0.012, lvl));
    loopSrc(ctx, PN, 0, END, hs);
    const cr = crackleBuf(ctx, END, 7, 71);
    const crf = F(ctx, 'highpass', 500, 0.5); crf.connect(G(ctx, 0.5, lvl));
    oneShot(ctx, cr, 0, crf);
    const hum = G(ctx, 1, lvl);
    osc(ctx, 'sine', 50, 0, END, G(ctx, 0.003, hum));
    osc(ctx, 'sine', 100, 0, END, G(ctx, 0.003, hum));
    osc(ctx, 'sine', 150, 0, END, G(ctx, 0.0015, hum));
  }

  /* ---- cola de arranque (cuenta atrás) ---- */
  for (const t of [0, 1, 2, 3]) noiseHit(ctx, master, WN, t, 'bandpass', 3000, 1, 0.03, 0.12);
  beep(ctx, master, 3.0, 1000, 1 / 24, 0.2);
  noiseHit(ctx, master, WN, 3.5, 'highpass', 1500, 0.7, 0.04, 0.25);

  /* ---- empalmes ---- */
  for (const t of [4.5, 10.5, 17, 24, 31, 41, 47, 53, 61]) {
    noiseHit(ctx, master, WN, t, 'highpass', 1800, 0.7, 0.03, 0.22);
    thump(ctx, master, t, 90, 50, 0.12, 0.18);
  }

  /* ---- dron grave que no suelta ---- */
  {
    const g = G(ctx, 0, master);
    env(g.gain, [[0, 0], [4.5, 0], [7, 0.03], [10.5, 0.033], [17, 0.024], [24, 0.036], [31, 0.04], [34.85, 0.07], [34.97, 0.0],
      [35.4, 0.055], [41, 0.033], [47, 0.042], [53, 0.045], [57.95, 0.075], [58.0, 0], [61, 0], [62, 0.03], [END - 0.2, 0.036], [END, 0]]);
    const f = F(ctx, 'lowpass', 200, 1.2, g);
    const lf = ctx.createOscillator(); lf.frequency.value = 0.07; const lg = G(ctx, 70); lf.connect(lg); lg.connect(f.frequency);
    lf.start(0); lf.stop(END);
    for (const [fr, det] of [[36.71, -6], [36.71, 7], [55, -4], [55, 5], [77.78, 0]]) {
      const o = osc(ctx, 'sawtooth', fr, 0, END, f); o.detune.value = det;
    }
    // disonancia aguda (Re–Mi bemol) con trémolo
    const hi = G(ctx, 0, master);
    env(hi.gain, [[0, 0], [24, 0], [26, 0.006], [31, 0.007], [35, 0.012], [36, 0], [53, 0], [55, 0.008], [57.95, 0.016], [58, 0]]);
    const tr = G(ctx, 0.5, hi);
    const tl = ctx.createOscillator(); tl.frequency.value = 5.5; const tg = G(ctx, 0.5); tl.connect(tg); tg.connect(tr.gain);
    tl.start(0); tl.stop(END);
    osc(ctx, 'sine', 587.33, 0, END, tr); osc(ctx, 'sine', 622.25, 0, END, tr); osc(ctx, 'sine', 1244.5, 0, END, G(ctx, 0.3, tr));
  }

  /* ---- título: se abren los ojos ---- */
  thump(ctx, master, 4.55, 48, 30, 2.2, 0.45);
  {
    const g = G(ctx, 0, master); env(g.gain, [[5.6, 0], [6.4, 0.05], [7.2, 0]]);
    const o = osc(ctx, 'sawtooth', 110, 5.6, 7.3, F(ctx, 'lowpass', 900, 4, g));
    o.frequency.setValueAtTime(110, 5.6); o.frequency.exponentialRampToValueAtTime(440, 6.6);
  }
  thump(ctx, master, 7.6, 110, 60, 0.18, 0.4);
  noiseHit(ctx, master, WN, 7.6, 'lowpass', 900, 0.7, 0.12, 0.3);
  { const mb = G(ctx, 1, master); mb.connect(G(ctx, 0.5, rv)); env(mb.gain, [[5, 1], [10.5, 1], [12.5, 0.55]]);
    musicBox(ctx, mb, PHRASE_A, 5.1, { beat: 0.74, gain: 0.11 }); }

  /* ---- la Tierra: los ojos aparecen en el cielo ---- */
  {
    const g = G(ctx, 0, master); g.connect(G(ctx, 0.6, rv));
    env(g.gain, [[13.6, 0], [15.8, 0.035], [16.9, 0.035], [17.0, 0]]);
    choir(ctx, g, 13.6, 17.0, [50, 57, 62, 63], 1, 'a');
  }

  /* ---- nubes: viento, avión lejano y la radio del piloto ---- */
  {
    const w = G(ctx, 0, master);
    env(w.gain, [[17, 0], [17.4, 0.11], [23.6, 0.11], [24, 0]]);
    const bf = F(ctx, 'bandpass', 500, 1.3, w);
    env(bf.frequency, [[17, 380], [19.5, 900], [21.5, 520], [24, 760]]);
    loopSrc(ctx, PN, 17, 24, bf);
    const pl = G(ctx, 0, P(ctx, 0, master));
    env(pl.gain, [[17, 0], [18.5, 0.02], [23, 0.02], [24, 0]]);
    const pf = F(ctx, 'lowpass', 320, 0.7, pl);
    osc(ctx, 'sawtooth', 91, 17, 24, pf); osc(ctx, 'sawtooth', 94.5, 17, 24, pf);
    const rad = G(ctx, 0.9, P(ctx, -0.15, master));
    noiseHit(ctx, rad, WN, 17.35, 'bandpass', 2200, 1, 0.05, 0.25);
    noiseHit(ctx, rad, WN, 23.85, 'bandpass', 2200, 1, 0.05, 0.25);
    const st = G(ctx, 0, rad); env(st.gain, [[17.35, 0], [17.4, 0.035], [23.8, 0.035], [23.85, 0]]);
    loopSrc(ctx, WN, 17.35, 23.9, F(ctx, 'bandpass', 1800, 0.9, st));
    radioVoice(ctx, G(ctx, 0.11, rad), WN, 17.6, 20.3, 314);
    radioVoice(ctx, G(ctx, 0.12, rad), WN, 20.9, 23.5, 2718);
  }

  /* ---- primer plano: latido ---- */
  { const hb = F(ctx, 'lowpass', 160, 0.7, master);
    heartbeats(ctx, hb, 24.4, 31, 54, 58, 0.55);
    heartbeats(ctx, hb, 31.2, 34.8, 72, 118, 0.5);
    heartbeats(ctx, hb, 53.3, 57.9, 84, 140, 0.55);
    heartbeats(ctx, hb, 61.4, END - 0.5, 50, 46, 0.5); }
  // parpadeo
  noiseHit(ctx, master, WN, 27.62, 'bandpass', 700, 2, 0.08, 0.06);

  /* ---- EL TOQUE ---- */
  {
    const T = 35.0;
    // subida
    const rs = G(ctx, 0, master); env(rs.gain, [[31.8, 0], [34.9, 0.11], [34.96, 0]]);
    const rf = F(ctx, 'bandpass', 300, 1.2, rs);
    rf.frequency.setValueAtTime(300, 31.8); rf.frequency.exponentialRampToValueAtTime(5000, 34.95);
    loopSrc(ctx, PN, 31.8, 35.0, rf);
    const rt = G(ctx, 0, master); env(rt.gain, [[31.8, 0], [34.9, 0.07], [34.96, 0]]);
    const rtf = F(ctx, 'lowpass', 300, 3, rt);
    rtf.frequency.setValueAtTime(300, 31.8); rtf.frequency.exponentialRampToValueAtTime(2500, 34.95);
    const ro = osc(ctx, 'sawtooth', 55, 31.8, 35.0, rtf); ro.frequency.setValueAtTime(55, 31.8); ro.frequency.exponentialRampToValueAtTime(220, 34.95);
    // golpe
    const hit = G(ctx, 1, master);
    const sh = shaper(ctx, 2.5, hit);
    thump(ctx, sh, T, 64, 22, 4.2, 0.95);
    noiseHit(ctx, hit, BN, T, 'lowpass', 1400, 0.7, 3.2, 0.85);
    noiseHit(ctx, hit, WN, T, 'highpass', 2200, 0.7, 0.07, 0.4);
    // gong cósmico
    const gong = G(ctx, 1, master); gong.connect(G(ctx, 1.4, rv));
    [97, 139.4, 197.2, 262.9, 331.6, 417.1, 523.8, 701.3].forEach((f, i) => {
      const a = G(ctx, 0, gong);
      const amp = 0.035 / (1 + i * 0.25);
      a.gain.setValueAtTime(0, T); a.gain.linearRampToValueAtTime(amp, T + 0.01);
      a.gain.exponentialRampToValueAtTime(0.00005, T + 6 + (i % 3));
      const o = osc(ctx, 'sine', f, T, T + 9.5, a); o.detune.value = (i % 2 ? 7 : -5);
    });
    // retumbo y chisporroteo de lava
    const rm = G(ctx, 0, master); env(rm.gain, [[T, 0], [T + 0.3, 0.4], [T + 3, 0.22], [41, 0]]);
    loopSrc(ctx, BN, T, 41, F(ctx, 'lowpass', 95, 0.8, rm));
    const lava = crackleBuf(ctx, 6, 45, 404);
    const lv = G(ctx, 0, master); env(lv.gain, [[T + 0.3, 0], [T + 1.2, 0.35], [40.5, 0.3], [41, 0]]);
    oneShot(ctx, lava, T + 0.2, F(ctx, 'bandpass', 2600, 0.8, lv));
  }

  /* ---- el juguete: la cajita vuelve, más rápida y más rota ---- */
  { const mb = G(ctx, 1, master); mb.connect(G(ctx, 0.6, rv));
    musicBox(ctx, mb, PHRASE_B, 41.3, { beat: 0.46, gain: 0.11, cents0: -35, wobble: 32 });
    const c = G(ctx, 1, master); c.connect(G(ctx, 0.8, rv));
    choir(ctx, c, 41, 47.2, [45, 52, 60], 0.03); }

  /* ---- Marte: viento de otro mundo y coro ---- */
  {
    const w = G(ctx, 0, master);
    env(w.gain, [[47, 0], [47.6, 0.12], [52.5, 0.12], [53, 0]]);
    const bf = F(ctx, 'bandpass', 300, 2.2, w);
    env(bf.frequency, [[47, 250], [49.5, 600], [51.5, 320], [53, 420]]);
    loopSrc(ctx, PN, 47, 53, bf);
    const c = G(ctx, 1, master); c.connect(G(ctx, 0.9, rv));
    choir(ctx, c, 47, 53.3, [38, 45, 53, 60], 0.045);
  }

  /* ---- el ojo: pitido y subida hasta el blanco ---- */
  {
    const tn = G(ctx, 0, master); env(tn.gain, [[53.2, 0], [57.2, 0.02], [57.95, 0.03], [58, 0]]);
    osc(ctx, 'sine', 5400, 53.2, 58, tn);
    const ws = G(ctx, 0, master); env(ws.gain, [[56.6, 0], [57.95, 0.2], [58.0, 0]]);
    const wf = F(ctx, 'bandpass', 500, 1.5, ws);
    wf.frequency.setValueAtTime(500, 56.6); wf.frequency.exponentialRampToValueAtTime(7000, 57.98);
    loopSrc(ctx, WN, 56.6, 58.0, wf);
  }

  /* ---- FIN: la cajita se queda sin cuerda ---- */
  { const mb = G(ctx, 1, master); mb.connect(G(ctx, 0.7, rv));
    musicBox(ctx, mb, PHRASE_A, 58.25, { beat: 0.55, gain: 0.12, slow: 1.4, drop: 260, stopAt: 61.4 });
    // ¿FIN?
    const st = G(ctx, 0, master); env(st.gain, [[60.0, 0], [60.95, 0.1], [61.0, 0]]);
    const sf = F(ctx, 'lowpass', 400, 2, st);
    osc(ctx, 'sawtooth', 36.71, 60, 61, sf); osc(ctx, 'sawtooth', 38.89, 60, 61, sf);
    thump(ctx, master, 61.0, 50, 28, 1.6, 0.5);
    const c = G(ctx, 1, master); c.connect(G(ctx, 0.8, rv));
    choir(ctx, c, 61, END + 0.5, [38, 45, 50], 0.03);
  }

  /* ---- la película se quema y se suelta de la bobina ---- */
  {
    const T = END - 1.25;
    const fl = G(ctx, 0.5, master);
    let t = T, k = 0;
    while (t < END - 0.02) {
      noiseHit(ctx, fl, WN, t, 'bandpass', 1200 + (k % 3) * 300, 0.8, 0.02, 0.25 + 0.15 * (k % 2));
      t += 1 / (24 + 30 * (t - T)); k++;
    }
    noiseHit(ctx, master, BN, T, 'lowpass', 600, 0.7, 1.1, 0.4);
  }

  const buf = await ctx.startRendering();
  // normaliza a -1 dBFS y funde el último instante
  let peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  const k = peak > 0 ? 0.89 / peak : 1;
  const fade = Math.floor(0.08 * SR);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
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
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, data[c][i]));
    out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return new Uint8Array(out.buffer);
}

return { render, toWav };
})();
