'use strict';

/* ═══════════════════════════════════════════════════════════
   DarkMode — toggle + localStorage persistence
═══════════════════════════════════════════════════════════ */
const DarkMode = (() => {
  const KEY = 'vg-dark';

  function _apply(dark) {
    document.body.classList.toggle('dark', dark);
  }

  function toggle() {
    const next = !document.body.classList.contains('dark');
    _apply(next);
    try { localStorage.setItem(KEY, next ? '1' : '0'); } catch (_) {}
  }

  function init() {
    // Restore saved preference; fall back to system preference
    let saved;
    try { saved = localStorage.getItem(KEY); } catch (_) {}
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    _apply(saved !== null ? saved === '1' : prefersDark);

    document.getElementById('btn-dark').addEventListener('click', toggle);
  }

  return { init };
})();
