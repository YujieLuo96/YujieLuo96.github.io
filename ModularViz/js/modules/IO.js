'use strict';

/* ═══════════════════════════════════════════════════════════
   IO — plain JSON save / load
   deps: Store, Status, NM, EM, Panel
═══════════════════════════════════════════════════════════ */

let _loadedFileName   = null; // name of the last plain-JSON file loaded
let _loadedFileHandle = null; // FileSystemFileHandle from showOpenFilePicker (Chrome/Edge only)

function _applyGraph(rawNodes, rawEdges, msg) {
  [...Store.nodes.values()].forEach(n => n._el?.remove());
  [...Store.edges.values()].forEach(e => { e._g?.remove(); e._lbl?.remove(); });
  Store.clear();
  Panel.close();
  _loadedFileName   = null; // reset on every canvas clear; IO.load sets both again right after
  _loadedFileHandle = null;
  rawNodes.forEach(n => NM.load({
    id: n.id, title: n.title || 'Node', content: n.content || '',
    color: n.color || '#6366f1', x: +n.x || 0, y: +n.y || 0, _el: null
  }));
  requestAnimationFrame(() => {
    rawEdges.forEach(ed => EM.load({
      id: ed.id, sourceId: ed.sourceId, targetId: ed.targetId,
      tag: ed.tag || '', curvatureIndex: ed.curvatureIndex || 0, _g: null, _lbl: null
    }));
    Status.show(msg, 3000);
  });
}

function _buildPayload() {
  return {
    version: '1.1',
    nodes: [...Store.nodes.values()].map(n => ({
      id: n.id, title: n.title, content: n.content, color: n.color, x: n.x, y: n.y
    })),
    edges: [...Store.edges.values()].map(e => ({
      id: e.id, sourceId: e.sourceId, targetId: e.targetId,
      tag: e.tag, curvatureIndex: e.curvatureIndex
    }))
  };
}

function _downloadJson(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const IO = {
  getLoadedFileName() { return _loadedFileName; },

  saveAs() {
    _downloadJson(
      JSON.stringify(_buildPayload(), null, 2),
      'graph_' + new Date().toISOString().slice(0, 10) + '.json'
    );
    Status.show('File saved', 2500);
  },

  async saveOverwrite(filename) {
    const json = JSON.stringify(_buildPayload(), null, 2);
    if ('showSaveFilePicker' in window) {
      try {
        const opts = {
          suggestedName: filename,
          types: [{ description: 'JSON Graph', accept: { 'application/json': ['.json'] } }]
        };
        if (_loadedFileHandle) opts.startIn = _loadedFileHandle; // jump straight to source directory
        const handle = await window.showSaveFilePicker(opts);
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        Status.show('File saved', 2500);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled — do nothing
        // unexpected error: fall through to download fallback
      }
    }
    _downloadJson(json, filename);
    Status.show('File saved', 2500);
  },

  // fileHandle is a FileSystemFileHandle from showOpenFilePicker (optional; null when using <input>)
  load(file, fileHandle) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges))
          throw new Error('Invalid format: missing nodes or edges');
        const nn = data.nodes.length, ne = data.edges.length;
        _applyGraph(data.nodes, data.edges,
          `Loaded ${nn} node${nn !== 1 ? 's' : ''} · ${ne} connection${ne !== 1 ? 's' : ''}`);
        _loadedFileName   = file.name;      // set AFTER _applyGraph (which resets both to null)
        _loadedFileHandle = fileHandle || null;
      } catch(err) { Status.show('Load failed: ' + err.message, 3500); }
    };
    reader.readAsText(file);
  }
};
