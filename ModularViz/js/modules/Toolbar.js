'use strict';

/* ═══════════════════════════════════════════════════════════
   Toolbar — buttons, canvas click flows, keyboard shortcuts
   deps: EB, Store, App, Canvas, NM, EM, Panel, IP, IO,
         Status, History, ViewUI
═══════════════════════════════════════════════════════════ */
const TB = {
  init() {
    const vp = document.getElementById('canvas-vp');
    let nudgeTimer = null;

    // ── Save Choice Modal ──────────────────────────────────
    const scBackdrop = document.getElementById('sc-backdrop');
    const scModal    = document.getElementById('sc-modal');
    const scFilename = document.getElementById('sc-filename');

    function openSaveChoice() {
      scFilename.textContent = IO.getLoadedFileName();
      scModal.classList.add('open');
      scBackdrop.classList.add('open');
    }
    function closeSaveChoice() {
      scModal.classList.remove('open');
      scBackdrop.classList.remove('open');
    }
    function trySave() {
      if (IO.getLoadedFileName()) openSaveChoice();
      else IO.saveAs();
    }

    scBackdrop.addEventListener('click', closeSaveChoice);
    document.getElementById('sc-cancel').addEventListener('click', closeSaveChoice);
    document.getElementById('sc-saveas').addEventListener('click', () => {
      closeSaveChoice(); IO.saveAs();
    });
    document.getElementById('sc-overwrite').addEventListener('click', () => {
      const name = IO.getLoadedFileName(); closeSaveChoice(); IO.saveOverwrite(name);
    });

    // ── Toolbar buttons ────────────────────────────────────
    document.getElementById('btn-node').addEventListener('click', () =>
      App.setMode(App.mode === 'place' ? 'default' : 'place'));
    document.getElementById('btn-conn').addEventListener('click', () =>
      App.setMode(App.mode === 'conn' ? 'default' : 'conn'));
    document.getElementById('btn-save').addEventListener('click', trySave);

    function newCanvas() {
      if (Store.nodes.size &&
          !window.confirm('Clear the canvas and start a new graph?\n(Ctrl+Z can bring the current one back.)')) return;
      IO.applyGraph([], [], 'New canvas');
    }
    document.getElementById('btn-new').addEventListener('click', newCanvas);

    // Load — use showOpenFilePicker (Chrome/Edge) to capture the FileSystemFileHandle,
    // enabling saveOverwrite to write back to the same file.
    // Falls back to <input type="file"> on unsupported browsers (Firefox).
    async function tryLoad() {
      if ('showOpenFilePicker' in window) {
        try {
          const [handle] = await window.showOpenFilePicker({
            types: [{ description: 'JSON Graph', accept: { 'application/json': ['.json'] } }],
            multiple: false
          });
          IO.load(await handle.getFile(), handle);
          return;
        } catch (err) {
          if (err.name === 'AbortError') return; // user cancelled
          // unexpected error: fall through to <input> fallback
        }
      }
      document.getElementById('file-inp').click();
    }

    document.getElementById('btn-load').addEventListener('click', tryLoad);
    document.getElementById('file-inp').addEventListener('change', e => {
      const f = e.target.files[0]; if (f) IO.load(f); e.target.value = '';
    });

    // ── Canvas click flows ─────────────────────────────────
    // Canvas overlay widgets (zoom bar etc.) must not act as canvas clicks
    const onWidget = e => !!e.target.closest('#vz-zoombar');

    vp.addEventListener('click', async e => {
      if (App.mode !== 'place' || onWidget(e)) return;
      if (e.target.closest('.node') || e.target.closest('.e-hit')) { App.setMode('default'); return; }
      const canvasPos = Canvas.s2c(e.clientX, e.clientY);
      const vpRect    = vp.getBoundingClientRect();
      const title = await IP.show(e.clientX - vpRect.left, e.clientY - vpRect.top);
      if (title) {
        NM.create(title, canvasPos.x, canvasPos.y);
        Status.show('Node created', 2000);
      }
      App.setMode('default');
    });

    vp.addEventListener('dblclick', async e => {
      if (App.mode !== 'default' || onWidget(e)) return;
      if (e.target.closest('.node') || e.target.closest('.e-hit')) return;
      const canvasPos = Canvas.s2c(e.clientX, e.clientY);
      const vpRect    = vp.getBoundingClientRect();
      const title = await IP.show(e.clientX - vpRect.left, e.clientY - vpRect.top);
      if (title) NM.create(title, canvasPos.x, canvasPos.y);
    });

    vp.addEventListener('mousedown', e => {
      if (e.button !== 0 || onWidget(e)) return;
      if (e.target.closest('.node') || e.target.closest('.e-hit')) return;
      if (App.mode === 'default') { Panel.close(); }  // Panel.close() calls clearAllSel internally
      if (App.mode === 'conn')    { NM.cancelConn(); }
    });

    vp.addEventListener('contextmenu', e => {
      if (!e.target.closest('.node')) {
        e.preventDefault(); NM.cancelConn();
        if (App.mode === 'default') Status.hide();
      }
    });

    // ── Keyboard shortcuts ─────────────────────────────────
    window.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        const k = e.key.toLowerCase();
        if      (k === 's') { e.preventDefault(); trySave(); }
        else if (k === 'z') { e.preventDefault(); e.shiftKey ? History.redo() : History.undo(); }
        else if (k === 'y') { e.preventDefault(); History.redo(); }
        else if (k === 'd') { e.preventDefault(); NM.duplicateSelection(); }
        else if (k === 'a') { e.preventDefault(); NM.setSelection([...Store.nodes.keys()]); }
        else if (k === '0') { e.preventDefault(); ViewUI.resetZoom(); }
        else if (k === '=' || k === '+') { e.preventDefault(); Canvas.zoomStep(1); }
        else if (k === '-') { e.preventDefault(); Canvas.zoomStep(-1); }
        return;
      }
      if (e.altKey) return;

      switch (e.key) {
        case 'Escape':
          App.setMode('default'); NM.cancelConn();
          IP.cancel(); Panel.close(); Status.hide(); break;
        case 'n': case 'N': App.setMode(App.mode === 'place' ? 'default' : 'place'); break;
        case 'c': case 'C': App.setMode(App.mode === 'conn'  ? 'default' : 'conn');  break;
        case 'f': case 'F': ViewUI.fitToContent(); break;
        case 'Delete': case 'Backspace':
          if (NM.removeSelection()) { Panel.close(); }
          else if (App.selEdge) { EM.remove(App.selEdge); Panel.close(); App.selEdge = null; }
          break;
        case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
          const step = e.shiftKey ? 10 : 2;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
          if (NM.nudgeSelection(dx, dy)) {
            e.preventDefault();
            clearTimeout(nudgeTimer);
            nudgeTimer = setTimeout(() => EB.emit('graph:changed'), 450);
          }
          break;
        }
      }
    });
  }
};
