/**
 * PineIndicators.js — 共享 Pine 指标实现库
 *
 * 所有指标通过 end/ohlcEnd 参数统一支持实时模式（默认 arr.length / ohlc.length）
 * 和历史回测模式（BackTest 传 barIdx+1 访问任意历史截面，无需 O(N) 切片）。
 *
 * 公开 API (window.PineIndicators):
 *   sma(arr, len, fallback, end?)
 *   ema(arr, len, fallback, end?)
 *   rsi(arr, len, end?)
 *   atr(ohlc, len, ohlcEnd?)
 *   highest(ohlc, len, fallback, ohlcEnd?)   — 不含 ohlcEnd-1 处的当前 bar
 *   lowest(ohlc, len, fallback, ohlcEnd?)    — 同上
 *   bb(arr, len, mult, fallback, end?)
 *   stoch(ohlc, kLen, dLen, ohlcEnd?)
 *   makeCrossState() → cs
 *   crossover(a, b, cs)
 *   crossunder(a, b, cs)
 */
window.PineIndicators = (function () {
  'use strict';

  function sma(arr, len, fallback, end) {
    end = end !== undefined ? end : arr.length;
    if (end < len) return fallback;
    let sum = 0;
    for (let i = end - len; i < end; i++) sum += arr[i];
    return sum / len;
  }

  function ema(arr, len, fallback, end) {
    end = end !== undefined ? end : arr.length;
    const start = Math.max(0, end - Math.max(len * 3, len + 10));
    if (end - start < len) return fallback;
    const k = 2 / (len + 1);
    let e = arr[start];
    for (let i = start + 1; i < end; i++) e = (arr[i] - e) * k + e;
    return e;
  }

  function rsi(arr, len, end) {
    len = len || 14;
    end = end !== undefined ? end : arr.length;
    const start = Math.max(0, end - Math.max(len * 3, len + 10));
    const n = end - start;
    if (n < 2) return 50;
    const k    = 1 / len;
    const init = Math.min(len, n - 1);
    let uA = 0, dA = 0;
    for (let i = 1; i <= init; i++) {
      const d = arr[start + i] - arr[start + i - 1];
      uA += Math.max(d, 0); dA += Math.max(-d, 0);
    }
    uA /= init; dA /= init;
    for (let i = init + 1; i < n; i++) {
      const d = arr[start + i] - arr[start + i - 1];
      uA = uA * (1 - k) + Math.max(d, 0) * k;
      dA = dA * (1 - k) + Math.max(-d, 0) * k;
    }
    return dA === 0 ? (uA === 0 ? 50 : 100) : 100 - 100 / (1 + uA / dA);
  }

  function atr(ohlc, len, ohlcEnd) {
    len = len || 14;
    ohlcEnd = ohlcEnd !== undefined ? ohlcEnd : ohlc.length;
    const start = Math.max(0, ohlcEnd - Math.max(len * 3, len + 10));
    const n = ohlcEnd - start;
    if (n < 1) return 0;
    if (n < 2) return ohlc[start].h - ohlc[start].l;
    const k = 1 / len;
    let v = Math.max(
      ohlc[start + 1].h - ohlc[start + 1].l,
      Math.abs(ohlc[start + 1].h - ohlc[start].c),
      Math.abs(ohlc[start + 1].l - ohlc[start].c)
    );
    for (let i = start + 2; i < ohlcEnd; i++) {
      const tr = Math.max(
        ohlc[i].h - ohlc[i].l,
        Math.abs(ohlc[i].h - ohlc[i - 1].c),
        Math.abs(ohlc[i].l - ohlc[i - 1].c)
      );
      v = v * (1 - k) + tr * k;
    }
    return v;
  }

  // 不含 ohlcEnd-1 处的当前 bar（Pine highest 语义：只看已完结的前 len 根 K 线）
  function highest(ohlc, len, fallback, ohlcEnd) {
    len = len || 20;
    ohlcEnd = ohlcEnd !== undefined ? ohlcEnd : ohlc.length;
    const end   = ohlcEnd - 1;
    const start = Math.max(0, end - len);
    if (start >= end) return fallback;
    let v = ohlc[start].h;
    for (let i = start + 1; i < end; i++) if (ohlc[i].h > v) v = ohlc[i].h;
    return v;
  }

  function lowest(ohlc, len, fallback, ohlcEnd) {
    len = len || 20;
    ohlcEnd = ohlcEnd !== undefined ? ohlcEnd : ohlc.length;
    const end   = ohlcEnd - 1;
    const start = Math.max(0, end - len);
    if (start >= end) return fallback;
    let v = ohlc[start].l;
    for (let i = start + 1; i < end; i++) if (ohlc[i].l < v) v = ohlc[i].l;
    return v;
  }

  function bb(arr, len, mult, fallback, end) {
    len = len || 20; mult = mult || 2.0;
    end = end !== undefined ? end : arr.length;
    if (end < len) return { upper: fallback, mid: fallback, lower: fallback };
    let sum = 0;
    for (let i = end - len; i < end; i++) sum += arr[i];
    const mid = sum / len;
    let v = 0;
    for (let i = end - len; i < end; i++) v += (arr[i] - mid) ** 2;
    const std = Math.sqrt(v / len);
    return { upper: mid + mult * std, mid, lower: mid - mult * std };
  }

  function stoch(ohlc, kLen, dLen, ohlcEnd) {
    kLen = kLen || 14; dLen = dLen || 3;
    ohlcEnd = ohlcEnd !== undefined ? ohlcEnd : ohlc.length;
    if (ohlcEnd < kLen) return { k: 50, d: 50 };
    function calcK(s, e) {
      let hh = ohlc[s].h, ll = ohlc[s].l;
      for (let i = s + 1; i < e; i++) {
        if (ohlc[i].h > hh) hh = ohlc[i].h;
        if (ohlc[i].l < ll) ll = ohlc[i].l;
      }
      return hh === ll ? 50 : (ohlc[e - 1].c - ll) / (hh - ll) * 100;
    }
    const k = calcK(ohlcEnd - kLen, ohlcEnd);
    let dSum = 0, dCnt = 0;
    for (let i = 0; i < dLen; i++) {
      const e2 = ohlcEnd - i;
      if (e2 - kLen < 0) break;
      dSum += calcK(e2 - kLen, e2);
      dCnt++;
    }
    return { k, d: dCnt ? dSum / dCnt : k };
  }

  /** 创建 crossover/crossunder 共享状态对象（每个策略实例独立一份） */
  function makeCrossState() {
    return { state: new Map(), lastTick: new Map(), tick: 0, idx: 0 };
  }

  function crossover(a, b, cs) {
    const idx = cs.idx++;
    const s   = cs.state.get(idx);
    const res = s != null && cs.lastTick.get(idx) === cs.tick - 1 && s.a <= s.b && a > b;
    cs.state.set(idx, { a, b });
    cs.lastTick.set(idx, cs.tick);
    return res;
  }

  function crossunder(a, b, cs) {
    const idx = cs.idx++;
    const s   = cs.state.get(idx);
    const res = s != null && cs.lastTick.get(idx) === cs.tick - 1 && s.a >= s.b && a < b;
    cs.state.set(idx, { a, b });
    cs.lastTick.set(idx, cs.tick);
    return res;
  }

  return { sma, ema, rsi, atr, highest, lowest, bb, stoch, makeCrossState, crossover, crossunder };
})();
