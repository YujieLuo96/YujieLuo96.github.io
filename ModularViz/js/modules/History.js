'use strict';

/* ═══════════════════════════════════════════════════════════
   History — snapshot-based undo / redo
   deps: EB, IO, Status

   Listens to 'graph:changed' (emitted by every mutation point)
   and pushes a serialized snapshot. Consecutive emissions in the
   same tick coalesce into one snapshot; a snapshot identical to
   the current stack top is ignored (this also makes the
   'graph:changed' emitted after undo/redo itself a safe no-op).
═══════════════════════════════════════════════════════════ */
const History = (() => {
  const MAX = 60;
  let _stack = [];
  let _idx   = -1;
  let _timer = null;

  function _snapshot() { return JSON.stringify(IO.buildPayload(false)); }

  function _updateButtons() {
    const u = document.getElementById('btn-undo');
    const r = document.getElementById('btn-redo');
    if (u) u.disabled = _idx <= 0;
    if (r) r.disabled = _idx >= _stack.length - 1;
  }

  function record() {
    if (_timer !== null) return;       // coalesce burst emissions
    _timer = setTimeout(() => {
      _timer = null;
      const snap = _snapshot();
      if (snap === _stack[_idx]) return;
      _stack.splice(_idx + 1);         // drop redo tail
      _stack.push(snap);
      if (_stack.length > MAX) _stack.shift();
      _idx = _stack.length - 1;
      _updateButtons();
    }, 0);
  }

  function _apply(json) {
    const p = JSON.parse(json);
    IO.applyGraph(p.nodes, p.edges, null, { fitView: false, emitLoaded: false });
    EB.emit('graph:changed');          // autosave picks this up; record() dedupes it
    _updateButtons();
  }

  function undo() {
    if (_idx <= 0) { Status.show('Nothing to undo', 1500); return; }
    _idx--;
    _apply(_stack[_idx]);
    Status.show('Undo', 1200);
  }

  function redo() {
    if (_idx >= _stack.length - 1) { Status.show('Nothing to redo', 1500); return; }
    _idx++;
    _apply(_stack[_idx]);
    Status.show('Redo', 1200);
  }

  function reset() {
    if (_timer !== null) { clearTimeout(_timer); _timer = null; }
    _stack = [_snapshot()];
    _idx   = 0;
    _updateButtons();
  }

  function init() {
    EB.on('graph:changed', record);
    EB.on('graph:loaded',  record);  // loads are undoable too — Ctrl+Z restores the previous graph
    reset();                         // baseline = state at boot (after session restore)
    document.getElementById('btn-undo')?.addEventListener('click', undo);
    document.getElementById('btn-redo')?.addEventListener('click', redo);
  }

  return { init, undo, redo, reset };
})();
