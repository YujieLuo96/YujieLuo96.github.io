'use strict';

/* ═══════════════════════════════════════════════════════════
   Panel
   deps: EB, Store, App, NM, EM, LX
═══════════════════════════════════════════════════════════ */
const Panel = (() => {
  let _debTimer      = null;
  let _editorCleanup = null;   // cleans up mirror div + ResizeObserver from last showNode
  const _el     = id => document.getElementById(id);
  const _panel  = () => _el('panel');
  const _body   = () => _el('panel-body');
  const _title  = () => _el('panel-title');
  const _btnDel = () => _el('btn-del');

  function _debounce(fn) { clearTimeout(_debTimer); _debTimer = setTimeout(fn, 280); }
  function open()  { _panel().classList.add('open'); }

  function close() {
    _panel().classList.remove('open');
    NM.clearAllSel();
    App.selNode = null; App.selEdge = null;
  }

  function _esc(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _field(lbl, html) {
    const div = document.createElement('div'); div.className = 'pf';
    div.innerHTML = `<div class="pf-label">${lbl}</div>${html}`;
    return div;
  }

  function _getParaRanges(src) {
    const parts = src.split(/\n{2,}/).filter(p => p.trim());
    const ranges = [];
    let from = 0;
    parts.forEach((part, i) => {
      const start = src.indexOf(part, from);
      ranges.push({ i, start, end: start + part.length });
      from = start + part.length;
    });
    return ranges;
  }

  function _inp(type, id, val='', ph='') {
    return `<input type="${type}" class="pi" id="${id}" value="${_esc(val)}" placeholder="${_esc(ph)}">`;
  }

  function _buildColorRow(data) {
    const row = document.createElement('div'); row.className = 'color-row';
    NM.COLORS.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'cswatch' + (c===data.color ? ' active' : '');
      sw.style.background = c; sw.dataset.c = c;
      sw.addEventListener('click', () => {
        data.color = c; NM.updateEl(data, true); EM.updateForNode(data.id);
        row.querySelectorAll('.cswatch').forEach(s => s.classList.toggle('active', s.dataset.c===c));
        cp.value = c;
      });
      row.appendChild(sw);
    });
    const cp = document.createElement('input');
    cp.type='color'; cp.value=data.color; cp.title='Custom color';
    cp.style.cssText='width:22px;height:22px;border:none;padding:0;cursor:pointer;border-radius:50%;overflow:hidden;flex-shrink:0';
    cp.addEventListener('input', () => {
      data.color=cp.value; NM.updateEl(data, true); EM.updateForNode(data.id);
      row.querySelectorAll('.cswatch').forEach(s=>s.classList.remove('active'));
    });
    row.appendChild(cp);
    return row;
  }

  function showNode(id) {
    const data = Store.nodes.get(id); if (!data) return;
    _title().textContent = 'Node Details';
    _body().innerHTML = '';
    _body().appendChild(_field('Title', _inp('text','pf-title',data.title)));
    const cs=document.createElement('div'); cs.className='pf';
    const cl=document.createElement('div'); cl.className='pf-label'; cl.textContent='Color';
    cs.appendChild(cl); cs.appendChild(_buildColorRow(data));
    _body().appendChild(cs);
    // ── Content editor with line numbers ──────────────────
    const editorField = document.createElement('div');
    editorField.className = 'pf';
    const editorLabel = document.createElement('div');
    editorLabel.className = 'pf-label';
    editorLabel.textContent = 'Content (LaTeX supported)';
    const editorWrap = document.createElement('div');
    editorWrap.className = 'pf-editor';
    const gutter = document.createElement('div');
    gutter.className = 'pf-ln-gutter';
    const ta = document.createElement('textarea');
    ta.className = 'pi';
    ta.id = 'pf-ct';
    ta.value = data.content;
    ta.spellcheck = false;
    editorWrap.appendChild(gutter);
    editorWrap.appendChild(ta);
    editorField.appendChild(editorLabel);
    editorField.appendChild(editorWrap);
    _body().appendChild(editorField);

    // ── Content label row with "→ Preview" align button ──
    editorLabel.innerHTML = '';
    const edLabelText = document.createElement('span');
    edLabelText.textContent = 'Content (LaTeX supported)';
    const btnToPreview = document.createElement('button');
    btnToPreview.className = 'align-btn';
    btnToPreview.textContent = '→ Preview';
    const edLabelRow = document.createElement('div');
    edLabelRow.className = 'pf-label-row';
    edLabelRow.appendChild(edLabelText);
    edLabelRow.appendChild(btnToPreview);
    editorLabel.appendChild(edLabelRow);

    // ── Preview field with "← Source" align button ──
    const prevField = document.createElement('div');
    prevField.className = 'pf';
    const prevLabelRow = document.createElement('div');
    prevLabelRow.className = 'pf-label-row';
    const prevLabelText = document.createElement('span');
    prevLabelText.textContent = 'Preview';
    const btnToSource = document.createElement('button');
    btnToSource.className = 'align-btn';
    btnToSource.textContent = '← Source';
    prevLabelRow.appendChild(prevLabelText);
    prevLabelRow.appendChild(btnToSource);
    const prevBox = document.createElement('div');
    prevBox.className = 'preview-box';
    prevBox.id = 'pf-prev';
    prevField.appendChild(prevLabelRow);
    prevField.appendChild(prevBox);
    _body().appendChild(prevField);

    const prev = prevBox;
    LX.render(data.content, prev, true);

    function _clearHighlights() {
      prev.querySelectorAll('.para-hl').forEach(el => el.classList.remove('para-hl'));
    }
    function _syncToPreview() {
      const s = ta.selectionStart, e = ta.selectionEnd;
      if (s === e) return;
      _clearHighlights();
      _getParaRanges(ta.value)
        .filter(r => r.end > s && r.start < e)
        .forEach(r => prev.querySelector(`[data-para-idx="${r.i}"]`)?.classList.add('para-hl'));
      prev.querySelector('.para-hl')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function _syncToSource() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      function _findIdx(node) {
        while (node && node !== prev) {
          if (node.dataset?.paraIdx !== undefined) return parseInt(node.dataset.paraIdx);
          node = node.parentElement;
        }
        return -1;
      }
      const ai = _findIdx(sel.anchorNode), fi = _findIdx(sel.focusNode);
      if (ai < 0 && fi < 0) return;
      const lo = Math.min(...[ai, fi].filter(x => x >= 0));
      const hi = Math.max(ai, fi);
      _clearHighlights();
      for (let i = lo; i <= hi; i++)
        prev.querySelector(`[data-para-idx="${i}"]`)?.classList.add('para-hl');
      const ranges = _getParaRanges(ta.value);
      const r0 = ranges[lo], r1 = ranges[Math.min(hi, ranges.length - 1)];
      if (!r0) return;
      ta.focus();
      ta.setSelectionRange(r0.start, (r1 || r0).end);
    }
    btnToPreview.addEventListener('click', _syncToPreview);
    btnToSource.addEventListener('click', _syncToSource);

    // ── Mirror div: measures visual line count per logical line ──
    // Called before open() so it exists; re-synced via rAF after layout.
    if (_editorCleanup) { _editorCleanup(); _editorCleanup = null; }
    const mirror = document.createElement('div');
    document.body.appendChild(mirror);

    function _syncGutter() {
      const s    = getComputedStyle(ta);
      const lhPx = parseFloat(s.lineHeight) || 18;
      // Mirror must match textarea's font + wrapping exactly
      mirror.style.cssText =
        `position:fixed;top:-9999px;left:-9999px;` +
        `visibility:hidden;pointer-events:none;` +
        `white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;` +
        `box-sizing:border-box;width:${ta.clientWidth}px;` +
        `font-family:${s.fontFamily};font-size:${s.fontSize};line-height:${s.lineHeight};` +
        `padding:0 ${s.paddingRight} 0 ${s.paddingLeft};`;
      const lines = ta.value.split('\n');
      const nums  = [];
      lines.forEach((line, i) => {
        let v = 1;
        if (line.length > 0) {
          mirror.textContent = line;
          v = Math.max(1, Math.round(mirror.offsetHeight / lhPx));
        }
        nums.push(String(i + 1));
        for (let j = 1; j < v; j++) nums.push('');  // blank rows for wrapped visual lines
      });
      gutter.textContent = nums.join('\n');
      gutter.scrollTop   = ta.scrollTop;
    }

    const _ro = new ResizeObserver(_syncGutter);
    _ro.observe(ta);
    ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });

    _editorCleanup = () => { mirror.remove(); _ro.disconnect(); };
    EB.on('panel:close', function _once() { _editorCleanup?.(); _editorCleanup = null; EB.off('panel:close', _once); });

    _el('pf-title').addEventListener('input', e => { data.title = e.target.value; NM.updateEl(data, true); });
    ta.addEventListener('input', e => {
      data.content = e.target.value; NM.updateEl(data, true);
      _syncGutter();
      _clearHighlights();
      _debounce(() => LX.render(data.content, prev, true));
    });
    _btnDel().onclick = () => { NM.remove(id); close(); };
    open();
    requestAnimationFrame(_syncGutter);  // re-sync after panel layout is finalized
  }

  function showEdge(id) {
    const data=Store.edges.get(id); if (!data) return;
    const src=Store.nodes.get(data.sourceId), tgt=Store.nodes.get(data.targetId);
    _title().textContent='Connection Details';
    _body().innerHTML='';
    const inf=document.createElement('div'); inf.className='pf';
    const il=document.createElement('div'); il.className='pf-label'; il.textContent='Connection';
    const ib=document.createElement('div'); ib.className='edge-info-box';
    ib.innerHTML=`${_esc(src?.title||'?')} <span class="edge-arrow-sym">→</span> ${_esc(tgt?.title||'?')}`;
    inf.appendChild(il); inf.appendChild(ib); _body().appendChild(inf);
    _body().appendChild(_field('Label (LaTeX / text)',_inp('text','pf-tag',data.tag,'Enter label…')));
    _body().appendChild(_field('Preview','<div class="preview-box" id="pf-eprev"></div>'));
    const prev=_el('pf-eprev');
    LX.render(data.tag, prev);
    _el('pf-tag').addEventListener('input',e=>{
      data.tag=e.target.value; EM.update(id);
      _debounce(()=>LX.render(data.tag,prev));
    });
    _btnDel().onclick=()=>{ EM.remove(id); close(); };
    open();
  }

  function init() {
    _el('panel-close').addEventListener('click', close);
    EB.on('panel:showNode', id => showNode(id));
    EB.on('panel:showEdge', id => showEdge(id));
    EB.on('panel:close',    ()  => close());

    // ── Panel resize handle ─────────────────────────────────
    const handle = document.createElement('div');
    handle.id = 'panel-resize-handle';
    _panel().prepend(handle);

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      const panelEl = _panel();
      const startX  = e.clientX;
      const startW  = panelEl.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor     = 'ew-resize';

      function onMove(ev) {
        const newW = Math.max(240, startW + (startX - ev.clientX));
        document.documentElement.style.setProperty('--panel-w', newW + 'px');
      }
      function onUp() {
        handle.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor     = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup',   onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup',   onUp);
    });
  }

  return { init, showNode, showEdge, close };
})();
