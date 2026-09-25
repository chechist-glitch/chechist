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

/* --------------------------------------------------------- datos fijos -- */
// Misiles del ataque (en coordenadas de mundo). Blanco: puntos del cuerpo del gigante.
const ATTACK_RIG = { bPos: [0, 19.1, -40], bYaw: 0, bScale: 3.4 };
const MISSILES = Array.from({ length: 10 }, (_, i) => {
  const side = i % 2 ? 1 : -1;
  const L = [side * (10 + hash(i * 3.1) * 20), 0.4 + hash(i) * 1.5, -18 + hash(i * 5.7) * 10];
  const targetsLocal = [[0, -2, 0.85], [0.8, -1.6, 0.45], [-0.8, -1.6, 0.45], [0, -0.35, 0.95], [0.45, -0.45, 0.8], [-0.45, -0.45, 0.8], [0, -2.6, 0.9], [0.3, 0.6, 0.7]];
  const tl = targetsLocal[i % targetsLocal.length];
  const T = toWorld(ATTACK_RIG, add(tl, [(hash(i * 9.1) - 0.5) * 0.3, (hash(i * 2.3) - 0.5) * 0.3, 0]));
  const t0 = 0.12 + i * 0.1 + hash(i * 4.4) * 0.08;
  const dur = 1.05 + hash(i * 6.6) * 0.55;
  const C1 = add(L, [side * -2 * hash(i + 2), 7 + hash(i + 7) * 5, -6 - hash(i + 3) * 6]);
  const C2 = add(T, [side * (6 + hash(i + 11) * 8), -2 + hash(i + 13) * 6, 10 + hash(i + 17) * 6]);
  return { L, C1, C2, T, t0, dur, hit: t0 + dur };
});
const bez = (m, s) => {
  const u = 1 - s;
  return add(add(mul(m.L, u * u * u), mul(m.C1, 3 * u * u * s)), add(mul(m.C2, 3 * u * s * s), mul(m.T, s * s * s)));
};

/* ----------------------------------------------------------------- guion -- */
const MOON_SEA = norm([-0.075, 0.1, -1]);
const MOON_CITY = norm([-0.3, 0.36, -1]);
const MOON_HEAD = norm(add(sub([0, 19.1, -55], [-1.75, 1.55, 11]), [0, 2.4, 0]));
const RAISE_CAM = t => ({ pos: lerp3([7.5, 0.6, 12], [6.6, 0.8, 10.5], ease(t / 3.5)), tar: lerp3([-1.5, 15.5, -31], [-2.6, 18.6, -30], ease(t / 1.6)), fl: 1.7, roll: 0.03 });
const RAISE_RIG = { bPos: [0, 19.1, -32], bYaw: 0, bScale: 3.4 };
const RAISE_TIP_UP = [-1.3, 1.25, 0.8];
const MOON_RAISE = norm(add(sub(toWorld(RAISE_RIG, RAISE_TIP_UP), RAISE_CAM(1.6).pos), [0, 0.9, 0]));
const TOUCH_TIP = [-1.1, -3.6, 1.6];
const TOUCH_BPOS = sub([0, 0, 0], mul(TOUCH_TIP, 3.4));
const EARTH_IMPACT = mul(norm([0.35, 0.42, 0.84]), 10);

const SHOTS = [
  /* ---------------------------------------------------------------- 0 */
  { name: 'intro', dur: 3.75 },
  /* ---------------------------------------------------------------- 1 */
  {
    name: 'sea', dur: 6.0, prog: 'SEA', twos: false, pfl: 0.8,
    cam: t => ({ pos: lerp3([1.8, 0.55, 14], [1.0, 0.8, 10], ease(t / 6)), tar: [0, lerp(1.8, 4.0, ease((t - 0.8) / 5.2)), -38], fl: 3.0, roll: -0.02 }),
    rig: t => baseRig({ bPos: [0, lerp(-4.4, 4.4, ease((t - 0.9) / 5.0)), -38], bScale: 3.4, head: [0.05, 0.14, 0.03], face: [-0.07, -0.06, 0, 0.14], eyeGlow: 0, gaze: [0, 1, 10] }),
    light: t => ({
      keyDir: MOON_SEA, keyCol: [0.9, 0.2, 0.13], shadowCol: [0.03, 0.045, 0.1], rimDir: MOON_SEA, rimCol: [1, 0.32, 0.2], rimW: 0.5,
      fogCol: [0.05, 0.007, 0.012], zenith: [0.002, 0.002, 0.005], fogK: 0.004, moonDir: MOON_SEA, moonR: 0.1, flashL: lightning(t, [1.25, 3.75]),
    }),
    scene: t => ({ uWet: 1 }),
    comp: t => ({ rain: 0.6, spray: ss(1, 1.6, t) * (1 - ss(4.5, 5.5, t)) * 0.6 }),
    fx: (ctx, t, cam, rig, E) => {
      for (const [t0, x0, x1] of [[1.25, 0.2, 0.33], [3.75, 0.86, 0.72]]) {
        const f = lightning(t, [t0]);
        if (f > 0) E.bolt(ctx, x0, x1, 0.62, f, Math.floor(t0 * 10));
      }
    },
    post: (t, cam, asp) => ({ raysPos: projectDir(cam, MOON_SEA, asp).uv, raysAmt: 0.3, zoom: 1 + 0.14 * easeIn((t - 5.55) / 0.45) }),
  },
  /* ---------------------------------------------------------------- 2 */
  {
    name: 'eyes', dur: 2.75, prog: 'EYES', twos: true, pfl: 0.4,
    cam: t => ({ pos: lerp3([0, -0.05, 2.2], [0, -0.04, 2.6], ease((t - 0.3) / 2.45)), tar: [0, -0.07, 0], fl: 2.0, roll: 0 }),
    rig: (t, cam) => baseRig({
      face: [kf(t, [[0.25, -0.07], [0.33, 0.125], [0.6, 0.085]]), kf(t, [[0.25, -0.06], [0.33, -0.135], [0.6, -0.12]]), 0, kf(t, [[0.25, 0.5], [0.7, 0.09]])],
      eyeGlow: kf(t, [[0.24, 0], [0.27, 2.4], [1.2, 0.9]]), gaze: [0, -0.05, 60],
    }),
    light: t => ({
      keyDir: norm([0.2, 1, 0.5]), keyCol: [0.06, 0.09, 0.2], shadowCol: [0.012, 0.016, 0.04], fillCol: [0.02, 0.03, 0.07], eyeLight: 0.35, rimDir: norm([0, 0.3, -1]), rimCol: [0.6, 0.1, 0.08], rimW: 0.7,
      termCol: [0.15, 0.02, 0.08], fogCol: [0.012, 0.003, 0.006], zenith: [0.001, 0.001, 0.003],
    }),
    scene: t => ({ uWet: 0.7 }),
    comp: (t, cam, rig, asp) => {
      const k = kf(t, [[0.24, 0], [0.27, 2.2], [1.2, 0.35]]);
      return { flares: eyesWorld(rig).map(e => project(cam, e, asp)).filter(Boolean).map(p => [p.x, p.y, 0.7, k]) };
    },
    post: t => {
      const f = Math.floor((t - 0.25) * FPS);
      return {
        impact: f === 0 ? 1 : f === 1 ? 2 : f === 2 ? 1 : 0,
        speed: t > 0.25 && t < 1.1 ? 1 - ss(0.6, 1.1, t) : 0,
        shake: t > 0.25 ? shake(t, 0.012 * Math.exp(-(t - 0.25) * 3)) : [0, 0],
        zoom: t > 0.25 ? 1 + 0.1 * Math.exp(-(t - 0.25) * 6) : 1,
        bloom: 0.8,
      };
    },
  },
  /* ---------------------------------------------------------------- 3 */
  {
    name: 'city', dur: 5.0, prog: 'CITY', twos: false,
    cam: t => { const k = ease(t / 5); return { pos: lerp3([-7, 1.3, 12], [3.5, 1.8, 10], k), tar: [0, 12.5, -55], fl: 1.7, roll: lerp(0.02, -0.015, k) }; },
    rig: (t, cam) => baseRig({ bPos: [0, 19.1, -55], bScale: 3.4, head: [lerp(0.35, 0.04, ease(t / 4)), 0.13, 0.02], face: [0.07, -0.12, 0, 0.12], eyeGlow: 1.3, gaze: cam.pos }),
    light: t => ({
      keyDir: MOON_HEAD, keyCol: [0.8, 0.16, 0.12], shadowCol: [0.035, 0.05, 0.12], rimDir: MOON_HEAD, rimCol: [1, 0.3, 0.2], rimW: 0.4, fillCol: [0.06, 0.08, 0.18],
      fogCol: [0.07, 0.01, 0.016], haze: [0.05, 0.008, 0.014], zenith: [0.002, 0.002, 0.006], fogK: 0.006, moonDir: MOON_HEAD, moonR: 0.075, cityBox: [0, -8, 32, 28],
    }),
    comp: (t, cam, rig, asp) => ({ ash: 0.25, flares: eyesWorld(rig).map(e => project(cam, e, asp)).filter(Boolean).map(p => [p.x, p.y, 0.45, 1.1]) }),
    overlay: (ctx, t, cam, rig, E) => E.hudCity(ctx, t, cam, rig),
    post: (t, cam, asp) => ({ raysPos: projectDir(cam, MOON_HEAD, asp).uv, raysAmt: 0.35, lineFog: 0.012 }),
  },
  /* ---------------------------------------------------------------- 4 */
  {
    name: 'attack', dur: 3.75, prog: 'ATTACK', twos: true,
    cam: t => ({ pos: lerp3([4.5, 1.1, 8], [3.6, 1.4, 6.5], ease(t / 3.75)), tar: [0, 17, -40], fl: 1.6, roll: 0.05 }),
    rig: (t, cam) => baseRig(Object.assign({}, ATTACK_RIG, { head: [0.08, 0.2, 0], face: [0.075, -0.12, 0, 0.1], eyeGlow: 1.35, gaze: cam.pos })),
    light: t => ({
      keyDir: MOON_CITY, keyCol: [0.75, 0.15, 0.1], shadowCol: [0.035, 0.05, 0.12], rimDir: MOON_CITY, rimCol: [1, 0.3, 0.2], rimW: 0.55,
      fogCol: [0.13, 0.02, 0.03], zenith: [0.004, 0.003, 0.01], fogK: 0.005, moonDir: MOON_CITY, moonR: 0.075,
    }),
    scene: t => {
      const hits = MISSILES.filter(m => t > m.hit).sort((a, b) => b.hit - a.hit).slice(0, 4);
      const xl = [];
      for (let i = 0; i < 4; i++) { const m = hits[i]; xl.push(...(m ? [...m.T, 3.2 * Math.exp(-(t - m.hit) * 2.2)] : [0, 0, 0, 0])); }
      return { uXL: { t: 'v4a', v: xl } };
    },
    comp: (t, cam, rig, asp) => {
      const exp = [];
      for (const m of MISSILES) {
        const age = (t - m.hit) / 1.5;
        if (age < 0 || age > 1) continue;
        const p = project(cam, m.T, asp);
        if (p) exp.push([p.x, p.y, 3.0 / p.z * cam.fl, age]);
      }
      return { exp: exp.slice(-12), flares: eyesWorld(rig).map(e => project(cam, e, asp)).filter(Boolean).map(p => [p.x, p.y, 0.5, 1.2]), ash: 0.2 };
    },
    fx: (ctx, t, cam, rig, E) => { E.jets(ctx, t, cam); E.trails(ctx, t, cam); },
    overlay: (ctx, t, cam, rig, E) => { if (t > 2.55) E.alert(ctx, t - 2.55, '攻撃無効', 'ATAQUE INEFICAZ'); },
    post: t => {
      let sk = 0;
      for (const m of MISSILES) if (t > m.hit) sk = Math.max(sk, Math.exp(-(t - m.hit) * 7));
      return { shake: shake(t, 0.006 * sk), lineFog: 0.008 };
    },
  },
  /* ---------------------------------------------------------------- 5 */
  {
    name: 'raise', dur: 3.5, prog: 'RAISE', twos: true,
    cam: RAISE_CAM,
    rig: (t, cam) => {
      const D = { tip: [-1.2, -4.3, 0.75], f: [-0.05, -1, 0.3], p: [1, 0, 0.2] };
      const U = { tip: RAISE_TIP_UP, f: [0.05, 1, 0.1], p: [0.25, -0.1, 1] };
      const Sx = { tip: [-0.95, -0.55, 2.55], f: [0.05, -0.35, 1], p: [0.2, -1, -0.3] };
      let tip, f, p;
      if (t < 1.3) {
        const k = t < 0.25 ? -0.06 * Math.sin(t / 0.25 * Math.PI) : easeOutBack((t - 0.25) / 1.05, 1.3);
        tip = add(lerp3(D.tip, U.tip, k), mul([-0.7, 0, 0.6], Math.sin(Math.PI * clamp(k)) * 0.9));
        f = norm(lerp3(D.f, U.f, clamp(k))); p = norm(lerp3(D.p, U.p, clamp(k)));
      } else if (t < 3.1) {
        tip = add(U.tip, [0.02 * noise1(t * 20), 0.02 * noise1(t * 23 + 3), 0]); f = U.f; p = U.p;
      } else {
        const k = easeIn((t - 3.1) / 0.28);
        tip = lerp3(U.tip, Sx.tip, k); f = norm(lerp3(U.f, Sx.f, k)); p = norm(lerp3(U.p, Sx.p, k));
      }
      return baseRig(Object.assign({}, RAISE_RIG, {
        head: [0.1, 0.22, 0], face: [0.08, -0.12, 0, 0.09], eyeGlow: 1.4, gaze: cam.pos,
        armR: arm(1, tip, f, p, 1, [-1, -0.6, -0.4]),
        tipGlow: kf(t, [[1.3, 0], [1.6, 0.8], [3.0, 3.0], [3.1, 4.2], [3.5, 2.5]]),
      }));
    },
    light: t => ({
      keyDir: MOON_RAISE, keyCol: [0.85, 0.17, 0.12], shadowCol: [0.03, 0.045, 0.11], rimDir: MOON_RAISE, rimCol: [1, 0.35, 0.22], rimW: 0.5,
      fogCol: [0.1, 0.016, 0.025], zenith: [0.003, 0.002, 0.008], moonDir: MOON_RAISE, moonR: 0.12,
    }),
    comp: (t, cam, rig, asp) => {
      const tipW = toWorld(rig, rig.armR.tip);
      const tp = project(cam, tipW, asp);
      const out = { flares: eyesWorld(rig).map(e => project(cam, e, asp)).filter(Boolean).map(p => [p.x, p.y, 0.5, 1.2]) };
      if (tp) {
        out.charge = [tp.x, tp.y, 0.55, ss(1.4, 1.9, t) * (1 - ss(3.1, 3.2, t))];
        out.flares.push([tp.x, tp.y, 0.55, rig.tipGlow * 0.7], [tp.x, tp.y, 0.3, -rig.tipGlow * 0.4]);
      }
      return out;
    },
    fx: (ctx, t, cam, rig, E) => {
      if (t > 2.0 && t < 3.1) {
        const tp = project(cam, toWorld(rig, rig.armR.tip), 16 / 9);
        if (tp) E.arcs(ctx, tp, t);
      }
    },
    post: (t, cam, asp) => ({
      raysPos: projectDir(cam, MOON_RAISE, asp).uv, raysAmt: 0.5,
      speed: t > 3.1 ? 1 : 0, speedDark: 1, speedPos: [0.45, 0.62],
      zoom: t > 3.1 ? 1 + 0.12 * easeIn((t - 3.1) / 0.3) : 1,
      shake: t > 2.2 && t < 3.1 ? shake(t, 0.002 + 0.004 * ss(2.2, 3.1, t)) : [0, 0],
      fade: 1 - ss(3.36, 3.42, t),
    }),
  },
  /* ---------------------------------------------------------------- 6 */
  {
    name: 'touch', dur: 2.75, prog: 'TOUCH', twos: true,
    cam: t => ({ pos: kf(t, [[0, [5.4, 3.3, 9]], [0.25, [5.2, 3.2, 8.6]], [0.75, [10.5, 7.5, 16]], [2.75, [12.5, 9, 20]]], easeOut), tar: kf(t, [[0.25, [0, 2.3, -0.4]], [0.75, [0, 1.2, 0]]], easeOut), fl: 1.35, roll: -0.04 }),
    rig: t => {
      const k = easeIn(t / 0.25);
      const tip = add(TOUCH_TIP, [0, 1.4 * (1 - k) - (t > 0.25 ? 0.015 : 0), -0.5 * (1 - k)]);
      return baseRig({
        bPos: TOUCH_BPOS, bScale: 3.4, eyeGlow: 0,
        armR: arm(1, tip, [0.1, -1, 0.25], [-0.9, 0, -0.3], 1, [-1, 0.5, -0.5]),
        tipGlow: t < 0.25 ? 1.2 : 1.0,
      });
    },
    light: t => {
      const hit = t > 0.25 ? 1 : 0;
      return {
        keyDir: hit ? norm([-0.25, -0.6, 0.45]) : MOON_CITY, keyCol: hit ? [1, 0.55, 0.25] : [0.8, 0.16, 0.12],
        shadowCol: hit ? [0.12, 0.03, 0.04] : [0.035, 0.05, 0.12], rimDir: MOON_CITY, rimCol: [1, 0.4, 0.2], rimW: 0.38, fillCol: [0.14, 0.19, 0.4],
        fogCol: hit ? [0.3, 0.06, 0.03] : [0.13, 0.02, 0.03], zenith: [0.004, 0.003, 0.01], fogK: 0.012, moonDir: MOON_CITY, moonR: 0.075,
      };
    },
    scene: t => {
      const a = t - 0.25;
      if (a < 0) return { uFx: [0, 0, 0, 0] };
      const R = 9 * easeOut(a / 2.3), ring = 14 * easeOut(a / 1.8);
      return {
        uDome: [0, 0, 0, R],
        uFx: [kf(a, [[0, 0], [0.05, 1.6], [0.8, 1.0], [2.5, 0.55]]), ring, kf(a, [[0, 0], [0.1, 1.2], [2.5, 0.6]]), kf(a, [[0.03, 0], [0.15, 1.8], [1.2, 0.9], [2.5, 0.3]])],
        uDestroy: [0, 0, ring * 0.92, 1],
        uXL: { t: 'v4a', v: [0, 1.5, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      };
    },
    comp: (t, cam, rig, asp) => {
      const c = project(cam, [0, 0.2, 0], asp);
      const a = t - 0.25;
      const out = { flares: [] };
      if (a < 0) { const tp = project(cam, toWorld(rig, rig.armR.tip), asp); if (tp) out.flares.push([tp.x, tp.y, 0.4, 1.4]); return out; }
      out.debris = [c.x, c.y, a * 1.3, 1 - ss(1.4, 2.4, a)];
      out.flares.push([c.x, c.y, 1.6, -kf(a, [[0, 5], [0.4, 2], [2.5, 0.8]])]);
      out.ash = ss(0.8, 1.6, a) * 0.6;
      return out;
    },
    post: (t, cam, asp) => {
      const a = t - 0.25, f = Math.floor(a * FPS);
      const c = project(cam, [0, 0.2, 0], asp);
      return {
        impact: f >= 0 && f < 5 ? [1, 2, 3, 1, 2][f] : 0,
        flash: f >= 5 && f < 9 ? [0.9, 0.6, 0.35, 0.15][f - 5] : 0,
        speed: a > 0.2 && a < 1.1 ? 1 - ss(0.7, 1.1, a) : 0, speedPos: c ? c.uv : [0.5, 0.5],
        shake: a > 0 ? shake(t, 0.022 * Math.exp(-a * 1.6)) : [0, 0],
        ca: a > 0 ? 0.004 * Math.exp(-a * 2) + 0.0015 : 0.0015,
        lineFog: 0.01, bloom: 1.1,
      };
    },
  },
  /* ---------------------------------------------------------------- 7 */
  {
    name: 'earth', dur: 2.5, prog: 'EARTH', twos: true,
    cam: t => ({ pos: lerp3([0, 7, 36], [0, 6, 32], ease(t / 2.5)), tar: [0, 1.5, 0], fl: 1.45, roll: 0.05 }),
    rig: () => baseRig({ eyeGlow: 0 }),
    light: () => ({ moonDir: norm([-0.75, 0.3, -1]), moonR: 0.06 }),
    scene: t => ({ uEarth: [0.06 + 1.25 * easeOut(t / 2.5), 0.05 + t * 1.3, Math.exp(-t * 1.1), 0] }),
    comp: (t, cam, rig, asp) => { const p = project(cam, EARTH_IMPACT, asp); return { flares: p ? [[p.x, p.y, 1.3, -kf(t, [[0, 4], [0.8, 1.2], [2.5, 0.4]])]] : [] }; },
    overlay: (ctx, t, cam, rig, E) => E.alert(ctx, t, '地殻崩壊', 'COLAPSO DE LA CORTEZA TERRESTRE'),
    post: t => ({ flash: t < 1 / 24 ? 0.6 : 0, shake: shake(t, 0.006 * Math.exp(-t * 2)), lineFog: 0, normTh: 0.5 }),
  },
  /* ---------------------------------------------------------------- 8 */
  {
    name: 'horde', dur: 5.0, prog: 'HORDE', twos: true,
    cam: t => ({ pos: lerp3([0, 1.4, 20], [0, 1.8, 13.5], ease(t / 5)), tar: [0, 11, -80], fl: 1.55, roll: 0 }),
    rig: (t, cam) => baseRig({ head: [0, 0.12, 0], face: [0.07, -0.12, 0, 0.1], eyeGlow: 1.5, gaze: cam.pos }),
    light: t => ({
      keyDir: norm([0, 0.25, -1]), keyCol: [0.9, 0.3, 0.09], shadowCol: [0.03, 0.035, 0.08], rimDir: norm([0, 0.25, -1]), rimCol: [1, 0.45, 0.2], rimW: 0.5,
      termCol: [0.3, 0.05, 0.05], fogCol: [0.38, 0.07, 0.03], haze: [0.07, 0.014, 0.012], zenith: [0.01, 0.004, 0.006], fogK: 0.004, cityBox: [0, -5, 40, 28], moonDir: norm([-0.5, 0.42, -1]), moonR: 0.07, moonCol: [1, 0.3, 0.12],
    }),
    comp: (t, cam, rig, asp) => {
      const fl = [];
      for (const [x, z, s, yaw] of HORDE.slice(0, 4)) {
        const bp = [x, 5.62 * s, z], R = rotY(yaw);
        for (const ex of [0.3, -0.3]) { const p = project(cam, add(bp, m3v(R, mul([ex, -0.05, 0.9], s))), asp); if (p) fl.push([p.x, p.y, 0.35, 1.3]); }
      }
      return { ash: 0.8, embers: 0.8, flares: fl };
    },
    overlay: (ctx, t, cam, rig, E) => E.count(ctx, t),
    post: t => ({ lineFog: 0.006, grade: [1.0, 1.08, 1.12, 0.03] }),
  },
  /* ---------------------------------------------------------------- 9 */
  {
    name: 'smile', dur: 2.5, prog: 'SMILE', twos: true,
    cam: t => ({ pos: lerp3([0, -0.66, 3.9], [0, -0.58, 3.3], ease(t / 2.5)), tar: [0, -0.32, 0], fl: 1.9, roll: 0 }),
    rig: (t, cam) => baseRig({
      head: [0, -0.06, 0],
      face: [kf(t, [[0, 0.07], [1.6, 0.025]], ease), kf(t, [[0, -0.12], [1.6, -0.085]], ease), kf(t, [[0.35, 0], [1.7, 1]], ease), kf(t, [[0, 0.13], [1.5, 0.06]])],
      eyeGlow: kf(t, [[0, 1.3], [2.0, 1.5], [2.15, 4.5]]), gaze: cam.pos,
    }),
    light: t => ({
      keyDir: norm([0, -1, 0.06]), keyCol: [0.6, 0.1, 0.05], shadowCol: [0.012, 0.016, 0.04], fillCol: [0.03, 0.045, 0.11], eyeLight: 0.35, rimDir: norm([0.3, 0.6, -1]), rimCol: [0.35, 0.45, 1], rimW: 0.6,
      termCol: [0.4, 0.03, 0.1], fogCol: [0.02, 0.004, 0.006], zenith: [0.002, 0.001, 0.003],
    }),
    comp: (t, cam, rig, asp) => ({ embers: 0.35, flares: eyesWorld(rig).map(e => project(cam, e, asp)).filter(Boolean).map(p => [p.x, p.y, 0.5, kf(t, [[0, 0.4], [2.0, 0.7], [2.2, 3.5]])]) }),
    post: t => ({ flash: kf(t, [[2.05, 0], [2.2, 0.9], [2.4, 1]]), flashCol: [1, 0.85, 0.8], fade: 1 - ss(2.4, 2.45, t) }),
  },
  /* --------------------------------------------------------------- 10 */
  { name: 'title', dur: 5.0 },
];
let _acc = 0;
for (const s of SHOTS) { s.start = _acc; _acc += s.dur; }
const DURATION = _acc;
const shotAt = t => { for (let i = SHOTS.length - 1; i >= 0; i--) if (t >= SHOTS[i].start) return SHOTS[i]; return SHOTS[0]; };

const SUBS = [
  [0.5, 1.9, 'Tras mil años de sueño...'],
  [2.0, 3.55, '...los Niños de Azul despiertan.'],
  [4.1, 6.4, 'Cayeron del cielo hace mil años.'],
  [6.7, 9.35, 'Y esperaron bajo el mar.'],
  [10.3, 12.3, 'Hasta hoy.'],
  [18.0, 20.9, 'Ningún arma humana puede herirlos.'],
  [21.6, 24.3, 'Pero basta con que uno nos toque...'],
  [25.35, 29.6, '...para que el mundo se rompa.'],
  [30.4, 32.5, 'No vienen a conquistarnos.'],
  [32.7, 34.8, 'Vienen a jugar.'],
];

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
    if (override) { shot = SHOTS.find(s => s.name === override.shot) || shot; lt = override.lt; t = shot.start + lt; }
    const frame = Math.floor(t * FPS + 1e-4);
    const sf = Math.round(shot.start * FPS), lf = frame - sf;
    const slf = shot.twos ? lf - (lf % 2) : lf;
    const st = override ? lt : Math.max(0, (sf + slf) / FPS - shot.start);
    let cam3 = null, rig3 = null, hasScene = 0;
    const post = Object.assign({
      zoom: 1, shake: [0, 0], impact: 0, speed: 0, speedDark: 0, speedPos: [0.5, 0.5], flash: 0, flashCol: [1, 1, 1], fade: 1,
      raysAmt: 0, raysPos: [0.5, 0.5], raysLen: 0.85, bloom: 0.6, ca: 0.0015, grade: [1.0, 1.05, 1.12, 0.02], lineCol: [0.02, 0.012, 0.03],
      lineW: 1, lineFog: 0.003, normTh: 0.12,
    });
    if (shot.prog) {
      hasScene = 1;
      cam3 = (override && override.cam) ? Object.assign({ roll: 0 }, override.cam) : shot.cam(st);
      if (this.H > this.W) { cam3.fl *= shot.pfl || 0.62; if (shot.pcam) Object.assign(cam3, shot.pcam(st, cam3)); }
      cam3.b = camBasis(cam3);
      rig3 = shot.rig(st, cam3);
      const L = Object.assign({}, LIGHT0, shot.light ? shot.light(st, cam3) : {});
      if (shot.post) Object.assign(post, shot.post(lt, cam3, asp));
      const key = shot.name + ':' + slf + (override ? ':' + lt : '');
      if (key !== this.lastKey) {
        const B = rotY(rig3.bYaw), R = rig3.armR, Lr = rig3.armL;
        const U = {
          uRes: [fb.mrt.w, fb.mrt.h], uT: st, uG: shot.start + st,
          uCamPos: cam3.pos, uCamTar: cam3.tar, uCamFl: cam3.fl, uCamRoll: cam3.roll || 0,
          uBPos: rig3.bPos, uBRot: M3(B), uBScale: rig3.bScale, uHeadRot: M3(euler(...rig3.head)), uFace: rig3.face,
          uGaze: rig3.gaze, uEyeGlow: rig3.eyeGlow,
          uArmR: V3A([...R.sh, ...R.el, ...R.wr]), uHandR: M3(R.hand), uArmL: V3A([...Lr.sh, ...Lr.el, ...Lr.wr]), uHandL: M3(Lr.hand),
          uPoint: [R.point, Lr.point], uTip: [...toWorld(rig3, R.tip), rig3.tipGlow],
          uKeyDir: norm(L.keyDir), uKeyCol: L.keyCol, uShadowCol: L.shadowCol, uRimDir: norm(L.rimDir), uRimCol: L.rimCol, uRimW: L.rimW,
          uTermCol: L.termCol, uFogCol: L.fogCol, uHaze: L.haze || L.fogCol, uZenith: L.zenith, uFogK: L.fogK, uMoonDir: norm(L.moonDir), uMoonCol: L.moonCol, uMoonR: L.moonR,
          uFlashL: L.flashL, uFillDir: norm(L.fillDir), uFillCol: L.fillCol, uEyeLight: L.eyeLight, uCityBox: L.cityBox, uXL: V4A(new Array(16).fill(0)), uDome: [0, 0, 0, 0], uFx: [0, 0, 0, 0], uDestroy: [0, 0, 0, 0], uWet: 0, uEarth: [0, 0, 0, 0],
        };
        if (shot.scene) Object.assign(U, shot.scene(st, cam3, rig3));
        this.pass(this.progs[shot.prog], fb.mrt, U, {});
        this.pass(P.LINES, fb.lines, { uTexel: [1 / fb.mrt.w, 1 / fb.mrt.h], uLineFog: post.lineFog, uLineW: post.lineW, uNormTh: post.normTh }, { uND: fb.mrt.nd });
        this.lastKey = key;
      }
      // capa 2D de efectos (en unos: cada fotograma)
      const fx = this.fxx;
      fx.clearRect(0, 0, this.sw, this.sh);
      if (shot.fx) shot.fx(fx, lt, cam3, rig3, FX(this.sw, this.sh, frame));
      this.upload(this.fxTex, this.fxc);
      const C = Object.assign({ rain: 0, ash: 0, embers: 0, spray: 0, exp: [], flares: [], charge: [0, 0, 0, 0], debris: [0, 0, 0, 0] }, shot.comp ? shot.comp(lt, cam3, rig3, asp) : {});
      const expArr = new Array(48).fill(0); C.exp.slice(0, 12).forEach((e, i) => expArr.splice(i * 4, 4, ...e));
      const flArr = new Array(32).fill(0); C.flares.slice(0, 8).forEach((e, i) => flArr.splice(i * 4, 4, ...e));
      this.pass(P.COMP, fb.comp, {
        uRes: [fb.comp.w, fb.comp.h], uG: t, uFrame: frame, uExp: V4A(expArr), uExpN: I1(Math.min(C.exp.length, 12)),
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
      uRaysAmt: post.raysAmt, uBloom: post.bloom, uCA: post.ca, uHasScene: hasScene, uLineCol: post.lineCol, uGrade: post.grade,
    }, { uComp: fb.comp.tex, uLine: fb.lines.tex, uB1: fb.b1a.tex, uB2: fb.b2a.tex, uB3: fb.b3a.tex, uRays: fb.rays.tex, uOverlay: this.ovTex });
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
    trails(ctx, t, cam) {
      const asp = W / H;
      for (const m of MISSILES) {
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

return { Anime, SHOTS, SUBS, DURATION, FPS, shotAt, MISSILES };
})();
