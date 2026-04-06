/**
 * NodeModule (NM) — node lifecycle management
 *
 * Responsibilities:
 *   - Create / load / delete node data and DOM elements
 *   - Mouse drag (emits node:moved via EB)
 *   - Left-click connect mode selection / right-click quick-connect
 *   - Selection state (coordinated with EdgeModule via EB)
 *
 * Emits via EB:
 *   node:moved      — node position changed
 *   edge:create     — request EdgeModule to create an edge
 *   edge:removeById — cascade-delete edges on node removal
 *   sel:clearEdges  — clear edge selection
 *   panel:showNode  — open node detail panel
 *
 * Listens to EB:
 *   sel:clearNodes  — clear node selection styles
 */

import { EB }     from '../core/EventBus.js';
import { Store }  from '../core/Store.js';
import { Canvas } from './Canvas.js';
import { App }    from '../state/AppState.js';
import { Status } from '../state/StatusBar.js';

export const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444',
  '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6'
];

const DEF_COLOR = '#6366f1';
let _uidSeq = 0;

let connSrc  = null;
let qConnSrc = null;
let drag = null;

function makeEl(data) {
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
    prev.textContent = _stripLatex(data.content);
    body.appendChild(prev);
  }

  el.appendChild(bar);
  el.appendChild(body);

  el.addEventListener('mousedown',   e => _onMouseDown(e, data.id));
  el.addEventListener('click',       e => _onClick(e, data.id));
  el.addEventListener('contextmenu', e => _onContextMenu(e, data.id));

  return el;
}

function _stripLatex(src) {
  return src.replace(/\$+/g, '').substring(0, 50);
}

function create(title, cx, cy, opts = {}) {
  const data = {
    id:      'n' + Date.now() + (++_uidSeq),
    title:   title || 'Node',
    content: opts.content || '',
    color:   opts.color   || DEF_COLOR,
    x: cx, y: cy,
    _el: null
  };

  const el = makeEl(data);
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
  const el = makeEl(data);
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
    prev.textContent = _stripLatex(data.content);
  } else if (prev) {
    prev.remove();
  }
}

function remove(id) {
  [...Store.edges.values()]
    .filter(e => e.sourceId === id || e.targetId === id)
    .forEach(e => EB.emit('edge:removeById', e.id));

  const data = Store.nodes.get(id);
  if (!data) return;
  data._el?.remove();
  Store.removeNode(id);
}

function clearConnHL() {
  document.querySelectorAll('.node.conn-src')
    .forEach(el => el.classList.remove('conn-src'));
}

function clearAllSel() {
  document.querySelectorAll('.node.sel').forEach(el => el.classList.remove('sel'));
  EB.emit('sel:clearEdges');
}

function cancelConn() {
  connSrc = qConnSrc = null;
  clearConnHL();
}

function _onMouseDown(e, id) {
  if (e.button !== 0) return;
  if (App.mode === 'conn') return;
  e.stopPropagation();
  const data = Store.nodes.get(id); if (!data) return;
  drag = {
    id, moved: false,
    smx: e.clientX, smy: e.clientY,
    sx:  data.x,    sy:  data.y,
    sc:  Canvas.get().sc
  };
  e.preventDefault();
}

function _onClick(e, id) {
  if (e.button !== 0) return;
  e.stopPropagation();
  if (drag?.moved) return;

  if (App.mode === 'conn')  { _handleConnClick(id);  return; }
  if (App.mode === 'place') return;

  clearAllSel();
  App.selNode = id;
  App.selEdge = null;
  Store.nodes.get(id)?._el.classList.add('sel');
  EB.emit('panel:showNode', id);
}

function _onContextMenu(e, id) {
  e.preventDefault();
  e.stopPropagation();
  _handleQConnClick(id);
}

function _handleConnClick(id) {
  if (!connSrc) {
    connSrc = id;
    clearConnHL();
    Store.nodes.get(id)?._el.classList.add('conn-src');
    Status.show('Source selected — click target node');
  } else {
    const src = connSrc, tgt = id;
    connSrc = null;
    clearConnHL();
    if (src !== tgt) {
      EB.emit('edge:create', { srcId: src, tgtId: tgt });
      Status.show('Connection created', 2000);
    } else {
      Status.show('Cannot connect a node to itself', 2000);
    }
  }
}

function _handleQConnClick(id) {
  if (!qConnSrc) {
    qConnSrc = id;
    clearConnHL();
    Store.nodes.get(id)?._el.classList.add('conn-src');
    Status.show('Right-click target node to quick-connect');
  } else {
    const src = qConnSrc, tgt = id;
    qConnSrc = null;
    clearConnHL();
    if (src !== tgt) {
      EB.emit('edge:create', { srcId: src, tgtId: tgt });
      Status.show('Quick connection created', 2000);
    } else {
      Status.show('Cannot connect a node to itself', 2000);
    }
  }
}

function _layer() {
  return document.getElementById('nodes-layer');
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

    const data = Store.nodes.get(drag.id); if (!data) return;
    data.x = drag.sx + dx;
    data.y = drag.sy + dy;
    data._el.style.left = data.x + 'px';
    data._el.style.top  = data.y + 'px';
    EB.emit('node:moved', drag.id);
  });

  window.addEventListener('mouseup', () => { drag = null; });
}

export const NM = {
  init,
  create, load, remove, updateEl,
  clearConnHL, clearAllSel, cancelConn,
  COLORS
};
