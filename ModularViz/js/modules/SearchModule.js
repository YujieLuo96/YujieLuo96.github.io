/**
 * SearchModule (SM) — floating search widget
 *
 * UI placement: top-left overlay inside #canvas-vp
 *
 * Two interaction modes:
 *   1. Confirm search (Enter / search button)
 *        → Highlights ALL nodes whose title or content matches the query
 *          by adding the .search-match CSS class.
 *
 *   2. Click a suggestion in the dropdown
 *        → Highlights only that node (.search-match),
 *          then animates the canvas to centre on it with a zoom-in.
 *
 * Emits via EB: (none — interacts with Store and Canvas directly)
 * Listens to EB: (none — self-contained)
 *
 * Public API:
 *   SM.init()
 *   SM.clearHighlights()
 */

import { Store }  from '../core/Store.js';
import { Canvas } from './Canvas.js';

/* ── Constants ───────────────────────────────────────────── */
const DEBOUNCE_MS    = 130;
const MAX_RESULTS    = 8;
const FOCUS_SCALE    = 1.3;
const CONTENT_STRIP  = 52;   // chars of content shown in suggestion

/* ── Private state ───────────────────────────────────────── */
let _debTimer       = null;
let _highlights     = new Set();   // ids currently .search-match

/* ── DOM helpers ─────────────────────────────────────────── */
const _$  = id => document.getElementById(id);
const _input    = () => _$('sm-input');
const _dropdown = () => _$('sm-dropdown');
const _widget   = () => _$('sm-widget');
const _clearBtn = () => _$('sm-clear');

/* ── Highlight management ────────────────────────────────── */
function clearHighlights() {
  _highlights.forEach(id => {
    Store.nodes.get(id)?._el?.classList.remove('search-match');
  });
  _highlights.clear();
}

function _highlightAll(q) {
  clearHighlights();
  if (!q) return 0;
  const lower = q.toLowerCase();
  let count = 0;
  for (const [id, nd] of Store.nodes) {
    const inTitle   = (nd.title   || '').toLowerCase().includes(lower);
    const inContent = (nd.content || '').toLowerCase().includes(lower);
    if (inTitle || inContent) {
      nd._el?.classList.add('search-match');
      _highlights.add(id);
      count++;
    }
  }
  return count;
}

function _highlightOne(id) {
  clearHighlights();
  const nd = Store.nodes.get(id);
  if (!nd) return;
  nd._el?.classList.add('search-match');
  _highlights.add(id);
}

/* ── Canvas focus ────────────────────────────────────────── */
function _focusNode(id) {
  const nd = Store.nodes.get(id);
  if (!nd || !nd._el) return;
  const w = nd._el.offsetWidth  || 120;
  const h = nd._el.offsetHeight || 40;
  Canvas.focusOn(nd.x + w / 2, nd.y + h / 2, FOCUS_SCALE);
}

/* ── Match computation ───────────────────────────────────── */
function _getMatches(q) {
  if (!q) return [];
  const lower   = q.toLowerCase();
  const results = [];
  for (const [, nd] of Store.nodes) {
    const inTitle   = (nd.title   || '').toLowerCase().includes(lower);
    const inContent = (nd.content || '').toLowerCase().includes(lower);
    if (inTitle || inContent) {
      results.push(nd);
      if (results.length >= MAX_RESULTS) break;
    }
  }
  return results;
}

/* ── Dropdown rendering ──────────────────────────────────── */
function _stripLatex(s) {
  return (s || '').replace(/\$+/g, '').substring(0, CONTENT_STRIP);
}

function _highlight(text, q) {
  // Wrap matched substring with <mark>
  if (!q) return _escHtml(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return _escHtml(text);
  return (
    _escHtml(text.slice(0, idx)) +
    '<mark>' + _escHtml(text.slice(idx, idx + q.length)) + '</mark>' +
    _escHtml(text.slice(idx + q.length))
  );
}

function _escHtml(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _renderDropdown(matches, q) {
  const dd = _dropdown();
  dd.innerHTML = '';

  if (!matches.length) {
    dd.classList.remove('open');
    return;
  }

  matches.forEach(nd => {
    const item = document.createElement('div');
    item.className = 'sd-item';

    const titleEl = document.createElement('div');
    titleEl.className = 'sd-title';
    titleEl.innerHTML = _highlight(nd.title || 'Untitled', q);
    item.appendChild(titleEl);

    const stripped = _stripLatex(nd.content);
    if (stripped) {
      const sub = document.createElement('div');
      sub.className = 'sd-sub';
      sub.innerHTML = _highlight(stripped, q);
      item.appendChild(sub);
    }

    // mousedown (not click) so blur on input doesn't close dropdown first
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      _highlightOne(nd.id);
      _focusNode(nd.id);
      _input().value = nd.title;
      _clearBtn().classList.add('visible');
      dd.classList.remove('open');
    });

    dd.appendChild(item);
  });

  dd.classList.add('open');
}

/* ── Input handlers ──────────────────────────────────────── */
function _onInput() {
  const q = (_input().value || '').trim();
  _clearBtn().classList.toggle('visible', q.length > 0);
  clearTimeout(_debTimer);
  _debTimer = setTimeout(() => {
    _renderDropdown(_getMatches(q), q);
  }, DEBOUNCE_MS);
}

function _onSearch() {
  const q = (_input().value || '').trim();
  _dropdown().classList.remove('open');
  _highlightAll(q);
}

function _onClear() {
  _input().value = '';
  _clearBtn().classList.remove('visible');
  clearHighlights();
  _dropdown().classList.remove('open');
  _input().focus();
}

/* ── DOM construction ────────────────────────────────────── */
function _buildWidget() {
  const widget = document.createElement('div');
  widget.id = 'sm-widget';
  widget.innerHTML = `
    <div id="sm-bar">
      <svg class="sm-icon" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="6.5" cy="6.5" r="4.5"/>
        <line x1="10" y1="10" x2="14" y2="14"/>
      </svg>
      <input id="sm-input" type="text"
             placeholder="Search nodes…"
             autocomplete="off" spellcheck="false">
      <button id="sm-clear" class="sm-icon-btn" title="Clear">
        <svg viewBox="0 0 16 16" fill="none"
             stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="4" y1="4" x2="12" y2="12"/>
          <line x1="12" y1="4" x2="4" y2="12"/>
        </svg>
      </button>
      <div class="sm-divider"></div>
      <button id="sm-btn" class="sm-icon-btn sm-go" title="Search (Enter)">
        <svg viewBox="0 0 16 16" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="6.5" cy="6.5" r="4.5"/>
          <line x1="10" y1="10" x2="14" y2="14"/>
        </svg>
      </button>
    </div>
    <div id="sm-dropdown"></div>
  `;
  return widget;
}

/* ── Public init ─────────────────────────────────────────── */
function init() {
  // Widget HTML is already in the toolbar (index.html); just wire up events.
  const input = _input();
  if (!input) return;

  input.addEventListener('input', _onInput);

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); _onSearch(); }
    if (e.key === 'Escape') { _onClear(); }
    e.stopPropagation();   // prevent global hotkeys while typing in the box
  });

  input.addEventListener('focus', () => {
    const q = (input.value || '').trim();
    if (q) _renderDropdown(_getMatches(q), q);
  });

  input.addEventListener('blur', () => {
    // Delay so the item's mousedown fires first
    setTimeout(() => _dropdown().classList.remove('open'), 160);
  });

  _$('sm-btn').addEventListener('click', _onSearch);
  _clearBtn().addEventListener('click', _onClear);

  // Close dropdown on outside click
  document.addEventListener('mousedown', e => {
    if (!_widget()?.contains(e.target)) {
      _dropdown().classList.remove('open');
    }
  });
}

export const SM = { init, clearHighlights };
