/**
 * StrategyEngine.js — PineScript
 */
window.StrategyEngine = (function () {
  'use strict';

  let _deps     = null;
  let _active   = false;
  let _fn       = null;
  let _ctx      = {};

  let _crossIdx      = 0;
  let _crossTick     = 0;
  const _crossState    = new Map();
  const _crossLastTick = new Map();

  function _buildEnv() {
    const d = _deps;

    return {
      get open()   { const o = d.getOhlc(); return o.length ? o[o.length-1].o : d.getPrice(); },
      get high()   { const o = d.getOhlc(); return o.length ? o[o.length-1].h : d.getPrice(); },
      get low()    { const o = d.getOhlc(); return o.length ? o[o.length-1].l : d.getPrice(); },
      get close()  { return d.getPrice(); },
      get volume() { const v = d.getVolumeHistory(); return v.length ? v[v.length-1] : 0; },

      sma(src, len) {
        const arr = d.getPriceHistory().slice(-len);
        return arr.length >= len ? arr.reduce((a, b) => a + b, 0) / len : d.getPrice();
      },
      ema(src, len) {
        const arr = d.getPriceHistory().slice(-Math.max(len * 3, len + 10));
        if (arr.length < len) return d.getPrice();
        const k = 2 / (len + 1);
        let e = arr[0];
        for (let i = 1; i < arr.length; i++) e = (arr[i] - e) * k + e;
        return e;
      },

      crossover(a, b) {
        const idx = _crossIdx++;
        const s = _crossState.get(idx);
        const result = s != null && _crossLastTick.get(idx) === _crossTick - 1 && s.a <= s.b && a > b;
        _crossState.set(idx, { a, b });
        _crossLastTick.set(idx, _crossTick);
        return result;
      },
      crossunder(a, b) {
        const idx = _crossIdx++;
        const s = _crossState.get(idx);
        const result = s != null && _crossLastTick.get(idx) === _crossTick - 1 && s.a >= s.b && a < b;
        _crossState.set(idx, { a, b });
        _crossLastTick.set(idx, _crossTick);
        return result;
      },

      rsi(len = 14) {
        const arr = d.getPriceHistory().slice(-Math.max(len * 3, len + 10));
        if (arr.length < 2) return 50;
        const k = 1 / len;
        const init = Math.min(len, arr.length - 1);
        let uA = 0, dA = 0;
        for (let i = 1; i <= init; i++) {
          const dv = arr[i] - arr[i - 1];
          uA += Math.max(dv, 0); dA += Math.max(-dv, 0);
        }
        uA /= init; dA /= init;
        for (let i = init + 1; i < arr.length; i++) {
          const dv = arr[i] - arr[i - 1];
          uA = uA * (1 - k) + Math.max(dv, 0) * k;
          dA = dA * (1 - k) + Math.max(-dv, 0) * k;
        }
        return dA === 0 ? (uA === 0 ? 50 : 100) : 100 - 100 / (1 + uA / dA);
      },

      atr(len = 14) {
        const ohlc = d.getOhlc();
        if (ohlc.length < 2) return 0;
        const sl = ohlc.slice(-Math.max(len * 3, len + 10));
        if (sl.length < 2) return sl[0] ? sl[0].h - sl[0].l : 0;
        const k = 1 / len;
        let v = sl[1].h - sl[1].l;
        for (let i = 1; i < sl.length; i++) {
          const tr = Math.max(
            sl[i].h - sl[i].l,
            Math.abs(sl[i].h - sl[i - 1].c),
            Math.abs(sl[i].l - sl[i - 1].c)
          );
          v = v * (1 - k) + tr * k;
        }
        return v;
      },

      highest(len = 20) {
        const ohlc = d.getOhlc();
        const end = ohlc.length - 1;
        const sl = ohlc.slice(Math.max(0, end - len), end);
        return sl.length ? Math.max(...sl.map(b => b.h)) : d.getPrice();
      },
      lowest(len = 20) {
        const ohlc = d.getOhlc();
        const end = ohlc.length - 1;
        const sl = ohlc.slice(Math.max(0, end - len), end);
        return sl.length ? Math.min(...sl.map(b => b.l)) : d.getPrice();
      },

      bb(len = 20, mult = 2.0) {
        const price = d.getPrice();
        const arr = d.getPriceHistory().slice(-len);
        if (arr.length < len) return { upper: price, mid: price, lower: price };
        const mid = arr.reduce((a, b) => a + b, 0) / len;
        const std = Math.sqrt(arr.reduce((s, v) => s + (v - mid) ** 2, 0) / len);
        return { upper: mid + mult * std, mid, lower: mid - mult * std };
      },

      stoch(kLen = 14, dLen = 3) {
        const ohlc = d.getOhlc();
        if (ohlc.length < kLen) return { k: 50, d: 50 };
        const calcK = bars => {
          const hh = Math.max(...bars.map(b => b.h));
          const ll = Math.min(...bars.map(b => b.l));
          return hh === ll ? 50 : (bars[bars.length - 1].c - ll) / (hh - ll) * 100;
        };
        const k = calcK(ohlc.slice(-kLen));
        let dSum = 0, dCnt = 0;
        for (let i = 0; i < dLen; i++) {
          const end2 = ohlc.length - i;
          if (end2 - kLen < 0) break;
          dSum += calcK(ohlc.slice(end2 - kLen, end2));
          dCnt++;
        }
        return { k, d: dCnt ? dSum / dCnt : k };
      },

      get bar_index() { return Math.max(0, d.getOhlc().length - 1); },

      strategy: {
        entry(direction, opts = {}) {
          if (!_active) return;
          const dir = direction.toLowerCase() === 'long' ? 1 : -1;
          let hasSame = false;
          const oppositeIds = [];
          for (const o of d.getOrders()) {
            if (o.dir === dir) hasSame = true;
            else oppositeIds.push(o.id);
          }
          oppositeIds.forEach(id => d.closeOrderById(id, false));
          if (!hasSame) {
            const lev  = d.getLeverage();
            const frac = d.fractional();
            let shares;
            if (opts.qty != null) {
              shares = frac ? opts.qty : Math.floor(opts.qty);
            } else {
              const ratio = opts.ratio != null ? Math.min(1, Math.max(0, opts.ratio)) : 1.0;
              const budget = ratio * d.getFreeCash() - d.FEE_FIXED;
              const raw    = budget / (d.getPrice() * (1 / lev + d.FEE_RATE));
              shares = frac ? raw : Math.floor(raw);
            }
            const sl = opts.sl != null ? opts.sl : null;
            const tp = opts.tp != null ? opts.tp : null;
            if (shares > 0) d.placeOrder(dir, shares, sl, tp);
          }
        },

        add(direction, opts = {}) {
          if (!_active) return;
          const dir  = direction.toLowerCase() === 'long' ? 1 : -1;
          const lev  = d.getLeverage();
          const frac = d.fractional();
          let shares;
          if (opts.qty != null) {
            shares = frac ? opts.qty : Math.floor(opts.qty);
          } else {
            const ratio = opts.ratio != null ? Math.min(1, Math.max(0, opts.ratio)) : 1.0;
            const budget = ratio * d.getFreeCash() - d.FEE_FIXED;
            const raw    = budget / (d.getPrice() * (1 / lev + d.FEE_RATE));
            shares = frac ? raw : Math.floor(raw);
          }
          const sl = opts.sl != null ? opts.sl : null;
          const tp = opts.tp != null ? opts.tp : null;
          if (shares > 0) d.placeOrder(dir, shares, sl, tp);
        },

        close(direction) {
          if (!_active) return;
          const dir = direction.toLowerCase() === 'long' ? 1 : -1;
          [...d.getOrders().filter(o => o.dir === dir).map(o => o.id)]
            .forEach(id => d.closeOrderById(id, false));
        },

        closeAll() {
          if (!_active) return;
          [...d.getOrders().map(o => o.id)].forEach(id => d.closeOrderById(id, false));
        },

        get position() {
          const price = d.getPrice();
          let lQty = 0, sQty = 0, lSum = 0, sSum = 0, lU = 0, sU = 0;
          for (const o of d.getOrders()) {
            const u = o.dir * o.shares * (price - o.openPrice);
            if (o.dir === 1) { lQty += o.shares; lSum += o.openPrice * o.shares; lU += u; }
            else             { sQty += o.shares; sSum += o.openPrice * o.shares; sU += u; }
          }
          if (lQty > 0 && sQty === 0)
            return { side: 'long',  qty: lQty, avgPrice: lSum / lQty, unrealized: lU };
          if (sQty > 0 && lQty === 0)
            return { side: 'short', qty: sQty, avgPrice: sSum / sQty, unrealized: sU };
          return { side: 'none', qty: 0, avgPrice: 0, unrealized: 0 };
        }
      }
    };
  }

  function init(deps) {
    _deps = deps;
  }

  function compile(code) {
    try {
      return new Function('pineEnv', `with(pineEnv){${code}}`);
    } catch (e) {
      _deps.showToast('策略编译错误: ' + e.message, 'error');
      return null;
    }
  }

  function start(code) {
    const fn = compile(code);
    if (!fn) return false;
    _ctx = {};
    _crossState.clear();
    _crossLastTick.clear();
    _crossTick = 0;
    _fn = fn;
    _active = true;
    return true;
  }

  function stop() {
    _active = false;
  }

  function reset() {
    _active = false;
    _fn     = null;
    _ctx    = {};
    _crossState.clear();
    _crossLastTick.clear();
    _crossTick = 0;
    _crossIdx = 0;
  }

  function tick() {
    if (!_active || !_fn) return;
    _crossTick++;
    _crossIdx = 0;
    try {
      _fn.call(_ctx, _buildEnv());
    } catch (e) {
      console.warn('策略执行异常', e);
      _deps.showToast('策略执行错误，已停止: ' + e.message, 'error');
      _active = false;
      if (_deps.onStop) _deps.onStop();
    }
    _deps.onAfterTick();
  }

  function isActive() {
    return _active;
  }

  return { init, compile, start, stop, reset, tick, isActive };
})();