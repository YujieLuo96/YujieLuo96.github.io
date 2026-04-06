/**
 * StatusBar — floating hint bar at the bottom of the canvas.
 * Supports persistent or auto-dismissing messages.
 */

let _timer = null;

function el() { return document.getElementById('status'); }

export const Status = {
  /**
   * @param {string} msg
   * @param {number} [ms=0]  auto-hide delay in ms; 0 = persistent
   */
  show(msg, ms = 0) {
    clearTimeout(_timer);
    const bar = el(); if (!bar) return;
    bar.textContent = msg;
    bar.classList.add('on');
    if (ms > 0) _timer = setTimeout(() => bar.classList.remove('on'), ms);
  },

  hide() {
    clearTimeout(_timer);
    el()?.classList.remove('on');
  }
};
