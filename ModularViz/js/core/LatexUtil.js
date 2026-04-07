/**
 * LatexUtil — KaTeX rendering via official auto-render extension
 *
 * Delegates entirely to window.renderMathInElement (KaTeX contrib/auto-render).
 * Supports all KaTeX-recognised delimiters and environments; no custom parsing.
 *
 * Requires (both loaded with defer, in order):
 *   katex@0.16.9/dist/katex.min.js
 *   katex@0.16.9/dist/contrib/auto-render.min.js
 */

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

export const LX = {
  /**
   * Render src into el using KaTeX auto-render.
   * \\ in plain-text regions is converted to <br>.
   * Falls back to plain text if auto-render is not yet loaded.
   * @param {string} src
   * @param {HTMLElement} el
   */
  render(src, el) {
    if (!src || !src.trim()) {
      el.innerHTML = '<span style="color:#94a3b8;font-style:italic">(empty)</span>';
      return;
    }
    el.textContent = src;
    if (window.renderMathInElement) {
      window.renderMathInElement(el, { delimiters: _DELIMITERS, throwOnError: false });
    }
    _applyTextBreaks(el);
  }
};
