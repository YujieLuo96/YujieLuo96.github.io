'use strict';

/* ═══════════════════════════════════════════════════════════
   IO — plain JSON save / load + shared graph (de)serialization
   deps: EB, Store, Status, NM, EM, Panel, Canvas
   File format:
     v1.0 / v1.1 — { version, nodes, edges }
     v1.2        — adds optional `view: {tx, ty, sc}`
   All versions load through the same tolerant reader.
═══════════════════════════════════════════════════════════ */

const IO = (() => {
  let _loadedFileName   = null; // name of the last plain-JSON file loaded
  let _loadedFileHandle = null; // FileSystemFileHandle from showOpenFilePicker (Chrome/Edge only)

  // ── Normalisation (tolerant of old / partial / damaged files) ──

  function _normNodes(raw) {
    const seen = new Set(), out = [];
    for (const n of raw || []) {
      if (!n || n.id == null) continue;
      const id = String(n.id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        title:   n.title != null ? String(n.title) : 'Node',
        content: n.content != null ? String(n.content) : '',
        color:   typeof n.color === 'string' && n.color ? n.color : '#6366f1',
        x: Number.isFinite(+n.x) ? +n.x : 0,
        y: Number.isFinite(+n.y) ? +n.y : 0,
        _el: null
      });
    }
    return out;
  }

  function _normEdges(raw, nodeIds) {
    const seen = new Set(), out = [];
    for (const e of raw || []) {
      if (!e || e.id == null || e.sourceId == null || e.targetId == null) continue;
      const id = String(e.id);
      const s = String(e.sourceId), t = String(e.targetId);
      if (seen.has(id) || !nodeIds.has(s) || !nodeIds.has(t)) continue;
      seen.add(id);
      out.push({
        id, sourceId: s, targetId: t,
        tag: e.tag != null ? String(e.tag) : '',
        curvatureIndex: Number.isFinite(+e.curvatureIndex) ? +e.curvatureIndex : 0,
        _g: null, _lbl: null
      });
    }
    return out;
  }

  function _validView(v) {
    return v && Number.isFinite(+v.tx) && Number.isFinite(+v.ty) &&
           Number.isFinite(+v.sc) && +v.sc > 0;
  }

  // ── Apply a graph to the canvas (single shared entry point) ──
  // opts.view       — {tx,ty,sc} to restore (falls back to fit-to-content)
  // opts.fitView    — default true; set false to keep current viewport (undo/redo)
  // opts.emitLoaded — default true; 'graph:loaded' resets history + schedules autosave

  function applyGraph(rawNodes, rawEdges, msg, opts = {}) {
    [...Store.nodes.values()].forEach(n => n._el?.remove());
    [...Store.edges.values()].forEach(e => { e._g?.remove(); e._lbl?.remove(); });
    Store.clear();
    Panel.close();
    _loadedFileName   = null; // reset on every canvas clear; IO.load sets both again right after
    _loadedFileHandle = null;

    const nodes = _normNodes(rawNodes);
    nodes.forEach(n => NM.load(n));
    const edges = _normEdges(rawEdges, new Set(nodes.map(n => n.id)));
    edges.forEach(e => EM.load(e));

    if (_validView(opts.view)) {
      Canvas.setTransform(+opts.view.tx, +opts.view.ty, +opts.view.sc);
    } else if (opts.fitView !== false) {
      ViewUI.fitToContent(false);
    }

    if (opts.emitLoaded !== false) EB.emit('graph:loaded');
    if (msg) Status.show(msg, 3000);
    return { nodes: nodes.length, edges: edges.length };
  }

  // ── Serialize current graph ──

  function buildPayload(includeView = true) {
    const payload = {
      version: '1.2',
      nodes: [...Store.nodes.values()].map(n => ({
        id: n.id, title: n.title, content: n.content, color: n.color, x: n.x, y: n.y
      })),
      edges: [...Store.edges.values()].map(e => ({
        id: e.id, sourceId: e.sourceId, targetId: e.targetId,
        tag: e.tag, curvatureIndex: e.curvatureIndex
      }))
    };
    if (includeView) payload.view = Canvas.get();
    return payload;
  }

  function _downloadJson(json, filename) {
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function _countMsg(verb, nn, ne) {
    return `${verb} ${nn} node${nn !== 1 ? 's' : ''} · ${ne} connection${ne !== 1 ? 's' : ''}`;
  }

  return {
    applyGraph,
    buildPayload,
    getLoadedFileName() { return _loadedFileName; },

    saveAs() {
      _downloadJson(
        JSON.stringify(buildPayload(), null, 2),
        'graph_' + new Date().toISOString().slice(0, 10) + '.json'
      );
      Status.show('File saved', 2500);
    },

    async saveOverwrite(filename) {
      const json = JSON.stringify(buildPayload(), null, 2);

      // 1. True in-place overwrite via the handle captured at load time (Chrome/Edge)
      if (_loadedFileHandle?.createWritable) {
        try {
          let perm = await _loadedFileHandle.queryPermission?.({ mode: 'readwrite' });
          if (perm === 'prompt') perm = await _loadedFileHandle.requestPermission?.({ mode: 'readwrite' });
          if (perm === 'granted') {
            const writable = await _loadedFileHandle.createWritable();
            await writable.write(json);
            await writable.close();
            Status.show(`Saved to ${filename}`, 2500);
            return;
          }
        } catch (err) {
          if (err.name === 'AbortError') return;
          // fall through to picker / download
        }
      }

      // 2. Save dialog pre-filled with the original name
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'JSON Graph', accept: { 'application/json': ['.json'] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(json);
          await writable.close();
          _loadedFileHandle = handle; // future overwrites go straight to this file
          _loadedFileName   = handle.name || filename;
          Status.show('File saved', 2500);
          return;
        } catch (err) {
          if (err.name === 'AbortError') return; // user cancelled — do nothing
        }
      }

      // 3. Plain download fallback (Firefox)
      _downloadJson(json, filename);
      Status.show('File saved', 2500);
    },

    // fileHandle is a FileSystemFileHandle from showOpenFilePicker (optional; null when using <input>)
    load(file, fileHandle) {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data || !Array.isArray(data.nodes))
            throw new Error('Invalid format: missing nodes array');
          const { nodes, edges } = applyGraph(
            data.nodes, data.edges || [], null, { view: data.view });
          Status.show(_countMsg('Loaded', nodes, edges), 3000);
          _loadedFileName   = file.name;      // set AFTER applyGraph (which resets both to null)
          _loadedFileHandle = fileHandle || null;
        } catch (err) { Status.show('Load failed: ' + err.message, 3500); }
      };
      reader.readAsText(file);
    },

    countMsg: _countMsg
  };
})();
