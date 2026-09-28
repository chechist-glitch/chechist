// Motor de acumulación para shaders (WebGL2).
// El shader de cada pieza define:  vec3 muestra(vec2 px)
// y puede usar rnd() (azar por píxel y muestra), uRes y uMuestra.
// Se renderiza `muestras` veces por franjas, se promedia en un buffer float
// y al final se aplica tonemapping, gamma, viñeta y grano.

const GL_CABECERA = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform float uMuestra;
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

const GL_PIE = `
void main() {
  hs = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uint(uMuestra) * 26699u | 1u;
  rnd(); rnd();
  vec2 px = gl_FragCoord.xy + rnd2() - 0.5;
  vec3 c = muestra(px);
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  fragColor = vec4(c, 1.0);
}`;

const GL_FINAL = `#version 300 es
precision highp float;
uniform sampler2D uAcum;
uniform float uN;
uniform vec2 uRes;
uniform float uExpo;
uniform float uVineta;
uniform float uGrano;
uniform int uTono;
out vec4 fragColor;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uAcum, uv).rgb / uN * uExpo;
  if (uTono == 1) c = aces(c);
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  vec2 q = uv - 0.5;
  c *= 1.0 - uVineta * dot(q, q) * 2.2;
  c += (h12(gl_FragCoord.xy) - 0.5) * uGrano;
  fragColor = vec4(c, 1.0);
}`;

async function trazar({ canvasId = "c", frag, muestras = 16, franjas = 6, expo = 1, vineta = 0.35, grano = 0.03, tono = true }) {
  const prueba = new URLSearchParams(location.search).get("m");
  if (prueba) muestras = Number(prueba);
  const canvas = document.getElementById(canvasId);
  canvas.width = W;
  canvas.height = H;
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
  const pEscena = programa(GL_CABECERA + frag + GL_PIE);
  const pFinal = programa(GL_FINAL);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const atrib = (p) => {
    const l = gl.getAttribLocation(p, "p");
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
  };

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(pEscena);
  atrib(pEscena);
  gl.uniform2f(gl.getUniformLocation(pEscena, "uRes"), W, H);
  const uM = gl.getUniformLocation(pEscena, "uMuestra");
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.viewport(0, 0, W, H);
  gl.enable(gl.SCISSOR_TEST);
  const alto = Math.ceil(H / franjas);
  const px = new Uint8Array(4);
  const t0 = performance.now();
  for (let m = 0; m < muestras; m++) {
    gl.uniform1f(uM, m);
    for (let f = 0; f < franjas; f++) {
      gl.scissor(0, f * alto, W, alto);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, f * alto, 1, 1, gl.RGBA, gl.FLOAT, new Float32Array(4));
      await new Promise((r) => setTimeout(r, 0));
    }
    window.__progreso = `${m + 1}/${muestras} · ${((performance.now() - t0) / 1000).toFixed(1)} s`;
  }
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(pFinal);
  atrib(pFinal);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(gl.getUniformLocation(pFinal, "uAcum"), 0);
  gl.uniform1f(gl.getUniformLocation(pFinal, "uN"), muestras);
  gl.uniform2f(gl.getUniformLocation(pFinal, "uRes"), W, H);
  gl.uniform1f(gl.getUniformLocation(pFinal, "uExpo"), expo);
  gl.uniform1f(gl.getUniformLocation(pFinal, "uVineta"), vineta);
  gl.uniform1f(gl.getUniformLocation(pFinal, "uGrano"), grano);
  gl.uniform1i(gl.getUniformLocation(pFinal, "uTono"), tono ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  window.__tiempo = ((performance.now() - t0) / 1000).toFixed(1);
}
