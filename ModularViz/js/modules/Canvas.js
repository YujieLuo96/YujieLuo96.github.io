'use strict';

/* ═══════════════════════════════════════════════════════════
   Canvas
   deps: App
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

  function setTransform(newTx, newTy, newSc) {
    tx = newTx; ty = newTy; sc = newSc;
    applyTransform();
  }

  return { init, s2c, c2s, focusOn, setTransform, get: () => ({ tx, ty, sc }) };
})();
