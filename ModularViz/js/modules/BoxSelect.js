'use strict';

/* ═══════════════════════════════════════════════════════════
   BoxSelect — Shift+drag rubber-band multi-selection
   deps: Store, App, Canvas, NM, Status
═══════════════════════════════════════════════════════════ */
const BoxSelect = (() => {
  let _box = null;          // overlay element while dragging
  let _start = null;        // {x, y} viewport-relative start point

  const _vp = () => document.getElementById('canvas-vp');

  function _rectFrom(e) {
    const r = _vp().getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    return {
      left:   Math.min(_start.x, cx),
      top:    Math.min(_start.y, cy),
      width:  Math.abs(cx - _start.x),
      height: Math.abs(cy - _start.y),
      vpRect: r
    };
  }

  function _onMove(e) {
    const { left, top, width, height } = _rectFrom(e);
    _box.style.left   = left + 'px';
    _box.style.top    = top + 'px';
    _box.style.width  = width + 'px';
    _box.style.height = height + 'px';
  }

  function _onUp(e) {
    window.removeEventListener('mousemove', _onMove);
    window.removeEventListener('mouseup',   _onUp);
    const { left, top, width, height, vpRect } = _rectFrom(e);
    _box.remove(); _box = null; _start = null;
    if (width < 4 && height < 4) return;   // treat as a click, not a box

    // Convert box corners to canvas space and pick intersecting nodes
    const p1 = Canvas.s2c(vpRect.left + left,         vpRect.top + top);
    const p2 = Canvas.s2c(vpRect.left + left + width, vpRect.top + top + height);
    const ids = [];
    for (const [id, n] of Store.nodes) {
      const w = n._el?.offsetWidth || 120, h = n._el?.offsetHeight || 40;
      if (n.x < p2.x && n.x + w > p1.x && n.y < p2.y && n.y + h > p1.y) ids.push(id);
    }
    NM.setSelection(ids);
    if (ids.length) Status.show(`${ids.length} node${ids.length !== 1 ? 's' : ''} selected`, 1800);
  }

  function init() {
    const vp = _vp();
    vp.addEventListener('mousedown', e => {
      if (e.button !== 0 || !e.shiftKey || e.target !== vp || App.mode !== 'default') return;
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      _start = { x: e.clientX - r.left, y: e.clientY - r.top };
      _box = document.createElement('div');
      _box.id = 'box-select';
      _box.style.left  = _start.x + 'px';
      _box.style.top   = _start.y + 'px';
      vp.appendChild(_box);
      window.addEventListener('mousemove', _onMove);
      window.addEventListener('mouseup',   _onUp);
    });
  }

  return { init };
})();
