'use strict';

/* ═══════════════════════════════════════════════════════════
   NodeModule
   deps: EB, Store, App, Canvas, Status, LX
═══════════════════════════════════════════════════════════ */
const NM = (() => {
  const COLORS    = ['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6','#8b5cf6'];
  const DEF_COLOR = '#6366f1';
  let _seq       = 0;
  let drag       = null;
  let _dragMoved = false;   // persists after drag=null so _onClick can read it
  let connSrc    = null;
  let qConnSrc   = null;

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
    el.style.setProperty('--nc', data.color);

    const body = document.createElement('div');
    body.className = 'node-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'node-title';
    LX.render(data.title, titleEl);
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

  function updateEl(data, skipPos) {
    const el = data._el; if (!el) return;
    if (!skipPos) {
      el.style.left = data.x + 'px';
      el.style.top  = data.y + 'px';
    }
    el.querySelector('.node-bar').style.background = data.color;
    el.style.setProperty('--nc', data.color);
    LX.render(data.title, el.querySelector('.node-title'));
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

  function _clearSelDOM() {
    document.querySelectorAll('.node.sel').forEach(el => el.classList.remove('sel'));
  }

  function clearConnHL() {
    document.querySelectorAll('.node.conn-src').forEach(el => el.classList.remove('conn-src'));
  }

  function clearAllSel() {
    _clearSelDOM();
    EB.emit('sel:clearEdges');
  }

  function cancelConn() { connSrc = qConnSrc = null; clearConnHL(); }

  function _onMD(e, id) {
    if (e.button !== 0 || App.mode === 'conn') return;
    e.stopPropagation();
    const d = Store.nodes.get(id); if (!d) return;
    drag = { id, smx: e.clientX, smy: e.clientY, sx: d.x, sy: d.y, moved: false, sc: Canvas.get().sc };
    _dragMoved = false;
    e.preventDefault();
  }

  function _onClick(e, id) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (_dragMoved) { _dragMoved = false; return; }
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

  function _connFlow(getRef, setRef, id, hint, doneMsg) {
    const src = getRef();
    if (!src) {
      setRef(id); clearConnHL();
      Store.nodes.get(id)?._el.classList.add('conn-src');
      Status.show(hint);
    } else {
      setRef(null); clearConnHL();
      if (src !== id) {
        EB.emit('edge:create', { srcId: src, tgtId: id });
        Status.show(doneMsg, 2000);
      } else {
        Status.show('Cannot connect a node to itself', 2000);
      }
    }
  }

  function _handleConn(id) {
    _connFlow(() => connSrc,  v => { connSrc  = v; }, id,
      'Source selected — click target node', 'Connection created');
  }

  function _handleQConn(id) {
    _connFlow(() => qConnSrc, v => { qConnSrc = v; }, id,
      'Right-click target node to quick-connect', 'Quick connection created');
  }

  function init() {
    EB.on('sel:clearNodes', () => { _clearSelDOM(); App.selNode = null; });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      const dx = (e.clientX - drag.smx) / drag.sc;
      const dy = (e.clientY - drag.smy) / drag.sc;
      if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) { drag.moved = true; _dragMoved = true; }
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
