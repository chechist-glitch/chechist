// El SVG se construye solo: cada elemento entra en su orden (el del documento). Las líneas y
// contornos sin relleno se trazan como con un rotulador; las formas rellenas aparecen con un pequeño
// rebote desde su centro; los textos se descubren de izquierda a derecha.
// Uso: tras montar el SVG, dibujarSVG(document.querySelector("svg")); listo();
function dibujarSVG(svg, { t0 = 0.2, t1 = 7.5, dur = 0.6, max = 900 } = {}) {
  const sel = "path, line, polyline, polygon, circle, rect, ellipse, text, use, image";
  let els = [...svg.querySelectorAll(sel)].filter((e) => !e.closest("defs, clipPath, mask, pattern, marker, symbol, filter, linearGradient, radialGradient"));
  // si hay muchísimos, se agrupan por su padre para que no tarde una eternidad
  if (els.length > max) {
    const grupos = new Map();
    for (const e of els) { const k = e.parentNode; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); }
    els = [];
    for (const [g, hijos] of grupos) if (hijos.length > 40 && g !== svg) els.push(g); else els.push(...hijos);
  }
  const info = els.map((e) => {
    let bb = { x: 0, y: 0, width: 0, height: 0 };
    try { bb = e.getBBox(); } catch (_) {}
    const cs = getComputedStyle(e);
    const sinRelleno = (cs.fill === "none" || e.getAttribute("fill") === "none") && e.tagName !== "text" && e.tagName !== "g";
    let largo = 0;
    if (sinRelleno && e.getTotalLength) { try { largo = e.getTotalLength(); } catch (_) {} }
    const tf = e.getAttribute("transform") || "";
    return { e, bb, sinRelleno: sinRelleno && largo > 0, largo, tf, dash: e.getAttribute("stroke-dasharray") };
  });
  const N = info.length;
  const cl = (u) => Math.min(1, Math.max(0, u));
  const rebote = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2));
  window.pintar = (t) => {
    info.forEach((d, i) => {
      const ini = t0 + (t1 - t0) * (N > 1 ? i / (N - 1) : 0);
      const u = cl((t - ini) / dur);
      const e = d.e;
      if (u >= 1) { e.style.opacity = ""; e.style.strokeDasharray = d.dash || ""; e.style.strokeDashoffset = ""; e.style.clipPath = ""; if (!d.sinRelleno && e.tagName !== "text") e.setAttribute("transform", d.tf); return; }
      if (u <= 0) { e.style.opacity = "0"; return; }
      e.style.opacity = "";
      if (d.sinRelleno && !d.dash) {
        e.style.strokeDasharray = `${d.largo} ${d.largo}`;
        e.style.strokeDashoffset = `${d.largo * (1 - u)}`;
      } else if (e.tagName === "text") {
        e.style.clipPath = `inset(-20% ${100 - 100 * u}% -20% -20%)`;
      } else {
        const cx = d.bb.x + d.bb.width / 2, cy = d.bb.y + d.bb.height / 2, k = rebote(u);
        e.setAttribute("transform", `${d.tf} translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`);
        e.style.opacity = String(cl(u * 3));
      }
    });
  };
}
