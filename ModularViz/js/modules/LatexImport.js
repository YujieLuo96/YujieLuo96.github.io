'use strict';

/* ═══════════════════════════════════════════════════════════
   LatexImport — parse .tex file → node graph
   deps: Store, NM, EM, Panel, Status
═══════════════════════════════════════════════════════════ */
const LatexImport = (() => {

  const SECTION_DEFS = [
    { cmd: 'chapter',       level: 1, color: '#3b82f6' },
    { cmd: 'section',       level: 2, color: '#22c55e' },
    { cmd: 'subsection',    level: 3, color: '#f59e0b' },
    { cmd: 'subsubsection', level: 4, color: '#ec4899' },
    { cmd: 'paragraph',     level: 5, color: '#14b8a6' },
    { cmd: 'subparagraph',  level: 6, color: '#8b5cf6' },
  ];

  // ── Math region protector ────────────────────────────────────
  // Compiled once. Matches (in order): $$…$$, \[…\], display envs,
  // $…$, \(…\).  $$ must come before $ in the alternation.
  const _MATH_RE = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{(?:equation|align|gather|multline|alignat|flalign|eqnarray|cases|CD)\*?\}[\s\S]*?\\end\{(?:equation|align|gather|multline|alignat|flalign|eqnarray|cases|CD)\*?\}|\$(?:[^$\\]|\\.)*\$|\\\((?:[^\\]|\\.)*?\\\)/g;

  // Unwrap regex compiled once (used inside _clean after math is hidden).
  const _UNWRAP_RE = /\\(?:textbf|textit|emph|texttt|textrm|textsf|textsc|textup|textmd|underline|overline|uline|mbox|makebox)\{([^{}]*)\}/g;

  function _hideMath(s) {
    const slots = [];
    const r = s.replace(_MATH_RE, m => { slots.push(m); return `\x00${slots.length - 1}\x00`; });
    return { r, slots };
  }
  function _showMath(r, slots) {
    return r.replace(/\x00(\d+)\x00/g, (_, i) => slots[+i]);
  }

  // ── Verbatim range detector ──────────────────────────────────
  // Returns array of [start, end) index pairs for regions where
  // section commands should NOT be matched.
  function _getVerbatimRanges(src) {
    const ranges = [];
    for (const env of ['verbatim', 'Verbatim', 'lstlisting', 'minted', 'alltt', 'filecontents']) {
      const re = new RegExp(`\\\\begin\\{${env}\\*?\\}[\\s\\S]*?\\\\end\\{${env}\\*?\\}`, 'g');
      let m;
      while ((m = re.exec(src)) !== null) ranges.push([m.index, m.index + m[0].length]);
    }
    // Inline \verb|...| with any single non-letter delimiter
    const verbInline = /\\verb\*?([^a-zA-Z\s])([\s\S]*?)\1/g;
    let m;
    while ((m = verbInline.exec(src)) !== null) ranges.push([m.index, m.index + m[0].length]);
    return ranges;
  }
  function _inRanges(pos, ranges) {
    return ranges.some(([s, e]) => pos >= s && pos < e);
  }

  // ── Brace-aware argument extractor ──────────────────────────
  // openPos = index of the opening '{'.
  // Returns { content, endPos } where endPos is index after closing '}'.
  // Skips \{ and \} (escaped braces) to avoid false depth changes.
  function _extractBraced(src, openPos) {
    let depth = 0, i = openPos, start = -1;
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '{') { depth++; if (depth === 1) start = i + 1; }
      else if (src[i] === '}') { depth--; if (depth === 0) return { content: src.slice(start, i), endPos: i + 1 }; }
      i++;
    }
    return { content: src.slice(start !== -1 ? start : openPos + 1), endPos: src.length };
  }

  // ── LaTeX content cleaner ────────────────────────────────────
  function _clean(raw) {
    let s = raw;

    // 1. Strip line comments (safety net; top-level _parse already stripped them)
    s = s.replace(/(?<!\\)%[^\n]*/g, '');

    // 2. Strip non-renderable block environments (env and env* via \*? in one pass)
    for (const env of ['figure', 'table', 'lstlisting', 'verbatim', 'Verbatim',
                       'tikzpicture', 'pgfpicture', 'tabular', 'wrapfigure', 'floatrow',
                       'algorithm', 'algorithmic', 'algorithm2e', 'minted', 'alltt',
                       'filecontents']) {
      s = s.replace(new RegExp(`\\\\begin\\{${env}\\*?\\}[\\s\\S]*?\\\\end\\{${env}\\*?\\}`, 'g'), '');
    }

    // 3. Strip theorem-like environment *tags only* — keep math content inside.
    //    Handles env and env* with a single pattern.  Optional [label] stripped too.
    for (const env of ['abstract', 'theorem', 'lemma', 'corollary', 'proposition', 'claim',
                       'proof', 'remark', 'definition', 'example', 'exercise', 'solution',
                       'conjecture', 'observation', 'notation', 'assumption']) {
      s = s.replace(new RegExp(`\\\\begin\\{${env}\\*?\\}(?:\\[[^\\]]*\\])?`, 'g'), '');
      s = s.replace(new RegExp(`\\\\end\\{${env}\\*?\\}`, 'g'), '');
    }

    // 4. Strip list environment tags (keep item content — converted in step 12)
    for (const env of ['itemize', 'enumerate', 'description', 'compactitem', 'compactenum']) {
      s = s.replace(new RegExp(`\\\\(?:begin|end)\\{${env}\\*?\\}`, 'g'), '');
    }

    // 5. Strip non-content commands with their arguments
    s = s.replace(/\\(?:label|index|phantom|vphantom)\{[^{}]*\}/g, '');
    s = s.replace(/\\(?:vspace|hspace)\*?\{[^{}]*\}/g, '');
    // \caption and \captionof handled separately (different argument counts)
    s = s.replace(/\\caption\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
    s = s.replace(/\\captionof\{[^{}]*\}\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
    s = s.replace(/\\(?:input|include|includeonly)\{[^{}]*\}/g, '');
    s = s.replace(/\\(?:bibliography|bibliographystyle)\{[^{}]*\}/g, '');
    // \thanks{} appears in \title and \author
    s = s.replace(/\\thanks\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
    s = s.replace(/\\nocite\{[^{}]*\}/g, '');

    // 6. Strip document-structure commands that produce no visible inline content
    s = s.replace(/\\(?:maketitle|tableofcontents|listoffigures|listoftables|printindex)\b/g, '');
    s = s.replace(/\\(?:vskip|hskip|vfill|hfill|noindent|newpage|clearpage|pagebreak|bigskip|medskip|smallskip)\b[^\n]*/g, '');
    s = s.replace(/\\(?:centering|raggedright|raggedleft|flushright|flushleft)\b/g, '');

    // 7. Strip footnotes (one level of nesting)
    s = s.replace(/\\footnote\{(?:[^{}]|\{[^{}]*\})*\}/g, '');

    // 8. References and citations → readable placeholders
    s = s.replace(/\\(?:eq)?ref\{[^{}]*\}/g, '(ref)');
    s = s.replace(/\\autoref\{[^{}]*\}/g, '(ref)');
    s = s.replace(/\\cite[a-zA-Z]*\*?\{[^{}]*\}/g, '[cite]');

    // 9. URLs and hyperlinks
    s = s.replace(/\\href\{[^{}]*\}\{([^{}]*)\}/g, '$1');
    s = s.replace(/\\url\{[^{}]*\}/g, '');

    // 10. Two-argument color/box commands
    s = s.replace(/\\textcolor\{[^{}]*\}\{([^{}]*)\}/g, '$1');
    s = s.replace(/\\colorbox\{[^{}]*\}\{([^{}]*)\}/g, '$1');

    // 11. Unwrap text-mode formatting commands.
    //     Math regions are hidden first so \textbf{} etc. inside $...$ are preserved.
    const { r: hidden, slots } = _hideMath(s);
    let h = hidden;
    for (let pass = 0; pass < 3; pass++) h = h.replace(_UNWRAP_RE, '$1');
    s = _showMath(h, slots);

    // 12. \item → bullet (preserve optional label: \item[X] → • X: )
    s = s.replace(/\\item\s*(?:\[([^\]]*)\])?\s*/g, (_, lbl) => lbl ? `• ${lbl}: ` : '• ');

    // 13. Strip leftover size/font commands
    s = s.replace(/\\(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/g, '');

    // 14. Whitespace and line-break normalisation
    s = s.replace(/\\(?:quad|qquad)\b/g, '  ');
    s = s.replace(/\\(?:newline|linebreak)\b/g, '\\\\ ');
    s = s.replace(/\n{3,}/g, '\n\n');

    return s.trim();
  }

  // ── Extract a \cmd{...} value (brace-aware) ──────────────────
  function _extractCmd(src, cmd) {
    const re = new RegExp(`\\\\${cmd}\\s*\\{`);
    const m  = re.exec(src);
    if (!m) return '';
    return _clean(_extractBraced(src, m.index + m[0].length - 1).content);
  }

  // ── Extract document body ────────────────────────────────────
  function _getBody(src) {
    const bTag = '\\begin{document}';
    const eTag = '\\end{document}';
    const b = src.indexOf(bTag), e = src.indexOf(eTag);
    if (b !== -1 && e !== -1) return src.slice(b + bTag.length, e);
    return src;
  }

  // ── Extract abstract text ────────────────────────────────────
  function _getAbstract(body) {
    const m = /\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/.exec(body);
    return m ? _clean(m[1]) : '';
  }

  // ── Split body into flat ordered section array ───────────────
  function _splitSections(body) {
    // Pre-compute verbatim ranges so we never mistake code-example
    // section commands (e.g. inside \begin{lstlisting}) for real headings.
    const verbRanges = _getVerbatimRanges(body);

    const cmds = SECTION_DEFS.map(d => d.cmd).join('|');
    const re   = new RegExp(`\\\\(${cmds})\\*?(?:\\[[^\\]]*\\])?\\s*\\{`, 'g');

    const hits = [];
    let m;
    while ((m = re.exec(body)) !== null) {
      if (_inRanges(m.index, verbRanges)) continue;  // skip code-block false positives
      const def      = SECTION_DEFS.find(d => d.cmd === m[1]);
      const bracePos = m.index + m[0].length - 1;   // m[0] ends with '{'
      const { content: rawTitle, endPos } = _extractBraced(body, bracePos);
      hits.push({ index: m.index, endIndex: endPos,
                  level: def.level, color: def.color, title: _clean(rawTitle) });
    }

    if (hits.length === 0) return [];

    return hits.map((h, i) => ({
      level:   h.level,
      color:   h.color,
      title:   h.title,
      content: _clean(body.slice(h.endIndex, i + 1 < hits.length ? hits[i + 1].index : body.length)),
    }));
  }

  // ── Build tree from flat section list ───────────────────────
  function _buildTree(rootTitle, rootContent, sections) {
    const root = { id: 'lt_root', title: rootTitle, content: rootContent,
                   color: '#6366f1', level: 0, children: [] };
    if (sections.length === 0) return root;

    const minLevel = sections.reduce((mn, s) => Math.min(mn, s.level), Infinity);

    const stack = [root];
    let seq = 0;
    for (const s of sections) {
      const node = { id: 'lt_' + (++seq), title: s.title, content: s.content,
                     color: s.color, level: s.level - minLevel + 1, children: [] };
      while (stack.length > 1 && stack[stack.length - 1].level >= node.level) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
    return root;
  }

  // ── Tree layout: left-to-right dendrogram ───────────────────
  // X-axis = depth (each level X_STEP px to the right).
  // Y-axis = document order (leaf nodes spaced Y_STEP px apart).
  // Internal node Y = midpoint of its subtree's first and last leaf Y.
  // After layout, all coordinates are shifted so the bounding box
  // starts at (MARGIN, MARGIN) — nodes are always visible on load.
  function _layout(root) {
    const X_STEP = 380;
    const Y_STEP = 180;
    const MARGIN = 40;
    const flatNodes = [], flatEdges = [];

    // Pass 1 — sequential leaf index in document order
    let leafSeq = 0;
    function indexLeaves(node) {
      if (node.children.length === 0) { node._leafIdx = leafSeq++; }
      else { node.children.forEach(indexLeaves); node._leafIdx = null; }
    }
    indexLeaves(root);

    // Pass 2 — propagate leaf-range [_lo, _hi] up to every internal node
    function propagateRange(node) {
      if (node._leafIdx !== null) {
        node._lo = node._hi = node._leafIdx;
      } else {
        node.children.forEach(propagateRange);
        node._lo = node.children[0]._lo;
        node._hi = node.children[node.children.length - 1]._hi;
      }
    }
    propagateRange(root);

    // Pass 3 — assign coordinates
    function assign(node, depth) {
      node.x = depth * X_STEP;
      node.y = Math.round((node._lo + node._hi) / 2 * Y_STEP);
      flatNodes.push({ id: node.id, title: node.title, content: node.content,
                       color: node.color, x: node.x, y: node.y });
      for (const child of node.children) {
        flatEdges.push({ id: `le_${node.id}_${child.id}`,
                         sourceId: node.id, targetId: child.id,
                         tag: '', curvatureIndex: 0 });
        assign(child, depth + 1);
      }
    }
    assign(root, 0);

    // Translate so top-left of bounding box starts at (MARGIN, MARGIN)
    const minX = Math.min(...flatNodes.map(n => n.x));
    const minY = Math.min(...flatNodes.map(n => n.y));
    flatNodes.forEach(n => { n.x += MARGIN - minX; n.y += MARGIN - minY; });

    return { nodes: flatNodes, edges: flatEdges };
  }

  // ── Parse entry point ────────────────────────────────────────
  function _parse(src) {
    // Strip all line comments once at the top level so every downstream
    // function (\extractCmd, _splitSections, _clean) sees comment-free text.
    // This also prevents commented-out \title{} from being picked up.
    const clean = src.replace(/(?<!\\)%[^\n]*/g, '');

    const title    = _extractCmd(clean, 'title') || 'Untitled Document';
    const body     = _getBody(clean);
    const abstract = _getAbstract(body);
    const sections = _splitSections(body);

    if (sections.length === 0) {
      const content = abstract || _clean(body);
      return { nodes: [{ id: 'lt_root', title, content, color: '#6366f1', x: MARGIN, y: MARGIN }], edges: [] };
    }

    const tree = _buildTree(title, abstract, sections);
    return _layout(tree);
  }

  const MARGIN = 40;  // matches the constant inside _layout / _parse fallback

  // ── Load graph onto canvas (mirrors IO._applyGraph) ──────────
  function _loadToCanvas({ nodes, edges }) {
    [...Store.nodes.values()].forEach(n => n._el?.remove());
    [...Store.edges.values()].forEach(e => { e._g?.remove(); e._lbl?.remove(); });
    Store.clear();
    Panel.close();

    nodes.forEach(n => NM.load({ id: n.id, title: n.title, content: n.content,
                                  color: n.color, x: n.x, y: n.y, _el: null }));
    requestAnimationFrame(() => {
      edges.forEach(ed => EM.load({ id: ed.id, sourceId: ed.sourceId, targetId: ed.targetId,
                                     tag: ed.tag, curvatureIndex: ed.curvatureIndex,
                                     _g: null, _lbl: null }));
    });
  }

  // ── Export as IO-compatible JSON ─────────────────────────────
  function _exportJson({ nodes, edges }, baseName) {
    const payload = {
      version: '1.1',
      nodes: nodes.map(n => ({ id: n.id, title: n.title, content: n.content,
                                color: n.color, x: n.x, y: n.y })),
      edges: edges.map(e => ({ id: e.id, sourceId: e.sourceId, targetId: e.targetId,
                                tag: e.tag, curvatureIndex: e.curvatureIndex })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = baseName.replace(/\.tex$/i, '') + '.graph.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── File handler ─────────────────────────────────────────────
  // Reads UTF-8 first; if more than 10 replacement characters (U+FFFD)
  // are found the file is likely Latin-1 encoded — retry with that encoding.
  function _handleFile(file) {
    function tryRead(enc) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = e => res(e.target.result);
        r.onerror = () => rej(new Error('read error'));
        r.readAsText(file, enc);
      });
    }

    tryRead('utf-8')
      .then(src => (src.match(/\uFFFD/g) || []).length > 10 ? tryRead('latin1') : src)
      .then(src => {
        try {
          const result = _parse(src);
          _loadToCanvas(result);
          _exportJson(result, file.name);
          const nn = result.nodes.length, ne = result.edges.length;
          Status.show(
            `LaTeX imported · ${nn} node${nn !== 1 ? 's' : ''} · ${ne} edge${ne !== 1 ? 's' : ''} · JSON saved`,
            4500
          );
        } catch (err) {
          Status.show('LaTeX import failed: ' + err.message, 4000);
        }
      })
      .catch(() => Status.show('Could not read .tex file', 3000));
  }

  // ── init ─────────────────────────────────────────────────────
  function init() {
    document.getElementById('btn-latex-import').addEventListener('click', () =>
      document.getElementById('latex-file-inp').click()
    );
    document.getElementById('latex-file-inp').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) _handleFile(f);
      e.target.value = '';
    });
  }

  return { init };
})();
