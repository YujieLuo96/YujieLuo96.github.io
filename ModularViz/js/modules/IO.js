/**
 * IO — file save / load
 *
 * Save format (JSON):
 * {
 *   version: "1.1",
 *   nodes: [{ id, title, content, color, x, y }],
 *   edges: [{ id, sourceId, targetId, tag, curvatureIndex }]
 * }
 *
 * Runtime references (_el, _g) are excluded from serialization.
 */

import { Store }  from '../core/Store.js';
import { Status } from '../state/StatusBar.js';
import { NM }     from './NodeModule.js';
import { EM }     from './EdgeModule.js';
import { Panel }  from './Panel.js';

function save() {
  const payload = {
    version: '1.1',
    nodes: [...Store.nodes.values()].map(n => ({
      id:      n.id,
      title:   n.title,
      content: n.content,
      color:   n.color,
      x:       n.x,
      y:       n.y
    })),
    edges: [...Store.edges.values()].map(e => ({
      id:             e.id,
      sourceId:       e.sourceId,
      targetId:       e.targetId,
      tag:            e.tag,
      curvatureIndex: e.curvatureIndex
    }))
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'graph_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);

  Status.show('File saved', 2500);
}

function load(file) {
  const reader = new FileReader();

  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges))
        throw new Error('Invalid format: missing nodes or edges');

      _clearCanvas();

      data.nodes.forEach(n => NM.load({
        id:      n.id,
        title:   n.title   || 'Node',
        content: n.content || '',
        color:   n.color   || '#6366f1',
        x:       +n.x || 0,
        y:       +n.y || 0,
        _el: null
      }));

      requestAnimationFrame(() => {
        data.edges.forEach(ed => EM.load({
          id:             ed.id,
          sourceId:       ed.sourceId,
          targetId:       ed.targetId,
          tag:            ed.tag            || '',
          curvatureIndex: ed.curvatureIndex || 0,
          _g: null
        }));
        Status.show(
          `Loaded ${data.nodes.length} node${data.nodes.length !== 1 ? 's' : ''} · ${data.edges.length} connection${data.edges.length !== 1 ? 's' : ''}`,
          3000
        );
      });

    } catch (err) {
      Status.show('Load failed: ' + err.message, 3500);
    }
  };

  reader.readAsText(file);
}

function _clearCanvas() {
  [...Store.nodes.values()].forEach(n => n._el?.remove());
  [...Store.edges.values()].forEach(e => e._g?.remove());
  Store.clear();
  Panel.close();
}

export const IO = { save, load };
