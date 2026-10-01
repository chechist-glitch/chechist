// Versión para vídeo del motor de acumulación de imagenes/assets/gl.js.
// Mismo contrato de shader (vec3 muestra(vec2 px), rnd(), uRes, uMuestra) más un uniform uT (segundos).
// Dos modos:
//   converge: la escena está quieta y el vídeo enseña cómo se calcula la luz. Cada fotograma suma
//             muestras al acumulador, así que la imagen pasa de ruido puro a limpia. El primer pase
//             se ve llegar por franjas, como los "tiles" de un render de verdad.
//   anima:    la escena se mueve (usa uT). Cada fotograma se calcula desde cero con `porFotograma` muestras.
// `escala` reduce la resolución interna para ir más rápido. Expone window.pintar(t) para grabar.mjs.
function trazarVideo({ canvasId = "c", escala = 1, frag, modo = "converge", muestras = 200, porFotograma = 4, franjas = 10, expo = 1, vineta = 0.35, grano = 0.03, tono = true, curva = (t) => Math.pow(Math.min(1, t / 9), 2.2), aviso = null }) {
  // escala < 1 calcula menos píxeles (el lienzo se sigue viendo a 1080×1350 por CSS)
  const W = Math.round(1080 * escala), H = Math.round(1350 * escala);
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
  const cab = GL_CABECERA.replace("uniform float uMuestra;", "uniform float uMuestra;\nuniform float uT;");
  const pEscena = programa(cab + frag + GL_PIE);
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
  const uRes = gl.getUniformLocation(pEscena, "uRes"), uM = gl.getUniformLocation(pEscena, "uMuestra"), uT = gl.getUniformLocation(pEscena, "uT");
  const alto = Math.ceil(H / franjas);
  let hechas = 0, franjaHecha = 0;
  const limpia = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    hechas = 0; franjaHecha = 0;
  };
  limpia();
  const pasada = async (m, t, desde = 0, hasta = franjas) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.useProgram(pEscena);
    atrib(pEscena);
    gl.uniform2f(uRes, W, H);
    gl.uniform1f(uM, m);
    gl.uniform1f(uT, t);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.viewport(0, 0, W, H);
    gl.enable(gl.SCISSOR_TEST);
    for (let f = desde; f < hasta; f++) {
      // de arriba abajo, como un render por cubos
      gl.scissor(0, H - (f + 1) * alto, W, alto);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, H - (f + 1) * alto, 1, 1, gl.RGBA, gl.FLOAT, new Float32Array(4));
      await new Promise((r) => setTimeout(r, 0));
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
  };
  const final = (n) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(pFinal);
    atrib(pFinal);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(pFinal, "uAcum"), 0);
    gl.uniform1f(gl.getUniformLocation(pFinal, "uN"), Math.max(1, n));
    gl.uniform2f(gl.getUniformLocation(pFinal, "uRes"), W, H);
    gl.uniform1f(gl.getUniformLocation(pFinal, "uExpo"), expo);
    gl.uniform1f(gl.getUniformLocation(pFinal, "uVineta"), vineta);
    gl.uniform1f(gl.getUniformLocation(pFinal, "uGrano"), grano);
    gl.uniform1i(gl.getUniformLocation(pFinal, "uTono"), tono ? 1 : 0);
    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  };
  const prueba = new URLSearchParams(location.search).get("m");
  if (prueba) { muestras = Math.min(muestras, +prueba); porFotograma = Math.min(porFotograma, +prueba); }
  window.pintar = async (t) => {
    if (modo === "anima") {
      limpia();
      for (let m = 0; m < porFotograma; m++) await pasada(m + Math.floor(t * 1000) * 7, t);
      final(porFotograma);
    } else {
      // primer pase: franjas que van entrando durante el primer segundo y medio
      const franjasYa = Math.min(franjas, Math.ceil((t / 1.5) * franjas));
      if (hechas === 0 && franjaHecha < franjasYa) { await pasada(0, 0, franjaHecha, franjasYa); franjaHecha = franjasYa; if (franjaHecha === franjas) hechas = 1; }
      const objetivo = hechas >= 1 ? Math.max(1, Math.round(1 + (muestras - 1) * curva(t))) : 0;
      while (hechas < objetivo) await pasada(hechas++, 0);
      final(Math.max(1, hechas));
      if (aviso) aviso(hechas, franjaHecha);
    }
  };
}
