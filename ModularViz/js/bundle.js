'use strict';

/* ═══════════════════════════════════════════════════════════
   Boot
═══════════════════════════════════════════════════════════ */
function boot() {
  Canvas.init();
  NM.init();
  EM.init();
  Panel.init();
  IP.init();
  TB.init();
  SM.init();
  CryptoIO.init();
  LatexImport.init();
  DarkMode.init();
  ViewUI.init();
  BoxSelect.init();
  ML.init();  // shows mobile hint on touch devices; no-op on desktop
  MT.init();

  // Restore the previous session (if any), THEN set the undo baseline,
  // so a fresh page load starts with the restored graph as state zero.
  const restored = Persist.init();
  History.init();

  if (!restored && navigator.maxTouchPoints === 0) {
    Status.show('Double-click to create node · N=Place · C=Connect · Shift+drag=Select · Ctrl+Z=Undo · Ctrl+S=Save', 6000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
