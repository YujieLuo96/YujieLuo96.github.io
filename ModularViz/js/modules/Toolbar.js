'use strict';

/* ═══════════════════════════════════════════════════════════
   Toolbar
   deps: App, Canvas, NM, EM, Panel, IP, IO, Status
═══════════════════════════════════════════════════════════ */
const TB = {
  init() {
    const vp = document.getElementById('canvas-vp');

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
    document.getElementById('btn-node').addEventListener('click', () => App.setMode('place'));
    document.getElementById('btn-conn').addEventListener('click', () =>
      App.setMode(App.mode === 'conn' ? 'default' : 'conn'));
    document.getElementById('btn-save').addEventListener('click', trySave);

    // Load — use showOpenFilePicker (Chrome/Edge) to capture the FileSystemFileHandle,
    // enabling saveOverwrite to open the save dialog in the same directory.
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

    vp.addEventListener('click', async e => {
      if (App.mode !== 'place') return;
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
      if (App.mode !== 'default') return;
      if (e.target.closest('.node') || e.target.closest('.e-hit')) return;
      const canvasPos = Canvas.s2c(e.clientX, e.clientY);
      const vpRect    = vp.getBoundingClientRect();
      const title = await IP.show(e.clientX - vpRect.left, e.clientY - vpRect.top);
      if (title) NM.create(title, canvasPos.x, canvasPos.y);
    });

    vp.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
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

    window.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea')) return;
      switch (e.key) {
        case 'Escape':
          App.setMode('default'); NM.cancelConn();
          IP.cancel(); Panel.close(); Status.hide(); break;
        case 'n': case 'N': App.setMode('place'); break;
        case 'c': case 'C': App.setMode(App.mode==='conn'?'default':'conn'); break;
        case 'Delete': case 'Backspace':
          if (e.ctrlKey) break;
          if (App.selNode) { NM.remove(App.selNode); Panel.close(); App.selNode=null; }
          else if (App.selEdge) { EM.remove(App.selEdge); Panel.close(); App.selEdge=null; }
          break;
        case 's': case 'S':
          if (e.ctrlKey||e.metaKey) { e.preventDefault(); trySave(); } break;
      }
    });
  }
};
