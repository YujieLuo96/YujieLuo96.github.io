/**
 * app.js — application entry point
 *
 * Responsibilities:
 *   1. Call each module's init() in dependency order
 *   2. Show initial hint in the status bar
 *
 * Module dependency graph (acyclic):
 *
 *   EventBus ◄── Store ◄─────────────────────┐
 *      ▲                                      │
 *      │        LatexUtil ◄──────────────┐    │
 *      │                                 │    │
 *   StatusBar ◄── AppState ◄── Canvas    │    │
 *                    ▲                   │    │
 *                    │                   │    │
 *              NodeModule ───── EB       │    │
 *              EdgeModule ───── EB ──── LX    │
 *                    │                        │
 *              Panel ──── NM, EM, LX, Store ──┘
 *                    │
 *           InlinePrompt
 *           Toolbar ──── all modules
 *           IO      ──── Store, NM, EM, Panel
 */

import { Canvas } from './modules/Canvas.js';
import { NM }     from './modules/NodeModule.js';
import { EM }     from './modules/EdgeModule.js';
import { Panel }  from './modules/Panel.js';
import { IP }     from './modules/InlinePrompt.js';
import { TB }     from './modules/Toolbar.js';
import { SM }     from './modules/SearchModule.js';
import { Status } from './state/StatusBar.js';

function boot() {
  Canvas.init();
  NM.init();
  EM.init();
  Panel.init();
  IP.init();
  TB.init();
  SM.init();

  Status.show('Double-click to create node · N=Place · C=Connect · Del=Delete · Ctrl+S=Save', 6000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
