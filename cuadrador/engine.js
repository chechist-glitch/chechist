/*
 * Cuadrador de carteles · motor de procesado
 *
 * Pasa un cartel vertical (u horizontal) a formato cuadrado sin IA generativa:
 *   1. Modela el fondo liso del cartel (degradados, franja del título…).
 *   2. Detecta cada elemento (piezas, logo, título, sello) y lo recorta con
 *      su reflejo y su sombra. Las zonas sólidas se copian píxel a píxel; los
 *      bordes suaves y los reflejos se guardan como transparencia calculada
 *      contra el fondo, así encajan sobre cualquier zona del fondo nuevo.
 *   3. Estira el fondo al cuadrado y recoloca los elementos encima.
 *
 * Todo es determinista: las piezas no se redibujan ni se reescalan.
 * Funciona en navegador (script clásico) y en un Web Worker.
 */
(function (root) {
  'use strict';

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* ------------------------------------------------------------------ */
  /* Operaciones básicas de imagen                                       */
  /* ------------------------------------------------------------------ */

  // Desenfoque de caja separable (bordes replicados). r en píxeles.
  function boxBlur(src, W, H, r) {
    r = Math.round(r);
    if (r < 1) return Float32Array.from(src);
    var tmp = new Float32Array(W * H), out = new Float32Array(W * H);
    var inv = 1 / (2 * r + 1), x, y, o, acc, k;
    for (y = 0; y < H; y++) {
      o = y * W;
      acc = 0;
      for (k = -r; k <= r; k++) acc += src[o + clamp(k, 0, W - 1)];
      for (x = 0; x < W; x++) {
        tmp[o + x] = acc * inv;
        acc += src[o + Math.min(x + r + 1, W - 1)] - src[o + Math.max(x - r, 0)];
      }
    }
    var col = new Float64Array(W);
    for (x = 0; x < W; x++) {
      acc = 0;
      for (k = -r; k <= r; k++) acc += tmp[clamp(k, 0, H - 1) * W + x];
      col[x] = acc;
    }
    for (y = 0; y < H; y++) {
      o = y * W;
      var ya = Math.min(y + r + 1, H - 1) * W, yr = Math.max(y - r, 0) * W;
      for (x = 0; x < W; x++) {
        out[o + x] = col[x] * inv;
        col[x] += tmp[ya + x] - tmp[yr + x];
      }
    }
    return out;
  }

  // Transformada de distancia euclídea exacta (Felzenszwalb–Huttenlocher).
  // Devuelve, para cada píxel, la distancia al píxel marcado más cercano.
  function edt(mask, W, H) {
    var INF = 1e20, n = Math.max(W, H);
    var f = new Float64Array(n), d = new Float64Array(n);
    var v = new Int32Array(n), z = new Float64Array(n + 1);
    var grid = new Float32Array(W * H), i, x, y;
    for (i = 0; i < W * H; i++) grid[i] = mask[i] ? 0 : INF;
    for (x = 0; x < W; x++) {
      for (y = 0; y < H; y++) f[y] = grid[y * W + x];
      dt1d(f, H, d, v, z);
      for (y = 0; y < H; y++) grid[y * W + x] = d[y];
    }
    for (y = 0; y < H; y++) {
      var o = y * W;
      for (x = 0; x < W; x++) f[x] = grid[o + x];
      dt1d(f, W, d, v, z);
      for (x = 0; x < W; x++) grid[o + x] = Math.sqrt(d[x]);
    }
    return grid;
  }

  function dt1d(f, n, d, v, z) {
    var k = 0, q, s;
    v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (q = 1; q < n; q++) {
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  }

  // Dilatación con un cuadrado de radio r (dos pasadas con conteo en ventana).
  function dilate(mask, W, H, r) {
    r = Math.max(0, Math.round(r));
    if (!r) return Uint8Array.from(mask);
    var tmp = new Uint8Array(W * H), out = new Uint8Array(W * H), x, y, o, cnt;
    for (y = 0; y < H; y++) {
      o = y * W; cnt = 0;
      for (x = 0; x <= r && x < W; x++) cnt += mask[o + x];
      for (x = 0; x < W; x++) {
        tmp[o + x] = cnt > 0 ? 1 : 0;
        if (x + r + 1 < W) cnt += mask[o + x + r + 1];
        if (x - r >= 0) cnt -= mask[o + x - r];
      }
    }
    var col = new Int32Array(W);
    for (y = 0; y <= r && y < H; y++) for (x = 0; x < W; x++) col[x] += tmp[y * W + x];
    for (y = 0; y < H; y++) {
      o = y * W;
      var add = y + r + 1 < H ? (y + r + 1) * W : -1, sub = y - r >= 0 ? (y - r) * W : -1;
      for (x = 0; x < W; x++) {
        out[o + x] = col[x] > 0 ? 1 : 0;
        if (add >= 0) col[x] += tmp[add + x];
        if (sub >= 0) col[x] -= tmp[sub + x];
      }
    }
    return out;
  }

  // Componentes conexas (8-vecindad). Etiquetas desde 1.
  function labelComponents(mask, W, H) {
    var N = W * H, labels = new Int32Array(N), stack = new Int32Array(N);
    var count = 0;
    for (var s = 0; s < N; s++) {
      if (!mask[s] || labels[s]) continue;
      count++;
      var sp = 0;
      stack[sp++] = s;
      labels[s] = count;
      while (sp) {
        var p = stack[--sp], px = p % W, py = (p - px) / W;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = py + dy;
          if (yy < 0 || yy >= H) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = px + dx;
            if (xx < 0 || xx >= W) continue;
            var q = yy * W + xx;
            if (mask[q] && !labels[q]) { labels[q] = count; stack[sp++] = q; }
          }
        }
      }
    }
    return { labels: labels, count: count };
  }

  function removeSmall(mask, W, H, minArea) {
    var cc = labelComponents(mask, W, H), area = new Int32Array(cc.count + 1), i;
    for (i = 0; i < mask.length; i++) if (cc.labels[i]) area[cc.labels[i]]++;
    for (i = 0; i < mask.length; i++) if (cc.labels[i] && area[cc.labels[i]] < minArea) mask[i] = 0;
    return mask;
  }

  // Mediana aproximada (histograma de enteros 0..255).
  function median255(arr) {
    var h = new Uint32Array(256), i;
    for (i = 0; i < arr.length; i++) h[clamp(Math.round(arr[i]), 0, 255)]++;
    var half = arr.length / 2, acc = 0;
    for (i = 0; i < 256; i++) { acc += h[i]; if (acc >= half) return i; }
    return 255;
  }

  /* ------------------------------------------------------------------ */
  /* Relleno de fondo por pirámide ("push-pull")                          */
  /* ------------------------------------------------------------------ */

  // Filtro [1 2 1]/4 en cada eje y diezmado a la mitad (separable).
  function down2(src, W, H, nW, nH) {
    var tmp = new Float32Array(nW * H), out = new Float32Array(nW * nH), x, y, i, j;
    for (y = 0; y < H; y++) {
      var o = y * W, t = y * nW;
      for (i = 0; i < nW; i++) {
        var c = 2 * i, l = c > 0 ? c - 1 : 0, r = c + 1 < W ? c + 1 : W - 1, m = c < W ? c : W - 1;
        tmp[t + i] = (src[o + l] + 2 * src[o + m] + src[o + r]) * 0.25;
      }
    }
    for (j = 0; j < nH; j++) {
      var cy = 2 * j, u0 = (cy > 0 ? cy - 1 : 0) * nW, u1 = (cy < H ? cy : H - 1) * nW, u2 = (cy + 1 < H ? cy + 1 : H - 1) * nW;
      var oo = j * nW;
      for (x = 0; x < nW; x++) out[oo + x] = (tmp[u0 + x] + 2 * tmp[u1 + x] + tmp[u2 + x]) * 0.25;
    }
    return out;
  }

  // Bilineal: el píxel grueso i está centrado en el fino 2i.
  function up2(src, cW, cH, fW, fH) {
    var out = new Float32Array(fW * fH), x;
    var X0 = new Int32Array(fW), X1 = new Int32Array(fW), TX = new Float32Array(fW);
    for (x = 0; x < fW; x++) {
      var x0 = Math.min(x >> 1, cW - 1);
      X0[x] = x0; X1[x] = Math.min(x0 + 1, cW - 1); TX[x] = (x & 1) && x0 + 1 < cW ? 0.5 : 0;
    }
    for (var y = 0; y < fH; y++) {
      var y0 = Math.min(y >> 1, cH - 1), y1 = Math.min(y0 + 1, cH - 1), ty = (y & 1) && y0 + 1 < cH ? 0.5 : 0;
      var r0 = y0 * cW, r1 = y1 * cW, o = y * fW;
      for (x = 0; x < fW; x++) {
        var a = src[r0 + X0[x]], b = src[r1 + X0[x]], t = TX[x];
        if (t) { a = (a + src[r0 + X1[x]]) * 0.5; b = (b + src[r1 + X1[x]]) * 0.5; }
        out[o + x] = ty ? (a + b) * 0.5 : a;
      }
    }
    return out;
  }

  // Rellena los huecos (w = 0) de los planos interpolando suavemente desde
  // lo que rodea. Con minLevel = 0 respeta exactamente los píxeles con w = 1.
  function pushPull(planes, w, W, H, minLevel) {
    var nc = planes.length, levels = [], lw = W, lh = H, c, i;
    var s = [];
    for (c = 0; c < nc; c++) {
      var p = new Float32Array(W * H);
      for (i = 0; i < p.length; i++) p[i] = planes[c][i] * w[i];
      s.push(p);
    }
    var ww = Float32Array.from(w);
    levels.push({ W: lw, H: lh, s: s, w: ww });
    while (lw > 1 || lh > 1) {
      var nw = Math.ceil(lw / 2), nh = Math.ceil(lh / 2), ns = [];
      for (c = 0; c < nc; c++) ns.push(down2(s[c], lw, lh, nw, nh));
      ww = down2(ww, lw, lh, nw, nh);
      s = ns; lw = nw; lh = nh;
      levels.push({ W: lw, H: lh, s: s, w: ww });
    }
    var top = levels[levels.length - 1], est = [];
    for (c = 0; c < nc; c++) {
      var e = new Float32Array(top.s[c].length);
      for (i = 0; i < e.length; i++) e[i] = top.w[i] > 1e-9 ? top.s[c][i] / top.w[i] : 0;
      est.push(e);
    }
    for (var li = levels.length - 2; li >= minLevel; li--) {
      var L = levels[li], C = levels[li + 1], thr = li === 0 ? 1 : 0.5, next = [];
      for (c = 0; c < nc; c++) {
        var up = up2(est[c], C.W, C.H, L.W, L.H), sc = L.s[c];
        for (i = 0; i < up.length; i++) {
          var wv = L.w[i];
          if (wv > 1e-9) {
            var a = Math.min(1, wv / thr);
            up[i] = a * (sc[i] / wv) + (1 - a) * up[i];
          }
        }
        next.push(up);
      }
      est = next;
    }
    // Si paramos antes del nivel 0, subimos a resolución completa.
    for (var lj = minLevel - 1; lj >= 0; lj--) {
      for (c = 0; c < nc; c++) est[c] = up2(est[c], levels[lj + 1].W, levels[lj + 1].H, levels[lj].W, levels[lj].H);
    }
    return est;
  }

  /* ------------------------------------------------------------------ */
  /* Crecimiento de regiones (distancia chaflán anisótropa con etiquetas) */
  /* ------------------------------------------------------------------ */

  // Distancia chaflán desde las semillas con costes por dirección, dentro de
  // una ventana. Bajar es barato (los reflejos caen hacia abajo); subir, caro.
  function chamfer(seed, W, H, c) {
    var N = W * H, INF = 0x3fffffff, dist = new Int32Array(N), i;
    for (i = 0; i < N; i++) dist[i] = seed[i] ? 0 : INF;
    for (var it = 0; it < 2; it++) {
      var x, y, d, j, v;
      for (y = 0; y < H; y++) {
        for (x = 0; x < W; x++) {
          i = y * W + x; d = dist[i];
          if (y > 0) {
            j = i - W;
            v = dist[j] + c.down; if (v < d) d = v;
            if (x > 0) { v = dist[j - 1] + c.downDiag; if (v < d) d = v; }
            if (x < W - 1) { v = dist[j + 1] + c.downDiag; if (v < d) d = v; }
          }
          if (x > 0) { v = dist[i - 1] + c.side; if (v < d) d = v; }
          dist[i] = d;
        }
      }
      for (y = H - 1; y >= 0; y--) {
        for (x = W - 1; x >= 0; x--) {
          i = y * W + x; d = dist[i];
          if (y < H - 1) {
            j = i + W;
            v = dist[j] + c.up; if (v < d) d = v;
            if (x > 0) { v = dist[j - 1] + c.upDiag; if (v < d) d = v; }
            if (x < W - 1) { v = dist[j + 1] + c.upDiag; if (v < d) d = v; }
          }
          if (x < W - 1) { v = dist[i + 1] + c.side; if (v < d) d = v; }
          dist[i] = d;
        }
      }
    }
    return dist;
  }

  // Piezas: alcance completo hacia abajo (reflejo), 1/8 a los lados y 1/20
  // hacia arriba, con un margen mínimo alrededor para el antialias.
  var PIECE_COSTS = { down: 5, side: 40, up: 100 };
  var GRAPHIC_COSTS = { down: 10, side: 10, up: 10 };

  function costsFor(base, limit, minMargin) {
    var side = Math.max(1, Math.round(Math.min(base.side, limit / minMargin)));
    var up = Math.max(1, Math.round(Math.min(base.up, limit / minMargin)));
    var down = base.down;
    return {
      down: down, side: side, up: up,
      downDiag: Math.round(Math.hypot(down, side)),
      upDiag: Math.round(Math.hypot(up, side))
    };
  }

  /* ------------------------------------------------------------------ */
  /* Relleno del fondo bajo los elementos                                */
  /* ------------------------------------------------------------------ */

  // Relleno de los huecos del fondo. Dos estimaciones:
  //  - 2D suave (pirámide) corregida fila a fila con lo que se ve a los
  //    lados del hueco: buena para degradados y rayos de luz;
  //  - interpolación pura por filas: la única que respeta franjas
  //    horizontales con bordes nítidos (la del título).
  // Cerca de un borde horizontal fuerte se usa la segunda; lejos, la primera.
  function fillBackground(planes, w, W, H, u) {
    var Cp = pushPull(planes, w, W, H, 4), K = Math.max(3, Math.round(4 * u)), search = Math.round(16 * u);
    var lam = rowBlend(planes, w, W, H, u), side = { sumI: 0, sumC: 0, n: 0 };
    var out = [];
    for (var c = 0; c < planes.length; c++) {
      var I = planes[c], C = Cp[c], B = new Float32Array(W * H);
      for (var y = 0; y < H; y++) {
        var o = y * W, x = 0, ly = lam[y];
        while (x < W) {
          if (w[o + x] >= 0.99) { x++; continue; }
          var xa = x;
          while (x < W && w[o + x] < 0.99) x++;
          var xb = x - 1;
          var nl = sideMeans(I, C, w, o, xa - 1, -1, K, search, W, side), il = side.sumI, cl = side.sumC;
          var nr = sideMeans(I, C, w, o, xb + 1, 1, K, search, W, side), ir = side.sumI, cr = side.sumC;
          if (!nl && !nr) continue;
          if (!nl) { il = ir; cl = cr; }
          if (!nr) { ir = il; cr = cl; }
          var len = xb - xa + 1;
          for (var xi = xa; xi <= xb; xi++) {
            var t = (xi - xa + 1) / (len + 1);
            var rowI = il + (ir - il) * t, rowC = cl + (cr - cl) * t;
            var twoD = C[o + xi] + (rowI - rowC);
            C[o + xi] = ly * twoD + (1 - ly) * rowI;
          }
        }
      }
      for (var i = 0; i < W * H; i++) B[i] = w[i] * I[i] + (1 - w[i]) * C[i];
      out.push(B);
    }
    return out;
  }

  // Medias de original y relleno en K píxeles de fondo limpio junto al hueco.
  function sideMeans(I, C, w, o, start, dir, K, search, W, res) {
    var si = 0, sc = 0, n = 0, x = start, steps = 0;
    while (x >= 0 && x < W && n < K && steps < search + K) {
      if (w[o + x] >= 0.99) { si += I[o + x]; sc += C[o + x]; n++; }
      x += dir; steps++;
    }
    res.sumI = n ? si / n : 0;
    res.sumC = n ? sc / n : 0;
    return n;
  }

  // Peso por fila: 0 cerca de bordes horizontales fuertes del fondo (se
  // rellena por filas), 1 lejos de ellos (relleno 2D).
  function rowBlend(planes, w, W, H, u) {
    var prof = new Float32Array(H), has = new Uint8Array(H), y, x;
    for (y = 0; y < H; y++) {
      var s = 0, n = 0, o = y * W;
      for (x = 0; x < W; x++) {
        if (w[o + x] >= 0.99) { s += planes[0][o + x] + planes[1][o + x] + planes[2][o + x]; n++; }
      }
      if (n > W * 0.05) { prof[y] = s / (3 * n); has[y] = 1; }
    }
    var last = -1;
    for (y = 0; y < H; y++) {
      if (has[y]) {
        if (last >= 0 && y - last > 1) for (var k = last + 1; k < y; k++) prof[k] = prof[last] + (prof[y] - prof[last]) * (k - last) / (y - last);
        else if (last < 0) for (k = 0; k < y; k++) prof[k] = prof[y];
        last = y;
      }
    }
    if (last >= 0) for (y = last + 1; y < H; y++) prof[y] = prof[last];
    var strong = new Uint8Array(H), step = Math.max(1, Math.round(2 * u));
    for (y = step; y < H - step; y++) {
      if (Math.abs(prof[y + step] - prof[y - step]) / (2 * step) > 1.0) strong[y] = 1;
    }
    var near = dilate(strong, 1, H, 60 * u), f = new Float32Array(H);
    for (y = 0; y < H; y++) f[y] = near[y] ? 0 : 1;
    return boxBlur(f, 1, H, Math.max(1, Math.round(10 * u)));
  }

  /* ------------------------------------------------------------------ */
  /* Análisis                                                            */
  /* ------------------------------------------------------------------ */

  var DEFAULTS = {
    coreThr: 24,      // diferencia con el fondo (niveles) para considerar algo sólido
    softThr: 1.5,     // diferencia mínima para reflejos y sombras
    chromaThr: 1.5,   // tinte mínimo (en cualquier parte) para no tomarlo por fondo
    joinR: 2.5,       // une fragmentos a menos de esta distancia (px a 1600)
    minArea: 30,      // manchas más pequeñas se ignoran (px² a 1600)
    minPartArea: 500, // partes más pequeñas se pegan a la pieza más cercana
    ringR: 1.5,       // anillo de borde antialias que va con la pieza
    graphicReach: 16, // margen alrededor de logo/título/sello
    graphicGap: 30,   // distancia para agrupar letras e iconos
    setGap: 45        // piezas gemelas más cerca que esto van juntas
  };

  function pieceReach(h, u) { return clamp(0.5 * h + 30 * u, 50 * u, 200 * u); }

  function analyze(rgba, W, H, options) {
    var P = Object.assign({}, DEFAULTS, options || {});
    var N = W * H, u = Math.max(W, H) / 1600, i, j;
    var R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
    var L = new Float32Array(N), C = new Float32Array(N);
    for (i = 0, j = 0; i < N; i++, j += 4) {
      var a = rgba[j + 3] / 255;
      var r = rgba[j] * a, g = rgba[j + 1] * a, b = rgba[j + 2] * a;
      R[i] = r; G[i] = g; B[i] = b;
      L[i] = (r + g + b) / 3;
      C[i] = Math.max(r, g, b) - Math.min(r, g, b);
    }
    var planes = [R, G, B];
    var Lmed = median255(L), Cmed = median255(C);
    var timings = {}, tick = now();
    var lap = function (name) { var t = now(); timings[name] = (timings[name] || 0) + t - tick; tick = t; };

    // 1) Primer modelo de fondo, muy suave: solo píxeles neutros y no muy
    //    claros (así ni las piezas ni sus reflejos rojizos cuentan como fondo).
    var w = new Float32Array(N);
    for (i = 0; i < N; i++) w[i] = (C[i] <= Cmed + 2.5 && L[i] <= Lmed + 30) ? 1 : 0;
    var noise = estimateNoise(L, w, W, H);
    var Bm = pushPull(planes, w, W, H, 5);
    lap('fondo0');

    // 2) Refinado: detectamos objetos y sus reflejos, los quitamos del
    //    muestreo y rellenamos el fondo por debajo. Donde no hay nada encima
    //    el fondo es el original, píxel a píxel.
    var core, fg, info;
    for (var it = 0; it < 3; it++) {
      var D = diffStats(planes, Bm, N);
      core = new Uint8Array(N);
      for (i = 0; i < N; i++) core[i] = D.max[i] > P.coreThr ? 1 : 0;
      removeSmall(core, W, H, P.minArea * u * u);
      lap('nucleo');
      if (it === 2) break;
      info = buildParts(core, planes, W, H, u, P);
      var reg = growRegions(info, W, H, u).inRegion;
      lap('regiones');
      var br = Math.max(1, Math.round(u));
      var maxB = boxBlur(D.max, W, H, br), chrB = boxBlur(D.chroma, W, H, br);
      var coreD = dilate(core, W, H, 2 * u);
      fg = new Uint8Array(N);
      for (i = 0; i < N; i++) {
        fg[i] = (coreD[i] || (reg[i] && maxB[i] > P.softThr) || chrB[i] > P.chromaThr) ? 1 : 0;
      }
      fg = dilate(fg, W, H, 3 * u);
      // Peso de muestreo: 0 dentro de la máscara y rampa suave hacia fuera.
      var hr = Math.max(1, Math.round(2 * u)), grown = dilate(fg, W, H, hr), gf = new Float32Array(N);
      for (i = 0; i < N; i++) gf[i] = grown[i];
      var soft = boxBlur(gf, W, H, hr);
      for (i = 0; i < N; i++) w[i] = fg[i] ? 0 : clamp(1 - soft[i], 0, 1);
      lap('mascara');
      Bm = fillBackground(planes, w, W, H, u);
      lap('fondo' + (it + 1));
    }

    // 3) Elementos definitivos y sus recortes.
    info = buildParts(core, planes, W, H, u, P);
    var regions = growRegions(info, W, H, u);
    lap('regiones');
    var ring = dilate(core, W, H, P.ringR * u);
    buildSprites(info, regions, planes, Bm, core, ring, W, H, u, P);
    lap('recortes');

    var groups = buildGroups(info.parts, W, H, u, P);
    return {
      W: W, H: H, u: u,
      bg: Bm,
      noise: clamp(noise, 0.3, 1.5),
      parts: info.parts,
      groups: groups,
      timings: timings
    };
  }

  function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

  // Grano del fondo: desviación robusta del detalle fino en zonas de fondo.
  function estimateNoise(L, w, W, H) {
    var sm = boxBlur(L, W, H, 1), hist = new Uint32Array(400), n = 0, i;
    for (i = 0; i < L.length; i += 3) {
      if (!w[i]) continue;
      var e = Math.abs(L[i] - sm[i]);
      hist[Math.min(399, Math.floor(e * 40))]++; n++;
    }
    if (!n) return 0.4;
    var acc = 0;
    for (i = 0; i < 400; i++) { acc += hist[i]; if (acc >= n / 2) break; }
    return 1.4826 * ((i + 0.5) / 40) / 0.943;
  }

  // Diferencia con el fondo: máxima por canal y "color" de la diferencia
  // (los reflejos rojizos se ven en esto aunque sean muy tenues).
  function diffStats(planes, Bm, N) {
    var mx = new Float32Array(N), ch = new Float32Array(N);
    var p0 = planes[0], p1 = planes[1], p2 = planes[2], b0 = Bm[0], b1 = Bm[1], b2 = Bm[2];
    for (var i = 0; i < N; i++) {
      var d0 = p0[i] - b0[i], d1 = p1[i] - b1[i], d2 = p2[i] - b2[i];
      var hi = d0 > d1 ? (d0 > d2 ? d0 : d2) : (d1 > d2 ? d1 : d2);
      var lo = d0 < d1 ? (d0 < d2 ? d0 : d2) : (d1 < d2 ? d1 : d2);
      mx[i] = hi > -lo ? hi : -lo;
      ch[i] = hi - lo;
    }
    return { max: mx, chroma: ch };
  }

  // Componentes sólidas → partes con estadísticas y tipo (pieza / gráfico).
  function buildParts(core, planes, W, H, u, P) {
    var joined = dilate(core, W, H, P.joinR * u);
    var cc = labelComponents(joined, W, H), n = cc.count, i;
    var st = [];
    for (i = 0; i <= n; i++) {
      st.push({ area: 0, x0: W, y0: H, x1: -1, y1: -1, white: 0, teal: 0, sr: 0, sg: 0, sb: 0 });
    }
    for (i = 0; i < core.length; i++) {
      if (!core[i]) continue;
      var l = cc.labels[i], s = st[l], x = i % W, y = (i - x) / W;
      var r = planes[0][i], g = planes[1][i], b = planes[2][i];
      s.area++;
      if (x < s.x0) s.x0 = x;
      if (x > s.x1) s.x1 = x;
      if (y < s.y0) s.y0 = y;
      if (y > s.y1) s.y1 = y;
      s.sr += r; s.sg += g; s.sb += b;
      var lum = (r + g + b) / 3, chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum > 165 && chroma < 40) s.white++;
      if (g - r > 25 && b - r > 15) s.teal++;
    }
    var parts = [], labelToPart = new Int32Array(n + 1);
    for (var k = 1; k <= n; k++) {
      var t = st[k];
      if (!t.area) continue;
      var graphic = (t.white + t.teal) / t.area > 0.5;
      var part = {
        id: parts.length,
        label: k,
        kind: graphic ? 'graphic' : 'piece',
        area: t.area,
        core: { x0: t.x0, y0: t.y0, x1: t.x1 + 1, y1: t.y1 + 1 },
        color: [t.sr / t.area, t.sg / t.area, t.sb / t.area]
      };
      part.reach = graphic ? P.graphicReach * u : pieceReach(part.core.y1 - part.core.y0, u);
      labelToPart[k] = parts.length + 1;
      parts.push(part);
    }
    // Semillas: índice de parte + 1 en los píxeles sólidos.
    var partOf = new Int32Array(core.length);
    for (i = 0; i < core.length; i++) if (core[i]) partOf[i] = labelToPart[cc.labels[i]];
    return { parts: parts, partOf: partOf };
  }

  // Asigna a cada parte su zona de influencia (su reflejo incluido). Cada
  // parte crece en su propia ventana; si dos zonas se pisan, gana la que
  // está relativamente más cerca.
  function growRegions(info, W, H, u) {
    var N = W * H, parts = info.parts;
    var owner = new Int32Array(N), norm = new Float32Array(N).fill(2), inRegion = new Uint8Array(N);
    parts.forEach(function (p, k) {
      var piece = p.kind === 'piece', base = piece ? PIECE_COSTS : GRAPHIC_COSTS;
      var limit = p.reach * (piece ? base.down : base.side);
      var c = costsFor(base, limit, 8 * u);
      var up = Math.ceil(limit / c.up), side = Math.ceil(limit / c.side), down = Math.ceil(limit / c.down);
      var x0 = Math.max(0, p.core.x0 - side), x1 = Math.min(W, p.core.x1 + side);
      var y0 = Math.max(0, p.core.y0 - up), y1 = Math.min(H, p.core.y1 + down);
      var ww = x1 - x0, hh = y1 - y0, seed = new Uint8Array(ww * hh), id = k + 1, x, y;
      for (y = 0; y < hh; y++) {
        var o = (y0 + y) * W + x0;
        for (x = 0; x < ww; x++) if (info.partOf[o + x] === id) seed[y * ww + x] = 1;
      }
      var dist = chamfer(seed, ww, hh, c);
      for (y = 0; y < hh; y++) {
        var oo = (y0 + y) * W + x0;
        for (x = 0; x < ww; x++) {
          var d = dist[y * ww + x];
          if (d > limit) continue;
          var n = d / limit, gi = oo + x;
          if (n < norm[gi]) { norm[gi] = n; owner[gi] = id; inRegion[gi] = 1; }
        }
      }
    });
    return { owner: owner, norm: norm, inRegion: inRegion };
  }

  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  // Recorte de cada parte en dos capas RGBA (alfa no premultiplicado):
  //  - core: píxeles sólidos (alfa 255, color original exacto) + borde.
  //  - soft: reflejos y sombras, con alfa mínimo respecto al fondo.
  function buildSprites(info, regions, planes, Bm, core, ring, W, H, u, P) {
    var parts = info.parts, N = W * H, i, k;
    var bb = [];
    for (k = 0; k < parts.length; k++) bb.push({ x0: W, y0: H, x1: -1, y1: -1 });
    for (i = 0; i < N; i++) {
      var o = regions.owner[i];
      if (!o) continue;
      var x = i % W, y = (i - x) / W, t = bb[o - 1];
      if (x < t.x0) t.x0 = x;
      if (x > t.x1) t.x1 = x;
      if (y < t.y0) t.y0 = y;
      if (y > t.y1) t.y1 = y;
    }
    var floorLv = 1.2;
    for (k = 0; k < parts.length; k++) {
      var p = parts[k], box = bb[k];
      var rw = box.x1 - box.x0 + 1, rh = box.y1 - box.y0 + 1;
      p.rect = { x: box.x0, y: box.y0, w: rw, h: rh };
      var coreImg = new Uint8ClampedArray(rw * rh * 4), soft = new Uint8ClampedArray(rw * rh * 4);
      var hit = new Uint8Array(rw * rh);
      var vis = { x0: W, y0: H, x1: -1, y1: -1 };
      for (var yy = 0; yy < rh; yy++) {
        for (var xx = 0; xx < rw; xx++) {
          var gx = box.x0 + xx, gy = box.y0 + yy, gi = gy * W + gx, li = yy * rw + xx, q = li * 4;
          if (regions.owner[gi] !== k + 1) continue;
          var visible = false;
          if (core[gi]) {
            coreImg[q] = planes[0][gi]; coreImg[q + 1] = planes[1][gi]; coreImg[q + 2] = planes[2][gi]; coreImg[q + 3] = 255;
            hit[li] = 1;
            visible = true;
          } else {
            var isRing = ring[gi] === 1, fl = isRing ? 0 : floorLv;
            var alpha = 0, dv = [0, 0, 0];
            for (var c = 0; c < 3; c++) {
              var bgv = Bm[c][gi], d = planes[c][gi] - bgv;
              d = d > 0 ? Math.max(0, d - fl) : Math.min(0, d + fl);
              dv[c] = d;
              var ac = d > 0 ? d / Math.max(1, 255 - bgv) : -d / Math.max(1, bgv);
              if (ac > alpha) alpha = ac;
            }
            if (alpha <= 0) continue;
            alpha = Math.min(1, alpha);
            var stored = isRing ? alpha : alpha * smoothstep((1 - regions.norm[gi]) / 0.35);
            var a8 = Math.round(stored * 255);
            if (a8 <= 0) continue;
            var target = isRing ? coreImg : soft;
            for (c = 0; c < 3; c++) target[q + c] = Bm[c][gi] + dv[c] / alpha;
            target[q + 3] = a8;
            if (isRing) hit[li] = 1;
            visible = stored > 0.04;
          }
          if (visible) {
            if (gx < vis.x0) vis.x0 = gx;
            if (gx > vis.x1) vis.x1 = gx;
            if (gy < vis.y0) vis.y0 = gy;
            if (gy > vis.y1) vis.y1 = gy;
          }
        }
      }
      p.coreImg = coreImg;
      p.soft = soft;
      p.hit = hit;
      p.vis = vis.x1 < 0 ? Object.assign({}, p.core) : { x0: vis.x0, y0: vis.y0, x1: vis.x1 + 1, y1: vis.y1 + 1 };
    }
  }

  /* ------------------------------------------------------------------ */
  /* Agrupación: letras → logo/título/sello; migas → su pieza; gemelas   */
  /* ------------------------------------------------------------------ */

  function boxGap(a, b) {
    var gx = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1));
    var gy = Math.max(0, Math.max(a.y0 - b.y1, b.y0 - a.y1));
    return { x: gx, y: gy, d: Math.hypot(gx, gy) };
  }

  function unionBox(boxes) {
    var o = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    boxes.forEach(function (b) {
      o.x0 = Math.min(o.x0, b.x0); o.y0 = Math.min(o.y0, b.y0);
      o.x1 = Math.max(o.x1, b.x1); o.y1 = Math.max(o.y1, b.y1);
    });
    return o;
  }

  function buildGroups(parts, W, H, u, P) {
    var n = parts.length, parent = [], i, j;
    for (i = 0; i < n; i++) parent.push(i);
    var find = function (x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    var join = function (a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; };

    // Gráficos cercanos forman un bloque (logo, título, sello…).
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        if (parts[i].kind !== 'graphic' || parts[j].kind !== 'graphic') continue;
        var g = boxGap(parts[i].core, parts[j].core);
        if (g.x <= P.graphicGap * u && g.y <= P.graphicGap * u) join(i, j);
      }
    }
    // Migas sueltas → pieza más cercana.
    var small = P.minPartArea * u * u;
    for (i = 0; i < n; i++) {
      if (parts[i].kind !== 'piece' || parts[i].area >= small) continue;
      var best = -1, bd = Infinity;
      for (j = 0; j < n; j++) {
        if (j === i || parts[j].kind !== 'piece' || parts[j].area < small) continue;
        var d = boxGap(parts[i].core, parts[j].core).d;
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) join(best, i);
    }
    // Piezas gemelas pegadas (p. ej. una pareja de apliques) van juntas.
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        var A = parts[i], Bp = parts[j];
        if (A.kind !== 'piece' || Bp.kind !== 'piece' || A.area < small || Bp.area < small) continue;
        var ha = A.core.y1 - A.core.y0, hb = Bp.core.y1 - Bp.core.y0;
        var wa = A.core.x1 - A.core.x0, wb = Bp.core.x1 - Bp.core.x0;
        var gg = boxGap(A.core, Bp.core);
        var overlapY = Math.min(A.core.y1, Bp.core.y1) - Math.max(A.core.y0, Bp.core.y0);
        if (gg.y === 0 && gg.x <= P.setGap * u && overlapY > 0.8 * Math.min(ha, hb) &&
            Math.min(ha, hb) / Math.max(ha, hb) > 0.8 && Math.min(wa, wb) / Math.max(wa, wb) > 0.6 &&
            Math.min(A.area, Bp.area) / Math.max(A.area, Bp.area) > 0.6) {
          join(i, j);
        }
      }
    }
    var map = {}, groups = [];
    for (i = 0; i < n; i++) {
      var r = find(i);
      if (!(r in map)) {
        map[r] = groups.length;
        groups.push({ id: groups.length, kind: parts[r].kind, parts: [] });
      }
      groups[map[r]].parts.push(i);
    }
    groups.forEach(function (gr) {
      gr.kind = gr.parts.some(function (k) { return parts[k].kind === 'piece'; }) ? 'piece' : 'graphic';
      gr.core = unionBox(gr.parts.map(function (k) { return parts[k].core; }));
      gr.vis = unionBox(gr.parts.map(function (k) { return parts[k].vis; }));
      gr.anchor = gr.kind === 'graphic' ? ((gr.core.y0 + gr.core.y1) / 2 < H / 2 ? 'top' : 'bottom') : null;
    });
    return groups;
  }

  /* ------------------------------------------------------------------ */
  /* Composición automática                                              */
  /* ------------------------------------------------------------------ */

  function squareSize(an) { return Math.max(an.W, an.H); }

  // Modo por defecto: si el cartel ya es casi cuadrado (4:5), abrir la
  // composición original queda natural; si es muy alargado, mejor en filas.
  function defaultMode(an) {
    return squareSize(an) / Math.min(an.W, an.H) <= 1.3 ? 'spread' : 'rows';
  }

  function describeGroup(an, partIds, idx) {
    var ps = partIds.map(function (k) { return an.parts[k]; });
    var kind = ps.some(function (p) { return p.kind === 'piece'; }) ? 'piece' : 'graphic';
    var core = unionBox(ps.map(function (p) { return p.core; }));
    var vis = unionBox(ps.map(function (p) { return p.vis; }));
    return {
      idx: idx, parts: partIds, kind: kind, core: core, vis: vis,
      anchor: kind === 'graphic' ? ((core.y0 + core.y1) / 2 < an.H / 2 ? 'top' : 'bottom') : null
    };
  }

  // Desplazamiento de los gráficos: centrados en horizontal, pegados arriba
  // o abajo según dónde estaban.
  function graphicPlacement(an, g, S) {
    return {
      tx: Math.round((S - an.W) / 2),
      ty: g.anchor === 'bottom' ? S - an.H : 0
    };
  }

  // Colocación automática. opts.groups: [{parts: [ids]}] (por defecto, los
  // grupos detectados). Devuelve un {tx, ty} por grupo, en el mismo orden.
  function layout(an, opts) {
    opts = opts || {};
    var S = opts.size || squareSize(an), u = an.u, W = an.W;
    var groups = (opts.groups || an.groups).map(function (g, i) { return describeGroup(an, g.parts, i); });
    var out = new Array(groups.length), pieces = [], header = [], footer = [];
    groups.forEach(function (g) {
      if (g.kind === 'graphic') {
        var pl = graphicPlacement(an, g, S);
        out[g.idx] = pl;
        var box = { x0: g.core.x0 + pl.tx, y0: g.core.y0 + pl.ty, x1: g.core.x1 + pl.tx, y1: g.core.y1 + pl.ty };
        (g.anchor === 'top' ? header : footer).push({ box: box, orig: g.core });
      } else {
        pieces.push(g);
      }
    });
    if (!pieces.length) return out;

    var pv = unionBox(pieces.map(function (g) { return g.vis; }));
    var margin = Math.max(Math.round(0.04 * S), Math.min(pv.x0, W - pv.x1, 60 * u));
    var headerBottom = header.length ? Math.max.apply(null, header.map(function (h) { return h.box.y1; })) : 0;
    var origHeaderBottom = header.length ? Math.max.apply(null, header.map(function (h) { return h.orig.y1; })) : 0;
    var topGap = header.length ? Math.min(Math.max(24 * u, pv.y0 - origHeaderBottom), 70 * u) : margin;
    var area = {
      x0: margin,
      x1: S - margin,
      y0: headerBottom + topGap,
      y1: S - Math.max(margin * 0.6, 24 * u)
    };

    var mode = opts.mode || defaultMode(an);
    if (mode === 'spread') spreadLayout(an, pieces, S, area, opts, out);
    else rowsLayout(an, pieces, S, area, footer.map(function (f) { return f.box; }), opts, out);
    return out;
  }

  // Mantiene la composición original y la abre en el eje que crece.
  function spreadLayout(an, pieces, S, area, opts, out) {
    var W = an.W, H = an.H, t = opts.spread == null ? 1 : clamp(opts.spread, 0, 1);
    var horizontal = S > W;
    var dim = horizontal ? W : H, cS = S / 2, cO = dim / 2;
    var kmax = S / dim;
    pieces.forEach(function (g) {
      var v = g.vis, c = horizontal ? (v.x0 + v.x1) / 2 : (v.y0 + v.y1) / 2;
      var half = horizontal ? (v.x1 - v.x0) / 2 : (v.y1 - v.y0) / 2;
      var lo = horizontal ? area.x0 : area.y0, hi = horizontal ? area.x1 : area.y1;
      if (c < cO - 1) kmax = Math.min(kmax, (cS - lo - half) / (cO - c));
      if (c > cO + 1) kmax = Math.min(kmax, (hi - half - cS) / (c - cO));
    });
    var k = 1 + t * Math.max(0, kmax - 1);
    pieces.forEach(function (g) {
      var v = g.vis;
      if (horizontal) {
        var cx = (v.x0 + v.x1) / 2;
        out[g.idx] = { tx: Math.round(cS + (cx - cO) * k - cx), ty: 0 };
      } else {
        var cy = (v.y0 + v.y1) / 2;
        out[g.idx] = { tx: Math.round((S - W) / 2), ty: Math.round(cS + (cy - cO) * k - cy) };
      }
    });
  }

  // Reparte las piezas en filas: alturas parecidas juntas, el orden vertical
  // y horizontal del cartel original se respeta en lo posible.
  function rowsLayout(an, pieces, S, area, footer, opts, out) {
    var u = an.u;
    var items = pieces.map(function (g) {
      return {
        g: g,
        w: g.vis.x1 - g.vis.x0,
        h: g.core.y1 - g.core.y0,                 // altura del objeto
        drop: Math.max(0, g.vis.y1 - g.core.y1),  // reflejo por debajo
        rise: Math.max(0, g.core.y0 - g.vis.y0),
        cx: (g.core.x0 + g.core.x1) / 2,
        cy: (g.core.y0 + g.core.y1) / 2
      };
    });
    // El sello de abajo manda: las filas terminan encima de él.
    var bottom = area.y1;
    footer.forEach(function (b) { bottom = Math.min(bottom, b.y0 - 28 * u); });
    var top = area.y0, availH = bottom - top, availW = area.x1 - area.x0;
    var minGap = 24 * u;

    var sorted = items.slice().sort(function (a, b) { return b.h - a.h; });
    var maxRows = Math.min(sorted.length, 5), best = null;
    var forced = opts.rows && opts.rows !== 'auto' ? clamp(+opts.rows, 1, sorted.length) : 0;
    for (var K = forced || 1; K <= (forced || maxRows); K++) {
      var rows = partition(sorted, K, availW, minGap) || (forced ? partition(sorted, K, Infinity, minGap) : null);
      if (!rows) continue;
      var heights = rows.map(function (r) { return rowHeight(r); });
      var totalH = heights.reduce(function (s, h) { return s + h; }, 0);
      var gv = (availH - totalH) / (K + 1);
      var gh = rows.map(function (r) {
        var wsum = r.reduce(function (s, it) { return s + it.w; }, 0);
        return (availW - wsum) / (r.length + 1);
      });
      var feasible = gv >= minGap * 0.5 && Math.min.apply(null, gh) >= minGap;
      var meanGh = gh.reduce(function (s, g) { return s + g; }, 0) / gh.length;
      var spreadGh = Math.max.apply(null, gh) - Math.min.apply(null, gh);
      var score = Math.abs(meanGh - gv) + 0.5 * spreadGh + (feasible ? 0 : 1e6);
      if (!best || score < best.score) best = { score: score, rows: rows, heights: heights, gv: gv };
    }
    if (!best) return spreadLayout(an, pieces, S, area, { spread: 1 }, out);
    // Orden vertical: como estaban de media en el original.
    var order = best.rows.map(function (r, idx) {
      return { r: r, h: best.heights[idx], y: r.reduce(function (s, it) { return s + it.cy; }, 0) / r.length };
    }).sort(function (a, b) { return a.y - b.y; });
    var gv = Math.max(best.gv, 0), y = top + gv;
    var maxGap = Math.max(minGap, availW * 0.09);
    order.forEach(function (row) {
      var r = row.r.slice().sort(function (a, b) { return a.cx - b.cx; });
      var riseMax = Math.max.apply(null, r.map(function (it) { return it.rise; }));
      var hMax = Math.max.apply(null, r.map(function (it) { return it.h; }));
      var baseline = y + riseMax + hMax;       // suelo común de la fila
      var wsum = r.reduce(function (s, it) { return s + it.w; }, 0);
      var gap = Math.max(0, Math.min(maxGap, (availW - wsum) / (r.length + 1)));
      var x = area.x0 + (availW - wsum - gap * (r.length - 1)) / 2;
      r.forEach(function (it) {
        var g = it.g;
        out[g.idx] = { tx: Math.round(x - g.vis.x0), ty: Math.round(baseline - g.core.y1) };
        x += it.w + gap;
      });
      y += row.h + gv;
    });
  }

  function rowHeight(r) {
    var rise = 0, h = 0, drop = 0;
    r.forEach(function (it) { rise = Math.max(rise, it.rise); h = Math.max(h, it.h); drop = Math.max(drop, it.drop); });
    return rise + h + drop * 0.6;
  }

  // Parte la lista (ordenada por altura) en K tramos contiguos minimizando
  // la fila más ancha.
  function partition(items, K, availW, minGap) {
    var n = items.length;
    if (K > n) return null;
    var pre = [0];
    items.forEach(function (it, i) { pre.push(pre[i] + it.w + minGap); });
    var cost = function (a, b) { return pre[b] - pre[a] + minGap; };
    var dp = [], cut = [], i, k, j;
    for (k = 0; k <= K; k++) { dp.push(new Array(n + 1).fill(Infinity)); cut.push(new Array(n + 1).fill(0)); }
    dp[0][0] = 0;
    for (k = 1; k <= K; k++) {
      for (i = 1; i <= n; i++) {
        for (j = k - 1; j < i; j++) {
          var v = Math.max(dp[k - 1][j], cost(j, i));
          if (v < dp[k][i]) { dp[k][i] = v; cut[k][i] = j; }
        }
      }
    }
    if (dp[K][n] > availW * 1.0001) return null;
    var rows = [], end = n;
    for (k = K; k >= 1; k--) {
      var st = cut[k][end];
      rows.unshift(items.slice(st, end));
      end = st;
    }
    return rows;
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Mapa de un eje del fondo nuevo (longitud S) al original (longitud n).
  // El tramo [k0, k1] del original se copia sin estirar, desplazado 'shift'
  // (ahí van el logo, el título, el sello…); lo demás se estira. El mapa se
  // suaviza para que no se note el cambio de estiramiento.
  function axisMap(n, S, k0, k1, shift, sigma) {
    var f = new Float32Array(S), x;
    var useKeep = k1 > k0 && k0 + shift >= 1 && k1 + shift <= S - 1 && S > n;
    for (x = 0; x < S; x++) {
      var c = x + 0.5, v;
      if (!useKeep) v = c * n / S;
      else if (c < k0 + shift) v = c * k0 / (k0 + shift);
      else if (c > k1 + shift) v = k1 + (c - k1 - shift) * (n - k1) / (S - k1 - shift);
      else v = c - shift;
      f[x] = v - 0.5;
    }
    if (useKeep && sigma >= 1) {
      // Suavizado con extensión lineal en los extremos.
      var r = Math.round(sigma * 2), pad = new Float32Array(S + 2 * r), i;
      for (i = 0; i < S + 2 * r; i++) {
        var k = i - r;
        pad[i] = k < 0 ? f[0] + k * (f[1] - f[0]) : k >= S ? f[S - 1] + (k - S + 1) * (f[S - 1] - f[S - 2]) : f[k];
      }
      var sm = boxBlur(boxBlur(pad, pad.length, 1, Math.round(sigma * 0.8)), pad.length, 1, Math.round(sigma * 0.8));
      for (x = 0; x < S; x++) f[x] = sm[x + r];
    }
    for (x = 0; x < S; x++) f[x] = clamp(f[x], 0, n - 1);
    return f;
  }

  function keepSpan(an, axis) {
    var lo = Infinity, hi = -Infinity, m = 40 * an.u;
    an.groups.forEach(function (g) {
      if (g.kind !== 'graphic') return;
      lo = Math.min(lo, (axis === 'x' ? g.vis.x0 : g.vis.y0) - m);
      hi = Math.max(hi, (axis === 'x' ? g.vis.x1 : g.vis.y1) + m);
    });
    return [lo, hi];
  }

  // Eje vertical en carteles apaisados: cabecera arriba y pie abajo sin
  // estirar; se estira solo la zona de las piezas.
  function yMapArray(an, S) {
    var H = an.H, f = new Float32Array(S), y;
    if (S === H) { for (y = 0; y < S; y++) f[y] = y; return f; }
    var top = 0, bot = H;
    an.groups.forEach(function (g) {
      if (g.kind !== 'graphic') return;
      if (g.anchor === 'top') top = Math.max(top, g.core.y1 + 20 * an.u);
      else bot = Math.min(bot, g.core.y0 - 20 * an.u);
    });
    if (bot <= top + 10) { top = 0; bot = H; }
    var extra = S - H, midO = bot - top, midN = midO + extra;
    for (y = 0; y < S; y++) {
      f[y] = y <= top ? y : y >= top + midN ? y - extra : top + (y - top) * midO / midN;
    }
    return f;
  }

  // Fondo cuadrado: el fondo modelado, estirado, con un tramado suave para
  // que los degradados no hagan escalones.
  function renderBackground(an, S) {
    var W = an.W, H = an.H, out = [new Float32Array(S * S), new Float32Array(S * S), new Float32Array(S * S)];
    var rnd = mulberry32(1234567), sigma = an.noise;
    var span = keepSpan(an, 'x');
    var k0 = Math.max(span[0], 0.12 * W), k1 = Math.min(span[1], 0.88 * W);
    var fxs = axisMap(W, S, k0, k1, Math.round((S - W) / 2), 30 * an.u);
    var fys = yMapArray(an, S);
    var xs0 = new Int32Array(S), xs1 = new Int32Array(S), xt = new Float32Array(S);
    for (var x = 0; x < S; x++) {
      var fx = fxs[x], x0 = Math.floor(fx);
      xs0[x] = x0; xs1[x] = Math.min(x0 + 1, W - 1); xt[x] = fx - x0;
    }
    for (var y = 0; y < S; y++) {
      var fy = clamp(fys[y], 0, H - 1), y0 = Math.floor(fy), y1 = Math.min(y0 + 1, H - 1), ty = fy - y0;
      for (x = 0; x < S; x++) {
        var i00 = y0 * W + xs0[x], i01 = y0 * W + xs1[x], i10 = y1 * W + xs0[x], i11 = y1 * W + xs1[x], t = xt[x];
        // Ruido gaussiano (Box–Muller simplificado: suma de uniformes).
        var nz = (rnd() + rnd() + rnd() - 1.5) * 2 * sigma;
        for (var c = 0; c < 3; c++) {
          var p = an.bg[c];
          var a = p[i00] + (p[i01] - p[i00]) * t, b = p[i10] + (p[i11] - p[i10]) * t;
          out[c][y * S + x] = a + (b - a) * ty + nz;
        }
      }
    }
    return out;
  }

  // Orden de pintado: primero todos los reflejos, luego los objetos; lo que
  // está más abajo en el cartel queda delante.
  // place: {tx: [], ty: [], hidden: []} indexado por parte.
  function paintOrder(an, place) {
    var order = [];
    for (var k = 0; k < an.parts.length; k++) if (!place.hidden || !place.hidden[k]) order.push(k);
    return order.sort(function (a, b) {
      return (an.parts[a].core.y1 + place.ty[a]) - (an.parts[b].core.y1 + place.ty[b]) || a - b;
    });
  }

  // Composición final a tamaño completo: fondo + reflejos + piezas. Donde
  // una pieza es sólida se copia su píxel original tal cual.
  function composite(an, S, place, bgRGBA) {
    var N = S * S, o0 = new Float32Array(N), o1 = new Float32Array(N), o2 = new Float32Array(N), i, j;
    for (i = 0, j = 0; i < N; i++, j += 4) { o0[i] = bgRGBA[j]; o1[i] = bgRGBA[j + 1]; o2[i] = bgRGBA[j + 2]; }
    var order = paintOrder(an, place);
    ['soft', 'coreImg'].forEach(function (layer) {
      order.forEach(function (pid) {
        var part = an.parts[pid], img = part[layer], rc = part.rect, tx = place.tx[pid], ty = place.ty[pid];
        for (var yy = 0; yy < rc.h; yy++) {
          var Y = rc.y + yy + ty;
          if (Y < 0 || Y >= S) continue;
          for (var xx = 0; xx < rc.w; xx++) {
            var q = (yy * rc.w + xx) * 4, a8 = img[q + 3];
            if (!a8) continue;
            var X = rc.x + xx + tx;
            if (X < 0 || X >= S) continue;
            var k = Y * S + X;
            if (a8 === 255) { o0[k] = img[q]; o1[k] = img[q + 1]; o2[k] = img[q + 2]; continue; }
            var al = a8 / 255, ia = 1 - al;
            o0[k] = img[q] * al + o0[k] * ia;
            o1[k] = img[q + 1] * al + o1[k] * ia;
            o2[k] = img[q + 2] * al + o2[k] * ia;
          }
        }
      });
    });
    var rgba = new Uint8ClampedArray(N * 4);
    for (i = 0, j = 0; i < N; i++, j += 4) {
      rgba[j] = Math.round(o0[i]); rgba[j + 1] = Math.round(o1[i]); rgba[j + 2] = Math.round(o2[i]); rgba[j + 3] = 255;
    }
    return rgba;
  }

  // Colocación por grupos → colocación por partes.
  function placementFromGroups(an, groups, perGroup) {
    var n = an.parts.length, place = { tx: new Int32Array(n), ty: new Int32Array(n), hidden: new Uint8Array(n) };
    groups.forEach(function (g, i) {
      var p = perGroup[i] || { tx: 0, ty: 0 };
      g.parts.forEach(function (k) { place.tx[k] = p.tx; place.ty[k] = p.ty; });
    });
    return place;
  }

  // Todo lo que hace falta para editar un cartel: análisis sin los planos
  // pesados + fondo cuadrado ya calculado.
  function prepare(rgba, W, H, options) {
    var an = analyze(rgba, W, H, options);
    var S = squareSize(an);
    var bgRGBA = planesToRGBA(renderBackground(an, S), S);
    delete an.bg;
    return { an: an, S: S, bg: bgRGBA };
  }

  function planesToRGBA(planes, S) {
    var rgba = new Uint8ClampedArray(S * S * 4);
    for (var i = 0, j = 0; i < S * S; i++, j += 4) {
      rgba[j] = Math.round(planes[0][i]); rgba[j + 1] = Math.round(planes[1][i]); rgba[j + 2] = Math.round(planes[2][i]); rgba[j + 3] = 255;
    }
    return rgba;
  }

  /* Reescalado final (Lanczos-3 separable) para exportar a otro tamaño. */
  function lanczos(x) {
    if (x === 0) return 1;
    if (x <= -3 || x >= 3) return 0;
    var px = Math.PI * x;
    return 3 * Math.sin(px) * Math.sin(px / 3) / (px * px);
  }

  function weights(src, dst) {
    var scale = dst / src, support = scale < 1 ? 3 / scale : 3, fs = scale < 1 ? scale : 1, list = [];
    for (var i = 0; i < dst; i++) {
      var center = (i + 0.5) / scale - 0.5, a = Math.ceil(center - support), b = Math.floor(center + support);
      var idx = [], wts = [], sum = 0;
      for (var j = a; j <= b; j++) {
        var wv = lanczos((j - center) * fs);
        if (!wv) continue;
        idx.push(clamp(j, 0, src - 1)); wts.push(wv); sum += wv;
      }
      for (var k = 0; k < wts.length; k++) wts[k] /= sum;
      list.push({ idx: idx, w: wts });
    }
    return list;
  }

  function resampleRGBA(rgba, S, T) {
    if (S === T) return rgba;
    var wx = weights(S, T), tmp = new Float32Array(T * S * 3), out = new Uint8ClampedArray(T * T * 4);
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < T; x++) {
        var e = wx[x], r = 0, g = 0, b = 0;
        for (var k = 0; k < e.idx.length; k++) {
          var q = (y * S + e.idx[k]) * 4, wv = e.w[k];
          r += rgba[q] * wv; g += rgba[q + 1] * wv; b += rgba[q + 2] * wv;
        }
        var t = (y * T + x) * 3;
        tmp[t] = r; tmp[t + 1] = g; tmp[t + 2] = b;
      }
    }
    for (y = 0; y < T; y++) {
      var ey = wx[y];
      for (x = 0; x < T; x++) {
        var rr = 0, gg = 0, bb = 0;
        for (k = 0; k < ey.idx.length; k++) {
          var tq = (ey.idx[k] * T + x) * 3, w2 = ey.w[k];
          rr += tmp[tq] * w2; gg += tmp[tq + 1] * w2; bb += tmp[tq + 2] * w2;
        }
        var o = (y * T + x) * 4;
        out[o] = rr; out[o + 1] = gg; out[o + 2] = bb; out[o + 3] = 255;
      }
    }
    return out;
  }

  var api = {
    analyze: analyze,
    prepare: prepare,
    layout: layout,
    defaultMode: defaultMode,
    describeGroup: describeGroup,
    placementFromGroups: placementFromGroups,
    squareSize: squareSize,
    renderBackground: renderBackground,
    planesToRGBA: planesToRGBA,
    composite: composite,
    paintOrder: paintOrder,
    resampleRGBA: resampleRGBA,
    dilate: dilate
  };
  root.CuadradorEngine = api;

  // Dentro de un Web Worker: analiza sin bloquear la página.
  if (typeof document === 'undefined' && typeof root.postMessage === 'function' && typeof importScripts === 'function') {
    root.onmessage = function (e) {
      var m = e.data;
      try {
        var res = prepare(new Uint8ClampedArray(m.rgba), m.W, m.H);
        var transfer = [res.bg.buffer];
        res.an.parts.forEach(function (p) { transfer.push(p.soft.buffer, p.coreImg.buffer, p.hit.buffer); });
        root.postMessage({ id: m.id, ok: true, res: res }, transfer);
      } catch (err) {
        root.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) });
      }
    };
  }
})(typeof self !== 'undefined' ? self : this);
