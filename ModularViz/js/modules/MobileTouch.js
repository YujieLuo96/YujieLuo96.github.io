'use strict';

/* ═══════════════════════════════════════════════════════════
   MobileTouch — touch interaction layer
   deps: EB, Store, App, Canvas, NM, IP, Status
═══════════════════════════════════════════════════════════ */
const MT = (() => {
  const IS_TOUCH       = navigator.maxTouchPoints > 0;
  const DRAG_THRESHOLD = 8;
  const LONG_PRESS_MS  = 600;
  const DBL_TAP_MS     = 280;
  const DBL_TAP_DIST   = 24;

  /* ── Canvas pan / pinch ──────────────────────────────── */
  let _pan   = null;
  let _pinch = null;

  function _dist(t1, t2) {
    const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function _mid(t1, t2) {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
  }

  function _onCanvasTouchStart(e) {
    if (e.target.closest('.node') || e.target.closest('.e-hit')) return;
    if (e.touches.length === 2) {
      _pan = null;
      const { tx, ty, sc } = Canvas.get();
      const mid = _mid(e.touches[0], e.touches[1]);
      const vp  = document.getElementById('canvas-vp').getBoundingClientRect();
      _pinch = { initDist: _dist(e.touches[0], e.touches[1]),
                 initMidX: mid.x - vp.left, initMidY: mid.y - vp.top,
                 initTx: tx, initTy: ty, initSc: sc };
      e.preventDefault();
      return;
    }
    if (e.touches.length === 1 && App.mode === 'default') {
      _pinch = null;
      const { tx, ty } = Canvas.get();
      _pan = { startX: e.touches[0].clientX, startY: e.touches[0].clientY,
               startTx: tx, startTy: ty };
    }
  }

  function _onCanvasTouchMove(e) {
    if (e.touches.length === 2 && _pinch) {
      e.preventDefault();
      const nd   = _dist(e.touches[0], e.touches[1]);
      const ratio = nd / _pinch.initDist;
      const { initSc, initTx, initTy, initMidX, initMidY } = _pinch;
      const ns = Math.min(5, Math.max(0.08, initSc * ratio));
      Canvas.setTransform(
        initMidX - (initMidX - initTx) * (ns / initSc),
        initMidY - (initMidY - initTy) * (ns / initSc),
        ns
      );
      return;
    }
    if (e.touches.length === 1 && _pan) {
      e.preventDefault();
      const dx = e.touches[0].clientX - _pan.startX;
      const dy = e.touches[0].clientY - _pan.startY;
      Canvas.setTransform(_pan.startTx + dx, _pan.startTy + dy, Canvas.get().sc);
    }
  }

  function _onCanvasTouchEnd() { _pan = null; _pinch = null; }

  /* ── Node drag / tap / long-press ────────────────────── */
  let _drag  = null;
  let _lpTmr = null;
  let _lpId  = null;

  function _clearLP() {
    if (_lpTmr !== null) { clearTimeout(_lpTmr); _lpTmr = null; }
    if (_lpId) {
      Store.nodes.get(_lpId)?._el?.classList.remove('lp-pending');
      _lpId = null;
    }
  }

  function _onNodeTouchStart(e) {
    const nodeEl = e.target.closest('.node');
    if (!nodeEl) return;
    e.stopPropagation();
    e.preventDefault();

    const id = nodeEl.id, data = Store.nodes.get(id);
    if (!data) return;
    const t = e.touches[0], { sc } = Canvas.get();
    _drag = { id, el: nodeEl, moved: false,
              startTX: t.clientX, startTY: t.clientY,
              startNX: data.x,    startNY: data.y, sc };

    _lpId = id;
    nodeEl.classList.add('lp-pending');
    _lpTmr = setTimeout(() => {
      _lpTmr = null; _lpId = null;
      nodeEl.classList.remove('lp-pending');
      _triggerLP(id);
    }, LONG_PRESS_MS);
  }

  function _onNodeTouchMove(e) {
    if (!_drag) return;
    e.preventDefault();
    const t  = e.touches[0];
    const dx = (t.clientX - _drag.startTX) / _drag.sc;
    const dy = (t.clientY - _drag.startTY) / _drag.sc;
    if (!_drag.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      _drag.moved = true;
      _clearLP();
    }
    if (!_drag.moved) return;
    const data = Store.nodes.get(_drag.id); if (!data) return;
    data.x = _drag.startNX + dx;
    data.y = _drag.startNY + dy;
    data._el.style.left = data.x + 'px';
    data._el.style.top  = data.y + 'px';
    EB.emit('node:moved', _drag.id);
  }

  function _onNodeTouchEnd() {
    if (!_drag) return;
    _clearLP();
    const { moved, el } = _drag;
    _drag = null;
    if (moved) return;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  }

  function _triggerLP(id) {
    navigator.vibrate?.(12);
    App.setMode('conn');
    Store.nodes.get(id)?._el?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    );
  }

  /* ── Double-tap on canvas → create node ──────────────── */
  let _lastTap = null;

  function _onCanvasTap(e) {
    if (e.target.closest('.node') || e.target.closest('.e-hit')) return;
    if (App.mode !== 'default') return;
    const t = e.changedTouches[0], now = Date.now();
    if (_lastTap &&
        now - _lastTap.time < DBL_TAP_MS &&
        Math.abs(t.clientX - _lastTap.x) < DBL_TAP_DIST &&
        Math.abs(t.clientY - _lastTap.y) < DBL_TAP_DIST) {
      _lastTap = null;
      e.preventDefault();
      _doubleTapCreate(t.clientX, t.clientY);
      return;
    }
    _lastTap = { x: t.clientX, y: t.clientY, time: now };
  }

  async function _doubleTapCreate(cx, cy) {
    const pos    = Canvas.s2c(cx, cy);
    const vp     = document.getElementById('canvas-vp');
    const vpRect = vp.getBoundingClientRect();
    const title  = await IP.show(cx - vpRect.left, cy - vpRect.top);
    if (title) { NM.create(title, pos.x, pos.y); Status.show('Node created', 2000); }
  }

  /* ── Search dropdown fix ──────────────────────────────── */
  function _patchSearch() {
    const dd = document.getElementById('sm-dropdown');
    if (!dd) return;
    dd.addEventListener('touchstart', e => {
      if (e.target.closest('.sd-item')) e.preventDefault();
    }, { passive: false });
    dd.addEventListener('touchend', e => {
      const item = e.target.closest('.sd-item');
      if (!item) return;
      e.preventDefault();
      item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    }, { passive: false });
    document.addEventListener('touchstart', e => {
      const w = document.getElementById('sm-widget');
      if (w && !w.contains(e.target) && dd.classList.contains('open'))
        dd.classList.remove('open');
    }, { passive: true });
  }

  /* ── InlinePrompt outside-touch → cancel ─────────────── */
  function _patchIP() {
    document.addEventListener('touchstart', e => {
      const ip = document.getElementById('ip');
      if (ip?.classList.contains('show') && !ip.contains(e.target)) IP.cancel();
    }, { passive: true });
  }

  /* ── Canvas empty-tap → clear selection ──────────────── */
  function _onCanvasEmptyTouchStart(e) {
    if (e.target.closest('.node') || e.target.closest('.e-hit')) return;
    if (App.mode === 'default') NM.clearAllSel();
    if (App.mode === 'conn')    NM.cancelConn();
  }

  function init() {
    if (!IS_TOUCH) return;
    const vp = document.getElementById('canvas-vp');
    const nl = document.getElementById('nodes-layer');

    vp.addEventListener('touchstart',  _onCanvasTouchStart,      { passive: false });
    vp.addEventListener('touchmove',   _onCanvasTouchMove,        { passive: false });
    vp.addEventListener('touchend',    _onCanvasTouchEnd,         { passive: true  });
    vp.addEventListener('touchcancel', _onCanvasTouchEnd,         { passive: true  });
    vp.addEventListener('touchend',    _onCanvasTap,              { passive: false });
    vp.addEventListener('touchstart',  _onCanvasEmptyTouchStart,  { passive: true  });

    nl.addEventListener('touchstart', _onNodeTouchStart, { passive: false });
    window.addEventListener('touchmove',  _onNodeTouchMove,  { passive: false });
    window.addEventListener('touchend',   _onNodeTouchEnd,   { passive: true  });
    window.addEventListener('touchcancel', () => { _clearLP(); _drag = null; }, { passive: true });

    _patchSearch();
    _patchIP();
  }

  return { init };
})();
