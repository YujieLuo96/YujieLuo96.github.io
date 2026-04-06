/**
 * EventBus — lightweight publish/subscribe event bus
 * Decouples inter-module communication to avoid circular dependencies.
 *
 * Events:
 *   node:moved        (nodeId)               node dragged / repositioned
 *   edge:create       ({srcId,tgtId,opts?})  request EdgeModule to create edge
 *   edge:removeById   (edgeId)               request EdgeModule to delete edge
 *   sel:clearNodes    ()                     clear all node selection styles
 *   sel:clearEdges    ()                     clear all edge selection styles
 *   panel:showNode    (nodeId)               open node panel
 *   panel:showEdge    (edgeId)               open edge panel
 *   panel:close       ()                     close panel
 */

const _listeners = {};

export const EB = {
  on(event, fn) {
    (_listeners[event] = _listeners[event] || []).push(fn);
  },

  off(event, fn) {
    if (_listeners[event])
      _listeners[event] = _listeners[event].filter(h => h !== fn);
  },

  emit(event, data) {
    (_listeners[event] || []).slice().forEach(fn => fn(data));
  }
};
