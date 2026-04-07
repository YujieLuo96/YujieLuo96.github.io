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

export const LX = {
  /**
   * Render src into el using KaTeX auto-render.
   * Falls back to plain text display if auto-render is not yet loaded.
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
  }
};
