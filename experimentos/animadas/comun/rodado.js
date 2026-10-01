// "Grabado con el móvil": a partir de la foto final de una pieza analógica, cada fotograma
// simula una toma real: pulso de cámara en mano (movimiento suave con ruido), un acercamiento
// lento, luz de ventana con sombras de hojas que se mueven con el aire y grano nuevo en cada fotograma.
// Uso: al final de la pieza, en vez de listo(): rodar({ ... }); listo();
function rodar({ fuente = "c", mano = 1, empuje = 0.05, hojas = 1, ventana = [0.62, 0.32], calidez = 1, grano = 0.035, semilla = 9 } = {}) {
  const src = document.getElementById(fuente);
  const W0 = src.width, H0 = src.height;
  const base = document.createElement("canvas"); base.width = W0; base.height = H0;
  base.getContext("2d").drawImage(src, 0, 0);
  const v = document.createElement("canvas"); v.className = "full"; v.width = W0; v.height = H0;
  src.after(v); src.style.visibility = "hidden";
  const g = v.getContext("2d");
  const n = makeNoise(semilla);
  // mapa de luz a baja resolución (se amplía con suavizado: las sombras de hojas salen blandas)
  const LW = 120, LH = 150;
  const luz = document.createElement("canvas"); luz.width = LW; luz.height = LH;
  const lg = luz.getContext("2d");
  const li = lg.createImageData(LW, LH);
  // grano: unas cuantas teselas de ruido que se van alternando
  const teselas = [];
  const rg = rng(semilla);
  for (let k = 0; k < 6; k++) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const x = c.getContext("2d"), d = x.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) { const val = 128 + A.gauss(rg) * 60; d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = val; d.data[i * 4 + 3] = 255; }
    x.putImageData(d, 0, 0);
    teselas.push(g.createPattern(c, "repeat"));
  }
  const suave = (t, f, s) => n(t * f + s, s * 3.1, 2) - 0.5;
  window.pintar = (t) => {
    // cámara: pulso de mano + acercamiento lento
    const z = 1 + empuje * (t / 10) + 0.012 * mano;
    const dx = suave(t, 0.6, 1) * 14 * mano + suave(t, 2.3, 7) * 2 * mano;
    const dy = suave(t, 0.5, 4) * 12 * mano + suave(t, 2.1, 9) * 2 * mano;
    const rot = suave(t, 0.4, 2) * 0.006 * mano;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    g.fillStyle = "#000"; g.fillRect(0, 0, W0, H0);
    g.translate(W0 / 2 + dx, H0 / 2 + dy); g.rotate(rot); g.scale(z, z); g.translate(-W0 / 2, -H0 / 2);
    g.imageSmoothingQuality = "high";
    g.drawImage(base, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // luz: una mancha de sol de ventana que se desplaza muy despacio, recortada por hojas que se mecen
    const [vx, vy] = ventana;
    const viento = Math.sin(t * 0.9) * 0.5 + Math.sin(t * 2.3) * 0.2;
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const u = x / LW, w = y / LH;
      const sx = u - vx - t * 0.006, sy = w - vy;
      const sol = Math.max(0, 1 - Math.hypot(sx * 1.3 + sy * 0.4, sy * 1.1 - sx * 0.3) / 0.62);
      let s = Math.min(1, sol * 1.8);
      if (hojas) {
        const h = n(u * 5 + viento * 0.12 + t * 0.03, w * 5 - viento * 0.05, 3);
        const h2 = n(u * 13 + 40 + viento * 0.3, w * 13 + t * 0.05, 2);
        s *= 1 - hojas * Math.min(1, Math.max(0, (h * 0.75 + h2 * 0.35 - 0.48) * 3.2));
      }
      const k = (y * LW + x) * 4;
      // sombra: tono frío; sol: blanco
      li.data[k] = 178 + 77 * s; li.data[k + 1] = 176 + 79 * s; li.data[k + 2] = 190 + 65 * s; li.data[k + 3] = 255;
    }
    lg.putImageData(li, 0, 0);
    g.globalCompositeOperation = "multiply";
    g.imageSmoothingEnabled = true;
    g.drawImage(luz, 0, 0, W0, H0);
    // el sol calienta un poco donde da
    g.globalCompositeOperation = "soft-light";
    g.globalAlpha = 0.35 * calidez;
    g.fillStyle = "#ffb060";
    g.drawImage(luz, 0, 0, W0, H0);
    g.globalAlpha = 0.08 * calidez;
    g.fillRect(0, 0, W0, H0);
    // grano de este fotograma
    g.globalCompositeOperation = "overlay";
    g.globalAlpha = grano * 5;
    const p = teselas[Math.floor(t * 24) % teselas.length];
    g.save(); g.translate((t * 977) % 256, (t * 613) % 256); g.fillStyle = p; g.fillRect(-256, -256, W0 + 512, H0 + 512); g.restore();
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  };
}
