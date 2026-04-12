'use strict';

/* ═══════════════════════════════════════════════════════════
   SearchModule
   deps: Store, Canvas
═══════════════════════════════════════════════════════════ */
const SM = (() => {
  const DEBOUNCE_MS   = 130;
  const MAX_RESULTS   = 8;
  const FOCUS_SCALE   = 1.3;
  const CONTENT_STRIP = 52;

  let _debTimer   = null;
  let _highlights = new Set();

  const _$      = id => document.getElementById(id);
  const _input  = ()  => _$('sm-input');
  const _dd     = ()  => _$('sm-dropdown');
  const _widget = ()  => _$('sm-widget');
  const _clrBtn = ()  => _$('sm-clear');

  /* ── highlight management ── */
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
      const hit = (nd.title   || '').toLowerCase().includes(lower) ||
                  (nd.content || '').toLowerCase().includes(lower);
      if (hit) {
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

  /* ── canvas focus ── */
  function _focusNode(id) {
    const nd = Store.nodes.get(id);
    if (!nd || !nd._el) return;
    const w = nd._el.offsetWidth  || 120;
    const h = nd._el.offsetHeight || 40;
    Canvas.focusOn(nd.x + w / 2, nd.y + h / 2, FOCUS_SCALE);
  }

  /* ── match computation ── */
  function _getMatches(q) {
    if (!q) return [];
    const lower   = q.toLowerCase();
    const results = [];
    for (const [, nd] of Store.nodes) {
      const hit = (nd.title   || '').toLowerCase().includes(lower) ||
                  (nd.content || '').toLowerCase().includes(lower);
      if (hit) {
        results.push(nd);
        if (results.length >= MAX_RESULTS) break;
      }
    }
    return results;
  }

  /* ── dropdown rendering ── */
  function _esc(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _hlText(text, q) {
    if (!q) return _esc(text);
    const idx = (text||'').toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return _esc(text);
    return _esc(text.slice(0,idx)) +
           '<mark>' + _esc(text.slice(idx, idx+q.length)) + '</mark>' +
           _esc(text.slice(idx+q.length));
  }

  function _strip(s) {
    return (s||'').replace(/\$+/g,'').substring(0, CONTENT_STRIP);
  }

  function _renderDD(matches, q) {
    const dd = _dd();
    dd.innerHTML = '';
    if (!matches.length) { dd.classList.remove('open'); return; }

    matches.forEach(nd => {
      const item = document.createElement('div');
      item.className = 'sd-item';

      const titleEl = document.createElement('div');
      titleEl.className = 'sd-title';
      titleEl.innerHTML = _hlText(nd.title || 'Untitled', q);
      item.appendChild(titleEl);

      const stripped = _strip(nd.content);
      if (stripped) {
        const sub = document.createElement('div');
        sub.className = 'sd-sub';
        sub.innerHTML = _hlText(stripped, q);
        item.appendChild(sub);
      }

      item.addEventListener('mousedown', e => {
        e.preventDefault();
        _highlightOne(nd.id);
        _focusNode(nd.id);
        _input().value = nd.title;
        _clrBtn().classList.add('visible');
        dd.classList.remove('open');
      });

      dd.appendChild(item);
    });
    dd.classList.add('open');
  }

  /* ── handlers ── */
  function _onInput() {
    const q = (_input().value||'').trim();
    _clrBtn().classList.toggle('visible', q.length > 0);
    clearTimeout(_debTimer);
    _debTimer = setTimeout(() => _renderDD(_getMatches(q), q), DEBOUNCE_MS);
  }

  function _onSearch() {
    const q = (_input().value||'').trim();
    _dd().classList.remove('open');
    _highlightAll(q);
  }

  function _onClear() {
    _input().value = '';
    _clrBtn().classList.remove('visible');
    clearHighlights();
    _dd().classList.remove('open');
    _input().focus();
  }

  /* ── public init ── */
  function init() {
    // Widget HTML is already in the toolbar (index.html); just wire up events.
    const inp = _input();
    if (!inp) return;
    inp.addEventListener('input', _onInput);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); _onSearch(); }
      if (e.key === 'Escape') { _onClear(); }
      e.stopPropagation();
    });
    inp.addEventListener('focus', () => {
      const q = (inp.value||'').trim();
      if (q) _renderDD(_getMatches(q), q);
    });
    inp.addEventListener('blur', () => {
      setTimeout(() => _dd().classList.remove('open'), 200);
    });

    _$('sm-btn').addEventListener('click', _onSearch);
    _clrBtn().addEventListener('click', _onClear);

    document.addEventListener('mousedown', e => {
      if (!_widget()?.contains(e.target)) _dd().classList.remove('open');
    });
  }

  return { init, clearHighlights };
})();
