/**
 * EdgeModule (EM) — edge (arrow) lifecycle management
 *
 * Each edge is a <g> containing:
 *   defs > marker   — arrowhead (per-edge ID to avoid conflicts)
 *   path.e-hit      — wide transparent path for hit-testing
 *   path.e-vis      — visible cubic Bézier curve
 *   foreignObject   — KaTeX-rendered label
 *
 * Parallel edges (same endpoint pair) get staggered curvature offsets.
 *
 * Listens to EB:
 *   node:moved      — recalculate connected edge paths
 *   edge:create     — create new edge
 *   edge:removeById — delete edge (cascade from node deletion)
 *   sel:clearEdges  — clear edge selection style
 *
 * Emits via EB:
 *   sel:clearNodes  — clear node selection
 *   panel:showEdge  — open edge detail panel
 *   panel:close     — close panel when selected edge is deleted
 */

import { EB }    from '../core/EventBus.js';
import { Store } from '../core/Store.js';
import { LX }    from '../core/LatexUtil.js';
import { App }   from '../state/AppState.js';

const NS   = 'http://www.w3.org/2000/svg';
const FO_W = 300, FO_H = 80;
let _uidSeq = 0;
let _selId  = null;

function _svg() { return document.getElementById('edges-group'); }

function _makeGroup(data) {
  const g = document.createElementNS(NS, 'g');
  g.id = data.id;

  const defs   = document.createElementNS(NS, 'defs');
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id',          'mk_' + data.id);
  marker.setAttribute('markerWidth',  '8');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('refX',         '7');
  marker.setAttribute('refY',         '3');
  marker.setAttribute('orient',       'auto');
  marker.setAttribute('markerUnits',  'strokeWidth');
  const poly = document.createElementNS(NS, 'polygon');
  poly.setAttribute('points', '0 0, 8 3, 0 6');
  poly.setAttribute('fill', '#94a3b8');
  poly.classList.add('arr-poly');
  marker.appendChild(poly);
  defs.appendChild(marker);
  g.appendChild(defs);

  const hit = document.createElementNS(NS, 'path');
  hit.setAttribute('fill',           'none');
  hit.setAttribute('stroke',         'rgba(0,0,0,0.001)');
  hit.setAttribute('stroke-width',   '18');
  hit.setAttribute('pointer-events', 'all');
  hit.style.cursor = 'pointer';
  hit.classList.add('e-hit');
  g.appendChild(hit);

  const vis = document.createElementNS(NS, 'path');
  vis.setAttribute('fill',           'none');
  vis.setAttribute('stroke',         '#94a3b8');
  vis.setAttribute('stroke-width',   '2');
  vis.setAttribute('marker-end',     `url(#mk_${data.id})`);
  vis.setAttribute('pointer-events', 'none');
  vis.classList.add('e-vis');
  g.appendChild(vis);

  const fo = document.createElementNS(NS, 'foreignObject');
  fo.setAttribute('width',  String(FO_W));
  fo.setAttribute('height', String(FO_H));
  fo.style.pointerEvents = 'none';
  fo.classList.add('e-fo');

  // Explicit dimensions — no overflow tricks needed, works on all mobile browsers.
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:100%;height:100%';

  const lbl = document.createElement('div');
  lbl.classList.add('e-lbl');
  lbl.style.display = data.tag ? 'inline-block' : 'none';
  wrap.appendChild(lbl);
  fo.appendChild(wrap);
  g.appendChild(fo);

  hit.addEventListener('click', e => { e.stopPropagation(); _onEdgeClick(data.id); });
  hit.addEventListener('mouseenter', () => {
    vis.setAttribute('stroke', '#6366f1');
    poly.setAttribute('fill',  '#6366f1');
  });
  hit.addEventListener('mouseleave', () => {
    if (_selId !== data.id) {
      vis.setAttribute('stroke', '#94a3b8');
      poly.setAttribute('fill',  '#94a3b8');
    }
  });

  return g;
}

function _calcPath(src, tgt, curvatureIndex) {
  const sw = src._el.offsetWidth  || 120;
  const sh = src._el.offsetHeight || 40;
  const tw = tgt._el.offsetWidth  || 120;
  const th = tgt._el.offsetHeight || 40;

  const scx = src.x + sw / 2,  scy = src.y + sh / 2;
  const tcx = tgt.x + tw / 2,  tcy = tgt.y + th / 2;

  const dx   = tcx - scx, dy = tcy - scy;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;

  const sideSign = (curvatureIndex === 0) ? 0
    : (curvatureIndex % 2 === 1 ? 1 : -1);
  const sideLevel = Math.ceil(curvatureIndex / 2);
  const offset = (curvatureIndex === 0)
    ? dist * 0.12
    : dist * (0.25 + (sideLevel - 1) * 0.18) * sideSign;

  const nx = -dy / dist, ny = dx / dist;

  const cp1 = { x: scx + dx * 0.3 + nx * offset, y: scy + dy * 0.3 + ny * offset };
  const cp2 = { x: scx + dx * 0.7 + nx * offset, y: scy + dy * 0.7 + ny * offset };

  const sp    = _borderPt(sw, sh, scx, scy, cp1.x, cp1.y);
  const tpRaw = _borderPt(tw, th, tcx, tcy, cp2.x, cp2.y);

  const adx = tpRaw.x - cp2.x, ady = tpRaw.y - cp2.y;
  const ad  = Math.sqrt(adx * adx + ady * ady) || 1;
  const tp  = { x: tpRaw.x - (adx / ad) * 9, y: tpRaw.y - (ady / ad) * 9 };

  const mid = _bezPt({ x: scx, y: scy }, cp1, cp2, { x: tcx, y: tcy }, 0.5);

  return { sp, tp, cp1, cp2, mid };
}

function _borderPt(w, h, cx, cy, toX, toY) {
  const dx = toX - cx, dy = toY - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const margin = 5;
  const t = Math.abs(dx) * h > Math.abs(dy) * w
    ? (w / 2 + margin) / Math.abs(dx)
    : (h / 2 + margin) / Math.abs(dy);
  return { x: cx + dx * t, y: cy + dy * t };
}

function _bezPt(p0, c1, c2, p1, t) {
  const m = 1 - t;
  return {
    x: m*m*m*p0.x + 3*m*m*t*c1.x + 3*m*t*t*c2.x + t*t*t*p1.x,
    y: m*m*m*p0.y + 3*m*m*t*c1.y + 3*m*t*t*c2.y + t*t*t*p1.y
  };
}

function create(srcId, tgtId, opts = {}) {
  const parallelCount = [...Store.edges.values()].filter(e =>
    (e.sourceId === srcId && e.targetId === tgtId) ||
    (e.sourceId === tgtId && e.targetId === srcId)
  ).length;

  const data = {
    id:             'e' + Date.now() + (++_uidSeq),
    sourceId:       srcId,
    targetId:       tgtId,
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
  if (!src || !tgt || !src._el || !tgt._el) return;

  const { sp, tp, cp1, cp2, mid } = _calcPath(src, tgt, data.curvatureIndex);
  const d = `M ${sp.x} ${sp.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${tp.x} ${tp.y}`;

  const g   = data._g;
  const fo  = g.querySelector('.e-fo');
  const lbl = fo.querySelector('.e-lbl');

  g.querySelector('.e-hit').setAttribute('d', d);
  g.querySelector('.e-vis').setAttribute('d', d);

  if (data.tag) {
    lbl.style.display = 'inline-block';
    LX.render(data.tag, lbl);
    fo.setAttribute('x', (mid.x - FO_W / 2).toString());
    fo.setAttribute('y', (mid.y - FO_H / 2).toString());
  } else {
    lbl.style.display = 'none';
  }
}

function updateForNode(nodeId) {
  for (const [id, edge] of Store.edges)
    if (edge.sourceId === nodeId || edge.targetId === nodeId)
      update(id);
}

function remove(id) {
  const data = Store.edges.get(id); if (!data) return;
  data._g?.remove();
  Store.removeEdge(id);
  if (_selId === id) {
    _selId = null;
    EB.emit('panel:close');
  }
}

function clearSel() {
  if (!_selId) return;
  const d = Store.edges.get(_selId);
  if (d) {
    d._g.querySelector('.e-vis').setAttribute('stroke', '#94a3b8');
    d._g.querySelector('.arr-poly').setAttribute('fill',  '#94a3b8');
  }
  _selId = null;
}

function load(data) {
  const g = _makeGroup(data);
  data._g = g;
  _svg().appendChild(g);
  Store.addEdge(data);
  update(data.id);
  return data;
}

function _onEdgeClick(id) {
  EB.emit('sel:clearNodes');
  clearSel();

  _selId = id;
  App.selEdge = id;
  App.selNode = null;

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

export const EM = {
  init,
  create, update, updateForNode,
  remove, load, clearSel
};
