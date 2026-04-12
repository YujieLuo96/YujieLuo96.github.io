'use strict';

/* ═══════════════════════════════════════════════════════════
   EventBus
═══════════════════════════════════════════════════════════ */
const EB = (() => {
  const _map = {};
  return {
    on(e, fn)  { (_map[e] = _map[e] || []).push(fn); },
    off(e, fn) { if (_map[e]) _map[e] = _map[e].filter(h => h !== fn); },
    emit(e, d) { (_map[e] || []).slice().forEach(fn => fn(d)); }
  };
})();
