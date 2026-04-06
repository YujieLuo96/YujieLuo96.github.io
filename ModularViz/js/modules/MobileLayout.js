/**
 * MobileLayout — viewport management and FAB injection for touch devices
 *
 * Responsibilities:
 *   1. Keep --real-vh CSS variable in sync with the actual visible height
 *      (fixes iOS Safari 100vh including the address bar)
 *   2. Detect soft-keyboard appearance via visualViewport and shift the
 *      #ip InlinePrompt so it is never hidden behind the keyboard
 *   3. Inject the three FAB buttons (New Node / Connect / Delete) and
 *      keep their visual state in sync with AppState
 *
 * Desktop guard: every public function returns immediately when
 * navigator.maxTouchPoints === 0, so this module is completely inert
 * on pointer-device environments.
 */

import { App }   from '../state/AppState.js';
import { NM }    from './NodeModule.js';
import { EM }    from './EdgeModule.js';
import { Panel } from './Panel.js';
import { Status } from '../state/StatusBar.js';

const IS_TOUCH = navigator.maxTouchPoints > 0;

/* ── 1. Real viewport height ─────────────────────────────── */

function _updateVh() {
  const vh = (window.visualViewport?.height ?? window.innerHeight) * 0.01;
  document.documentElement.style.setProperty('--real-vh', vh + 'px');
}

/* ── 2. FAB injection ────────────────────────────────────── */

function _buildFAB() {
  const fab = document.createElement('div');
  fab.id = 'mob-fab';
  fab.setAttribute('aria-label', 'Quick actions');

  // Delete
  const del = document.createElement('button');
  del.id        = 'fab-del';
  del.className = 'fab-btn disabled';
  del.title     = 'Delete selected';
  del.setAttribute('aria-label', 'Delete selected');
  del.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="2,4 14,4"/>
    <path d="M5 4V2.5h6V4"/>
    <path d="M3.5 4l.9 9.5h7.2l.9-9.5"/>
    <line x1="6.5" y1="7" x2="6.5" y2="11"/>
    <line x1="9.5" y1="7" x2="9.5" y2="11"/>
  </svg>`;

  // Connect
  const conn = document.createElement('button');
  conn.id        = 'fab-conn';
  conn.className = 'fab-btn';
  conn.title     = 'Connect mode';
  conn.setAttribute('aria-label', 'Toggle connect mode');
  conn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round">
    <circle cx="3" cy="8" r="2"/>
    <circle cx="13" cy="8" r="2"/>
    <path d="M5 8 Q8 3.5 11 8" stroke-linecap="round"/>
  </svg>`;

  // New Node
  const node = document.createElement('button');
  node.id        = 'fab-node';
  node.className = 'fab-btn';
  node.title     = 'New node';
  node.setAttribute('aria-label', 'New node');
  node.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="1.5" y="3" width="13" height="10" rx="2"/>
    <line x1="8" y1="6" x2="8" y2="10"/>
    <line x1="6" y1="8" x2="10" y2="8"/>
  </svg>`;

  fab.appendChild(del);
  fab.appendChild(conn);
  fab.appendChild(node);
  document.body.appendChild(fab);

  // ── Wire events ─────────────────────────────────────────

  node.addEventListener('click', () => {
    App.setMode('place');
    Status.show('Tap canvas to place node', 4000);
  });

  conn.addEventListener('click', () => {
    const next = App.mode === 'conn' ? 'default' : 'conn';
    App.setMode(next);
  });

  del.addEventListener('click', () => {
    if (App.selNode) {
      NM.remove(App.selNode);
      Panel.close();
      App.selNode = null;
    } else if (App.selEdge) {
      EM.remove(App.selEdge);
      Panel.close();
      App.selEdge = null;
    }
    _syncFAB();
  });

  return fab;
}

/* Keep FAB button states in sync with AppState */
function _syncFAB() {
  const conn = document.getElementById('fab-conn');
  const del  = document.getElementById('fab-del');
  if (!conn || !del) return;

  conn.classList.toggle('active', App.mode === 'conn');
  del.classList.toggle('disabled', !App.selNode && !App.selEdge);
}

/* Poll AppState for changes — lightweight since it's just class toggling */
function _startFABSync() {
  let prevMode    = App.mode;
  let prevSelNode = App.selNode;
  let prevSelEdge = App.selEdge;

  function tick() {
    if (
      App.mode    !== prevMode    ||
      App.selNode !== prevSelNode ||
      App.selEdge !== prevSelEdge
    ) {
      prevMode    = App.mode;
      prevSelNode = App.selNode;
      prevSelEdge = App.selEdge;
      _syncFAB();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ── 3. Startup hint override for touch ─────────────────── */

function _mobileHint() {
  Status.show(
    'Tap [+Node] or double-tap canvas · Long-press node to connect',
    7000
  );
}

/* ── Public init ─────────────────────────────────────────── */

function init() {
  if (!IS_TOUCH) return;

  // Real vh
  _updateVh();
  window.addEventListener('resize', _updateVh);
  window.addEventListener('orientationchange', () => setTimeout(_updateVh, 300));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _updateVh);
  }

  // FAB
  _buildFAB();
  _syncFAB();
  _startFABSync();

  // Startup hint
  _mobileHint();
}

export const ML = { init };
