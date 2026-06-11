'use strict';

/* ═══════════════════════════════════════════════════════════
   SearchModule — ranked search with keyboard navigation
   deps: Store, Canvas, Status
═══════════════════════════════════════════════════════════ */
const SM = (() => {
  const DEBOUNCE_MS   = 130;
  const MAX_RESULTS   = 8;
  const FOCUS_SCALE   = 1.3;
  const CONTENT_STRIP = 52;

  let _debTimer   = null;
  let _highlights = new Set();
  let _matches    = [];     // nodes currently shown in the dropdown
  let _activeIdx  = -1;     // keyboard-highlighted dropdown row

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

  /* ── match computation (ranked) ── */
  // Score: title prefix (3) > title substring (2) > content substring (1)
  function _getMatches(q) {
    if (!q) return [];
    const lower   = q.toLowerCase();
    const scored  = [];
    for (const [, nd] of Store.nodes) {
      const title   = (nd.title   || '').toLowerCase();
      const content = (nd.content || '').toLowerCase();
      let score = 0;
      if (title.startsWith(lower))      score = 3;
      else if (title.includes(lower))   score = 2;
      else if (content.includes(lower)) score = 1;
      if (score) scored.push({ nd, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS).map(s => s.nd);
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
    return (s||'').replace(/\s+/g,' ').replace(/\$+/g,'').trim().substring(0, CONTENT_STRIP);
  }

  function _pick(nd) {
    _highlightOne(nd.id);
    _focusNode(nd.id);
    _input().value = nd.title;
    _clrBtn().classList.add('visible');
    _closeDD();
  }

  function _closeDD() {
    _dd().classList.remove('open');
    _matches = [];
    _activeIdx = -1;
  }

  function _setActive(idx) {
    const dd = _dd();
    _activeIdx = idx;
    [...dd.querySelectorAll('.sd-item')].forEach((el, i) =>
      el.classList.toggle('active', i === idx));
    if (idx >= 0) dd.children[idx]?.scrollIntoView({ block: 'nearest' });
  }

  function _renderDD(matches, q) {
    const dd = _dd();
    dd.innerHTML = '';
    _matches   = matches;
    _activeIdx = -1;
    if (!matches.length) { dd.classList.remove('open'); return; }

    matches.forEach((nd, i) => {
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

      item.addEventListener('mousedown', e => { e.preventDefault(); _pick(nd); });
      item.addEventListener('mousemove', () => _setActive(i));

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
    _closeDD();
    const count = _highlightAll(q);
    if (q) Status.show(count
      ? `${count} match${count !== 1 ? 'es' : ''} highlighted`
      : 'No matches', 2500);
  }

  function _onClear() {
    _input().value = '';
    _clrBtn().classList.remove('visible');
    clearHighlights();
    _closeDD();
    _input().focus();
  }

  /* ── public init ── */
  function init() {
    // Widget HTML is already in the toolbar (ModularViz.html); just wire up events.
    const inp = _input();
    if (!inp) return;
    inp.addEventListener('input', _onInput);
    inp.addEventListener('keydown', e => {
      const open = _dd().classList.contains('open');
      if (e.key === 'ArrowDown' && open) {
        e.preventDefault();
        _setActive((_activeIdx + 1) % _matches.length);
      } else if (e.key === 'ArrowUp' && open) {
        e.preventDefault();
        _setActive((_activeIdx - 1 + _matches.length) % _matches.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (open && _activeIdx >= 0) _pick(_matches[_activeIdx]);
        else _onSearch();
      } else if (e.key === 'Escape') {
        _onClear();
        inp.blur();
      }
      e.stopPropagation();
    });
    inp.addEventListener('focus', () => {
      const q = (inp.value||'').trim();
      if (q) _renderDD(_getMatches(q), q);
    });
    inp.addEventListener('blur', () => {
      setTimeout(_closeDD, 200);
    });

    _$('sm-btn').addEventListener('click', _onSearch);
    _clrBtn().addEventListener('click', _onClear);

    document.addEventListener('mousedown', e => {
      if (!_widget()?.contains(e.target)) _closeDD();
    });
  }

  return { init, clearHighlights };
})();
