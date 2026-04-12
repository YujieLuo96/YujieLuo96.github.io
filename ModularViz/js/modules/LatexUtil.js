'use strict';

/* ═══════════════════════════════════════════════════════════
   LatexUtil
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
        window.renderMathInElement(span, { delimiters: _DELIMITERS, throwOnError: false });
      }
      _applyTextBreaks(span);
      el.appendChild(span);
    });
  }

  return { render };
})();
