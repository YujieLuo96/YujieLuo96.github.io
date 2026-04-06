/**
 * Canvas — pan / zoom module
 *
 * canvas-world hosts both node DOM elements and the SVG edge layer.
 * A CSS transform translate(tx,ty) scale(sc) is applied to canvas-world;
 * the same transform is applied via SVG attribute to edges-group so both stay in sync.
 *
 * Screen → canvas:  canvasX = (screenX - vpLeft - tx) / sc
 * Canvas → screen:  screenX = canvasX * sc + tx + vpLeft
 */

import { App } from '../state/AppState.js';

let tx = 80, ty = 60, sc = 1;
let panning = false;
let panStart = null;

function applyTransform() {
  const world = document.getElementById('canvas-world');
  if (world) world.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`;
  const eg = document.getElementById('edges-group');
  if (eg) eg.setAttribute('transform', `translate(${tx},${ty}) scale(${sc})`);
}

export const Canvas = {
  init() {
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
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const factor   = e.deltaY > 0 ? 0.9 : 1 / 0.9;
      const newScale = Math.min(5, Math.max(0.08, sc * factor));
      tx = mx - (mx - tx) * (newScale / sc);
      ty = my - (my - ty) * (newScale / sc);
      sc = newScale;
      applyTransform();
    }, { passive: false });

    applyTransform();
  },

  /** Screen coordinates → canvas coordinates */
  s2c(sx, sy) {
    const r = document.getElementById('canvas-vp').getBoundingClientRect();
    return { x: (sx - r.left - tx) / sc, y: (sy - r.top - ty) / sc };
  },

  /** Canvas coordinates → screen coordinates */
  c2s(cx, cy) {
    const r = document.getElementById('canvas-vp').getBoundingClientRect();
    return { x: cx * sc + tx + r.left, y: cy * sc + ty + r.top };
  },

  get: () => ({ tx, ty, sc }),

  setTransform(newTx, newTy, newSc) {
    tx = newTx; ty = newTy; sc = newSc;
    applyTransform();
  },

  /**
   * Smoothly pan + zoom so that canvas point (cx, cy) is centred in the viewport.
   * @param {number} cx        - canvas-space X to focus on
   * @param {number} cy        - canvas-space Y to focus on
   * @param {number} targetSc  - desired scale after animation (default 1.25)
   * @param {number} duration  - animation duration in ms (default 420)
   */
  focusOn(cx, cy, targetSc = 1.25, duration = 420) {
    const vp  = document.getElementById('canvas-vp');
    const r   = vp.getBoundingClientRect();
    const vpCx = r.width  / 2;
    const vpCy = r.height / 2;

    const targetTx = vpCx - cx * targetSc;
    const targetTy = vpCy - cy * targetSc;

    const startTx = tx, startTy = ty, startSc = sc;
    const t0 = performance.now();

    function step(now) {
      const raw  = Math.min(1, (now - t0) / duration);
      // ease-in-out cubic
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
};
