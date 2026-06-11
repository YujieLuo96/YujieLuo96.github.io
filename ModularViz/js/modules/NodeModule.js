'use strict';

/* ═══════════════════════════════════════════════════════════
   NodeModule — node lifecycle, selection (single + multi),
   drag (single + group), connect flows, duplicate, nudge
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
  let _selSet    = new Set();

  const _layer = () => document.getElementById('nodes-layer');

  function _genId() { return 'n' + Date.now().toString(36) + '_' + (++_seq); }

  // Adds a bottom fade only when the preview actually overflows its
  // max-height (a mask on short previews would dim their last line).
  function _markClipped(prevEl) {
    if (!prevEl) return;
    requestAnimationFrame(() => {
      prevEl.classList.toggle('clipped', prevEl.scrollHeight > prevEl.clientHeight + 2);
    });
  }

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
    el._lastTitle = data.title;
    body.appendChild(titleEl);

    if (data.content) {
      const prev = document.createElement('div');
      prev.className = 'node-preview';
      LX.renderPreview(data.content, prev);
      body.appendChild(prev);
      _markClipped(prev);
    }
    el._lastContent = data.content;

    el.appendChild(bar);
    el.appendChild(body);
    el.addEventListener('mousedown',   e => _onMD(e, data.id));
    el.addEventListener('click',       e => _onClick(e, data.id));
    el.addEventListener('contextmenu', e => _onRC(e, data.id));
    el.addEventListener('dblclick',    e => {
      e.stopPropagation();
      // First click of the pair already opened the panel for this node
      if (App.mode === 'default' && !e.shiftKey && App.selNode === data.id)
        EB.emit('panel:focusTitle');
    });
    return el;
  }

  function create(title, cx, cy, opts = {}) {
    const data = {
      id:      _genId(),
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
      EB.emit('graph:changed');
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
    // KaTeX is not free — re-render title/preview only on actual change
    let resized = false;
    if (el._lastTitle !== data.title) {
      LX.render(data.title, el.querySelector('.node-title'));
      el._lastTitle = data.title;
      resized = true;
    }
    if (el._lastContent !== data.content) {
      let prev = el.querySelector('.node-preview');
      if (data.content) {
        if (!prev) {
          prev = document.createElement('div');
          prev.className = 'node-preview';
          el.querySelector('.node-body').appendChild(prev);
        }
        LX.renderPreview(data.content, prev);
        _markClipped(prev);
      } else if (prev) prev.remove();
      el._lastContent = data.content;
      resized = true;
    }
    if (resized) EB.emit('node:moved', data.id);   // size may have changed → reroute edges
  }

  function remove(id) {
    [...Store.edges.values()]
      .filter(e => e.sourceId === id || e.targetId === id)
      .forEach(e => EB.emit('edge:removeById', e.id));
    const data = Store.nodes.get(id); if (!data) return;
    data._el?.remove();
    Store.removeNode(id);
    _selSet.delete(id);
    if (App.selNode === id) App.selNode = null;
    EB.emit('graph:changed');
  }

  /* ── Selection ─────────────────────────────────────────── */

  function _clearSelDOM() {
    document.querySelectorAll('.node.sel').forEach(el => el.classList.remove('sel'));
  }

  function setSelection(ids) {
    _clearSelDOM();
    _selSet = new Set(ids.filter(id => Store.nodes.has(id)));
    _selSet.forEach(id => Store.nodes.get(id)._el?.classList.add('sel'));
    EB.emit('sel:clearEdges');
    App.selEdge = null;
    App.selNode = _selSet.size === 1 ? [..._selSet][0] : null;
  }

  function toggleSel(id) {
    const next = new Set(_selSet);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelection([...next]);
  }

  function getSelectedIds() { return [..._selSet]; }

  function clearConnHL() {
    document.querySelectorAll('.node.conn-src').forEach(el => el.classList.remove('conn-src'));
  }

  function clearAllSel() { setSelection([]); }

  function cancelConn() {
    connSrc = qConnSrc = null;
    clearConnHL();
    EB.emit('edge:preview:clear');
  }

  /* ── Bulk operations ───────────────────────────────────── */

  /** Delete every selected node (with its edges). Returns count removed. */
  function removeSelection() {
    const ids = getSelectedIds();
    ids.forEach(id => remove(id));
    if (ids.length) Status.show(`Deleted ${ids.length} node${ids.length !== 1 ? 's' : ''}`, 2000);
    return ids.length;
  }

  /** Duplicate selected nodes + the edges between them, offset slightly. */
  function duplicateSelection() {
    const ids = getSelectedIds();
    if (!ids.length) { Status.show('Select a node first (click, or Shift+drag a box)', 2200); return; }
    const OFF = 28;
    const idMap = new Map();
    ids.forEach(oldId => {
      const n = Store.nodes.get(oldId); if (!n) return;
      const nid = _genId();
      idMap.set(oldId, nid);
      load({ id: nid, title: n.title, content: n.content, color: n.color,
             x: n.x + OFF, y: n.y + OFF, _el: null });
    });
    [...Store.edges.values()].forEach(ed => {
      if (idMap.has(ed.sourceId) && idMap.has(ed.targetId)) {
        EB.emit('edge:create', {
          srcId: idMap.get(ed.sourceId), tgtId: idMap.get(ed.targetId),
          opts: { tag: ed.tag, curvatureIndex: ed.curvatureIndex }
        });
      }
    });
    setSelection([...idMap.values()]);
    Status.show(`Duplicated ${idMap.size} node${idMap.size !== 1 ? 's' : ''}`, 2000);
    EB.emit('graph:changed');
  }

  /** Move selection by (dx, dy) canvas units. Returns true if anything moved. */
  function nudgeSelection(dx, dy) {
    const ids = getSelectedIds();
    if (!ids.length) return false;
    ids.forEach(id => {
      const d = Store.nodes.get(id); if (!d) return;
      d.x += dx; d.y += dy;
      d._el.style.left = d.x + 'px';
      d._el.style.top  = d.y + 'px';
      EB.emit('node:moved', id);
    });
    return true;
  }

  /* ── Mouse interaction ─────────────────────────────────── */

  function _onMD(e, id) {
    if (e.button !== 0 || App.mode === 'conn') return;
    e.stopPropagation();
    const d = Store.nodes.get(id); if (!d) return;
    // Dragging a member of a multi-selection drags the whole selection
    const ids = (_selSet.has(id) && _selSet.size > 1) ? [..._selSet] : [id];
    drag = {
      entries: ids.map(i => { const n = Store.nodes.get(i); return { id: i, sx: n.x, sy: n.y }; }),
      smx: e.clientX, smy: e.clientY, moved: false, sc: Canvas.get().sc
    };
    _dragMoved = false;
    e.preventDefault();
  }

  function _onClick(e, id) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (_dragMoved) { _dragMoved = false; return; }
    if (App.mode === 'conn')  { _handleConn(id);  return; }
    if (App.mode === 'place') return;
    if (e.shiftKey) { toggleSel(id); return; }   // multi-select; no panel
    setSelection([id]);
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
      EB.emit('edge:preview:clear');
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
    EB.on('sel:clearNodes', () => { _clearSelDOM(); _selSet.clear(); App.selNode = null; });

    window.addEventListener('mousemove', e => {
      if (drag) {
        const dx = (e.clientX - drag.smx) / drag.sc;
        const dy = (e.clientY - drag.smy) / drag.sc;
        if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) { drag.moved = true; _dragMoved = true; }
        if (!drag.moved) return;
        for (const ent of drag.entries) {
          const d = Store.nodes.get(ent.id); if (!d) continue;
          d.x = ent.sx + dx; d.y = ent.sy + dy;
          d._el.style.left = d.x + 'px'; d._el.style.top = d.y + 'px';
          EB.emit('node:moved', ent.id);
        }
        return;
      }
      // Live preview line while picking a connection target
      const src = connSrc || qConnSrc;
      if (src) {
        const p = Canvas.s2c(e.clientX, e.clientY);
        EB.emit('edge:preview', { srcId: src, x: p.x, y: p.y });
      }
    });

    window.addEventListener('mouseup', () => {
      if (drag?.moved) EB.emit('graph:changed');
      drag = null;
    });
  }

  return { init, create, load, remove, updateEl, clearConnHL, clearAllSel, cancelConn,
           setSelection, toggleSel, getSelectedIds, removeSelection, duplicateSelection,
           nudgeSelection, COLORS };
})();
