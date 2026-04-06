/**
 * LatexUtil — KaTeX rendering helper
 * Supports mixed content: plain text + inline $...$ + display $$...$$
 * KaTeX is loaded via CDN with `defer`; window.katex is available after DOMContentLoaded.
 */

export const LX = {
  /**
   * Render src string into el (auto-detects LaTeX syntax).
   * @param {string} src
   * @param {HTMLElement} el
   */
  render(src, el) {
    if (!src || !src.trim()) {
      el.innerHTML = '<span style="color:#94a3b8;font-style:italic">(empty)</span>';
      return;
    }
    el.innerHTML = window.katex ? this._mixed(src) : this._esc(src);
  },

  /**
   * Parse src into plain-text / LaTeX segments and render each.
   * @param {string} src
   * @returns {string} HTML string
   */
  _mixed(src) {
    const segments = [];
    const re = /(\$\$[\s\S]*?\$\$|\$(?:[^$\\]|\\[\s\S])*?\$)/g;
    let last = 0, m;

    while ((m = re.exec(src)) !== null) {
      if (m.index > last)
        segments.push({ type: 'text', value: src.slice(last, m.index) });

      const full = m[0];
      const displayMode = full.startsWith('$$');
      const math = displayMode ? full.slice(2, -2) : full.slice(1, -1);
      segments.push({ type: 'math', math, displayMode });
      last = m.index + full.length;
    }
    if (last < src.length)
      segments.push({ type: 'text', value: src.slice(last) });

    return segments.map(seg => {
      if (seg.type === 'text') return this._esc(seg.value).replace(/\\\\/g, '<br>');
      try {
        const html = window.katex.renderToString(seg.math, {
          displayMode: seg.displayMode,
          throwOnError: false
        });
        return seg.displayMode
          ? `<div style="text-align:center;margin:4px 0">${html}</div>`
          : html;
      } catch {
        return this._esc(seg.displayMode ? `$$${seg.math}$$` : `$${seg.math}$`);
      }
    }).join('');
  },

  _esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};
