'use strict';

/* ═══════════════════════════════════════════════════════════
   Store
═══════════════════════════════════════════════════════════ */
const Store = {
  nodes: new Map(),
  edges: new Map(),
  addNode(n)     { this.nodes.set(n.id, n); },
  addEdge(e)     { this.edges.set(e.id, e); },
  removeNode(id) { this.nodes.delete(id); },
  removeEdge(id) { this.edges.delete(id); },
  clear()        { this.nodes.clear(); this.edges.clear(); }
};
