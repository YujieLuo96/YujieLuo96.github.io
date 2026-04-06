'use strict';

/* ═══════════════════════════════════════════════════════════
   EventBus
═══════════════════════════════════════════════════════════ */
const EB = (() => {
  const _map = {};
  return {
    on(e, fn)  { (_map[e] = _map[e] || []).push(fn); },
    off(e, fn) { if (_map[e]) _map[e] = _map[e].filter(h => h !== fn); },
    emit(e, d) { (_map[e] || []).slice().forEach(fn => fn(d)); }
  };
})();

/* ═══════════════════════════════════════════════════════════
   Store
═══════════════════════════════════════════════════════════ */
const Store = {
  nodes: new Map(),
  edges: new Map(),
  addNode(n)     { this.nodes.set(n.id, n); },
  addEdge(e)     { this.edges.set(e.id, e); },
  removeNode(id) { this.nodes.delete(id); },
  removeEdge(id) { this.edges.delete(id); },
  clear()        { this.nodes.clear(); this.edges.clear(); }
};

/* ═══════════════════════════════════════════════════════════
   LatexUtil
═══════════════════════════════════════════════════════════ */
const LX = (() => {
  function render(src, el) {
    if (!src || !src.trim()) {
      el.innerHTML = '<span style="color:#94a3b8;font-style:italic">(empty)</span>';
      return;
    }
    el.innerHTML = window.katex ? _mixed(src) : _esc(src);
  }

  function _mixed(src) {
    const segments = [];
    const re = /(\$\$[\s\S]*?\$\$|\$(?:[^$\\]|\\[\s\S])*?\$)/g;
    let last = 0, m;
    while ((m = re.exec(src)) !== null) {
      if (m.index > last) segments.push({ type: 'text', value: src.slice(last, m.index) });
      const full = m[0], disp = full.startsWith('$$');
      segments.push({ type: 'math', math: disp ? full.slice(2, -2) : full.slice(1, -1), disp });
      last = m.index + full.length;
    }
    if (last < src.length) segments.push({ type: 'text', value: src.slice(last) });
    return segments.map(seg => {
      if (seg.type === 'text') return _esc(seg.value).replace(/\\\\/g, '<br>');
      try {
        const html = window.katex.renderToString(seg.math, { displayMode: seg.disp, throwOnError: false });
        return seg.disp ? `<div style="text-align:center;margin:4px 0">${html}</div>` : html;
      } catch { return _esc(seg.disp ? `$$${seg.math}$$` : `$${seg.math}$`); }
    }).join('');
  }

  function _esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { render };
})();

/* ═══════════════════════════════════════════════════════════
   StatusBar
═══════════════════════════════════════════════════════════ */
const Status = (() => {
  let _timer = null;
  const _el = () => document.getElementById('status');

  function show(msg, ms = 0) {
    clearTimeout(_timer);
    const bar = _el(); if (!bar) return;
    bar.textContent = msg;
    bar.classList.add('on');
    if (ms > 0) _timer = setTimeout(() => bar.classList.remove('on'), ms);
  }
  function hide() { clearTimeout(_timer); _el()?.classList.remove('on'); }

  return { show, hide };
})();

/* ═══════════════════════════════════════════════════════════
   AppState
═══════════════════════════════════════════════════════════ */
const App = {
  mode: 'default',
  selNode: null,
  selEdge: null,

  setMode(m) {
    this.mode = m;
    const vp = document.getElementById('canvas-vp');
    if (vp) vp.className = (m === 'place') ? 'mode-place' : '';
    document.getElementById('btn-conn')?.classList.toggle('active', m === 'conn');
    const hintMap = {
      place:   'Click canvas to place node',
      conn:    'Click source → target · Right-click to quick-connect · Esc to exit',
      default: ''
    };
    const hint = document.getElementById('mode-hint');
    if (hint) hint.textContent = hintMap[m] ?? '';
    if (m === 'default') Status.hide();
    else Status.show(hintMap[m]);
  }
};

/* ═══════════════════════════════════════════════════════════
   Canvas
═══════════════════════════════════════════════════════════ */
const Canvas = (() => {
  let tx = 80, ty = 60, sc = 1;
  let panning = false, panStart = null;

  function applyTransform() {
    const w = document.getElementById('canvas-world');
    if (w) w.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`;
    const eg = document.getElementById('edges-group');
    if (eg) eg.setAttribute('transform', `translate(${tx},${ty}) scale(${sc})`);
  }

  function init() {
    const vp = document.getElementById('canvas-vp');

    vp.addEventListener('mousedown', e => {
      const isMiddle      = e.button === 1;
      const isLeftOnEmpty = e.button === 0 && e.target === vp && App.mode === 'default';
      if (!isMiddle && !isLeftOnEmpty) return;
      panning  = true;
      panStart = { x: e.clientX - tx, y: e.clientY - ty };
      vp.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', e => {
      if (!panning) return;
      tx = e.clientX - panStart.x;
      ty = e.clientY - panStart.y;
      applyTransform();
    });

    window.addEventListener('mouseup', () => {
      if (panning) { panning = false; document.getElementById('canvas-vp').style.cursor = ''; }
    });

    vp.addEventListener('wheel', e => {
      e.preventDefault();
      const r  = vp.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const f  = e.deltaY > 0 ? 0.9 : 1 / 0.9;
      const ns = Math.min(5, Math.max(0.08, sc * f));
      tx = mx - (mx - tx) * (ns / sc);
      ty = my - (my - ty) * (ns / sc);
      sc = ns;
      applyTransform();
    }, { passive: false });

    applyTransform();
  }

  function s2c(sx, sy) {
    const r = document.getElementById('canvas-vp').getBoundingClientRect();
    return { x: (sx - r.left - tx) / sc, y: (sy - r.top - ty) / sc };
  }

  function c2s(cx, cy) {
    const r = document.getElementById('canvas-vp').getBoundingClientRect();
    return { x: cx * sc + tx + r.left, y: cy * sc + ty + r.top };
  }

  /**
   * Smoothly pan + zoom so that canvas point (cx, cy) is centred in the viewport.
   * @param {number} cx        - canvas-space X to focus on
   * @param {number} cy        - canvas-space Y to focus on
   * @param {number} targetSc  - desired scale after animation (default 1.3)
   * @param {number} duration  - animation duration in ms (default 420)
   */
  function focusOn(cx, cy, targetSc = 1.3, duration = 420) {
    const vp   = document.getElementById('canvas-vp');
    const r    = vp.getBoundingClientRect();
    const vpCx = r.width  / 2;
    const vpCy = r.height / 2;

    const targetTx = vpCx - cx * targetSc;
    const targetTy = vpCy - cy * targetSc;

    const startTx = tx, startTy = ty, startSc = sc;
    const t0 = performance.now();

    function step(now) {
      const raw  = Math.min(1, (now - t0) / duration);
      const ease = raw < 0.5 ? 4 * raw * raw * raw
                              : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      tx = startTx + (targetTx - startTx) * ease;
      ty = startTy + (targetTy - startTy) * ease;
      sc = startSc + (targetSc - startSc) * ease;
      applyTransform();
      if (raw < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  return { init, s2c, c2s, focusOn, get: () => ({ tx, ty, sc }) };
})();

/* ═══════════════════════════════════════════════════════════
   NodeModule
═══════════════════════════════════════════════════════════ */
const NM = (() => {
  const COLORS    = ['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6','#8b5cf6'];
  const DEF_COLOR = '#6366f1';
  let _seq     = 0;
  let drag     = null;
  let connSrc  = null;
  let qConnSrc = null;

  const _layer = () => document.getElementById('nodes-layer');

  function _makeEl(data) {
    const el = document.createElement('div');
    el.className = 'node';
    el.id = data.id;
    el.style.left = data.x + 'px';
    el.style.top  = data.y + 'px';

    const bar = document.createElement('div');
    bar.className = 'node-bar';
    bar.style.background = data.color;

    const body = document.createElement('div');
    body.className = 'node-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'node-title';
    titleEl.textContent = data.title;
    body.appendChild(titleEl);

    if (data.content) {
      const prev = document.createElement('div');
      prev.className = 'node-preview';
      prev.textContent = _strip(data.content);
      body.appendChild(prev);
    }

    el.appendChild(bar);
    el.appendChild(body);
    el.addEventListener('mousedown',   e => _onMD(e, data.id));
    el.addEventListener('click',       e => _onClick(e, data.id));
    el.addEventListener('contextmenu', e => _onRC(e, data.id));
    return el;
  }

  function _strip(src) { return src.replace(/\$+/g, '').substring(0, 50); }

  function create(title, cx, cy, opts = {}) {
    const data = {
      id:      'n' + Date.now() + (++_seq),
      title:   title || 'Node',
      content: opts.content || '',
      color:   opts.color   || DEF_COLOR,
      x: cx, y: cy, _el: null
    };
    const el = _makeEl(data);
    data._el = el;
    el.style.visibility = 'hidden';
    el.style.left = '0'; el.style.top = '0';
    _layer().appendChild(el);
    Store.addNode(data);
    requestAnimationFrame(() => {
      data.x = cx - el.offsetWidth  / 2;
      data.y = cy - el.offsetHeight / 2;
      el.style.left = data.x + 'px';
      el.style.top  = data.y + 'px';
      el.style.visibility = '';
      EB.emit('node:moved', data.id);
    });
    return data;
  }

  function load(data) {
    const el = _makeEl(data);
    data._el = el;
    el.style.left = data.x + 'px';
    el.style.top  = data.y + 'px';
    _layer().appendChild(el);
    Store.addNode(data);
    return data;
  }

  function updateEl(data) {
    const el = data._el; if (!el) return;
    el.style.left = data.x + 'px';
    el.style.top  = data.y + 'px';
    el.querySelector('.node-bar').style.background = data.color;
    el.querySelector('.node-title').textContent    = data.title;
    let prev = el.querySelector('.node-preview');
    if (data.content) {
      if (!prev) {
        prev = document.createElement('div');
        prev.className = 'node-preview';
        el.querySelector('.node-body').appendChild(prev);
      }
      prev.textContent = _strip(data.content);
    } else if (prev) prev.remove();
  }

  function remove(id) {
    [...Store.edges.values()]
      .filter(e => e.sourceId === id || e.targetId === id)
      .forEach(e => EB.emit('edge:removeById', e.id));
    const data = Store.nodes.get(id); if (!data) return;
    data._el?.remove();
    Store.removeNode(id);
  }

  function clearConnHL() {
    document.querySelectorAll('.node.conn-src').forEach(el => el.classList.remove('conn-src'));
  }

  function clearAllSel() {
    document.querySelectorAll('.node.sel').forEach(el => el.classList.remove('sel'));
    EB.emit('sel:clearEdges');
  }

  function cancelConn() { connSrc = qConnSrc = null; clearConnHL(); }

  function _onMD(e, id) {
    if (e.button !== 0 || App.mode === 'conn') return;
    e.stopPropagation();
    const d = Store.nodes.get(id); if (!d) return;
    drag = { id, smx: e.clientX, smy: e.clientY, sx: d.x, sy: d.y, moved: false, sc: Canvas.get().sc };
    e.preventDefault();
  }

  function _onClick(e, id) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (drag?.moved) return;
    if (App.mode === 'conn')  { _handleConn(id);  return; }
    if (App.mode === 'place') return;
    clearAllSel();
    App.selNode = id; App.selEdge = null;
    Store.nodes.get(id)?._el.classList.add('sel');
    EB.emit('panel:showNode', id);
  }

  function _onRC(e, id) {
    e.preventDefault(); e.stopPropagation();
    _handleQConn(id);
  }

  function _handleConn(id) {
    if (!connSrc) {
      connSrc = id; clearConnHL();
      Store.nodes.get(id)?._el.classList.add('conn-src');
      Status.show('Source selected — click target node');
    } else {
      const src = connSrc, tgt = id;
      connSrc = null; clearConnHL();
      if (src !== tgt) {
        EB.emit('edge:create', { srcId: src, tgtId: tgt });
        Status.show('Connection created', 2000);
      } else {
        Status.show('Cannot connect a node to itself', 2000);
      }
    }
  }

  function _handleQConn(id) {
    if (!qConnSrc) {
      qConnSrc = id; clearConnHL();
      Store.nodes.get(id)?._el.classList.add('conn-src');
      Status.show('Right-click target node to quick-connect');
    } else {
      const src = qConnSrc, tgt = id;
      qConnSrc = null; clearConnHL();
      if (src !== tgt) {
        EB.emit('edge:create', { srcId: src, tgtId: tgt });
        Status.show('Quick connection created', 2000);
      } else {
        Status.show('Cannot connect a node to itself', 2000);
      }
    }
  }

  function init() {
    EB.on('sel:clearNodes', () => {
      document.querySelectorAll('.node.sel').forEach(el => el.classList.remove('sel'));
      App.selNode = null;
    });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      const dx = (e.clientX - drag.smx) / drag.sc;
      const dy = (e.clientY - drag.smy) / drag.sc;
      if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) drag.moved = true;
      if (!drag.moved) return;
      const d = Store.nodes.get(drag.id); if (!d) return;
      d.x = drag.sx + dx; d.y = drag.sy + dy;
      d._el.style.left = d.x + 'px'; d._el.style.top = d.y + 'px';
      EB.emit('node:moved', drag.id);
    });
    window.addEventListener('mouseup', () => { drag = null; });
  }

  return { init, create, load, remove, updateEl, clearConnHL, clearAllSel, cancelConn, COLORS };
})();

/* ═══════════════════════════════════════════════════════════
   EdgeModule
═══════════════════════════════════════════════════════════ */
const EM = (() => {
  const NS   = 'http://www.w3.org/2000/svg';
  let _seq   = 0;
  let _selId = null;
  const _svg = () => document.getElementById('edges-group');

  function _makeGroup(data) {
    const g = document.createElementNS(NS, 'g');
    g.id = data.id;

    const defs = document.createElementNS(NS, 'defs');
    const mk   = document.createElementNS(NS, 'marker');
    mk.setAttribute('id', 'mk_' + data.id);
    mk.setAttribute('markerWidth',  '10.7');
    mk.setAttribute('markerHeight', '8');
    mk.setAttribute('refX', '9.3'); mk.setAttribute('refY', '4');
    mk.setAttribute('orient', 'auto');
    mk.setAttribute('markerUnits', 'strokeWidth');
    const poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', '0 0, 10.7 4, 0 8');
    poly.setAttribute('fill', '#94a3b8');
    poly.classList.add('arr-poly');
    mk.appendChild(poly); defs.appendChild(mk); g.appendChild(defs);

    const hit = document.createElementNS(NS, 'path');
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'rgba(0,0,0,0.001)');
    hit.setAttribute('stroke-width', '18');
    hit.setAttribute('pointer-events', 'all');
    hit.style.cursor = 'pointer';
    hit.classList.add('e-hit');
    g.appendChild(hit);

    const vis = document.createElementNS(NS, 'path');
    vis.setAttribute('fill', 'none');
    vis.setAttribute('stroke', '#94a3b8');
    vis.setAttribute('stroke-width', '1.5');
    vis.setAttribute('marker-end', `url(#mk_${data.id})`);
    vis.setAttribute('pointer-events', 'none');
    vis.classList.add('e-vis');
    g.appendChild(vis);

    const fo  = document.createElementNS(NS, 'foreignObject');
    fo.setAttribute('width', '1'); fo.setAttribute('height', '1');
    fo.style.overflow = 'visible'; fo.style.pointerEvents = 'none';
    fo.classList.add('e-fo');
    const lbl = document.createElement('div');
    lbl.className = 'e-lbl';
    lbl.style.display = data.tag ? 'inline-block' : 'none';
    fo.appendChild(lbl); g.appendChild(fo);

    hit.addEventListener('click', e => { e.stopPropagation(); _onEdgeClick(data.id); });
    hit.addEventListener('mouseenter', () => {
      vis.setAttribute('stroke', '#6366f1'); poly.setAttribute('fill', '#6366f1');
    });
    hit.addEventListener('mouseleave', () => {
      if (_selId !== data.id) {
        const col = _edgeColor(data);
        vis.setAttribute('stroke', col); poly.setAttribute('fill', col);
      }
    });
    return g;
  }

  function _calcPath(src, tgt, ci) {
    const sw = src._el.offsetWidth  || 120, sh = src._el.offsetHeight || 40;
    const tw = tgt._el.offsetWidth  || 120, th = tgt._el.offsetHeight || 40;
    const scx = src.x + sw/2, scy = src.y + sh/2;
    const tcx = tgt.x + tw/2, tcy = tgt.y + th/2;
    const dx = tcx-scx, dy = tcy-scy;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
    const sideSign  = ci === 0 ? 0 : (ci%2===1 ? 1 : -1);
    const sideLevel = Math.ceil(ci/2);
    const offset = ci === 0 ? dist*0.12 : dist*(0.25+(sideLevel-1)*0.18)*sideSign;
    const nx = -dy/dist, ny = dx/dist;
    const cp1 = { x: scx+dx*0.3+nx*offset, y: scy+dy*0.3+ny*offset };
    const cp2 = { x: scx+dx*0.7+nx*offset, y: scy+dy*0.7+ny*offset };
    const sp    = _borderPt(sw, sh, scx, scy, cp1.x, cp1.y);
    const tpRaw = _borderPt(tw, th, tcx, tcy, cp2.x, cp2.y);
    const adx = tpRaw.x-cp2.x, ady = tpRaw.y-cp2.y;
    const ad  = Math.sqrt(adx*adx+ady*ady)||1;
    const tp  = { x: tpRaw.x-(adx/ad)*9, y: tpRaw.y-(ady/ad)*9 };
    const mid = _bezPt({x:scx,y:scy}, cp1, cp2, {x:tcx,y:tcy}, 0.5);
    return { sp, tp, cp1, cp2, mid };
  }

  function _borderPt(w, h, cx, cy, toX, toY) {
    const dx = toX-cx, dy = toY-cy;
    if (!dx && !dy) return {x:cx,y:cy};
    const pad = 5;
    const t = Math.abs(dx)*h > Math.abs(dy)*w
      ? (w/2+pad)/Math.abs(dx) : (h/2+pad)/Math.abs(dy);
    return {x:cx+dx*t, y:cy+dy*t};
  }

  function _bezPt(p0,c1,c2,p1,t) {
    const m=1-t;
    return {
      x:m*m*m*p0.x+3*m*m*t*c1.x+3*m*t*t*c2.x+t*t*t*p1.x,
      y:m*m*m*p0.y+3*m*m*t*c1.y+3*m*t*t*c2.y+t*t*t*p1.y
    };
  }

  function _edgeColor(data) {
    return Store.nodes.get(data.sourceId)?.color || '#94a3b8';
  }

  function create(srcId, tgtId, opts = {}) {
    const parallelCount = [...Store.edges.values()].filter(e =>
      (e.sourceId===srcId && e.targetId===tgtId) ||
      (e.sourceId===tgtId && e.targetId===srcId)
    ).length;
    const data = {
      id:             'e'+Date.now()+(++_seq),
      sourceId:       srcId, targetId: tgtId,
      tag:            opts.tag            ?? '',
      curvatureIndex: opts.curvatureIndex ?? parallelCount,
      _g: null
    };
    const g = _makeGroup(data);
    data._g = g;
    _svg().appendChild(g);
    Store.addEdge(data);
    update(data.id);
    return data;
  }

  function update(id) {
    const data = Store.edges.get(id); if (!data) return;
    const src  = Store.nodes.get(data.sourceId);
    const tgt  = Store.nodes.get(data.targetId);
    if (!src||!tgt||!src._el||!tgt._el) return;
    const { sp, tp, cp1, cp2, mid } = _calcPath(src, tgt, data.curvatureIndex);
    const d = `M ${sp.x} ${sp.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${tp.x} ${tp.y}`;
    const g  = data._g;
    const fo = g.querySelector('.e-fo');
    const lbl= fo.querySelector('.e-lbl');
    g.querySelector('.e-hit').setAttribute('d', d);
    const vis = g.querySelector('.e-vis');
    vis.setAttribute('d', d);
    if (_selId !== data.id) {
      const col = _edgeColor(data);
      vis.setAttribute('stroke', col);
      g.querySelector('.arr-poly').setAttribute('fill', col);
    }
    if (data.tag) {
      lbl.style.display = 'inline-block';
      LX.render(data.tag, lbl);
      fo.setAttribute('x', mid.x.toString());
      fo.setAttribute('y', mid.y.toString());
    } else { lbl.style.display = 'none'; }
  }

  function updateForNode(nodeId) {
    for (const [id, e] of Store.edges)
      if (e.sourceId===nodeId || e.targetId===nodeId) update(id);
  }

  function remove(id) {
    const data = Store.edges.get(id); if (!data) return;
    data._g?.remove();
    Store.removeEdge(id);
    if (_selId === id) { _selId = null; EB.emit('panel:close'); }
  }

  function clearSel() {
    if (!_selId) return;
    const d = Store.edges.get(_selId);
    if (d) {
      const col = _edgeColor(d);
      d._g.querySelector('.e-vis').setAttribute('stroke', col);
      d._g.querySelector('.arr-poly').setAttribute('fill',  col);
    }
    _selId = null;
  }

  function load(data) {
    const g = _makeGroup(data); data._g = g;
    _svg().appendChild(g); Store.addEdge(data); update(data.id);
    return data;
  }

  function _onEdgeClick(id) {
    EB.emit('sel:clearNodes');
    clearSel();
    _selId = id; App.selEdge = id; App.selNode = null;
    const d = Store.edges.get(id);
    if (d) {
      d._g.querySelector('.e-vis').setAttribute('stroke', '#6366f1');
      d._g.querySelector('.arr-poly').setAttribute('fill',  '#6366f1');
    }
    EB.emit('panel:showEdge', id);
  }

  function init() {
    EB.on('node:moved',      nodeId => updateForNode(nodeId));
    EB.on('edge:create',     ({ srcId, tgtId, opts }) => create(srcId, tgtId, opts));
    EB.on('edge:removeById', id => remove(id));
    EB.on('sel:clearEdges',  () => clearSel());
  }

  return { init, create, update, updateForNode, remove, load, clearSel };
})();

/* ═══════════════════════════════════════════════════════════
   Panel
═══════════════════════════════════════════════════════════ */
const Panel = (() => {
  let _debTimer = null;
  const _el     = id => document.getElementById(id);
  const _panel  = () => _el('panel');
  const _body   = () => _el('panel-body');
  const _title  = () => _el('panel-title');
  const _btnDel = () => _el('btn-del');

  function _debounce(fn) { clearTimeout(_debTimer); _debTimer = setTimeout(fn, 280); }
  function open()  { _panel().classList.add('open'); }

  function close() {
    _panel().classList.remove('open');
    NM.clearAllSel();
    App.selNode = null; App.selEdge = null;
  }

  function _esc(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _field(lbl, html) {
    const div = document.createElement('div'); div.className = 'pf';
    div.innerHTML = `<div class="pf-label">${lbl}</div>${html}`;
    return div;
  }

  function _inp(type, id, val='', ph='') {
    return `<input type="${type}" class="pi" id="${id}" value="${_esc(val)}" placeholder="${_esc(ph)}">`;
  }

  function _buildColorRow(data) {
    const row = document.createElement('div'); row.className = 'color-row';
    NM.COLORS.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'cswatch' + (c===data.color ? ' active' : '');
      sw.style.background = c; sw.dataset.c = c;
      sw.addEventListener('click', () => {
        data.color = c; NM.updateEl(data); EM.updateForNode(data.id);
        row.querySelectorAll('.cswatch').forEach(s => s.classList.toggle('active', s.dataset.c===c));
        cp.value = c;
      });
      row.appendChild(sw);
    });
    const cp = document.createElement('input');
    cp.type='color'; cp.value=data.color; cp.title='Custom color';
    cp.style.cssText='width:22px;height:22px;border:none;padding:0;cursor:pointer;border-radius:50%;overflow:hidden;flex-shrink:0';
    cp.addEventListener('input', () => {
      data.color=cp.value; NM.updateEl(data); EM.updateForNode(data.id);
      row.querySelectorAll('.cswatch').forEach(s=>s.classList.remove('active'));
    });
    row.appendChild(cp);
    return row;
  }

  function showNode(id) {
    const data = Store.nodes.get(id); if (!data) return;
    _title().textContent = 'Node Details';
    _body().innerHTML = '';
    _body().appendChild(_field('Title', _inp('text','pf-title',data.title)));
    const cs=document.createElement('div'); cs.className='pf';
    const cl=document.createElement('div'); cl.className='pf-label'; cl.textContent='Color';
    cs.appendChild(cl); cs.appendChild(_buildColorRow(data));
    _body().appendChild(cs);
    _body().appendChild(_field('Content (LaTeX supported)',`<textarea class="pi" id="pf-ct" rows="6">${_esc(data.content)}</textarea>`));
    _body().appendChild(_field('Preview','<div class="preview-box" id="pf-prev"></div>'));
    const prev = _el('pf-prev');
    LX.render(data.content, prev);
    _el('pf-title').addEventListener('input', e=>{data.title=e.target.value; NM.updateEl(data);});
    _el('pf-ct').addEventListener('input', e=>{
      data.content=e.target.value; NM.updateEl(data);
      _debounce(()=>LX.render(data.content,prev));
    });
    _btnDel().onclick = ()=>{ NM.remove(id); close(); };
    open();
  }

  function showEdge(id) {
    const data=Store.edges.get(id); if (!data) return;
    const src=Store.nodes.get(data.sourceId), tgt=Store.nodes.get(data.targetId);
    _title().textContent='Connection Details';
    _body().innerHTML='';
    const inf=document.createElement('div'); inf.className='pf';
    const il=document.createElement('div'); il.className='pf-label'; il.textContent='Connection';
    const ib=document.createElement('div'); ib.className='edge-info-box';
    ib.innerHTML=`${_esc(src?.title||'?')} <span class="edge-arrow-sym">→</span> ${_esc(tgt?.title||'?')}`;
    inf.appendChild(il); inf.appendChild(ib); _body().appendChild(inf);
    _body().appendChild(_field('Label (LaTeX / text)',_inp('text','pf-tag',data.tag,'Enter label…')));
    _body().appendChild(_field('Preview','<div class="preview-box" id="pf-eprev"></div>'));
    const prev=_el('pf-eprev');
    LX.render(data.tag, prev);
    _el('pf-tag').addEventListener('input',e=>{
      data.tag=e.target.value; EM.update(id);
      _debounce(()=>LX.render(data.tag,prev));
    });
    _btnDel().onclick=()=>{ EM.remove(id); close(); };
    open();
  }

  function init() {
    _el('panel-close').addEventListener('click', close);
    EB.on('panel:showNode', id => showNode(id));
    EB.on('panel:showEdge', id => showEdge(id));
    EB.on('panel:close',    ()  => close());
  }

  return { init, showNode, showEdge, close };
})();

/* ═══════════════════════════════════════════════════════════
   InlinePrompt
═══════════════════════════════════════════════════════════ */
const IP = (() => {
  let _resolve = null;
  let _showing = false;
  const _el  = () => document.getElementById('ip');
  const _inp = () => document.getElementById('ip-input');

  function show(sx, sy) {
    if (_showing) { _resolve?.(null); _resolve = null; }

    return new Promise(resolve => {
      _resolve = resolve;
      _showing = true;

      const vr = document.getElementById('canvas-vp').getBoundingClientRect();
      const px = Math.min(sx, vr.width  - 240);
      const py = Math.max(sy - 95,       10);
      const box = _el();
      box.style.left = px + 'px';
      box.style.top  = py + 'px';
      box.classList.add('show');
      _inp().value = '';
      requestAnimationFrame(() => { _inp().focus(); _inp().select(); });
    });
  }

  function confirm() {
    if (!_showing) return;
    const value = _inp().value.trim();
    _el().classList.remove('show');
    _showing = false;
    if (_resolve) { _resolve(value || null); _resolve = null; }
  }

  function cancel() {
    if (!_showing) return;
    _el().classList.remove('show');
    _showing = false;
    if (_resolve) { _resolve(null); _resolve = null; }
  }

  function init() {
    _inp().addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel();  }
      e.stopPropagation();
    });
    document.addEventListener('mousedown', e => {
      if (_showing && !_el().contains(e.target)) cancel();
    });
  }

  return { init, show, cancel };
})();

/* ═══════════════════════════════════════════════════════════
   IO
═══════════════════════════════════════════════════════════ */
const IO = {
  save() {
    const payload = {
      version: '1.1',
      nodes: [...Store.nodes.values()].map(n => ({
        id: n.id, title: n.title, content: n.content, color: n.color, x: n.x, y: n.y
      })),
      edges: [...Store.edges.values()].map(e => ({
        id: e.id, sourceId: e.sourceId, targetId: e.targetId,
        tag: e.tag, curvatureIndex: e.curvatureIndex
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'graph_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    Status.show('File saved', 2500);
  },

  load(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges))
          throw new Error('Invalid format: missing nodes or edges');
        [...Store.nodes.values()].forEach(n => n._el?.remove());
        [...Store.edges.values()].forEach(e => e._g?.remove());
        Store.clear(); Panel.close();
        data.nodes.forEach(n => NM.load({
          id: n.id, title: n.title||'Node', content: n.content||'',
          color: n.color||'#6366f1', x: +n.x||0, y: +n.y||0, _el: null
        }));
        requestAnimationFrame(() => {
          data.edges.forEach(ed => EM.load({
            id: ed.id, sourceId: ed.sourceId, targetId: ed.targetId,
            tag: ed.tag||'', curvatureIndex: ed.curvatureIndex||0, _g: null
          }));
          const nn = data.nodes.length, ne = data.edges.length;
          Status.show(`Loaded ${nn} node${nn!==1?'s':''} · ${ne} connection${ne!==1?'s':''}`, 3000);
        });
      } catch(err) { Status.show('Load failed: ' + err.message, 3500); }
    };
    reader.readAsText(file);
  }
};

/* ═══════════════════════════════════════════════════════════
   CryptoIO — N-layer RSA-OAEP + AES-GCM encrypted save/load
═══════════════════════════════════════════════════════════ */
const CryptoIO = (() => {
  const RSA_HASH = 'SHA-256';

  // ── Base64 helpers (chunked to avoid stack overflow on large buffers) ──

  function b64enc(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < u8.length; i += CHUNK)
      s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
    return btoa(s);
  }

  function b64dec(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }

  // ── Low-level crypto primitives ──────────────────────────

  async function _genRsaKeyPair() {
    return crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), hash: RSA_HASH },
      true, ['encrypt', 'decrypt']
    );
  }

  async function _genAesKey() {
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );
  }

  async function _aesEncrypt(key, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return { ct: new Uint8Array(ct), iv };
  }

  async function _aesDecrypt(key, ct, iv) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new Uint8Array(pt);
  }

  // Wrap raw AES-256 key bytes with RSA public key
  async function _wrapAes(pubKey, aesKey) {
    const raw = await crypto.subtle.exportKey('raw', aesKey);
    const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, raw);
    return new Uint8Array(wrapped);
  }

  // Unwrap AES key with RSA private key → importable CryptoKey
  async function _unwrapAes(privKey, wrappedBytes) {
    const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, wrappedBytes);
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  }

  async function _importPrivKey(jwk) {
    return crypto.subtle.importKey(
      'jwk', jwk,
      { name: 'RSA-OAEP', hash: RSA_HASH },
      false, ['decrypt']
    );
  }

  // ── Graph payload helpers ────────────────────────────────

  function _buildPayload() {
    return {
      version: '1.1',
      nodes: [...Store.nodes.values()].map(n => ({
        id: n.id, title: n.title, content: n.content, color: n.color, x: n.x, y: n.y
      })),
      edges: [...Store.edges.values()].map(e => ({
        id: e.id, sourceId: e.sourceId, targetId: e.targetId,
        tag: e.tag, curvatureIndex: e.curvatureIndex
      }))
    };
  }

  function _applyPayload(data) {
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges))
      throw new Error('Invalid graph format');
    [...Store.nodes.values()].forEach(n => n._el?.remove());
    [...Store.edges.values()].forEach(e => e._g?.remove());
    Store.clear();
    Panel.close();
    data.nodes.forEach(n => NM.load({
      id: n.id, title: n.title || 'Node', content: n.content || '',
      color: n.color || '#6366f1', x: +n.x || 0, y: +n.y || 0, _el: null
    }));
    requestAnimationFrame(() => {
      data.edges.forEach(ed => EM.load({
        id: ed.id, sourceId: ed.sourceId, targetId: ed.targetId,
        tag: ed.tag || '', curvatureIndex: ed.curvatureIndex || 0, _g: null
      }));
      const nn = data.nodes.length, ne = data.edges.length;
      Status.show(`Decrypted & loaded ${nn} node${nn !== 1 ? 's' : ''} · ${ne} connection${ne !== 1 ? 's' : ''}`, 3500);
    });
  }

  // ── Core: encrypt N layers ───────────────────────────────
  //
  // Encryption order: layer 1 (innermost) → layer N (outermost)
  // Each layer: AES-GCM encrypts data; RSA-OAEP wraps AES key.
  //
  // Output — data file (.enc.json):
  //   { version, algorithm, layers:[{wrappedAesKey,iv}×N], ciphertext }
  //
  // Output — key file (.keys.json):
  //   { version, algorithm, privateKeys:[JWK×N] }
  //
  // N is encoded as privateKeys.length — no need to know it a priori.

  async function encryptSave(n) {
    _setSaveStatus(`Generating ${n} RSA key pair${n > 1 ? 's' : ''}…`);
    let data       = new TextEncoder().encode(JSON.stringify(_buildPayload()));
    const layersInfo    = [];   // goes into data file
    const privateKeyJwks = [];  // goes into key file

    for (let i = 0; i < n; i++) {
      _setSaveStatus(`Encrypting layer ${i + 1} / ${n}…`);
      const kp          = await _genRsaKeyPair();
      const aesKey      = await _genAesKey();
      const { ct, iv }  = await _aesEncrypt(aesKey, data);
      const wrappedAes  = await _wrapAes(kp.publicKey, aesKey);
      const privJwk     = await crypto.subtle.exportKey('jwk', kp.privateKey);

      layersInfo.push({ wrappedAesKey: b64enc(wrappedAes), iv: b64enc(iv) });
      privateKeyJwks.push(privJwk);
      data = ct; // next layer encrypts this ciphertext
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    _download(
      new Blob([JSON.stringify({
        version:   '2.0',
        algorithm: 'RSA-OAEP+AES-GCM',
        layers:    layersInfo,
        ciphertext: b64enc(data)
      })], { type: 'application/json' }),
      `graph_${dateStr}.enc.json`
    );

    // Small delay so browsers don't suppress the second download
    await new Promise(r => setTimeout(r, 350));

    _download(
      new Blob([JSON.stringify({
        version:     '2.0',
        algorithm:   'RSA-OAEP+AES-GCM',
        privateKeys: privateKeyJwks
      })], { type: 'application/json' }),
      `graph_${dateStr}.keys.json`
    );

    _setSaveStatus(`Done! 2 files downloaded (${n}-layer encryption).`);
    setTimeout(_hideSaveModal, 1800);
  }

  // ── Core: decrypt N layers ───────────────────────────────
  //
  // Decryption order: layer N (outermost) → layer 1 (innermost)
  // N is read directly from privateKeys.length in the key file.

  async function decryptLoad(dataText, keyText) {
    const dataObj = JSON.parse(dataText);
    const keyObj  = JSON.parse(keyText);

    if (dataObj.version !== '2.0') throw new Error('Unsupported data file version');
    if (keyObj.version  !== '2.0') throw new Error('Unsupported key file version');

    const privKeys = keyObj.privateKeys;
    const n        = privKeys.length;

    if (!Array.isArray(dataObj.layers) || dataObj.layers.length !== n)
      throw new Error(
        `Key file declares ${n} layer${n !== 1 ? 's' : ''} but data file has ` +
        `${dataObj.layers?.length ?? '?'} — files do not match`
      );

    let ct = b64dec(dataObj.ciphertext);

    // Peel from outermost layer (index n-1) inward to layer 0
    for (let i = n - 1; i >= 0; i--) {
      _setLoadStatus(`Decrypting layer ${n - i} / ${n}…`);
      const privKey = await _importPrivKey(privKeys[i]);
      const layer   = dataObj.layers[i];
      const aesKey  = await _unwrapAes(privKey, b64dec(layer.wrappedAesKey));
      ct = await _aesDecrypt(aesKey, ct, b64dec(layer.iv));
    }

    _applyPayload(JSON.parse(new TextDecoder().decode(ct)));
  }

  // ── UI helpers ───────────────────────────────────────────

  function _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function _setSaveStatus(msg) {
    const el = document.getElementById('cio-save-status');
    if (el) el.textContent = msg;
  }

  function _setLoadStatus(msg) {
    const el = document.getElementById('cio-load-status');
    if (el) el.textContent = msg;
  }

  // ── Secure Save modal ────────────────────────────────────

  function _showSaveModal() {
    document.getElementById('cio-n-input').value = '3';
    _setSaveStatus('');
    document.getElementById('cio-save-go').disabled = false;
    document.getElementById('cio-save-modal').classList.add('open');
    document.getElementById('cio-save-backdrop').classList.add('open');
  }

  function _hideSaveModal() {
    document.getElementById('cio-save-modal').classList.remove('open');
    document.getElementById('cio-save-backdrop').classList.remove('open');
  }

  // ── Secure Load modal ────────────────────────────────────

  let _dataText = null, _keyText = null;

  function _showLoadModal() {
    _dataText = null; _keyText = null;
    document.getElementById('cio-enc-name').textContent = 'Drop or click to select';
    document.getElementById('cio-key-name').textContent = 'Drop or click to select';
    document.getElementById('cio-enc-zone').classList.remove('loaded');
    document.getElementById('cio-key-zone').classList.remove('loaded');
    _setLoadStatus('');
    document.getElementById('cio-load-btn').disabled = true;
    document.getElementById('cio-load-modal').classList.add('open');
    document.getElementById('cio-load-backdrop').classList.add('open');
  }

  function _hideLoadModal() {
    document.getElementById('cio-load-modal').classList.remove('open');
    document.getElementById('cio-load-backdrop').classList.remove('open');
  }

  function _readText(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsText(file);
    });
  }

  function _setupDropZone(zoneId, inputId, nameId, onText) {
    const zone  = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const name  = document.getElementById(nameId);

    zone.addEventListener('click', () => input.click());

    input.addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      name.textContent = f.name;
      zone.classList.add('loaded');
      onText(await _readText(f));
      e.target.value = '';
    });

    zone.addEventListener('dragover', e => {
      e.preventDefault(); zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0]; if (!f) return;
      name.textContent = f.name;
      zone.classList.add('loaded');
      onText(await _readText(f));
    });
  }

  function _checkLoadReady() {
    document.getElementById('cio-load-btn').disabled = !(_dataText && _keyText);
  }

  // ── Init ─────────────────────────────────────────────────

  function init() {
    // Secure Save
    document.getElementById('btn-enc-save').addEventListener('click', _showSaveModal);
    document.getElementById('cio-save-cancel').addEventListener('click', _hideSaveModal);
    document.getElementById('cio-save-backdrop').addEventListener('click', e => {
      if (e.target === e.currentTarget) _hideSaveModal();
    });

    document.getElementById('cio-save-go').addEventListener('click', async () => {
      const n = parseInt(document.getElementById('cio-n-input').value, 10);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        _setSaveStatus('N must be an integer between 1 and 10.');
        return;
      }
      document.getElementById('cio-save-go').disabled = true;
      try {
        await encryptSave(n);
      } catch (err) {
        _setSaveStatus('Error: ' + err.message);
        document.getElementById('cio-save-go').disabled = false;
      }
    });

    // Secure Load
    document.getElementById('btn-enc-load').addEventListener('click', _showLoadModal);
    document.getElementById('cio-load-cancel').addEventListener('click', _hideLoadModal);
    document.getElementById('cio-load-backdrop').addEventListener('click', e => {
      if (e.target === e.currentTarget) _hideLoadModal();
    });

    _setupDropZone('cio-enc-zone', 'cio-enc-inp', 'cio-enc-name', text => {
      _dataText = text; _checkLoadReady();
    });
    _setupDropZone('cio-key-zone', 'cio-key-inp', 'cio-key-name', text => {
      _keyText = text; _checkLoadReady();
    });

    document.getElementById('cio-load-btn').addEventListener('click', async () => {
      const btn = document.getElementById('cio-load-btn');
      btn.disabled = true;
      _setLoadStatus('Decrypting…');
      try {
        await decryptLoad(_dataText, _keyText);
        _hideLoadModal();
      } catch (err) {
        _setLoadStatus('Error: ' + err.message);
        btn.disabled = false;
      }
    });
  }

  return { init };
})();

/* ═══════════════════════════════════════════════════════════
   Toolbar
═══════════════════════════════════════════════════════════ */
const TB = {
  init() {
    const vp = document.getElementById('canvas-vp');

    document.getElementById('btn-node').addEventListener('click', () => App.setMode('place'));
    document.getElementById('btn-conn').addEventListener('click', () =>
      App.setMode(App.mode === 'conn' ? 'default' : 'conn'));
    document.getElementById('btn-save').addEventListener('click', () => IO.save());
    document.getElementById('btn-load').addEventListener('click', () =>
      document.getElementById('file-inp').click());
    document.getElementById('file-inp').addEventListener('change', e => {
      const f = e.target.files[0]; if (f) IO.load(f); e.target.value = '';
    });

    vp.addEventListener('click', async e => {
      if (App.mode !== 'place') return;
      if (e.target.closest('.node') || e.target.closest('.e-hit')) return;
      const canvasPos = Canvas.s2c(e.clientX, e.clientY);
      const vpRect    = vp.getBoundingClientRect();
      const title = await IP.show(e.clientX - vpRect.left, e.clientY - vpRect.top);
      if (title) {
        NM.create(title, canvasPos.x, canvasPos.y);
        Status.show('Node created', 2000);
      }
      App.setMode('default');
    });

    vp.addEventListener('dblclick', async e => {
      if (App.mode !== 'default') return;
      if (e.target.closest('.node') || e.target.closest('.e-hit')) return;
      const canvasPos = Canvas.s2c(e.clientX, e.clientY);
      const vpRect    = vp.getBoundingClientRect();
      const title = await IP.show(e.clientX - vpRect.left, e.clientY - vpRect.top);
      if (title) NM.create(title, canvasPos.x, canvasPos.y);
    });

    vp.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('.node') || e.target.closest('.e-hit')) return;
      if (App.mode === 'default') { NM.clearAllSel(); Panel.close(); }
      if (App.mode === 'conn')    { NM.cancelConn(); }
    });

    vp.addEventListener('contextmenu', e => {
      if (!e.target.closest('.node')) {
        e.preventDefault(); NM.cancelConn();
        if (App.mode === 'default') Status.hide();
      }
    });

    window.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea')) return;
      switch (e.key) {
        case 'Escape':
          App.setMode('default'); NM.cancelConn();
          IP.cancel(); Panel.close(); Status.hide(); break;
        case 'n': case 'N': App.setMode('place'); break;
        case 'c': case 'C': App.setMode(App.mode==='conn'?'default':'conn'); break;
        case 'Delete': case 'Backspace':
          if (e.ctrlKey) break;
          if (App.selNode) { NM.remove(App.selNode); Panel.close(); App.selNode=null; }
          else if (App.selEdge) { EM.remove(App.selEdge); Panel.close(); App.selEdge=null; }
          break;
        case 's': case 'S':
          if (e.ctrlKey||e.metaKey) { e.preventDefault(); IO.save(); } break;
      }
    });
  }
};

/* ═══════════════════════════════════════════════════════════
   SearchModule
═══════════════════════════════════════════════════════════ */
const SM = (() => {
  const DEBOUNCE_MS   = 130;
  const MAX_RESULTS   = 8;
  const FOCUS_SCALE   = 1.3;
  const CONTENT_STRIP = 52;

  let _debTimer   = null;
  let _highlights = new Set();

  const _$      = id => document.getElementById(id);
  const _input  = ()  => _$('sm-input');
  const _dd     = ()  => _$('sm-dropdown');
  const _widget = ()  => _$('sm-widget');
  const _clrBtn = ()  => _$('sm-clear');

  /* ── highlight management ── */
  function clearHighlights() {
    _highlights.forEach(id => {
      Store.nodes.get(id)?._el?.classList.remove('search-match');
    });
    _highlights.clear();
  }

  function _highlightAll(q) {
    clearHighlights();
    if (!q) return 0;
    const lower = q.toLowerCase();
    let count = 0;
    for (const [id, nd] of Store.nodes) {
      const hit = (nd.title   || '').toLowerCase().includes(lower) ||
                  (nd.content || '').toLowerCase().includes(lower);
      if (hit) {
        nd._el?.classList.add('search-match');
        _highlights.add(id);
        count++;
      }
    }
    return count;
  }

  function _highlightOne(id) {
    clearHighlights();
    const nd = Store.nodes.get(id);
    if (!nd) return;
    nd._el?.classList.add('search-match');
    _highlights.add(id);
  }

  /* ── canvas focus ── */
  function _focusNode(id) {
    const nd = Store.nodes.get(id);
    if (!nd || !nd._el) return;
    const w = nd._el.offsetWidth  || 120;
    const h = nd._el.offsetHeight || 40;
    Canvas.focusOn(nd.x + w / 2, nd.y + h / 2, FOCUS_SCALE);
  }

  /* ── match computation ── */
  function _getMatches(q) {
    if (!q) return [];
    const lower   = q.toLowerCase();
    const results = [];
    for (const [, nd] of Store.nodes) {
      const hit = (nd.title   || '').toLowerCase().includes(lower) ||
                  (nd.content || '').toLowerCase().includes(lower);
      if (hit) {
        results.push(nd);
        if (results.length >= MAX_RESULTS) break;
      }
    }
    return results;
  }

  /* ── dropdown rendering ── */
  function _esc(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _hlText(text, q) {
    if (!q) return _esc(text);
    const idx = (text||'').toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return _esc(text);
    return _esc(text.slice(0,idx)) +
           '<mark>' + _esc(text.slice(idx, idx+q.length)) + '</mark>' +
           _esc(text.slice(idx+q.length));
  }

  function _strip(s) {
    return (s||'').replace(/\$+/g,'').substring(0, CONTENT_STRIP);
  }

  function _renderDD(matches, q) {
    const dd = _dd();
    dd.innerHTML = '';
    if (!matches.length) { dd.classList.remove('open'); return; }

    matches.forEach(nd => {
      const item = document.createElement('div');
      item.className = 'sd-item';

      const titleEl = document.createElement('div');
      titleEl.className = 'sd-title';
      titleEl.innerHTML = _hlText(nd.title || 'Untitled', q);
      item.appendChild(titleEl);

      const stripped = _strip(nd.content);
      if (stripped) {
        const sub = document.createElement('div');
        sub.className = 'sd-sub';
        sub.innerHTML = _hlText(stripped, q);
        item.appendChild(sub);
      }

      item.addEventListener('mousedown', e => {
        e.preventDefault();
        _highlightOne(nd.id);
        _focusNode(nd.id);
        _input().value = nd.title;
        _clrBtn().classList.add('visible');
        dd.classList.remove('open');
      });

      dd.appendChild(item);
    });
    dd.classList.add('open');
  }

  /* ── handlers ── */
  function _onInput() {
    const q = (_input().value||'').trim();
    _clrBtn().classList.toggle('visible', q.length > 0);
    clearTimeout(_debTimer);
    _debTimer = setTimeout(() => _renderDD(_getMatches(q), q), DEBOUNCE_MS);
  }

  function _onSearch() {
    const q = (_input().value||'').trim();
    _dd().classList.remove('open');
    _highlightAll(q);
  }

  function _onClear() {
    _input().value = '';
    _clrBtn().classList.remove('visible');
    clearHighlights();
    _dd().classList.remove('open');
    _input().focus();
  }

  /* ── DOM build ── */
  function _buildWidget() {
    const w = document.createElement('div');
    w.id = 'sm-widget';
    w.innerHTML = `
      <div id="sm-bar">
        <svg class="sm-icon" viewBox="0 0 16 16" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="6.5" cy="6.5" r="4.5"/>
          <line x1="10" y1="10" x2="14" y2="14"/>
        </svg>
        <input id="sm-input" type="text"
               placeholder="Search nodes…"
               autocomplete="off" spellcheck="false">
        <button id="sm-clear" class="sm-icon-btn" title="Clear">
          <svg viewBox="0 0 16 16" fill="none"
               stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="4" y1="4" x2="12" y2="12"/>
            <line x1="12" y1="4" x2="4" y2="12"/>
          </svg>
        </button>
        <div class="sm-divider"></div>
        <button id="sm-btn" class="sm-icon-btn sm-go" title="Search (Enter)">
          <svg viewBox="0 0 16 16" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="6.5" cy="6.5" r="4.5"/>
            <line x1="10" y1="10" x2="14" y2="14"/>
          </svg>
        </button>
      </div>
      <div id="sm-dropdown"></div>
    `;
    return w;
  }

  /* ── public init ── */
  function init() {
    // Widget HTML is already in the toolbar (index.html); just wire up events.
    const inp = _input();
    if (!inp) return;
    inp.addEventListener('input', _onInput);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); _onSearch(); }
      if (e.key === 'Escape') { _onClear(); }
      e.stopPropagation();
    });
    inp.addEventListener('focus', () => {
      const q = (inp.value||'').trim();
      if (q) _renderDD(_getMatches(q), q);
    });
    inp.addEventListener('blur', () => {
      setTimeout(() => _dd().classList.remove('open'), 160);
    });

    _$('sm-btn').addEventListener('click', _onSearch);
    _clrBtn().addEventListener('click', _onClear);

    document.addEventListener('mousedown', e => {
      if (!_widget()?.contains(e.target)) _dd().classList.remove('open');
    });
  }

  return { init, clearHighlights };
})();

/* ═══════════════════════════════════════════════════════════
   DarkMode — toggle + localStorage persistence
═══════════════════════════════════════════════════════════ */
const DarkMode = (() => {
  const KEY = 'vg-dark';

  function _apply(dark) {
    document.body.classList.toggle('dark', dark);
  }

  function toggle() {
    const next = !document.body.classList.contains('dark');
    _apply(next);
    try { localStorage.setItem(KEY, next ? '1' : '0'); } catch (_) {}
  }

  function init() {
    // Restore saved preference; fall back to system preference
    let saved;
    try { saved = localStorage.getItem(KEY); } catch (_) {}
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    _apply(saved !== null ? saved === '1' : prefersDark);

    document.getElementById('btn-dark').addEventListener('click', toggle);
  }

  return { init };
})();

/* ═══════════════════════════════════════════════════════════
   Boot
═══════════════════════════════════════════════════════════ */
function boot() {
  Canvas.init();
  NM.init();
  EM.init();
  Panel.init();
  IP.init();
  TB.init();
  SM.init();
  CryptoIO.init();
  DarkMode.init();
  Status.show('Double-click to create node · N=Place · C=Connect · Del=Delete · Ctrl+S=Save', 6000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
