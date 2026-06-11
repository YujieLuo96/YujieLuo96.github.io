'use strict';

/* ═══════════════════════════════════════════════════════════
   Persist — localStorage autosave + session restore
   deps: EB, IO, Status

   Every graph mutation (and pan/zoom) schedules a debounced
   write; on boot the last session is restored automatically,
   so an accidental refresh or crash never loses work.
═══════════════════════════════════════════════════════════ */
const Persist = (() => {
  const KEY = 'modularviz-autosave-v1';
  const DEBOUNCE_MS = 700;
  let _timer = null;

  function save() {
    if (_timer !== null) { clearTimeout(_timer); _timer = null; }
    try {
      localStorage.setItem(KEY, JSON.stringify({
        savedAt: Date.now(),
        payload: IO.buildPayload(true)
      }));
    } catch (_) { /* quota exceeded / private mode — degrade silently */ }
  }

  function _schedule() {
    clearTimeout(_timer);
    _timer = setTimeout(save, DEBOUNCE_MS);
  }

  function clear() {
    if (_timer !== null) { clearTimeout(_timer); _timer = null; }
    try { localStorage.removeItem(KEY); } catch (_) {}
  }

  function _restore() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(KEY)); } catch (_) {}
    const p = stored?.payload;
    if (!p || !Array.isArray(p.nodes) || p.nodes.length === 0) return false;
    IO.applyGraph(p.nodes, p.edges || [], 'Restored unsaved session', { view: p.view });
    return true;
  }

  function init() {
    EB.on('graph:changed', _schedule);
    EB.on('graph:loaded',  _schedule);
    EB.on('view:changed',  _schedule);
    window.addEventListener('pagehide', save);   // flush pending write on tab close
    return _restore();
  }

  return { init, save, clear };
})();
