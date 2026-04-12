'use strict';

/* ═══════════════════════════════════════════════════════════
   MobileLayout — viewport fix + FAB injection
   deps: Status
═══════════════════════════════════════════════════════════ */
const ML = (() => {
  const IS_TOUCH = navigator.maxTouchPoints > 0;

  function _updateVh() {
    const vh = (window.visualViewport?.height ?? window.innerHeight) * 0.01;
    document.documentElement.style.setProperty('--real-vh', vh + 'px');
  }

  function init() {
    if (!IS_TOUCH) return;
    _updateVh();
    window.addEventListener('resize', _updateVh);
    window.addEventListener('orientationchange', () => setTimeout(_updateVh, 300));
    window.visualViewport?.addEventListener('resize', _updateVh);
    Status.show('Double-tap canvas to add node · Long-press node to connect', 7000);
  }

  return { init };
})();
