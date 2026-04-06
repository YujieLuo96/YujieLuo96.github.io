/**
 * Toolbar — toolbar buttons + global keyboard shortcuts
 *
 * Acts as a coordinator; may reference all other modules.
 * No other module depends on Toolbar, so there is no circular risk.
 *
 * Shortcuts:
 *   N         — place node mode
 *   C         — toggle connect mode
 *   Ctrl+S    — save file
 *   Delete / Backspace — delete selected node or edge
 *   Escape    — cancel current operation / close panel
 */

import { App }    from '../state/AppState.js';
import { Status } from '../state/StatusBar.js';
import { Canvas } from './Canvas.js';
import { NM }     from './NodeModule.js';
import { EM }     from './EdgeModule.js';
import { Panel }  from './Panel.js';
import { IP }     from './InlinePrompt.js';
import { IO }     from './IO.js';

function init() {
  const vp = document.getElementById('canvas-vp');

  document.getElementById('btn-node').addEventListener('click', () => {
    App.setMode('place');
  });

  document.getElementById('btn-conn').addEventListener('click', () => {
    App.setMode(App.mode === 'conn' ? 'default' : 'conn');
  });

  document.getElementById('btn-save').addEventListener('click', IO.save);

  document.getElementById('btn-load').addEventListener('click', () => {
    document.getElementById('file-inp').click();
  });

  document.getElementById('file-inp').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) IO.load(file);
    e.target.value = '';
  });

  vp.addEventListener('click', async e => {
    if (App.mode !== 'place') return;
    if (e.target.closest('.node') || e.target.closest('.e-hit')) return;
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
    if (App.mode === 'default') {
      NM.clearAllSel();
      Panel.close();
    }
    if (App.mode === 'conn') {
      NM.cancelConn();
    }
  });

  vp.addEventListener('contextmenu', e => {
    if (!e.target.closest('.node')) {
      e.preventDefault();
      NM.cancelConn();
      if (App.mode === 'default') Status.hide();
    }
  });

  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;

    switch (e.key) {
      case 'Escape':
        App.setMode('default');
        NM.cancelConn();
        IP.cancel();
        Panel.close();
        Status.hide();
        break;

      case 'n': case 'N':
        App.setMode('place');
        break;

      case 'c': case 'C':
        App.setMode(App.mode === 'conn' ? 'default' : 'conn');
        break;

      case 'Delete': case 'Backspace':
        if (e.ctrlKey) break;
        if (App.selNode) {
          NM.remove(App.selNode);
          Panel.close();
          App.selNode = null;
        } else if (App.selEdge) {
          EM.remove(App.selEdge);
          Panel.close();
          App.selEdge = null;
        }
        break;

      case 's': case 'S':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); IO.save(); }
        break;
    }
  });
}

export const TB = { init };
