'use strict';

/* ═══════════════════════════════════════════════════════════
   Canvas — viewport pan / zoom / animated navigation
   deps: EB, App
═══════════════════════════════════════════════════════════ */
const Canvas = (() => {
  const SC_MIN = 0.08, SC_MAX = 5;
  let tx = 80, ty = 60, sc = 1;
  let panning = false, panStart = null;
  let _animId = 0;            // cancels an in-flight animateTo
  let _evScheduled = false;   // rAF-throttled 'view:changed'

  const _vp = () => document.getElementById('canvas-vp');

  function applyTransform() {
    const w = document.getElementById('canvas-world');
    if (w) w.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`;
    const eg = document.getElementById('edges-group');
    if (eg) eg.setAttribute('transform', `translate(${tx},${ty}) scale(${sc})`);
    if (!_evScheduled) {
      _evScheduled = true;
      requestAnimationFrame(() => {
        _evScheduled = false;
        EB.emit('view:changed', { tx, ty, sc });
      });
    }
  }

  function _clampSc(s) { return Math.min(SC_MAX, Math.max(SC_MIN, s)); }

  // Zoom by `factor` keeping the screen point (mx, my) — viewport-relative —
  // fixed in place.
  function _zoomAt(mx, my, factor) {
    const ns = _clampSc(sc * factor);
    tx = mx - (mx - tx) * (ns / sc);
    ty = my - (my - ty) * (ns / sc);
    sc = ns;
    applyTransform();
  }

  function init() {
    const vp = _vp();

    vp.addEventListener('mousedown', e => {
      const isMiddle      = e.button === 1;
      const isLeftOnEmpty = e.button === 0 && e.target === vp &&
                            App.mode === 'default' && !e.shiftKey; // Shift+drag = box select
      if (!isMiddle && !isLeftOnEmpty) return;
      _animId++; // interrupt any running animation
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
      if (panning) { panning = false; _vp().style.cursor = ''; }
    });

    vp.addEventListener('wheel', e => {
      e.preventDefault();
      _animId++;
      const r = vp.getBoundingClientRect();
      _zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY > 0 ? 0.9 : 1 / 0.9);
    }, { passive: false });

    applyTransform();
  }

  function s2c(sx, sy) {
    const r = _vp().getBoundingClientRect();
    return { x: (sx - r.left - tx) / sc, y: (sy - r.top - ty) / sc };
  }

  function c2s(cx, cy) {
    const r = _vp().getBoundingClientRect();
    return { x: cx * sc + tx + r.left, y: cy * sc + ty + r.top };
  }

  /** Smoothly animate the viewport to a target transform. */
  function animateTo(targetTx, targetTy, targetSc, duration = 420) {
    targetSc = _clampSc(targetSc);
    const startTx = tx, startTy = ty, startSc = sc;
    const t0 = performance.now();
    const myId = ++_animId;

    function step(now) {
      if (myId !== _animId) return; // superseded by user input or newer animation
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

  /** Pan + zoom so canvas point (cx, cy) is centred in the viewport. */
  function focusOn(cx, cy, targetSc = 1.3, duration = 420) {
    const r = _vp().getBoundingClientRect();
    animateTo(r.width / 2 - cx * targetSc, r.height / 2 - cy * targetSc, targetSc, duration);
  }

  /** Step-zoom centred on the viewport middle (toolbar buttons / Ctrl+= / Ctrl+-). */
  function zoomStep(dir) {
    const r = _vp().getBoundingClientRect();
    _animId++;
    _zoomAt(r.width / 2, r.height / 2, dir > 0 ? 1.25 : 0.8);
  }

  /** Fit a canvas-space bounding box into the viewport with padding. */
  function fitBounds(minX, minY, maxX, maxY, animate = true) {
    const r   = _vp().getBoundingClientRect();
    const pad = 70;
    const w   = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const targetSc = _clampSc(Math.min((r.width - pad * 2) / w, (r.height - pad * 2) / h, 1.5));
    const targetTx = r.width  / 2 - (minX + w / 2) * targetSc;
    const targetTy = r.height / 2 - (minY + h / 2) * targetSc;
    if (animate) animateTo(targetTx, targetTy, targetSc);
    else { _animId++; tx = targetTx; ty = targetTy; sc = targetSc; applyTransform(); }
  }

  function setTransform(newTx, newTy, newSc) {
    _animId++;
    tx = newTx; ty = newTy; sc = _clampSc(newSc);
    applyTransform();
  }

  return { init, s2c, c2s, focusOn, animateTo, zoomStep, fitBounds, setTransform,
           get: () => ({ tx, ty, sc }) };
})();
