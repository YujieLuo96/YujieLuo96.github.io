'use strict';

/* ═══════════════════════════════════════════════════════════
   EdgeModule
   deps: EB, Store, App, LX
═══════════════════════════════════════════════════════════ */
const EM = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  let _seq      = 0;
  let _selId    = null;
  let _lblLayer = null;
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

  // Label lives in #canvas-world (HTML layer), same coordinate space as nodes.
  // This avoids foreignObject-inside-transformed-SVG, which is broken on iOS Safari.
  function _makeLabel() {
    const lbl = document.createElement('div');
    lbl.className = 'e-lbl';
    lbl.style.display = 'none';
    _lblLayer.appendChild(lbl);
    return lbl;
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
      _g: null, _lbl: null
    };
    data._g   = _makeGroup(data);
    data._lbl = _makeLabel();
    _svg().appendChild(data._g);
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
    const d   = `M ${sp.x} ${sp.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${tp.x} ${tp.y}`;
    const g   = data._g;
    const lbl = data._lbl;
    g.querySelector('.e-hit').setAttribute('d', d);
    const vis = g.querySelector('.e-vis');
    vis.setAttribute('d', d);
    if (_selId !== data.id) {
      const col = _edgeColor(data);
      vis.setAttribute('stroke', col);
      g.querySelector('.arr-poly').setAttribute('fill', col);
    }
    if (lbl) {
      if (data.tag) {
        lbl.style.display = 'inline-block';
        lbl.style.left    = mid.x + 'px';
        lbl.style.top     = mid.y + 'px';
        LX.render(data.tag, lbl);
      } else {
        lbl.style.display = 'none';
      }
    }
  }

  function updateForNode(nodeId) {
    for (const [id, e] of Store.edges)
      if (e.sourceId===nodeId || e.targetId===nodeId) update(id);
  }

  function remove(id) {
    const data = Store.edges.get(id); if (!data) return;
    data._g?.remove();
    data._lbl?.remove();
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
    data._g   = _makeGroup(data);
    data._lbl = _makeLabel();
    _svg().appendChild(data._g);
    Store.addEdge(data);
    update(data.id);
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
    _lblLayer = document.createElement('div');
    _lblLayer.id = 'edge-labels';
    document.getElementById('canvas-world').appendChild(_lblLayer);

    EB.on('node:moved',      nodeId => updateForNode(nodeId));
    EB.on('edge:create',     ({ srcId, tgtId, opts }) => create(srcId, tgtId, opts));
    EB.on('edge:removeById', id => remove(id));
    EB.on('sel:clearEdges',  () => clearSel());
  }

  return { init, create, update, updateForNode, remove, load, clearSel };
})();
