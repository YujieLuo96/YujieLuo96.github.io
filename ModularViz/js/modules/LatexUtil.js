'use strict';

/* ═══════════════════════════════════════════════════════════
   LatexUtil — KaTeX rendering helpers
═══════════════════════════════════════════════════════════ */
const LX = (() => {
  const _DELIMITERS = [
    { left: '$$',                  right: '$$',                  display: true  },
    { left: '\\[',                 right: '\\]',                 display: true  },
    { left: '\\begin{equation}',   right: '\\end{equation}',    display: true  },
    { left: '\\begin{equation*}',  right: '\\end{equation*}',   display: true  },
    { left: '\\begin{align}',      right: '\\end{align}',       display: true  },
    { left: '\\begin{align*}',     right: '\\end{align*}',      display: true  },
    { left: '\\begin{alignat}',    right: '\\end{alignat}',     display: true  },
    { left: '\\begin{alignat*}',   right: '\\end{alignat*}',    display: true  },
    { left: '\\begin{gather}',     right: '\\end{gather}',      display: true  },
    { left: '\\begin{gather*}',    right: '\\end{gather*}',     display: true  },
    { left: '\\begin{multline}',   right: '\\end{multline}',    display: true  },
    { left: '\\begin{multline*}',  right: '\\end{multline*}',   display: true  },
    { left: '\\begin{CD}',         right: '\\end{CD}',          display: true  },
    { left: '$',                   right: '$',                   display: false },
    { left: '\\(',                 right: '\\)',                 display: false }
  ];

  // Convenience macros available in every math region (render-time only;
  // saved files stay plain LaTeX and remain valid without them).
  const _MACROS = {
    '\\R':    '\\mathbb{R}',
    '\\N':    '\\mathbb{N}',
    '\\Z':    '\\mathbb{Z}',
    '\\Q':    '\\mathbb{Q}',
    '\\C':    '\\mathbb{C}',
    '\\F':    '\\mathbb{F}',
    '\\eps':  '\\varepsilon',
    '\\abs':  '\\left|#1\\right|',
    '\\norm': '\\left\\lVert#1\\right\\rVert',
    '\\set':  '\\left\\{#1\\right\\}',
    '\\inner':'\\left\\langle#1\\right\\rangle'
  };

  const _KATEX_OPTS = {
    delimiters: _DELIMITERS,
    macros: _MACROS,
    errorColor: '#ef4444',
    throwOnError: false
  };

  // Math-region matcher used for preview-safe truncation
  // ($$ must precede $ in the alternation).
  const _MATH_RE = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{(?:equation|align|gather|multline|alignat|CD)\*?\}[\s\S]*?\\end\{(?:equation|align|gather|multline|alignat|CD)\*?\}|\$(?:[^$\\]|\\.)*\$|\\\((?:[^\\]|\\.)*?\\\)/g;

  // Replace \\ in plain-text nodes with <br>; skip KaTeX-rendered subtrees.
  function _applyTextBreaks(el) {
    for (const node of [...el.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.textContent.includes('\\\\')) continue;
        const frag = document.createDocumentFragment();
        node.textContent.split('\\\\').forEach((part, i) => {
          if (i > 0) frag.appendChild(document.createElement('br'));
          if (part)  frag.appendChild(document.createTextNode(part));
        });
        node.replaceWith(frag);
      } else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('katex')) {
        _applyTextBreaks(node);
      }
    }
  }

  function render(src, el, indent = false) {
    if (!src || !src.trim()) {
      el.innerHTML = '<span style="color:#94a3b8;font-style:italic">(empty)</span>';
      return;
    }
    // Split on blank lines; render each paragraph into its own <span>,
    // separated by <br>. This runs before KaTeX so the DOM structure is
    // stable and renderMathInElement cannot discard the break markers.
    const parts = src.split(/\n{2,}/).filter(p => p.trim());
    el.innerHTML = '';
    parts.forEach((part, i) => {
      if (i > 0) el.appendChild(document.createElement('br'));
      if (indent) {
        const indentSpan = document.createElement('span');
        indentSpan.style.cssText = 'display:inline-block;width:2em';
        el.appendChild(indentSpan);
      }
      const span = document.createElement('span');
      span.dataset.paraIdx = i;
      span.textContent = part;
      if (window.renderMathInElement) {
        window.renderMathInElement(span, _KATEX_OPTS);
      }
      _applyTextBreaks(span);
      el.appendChild(span);
    });
  }

  // ── Preview-safe truncation ──────────────────────────────
  // Cuts the source at ~maxChars without ever splitting a math
  // region (a half formula renders as an error). Oversized math
  // regions are either included whole (if reasonable) or dropped.
  function _truncate(src, maxChars) {
    src = src.trim();
    if (src.length <= maxChars) return src;
    let cut = maxChars;
    _MATH_RE.lastIndex = 0;
    let m;
    while ((m = _MATH_RE.exec(src)) !== null) {
      const start = m.index, end = m.index + m[0].length;
      if (start >= cut) break;
      if (end > cut) {            // budget lands inside this math region
        cut = (end <= maxChars * 2 || start < 40) ? end : start;
        break;
      }
    }
    const out = src.slice(0, cut).trimEnd();
    return out + (out.length < src.length ? ' …' : '');
  }

  /** Compact rendered preview (node cards): truncated, no indent. */
  function renderPreview(src, el, maxChars = 240) {
    if (!src || !src.trim()) { el.innerHTML = ''; return; }
    render(_truncate(src, maxChars), el, false);
  }

  return { render, renderPreview };
})();
