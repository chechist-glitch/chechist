/*
 * Cuadrador de carteles · interfaz
 * Carga carteles, los analiza (en un Web Worker si se puede), deja recolocar
 * las piezas a mano y exporta el resultado cuadrado.
 */
(function () {
  'use strict';

  var E = window.CuadradorEngine;
  var $ = function (id) { return document.getElementById(id); };
  var ui = {
    list: $('list'), file: $('file'), drop: $('drop'),
    view: $('view'), frame: $('frame'), busy: $('busy'), busyText: $('busy-text'), meta: $('meta'),
    modeSpread: $('mode-spread'), modeRows: $('mode-rows'), rowsField: $('rows-field'), rows: $('rows'),
    undo: $('undo'), redo: $('redo'), reset: $('reset'), outlines: $('outlines'),
    size: $('size'), saveOne: $('save-one'), saveAll: $('save-all'), saveNote: $('save-note'),
    selInfo: $('sel-info'), join: $('join'), split: $('split'), hide: $('hide'), unhide: $('unhide')
  };

  var state = { posters: [], current: null, selection: [], fmt: 'png', size: 'orig', outlines: false, hover: -1, guides: null };
  var drag = null, nudgeTimer = null, uidN = 0;
  var MAX_PIXELS = 12e6;

  function uid() { return 'p' + (++uidN); }
  function cur() { return state.posters.find(function (p) { return p.id === state.current; }) || null; }
  function ready(p) { return !!(p && p.status === 'ready'); }

  /* ------------------------------------------------------------------ */
  /* Carga y análisis                                                    */
  /* ------------------------------------------------------------------ */

  function addFiles(files) {
    var first = null, showNew = !cur() || cur().demo;
    Array.prototype.forEach.call(files, function (f) {
      if (!/^image\/(png|jpe?g|webp)$/i.test(f.type)) return;
      var p = { id: uid(), name: f.name, url: URL.createObjectURL(f), status: 'queued' };
      state.posters.push(p);
      if (!first) first = p;
    });
    if (!first) { note('Solo se admiten imágenes JPG, PNG o WEBP.', true); return; }
    note('');
    // El ejemplo sobra en cuanto hay carteles de verdad.
    state.posters = state.posters.filter(function (p) { return !p.demo; });
    if (showNew || !cur()) state.current = first.id;
    state.selection = [];
    renderList();
    refresh();
    pump();
  }

  var pumping = false;
  function pump() {
    if (pumping) return;
    pumping = true;
    (function next() {
      var p = state.posters.find(function (q) { return q.status === 'queued'; });
      if (!p) { pumping = false; updateButtons(); return; }
      processPoster(p).then(next, next);
    })();
  }

  function processPoster(p) {
    p.status = 'working';
    renderList();
    if (p.id === state.current) refresh();
    return (p.pixels ? Promise.resolve(p.pixels) : decode(p.url)).then(function (px) {
      p.W = px.W; p.H = px.H;
      if (px.W * px.H > MAX_PIXELS) {
        throw new Error('Imagen demasiado grande (' + px.W + ' × ' + px.H + '). Redúcela por debajo de 12 megapíxeles.');
      }
      return analyzeAsync(px.rgba, px.W, px.H);
    }).then(function (res) {
      p.pixels = null;
      setupPoster(p, res);
      return buildBitmaps(p);
    }).then(function () {
      p.status = 'ready';
    }).catch(function (err) {
      p.status = 'error';
      p.error = err && err.message ? err.message : 'No se pudo procesar la imagen.';
      if (/memory|allocation|Array buffer/i.test(p.error)) p.error = 'Sin memoria para una imagen tan grande. Prueba con una versión más pequeña.';
    }).then(function () {
      renderList();
      if (p.id === state.current) refresh();
      updateButtons();
    });
  }

  function decode(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var W = img.naturalWidth, H = img.naturalHeight;
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        resolve({ rgba: ctx.getImageData(0, 0, W, H).data, W: W, H: H });
      };
      img.onerror = function () { reject(new Error('No se pudo leer la imagen.')); };
      img.src = url;
    });
  }

  // Worker con el mismo engine.js (o con su código, si va incrustado en la
  // versión de un solo archivo); si el navegador no lo permite, se analiza en
  // la página.
  var worker = null, workerBroken = false, pending = {};
  function getWorker() {
    if (worker || workerBroken || typeof Worker === 'undefined') return worker;
    try {
      var inline = document.getElementById('engine-src');
      worker = inline
        ? new Worker(URL.createObjectURL(new Blob([inline.textContent], { type: 'text/javascript' })))
        : new Worker('engine.js');
      worker.onmessage = function (e) {
        var cb = pending[e.data.id];
        delete pending[e.data.id];
        if (cb) cb(e.data);
      };
      worker.onerror = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        workerBroken = true;
        worker = null;
        Object.keys(pending).forEach(function (id) { var cb = pending[id]; delete pending[id]; cb({ ok: false, retry: true }); });
      };
    } catch (err) {
      workerBroken = true;
      worker = null;
    }
    return worker;
  }

  function analyzeHere(rgba, W, H) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try { resolve(E.prepare(rgba, W, H)); } catch (err) { reject(err); }
      }, 40);
    });
  }

  function analyzeAsync(rgba, W, H) {
    var w = getWorker();
    if (!w) return analyzeHere(rgba, W, H);
    return new Promise(function (resolve, reject) {
      var id = uid();
      pending[id] = function (msg) {
        if (msg.ok) resolve(msg.res);
        else if (msg.retry) analyzeHere(rgba, W, H).then(resolve, reject);
        else reject(new Error(msg.error));
      };
      w.postMessage({ id: id, rgba: rgba.buffer, W: W, H: H });
    });
  }

  function setupPoster(p, res) {
    var an = res.an;
    p.data = res;
    p.S = res.S;
    p.groups = an.groups.map(function (g) { return { parts: g.parts.slice() }; });
    p.mode = E.defaultMode(an);
    p.rows = 'auto';
    var n = an.parts.length;
    p.place = { tx: new Int32Array(n), ty: new Int32Array(n), hidden: new Uint8Array(n) };
    applyLayout(p, false);
    p.history = [];
    p.future = [];
    var r = Math.max(3, Math.round(5 * an.u));
    an.parts.forEach(function (part) { part.grab = E.dilate(part.hit, part.rect.w, part.rect.h, r); });
    indexGroups(p);
  }

  function hasAlpha(rgba) {
    for (var i = 3; i < rgba.length; i += 4) if (rgba[i]) return true;
    return false;
  }

  function toBitmap(rgba, w, h) {
    var data = new ImageData(rgba, w, h);
    if (window.createImageBitmap) {
      return createImageBitmap(data).catch(function () { return canvasFrom(data); });
    }
    return Promise.resolve(canvasFrom(data));
  }

  function canvasFrom(data) {
    var c = document.createElement('canvas');
    c.width = data.width; c.height = data.height;
    c.getContext('2d').putImageData(data, 0, 0);
    return c;
  }

  function buildBitmaps(p) {
    var an = p.data.an;
    p.bmp = { bg: null, parts: an.parts.map(function () { return { soft: null, core: null }; }) };
    var jobs = [toBitmap(p.data.bg, p.S, p.S).then(function (b) { p.bmp.bg = b; })];
    an.parts.forEach(function (part, k) {
      var r = part.rect;
      if (hasAlpha(part.soft)) jobs.push(toBitmap(part.soft, r.w, r.h).then(function (b) { p.bmp.parts[k].soft = b; }));
      jobs.push(toBitmap(part.coreImg, r.w, r.h).then(function (b) { p.bmp.parts[k].core = b; }));
    });
    return Promise.all(jobs);
  }

  /* ------------------------------------------------------------------ */
  /* Grupos, colocación e historial                                      */
  /* ------------------------------------------------------------------ */

  function indexGroups(p) {
    p.partGroup = new Int32Array(p.data.an.parts.length).fill(-1);
    p.groups.forEach(function (g, i) { g.parts.forEach(function (k) { p.partGroup[k] = i; }); });
  }

  function isGroupHidden(p, gi) {
    return p.groups[gi].parts.every(function (k) { return p.place.hidden[k]; });
  }

  function applyLayout(p, record) {
    if (record) pushHistory(p);
    var visible = p.groups.filter(function (g) { return !g.parts.every(function (k) { return p.place.hidden[k]; }); });
    var per = E.layout(p.data.an, { groups: visible, mode: p.mode, rows: p.rows });
    visible.forEach(function (g, i) {
      var t = per[i] || { tx: 0, ty: 0 };
      g.parts.forEach(function (k) { p.place.tx[k] = t.tx; p.place.ty[k] = t.ty; });
    });
  }

  function snapshot(p) {
    return {
      tx: p.place.tx.slice(), ty: p.place.ty.slice(), hidden: p.place.hidden.slice(),
      groups: p.groups.map(function (g) { return { parts: g.parts.slice() }; }),
      mode: p.mode, rows: p.rows
    };
  }

  function restore(p, s) {
    p.place.tx = s.tx.slice(); p.place.ty = s.ty.slice(); p.place.hidden = s.hidden.slice();
    p.groups = s.groups.map(function (g) { return { parts: g.parts.slice() }; });
    p.mode = s.mode; p.rows = s.rows;
    indexGroups(p);
  }

  function pushHistory(p, snap) {
    p.history.push(snap || snapshot(p));
    if (p.history.length > 150) p.history.shift();
    p.future = [];
  }

  function undo() {
    var p = cur();
    if (!ready(p) || !p.history.length) return;
    p.future.push(snapshot(p));
    restore(p, p.history.pop());
    state.selection = [];
    refresh();
  }

  function redo() {
    var p = cur();
    if (!ready(p) || !p.future.length) return;
    p.history.push(snapshot(p));
    restore(p, p.future.pop());
    state.selection = [];
    refresh();
  }

  function selectedParts(p) {
    var out = [];
    state.selection.forEach(function (gi) { if (p.groups[gi]) out.push.apply(out, p.groups[gi].parts); });
    return out;
  }

  // Caja de un conjunto de partes en su posición actual (+ desplazamiento).
  function partsBox(p, ids, dx, dy, key) {
    var an = p.data.an, b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    ids.forEach(function (k) {
      var c = an.parts[k][key || 'core'], tx = p.place.tx[k] + (dx || 0), ty = p.place.ty[k] + (dy || 0);
      b.x0 = Math.min(b.x0, c.x0 + tx); b.y0 = Math.min(b.y0, c.y0 + ty);
      b.x1 = Math.max(b.x1, c.x1 + tx); b.y1 = Math.max(b.y1, c.y1 + ty);
    });
    return b;
  }

  function groupKind(p, gi) {
    var an = p.data.an;
    return p.groups[gi].parts.some(function (k) { return an.parts[k].kind === 'piece'; }) ? 'piece' : 'graphic';
  }

  /* ------------------------------------------------------------------ */
  /* Dibujo                                                              */
  /* ------------------------------------------------------------------ */

  function fitCanvas(S) {
    var rect = ui.frame.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    var px = Math.max(64, Math.round(Math.min(rect.width * dpr, S || 1600)));
    if (ui.view.width !== px || ui.view.height !== px) { ui.view.width = px; ui.view.height = px; }
    return rect.width;
  }

  function draw() {
    var p = cur(), cv = ui.view, ctx = cv.getContext('2d');
    var cssW = fitCanvas(ready(p) ? p.S : 1600);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#202020';
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!ready(p)) return;
    var an = p.data.an, S = p.S, k = cv.width / S, px = S / cssW;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(p.bmp.bg, 0, 0);
    var order = E.paintOrder(an, p.place);
    ['soft', 'core'].forEach(function (layer) {
      order.forEach(function (pid) {
        var b = p.bmp.parts[pid][layer];
        if (!b) return;
        var r = an.parts[pid].rect;
        ctx.drawImage(b, r.x + p.place.tx[pid], r.y + p.place.ty[pid]);
      });
    });

    // Capas de ayuda (no salen en la exportación).
    var lw = 1.5 * px;
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3cc2a8';
    if (state.outlines) {
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.lineWidth = lw;
      p.groups.forEach(function (g, gi) {
        if (isGroupHidden(p, gi)) return;
        var b = partsBox(p, g.parts, 0, 0, 'vis');
        ctx.strokeStyle = groupKind(p, gi) === 'piece' ? 'rgba(255, 214, 102, .9)' : 'rgba(160, 200, 255, .9)';
        ctx.strokeRect(b.x0 - 3 * px, b.y0 - 3 * px, b.x1 - b.x0 + 6 * px, b.y1 - b.y0 + 6 * px);
      });
      ctx.setLineDash([]);
    }
    if (state.hover >= 0 && state.selection.indexOf(state.hover) < 0 && !drag && p.groups[state.hover]) {
      var hb = partsBox(p, p.groups[state.hover].parts);
      ctx.strokeStyle = 'rgba(255, 255, 255, .55)';
      ctx.lineWidth = lw;
      ctx.strokeRect(hb.x0 - 5 * px, hb.y0 - 5 * px, hb.x1 - hb.x0 + 10 * px, hb.y1 - hb.y0 + 10 * px);
    }
    state.selection.forEach(function (gi) {
      if (!p.groups[gi]) return;
      var b = partsBox(p, p.groups[gi].parts);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2 * px;
      ctx.strokeRect(b.x0 - 6 * px, b.y0 - 6 * px, b.x1 - b.x0 + 12 * px, b.y1 - b.y0 + 12 * px);
    });
    if (state.guides) {
      ctx.strokeStyle = '#ff5fa2';
      ctx.lineWidth = lw;
      ctx.setLineDash([5 * px, 5 * px]);
      state.guides.forEach(function (g) {
        ctx.beginPath();
        if (g.x != null) { ctx.moveTo(g.x, 0); ctx.lineTo(g.x, S); } else { ctx.moveTo(0, g.y); ctx.lineTo(S, g.y); }
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }
  }

  var drawQueued = false;
  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(function () { drawQueued = false; draw(); });
  }

  /* ------------------------------------------------------------------ */
  /* Interfaz                                                            */
  /* ------------------------------------------------------------------ */

  function renderList() {
    ui.list.textContent = '';
    state.posters.forEach(function (p) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'item';
      btn.setAttribute('aria-current', p.id === state.current ? 'true' : 'false');
      var img = document.createElement('img');
      img.src = p.url;
      img.alt = '';
      var txt = document.createElement('div');
      var name = document.createElement('div');
      name.className = 'name';
      name.textContent = p.demo ? 'Cartel de ejemplo' : p.name;
      name.title = p.name;
      var dims = document.createElement('div');
      dims.className = 'dims';
      dims.textContent = p.W ? p.W + ' × ' + p.H : '—';
      var st = document.createElement('span');
      st.className = 'state' + (p.status === 'ready' ? ' ok' : p.status === 'error' ? ' err' : '');
      st.textContent = { queued: 'en cola', working: 'analizando', ready: p.demo ? 'ejemplo' : 'listo', error: 'error' }[p.status];
      if (p.status === 'error') st.title = p.error;
      txt.appendChild(name);
      txt.appendChild(dims);
      btn.appendChild(img);
      btn.appendChild(txt);
      btn.appendChild(st);
      btn.addEventListener('click', function () {
        state.current = p.id;
        state.selection = [];
        renderList();
        refresh();
      });
      li.appendChild(btn);
      if (!p.demo) {
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'rm';
        rm.textContent = '×';
        rm.title = 'Quitar de la lista';
        rm.setAttribute('aria-label', 'Quitar ' + p.name);
        rm.addEventListener('click', function () { removePoster(p.id); });
        li.appendChild(rm);
      }
      ui.list.appendChild(li);
    });
  }

  function removePoster(id) {
    var i = state.posters.findIndex(function (q) { return q.id === id; });
    if (i < 0) return;
    var p = state.posters[i];
    if (p.status === 'working') return;
    state.posters.splice(i, 1);
    if (p.url && p.url.indexOf('blob:') === 0) URL.revokeObjectURL(p.url);
    if (state.current === id) {
      var next = state.posters[Math.min(i, state.posters.length - 1)];
      state.current = next ? next.id : null;
      state.selection = [];
    }
    renderList();
    refresh();
  }

  function refresh() {
    var p = cur();
    ui.busy.hidden = !(p && (p.status === 'queued' || p.status === 'working' || p.status === 'error'));
    if (p && p.status === 'error') {
      ui.busyText.textContent = p.error;
      ui.busy.querySelector('.spinner').hidden = true;
    } else {
      ui.busy.querySelector('.spinner').hidden = false;
      ui.busyText.textContent = p && p.status === 'queued' ? 'En cola…' : 'Analizando el cartel…';
    }
    var r = ready(p);
    ui.modeSpread.setAttribute('aria-checked', String(r && p.mode === 'spread'));
    ui.modeRows.setAttribute('aria-checked', String(r && p.mode === 'rows'));
    ui.rowsField.hidden = !(r && p.mode === 'rows');
    if (r) ui.rows.value = String(p.rows);
    updateMeta();
    updateButtons();
    draw();
  }

  function updateMeta() {
    var p = cur();
    ui.meta.textContent = '';
    if (!ready(p)) return;
    var an = p.data.an, pieces = 0, graphics = 0;
    p.groups.forEach(function (g, gi) {
      if (isGroupHidden(p, gi)) return;
      if (groupKind(p, gi) === 'piece') pieces++; else graphics++;
    });
    [['Original', an.W + ' × ' + an.H + ' px'], ['Cuadrado', p.S + ' × ' + p.S + ' px'],
      ['Piezas', String(pieces)], ['Logo y textos', String(graphics)]].forEach(function (kv) {
      var s = document.createElement('span');
      s.textContent = kv[0] + ' ';
      var b = document.createElement('b');
      b.textContent = kv[1];
      s.appendChild(b);
      ui.meta.appendChild(s);
    });
  }

  function updateButtons() {
    var p = cur(), r = ready(p);
    ui.undo.disabled = !(r && p.history.length);
    ui.redo.disabled = !(r && p.future.length);
    ui.reset.disabled = !r;
    ui.modeSpread.disabled = ui.modeRows.disabled = !r;
    ui.saveOne.disabled = !r;
    ui.saveAll.disabled = !state.posters.some(ready) || state.posters.some(function (q) { return q.status === 'queued' || q.status === 'working'; });
    var sel = r ? state.selection.filter(function (gi) { return p.groups[gi]; }) : [];
    var multiPart = sel.some(function (gi) { return p.groups[gi].parts.length > 1; });
    ui.join.disabled = sel.length < 2;
    ui.split.disabled = !multiPart;
    ui.hide.disabled = !sel.length;
    var hiddenCount = r ? p.groups.filter(function (g, gi) { return isGroupHidden(p, gi); }).length : 0;
    ui.unhide.hidden = !hiddenCount;
    ui.unhide.textContent = 'Mostrar ocultas (' + hiddenCount + ')';
    if (!r) ui.selInfo.textContent = 'Pulsa una pieza para seleccionarla.';
    else if (!sel.length) ui.selInfo.textContent = 'Pulsa una pieza para seleccionarla. Con Mayús, varias.';
    else if (sel.length === 1) ui.selInfo.textContent = (groupKind(p, sel[0]) === 'piece' ? 'Pieza' : 'Logo o texto') +
      (p.groups[sel[0]].parts.length > 1 ? ' (' + p.groups[sel[0]].parts.length + ' partes unidas)' : '') + ' seleccionada.';
    else ui.selInfo.textContent = sel.length + ' elementos seleccionados.';
  }

  function note(msg, isErr) {
    ui.saveNote.textContent = msg || '';
    ui.saveNote.className = 'note' + (isErr ? ' err' : '');
  }

  /* ------------------------------------------------------------------ */
  /* Ratón, táctil y teclado                                             */
  /* ------------------------------------------------------------------ */

  function toPoster(e) {
    var p = cur(), r = ui.view.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * p.S, y: (e.clientY - r.top) / r.height * p.S, scale: p.S / r.width };
  }

  function pick(p, pt) {
    var an = p.data.an, order = E.paintOrder(an, p.place);
    for (var i = order.length - 1; i >= 0; i--) {
      var pid = order[i], part = an.parts[pid], r = part.rect;
      var lx = Math.floor(pt.x - r.x - p.place.tx[pid]), ly = Math.floor(pt.y - r.y - p.place.ty[pid]);
      if (lx < 0 || ly < 0 || lx >= r.w || ly >= r.h) continue;
      if (part.grab[ly * r.w + lx]) return p.partGroup[pid];
    }
    return -1;
  }

  function snap(p, ids, dx, dy, scale) {
    var tol = 7 * scale, guides = [], box = partsBox(p, ids, dx, dy);
    var cx = (box.x0 + box.x1) / 2;
    if (Math.abs(cx - p.S / 2) <= tol) { dx += Math.round(p.S / 2 - cx); guides.push({ x: p.S / 2 }); }
    var best = null, bestD = tol;
    p.groups.forEach(function (g, gi) {
      if (state.selection.indexOf(gi) >= 0 || isGroupHidden(p, gi) || groupKind(p, gi) !== 'piece') return;
      var gb = partsBox(p, g.parts);
      var d = Math.abs(gb.y1 - box.y1);
      if (d <= bestD) { bestD = d; best = gb.y1; }
    });
    if (best !== null) { dy += Math.round(best - box.y1); guides.push({ y: best }); }
    return { dx: dx, dy: dy, guides: guides };
  }

  ui.view.addEventListener('pointerdown', function (e) {
    var p = cur();
    if (!ready(p) || e.button > 0) return;
    ui.view.focus({ preventScroll: true });
    var pt = toPoster(e), gi = pick(p, pt);
    if (gi < 0) {
      if (!e.shiftKey) state.selection = [];
      updateButtons(); draw();
      return;
    }
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      var at = state.selection.indexOf(gi);
      if (at >= 0) state.selection.splice(at, 1); else state.selection.push(gi);
      updateButtons(); draw();
      return;
    }
    if (state.selection.indexOf(gi) < 0) state.selection = [gi];
    var ids = selectedParts(p);
    drag = {
      start: pt, moved: false, snap: snapshot(p), ids: ids,
      base: ids.map(function (k) { return [k, p.place.tx[k], p.place.ty[k]]; })
    };
    try { ui.view.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    ui.view.classList.add('grabbing');
    updateButtons(); draw();
  });

  ui.view.addEventListener('pointermove', function (e) {
    var p = cur();
    if (!ready(p)) return;
    var pt = toPoster(e);
    if (!drag) {
      var gi = pick(p, pt);
      ui.view.classList.toggle('grab', gi >= 0);
      if (gi !== state.hover) { state.hover = gi; requestDraw(); }
      return;
    }
    var dx = Math.round(pt.x - drag.start.x), dy = Math.round(pt.y - drag.start.y);
    drag.base.forEach(function (b) { p.place.tx[b[0]] = b[1]; p.place.ty[b[0]] = b[2]; });
    var s = e.altKey ? { dx: dx, dy: dy, guides: null } : snap(p, drag.ids, dx, dy, pt.scale);
    drag.base.forEach(function (b) { p.place.tx[b[0]] = b[1] + s.dx; p.place.ty[b[0]] = b[2] + s.dy; });
    if (s.dx || s.dy) drag.moved = true;
    state.guides = s.guides && s.guides.length ? s.guides : null;
    requestDraw();
  });

  function endDrag() {
    var p = cur();
    if (drag && drag.moved && ready(p)) pushHistory(p, drag.snap);
    drag = null;
    state.guides = null;
    ui.view.classList.remove('grabbing');
    updateButtons();
    requestDraw();
  }
  ui.view.addEventListener('pointerup', endDrag);
  ui.view.addEventListener('pointercancel', endDrag);
  ui.view.addEventListener('pointerleave', function () { if (!drag && state.hover >= 0) { state.hover = -1; requestDraw(); } });

  function nudge(dx, dy) {
    var p = cur();
    if (!ready(p) || !state.selection.length) return;
    if (!nudgeTimer) pushHistory(p);
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(function () { nudgeTimer = null; }, 700);
    selectedParts(p).forEach(function (k) { p.place.tx[k] += dx; p.place.ty[k] += dy; });
    updateButtons();
    requestDraw();
  }

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    var p = cur();
    if (!ready(p)) return;
    var mod = e.ctrlKey || e.metaKey, key = e.key;
    if (mod && (key === 'z' || key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && (key === 'y' || key === 'Y')) { e.preventDefault(); redo(); return; }
    if (!state.selection.length) return;
    var step = e.shiftKey ? 10 : 1;
    var d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key];
    if (d) { e.preventDefault(); nudge(d[0], d[1]); return; }
    if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); hideSelection(); return; }
    if (key === 'Escape') { state.selection = []; updateButtons(); draw(); }
  });

  /* ------------------------------------------------------------------ */
  /* Acciones                                                            */
  /* ------------------------------------------------------------------ */

  function setMode(mode) {
    var p = cur();
    if (!ready(p) || p.mode === mode) return;
    pushHistory(p);
    p.mode = mode;
    applyLayout(p, false);
    state.selection = [];
    refresh();
  }

  function hideSelection() {
    var p = cur();
    if (!ready(p) || !state.selection.length) return;
    pushHistory(p);
    selectedParts(p).forEach(function (k) { p.place.hidden[k] = 1; });
    state.selection = [];
    refresh();
  }

  ui.modeSpread.addEventListener('click', function () { setMode('spread'); });
  ui.modeRows.addEventListener('click', function () { setMode('rows'); });
  ui.rows.addEventListener('change', function () {
    var p = cur();
    if (!ready(p)) return;
    pushHistory(p);
    p.rows = ui.rows.value;
    applyLayout(p, false);
    state.selection = [];
    refresh();
  });
  ui.reset.addEventListener('click', function () {
    var p = cur();
    if (!ready(p)) return;
    applyLayout(p, true);
    state.selection = [];
    refresh();
  });
  ui.undo.addEventListener('click', undo);
  ui.redo.addEventListener('click', redo);
  ui.outlines.addEventListener('change', function () { state.outlines = ui.outlines.checked; draw(); });

  ui.join.addEventListener('click', function () {
    var p = cur();
    if (!ready(p) || state.selection.length < 2) return;
    pushHistory(p);
    var sel = state.selection.slice(), parts = [];
    sel.forEach(function (gi) { parts.push.apply(parts, p.groups[gi].parts); });
    p.groups = p.groups.filter(function (g, gi) { return sel.indexOf(gi) < 0; });
    p.groups.push({ parts: parts });
    indexGroups(p);
    state.selection = [p.groups.length - 1];
    refresh();
  });

  ui.split.addEventListener('click', function () {
    var p = cur();
    if (!ready(p)) return;
    pushHistory(p);
    var sel = state.selection.slice(), keep = [], added = [];
    p.groups.forEach(function (g, gi) {
      if (sel.indexOf(gi) >= 0 && g.parts.length > 1) g.parts.forEach(function (k) { added.push({ parts: [k] }); });
      else keep.push(g);
    });
    p.groups = keep.concat(added);
    indexGroups(p);
    state.selection = added.map(function (g, i) { return keep.length + i; });
    refresh();
  });

  ui.hide.addEventListener('click', hideSelection);
  ui.unhide.addEventListener('click', function () {
    var p = cur();
    if (!ready(p)) return;
    pushHistory(p);
    p.place.hidden.fill(0);
    refresh();
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-fmt]'), function (b) {
    b.addEventListener('click', function () {
      state.fmt = b.getAttribute('data-fmt');
      Array.prototype.forEach.call(document.querySelectorAll('[data-fmt]'), function (o) {
        o.setAttribute('aria-checked', String(o === b));
      });
    });
  });
  ui.size.addEventListener('change', function () { state.size = ui.size.value; });

  // Arrastrar archivos a la zona (o a cualquier parte de la página).
  ui.file.addEventListener('change', function () { if (ui.file.files.length) addFiles(ui.file.files); ui.file.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
      e.preventDefault();
      ui.drop.classList.add('over');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      if (ev === 'dragleave' && e.relatedTarget) return;
      ui.drop.classList.remove('over');
    });
  });
  document.addEventListener('drop', function (e) {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });

  if (window.ResizeObserver) new ResizeObserver(function () { requestDraw(); }).observe(ui.frame);
  else window.addEventListener('resize', requestDraw);

  /* ------------------------------------------------------------------ */
  /* Exportación                                                         */
  /* ------------------------------------------------------------------ */

  function outName(p) {
    var base = (p.demo ? 'cartel_ejemplo' : p.name.replace(/\.[^.]+$/, '')) || 'cartel';
    return base + '_cuadrado.' + (state.fmt === 'jpg' ? 'jpg' : 'png');
  }

  function renderPoster(p) {
    var S = p.S, rgba = E.composite(p.data.an, S, p.place, p.data.bg);
    var T = state.size === 'orig' ? S : parseInt(state.size, 10);
    if (T !== S) rgba = E.resampleRGBA(rgba, S, T);
    var c = document.createElement('canvas');
    c.width = T; c.height = T;
    c.getContext('2d').putImageData(new ImageData(rgba, T, T), 0, 0);
    var type = state.fmt === 'jpg' ? 'image/jpeg' : 'image/png';
    return new Promise(function (resolve, reject) {
      c.toBlob(function (b) { if (b) resolve(b); else reject(new Error('No se pudo generar la imagen.')); }, type, 0.95);
    });
  }

  var host = window.claude && typeof window.claude.use === 'function' ? window.claude : null;
  var downloadsReady = host ? host.use('downloads').catch(function () { return null; }) : null;

  // Dentro del visor de Claude las descargas pasan por su capacidad
  // "downloads" (el visor pide confirmación); fuera, un enlace normal.
  function saveBlob(name, blob) {
    if (host) {
      return downloadsReady.then(function (ns) {
        if (!ns) return anchorSave(name, blob);
        return ns.save({ filename: name, data: blob });
      });
    }
    return anchorSave(name, blob);
  }

  function anchorSave(name, blob) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 5000);
    return Promise.resolve({ status: 'saved' });
  }

  function saveError(err) {
    var code = err && err.code;
    if (code === 'declined') return 'Descarga cancelada.';
    if (code === 'rate_limited') return 'Ya hay una descarga esperando confirmación.';
    if (code === 'too_large') return 'El archivo es demasiado grande para esta vista. Prueba con JPG o un tamaño menor.';
    if (code) return 'Esta vista no permite descargar archivos.';
    return err && err.message ? err.message : 'No se pudo guardar el archivo.';
  }

  var exporting = false;
  function withExport(label, job) {
    if (exporting) return;
    exporting = true;
    ui.saveOne.disabled = ui.saveAll.disabled = true;
    note(label);
    setTimeout(function () {
      job().then(function (msg) { note(msg || ''); }, function (err) { note(saveError(err), true); })
        .then(function () { exporting = false; updateButtons(); });
    }, 30);
  }

  ui.saveOne.addEventListener('click', function () {
    var p = cur();
    if (!ready(p)) return;
    withExport('Preparando la imagen…', function () {
      return renderPoster(p).then(function (blob) {
        var name = outName(p);
        return saveBlob(name, blob).then(function (res) {
          return res && res.status === 'delivered' ? '' : 'Guardado: ' + name;
        });
      });
    });
  });

  ui.saveAll.addEventListener('click', function () {
    var list = state.posters.filter(ready);
    if (!list.length) return;
    withExport('Preparando ' + list.length + ' imágenes…', function () {
      var files = [], used = {};
      return list.reduce(function (chain, p, i) {
        return chain.then(function () {
          note('Preparando ' + (i + 1) + ' de ' + list.length + '…');
          return new Promise(function (r) { setTimeout(r, 20); });
        }).then(function () { return renderPoster(p); }).then(function (blob) {
          return blob.arrayBuffer().then(function (buf) {
            var name = outName(p), base = name, n = 2;
            while (used[name]) name = base.replace(/(\.[^.]+)$/, ' (' + (n++) + ')$1');
            used[name] = true;
            files.push({ name: name, data: new Uint8Array(buf) });
          });
        });
      }, Promise.resolve()).then(function () {
        return saveBlob('carteles_cuadrados.zip', makeZip(files)).then(function (res) {
          return res && res.status === 'delivered' ? '' : 'Guardado: carteles_cuadrados.zip (' + files.length + ' imágenes)';
        });
      });
    });
  });

  // ZIP mínimo sin compresión (las imágenes ya van comprimidas).
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    var c = 0xffffffff;
    for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeZip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0, d = new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, time, true);
      ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true);
      ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    var cdSize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  /* ------------------------------------------------------------------ */
  /* Cartel de ejemplo (dibujado aquí mismo, sin archivos externos)       */
  /* ------------------------------------------------------------------ */

  var CLAY = { light: '#e8b595', mid: '#c98a69', dark: '#8f5540', deep: '#6a3c2c' };

  function hGrad(g, x0, x1, stops) {
    var lg = g.createLinearGradient(x0, 0, x1, 0);
    stops.forEach(function (s) { lg.addColorStop(s[0], s[1]); });
    return lg;
  }

  function clayBase(g, w, h) {
    // Peana irregular de terreno.
    var cx = w / 2, cy = h - 16;
    g.fillStyle = hGrad(g, 0, w, [[0, CLAY.dark], [0.35, CLAY.mid], [1, CLAY.dark]]);
    g.beginPath();
    for (var i = 0; i <= 24; i++) {
      var a = i / 24 * Math.PI * 2, r = 1 + 0.06 * Math.sin(i * 2.7) + 0.04 * Math.cos(i * 5.1);
      g.lineTo(cx + Math.cos(a) * (w / 2 - 4) * r, cy + Math.sin(a) * 14 * r);
    }
    g.fill();
    g.fillStyle = 'rgba(255, 220, 190, .25)';
    for (i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse(cx - w * 0.35 + i * w * 0.08, cy - 4 + (i % 3) * 3, 7, 4, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  var PROPS = [
    { w: 170, h: 220, draw: function (g, w, h) { // barril
      clayBase(g, w, h);
      var top = 22, bot = h - 24, cx = w / 2;
      g.fillStyle = hGrad(g, 20, w - 20, [[0, CLAY.deep], [0.3, CLAY.light], [0.6, CLAY.mid], [1, CLAY.deep]]);
      g.beginPath();
      g.moveTo(cx - 52, top); g.bezierCurveTo(cx - 72, h * 0.4, cx - 72, h * 0.6, cx - 52, bot);
      g.lineTo(cx + 52, bot); g.bezierCurveTo(cx + 72, h * 0.6, cx + 72, h * 0.4, cx + 52, top);
      g.closePath(); g.fill();
      [0.2, 0.5, 0.8].forEach(function (t) {
        var y = top + (bot - top) * t;
        g.fillStyle = 'rgba(80, 40, 28, .55)';
        g.fillRect(cx - 66 + Math.abs(t - 0.5) * 24, y - 5, 132 - Math.abs(t - 0.5) * 48, 10);
      });
      g.fillStyle = CLAY.light;
      g.beginPath(); g.ellipse(cx, top, 52, 12, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(110, 60, 40, .5)';
      g.beginPath(); g.ellipse(cx, top, 42, 8, 0, 0, Math.PI * 2); g.fill();
    } },
    { w: 260, h: 170, draw: function (g, w, h) { // caja
      clayBase(g, w, h);
      var x0 = 26, x1 = w - 60, y0 = 50, y1 = h - 24;
      g.fillStyle = CLAY.light;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + 34, y0 - 30); g.lineTo(x1 + 34, y0 - 30); g.lineTo(x1, y0); g.closePath(); g.fill();
      g.fillStyle = CLAY.dark;
      g.beginPath(); g.moveTo(x1, y0); g.lineTo(x1 + 34, y0 - 30); g.lineTo(x1 + 34, y1 - 30); g.lineTo(x1, y1); g.closePath(); g.fill();
      g.fillStyle = hGrad(g, x0, x1, [[0, CLAY.mid], [0.5, CLAY.light], [1, CLAY.mid]]);
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = 'rgba(90, 45, 30, .6)'; g.lineWidth = 3;
      for (var y = y0 + 24; y < y1; y += 24) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
      g.fillStyle = 'rgba(95, 50, 34, .7)';
      g.fillRect(x0 + 18, y0, 14, y1 - y0); g.fillRect(x1 - 32, y0, 14, y1 - y0);
    } },
    { w: 150, h: 300, draw: function (g, w, h) { // columna rota
      clayBase(g, w, h);
      var cx = w / 2, top = 30, bot = h - 26;
      g.fillStyle = hGrad(g, cx - 44, cx + 44, [[0, CLAY.dark], [0.3, CLAY.light], [0.7, CLAY.mid], [1, CLAY.deep]]);
      g.beginPath();
      g.moveTo(cx - 44, bot); g.lineTo(cx - 44, top + 20); g.lineTo(cx - 20, top); g.lineTo(cx - 4, top + 26);
      g.lineTo(cx + 14, top + 6); g.lineTo(cx + 44, top + 30); g.lineTo(cx + 44, bot); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(90, 45, 30, .45)'; g.lineWidth = 3;
      [-26, -9, 9, 26].forEach(function (dx) { g.beginPath(); g.moveTo(cx + dx, top + 36); g.lineTo(cx + dx, bot - 20); g.stroke(); });
      g.fillStyle = hGrad(g, cx - 56, cx + 56, [[0, CLAY.dark], [0.35, CLAY.light], [1, CLAY.dark]]);
      g.fillRect(cx - 56, bot - 26, 112, 26);
    } },
    { w: 150, h: 200, draw: function (g, w, h) { // ánfora
      clayBase(g, w, h);
      var cx = w / 2, bot = h - 24;
      var rg = g.createRadialGradient(cx - 18, h * 0.45, 8, cx, h * 0.5, 80);
      rg.addColorStop(0, CLAY.light); rg.addColorStop(0.6, CLAY.mid); rg.addColorStop(1, CLAY.deep);
      g.fillStyle = rg;
      g.beginPath();
      g.moveTo(cx - 20, 24); g.lineTo(cx + 20, 24);
      g.bezierCurveTo(cx + 22, 60, cx + 66, 70, cx + 60, 120);
      g.bezierCurveTo(cx + 54, 160, cx + 30, bot - 6, cx + 24, bot);
      g.lineTo(cx - 24, bot);
      g.bezierCurveTo(cx - 30, bot - 6, cx - 54, 160, cx - 60, 120);
      g.bezierCurveTo(cx - 66, 70, cx - 22, 60, cx - 20, 24);
      g.fill();
      g.fillStyle = CLAY.light;
      g.beginPath(); g.ellipse(cx, 24, 26, 8, 0, 0, Math.PI * 2); g.fill();
    } },
    { w: 240, h: 130, draw: function (g, w, h) { // piedras
      clayBase(g, w, h);
      [[60, 88, 44, 30], [120, 76, 56, 40], [178, 90, 40, 28], [96, 104, 34, 20], [150, 108, 30, 18]].forEach(function (s) {
        var rg = g.createRadialGradient(s[0] - s[2] * 0.3, s[1] - s[3] * 0.4, 2, s[0], s[1], s[2]);
        rg.addColorStop(0, CLAY.light); rg.addColorStop(0.7, CLAY.mid); rg.addColorStop(1, CLAY.deep);
        g.fillStyle = rg;
        g.beginPath(); g.ellipse(s[0], s[1], s[2], s[3], -0.2, 0, Math.PI * 2); g.fill();
      });
    } },
    { w: 170, h: 190, draw: function (g, w, h) { // velas
      clayBase(g, w, h);
      [[50, 70, 20], [88, 40, 24], [126, 90, 18]].forEach(function (c) {
        var x = c[0], top = c[1], r = c[2], bot = h - 26;
        g.fillStyle = hGrad(g, x - r, x + r, [[0, CLAY.dark], [0.35, CLAY.light], [1, CLAY.dark]]);
        g.fillRect(x - r, top, 2 * r, bot - top);
        g.fillStyle = CLAY.light;
        g.beginPath(); g.ellipse(x, top, r, 6, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = hGrad(g, x - 9, x + 9, [[0, CLAY.mid], [0.5, CLAY.light], [1, CLAY.mid]]);
        g.beginPath(); g.moveTo(x, top - 34); g.quadraticCurveTo(x + 12, top - 12, x, top - 4); g.quadraticCurveTo(x - 12, top - 12, x, top - 34); g.fill();
      });
    } },
    { w: 230, h: 180, draw: function (g, w, h) { // cofre
      clayBase(g, w, h);
      var x0 = 30, x1 = w - 30, yb = h - 26, ym = 86;
      g.fillStyle = hGrad(g, x0, x1, [[0, CLAY.dark], [0.4, CLAY.light], [1, CLAY.dark]]);
      g.fillRect(x0, ym, x1 - x0, yb - ym);
      g.beginPath(); g.moveTo(x0, ym); g.bezierCurveTo(x0, 30, x1, 30, x1, ym); g.closePath(); g.fill();
      g.fillStyle = 'rgba(90, 45, 30, .65)';
      g.fillRect(x0 + 30, 44, 16, yb - 44); g.fillRect(x1 - 46, 44, 16, yb - 44);
      g.fillRect(x0, ym - 4, x1 - x0, 8);
      g.fillStyle = CLAY.light;
      g.fillRect(w / 2 - 10, ym - 6, 20, 26);
    } }
  ];

  // Pieza con su sombra de contacto y reflejo en el suelo.
  function drawProp(g, prop, x, y) {
    var c = document.createElement('canvas');
    c.width = prop.w; c.height = prop.h;
    prop.draw(c.getContext('2d'), prop.w, prop.h);
    // Reflejo: la pieza volteada bajo su peana, desvaneciéndose.
    var refl = document.createElement('canvas'), rh = Math.round(prop.h * 0.45);
    refl.width = prop.w; refl.height = rh;
    var rg = refl.getContext('2d');
    rg.translate(0, prop.h);
    rg.scale(1, -1);
    rg.drawImage(c, 0, 0);
    rg.setTransform(1, 0, 0, 1, 0, 0);
    rg.globalCompositeOperation = 'destination-in';
    var fade = rg.createLinearGradient(0, 0, 0, rh);
    fade.addColorStop(0, 'rgba(0,0,0,.28)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    rg.fillStyle = fade;
    rg.fillRect(0, 0, prop.w, rh);
    g.save();
    g.fillStyle = 'rgba(0, 0, 0, .35)';
    g.filter = 'blur(6px)';
    g.beginPath(); g.ellipse(x + prop.w / 2, y + prop.h - 12, prop.w * 0.45, 10, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    g.drawImage(refl, x, y + prop.h - 8);
    g.drawImage(c, x, y);
  }

  function makeDemoPoster() {
    var W = 1280, H = 1600, c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var bg = g.createRadialGradient(W * 0.5, H * 0.55, 40, W * 0.5, H * 0.55, H * 0.8);
    bg.addColorStop(0, '#3b3b3b'); bg.addColorStop(1, '#1b1b1b');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(-0.5);
    [[-460, 160, 0.035], [40, 240, 0.03], [520, 170, 0.025]].forEach(function (s) {
      var lg = g.createLinearGradient(0, s[0] - s[1] / 2, 0, s[0] + s[1] / 2);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,' + s[2] + ')'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.fillRect(-W * 1.5, s[0] - s[1] / 2, W * 3, s[1]);
    });
    g.restore();
    var band = g.createLinearGradient(0, 0, W, 0);
    band.addColorStop(0, 'rgba(255,255,255,.02)'); band.addColorStop(0.45, 'rgba(255,255,255,.09)'); band.addColorStop(1, 'rgba(255,255,255,.1)');
    g.fillStyle = band;
    g.fillRect(0, 380, W, 118);

    // Logo genérico
    g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineJoin = 'round';
    g.beginPath();
    for (var i = 0; i < 6; i++) { var a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(W / 2 + Math.cos(a) * 78, 150 + Math.sin(a) * 78); }
    g.closePath(); g.stroke();
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(W / 2, 110); g.lineTo(W / 2 + 36, 130); g.lineTo(W / 2 + 36, 172); g.lineTo(W / 2, 192); g.lineTo(W / 2 - 36, 172); g.lineTo(W / 2 - 36, 130); g.closePath();
    g.moveTo(W / 2 - 36, 130); g.lineTo(W / 2, 150); g.lineTo(W / 2 + 36, 130); g.moveTo(W / 2, 150); g.lineTo(W / 2, 192); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = '800 52px Archivo, "Arial Narrow", Arial, sans-serif';
    g.fillText('TU ESTUDIO', W / 2, 290);
    g.font = '600 24px Archivo, Arial, sans-serif';
    g.fillText('M I N I A T U R A S', W / 2, 326);

    // Título con su corchete
    g.strokeStyle = '#2bb5a8'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(330, 396); g.lineTo(306, 396); g.lineTo(306, 430); g.lineTo(290, 440); g.lineTo(306, 450); g.lineTo(306, 484); g.lineTo(330, 484); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'left';
    g.font = '800 70px Archivo, "Arial Narrow", Arial, sans-serif';
    g.fillText('ATREZO DE EJEMPLO', 350, 464);

    // Piezas
    [[0, 150, 560], [3, 980, 540], [4, 520, 700], [2, 160, 860], [1, 510, 1000], [5, 940, 900], [6, 870, 1180]].forEach(function (s) {
      drawProp(g, PROPS[s[0]], s[1], s[2]);
    });

    // Sello
    g.strokeStyle = '#2bb5a8'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(W / 2 - 34, 1440); g.lineTo(W / 2 + 34, 1440); g.moveTo(W / 2 - 24, 1440); g.lineTo(W / 2 - 24, 1410); g.moveTo(W / 2, 1440); g.lineTo(W / 2, 1396); g.moveTo(W / 2 + 24, 1440); g.lineTo(W / 2 + 24, 1410); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center';
    g.font = '800 44px Archivo, "Arial Narrow", Arial, sans-serif';
    g.fillText('LISTO PARA', W / 2, 1500);
    g.fillText('IMPRIMIR', W / 2, 1546);
    return c;
  }

  function loadDemo() {
    var fontReady = document.fonts && document.fonts.load ? Promise.all([
      document.fonts.load('800 70px Archivo'), document.fonts.load('600 24px Archivo')
    ]).catch(function () {}) : Promise.resolve();
    var timeout = new Promise(function (r) { setTimeout(r, 1500); });
    Promise.race([fontReady, timeout]).then(function () {
      if (state.posters.some(function (p) { return !p.demo; })) return;
      var c = makeDemoPoster();
      var ctx = c.getContext('2d');
      var p = {
        id: uid(), demo: true, name: 'ejemplo.png', status: 'queued', url: c.toDataURL('image/jpeg', 0.8),
        pixels: { rgba: ctx.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height }
      };
      state.posters.unshift(p);
      if (!cur()) state.current = p.id;
      renderList();
      refresh();
      pump();
    });
  }

  if (location.hash === '#debug') window.__cuadrador = { state: state, draw: draw };

  renderList();
  refresh();
  loadDemo();
})();
