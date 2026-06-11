'use strict';

/* ═══════════════════════════════════════════════════════════
   LatexEditor — LaTeX editing helpers shared by the side panel
   and a fullscreen split (source | live preview) editor modal.
   deps: LX
   No init() needed — the modal is built lazily on first open().
═══════════════════════════════════════════════════════════ */
const LatexEditor = (() => {

  // ── Snippets (insert at cursor, wrapping the selection) ──
  const SNIPPETS = [
    { label: '$x$', title: 'Inline math  $…$',            before: '$',                    after: '$',                  ph: 'x' },
    { label: '$$',  title: 'Display math block  $$…$$',   before: '$$\n',                 after: '\n$$',               ph: 'x^2' },
    { label: 'a∕b', title: 'Fraction  \\frac{}{}',         before: '\\frac{',              after: '}{}',                ph: 'a' },
    { label: '√',   title: 'Square root  \\sqrt{}',        before: '\\sqrt{',              after: '}',                  ph: 'x' },
    { label: 'xⁿ',  title: 'Superscript  ^{}',             before: '^{',                   after: '}',                  ph: 'n' },
    { label: 'xₙ',  title: 'Subscript  _{}',               before: '_{',                   after: '}',                  ph: 'n' },
    { label: '∑',   title: 'Sum  \\sum',                   before: '\\sum_{i=1}^{n} ',     after: '',                   ph: '' },
    { label: '∫',   title: 'Integral  \\int',              before: '\\int_{a}^{b} ',       after: '',                   ph: '' },
    { label: '▦',   title: 'Matrix  pmatrix',              before: '\\begin{pmatrix} ',    after: ' \\end{pmatrix}',    ph: 'a & b \\\\ c & d' },
    { label: '⋮=',  title: 'Aligned equations  $$\\begin{aligned}…\\end{aligned}$$',
      before: '$$\\begin{aligned}\n', after: '\n\\end{aligned}$$', ph: 'a &= b \\\\\n  &= c' },
    { label: 'B',   title: 'Bold  \\textbf{}',   cls: 'lx-b', before: '\\textbf{',         after: '}',                  ph: 'text' },
    { label: 'I',   title: 'Italic  \\textit{}', cls: 'lx-i', before: '\\textit{',         after: '}',                  ph: 'text' },
  ];

  // ── Cursor-aware text insertion ──────────────────────────
  // execCommand keeps the textarea's native undo stack alive;
  // setRangeText is the standards fallback.
  function insert(ta, snip) {
    if (!ta) return;
    ta.focus();
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel  = ta.value.slice(s, e) || snip.ph || '';
    const text = (snip.before || '') + sel + (snip.after || '');
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (_) {}
    if (!ok) {
      ta.setRangeText(text, s, e, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const pos = s + (snip.before || '').length;
    ta.setSelectionRange(pos, pos + sel.length);
  }

  /** Snippet button bar. getTa() resolves the target textarea at click time. */
  function makeToolbar(getTa) {
    const bar = document.createElement('div');
    bar.className = 'lx-snips';
    SNIPPETS.forEach(sn => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lx-snip' + (sn.cls ? ' ' + sn.cls : '');
      b.textContent = sn.label;
      b.title = sn.title;
      b.addEventListener('mousedown', e => e.preventDefault()); // keep textarea focus + selection
      b.addEventListener('click', () => insert(getTa(), sn));
      bar.appendChild(b);
    });
    return bar;
  }

  /** Editing niceties for a LaTeX textarea (Tab → two spaces). */
  function enhance(ta) {
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        let ok = false;
        try { ok = document.execCommand('insertText', false, '  '); } catch (_) {}
        if (!ok) {
          ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });
  }

  /* ── Fullscreen split editor ───────────────────────────── */
  let _backdrop = null, _modal = null, _ta = null, _prev = null, _titleEl = null;
  let _onChange = null, _renderTimer = null;

  function _isOpen() { return !!_modal && _modal.classList.contains('open'); }

  function _build() {
    _backdrop = document.createElement('div');
    _backdrop.className = 'cio-backdrop';
    _backdrop.id = 'lxe-backdrop';

    _modal = document.createElement('div');
    _modal.className = 'lxe-modal';
    _modal.setAttribute('role', 'dialog');
    _modal.setAttribute('aria-modal', 'true');
    _modal.innerHTML =
      '<div class="lxe-hd">' +
        '<span class="lxe-title" id="lxe-title">Edit Content</span>' +
        '<span class="lxe-hint">LaTeX source · live preview &nbsp;—&nbsp; Esc or Done to close</span>' +
        '<button class="cio-btn-primary" id="lxe-done">Done</button>' +
      '</div>' +
      '<div class="lxe-tools"></div>' +
      '<div class="lxe-body">' +
        '<textarea class="lxe-ta" spellcheck="false" ' +
          'placeholder="Type LaTeX here — $inline$, $$display$$, \\begin{aligned}…"></textarea>' +
        '<div class="lxe-prev"></div>' +
      '</div>';
    document.body.appendChild(_backdrop);
    document.body.appendChild(_modal);

    _ta      = _modal.querySelector('.lxe-ta');
    _prev    = _modal.querySelector('.lxe-prev');
    _titleEl = _modal.querySelector('#lxe-title');
    _modal.querySelector('.lxe-tools').appendChild(makeToolbar(() => _ta));
    enhance(_ta);

    _ta.addEventListener('input', () => {
      _onChange?.(_ta.value);
      clearTimeout(_renderTimer);
      _renderTimer = setTimeout(() => LX.render(_ta.value, _prev, true), 250);
    });

    _modal.querySelector('#lxe-done').addEventListener('click', close);
    _backdrop.addEventListener('click', close);

    // While open: Esc closes; all other global shortcuts are muted so
    // Delete / Ctrl+Z etc. cannot hit the canvas behind the modal.
    document.addEventListener('keydown', e => {
      if (!_isOpen()) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.target !== _ta) e.stopPropagation();
    }, true);
  }

  /**
   * Open the fullscreen editor.
   * @param {{title?: string, value: string, onChange: (v: string) => void}} opts
   * onChange fires on every keystroke (caller debounces expensive work).
   */
  function open(opts) {
    if (!_modal) _build();
    _titleEl.textContent = opts.title || 'Edit Content';
    _ta.value = opts.value || '';
    _onChange = opts.onChange || null;
    LX.render(_ta.value, _prev, true);
    _backdrop.classList.add('open');
    _modal.classList.add('open');
    requestAnimationFrame(() => _ta.focus());
  }

  function close() {
    if (!_isOpen()) return;
    clearTimeout(_renderTimer);
    _backdrop.classList.remove('open');
    _modal.classList.remove('open');
    _onChange = null;
  }

  return { open, close, makeToolbar, enhance, insert };
})();
