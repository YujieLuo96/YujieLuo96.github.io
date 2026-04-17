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
  ML.init();  // shows mobile hint on touch devices; no-op on desktop
  MT.init();
  if (navigator.maxTouchPoints === 0) {
    Status.show('Double-click to create node · N=Place · C=Connect · Del=Delete · Ctrl+S=Save', 6000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
