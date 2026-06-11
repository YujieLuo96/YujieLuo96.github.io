'use strict';

/* ═══════════════════════════════════════════════════════════
   ViewUI — zoom controls, graph counter, empty-canvas hint
   deps: EB, Store, Canvas
═══════════════════════════════════════════════════════════ */
const ViewUI = (() => {
  let _pctEl = null, _counterEl = null, _emptyEl = null;

  const _vp = () => document.getElementById('canvas-vp');

  /** Fit all nodes into the viewport. */
  function fitToContent(animate = true) {
    const nodes = [...Store.nodes.values()];
    if (!nodes.length) { Canvas.setTransform(80, 60, 1); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const w = n._el?.offsetWidth || 120, h = n._el?.offsetHeight || 40;
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + w > maxX) maxX = n.x + w;
      if (n.y + h > maxY) maxY = n.y + h;
    }
    Canvas.fitBounds(minX, minY, maxX, maxY, animate);
  }

  /** Animate back to 100% zoom, keeping the viewport centre fixed. */
  function resetZoom() {
    const r = _vp().getBoundingClientRect();
    const c = Canvas.s2c(r.left + r.width / 2, r.top + r.height / 2);
    Canvas.animateTo(r.width / 2 - c.x, r.height / 2 - c.y, 1, 280);
  }

  function _refreshCounter() {
    const nn = Store.nodes.size, ne = Store.edges.size;
    if (_counterEl) _counterEl.textContent = `${nn} node${nn !== 1 ? 's' : ''} · ${ne} edge${ne !== 1 ? 's' : ''}`;
    if (_emptyEl) _emptyEl.classList.toggle('show', nn === 0);
  }

  function _btn(title, svg, onClick) {
    const b = document.createElement('button');
    b.className = 'vz-btn';
    b.title = title;
    b.innerHTML = svg;
    b.addEventListener('click', onClick);
    return b;
  }

  function init() {
    const vp = _vp();

    // ── Zoom bar (bottom-right) ──
    const bar = document.createElement('div');
    bar.id = 'vz-zoombar';

    bar.appendChild(_btn('Zoom out (Ctrl+-)',
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3.5" y1="8" x2="12.5" y2="8"/></svg>',
      () => Canvas.zoomStep(-1)));

    _pctEl = document.createElement('button');
    _pctEl.id = 'vz-pct';
    _pctEl.className = 'vz-btn';
    _pctEl.title = 'Reset zoom to 100% (Ctrl+0)';
    _pctEl.textContent = '100%';
    _pctEl.addEventListener('click', resetZoom);
    bar.appendChild(_pctEl);

    bar.appendChild(_btn('Zoom in (Ctrl+=)',
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3.5" y1="8" x2="12.5" y2="8"/><line x1="8" y1="3.5" x2="8" y2="12.5"/></svg>',
      () => Canvas.zoomStep(1)));

    const sep = document.createElement('div');
    sep.className = 'vz-sep';
    bar.appendChild(sep);

    bar.appendChild(_btn('Fit all nodes in view (F)',
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="5.5 2 2 2 2 5.5"/><polyline points="10.5 2 14 2 14 5.5"/><polyline points="5.5 14 2 14 2 10.5"/><polyline points="10.5 14 14 14 14 10.5"/><rect x="5.5" y="5.5" width="5" height="5" rx="1"/></svg>',
      () => fitToContent()));

    vp.appendChild(bar);

    // ── Counter (bottom-left) ──
    _counterEl = document.createElement('div');
    _counterEl.id = 'vz-counter';
    vp.appendChild(_counterEl);

    // ── Empty-canvas hint (centre) ──
    _emptyEl = document.createElement('div');
    _emptyEl.id = 'vz-empty';
    const isTouch = navigator.maxTouchPoints > 0;
    _emptyEl.innerHTML =
      '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="6" y="10" width="17" height="11" rx="3"/><rect x="26" y="28" width="17" height="11" rx="3"/>' +
      '<path d="M14.5 21 Q 14.5 33.5 26 33.5" stroke-dasharray="3 4"/></svg>' +
      `<div class="vz-empty-title">Empty canvas</div>` +
      `<div class="vz-empty-sub">${isTouch
        ? 'Double-tap anywhere to create your first node'
        : 'Double-click anywhere to create your first node<br>or press <kbd>N</kbd>, then click'}</div>`;
    vp.appendChild(_emptyEl);

    EB.on('view:changed', ({ sc }) => {
      if (_pctEl) _pctEl.textContent = Math.round(sc * 100) + '%';
    });
    EB.on('graph:changed', _refreshCounter);
    EB.on('graph:loaded',  _refreshCounter);
    _refreshCounter();
  }

  return { init, fitToContent, resetZoom };
})();
