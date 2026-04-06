/**
 * MobileTouch — complete touch interaction layer for ModularViz
 *
 * Desktop guard: init() exits immediately when maxTouchPoints === 0.
 * Every handler is added only on touch devices, so zero desktop impact.
 *
 * Interactions handled:
 *   Canvas  — 1-finger pan, 2-finger pinch-zoom
 *   Nodes   — tap (select / open panel), drag, long-press (connect mode)
 *   Canvas  — double-tap on empty area → create node (replaces dblclick)
 *   Search  — touchstart/touchend fix for dropdown item selection
 *   IP      — touchstart outside → cancel InlinePrompt
 *   General — touchstart outside search widget → close dropdown
 */

import { Canvas } from './Canvas.js';
import { App }    from '../state/AppState.js';
import { Store }  from '../core/Store.js';
import { EB }     from '../core/EventBus.js';
import { IP }     from './InlinePrompt.js';
import { NM }     from './NodeModule.js';
import { Status } from '../state/StatusBar.js';

const IS_TOUCH = navigator.maxTouchPoints > 0;

/* ── Constants ───────────────────────────────────────────── */
const DRAG_THRESHOLD   = 8;   // px — movement beyond this = drag (not tap)
const LONG_PRESS_MS    = 600; // ms — hold still this long = long-press
const DBL_TAP_MS       = 280; // ms — max interval between two taps
const DBL_TAP_MAX_DIST = 24;  // px — max drift between two taps

/* ═══════════════════════════════════════════════════════════
   CANVAS TOUCH  —  pan (1 finger) + pinch-zoom (2 fingers)
   ═══════════════════════════════════════════════════════════ */

let _canvasPan   = null;  // { startX, startY, startTx, startTy }
let _canvasPinch = null;  // { initDist, initMidX, initMidY, initTx, initTy, initSc }

function _dist2(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function _mid(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2
  };
}

function _onCanvasTouchStart(e) {
  // Ignore touches that originate on a node — NodeTouch handles those
  if (e.target.closest('.node') || e.target.closest('.e-hit')) return;

  if (e.touches.length === 2) {
    // ── Pinch-zoom start ──────────────────────────────────
    _canvasPan = null;
    const { tx, ty, sc } = Canvas.get();
    const mid = _mid(e.touches[0], e.touches[1]);
    const vp  = document.getElementById('canvas-vp').getBoundingClientRect();
    _canvasPinch = {
      initDist: _dist2(e.touches[0], e.touches[1]),
      initMidX: mid.x - vp.left,
      initMidY: mid.y - vp.top,
      initTx: tx, initTy: ty, initSc: sc
    };
    e.preventDefault();
    return;
  }

  if (e.touches.length === 1) {
    // ── Pan start ─────────────────────────────────────────
    // Only pan in default mode on empty canvas
    if (App.mode !== 'default') return;
    _canvasPinch = null;
    const { tx, ty } = Canvas.get();
    _canvasPan = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      startTx: tx,
      startTy: ty
    };
    // Don't preventDefault here so single-finger tap still fires click
  }
}

function _onCanvasTouchMove(e) {
  if (e.touches.length === 2 && _canvasPinch) {
    // ── Pinch-zoom ────────────────────────────────────────
    e.preventDefault();
    const newDist = _dist2(e.touches[0], e.touches[1]);
    const ratio   = newDist / _canvasPinch.initDist;

    const { initSc, initTx, initTy, initMidX, initMidY } = _canvasPinch;
    const newSc = Math.min(5, Math.max(0.08, initSc * ratio));

    // Zoom around the initial midpoint
    const newTx = initMidX - (initMidX - initTx) * (newSc / initSc);
    const newTy = initMidY - (initMidY - initTy) * (newSc / initSc);

    Canvas.setTransform(newTx, newTy, newSc);
    return;
  }

  if (e.touches.length === 1 && _canvasPan) {
    // ── Pan ───────────────────────────────────────────────
    e.preventDefault();
    const dx = e.touches[0].clientX - _canvasPan.startX;
    const dy = e.touches[0].clientY - _canvasPan.startY;
    const { sc } = Canvas.get();
    Canvas.setTransform(_canvasPan.startTx + dx, _canvasPan.startTy + dy, sc);
  }
}

function _onCanvasTouchEnd() {
  _canvasPan   = null;
  _canvasPinch = null;
}

/* ═══════════════════════════════════════════════════════════
   NODE TOUCH  —  tap, drag, long-press
   ═══════════════════════════════════════════════════════════ */

let _nodeDrag    = null; // active drag state
let _lpTimer     = null; // long-press setTimeout id
let _lpNodeId    = null; // node targeted by long-press

// Double-tap tracking (for empty-canvas double-tap → create node)
let _lastTap = null; // { x, y, time }

function _clearLongPress() {
  if (_lpTimer !== null) { clearTimeout(_lpTimer); _lpTimer = null; }
  _lpNodeId = null;
  // Remove pulse class if present
  if (_nodeDrag?.el) _nodeDrag.el.classList.remove('lp-pending');
}

function _onNodeTouchStart(e) {
  const nodeEl = e.target.closest('.node');
  if (!nodeEl) return;

  e.stopPropagation(); // prevent canvas pan from starting
  e.preventDefault();

  const id   = nodeEl.id;
  const data = Store.nodes.get(id);
  if (!data) return;

  const t = e.touches[0];
  const { sc } = Canvas.get();

  _nodeDrag = {
    id,
    el:      nodeEl,
    moved:   false,
    startTX: t.clientX,
    startTY: t.clientY,
    startNX: data.x,
    startNY: data.y,
    sc
  };

  // ── Long-press countdown ─────────────────────────────────
  _lpNodeId = id;
  nodeEl.classList.add('lp-pending');
  _lpTimer = setTimeout(() => {
    _lpTimer  = null;
    _lpNodeId = null;
    nodeEl.classList.remove('lp-pending');
    _triggerLongPress(id);
  }, LONG_PRESS_MS);
}

function _onNodeTouchMove(e) {
  if (!_nodeDrag) return;
  e.preventDefault();

  const t  = e.touches[0];
  const dx = (t.clientX - _nodeDrag.startTX) / _nodeDrag.sc;
  const dy = (t.clientY - _nodeDrag.startTY) / _nodeDrag.sc;

  if (!_nodeDrag.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
    _nodeDrag.moved = true;
    _clearLongPress();
  }

  if (!_nodeDrag.moved) return;

  const data = Store.nodes.get(_nodeDrag.id);
  if (!data) return;

  data.x = _nodeDrag.startNX + dx;
  data.y = _nodeDrag.startNY + dy;
  data._el.style.left = data.x + 'px';
  data._el.style.top  = data.y + 'px';
  EB.emit('node:moved', _nodeDrag.id);
}

function _onNodeTouchEnd(e) {
  if (!_nodeDrag) return;

  _clearLongPress();

  const { id, moved, el } = _nodeDrag;
  _nodeDrag = null;

  if (moved) return; // was a drag — no tap action

  // ── Tap on node ──────────────────────────────────────────
  // Simulate a click so NodeModule's _onClick fires
  // (NodeModule already handles conn mode + default mode selection)
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
}

/* Long-press → enter connect mode with this node as source */
function _triggerLongPress(id) {
  navigator.vibrate?.(12);

  // Enter connect mode and immediately select this node as source
  App.setMode('conn');

  // Simulate a click to trigger NodeModule's _handleConnClick
  const data = Store.nodes.get(id);
  if (data?._el) {
    data._el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    );
  }
}

/* ═══════════════════════════════════════════════════════════
   DOUBLE-TAP on empty canvas  →  create node
   (replaces dblclick which triggers browser zoom on mobile)
   ═══════════════════════════════════════════════════════════ */

function _onCanvasTap(e) {
  // Only fires for taps that did NOT start a drag
  if (e.target.closest('.node') || e.target.closest('.e-hit')) return;
  if (App.mode !== 'default') return;

  const t = e.changedTouches[0];
  const now = Date.now();

  if (
    _lastTap &&
    now - _lastTap.time < DBL_TAP_MS &&
    Math.abs(t.clientX - _lastTap.x) < DBL_TAP_MAX_DIST &&
    Math.abs(t.clientY - _lastTap.y) < DBL_TAP_MAX_DIST
  ) {
    // ── Double-tap detected ───────────────────────────────
    _lastTap = null;
    e.preventDefault();
    _handleDoubleTapCreate(t.clientX, t.clientY);
    return;
  }

  _lastTap = { x: t.clientX, y: t.clientY, time: now };
}

async function _handleDoubleTapCreate(clientX, clientY) {
  const canvasPos = Canvas.s2c(clientX, clientY);
  const vp        = document.getElementById('canvas-vp');
  const vpRect    = vp.getBoundingClientRect();

  // On mobile, IP CSS positions it as a bottom sheet — sx/sy values
  // are overridden by CSS, but we still need to pass something valid.
  const title = await IP.show(clientX - vpRect.left, clientY - vpRect.top);
  if (title) {
    NM.create(title, canvasPos.x, canvasPos.y);
    Status.show('Node created', 2000);
  }
}

/* ═══════════════════════════════════════════════════════════
   SEARCH DROPDOWN  —  fix mousedown-only items on iOS
   ═══════════════════════════════════════════════════════════ */

function _patchSearchDropdown() {
  const dd = document.getElementById('sm-dropdown');
  if (!dd) return;

  // touchstart on item: prevent input blur before selection fires
  dd.addEventListener('touchstart', e => {
    if (e.target.closest('.sd-item')) {
      e.preventDefault();
    }
  }, { passive: false });

  // touchend on item: dispatch mousedown to trigger SearchModule's handler
  dd.addEventListener('touchend', e => {
    const item = e.target.closest('.sd-item');
    if (!item) return;
    e.preventDefault();
    item.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    );
  }, { passive: false });

  // Close dropdown when touching outside the search widget
  document.addEventListener('touchstart', e => {
    const widget = document.getElementById('sm-widget');
    if (widget && !widget.contains(e.target) && dd.classList.contains('open')) {
      dd.classList.remove('open');
    }
  }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════
   INLINE PROMPT  —  touchstart outside → cancel
   ═══════════════════════════════════════════════════════════ */

function _patchInlinePrompt() {
  document.addEventListener('touchstart', e => {
    const ipEl = document.getElementById('ip');
    if (ipEl?.classList.contains('show') && !ipEl.contains(e.target)) {
      IP.cancel();
    }
  }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════
   CANVAS VIEWPORT TOUCH  —  clear panel on tap on empty area
   (mirrors the mousedown handler in Toolbar.js)
   ═══════════════════════════════════════════════════════════ */

function _onCanvasEmptyTouchStart(e) {
  if (e.target.closest('.node') || e.target.closest('.e-hit')) return;
  if (App.mode === 'default') {
    NM.clearAllSel();
    // Panel close handled by Panel's own close button / NM.clearAllSel
  }
  if (App.mode === 'conn') {
    NM.cancelConn();
  }
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC INIT
   ═══════════════════════════════════════════════════════════ */

function init() {
  if (!IS_TOUCH) return;

  const vp         = document.getElementById('canvas-vp');
  const nodesLayer = document.getElementById('nodes-layer');

  // ── Canvas pan / pinch ──────────────────────────────────
  vp.addEventListener('touchstart', _onCanvasTouchStart, { passive: false });
  vp.addEventListener('touchmove',  _onCanvasTouchMove,  { passive: false });
  vp.addEventListener('touchend',   _onCanvasTouchEnd,   { passive: true  });
  vp.addEventListener('touchcancel',_onCanvasTouchEnd,   { passive: true  });

  // ── Double-tap detection (touchend on canvas) ───────────
  vp.addEventListener('touchend', _onCanvasTap, { passive: false });

  // ── Canvas empty-tap (clear selection) ──────────────────
  vp.addEventListener('touchstart', _onCanvasEmptyTouchStart, { passive: true });

  // ── Node drag / tap / long-press (delegated) ────────────
  nodesLayer.addEventListener('touchstart', _onNodeTouchStart, { passive: false });
  window.addEventListener('touchmove',  _onNodeTouchMove,  { passive: false });
  window.addEventListener('touchend',   _onNodeTouchEnd,   { passive: true  });
  window.addEventListener('touchcancel', () => {
    _clearLongPress();
    _nodeDrag = null;
  }, { passive: true });

  // ── Search dropdown fix ──────────────────────────────────
  _patchSearchDropdown();

  // ── InlinePrompt outside-touch ───────────────────────────
  _patchInlinePrompt();
}

export const MT = { init };
