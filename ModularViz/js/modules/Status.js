'use strict';

/* ═══════════════════════════════════════════════════════════
   StatusBar
═══════════════════════════════════════════════════════════ */
const Status = (() => {
  let _timer = null;
  const _el = () => document.getElementById('status');

  function show(msg, ms = 0) {
    clearTimeout(_timer);
    const bar = _el(); if (!bar) return;
    bar.textContent = msg;
    bar.classList.add('on');
    if (ms > 0) _timer = setTimeout(() => bar.classList.remove('on'), ms);
  }
  function hide() { clearTimeout(_timer); _el()?.classList.remove('on'); }

  return { show, hide };
})();
