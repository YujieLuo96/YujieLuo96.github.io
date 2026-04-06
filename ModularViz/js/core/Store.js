/**
 * Store — central data store (no DOM, no events)
 *
 * NodeData: { id, title, content, color, x, y, _el }
 * EdgeData: { id, sourceId, targetId, tag, curvatureIndex, _g }
 *
 * _el / _g are runtime references and are not serialized.
 */

export const Store = {
  /** @type {Map<string, NodeData>} */
  nodes: new Map(),

  /** @type {Map<string, EdgeData>} */
  edges: new Map(),

  addNode(node)  { this.nodes.set(node.id, node); },
  addEdge(edge)  { this.edges.set(edge.id, edge); },
  removeNode(id) { this.nodes.delete(id); },
  removeEdge(id) { this.edges.delete(id); },

  clear() {
    this.nodes.clear();
    this.edges.clear();
  }
};
