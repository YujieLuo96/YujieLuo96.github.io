'use strict';

/* ═══════════════════════════════════════════════════════════
   InlinePrompt
═══════════════════════════════════════════════════════════ */
const IP = (() => {
  let _resolve = null;
  let _showing = false;
  const _el  = () => document.getElementById('ip');
  const _inp = () => document.getElementById('ip-input');

  function show(sx, sy) {
    if (_showing) { _resolve?.(null); _resolve = null; }

    return new Promise(resolve => {
      _resolve = resolve;
      _showing = true;

      const vr = document.getElementById('canvas-vp').getBoundingClientRect();
      const px = Math.min(sx, vr.width  - 240);
      const py = Math.max(sy - 95,       10);
      const box = _el();
      box.style.left = px + 'px';
      box.style.top  = py + 'px';
      box.classList.add('show');
      _inp().value = '';
      requestAnimationFrame(() => { _inp().focus(); _inp().select(); });
    });
  }

  function confirm() {
    if (!_showing) return;
    const value = _inp().value.trim();
    _el().classList.remove('show');
    _showing = false;
    if (_resolve) { _resolve(value || null); _resolve = null; }
  }

  function cancel() {
    if (!_showing) return;
    _el().classList.remove('show');
    _showing = false;
    if (_resolve) { _resolve(null); _resolve = null; }
  }

  function init() {
    _inp().addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel();  }
      e.stopPropagation();
    });
    document.addEventListener('mousedown', e => {
      if (_showing && !_el().contains(e.target)) cancel();
    });
  }

  return { init, show, cancel };
})();
