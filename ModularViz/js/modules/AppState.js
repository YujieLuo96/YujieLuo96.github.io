'use strict';

/* ═══════════════════════════════════════════════════════════
   AppState
   deps: Status
═══════════════════════════════════════════════════════════ */
const App = {
  mode: 'default',
  selNode: null,
  selEdge: null,

  setMode(m) {
    this.mode = m;
    const vp = document.getElementById('canvas-vp');
    if (vp) vp.className = (m === 'place') ? 'mode-place' : '';
    document.getElementById('btn-conn')?.classList.toggle('active', m === 'conn');
    const hintMap = {
      place:   'Click canvas to place node',
      conn:    'Click source → target · Right-click to quick-connect · Esc to exit',
      default: ''
    };
    const hint = document.getElementById('mode-hint');
    if (hint) hint.textContent = hintMap[m] ?? '';
    if (m === 'default') Status.hide();
    else Status.show(hintMap[m]);
  }
};
