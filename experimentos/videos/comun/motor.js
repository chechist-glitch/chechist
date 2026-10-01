// Motor de vídeo con shaders (WebGL2): cada fotograma se calcula con varias muestras
// con jitter y se promedia (antialias y desenfoque de lente), y luego se aplica tono y grano.
// El shader de cada vídeo define:  vec3 muestra(vec2 px)
// y puede usar uT (segundos), uRes, uMuestra, rnd(), rnd2() y los uniformes que se le pasen.

const MOTOR_CABECERA = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform float uT;
uniform float uMuestra;
uniform float uFotograma;
out vec4 fragColor;
uint hs;
float rnd() {
  hs = hs * 747796405u + 2891336453u;
  uint w = ((hs >> ((hs >> 28u) + 4u)) ^ hs) * 277803737u;
  return float((w >> 22u) ^ w) / 4294967295.0;
}
vec2 rnd2() { return vec2(rnd(), rnd()); }
const float PI = 3.14159265359;
`;
const MOTOR_PIE = `
void main() {
  hs = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uint(uMuestra) * 26699u + uint(uFotograma) * 104729u | 1u;
  rnd(); rnd();
  vec2 px = gl_FragCoord.xy + rnd2() - 0.5;
  vec3 c = muestra(px);
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  fragColor = vec4(c, 1.0);
}`;
const MOTOR_FINAL = `#version 300 es
precision highp float;
uniform sampler2D uAcum;
uniform float uN, uExpo, uGrano, uFotograma;
uniform int uTono;
out vec4 fragColor;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 c = texelFetch(uAcum, ivec2(gl_FragCoord.xy), 0).rgb / uN * uExpo;
  if (uTono == 1) c = aces(c);
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  c += (h12(gl_FragCoord.xy + uFotograma * 17.31) - 0.5) * uGrano;
  fragColor = vec4(c, 1.0);
}`;

function crearMotor({ canvas, frag, muestras = 2, expo = 1, grano = 0.02, tono = true, uniformes = [] }) {
  const W = canvas.width, H = canvas.height;
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false });
  gl.getExtension("EXT_color_buffer_float");
  const compila = (tipo, src) => {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const programa = (fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, compila(gl.VERTEX_SHADER, `#version 300 es
      in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`));
    gl.attachShader(p, compila(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  };
  const pE = programa(MOTOR_CABECERA + uniformes.map((u) => `uniform ${u};\n`).join("") + frag + MOTOR_PIE);
  const pF = programa(MOTOR_FINAL);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const atrib = (p) => { const l = gl.getAttribLocation(p, "p"); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); };
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const loc = (p, n) => gl.getUniformLocation(p, n);

  // pinta el fotograma del instante t; extra = { nombre: valor | [valores] }
  return async function pintar(t, fotograma = 0, extra = {}, franjas = 4) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(pE);
    atrib(pE);
    gl.uniform2f(loc(pE, "uRes"), W, H);
    gl.uniform1f(loc(pE, "uT"), t);
    gl.uniform1f(loc(pE, "uFotograma"), fotograma);
    for (const [k, v] of Object.entries(extra)) {
      const l = loc(pE, k);
      if (!l) continue;
      const a = [].concat(v);
      [gl.uniform1f, gl.uniform2f, gl.uniform3f, gl.uniform4f][a.length - 1].call(gl, l, ...a);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.SCISSOR_TEST);
    const alto = Math.ceil(H / franjas);
    for (let m = 0; m < muestras; m++) {
      gl.uniform1f(loc(pE, "uMuestra"), m);
      for (let f = 0; f < franjas; f++) {
        gl.scissor(0, f * alto, W, alto);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.readPixels(0, f * alto, 1, 1, gl.RGBA, gl.FLOAT, new Float32Array(4));
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(pF);
    atrib(pF);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc(pF, "uAcum"), 0);
    gl.uniform1f(loc(pF, "uN"), muestras);
    gl.uniform1f(loc(pF, "uExpo"), expo);
    gl.uniform1f(loc(pF, "uGrano"), grano);
    gl.uniform1f(loc(pF, "uFotograma"), fotograma);
    gl.uniform1i(loc(pF, "uTono"), tono ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  };
}

window.addEventListener("error", (e) => { window.__error = String(e.message); });
window.addEventListener("unhandledrejection", (e) => { window.__error = String((e.reason && e.reason.message) || e.reason); });
