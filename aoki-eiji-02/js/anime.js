/* ==========================================================================
   蒼キ嬰児 — motor: guion, cámaras, animación del rig, capa de efectos 2D,
   HUD, subtítulos y cadena WebGL. La animación vive aquí (JS) y se pasa a
   los shaders como uniforms, así los efectos 2D saben dónde está cada cosa.
   ========================================================================== */
window.AEAnime = (function () {
const S = window.AE_SHADERS;
const FPS = 24;

/* ----------------------------------------------------------- matemáticas -- */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = x => ss(0, 1, x);
const easeOut = x => { x = clamp(x); return 1 - (1 - x) * (1 - x) * (1 - x); };
const easeIn = x => { x = clamp(x); return x * x * x; };
const easeOutBack = (x, s = 1.6) => { x = clamp(x) - 1; return 1 + (s + 1) * x * x * x + s * x * x; };
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const noise1 = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };
const m3v = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
const m3m = (a, b) => { const r = new Array(9); for (let c = 0; c < 3; c++) for (let i = 0; i < 3; i++) r[c * 3 + i] = a[i] * b[c * 3] + a[3 + i] * b[c * 3 + 1] + a[6 + i] * b[c * 3 + 2]; return r; };
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; };
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; };
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; };
const euler = (y, p, r) => m3m(rotY(y), m3m(rotX(p), rotZ(r)));
function handBasis(f, n) { const y = norm(f); const z = norm(sub(n, mul(y, dot(n, y)))); const x = cross(y, z); return [...x, ...y, ...z]; }
function ik(a, c, l1, l2, pole) {
  const d = sub(c, a), L = clamp(len(d), 0.05, l1 + l2 - 0.002), dn = norm(d);
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
  const pv = norm(sub(pole, mul(dn, dot(pole, dn))));
  return add(add(a, mul(dn, x)), mul(pv, h));
}
function kf(t, keys, e = x => x) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      const k = e((t - t0) / (t1 - t0));
      return Array.isArray(v0) ? v0.map((x, j) => x + (v1[j] - x) * k) : v0 + (v1 - v0) * k;
    }
  }
  return keys[keys.length - 1][1];
}
const shake = (t, amp, seed = 0) => [noise1(t * 26 + seed) * amp, noise1(t * 29 + 7 + seed) * amp];

/* ------------------------------------------------------------- cámara -- */
function camBasis(cam) {
  const f = norm(sub(cam.tar, cam.pos)), up = [Math.sin(cam.roll || 0), Math.cos(cam.roll || 0), 0];
  const r = norm(cross(f, up)), u = cross(r, f);
  return { f, r, u };
}
// proyecta a coordenadas "p" (centradas, en alturas de pantalla, y hacia arriba) y a uv [0,1]
function project(cam, p, asp) {
  const b = cam.b || (cam.b = camBasis(cam));
  const d = sub(p, cam.pos), z = dot(d, b.f);
  if (z < 0.01) return null;
  const x = dot(d, b.r) / z * cam.fl, y = dot(d, b.u) / z * cam.fl;
  return { x, y, z, uv: [x / asp + 0.5, y + 0.5] };
}
const projectDir = (cam, dir, asp) => project(cam, add(cam.pos, mul(dir, 1e4)), asp);

/* ------------------------------------------------------------ el rig -- */
const HANDS = 1.2, HP = [0, -0.62, -0.1], EYE = [0.3, -0.05, 0.665];
const SH = { R: [-0.98, -1.45, -0.12], L: [0.98, -1.45, -0.12] };
const TIP = [0.14 * HANDS, 0.8 * HANDS, 0.04 * HANDS];
function arm(side, tip, fingers, palm, point, pole) {
  const sh = side > 0 ? SH.R : SH.L;
  const hand = handBasis(fingers, palm);
  const wr = sub(tip, m3v(hand, [TIP[0] * side, TIP[1], TIP[2]]));
  const el = ik(sh, wr, 1.1, 0.95, pole);
  return { sh, el, wr, hand, point, tip };
}
const armDownR = () => arm(1, [-1.2, -4.3, 0.75], [-0.05, -1, 0.3], [1, 0, 0.2], 0.2, [-0.4, 0, -1]);
const armDownL = () => arm(-1, [1.2, -4.3, 0.75], [0.05, -1, 0.3], [-1, 0, 0.2], 0.15, [0.4, 0, -1]);
function baseRig(o) {
  const r = Object.assign({
    bPos: [0, 0, 0], bYaw: 0, bScale: 1, head: [0, 0, 0], face: [0.075, -0.12, 0, 0.13], gaze: [0, 0, 100], eyeGlow: 1,
    armR: null, armL: null, tipGlow: 0,
  }, o);
  r.armR = r.armR || armDownR();
  r.armL = r.armL || armDownL();
  return r;
}
const toWorld = (r, p) => add(r.bPos, m3v(rotY(r.bYaw), mul(p, r.bScale)));
const bez = (m, s) => { const u = 1 - s; return add(add(mul(m.L, u * u * u), mul(m.C1, 3 * u * u * s)), add(mul(m.C2, 3 * u * s * s), mul(m.T, s * s * s))); };
function eyesWorld(r) {
  const H = euler(r.head[0], r.head[1], r.head[2]);
  const f = e => toWorld(r, add(m3v(H, sub(e, HP)), HP));
  return [f([EYE[0], EYE[1], EYE[2] + 0.2]), f([-EYE[0], EYE[1], EYE[2] + 0.2])];
}
const HORDE = [[-17, -58, 3.4, 0.35], [21, -92, 3.6, -0.3], [-62, -150, 3.9, 0.6], [70, -185, 4.2, -0.5], [4, -260, 4.6, 0.05]];

/* ------------------------------------------------------------- luces -- */
const LIGHT0 = {
  keyDir: [0, 1, 0], keyCol: [0.5, 0.5, 0.6], shadowCol: [0.03, 0.04, 0.09], rimDir: [0, 0, -1], rimCol: [1, 0.3, 0.2], rimW: 0.55,
  termCol: [0.25, 0.03, 0.12], fogCol: [0.05, 0.007, 0.012], zenith: [0.002, 0.002, 0.005], fogK: 0.004, haze: null,
  moonDir: [0, 0.3, -1], moonR: 0.09, moonCol: [1, 0.2, 0.1], flashL: 0,
  fillDir: [-0.4, 0.6, 0.7], fillCol: [0.05, 0.07, 0.16], eyeLight: 0.45, cityBox: [0, -25, 45, 50],
};
function lightning(t, times) {
  const pat = [1, 0.15, 0.85, 0.35, 0.1, 0];
  for (const t0 of times) { const f = Math.floor((t - t0) * FPS); if (f >= 0 && f < pat.length) return pat[f]; }
  return 0;
}

/* ------------------------------------------------------------ el mecha -- */
const MS = 2.4, MFOOT = 5.74, I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const M_SH = { R: [-1.22, -1.3, -0.08], L: [1.22, -1.3, -0.08] };
const M_HIP = { R: [-0.42, -3.15, 0], L: [0.42, -3.15, 0] };
const M_TIP = [0.14 * 1.35, 0.8 * 1.35, 0.04 * 1.35];
function mArm(side, tip, fingers, palm, pole) {
  const sh = side > 0 ? M_SH.R : M_SH.L, hand = handBasis(fingers, palm);
  const wr = sub(tip, m3v(hand, [M_TIP[0] * side, M_TIP[1], M_TIP[2]]));
  return { sh, el: ik(sh, wr, 1.2, 1.15, pole), wr, hand, tip };
}
function mLeg(side, ankle, pole = [0, 0.3, 1]) { const hip = side > 0 ? M_HIP.R : M_HIP.L; return [hip, ik(hip, ankle, 1.25, 1.2, pole), ankle]; }
function mecha(o) {
  const r = Object.assign({ pos: [0, MFOOT * MS, 0], yaw: 0, pitch: 0, roll: 0, scale: MS, head: [0, 0, 0], jaw: 0, visor: 1, thrust: 0, cut: 0 }, o);
  r.rot = euler(r.yaw, r.pitch, r.roll);
  r.armR = r.armR || mArm(1, [-1.35, -4.3, 0.45], [0, -1, 0.15], [1, 0, 0.1], [-0.3, 0, -1]);
  r.armL = r.armL || mArm(-1, [1.35, -4.3, 0.45], [0, -1, 0.15], [-1, 0, 0.1], [0.3, 0, -1]);
  r.legR = r.legR || mLeg(1, [-0.46, -5.45, 0.05]);
  r.legL = r.legL || mLeg(-1, [0.46, -5.45, 0.05]);
  return r;
}
const mW = (m, p) => add(m.pos, m3v(m.rot, mul(p, m.scale)));
const mDir = (m, d) => norm(m3v(m.rot, d));
const mEyes = m => [mW(m, [0.3, -0.04, 0.95]), mW(m, [-0.3, -0.04, 0.95])];
const eyeFlares = (m, cam, asp, size, k) => mEyes(m).map(e => project(cam, e, asp)).filter(Boolean).map(p => [p.x, p.y, size, k]);
function thrusters(m, len) {
  if (len <= 0) return [];
  return [[0.5, -2.8, -1.25], [-0.5, -2.8, -1.25]].map(n => {
    const p = mW(m, n), d = mDir(m, [0.04 * Math.sign(n[0]), -0.5, -0.86]);
    return [p, add(p, mul(d, Math.min(len, 2.2) * 0.8 * m.scale * (0.8 + 0.4 * hash(performanceFrame + n[0])))), 0.11 * m.scale, 10 + Math.min(2.2, 0.8 + len * 0.3)];
  });
}
let performanceFrame = 0;
// poses
const P_STAND = () => ({});
const P_SUPER = () => ({ armR: mArm(1, [-0.55, 2.2, 0.35], [0, 1, 0.1], [0.3, 0, 1], [-1, 0, -0.4]), armL: mArm(-1, [1.3, -4.1, -0.4], [0.1, -1, -0.3], [-1, 0, 0], [0.4, 0, -1]),
  legR: mLeg(1, [-0.3, -5.5, -0.35]), legL: mLeg(-1, [0.35, -5.2, -0.8]) });
const P_FALL = () => ({ armR: mArm(1, [-2.1, -0.4, -0.2], [-1, 0.4, 0], [0, 0, 1], [0, -1, -0.3]), armL: mArm(-1, [2.1, -0.4, -0.2], [1, 0.4, 0], [0, 0, 1], [0, -1, -0.3]),
  legR: mLeg(1, [-0.55, -5.3, 0.3]), legL: mLeg(-1, [0.55, -5.1, -0.4]) });
const P_CROUCH = () => ({ armR: mArm(1, [-0.9, -4.05, 1.55], [0, -1, 0.3], [0.3, 0, 1], [-1, 0.2, -0.3]), armL: mArm(-1, [2.0, -2.2, -1.2], [0.6, -0.4, -0.6], [0, 0, -1], [1, 0, 0]),
  legR: mLeg(1, [-0.75, -4.25, 1.05], [0, 0.4, 1]), legL: mLeg(-1, [0.7, -4.25, -0.95], [0, -0.3, 1]) });
const P_DASH = k => ({ armR: mArm(1, [-1.5, -3.6, -1.3], [-0.2, -0.6, -0.7], [1, 0, 0], [-0.3, 0.5, -1]), armL: mArm(-1, [1.5, -3.6, -1.3], [0.2, -0.6, -0.7], [-1, 0, 0], [0.3, 0.5, -1]),
  legR: mLeg(1, [-0.5, -5.2, -0.9 - 0.1 * Math.sin(k * 7)], [0, 0.2, 1]), legL: mLeg(-1, [0.5, -5.0, -1.2 + 0.1 * Math.sin(k * 7)], [0, 0.2, 1]) });
const P_PUNCH = k => ({   // k: 0 = puño atrás, 1 = puñetazo estirado
  armR: mArm(1, lerp3([-1.6, -1.8, -1.6], [-0.45, -0.9, 2.55], k), norm(lerp3([0.2, 0.3, -1], [0.05, 0.1, 1], k)), [1, 0, 0], [-1, -0.4, 0]),
  armL: mArm(-1, lerp3([0.9, -1.2, 1.4], [1.7, -2.9, -1.2], k), [0.1, 0.2, 1], [-1, 0, 0], [1, -0.4, 0]),
  legR: mLeg(1, [-0.55, -5.0, -1.0]), legL: mLeg(-1, [0.5, -5.2, 0.6]) });
const P_SPREAD = () => ({ armR: mArm(1, [-2.6, -2.2, 0.3], [-1, -0.3, 0.1], [0, -1, 0.3], [0, -0.3, -1]), armL: mArm(-1, [2.6, -2.2, 0.3], [1, -0.3, 0.1], [0, -1, 0.3], [0, -0.3, -1]),
  legR: mLeg(1, [-0.6, -5.4, -0.2]), legL: mLeg(-1, [0.6, -5.4, -0.2]) });
const P_BRACE = () => ({ armR: mArm(1, [-1.9, -3.6, 0.6], [-0.3, -1, 0.2], [1, 0, 0], [-1, 0, -0.5]),
  legR: mLeg(1, [-1.0, -5.4, 0.9]), legL: mLeg(-1, [0.95, -5.4, -0.9]) });
const P_KNEEL = () => ({ armR: mArm(1, [-1.2, -4.2, 1.0], [0, -1, 0.2], [1, 0, 0], [-1, 0, -0.5]),
  legR: mLeg(1, [-0.6, -4.3, 1.2], [0, 0.6, 1]), legL: mLeg(-1, [0.6, -5.35, -0.3], [0, -0.8, 1]) });

/* --------------------------------------------------------------- explosiones -- */
function explosions(list, t, cam, asp, life = 1.4) {
  const out = [];
  for (const [P, t0, size] of list) {
    const age = (t - t0) / life;
    if (age < 0 || age > 1) continue;
    const pr = project(cam, P, asp);
    if (pr) out.push([pr.x, pr.y, size / pr.z * cam.fl, age]);
  }
  return out;
}
const lightsFrom = (list, t) => {
  const act = list.filter(e => t > e[1]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const v = [];
  for (let i = 0; i < 4; i++) { const e = act[i]; v.push(...(e ? [...e[0], 3.5 * Math.exp(-(t - e[1]) * 2.2)] : [0, 0, 0, 0])); }
  return v;
};
const beamU = beams => {
  const A = [], B = [];
  beams.slice(0, 10).forEach(([a, b, w, k]) => { A.push(...a, w); B.push(...b, k); });
  while (A.length < 40) { A.push(0); B.push(0); }
  return { uBeamA: { t: 'v4a', v: A }, uBeamB: { t: 'v4a', v: B }, uBeamN: { t: 'i', v: Math.min(beams.length, 10) } };
};
function splats(list, t, cam, asp) {
  const out = [];
  for (const [P, t0, size, kind] of list) {
    const age = (t - t0) / 1.3;
    if (age < 0 || age > 1) continue;
    const pr = project(cam, P, asp);
    if (pr) out.push([pr.x, pr.y, (kind === 'mecha' ? -1 : 1) * size / pr.z * cam.fl, age]);
  }
  return out;
}

/* ---------------------------------------------------------------- escena -- */
const G_S = 8;
const GIANT = { bPos: [0, 5.62 * G_S, -64], bScale: G_S };
const GW = p => toWorld(baseRig(GIANT), p);
const G_CHEEK = GW([-0.34, -0.28, 0.62]), G_CHEST = GW([0, -2.0, 0.6]), G_FACE = GW([0, -0.15, 0.75]);
const MOON2 = norm([0.35, 0.42, -1]);
const NIGHT = {
  keyDir: norm([0.75, 0.45, 0.5]), keyCol: [1.0, 0.42, 0.28], shadowCol: [0.05, 0.065, 0.15], rimDir: MOON2, rimCol: [1, 0.4, 0.25], rimW: 0.36,
  fogCol: [0.3, 0.05, 0.035], haze: [0.09, 0.014, 0.02], zenith: [0.012, 0.004, 0.012], fogK: 0.005, moonDir: MOON2, moonR: 0.095,
  fillDir: norm([-0.35, 0.45, 1]), fillCol: [0.24, 0.3, 0.6], termCol: [0.3, 0.04, 0.1],
};
const giantAt = (t, cam, extra = {}) => baseRig(Object.assign({}, GIANT, { head: [0, 0.1, 0], face: [0.075, -0.12, 0.35, 0.1], eyeGlow: 1.4, gaze: cam.pos }, extra));
const giantEyes = r => eyesWorld(r);

// Misiles del mecha (salen de las hombreras en la carrera)
const RUSH_M = t => mecha({ pos: [2.5, 17.5 + 3 * ss(0, 4, t) + 0.4 * Math.sin(t * 3), lerp(30, -16, t / 4)], yaw: Math.PI, pitch: 0.55, thrust: 2.5, ...P_DASH(t) });
const PODS = Array.from({ length: 12 }, (_, i) => {
  const t0 = 1.5 + i * 0.06, m = RUSH_M(t0);
  const L = mW(m, [(i % 2 ? 1.25 : -1.25), -0.95, -0.2]);
  const T = toWorld(baseRig(GIANT), [((i * 37) % 7 - 3) * 0.18, -1.3 - (i % 4) * 0.4, 0.8]);
  const C1 = add(L, [(i % 2 ? 1 : -1) * (5 + hash(i) * 6), 6 + hash(i + 3) * 6, -2]);
  const C2 = add(T, [(hash(i + 7) - 0.5) * 16, 4 + hash(i + 9) * 6, 12]);
  const dur = 1.0 + hash(i * 2.3) * 0.4;
  return { L, C1, C2, T, t0, dur, hit: t0 + dur };
});

// La escuadra que cae del cielo
const SQUAD = Array.from({ length: 8 }, (_, i) => ({ x: (i - 3.5) * 9 + (hash(i) - 0.5) * 4, z: -24 + (hash(i + 5) - 0.5) * 18, y0: 70 + hash(i + 9) * 25, t0: hash(i + 2) * 1.2, yaw: Math.PI + (hash(i + 4) - 0.5) * 0.6 }));
const SQ_S = 1.7;
const squadPos = (q, t) => [q.x, Math.max(q.y0 - (t - q.t0) * 18, 22 + (q.x > 0 ? 4 : 0) + hash(q.x) * 8), q.z];

/* ----------------------------------------------------------------- guion -- */
const SHOTS = [
  /* 0 · la cara del gigante entre el humo */
  {
    name: 'open', dur: 2.0, prog: 'OPEN', twos: false,
    cam: t => ({ pos: lerp3([0.5, -0.1, 3.9], [0.32, -0.12, 3.1], ease(t / 2)), tar: [0, -0.3, 0], fl: 1.8, roll: -0.04 }),
    rig: (t, cam) => baseRig({ head: [0.1 - 0.1 * t, -0.04, 0.05], face: [kf(t, [[0, 0.06], [1.5, 0.03]]), -0.1, kf(t, [[0, 0.3], [1.6, 1]], ease), 0.07], eyeGlow: kf(t, [[0, 1.2], [1.6, 1.6], [1.85, 4]]), gaze: cam.pos }),
    light: t => ({ keyDir: norm([0.6, -0.3, 0.75]), keyCol: [1.0, 0.36, 0.12], shadowCol: [0.014, 0.018, 0.045], rimDir: norm([0.3, 0.5, -1]), rimCol: [1, 0.42, 0.16], rimW: 0.5,
      fogCol: [0.08, 0.02, 0.01], zenith: [0.01, 0.003, 0.003], fillCol: [0.04, 0.06, 0.14], eyeLight: 0.4, moonDir: norm([0.4, 0.5, -1]), moonR: 0.001 }),
    comp: (t, cam, rig, asp) => ({ embers: 0.3, ash: 0, flares: eyesWorld(rig).map(e => project(cam, e, asp)).filter(Boolean).map(p => [p.x, p.y, 0.6, kf(t, [[0, 0.6], [1.7, 1], [1.9, 3.5]])]) }),
    post: t => ({ flash: kf(t, [[1.8, 0], [1.95, 0.8]]), flashCol: [1, 0.3, 0.2], grade: [1.05, 1.1, 1.12, 0.03] }),
  },
  /* 1 · el silo */
  {
    name: 'shaft', dur: 3.0, prog: 'SHAFT', twos: false,
    cam: (t, m) => {
      if (t < 1.5) return { pos: [3.4, 124, 1.3], tar: add(m.pos, [0, -1.5, 0]), fl: 1.05, roll: 0.3 };
      const Y = 10 + 70 * t, a = 0.9 + t * 0.25; return { pos: [5.3 * Math.cos(a), Y - 0.2, 5.3 * Math.sin(a)], tar: [0, Y - 0.2, 0], fl: 1.5, roll: 0.05 * Math.sin(t * 2) };
    },
    rig: t => baseRig({}),
    mech: t => t < 1.5
      ? mecha({ pos: [0, 10 + 70 * t, 0], yaw: 0.6 + t * 0.5, pitch: 0.1, scale: 1.6, head: [0, 0.35, 0], visor: 1.2, thrust: 2.5, ...P_SUPER() })
      : mecha({ pos: [0, 10 + 70 * t, 0], yaw: Math.PI / 2 - (0.9 + t * 0.25) - 0.45 + 0.35 * ss(1.8, 2.4, t), scale: 1.6, head: [0.4 * ss(1.9, 2.3, t) - 0.2, -0.15 * ss(2.4, 3, t), 0], visor: t < 1.6 ? 0 : kf(t, [[1.6, 2.5], [2.0, 1]]), thrust: 2.5 }),
    light: t => ({ keyDir: [0, 1, 0], keyCol: [0.65, 0.55, 0.5], shadowCol: [0.04, 0.045, 0.07], rimDir: [0, 1, 0], rimCol: [1, 0.6, 0.3], rimW: 0.45,
      fillDir: [0.3, -1, 0.3], fillCol: [0.6, 0.28, 0.08], fogCol: [0, 0, 0], zenith: [0, 0, 0], fogK: 0.002, moonR: 0.001 }),
    comp: (t, cam, rig, asp, m) => ({ flares: t < 1.5 ? [] : [[0, 0.35, 1.2, -kf(t, [[2.4, 0], [3, 3]])]].concat(t > 1.6 ? eyeFlares(m, cam, asp, 0.55, -kf(t, [[1.6, 3], [2.1, 0.6]])) : []) }),
    beams: (t, m) => thrusters(m, 3.5),
    post: t => ({ motion: [0, t < 1.5 ? 0 : 0.035], motionNear: 10, speed: t < 1.5 ? 0.7 : 0, speedPos: [0.5, 0.5], speedDark: 1, impact: Math.floor((t - 1.6) * FPS) === 0 ? 2 : 0, flash: kf(t, [[2.55, 0], [3, 1]]), flashCol: [0.8, 1, 0.95], shake: shake(t, t < 1.5 ? 0.008 : 0.004) }),
  },
  /* 2 · revienta el asfalto */
  {
    name: 'burst', dur: 2.0, prog: 'BURST', twos: false,
    cam: (t, m) => ({ pos: lerp3([15, 3, 30], [17, 2.5, 34], t / 2), tar: [0, clamp(m.pos[1] - 5, 3, 17), -1], fl: 1.15, roll: 0.06 }),
    rig: t => baseRig({}),
    mech: t => mecha({ pos: [0, lerp(-9, 52, easeOut(t / 1.9)), -1], yaw: 0.35, pitch: -0.12, roll: 0.1 * Math.sin(t * 3), visor: 1.2, thrust: 3, ...P_SUPER() }),
    light: () => NIGHT,
    scene: t => ({ uFx: [0, 18 * easeOut(t / 1.4), kf(t, [[0, 0], [0.05, 1.4], [2, 0.3]]), 0], uDome: [0, 0, 0, 0], uCrack: [0, 0, 7 * easeOut(t / 0.4), 1], uXL: { t: 'v4a', v: [0, 3, 0, 5 * Math.exp(-t * 1.2), 3, 1, 2, 3 * Math.exp(-t * 2), -3, 1, -1, 3 * Math.exp(-t * 2), 0, 0, 0, 0] } }),
    comp: (t, cam, rig, asp, m) => {
      const c = project(cam, [0, 0.5, 0], asp);
      return { exp: explosions([[[0, 1.5, 0], 0.02, 9], [[3, 0.8, 2], 0.12, 5], [[-3, 0.8, -1], 0.18, 5]], t, cam, asp, 1.6), debris: c ? [c.x, c.y, t * 1.4, 1 - ss(1, 2, t)] : [0, 0, 0, 0] };
    },
    beams: (t, m) => thrusters(m, 4.5),
    scenePost: 1,
    post: (t, cam, asp) => ({ motion: [0, t > 0.2 && t < 1.2 ? 0.05 : 0], shake: shake(t, 0.03 * Math.exp(-t * 2.5)), impact: [2, 1, 0][Math.floor(t * FPS)] || 0, speed: t < 0.8 ? 1 - ss(0.4, 0.8, t) : 0, speedPos: [0.5, 0.35] }),
  },
  /* 3 · aterrizaje de superhéroe */
  {
    name: 'land', dur: 2.0, prog: 'LAND', twos: false,
    cam: (t, m) => ({ pos: kf(t, [[0, [17, 3.5, 29]], [1.0, [13, 2.2, 23]], [2, [9, 2, 17]]], ease), tar: t < 1.0 ? [0, clamp(m.pos[1] - 7, 5, 19), 0] : lerp3([0, 7, 0], [0, 6.5, 0], ss(1.0, 1.4, t)), fl: 1.3, roll: -0.05 }),
    rig: t => baseRig({}),
    mech: t => {
      if (t < 1.0) { const k = easeIn(t / 1.0); return mecha({ pos: [0, lerp(48, (MFOOT - 1.6) * MS, k), 0], yaw: 0.5, pitch: 0.1, visor: 0.4, thrust: 1.2, ...P_FALL() }); }
      const k = ss(1.0, 1.12, t);
      return mecha({ pos: [0, (MFOOT - 1.6) * MS - 0.4 * (1 - ss(1.08, 1.4, t)), 0], yaw: 0.5, pitch: 0.32, head: [0.1, -0.25 + 0.2 * ss(1.4, 1.8, t), 0], visor: t < 1.3 ? 0.4 : kf(t, [[1.3, 3], [1.7, 1.2]]), thrust: 0, ...P_CROUCH() });
    },
    light: () => NIGHT,
    scene: t => { const a = t - 1.0; return a < 0 ? { uFx: [0, 0, 0, 0] } : { uFx: [0, 16 * easeOut(a / 1.2), kf(a, [[0, 0], [0.05, 1.6], [1, 0.3]]), 0], uCrack: [0, 1.2, 9 * easeOut(a / 0.3), 1], uDestroy: [0, 0, 5 * easeOut(a / 0.4), 1] }; },
    comp: (t, cam, rig, asp, m) => {
      const c = project(cam, [0, 0.3, 1.5], asp), a = t - 1.0;
      const out = { exp: explosions([[[0, 0.8, 2], 1.0, 7], [[4, 0.5, 3], 1.06, 4], [[-4, 0.5, 2], 1.1, 4]], t, cam, asp, 1.2) };
      if (a > 0 && c) { out.debris = [c.x, c.y, a * 1.3, 1 - ss(0.6, 1, a)]; out.rings = [[c.x, c.y, a * 1.6, 1 - ss(0, 0.7, a)], [c.x, c.y, a * 1.1, 1 - ss(0, 0.9, a)]]; }
      if (t > 1.3) out.flares = eyeFlares(m, cam, asp, 0.45, -kf(t, [[1.3, 3], [1.8, 0.8]]));
      return out;
    },
    beams: (t, m) => thrusters(m, t < 1 ? 2.5 : 0),
    post: t => { const f = Math.floor((t - 1.0) * FPS); return { impact: f >= 0 && f < 4 ? [1, 2, 3, 1][f] : 0, shake: t > 1 ? shake(t, 0.03 * Math.exp(-(t - 1) * 3)) : [0, 0], speed: t > 1.02 && t < 1.6 ? 1 - ss(1.3, 1.6, t) : 0, speedPos: [0.5, 0.45], motion: [0, t < 0.95 ? 0.03 : 0] }; },
  },
  /* 4 · carga con propulsores y lluvia de misiles */
  {
    name: 'rush', dur: 4.0, prog: 'RUSH', twos: false,
    cam: (t, m) => {
      const back = add(m.pos, [15, -2, 24]);
      const front = add(m.pos, [6, -3, -20]);
      const k = ss(2.9, 3.15, t);
      const tb = lerp3(add(m.pos, [0, -3, 0]), GW([0, -1.5, 0]), 0.5);
      return { pos: lerp3(back, front, k), tar: lerp3(tb, add(m.pos, [0, -2, 0]), k), fl: lerp(1.2, 1.05, k), roll: lerp(-0.08, 0.12, k) };
    },
    rig: (t, cam) => giantAt(t, cam),
    mech: t => RUSH_M(t),
    light: () => NIGHT,
    scene: t => ({ uXL: { t: 'v4a', v: lightsFrom(PODS.map(p => [p.T, p.hit]), t) } }),
    comp: (t, cam, rig, asp) => ({ exp: explosions(PODS.map(p => [p.T, p.hit, 3.5]), t, cam, asp), flares: eyesWorld(rig).map(e => project(cam, e, asp)).filter(Boolean).map(p => [p.x, p.y, 0.4, 1.2]) }),
    beams: (t, m) => thrusters(m, 5),
    fx: (ctx, t, cam, rig, E) => E.trails(ctx, t, cam, PODS),
    post: t => ({ motion: [t < 2.9 ? 0.03 : 0.05, 0], motionNear: 34, speed: t > 3.1 ? 0.8 : 0.3, speedDark: 0, speedPos: [0.5, 0.5], shake: shake(t, 0.004), zoom: t > 2.9 ? 1 + 0.08 * Math.exp(-(t - 3) * 4) : 1 }),
  },
  /* 5 · ¡PUÑETAZO! */
  {
    name: 'punch', dur: 3.0, prog: 'PUNCH', twos: false,
    timeWarp: t => t < 1.0 ? t : t < 2.0 ? 1.0 + (t - 1.0) * 0.18 : 1.18 + (t - 2.0) * 1.2,
    cam: (t, m, rig) => {
      const P = add(G_CHEEK, [0, -2, 0]);
      const a = lerp(0.75, 1.75, ease(t / 2.4));
      const d = t < 0.9 ? lerp(46, 34, t / 0.9) : 32;
      return { pos: add(P, [Math.sin(a) * d, lerp(-4, -9, ease(t / 2.4)), Math.cos(a) * d]), tar: t < 0.9 ? lerp3(m.pos, P, ease(t / 0.9)) : P, fl: 1.3, roll: 0.08 * Math.sin(t) };
    },
    rig: (t, cam) => {
      const hit = t > 1.0 ? ss(1.0, 1.06, t) : 0;
      return giantAt(t, cam, { head: [-0.55 * hit, 0.1 - 0.15 * hit, -0.35 * hit], face: [0.075 + 0.04 * hit, -0.13, 0.35 - 0.3 * hit, 0.08] });
    },
    mech: t => {
      const k = t < 0.75 ? 0 : ss(0.75, 1.0, t);
      const tipL = lerp3([-1.6, -1.8, -1.6], [-0.45, -0.9, 2.55], k);
      const R = euler(Math.PI - 0.15, -0.1, 0.1);
      const at = sub(add(G_CHEEK, [0.6, -0.4, 1.2]), m3v(R, mul(tipL, MS)));
      const pos = t < 1.0 ? lerp3(add(at, [14, -14, 26]), at, easeOut(t / 1.0)) : add(at, [0.8 * ss(1.0, 2.2, t), 0, 1.5 * ss(1.0, 2.6, t)]);
      return mecha({ pos, yaw: Math.PI - 0.15, pitch: -0.1, roll: 0.1, visor: 1.3, thrust: t < 1 ? 2 : 0.6, ...P_PUNCH(k) });
    },
    light: () => NIGHT,
    comp: (t, cam, rig, asp) => {
      const c = project(cam, G_CHEEK, asp), a = t - 1.0;
      const out = { flares: eyesWorld(rig).map(e => project(cam, e, asp)).filter(Boolean).map(p => [p.x, p.y, 0.5, 1.3]) };
      if (a > 0 && c) {
        const s = a < 1 ? a * 0.35 : 0.35 + (a - 1) * 1.6;
        out.rings = [[c.x, c.y, s * 1.2, 1 - ss(0, 1.2, a)], [c.x, c.y, s * 0.7, 1 - ss(0, 1.4, a)]];
        out.splats = splats([[add(G_CHEEK, [-0.8, -0.4, 0.8]), 1.0, 8], [add(G_CHEEK, [-1.4, -1.2, 0.6]), 1.02, 6], [add(G_CHEEK, [-0.4, 0.6, 0.5]), 1.04, 4.5]], lerp(1.0, t, a < 1 ? 0.4 : 1), cam, asp);
        out.debris = [c.x, c.y, s, 1 - ss(0.8, 2, a)];
      }
      return out;
    },
    beams: (t, m) => thrusters(m, t < 1 ? 4 : 1),
    post: t => { const f = Math.floor((t - 1.0) * FPS); return { impact: f >= 0 && f < 5 ? [1, 3, 2, 1, 3][f] : 0, shake: t > 1 ? shake(t, 0.025 * Math.exp(-(t - 1) * 1.5)) : [0, 0], speed: t > 1 && t < 2.1 ? 1 : 0, speedPos: [0.5, 0.5], motion: [t < 0.9 ? 0.025 : 0, 0], motionNear: 30, zoom: t > 1 ? 1 + 0.12 * Math.exp(-(t - 1) * 3) : 1 }; },
  },
  /* 6 · los láseres de los ojos: le cortan el brazo */
  {
    name: 'laser', dur: 4.0, prog: 'LASER', twos: false,
    cam: t => ({ pos: lerp3([34, 3, -14], [30, 4, -10], ease(t / 4)), tar: lerp3([4, 30, -52], [8, 29, -48], ease(t / 4)), fl: 1.2, roll: -0.04 + 0.05 * ss(1.3, 1.5, t) }),
    rig: (t, cam) => giantAt(t, cam, { head: [0.55 * ease(t / 0.6), 0.05, 0.05], face: [kf(t, [[0, 0.075], [0.5, 0.11]]), -0.14, 0.2, 0.05], eyeGlow: kf(t, [[0, 1.4], [0.55, 2.4], [3.8, 1.8]]), gaze: [3, 22, -26] }),
    mech: t => {
      const cutAt = 1.4;
      const hit = ss(cutAt, cutAt + 0.3, t);
      return mecha({ pos: lerp3([1, 21, -28], [5, 23, -24], ease(t / 4)), yaw: -2.3 + 0.6 * hit, pitch: -0.2 - 0.4 * hit + 0.3 * ss(2.4, 3.5, t), roll: 0.5 * hit - 0.4 * ss(2.4, 3.6, t), head: [0, -0.2, 0], visor: 1.2, thrust: 1.5 + hit, cut: t > cutAt ? 1 : 0, ...P_SPREAD() });
    },
    light: () => NIGHT,
    scene: (t, cam, rig, m) => {
      const cutAt = 1.4;
      const off = t > cutAt ? add(mW(m, [1.9, -2.3, 0.4]), [2 * (t - cutAt), 6 * (t - cutAt) - 7 * (t - cutAt) * (t - cutAt), 3 * (t - cutAt)]) : [0, -1e3, 0];
      return { uArmOff: [...off, (t - cutAt) * 7], uXL: { t: 'v4a', v: lightsFrom(LASER_EXP, t) } };
    },
    comp: (t, cam, rig, asp, m) => {
      const out = { exp: explosions(LASER_EXP, t, cam, asp, 1.3), flares: eyesWorld(rig).map(e => project(cam, e, asp)).filter(Boolean).map(p => [p.x, p.y, 0.45, kf(t, [[0, 1], [0.55, 2], [3.8, 1.4]])]) };
      out.splats = splats([[mW(m, [1.5, -2.2, 0.3]), 1.42, 4, 'mecha'], [mW(m, [1.5, -2.2, 0.3]), 1.75, 3, 'mecha'], [mW(m, [1.5, -2.2, 0.3]), 2.2, 2.5, 'mecha']], t, cam, asp);
      return out;
    },
    beams: (t, m, rig) => {
      const out = thrusters(m, 2.5);
      if (t > 0.55 && t < 3.6) {
        const eyes = eyesWorld(rig);
        const tg = laserTarget(t, m);
        for (const e of eyes) out.push([e, tg, 0.45, -2.2]);
      }
      return out;
    },
    post: t => { const f = Math.floor((t - 1.4) * FPS); return { impact: f >= 0 && f < 3 ? [3, 1, 3][f] : 0, shake: shake(t, 0.006 + 0.02 * Math.exp(-Math.max(0, t - 1.4) * 2) * (t > 1.4 ? 1 : 0)), motion: [0, 0] }; },
  },
  /* 7 · la escuadra cae del cielo */
  {
    name: 'squad', dur: 5.0, prog: 'SQUAD', twos: false,
    cam: t => ({ pos: lerp3([0, 2.2, 34], [3, 3, 27], ease(t / 5)), tar: lerp3([0, 26, -30], [0, 22, -30], ease(t / 5)), fl: 1.15, roll: 0.03 }),
    rig: (t, cam) => giantAt(t, cam, { head: [0.3 * Math.sin(t * 0.8), 0.25, 0.05], eyeGlow: 2.2 }),
    light: () => NIGHT,
    scene: t => {
      const S = [];
      SQUAD.forEach((q, i) => { if (i === 5 && t > 3.2) return; S.push(...squadPos(q, t), q.yaw); });
      while (S.length < 32) S.push(0, -1e4, 0, 0);
      return { uSquad: { t: 'v4a', v: S }, uSquadN: { t: 'i', v: t > 3.2 ? 7 : 8 }, uSquadScale: SQ_S, uXL: { t: 'v4a', v: lightsFrom(SQUAD_EXP, t) },
        ...mechaU(mecha({ scale: SQ_S, visor: 1.4, ...P_SPREAD() })) };
    },
    comp: (t, cam, rig, asp) => ({ exp: explosions(SQUAD_EXP, t, cam, asp, 1.3), splats: splats(SQUAD_GORE, t, cam, asp), flares: eyesWorld(rig).map(e => project(cam, e, asp)).filter(Boolean).map(p => [p.x, p.y, 0.5, 2]) }),
    beams: (t, m, rig) => {
      const out = [];
      SQUAD.forEach((q, i) => {
        if (i === 5 && t > 3.2) return;
        const P = squadPos(q, t);
        if (t > 1.6 + i * 0.25 && ((t * 3 + i) % 1) < 0.55) out.push([add(P, [0, -1.5 * SQ_S, 0.5]), toWorld(rig, [(hash(i) - 0.5) * 1.5, -1 - hash(i + 1) * 2, 0.8]), 0.28, 2.2]);
      });
      if (t > 2.9 && t < 3.25) { const e = eyesWorld(rig); out.push([e[0], squadPos(SQUAD[5], t), 0.4, -2.5], [e[1], squadPos(SQUAD[5], t), 0.4, -2.5]); }
      return out.slice(0, 10);
    },
    post: t => ({ shake: shake(t, 0.004 + 0.015 * (t > 3.2 && t < 3.8 ? 1 : 0)), flash: t > 3.2 && t < 3.3 ? 0.5 : 0 }),
  },
  /* 8 · el cañón de la boca */
  {
    name: 'cannon', dur: 5.0, prog: 'CANNON', twos: false,
    cam: (t, m) => {
      if (t < 1.0) { const h = mW(m, [0, -0.3, 0]), f = mDir(m, [0, 0, 1]), r = mDir(m, [1, 0, 0]); return { pos: add(add(h, mul(f, lerp(9, 7.5, t))), add(mul(r, 1.6), [0, -1.2, 0])), tar: add(h, [0, -0.4, 0]), fl: 1.6, roll: 0.05 }; }
      if (t < 2.0) { const h = mW(m, [0, -1, 0]); return { pos: add(h, [7, -5, 17]), tar: lerp3(h, G_CHEST, 0.75), fl: 1.2, roll: -0.05 }; }
      return { pos: lerp3([42, 14, -26], [46, 16, -22], ease((t - 2) / 3)), tar: add(G_CHEST, [5, -5, 16]), fl: 1.05, roll: 0.02 };
    },
    rig: (t, cam) => {
      const a = t - 2.0;
      return giantAt(t, cam, { head: [0.2, -0.25 * ss(0, 0.5, a) + 0.1, 0.2 * ss(0, 1, a)], face: [0.1, -0.14, a > 0 ? 0 : 0.4, 0.05], eyeGlow: a > 0 ? 3 : 1.8 });
    },
    mech: t => mecha({ pos: [12, MFOOT * MS, 2], yaw: Math.PI + 0.3, pitch: 0.08, head: [0, -0.12, 0], jaw: ss(0.1, 0.7, t), visor: 1.3 + ss(1.5, 2, t), cut: 1, ...P_BRACE() }),
    light: () => NIGHT,
    scene: (t, cam, rig) => {
      const a = t - 2.0;
      const W = a > 0 ? Math.min(1.25, 0.2 + a * 1.6) : 0;
      const chest = toWorld(rig, [0, -2.0, 0.6]);
      return {
        uWound: [0, -2.0, 0.85, W], uDome: [...chest, a > 0 ? 3.5 + 7 * easeOut(a / 1.4) : 0], uFx: [a > 0 ? kf(a, [[0, 1.8], [1, 1], [3, 0.5]]) : 0, 0, 0, 0],
        uDomeCore: [0.85, 1, 1], uDomeEdge: [0.2, 0.9, 1], uXL: { t: 'v4a', v: a > 0 ? [...chest, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] : new Array(16).fill(0) },
      };
    },
    comp: (t, cam, rig, asp, m) => {
      const mouth = project(cam, mW(m, [0, -0.6, 1.0]), asp);
      const chest = project(cam, toWorld(rig, [0, -2.0, 0.9]), asp);
      const out = { flares: [] };
      if (mouth && t < 2.0) { out.charge = [mouth.x, mouth.y, 0.6, ss(0.3, 0.8, t)]; if (t < 1) out.flares.push([mouth.x, mouth.y, 0.5, -ss(0.5, 2, t) * 3]); }
      if (t > 2.0 && chest) {
        const a = t - 2.0;
        out.splats = splats(CANNON_GORE(rig), t, cam, asp);
        out.rings = [[chest.x, chest.y, a * 0.9, 1 - ss(0, 1.5, a)]];
        out.debris = [chest.x, chest.y, a * 1.1, 1 - ss(1.5, 3, a)];
      }
      return out;
    },
    beams: (t, m, rig) => {
      const out = [];
      if (t > 2.0 && t < 3.6) out.push([mW(m, [0, -0.6, 1.0]), toWorld(rig, [0, -2.0, 0.5]), 1.3 * (1 - 0.3 * ss(3.2, 3.6, t)), 4]);
      return out;
    },
    post: t => { const f = Math.floor((t - 2.0) * FPS); return { impact: f >= 0 && f < 5 ? [2, 1, 3, 2, 1][f] : 0, shake: t > 2 ? shake(t, 0.03 * Math.exp(-(t - 2) * 1.2)) : shake(t, 0.004 * ss(0.5, 2, t)),
      speed: t < 1 ? ss(0.6, 1.0, t) * 0.6 : t < 2 ? 0 : (t < 2.8 ? 1 : 0), speedPos: [0.55, 0.5], flash: f >= 5 && f < 8 ? [0.8, 0.5, 0.25][f - 5] : 0, flashCol: [0.8, 1, 1] }; },
  },
  /* 9 · epílogo: el humo se abre y aparecen muchos más */
  {
    name: 'after', dur: 6.0, prog: 'AFTER', twos: false,
    cam: t => ({ pos: lerp3([-14, 2.2, 30], [-10, 3, 23], ease(t / 6)), tar: [2, 12, -60], fl: 1.35, roll: 0 }),
    rig: (t, cam) => baseRig({ head: [0, 0.12, 0], face: [0.07, -0.12, 0.6, 0.08], eyeGlow: kf(t, [[2.2, 0], [3.2, 1.6], [4.0, 1.6], [4.1, 4]]), gaze: cam.pos }),
    mech: t => mecha({ pos: [-15, (MFOOT - 1.25) * MS, 14], yaw: Math.PI + 0.35, pitch: 0.25, head: [0.1, 0.1, 0], visor: 0.5 + 0.5 * (hash(Math.floor(t * 12)) > 0.3 ? 1 : 0), cut: 1, ...P_KNEEL() }),
    light: t => ({ keyDir: norm([0, 0.25, -1]), keyCol: [0.9, 0.3, 0.09], shadowCol: [0.03, 0.035, 0.08], rimDir: norm([0, 0.25, -1]), rimCol: [1, 0.45, 0.2], rimW: 0.45,
      termCol: [0.3, 0.05, 0.05], fogCol: [0.38, 0.07, 0.03], haze: [0.07, 0.014, 0.012], zenith: [0.01, 0.004, 0.006], fogK: 0.004, moonDir: norm([-0.5, 0.42, -1]), moonR: 0.07, moonCol: [1, 0.3, 0.12], cityBox: [0, -5, 40, 28] }),
    comp: (t, cam, rig, asp) => {
      const fl = [];
      if (t > 2.2) for (const [x, z, s, yaw] of HORDE) { const bp = [x, 5.62 * s, z], R = rotY(yaw); for (const ex of [0.3, -0.3]) { const p = project(cam, add(bp, m3v(R, mul([ex, -0.05, 0.9], s))), asp); if (p) fl.push([p.x, p.y, 0.3, rig.eyeGlow]); } }
      return { ash: 0.9, embers: 0.9, flares: fl.slice(0, 8) };
    },
    post: t => ({ flash: kf(t, [[4.05, 0], [4.15, 0.7], [4.4, 0]]), flashCol: [1, 0.2, 0.1], fade: 1 - ss(5.2, 5.3, t), shake: t > 4.05 ? shake(t, 0.012 * Math.exp(-(t - 4.05) * 3)) : [0, 0], lineFog: 0.006 }),
  },
];
// datos que dependen de funciones de arriba
function laserTarget(t, m) {
  // barrido por la ciudad hasta cruzar el brazo del mecha
  if (t < 1.4) return lerp3([-24, 0, -38], mW(m, [1.9, -2.3, 0.4]), ease((t - 0.55) / 0.85));
  return lerp3(mW(m, [1.9, -2.3, 0.4]), [34, 0, -18], ease((t - 1.4) / 2.2));
}
const LASER_EXP = Array.from({ length: 16 }, (_, i) => { const t = 0.6 + i * 0.19; const m = SHOTS ? null : null; return [[lerp(-24, 34, i / 15) + (hash(i) - 0.5) * 4, 0.8, lerp(-38, -18, i / 15) + (hash(i + 2) - 0.5) * 4], t + 0.05, 4 + hash(i) * 3]; });
const SQUAD_EXP = Array.from({ length: 18 }, (_, i) => [toWorld(baseRig(GIANT), [(hash(i * 3) - 0.5) * 1.8, -0.8 - hash(i + 5) * 2.8, 0.85]), 1.8 + i * 0.17, 3 + hash(i) * 2]).concat([[[SQUAD[5].x, 30, SQUAD[5].z], 3.2, 9]]);
const SQUAD_GORE = Array.from({ length: 5 }, (_, i) => [toWorld(baseRig(GIANT), [(hash(i * 7) - 0.5) * 1.4, -1.2 - hash(i + 2) * 2, 0.9]), 2.2 + i * 0.5, 3.5]);
const CANNON_GORE = rig => [[toWorld(rig, [0, -2.0, 1.0]), 2.02, 9], [toWorld(rig, [0.3, -1.6, 1.0]), 2.25, 6], [toWorld(rig, [-0.4, -2.4, 1.0]), 2.5, 7], [toWorld(rig, [0.1, -2.1, 1.0]), 2.9, 8], [toWorld(rig, [0, -2.0, 1.0]), 3.4, 6]];
function mechaU(m) {
  return {
    uMPos: m.pos, uMRot: { t: 'm3', v: m.rot }, uMScale: m.scale, uMHead: { t: 'm3', v: euler(...m.head) }, uMFace: [m.jaw, m.visor, m.thrust, m.cut],
    uMArmR: { t: 'v3a', v: [...m.armR.sh, ...m.armR.el, ...m.armR.wr] }, uMHandR: { t: 'm3', v: m.armR.hand },
    uMArmL: { t: 'v3a', v: [...m.armL.sh, ...m.armL.el, ...m.armL.wr] }, uMHandL: { t: 'm3', v: m.armL.hand },
    uMLegR: { t: 'v3a', v: [].concat(...m.legR) }, uMLegL: { t: 'v3a', v: [].concat(...m.legL) },
  };
}
const TESTS = [{
  // 0–10 luz neutra, 10–20 luz de escena · segundo 0–6 vuelta completa, 7–10 primer plano de la cabeza
  name: 'mtest', prog: 'MECHATEST', dur: 20, twos: false,
  cam: (t, m) => {
    const a = t % 10;
    if (a < 7) { const c = add(m.pos, [0, -2.4 * MS, 0]); return { pos: add(c, [Math.sin(a) * 30, 1, Math.cos(a) * 30]), tar: c, fl: 1.6, roll: 0 }; }
    const h = mW(m, [0, -0.2, 0]), b = (a - 7) * 0.9 - 0.5; return { pos: add(h, [Math.sin(b) * 7, 0.6, Math.cos(b) * 7]), tar: h, fl: 1.5, roll: 0 };
  },
  rig: () => baseRig({}),
  mech: t => { const a = t % 10; return mecha({ pos: [0, 0, 0], visor: 1, ...(a > 5 && a < 7 ? P_PUNCH(1) : a > 3.5 && a < 5 ? P_CROUCH() : {}) }); },
  light: t => t < 10 ? ({ keyDir: norm([-0.5, 0.7, 0.6]), keyCol: [1, 0.95, 0.9], shadowCol: [0.1, 0.12, 0.2], rimDir: norm([0.4, 0.3, -1]), rimCol: [1, 0.4, 0.2], rimW: 0.5,
    fillDir: [0.6, 0.2, 0.5], fillCol: [0.15, 0.2, 0.35], fogCol: [0.02, 0.02, 0.03], zenith: [0.01, 0.01, 0.02], moonR: 0.001 }) : Object.assign({}, NIGHT, { moonR: 0.001, fogCol: [0.02, 0.005, 0.008] }),
}];
let _acc = 0;
for (const s of SHOTS) { s.start = _acc; _acc += s.dur; }
const DURATION = _acc;
const shotAt = t => { for (let i = SHOTS.length - 1; i >= 0; i--) if (t >= SHOTS[i].start) return SHOTS[i]; return SHOTS[0]; };

const SUBS = [];

/* ------------------------------------------------------------- uniforms -- */
const M3 = v => ({ t: 'm3', v }), V3A = v => ({ t: 'v3a', v }), V4A = v => ({ t: 'v4a', v }), I1 = v => ({ t: 'i', v });
function setUniforms(gl, prog, U) {
  for (const k in U) {
    const loc = prog.u[k]; if (!loc) continue;
    const v = U[k];
    if (typeof v === 'number') gl.uniform1f(loc, v);
    else if (v.t === 'm3') gl.uniformMatrix3fv(loc, false, v.v);
    else if (v.t === 'v3a') gl.uniform3fv(loc, v.v);
    else if (v.t === 'v4a') gl.uniform4fv(loc, v.v);
    else if (v.t === 'i') gl.uniform1i(loc, v.v);
    else if (v.length === 2) gl.uniform2fv(loc, v);
    else if (v.length === 3) gl.uniform3fv(loc, v);
    else if (v.length === 4) gl.uniform4fv(loc, v);
  }
}
function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('Shader ' + label + ':\n' + gl.getShaderInfoLog(sh));
  return sh;
}
function program(gl, fs, label) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, S.VERT, label + '/vs'));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, label));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link ' + label + ': ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

/* ---------------------------------------------------------------- motor -- */
class Anime {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.W = opts.width || 1920; this.H = opts.height || 1080;
    this.scale = opts.sceneScale || 2 / 3;
    canvas.width = this.W; canvas.height = this.H;
    this.duration = DURATION; this.fps = FPS; this.frameCount = Math.round(DURATION * FPS);
    this.shots = SHOTS;
    this.lastKey = '';
  }
  async init(onProgress = () => {}) {
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 no disponible');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Falta EXT_color_buffer_float');
    this.gl = gl;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.post = {};
    for (const k of ['LINES', 'COMP', 'BRIGHT', 'BLUR', 'COPY', 'RAYS', 'FINAL']) this.post[k] = program(gl, S[k], k);
    this.progs = {};
    const names = [...new Set(SHOTS.filter(s => s.prog).map(s => s.prog))];
    for (let i = 0; i < names.length; i++) {
      onProgress(i / names.length);
      await new Promise(r => setTimeout(r, 0));
      this.progs[names[i]] = program(gl, S.sceneSource(names[i]), names[i]);
    }
    onProgress(1);
    const sw = Math.round(this.W * this.scale), sh = Math.round(this.H * this.scale);
    this.sw = sw; this.sh = sh;
    const T = (w, h, nearest) => this.target(w, h, nearest);
    this.fb = {
      mrt: this.mrt(sw, sh), lines: T(sw, sh), comp: T(sw, sh),
      b1a: T(sw >> 1, sh >> 1), b1b: T(sw >> 1, sh >> 1), b2a: T(sw >> 2, sh >> 2), b2b: T(sw >> 2, sh >> 2),
      b3a: T(sw >> 3, sh >> 3), b3b: T(sw >> 3, sh >> 3), rays: T(sw >> 2, sh >> 2),
    };
    const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    this.fxc = mkCanvas(sw, sh); this.fxx = this.fxc.getContext('2d');
    this.ovc = mkCanvas(this.W, this.H); this.ovx = this.ovc.getContext('2d');
    this.fxTex = this.tex2d(); this.ovTex = this.tex2d();
    if (document.fonts) {
      await Promise.all(['900 40px "Noto Serif JP"', '700 40px "Noto Sans JP"', '800 40px "Barlow Condensed"', '600 40px "Barlow Condensed"',
        '40px "Share Tech Mono"', '800 40px "Noto Sans"'].map(f => document.fonts.load(f, 'Aア蒼'))).catch(() => {});
    }
  }
  tex2d() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  colorTex(w, h, nearest) {
    const gl = this.gl, t = this.tex2d();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    if (nearest) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); }
    return t;
  }
  target(w, h, nearest) {
    const gl = this.gl, tex = this.colorTex(w, h, nearest), fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }
  mrt(w, h) {
    const gl = this.gl, c = this.colorTex(w, h), nd = this.colorTex(w, h, true), fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, c, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, nd, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    return { tex: c, nd, fbo, w, h };
  }
  pass(prog, dst, U, textures) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
    gl.viewport(0, 0, dst ? dst.w : this.W, dst ? dst.h : this.H);
    gl.useProgram(prog.p);
    let unit = 0;
    for (const k in textures) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, textures[k]);
      if (prog.u[k]) gl.uniform1i(prog.u[k], unit);
      unit++;
    }
    setUniforms(gl, prog, U);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  blur(a, b) {
    this.pass(this.post.BLUR, b, { uDir: [1 / a.w, 0] }, { uTex: a.tex });
    this.pass(this.post.BLUR, a, { uDir: [0, 1 / a.h] }, { uTex: b.tex });
  }
  upload(tex, canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, tex === this.fxTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  renderAt(t, override) {
    const gl = this.gl, P = this.post, fb = this.fb, asp = this.W / this.H;
    t = clamp(t, 0, DURATION - 1e-4);
    let shot = shotAt(t), lt = t - shot.start;
    if (override) { shot = SHOTS.concat(TESTS).find(s => s.name === override.shot) || shot; lt = override.lt; t = (shot.start || 0) + lt; }
    const frame = Math.floor(t * FPS + 1e-4);
    const sf = Math.round(shot.start * FPS), lf = frame - sf;
    const slf = shot.twos ? lf - (lf % 2) : lf;
    const st = override ? lt : Math.max(0, (sf + slf) / FPS - shot.start);
    let cam3 = null, rig3 = null, hasScene = 0;
    const post = Object.assign({
      zoom: 1, shake: [0, 0], impact: 0, speed: 0, speedDark: 0, speedPos: [0.5, 0.5], flash: 0, flashCol: [1, 1, 1], fade: 1,
      raysAmt: 0, raysPos: [0.5, 0.5], raysLen: 0.85, bloom: 0.6, ca: 0.0015, grade: [1.0, 1.05, 1.12, 0.02], lineCol: [0.02, 0.012, 0.03],
      lineW: 1, lineFog: 0.003, normTh: 0.12, motion: [0, 0], motionNear: 30,
    });
    if (shot.prog) {
      hasScene = 1;
      performanceFrame = frame;
      const warp = shot.timeWarp || (x => x);
      const st2 = warp(st);
      const mech3 = shot.mech ? shot.mech(st2) : null;
      cam3 = (override && override.cam) ? Object.assign({ roll: 0 }, override.cam) : shot.cam(st2, mech3);
      if (this.H > this.W) { cam3.fl *= shot.pfl || 0.62; if (shot.pcam) Object.assign(cam3, shot.pcam(st2, cam3)); }
      cam3.b = camBasis(cam3);
      rig3 = shot.rig(st2, cam3);
      this.mech3 = mech3;
      const L = Object.assign({}, LIGHT0, shot.light ? shot.light(st2, cam3) : {});
      if (shot.post) Object.assign(post, shot.post(lt, cam3, asp));
      const key = shot.name + ':' + slf + (override ? ':' + lt : '');
      if (key !== this.lastKey) {
        const B = rotY(rig3.bYaw), R = rig3.armR, Lr = rig3.armL;
        const U = {
          uRes: [fb.mrt.w, fb.mrt.h], uT: st2, uG: shot.start + st,
          uCamPos: cam3.pos, uCamTar: cam3.tar, uCamFl: cam3.fl, uCamRoll: cam3.roll || 0,
          uBPos: rig3.bPos, uBRot: M3(B), uBScale: rig3.bScale, uHeadRot: M3(euler(...rig3.head)), uFace: rig3.face,
          uGaze: rig3.gaze, uEyeGlow: rig3.eyeGlow,
          uArmR: V3A([...R.sh, ...R.el, ...R.wr]), uHandR: M3(R.hand), uArmL: V3A([...Lr.sh, ...Lr.el, ...Lr.wr]), uHandL: M3(Lr.hand),
          uPoint: [R.point, Lr.point], uTip: [...toWorld(rig3, R.tip), rig3.tipGlow],
          uKeyDir: norm(L.keyDir), uKeyCol: L.keyCol, uShadowCol: L.shadowCol, uRimDir: norm(L.rimDir), uRimCol: L.rimCol, uRimW: L.rimW,
          uTermCol: L.termCol, uFogCol: L.fogCol, uHaze: L.haze || L.fogCol, uZenith: L.zenith, uFogK: L.fogK, uMoonDir: norm(L.moonDir), uMoonCol: L.moonCol, uMoonR: L.moonR,
          uFlashL: L.flashL, uFillDir: norm(L.fillDir), uFillCol: L.fillCol, uEyeLight: L.eyeLight, uCityBox: L.cityBox,
          uXL: V4A(new Array(16).fill(0)), uDome: [0, 0, 0, 0], uFx: [0, 0, 0, 0], uDestroy: [0, 0, 0, 0], uWet: 0, uEarth: [0, 0, 0, 0],
          uWound: [0, 0, 0, 0], uCrack: [0, 0, 0, 0], uDomeCore: [1, 0.95, 0.85], uDomeEdge: [1, 0.12, 0.04], uArmOff: [0, -1e4, 0, 0],
          uSquadN: I1(0), uSquadScale: 1, uBeamN: I1(0), uMFace: [0, 0, 0, 0],
        };
        if (mech3) Object.assign(U, mechaU(mech3));
        if (shot.beams) Object.assign(U, beamU(shot.beams(st2, mech3, rig3)));
        if (shot.scene) Object.assign(U, shot.scene(st2, cam3, rig3, mech3));
        if (!this.progs[shot.prog]) this.progs[shot.prog] = program(gl, S.sceneSource(shot.prog), shot.prog);
        this.pass(this.progs[shot.prog], fb.mrt, U, {});
        this.pass(P.LINES, fb.lines, { uTexel: [1 / fb.mrt.w, 1 / fb.mrt.h], uLineFog: post.lineFog, uLineW: post.lineW, uNormTh: post.normTh }, { uND: fb.mrt.nd });
        this.lastKey = key;
      }
      // capa 2D de efectos (en unos: cada fotograma)
      const fx = this.fxx;
      fx.clearRect(0, 0, this.sw, this.sh);
      if (shot.fx) shot.fx(fx, (shot.timeWarp || (x => x))(lt), cam3, rig3, FX(this.sw, this.sh, frame));
      this.upload(this.fxTex, this.fxc);
      const C = Object.assign({ rain: 0, ash: 0, embers: 0, spray: 0, exp: [], flares: [], charge: [0, 0, 0, 0], debris: [0, 0, 0, 0], splats: [], rings: [] }, shot.comp ? shot.comp((shot.timeWarp || (x => x))(lt), cam3, rig3, asp, this.mech3) : {});
      const expArr = new Array(96).fill(0); C.exp.slice(-24).forEach((e, i) => expArr.splice(i * 4, 4, ...e));
      const spArr = new Array(40).fill(0); C.splats.slice(-10).forEach((e, i) => spArr.splice(i * 4, 4, ...e));
      const rgArr = new Array(16).fill(0); C.rings.slice(0, 4).forEach((e, i) => rgArr.splice(i * 4, 4, ...e));
      const flArr = new Array(32).fill(0); C.flares.slice(0, 8).forEach((e, i) => flArr.splice(i * 4, 4, ...e));
      this.pass(P.COMP, fb.comp, {
        uRes: [fb.comp.w, fb.comp.h], uG: t, uFrame: frame, uExp: V4A(expArr), uExpN: I1(Math.min(C.exp.length, 24)), uSplat: V4A(spArr), uSplatN: I1(Math.min(C.splats.length, 10)), uRing: V4A(rgArr), uRingN: I1(Math.min(C.rings.length, 4)),
        uFlare: V4A(flArr), uFlareN: I1(Math.min(C.flares.length, 8)), uRain: C.rain, uAsh: C.ash, uEmbers: C.embers, uSpray: C.spray,
        uCharge: C.charge, uDebris: C.debris,
      }, { uScene: fb.mrt.tex, uFxTex: this.fxTex });
      this.pass(P.BRIGHT, fb.b1a, { uTexel: [1 / fb.comp.w, 1 / fb.comp.h], uThr: 1.0 }, { uTex: fb.comp.tex });
      this.blur(fb.b1a, fb.b1b);
      this.pass(P.COPY, fb.b2a, { uTexel: [1 / fb.b1a.w, 1 / fb.b1a.h] }, { uTex: fb.b1a.tex });
      this.blur(fb.b2a, fb.b2b);
      this.pass(P.COPY, fb.b3a, { uTexel: [1 / fb.b2a.w, 1 / fb.b2a.h] }, { uTex: fb.b2a.tex });
      this.blur(fb.b3a, fb.b3b); this.blur(fb.b3a, fb.b3b);
      if (post.raysAmt > 0) this.pass(P.RAYS, fb.rays, { uPos: post.raysPos, uLen: post.raysLen }, { uTex: fb.b1a.tex });
    } else if (shot.post) {
      Object.assign(post, shot.post(lt));
    }
    // rótulos
    const ov = this.ovx;
    ov.clearRect(0, 0, this.W, this.H);
    if (!override || override.overlay) drawOverlay(ov, t, shot, lt, this.W, this.H, frame, cam3, rig3);
    this.upload(this.ovTex, this.ovc);
    this.pass(P.FINAL, null, {
      uRes: [this.W, this.H], uFrame: frame, uG: t, uShake: post.shake, uZoom: post.zoom, uImpact: post.impact, uSpeed: post.speed,
      uSpeedDark: post.speedDark, uSpeedPos: post.speedPos, uFlash: post.flash, uFlashCol: post.flashCol, uFade: post.fade,
      uRaysAmt: post.raysAmt, uBloom: post.bloom, uCA: post.ca, uHasScene: hasScene, uLineCol: post.lineCol, uGrade: post.grade, uMotion: post.motion, uMotionNear: post.motionNear,
    }, { uComp: fb.comp.tex, uLine: fb.lines.tex, uB1: fb.b1a.tex, uB2: fb.b2a.tex, uB3: fb.b3a.tex, uRays: fb.rays.tex, uOverlay: this.ovTex, uND: fb.mrt.nd });
  }
  readPixels() {
    const gl = this.gl, px = new Uint8Array(this.W * this.H * 4);
    gl.readPixels(0, 0, this.W, this.H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }
}

/* ------------------------------------------------- efectos 2D (escena) -- */
let _tc = null;
function trailCanvas(W, H) {
  if (!_tc || _tc.width !== W || _tc.height !== H) { _tc = document.createElement('canvas'); _tc.width = W; _tc.height = H; }
  return _tc;
}
function FX(W, H, frame) {
  const P = (u, v) => [(u / (W / H) + 0.5) * W, (0.5 - v) * H];   // de coordenadas "p" a píxeles
  const rng = seed => { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
  return {
    bolt(ctx, x0, x1, yEnd, a, seed) {
      const r = rng(seed * 13 + 7);
      const pts = [[x0 * W, -10]];
      const N = 18;
      for (let i = 1; i <= N; i++) {
        const k = i / N;
        pts.push([lerp(x0, x1, k) * W + (r() - 0.5) * W * 0.05 * (1 - k * 0.3), k * yEnd * H]);
      }
      const stroke = (p, w, col, blur) => {
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.shadowColor = 'rgba(160,190,255,1)'; ctx.shadowBlur = blur;
        ctx.lineJoin = 'round'; ctx.globalAlpha = a; ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); ctx.restore();
      };
      stroke(pts, 6, 'rgba(150,180,255,0.5)', 30);
      stroke(pts, 2, '#ffffff', 10);
      for (let b = 0; b < 3; b++) {
        const s = 3 + Math.floor(r() * 10), br = [pts[s]];
        for (let i = 1; i < 6; i++) br.push([br[i - 1][0] + (r() - 0.3) * W * 0.03 * (x1 > x0 ? 1 : -1), br[i - 1][1] + H * 0.03]);
        stroke(br, 1.2, '#dfe8ff', 8);
      }
    },
    trails(ctx, t, cam, LIST) {
      const asp = W / H;
      for (const m of LIST) {
        if (t < m.t0) continue;
        const prog = clamp((t - m.t0) / m.dur);
        const fade = 1 - ss(1.6, 2.6, t - m.hit);
        if (fade <= 0) continue;
        const puffs = [];
        const N = 260;
        for (let i = 0; i <= N; i++) {
          const s = i / N * prog;
          const age = t - (m.t0 + s * m.dur);
          const p = project(cam, bez(m, s), asp);
          if (!p) continue;
          const jit = 0.7 + 0.6 * hash(Math.floor(i / 3) * 1.7 + m.t0 * 10);
          const rw = (0.06 + age * 0.3) * jit;
          const [x, y] = P(p.x, p.y);
          puffs.push({ x, y, r: Math.max(0.8, rw / p.z * cam.fl * H), a: clamp(1 - age / 2.6) });
        }
        // la estela se dibuja como una sola forma (unión de bolas) y se funde entera
        const tc = trailCanvas(W, H), tx = tc.getContext('2d');
        tx.clearRect(0, 0, W, H);
        tx.fillStyle = '#0b080e'; for (const q of puffs) { tx.beginPath(); tx.arc(q.x, q.y, q.r + 1.2, 0, 7); tx.fill(); }
        tx.fillStyle = '#2b2430'; for (const q of puffs) { tx.beginPath(); tx.arc(q.x, q.y, q.r, 0, 7); tx.fill(); }
        tx.fillStyle = '#6a5d6c'; for (const q of puffs) { tx.beginPath(); tx.arc(q.x - q.r * 0.25, q.y - q.r * 0.3, q.r * 0.55, 0, 7); tx.fill(); }
        ctx.save(); ctx.globalAlpha = 0.85 * fade; ctx.drawImage(tc, 0, 0); ctx.restore();
        if (prog < 1) {
          const p = project(cam, bez(m, prog), asp);
          if (p) {
            const [x, y] = P(p.x, p.y);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
            g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.3, 'rgba(255,160,60,.8)'); g.addColorStop(1, 'rgba(255,60,20,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill(); ctx.restore();
          }
        }
      }
    },
    jets(ctx, t, cam) {
      const asp = W / H;
      for (let j = 0; j < 3; j++) {
        const t0 = 0.05 + j * 0.22;
        const a = t - t0; if (a < 0 || a > 1.6) continue;
        const P0 = [26 - j * 3, 6 + j * 1.5, -8 - j * 4], V = [-40, 1.5, -6];
        const pos = add(P0, mul(V, a)), prev = add(P0, mul(V, a - 0.05));
        const p = project(cam, pos, asp), q = project(cam, prev, asp);
        if (!p || !q) continue;
        const [x, y] = P(p.x, p.y), [xq, yq] = P(q.x, q.y);
        const ang = Math.atan2(y - yq, x - xq), sz = Math.max(4, 0.35 / p.z * cam.fl * H);
        // estela
        ctx.save(); ctx.strokeStyle = 'rgba(210,205,220,.55)'; ctx.lineWidth = Math.max(1, sz * 0.12);
        const tail = project(cam, add(P0, mul(V, Math.max(0, a - 0.6))), asp);
        if (tail) { const [xt, yt] = P(tail.x, tail.y); ctx.beginPath(); ctx.moveTo(xt, yt); ctx.lineTo(x, y); ctx.stroke(); }
        ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = '#0b0910';
        ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.7, sz * 0.55); ctx.lineTo(-sz * 0.45, 0); ctx.lineTo(-sz * 0.7, -sz * 0.55); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(-sz * 0.55, 0, 0, -sz * 0.55, 0, sz * 0.6);
        g.addColorStop(0, 'rgba(255,230,180,1)'); g.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-sz * 0.55, 0, sz * 0.6, 0, 7); ctx.fill();
        ctx.restore();
      }
    },
    arcs(ctx, tp, t) {
      const [x, y] = P(tp.x, tp.y);
      const r = rng(Math.floor(frame / 2) + 3);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
      for (let k = 0; k < 4; k++) {
        let a = r() * Math.PI * 2, px = x, py = y;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let i = 0; i < 7; i++) { a += (r() - 0.5) * 1.2; const st = H * (0.012 + r() * 0.02); px += Math.cos(a) * st; py += Math.sin(a) * st; ctx.lineTo(px, py); }
        ctx.strokeStyle = 'rgba(255,140,90,.9)'; ctx.lineWidth = 1.6; ctx.shadowColor = 'rgba(255,60,20,1)'; ctx.shadowBlur = 12; ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/* ------------------------------------------------------ rótulos y HUD -- */
const ORANGE = '#ff8a1e', RED = '#ff2a22', WHITE = '#f4f1ea';
const F = {
  serif: s => `900 ${s}px "Noto Serif JP", serif`, jp: s => `700 ${s}px "Noto Sans JP", sans-serif`,
  cond: s => `800 ${s}px "Barlow Condensed", sans-serif`, cond6: s => `600 ${s}px "Barlow Condensed", sans-serif`,
  mono: s => `${s}px "Share Tech Mono", monospace`, sub: s => `800 ${s}px "Noto Sans", sans-serif`,
};
const typed = (s, t0, t, cps) => s.slice(0, Math.max(0, Math.min(s.length, Math.floor((t - t0) * cps))));

function drawOverlay(ctx, t, shot, lt, W0, H0, frame, cam, rig) {
  const V = H0 > W0;
  const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
  ctx.save();
  ctx.scale(W0 / W, H0 / H);
  if (shot.name === 'intro') drawIntro(ctx, lt, W, H, frame, V);
  if (shot.name === 'title') drawTitle(ctx, lt, W, H, frame, V);
  if (shot.overlay) shot.overlay(ctx, lt, cam, rig, HUD(W, H, frame, V));
  drawSubs(ctx, t, W, H, V);
  ctx.restore();
}

function vtext(ctx, str, x, y, size, n, t0, t, glow) {
  const chars = [...str];
  for (let i = 0; i < chars.length; i++) {
    const a = clamp((t - t0 - i * 0.09) / 0.18);
    if (a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y + i * size * 1.08);
    const s = 1 + (1 - a) * 0.35; ctx.scale(s, s);
    ctx.font = F.serif(size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = glow; ctx.shadowBlur = size * 0.45;
    ctx.fillStyle = WHITE; ctx.fillText(chars[i], 0, 0);
    ctx.restore();
  }
}

function drawIntro(ctx, t, W, H, frame, V) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.55, H * 0.45, 0, W * 0.55, H * 0.45, H * 0.8);
  g.addColorStop(0, `rgba(90,6,10,${0.35 + 0.1 * Math.sin(t * 5)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // ceniza flotando
  for (let i = 0; i < 40; i++) {
    const x = ((hash(i * 3.3) * W + t * (10 + 20 * hash(i))) % W), y = (hash(i * 7.1) * H - t * (8 + 25 * hash(i + 1)) + H) % H;
    ctx.fillStyle = `rgba(200,180,180,${0.15 + 0.25 * hash(i + 9)})`; ctx.fillRect(x, y, 2, 2);
  }
  const out = 1 - ss(3.2, 3.45, t);
  ctx.globalAlpha = out;
  const vs = V ? 96 : 74;
  vtext(ctx, '千年の眠りから', W * (V ? 0.61 : 0.585), H * (V ? 0.25 : 0.2), vs, 7, 0.25, t, 'rgba(255,40,20,.8)');
  vtext(ctx, '蒼き嬰児は目覚める', W * (V ? 0.42 : 0.485), H * (V ? 0.22 : 0.16), vs, 9, 1.35, t, 'rgba(255,40,20,.8)');
  ctx.globalAlpha = 1;
  // tajo de luz que abre el siguiente plano
  if (t > 3.35) {
    const k = ss(3.35, 3.75, t);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const h = H * (0.004 + 0.5 * k * k);
    const gg = ctx.createLinearGradient(0, H / 2 - h, 0, H / 2 + h);
    gg.addColorStop(0, 'rgba(255,60,30,0)'); gg.addColorStop(0.5, 'rgba(255,240,230,1)'); gg.addColorStop(1, 'rgba(255,60,30,0)');
    ctx.fillStyle = gg; ctx.fillRect(0, H / 2 - h, W * ss(3.35, 3.45, t), h * 2);
    ctx.restore();
  }
}

function drawTitle(ctx, t, W, H, frame, V) {
  const hit2 = t >= 2.5 && t < 2.5 + 2 / 24;
  ctx.fillStyle = hit2 ? WHITE : '#000'; ctx.fillRect(0, 0, W, H);
  if (t < 2 / 24) { ctx.fillStyle = '#b00d08'; ctx.fillRect(0, 0, W, H); }
  const ink = hit2 ? '#000' : WHITE;
  const fade = 1 - ss(4.55, 4.95, t);
  ctx.globalAlpha = fade;
  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';
  if (V) {
    const col = (str, x, y0, size) => {
      ctx.font = F.serif(size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      [...str].forEach((c, i) => ctx.fillText(c, x, y0 + i * size * 1.04));
    };
    col('蒼キ嬰児', W * 0.64, H * 0.26, 250);
    if (t > 1.25) { ctx.font = F.serif(96); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillText('第壱話', W * 0.9, H * 0.14); }
    if (t > 2.5) {
      col('降臨', W * 0.27, H * 0.5, 190);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = F.cond(44); ctx.fillStyle = hit2 ? '#000' : '#bdb6ad'; ctx.fillText('EPISODIO 1', W / 2, H * 0.85);
      ctx.fillStyle = ink; ctx.fillText('LOS NIÑOS DE AZUL', W / 2, H * 0.885); ctx.fillText('— EL DESCENSO —', W / 2, H * 0.915);
    }
    ctx.globalAlpha = 1;
    return;
  }
  // 蒼キ嬰児、 enorme y comprimido
  ctx.save(); ctx.translate(W * 0.5, H * 0.6); ctx.scale(0.8, 1);
  ctx.font = F.serif(250); ctx.textAlign = 'center';
  ctx.fillText('蒼キ嬰児、', 0, 0);
  ctx.restore();
  if (t > 1.25) {
    ctx.save(); ctx.translate(W * 0.1, H * 0.25); ctx.scale(0.85, 1);
    ctx.font = F.serif(110); ctx.textAlign = 'left'; ctx.fillText('第壱話', 0, 0); ctx.restore();
  }
  if (t > 2.5) {
    ctx.save(); ctx.translate(W * 0.9, H * 0.9); ctx.scale(0.8, 1);
    ctx.font = F.serif(190); ctx.textAlign = 'right'; ctx.fillText('降臨', 0, 0); ctx.restore();
    ctx.font = F.cond(40); ctx.textAlign = 'left';
    ctx.fillStyle = hit2 ? '#000' : '#bdb6ad';
    ctx.fillText('EPISODIO 1', W * 0.1, H * 0.8);
    ctx.fillStyle = ink;
    ctx.fillText('LOS NIÑOS DE AZUL — EL DESCENSO', W * 0.1, H * 0.86);
  }
  ctx.globalAlpha = 1;
}

function drawSubs(ctx, t, W, H, V) {
  for (const [a, b, text] of SUBS) {
    if (t < a || t > b) continue;
    const al = Math.min(1, (t - a) / 0.12, (b - t) / 0.12);
    ctx.save(); ctx.globalAlpha = al;
    const fs = V ? 54 : Math.round(H * 0.042);
    ctx.font = F.sub(fs); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.2; ctx.strokeStyle = 'rgba(0,0,0,.92)';
    const lines = [];
    let cur = '';
    for (const w of text.split(' ')) { const tst = cur ? cur + ' ' + w : w; if (ctx.measureText(tst).width > W * 0.86 && cur) { lines.push(cur); cur = w; } else cur = tst; }
    lines.push(cur);
    let y = (V ? H * 0.74 : H * 0.915) - (lines.length - 1) * fs * 1.2;
    for (const ln of lines) { ctx.strokeText(ln, W / 2, y); ctx.fillStyle = WHITE; ctx.fillText(ln, W / 2, y); y += fs * 1.2; }
    ctx.restore();
  }
}

function HUD(W, H, frame, V) {
  const glow = (ctx, c, b) => { ctx.shadowColor = c; ctx.shadowBlur = b; };
  return {
    hudCity(ctx, t, cam, rig) {
      const on = ss(0, 0.15, t);
      const jit = hash(Math.floor(frame / 2)) > 0.92 ? (hash(frame) - 0.5) * 14 : 0;
      ctx.save(); ctx.translate(jit, 0); ctx.globalAlpha = on;
      glow(ctx, 'rgba(255,120,20,.7)', 8);
      ctx.strokeStyle = ORANGE; ctx.lineWidth = 2;
      // esquinas
      const m = 38, l = 70;
      for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
        ctx.beginPath(); ctx.moveTo(x, y + sy * l); ctx.lineTo(x, y); ctx.lineTo(x + sx * l, y); ctx.stroke();
      }
      // banda superior de emergencia
      const bandY = V ? 150 : 62;
      if (t > 0.3) {
        ctx.fillStyle = 'rgba(160,10,8,.82)'; ctx.fillRect(0, bandY, W, 44);
        ctx.font = F.jp(28); ctx.fillStyle = WHITE; ctx.textBaseline = 'middle';
        const txt = '非常事態宣言  ◆  ESTADO DE EMERGENCIA  ◆  ';
        ctx.font = F.jp(28); const tw = ctx.measureText(txt).width;
        let x0 = -((t * 220) % tw);
        for (let x = x0; x < W; x += tw) ctx.fillText(txt, x, bandY + 22);
      }
      // aviso
      if (t > 0.45) {
        const blink = Math.floor(t * 3) % 2 === 0;
        ctx.save(); ctx.translate(V ? 60 : 70, V ? 240 : 150);
        ctx.fillStyle = blink ? 'rgba(255,40,30,.9)' : 'rgba(120,10,8,.7)'; ctx.fillRect(0, 0, 250, 112);
        ctx.fillStyle = '#000'; ctx.font = F.jp(78); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText('警告', 18, 50);
        ctx.font = F.cond(24); ctx.fillText('ADVERTENCIA', 20, 96);
        ctx.restore();
      }
      // retícula sobre la cabeza
      const hp = project(cam, toWorld(rig, [0, 0, 0]), W / H);
      if (hp && t > 0.6) {
        const cx = (hp.x / (W / H) + 0.5) * W, cy = (0.5 - hp.y) * H;
        const k = easeOut((t - 0.6) / 0.5);
        const R = lerp(V ? 200 : 260, V ? 95 : 120, k);
        ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = RED; glow(ctx, 'rgba(255,40,20,.9)', 10);
        ctx.lineWidth = 2.5;
        for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          ctx.beginPath(); ctx.moveTo(sx * R, sy * (R - 30)); ctx.lineTo(sx * R, sy * R); ctx.lineTo(sx * (R - 30), sy * R); ctx.stroke();
        }
        ctx.rotate(t * 0.8); ctx.lineWidth = 1.5; ctx.strokeStyle = ORANGE;
        ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, Math.PI * 1.6); ctx.stroke();
        for (let i = 0; i < 24; i++) { ctx.rotate(Math.PI / 12); ctx.beginPath(); ctx.moveTo(R * 0.8, 0); ctx.lineTo(R * (i % 3 ? 0.84 : 0.9), 0); ctx.stroke(); }
        ctx.restore();
        if (t > 1.0) {
          ctx.font = F.jp(26); ctx.fillStyle = RED; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          const lx = V ? cx - R : cx + R + 16, ly = V ? cy + R + 40 : cy - R + 24;
          ctx.fillText('目標捕捉', lx, ly);
          ctx.font = F.cond(24); ctx.fillText('OBJETIVO FIJADO · 7,2 km', lx, ly + 28);
        }
      }
      // panel de datos
      if (t > 1.0) {
        const x = V ? 60 : W - 560, y = V ? 1150 : 170, w = V ? 960 : 490, h = 430;
        ctx.fillStyle = 'rgba(12,4,4,.62)'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = ORANGE; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = ORANGE; ctx.fillRect(x, y, w, 40);
        ctx.fillStyle = '#000'; ctx.font = F.jp(24); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText('解析中', x + 14, y + 21);
        ctx.font = F.cond(24); ctx.fillText('ANALIZANDO ENTIDAD', x + 110, y + 21);
        ctx.fillText(Math.floor(t * 12) % 2 ? '■' : '□', x + w - 34, y + 21);
        const rows = [
          ['識別名', 'DESIGNACIÓN', '蒼キ嬰児 «NIÑO DE AZUL»'],
          ['体長', 'ALTURA', '2.400 m'],
          ['体重', 'MASA', '測定不能'],
          ['起源', 'ORIGEN', '不明 · DESCONOCIDO'],
          ['危険度', 'PELIGRO', ''],
        ];
        rows.forEach(([jp, es, val], i) => {
          const t0 = 1.2 + i * 0.5;
          if (t < t0) return;
          const yy = y + 82 + i * 72;
          ctx.fillStyle = ORANGE; ctx.font = F.jp(24); ctx.fillText(jp, x + 16, yy);
          ctx.fillStyle = '#c9a88a'; ctx.font = F.cond6(20); ctx.fillText(es, x + 16, yy + 27);
          ctx.fillStyle = WHITE; ctx.font = /[ぁ-んァ-ン一-龯]/.test(val) ? F.jp(26) : F.mono(28);
          ctx.fillText(typed(val, t0 + 0.1, t, 26), x + 170, yy + 10);
          if (i === 4) {
            const k = clamp((t - t0 - 0.1) / 0.6);
            ctx.fillStyle = 'rgba(255,40,30,.25)'; ctx.fillRect(x + 170, yy - 6, 290, 30);
            ctx.fillStyle = RED; ctx.fillRect(x + 170, yy - 6, 290 * k, 30);
            if (k >= 1) { ctx.fillStyle = WHITE; ctx.font = F.cond(24); ctx.fillText('MÁXIMO', x + 380, yy + 9); }
          }
          ctx.strokeStyle = 'rgba(255,138,30,.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 14, yy + 44); ctx.lineTo(x + w - 14, yy + 44); ctx.stroke();
        });
      }
      // monitor de pulso
      if (t > 0.8) {
        const x = V ? W - 480 : 70, y = V ? 262 : H - 210, w = 420, h = 110;
        ctx.strokeStyle = ORANGE; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const u = i / 120, ph = (u * 3 + t * 1.2) % 1;
          const v = Math.exp(-Math.pow((ph - 0.5) / 0.02, 2)) * 1 - Math.exp(-Math.pow((ph - 0.54) / 0.02, 2)) * 0.5;
          const px = x + u * w, py = y + h * 0.6 - v * h * 0.5;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = F.cond(22); ctx.fillStyle = ORANGE; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('RITMO VITAL · 3 lat/min', x, y - 10);
      }
      ctx.restore();
    },
    alert(ctx, t, jp, es) {
      if (t < 0) return;
      const blink = Math.floor(t * 4) % 2 === 0;
      const k = easeOut(t / 0.2);
      ctx.save();
      ctx.translate(W / 2, V ? H * 0.16 : H * 0.2); ctx.scale(V ? 0.92 : 1, k);
      ctx.fillStyle = blink ? 'rgba(200,12,8,.9)' : 'rgba(90,6,4,.8)';
      ctx.fillRect(-380, -62, 760, 124);
      ctx.strokeStyle = WHITE; ctx.lineWidth = 3; ctx.strokeRect(-372, -54, 744, 108);
      ctx.fillStyle = WHITE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = F.jp(64); ctx.fillText(jp, 0, -12);
      ctx.font = F.cond(26); ctx.fillText(es, 0, 38);
      ctx.restore();
    },
    count(ctx, t) {
      if (t < 0.4) return;
      const n = t < 1.4 ? 1 : t < 2.4 ? 5 : t < 3.4 ? 27 : 0;
      ctx.save(); ctx.translate(V ? 60 : 80, V ? 240 : 150);
      ctx.fillStyle = 'rgba(12,4,4,.6)'; ctx.fillRect(0, 0, 470, 150);
      ctx.strokeStyle = ORANGE; ctx.lineWidth = 2; ctx.strokeRect(0, 0, 470, 150);
      ctx.fillStyle = ORANGE; ctx.font = F.jp(30); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('新たな個体を確認', 18, 44);
      ctx.font = F.cond(22); ctx.fillStyle = '#c9a88a'; ctx.fillText('NUEVOS INDIVIDUOS DETECTADOS', 18, 74);
      ctx.font = F.mono(52); ctx.fillStyle = Math.floor(t * 6) % 2 ? RED : WHITE;
      ctx.fillText(n ? String(n).padStart(3, '0') : '∞', 18, 132);
      ctx.restore();
    },
  };
}

return { Anime, SHOTS, SUBS, DURATION, FPS, shotAt, PODS, LASER_EXP, SQUAD_EXP };
})();
