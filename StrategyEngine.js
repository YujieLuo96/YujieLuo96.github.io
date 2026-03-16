/**
 * StrategyEngine.js — PineScript 策略执行引擎（独立模块）
 *
 * 依赖注入方式（init 一次，之后调用即可）：
 *
 *   StrategyEngine.init(deps)   — 注入所有依赖
 *   StrategyEngine.start(code)  — 编译并激活策略，返回 bool
 *   StrategyEngine.stop()       — 停用策略（不平仓，平仓由主文件负责）
 *   StrategyEngine.reset()      — 完全重置内部状态（用于 resetGame）
 *   StrategyEngine.tick()       — 每 tick 执行一次（替代 evaluateStrategy）
 *   StrategyEngine.isActive()   — 返回当前激活状态
 *
 * deps 对象字段：
 *   getPrice()          → number          当前价格
 *   getOhlc()           → Array<{o,h,l,c}>
 *   getPriceHistory()   → number[]
 *   getVolumeHistory()  → number[]
 *   getOrders()         → Array<order>
 *   getFreeCash()       → number
 *   getLeverage()       → number
 *   placeOrder(dir, shares, sl, tp)
 *   closeOrderById(id, doRefresh)
 *   showToast(msg, type, dur?)
 *   onAfterTick()       — 每次 tick 结束后调用（通常是 refreshUI）
 *   onStop()            — 策略因错误自动停止时调用（更新状态 DOM）
 *   FEE_RATE            — number
 *   FEE_FIXED           — number
 *   fractional()        → bool   true = crypto 模式（允许小数份额），false = 股票模式（整数份额）
 */
window.StrategyEngine = (function () {
  'use strict';

  /* ── 私有状态 ──────────────────────────────────────────── */
  let _deps     = null;
  let _active   = false;
  let _fn       = null;
  let _ctx      = {};     // 策略持久状态（策略代码中 this.xxx）

  // crossover/crossunder 每 tick 重置调用序号，跨 tick 保存前值
  let _crossIdx      = 0;
  let _crossTick     = 0;          // 每 tick 递增，用于检测上一 tick 是否有调用
  const _crossState    = new Map(); // callIdx → { a, b }
  const _crossLastTick = new Map(); // callIdx → 写入时的 _crossTick

  /* ── 构建 pineEnv ──────────────────────────────────────── */
  // 每次 tick 调用时构建，所有数据通过 _deps getter 实时读取
  function _buildEnv() {
    const d = _deps;

    return {
      // ── OHLC / Volume（以数字属性暴露，策略可直接写 close > 100）──
      get open()   { const o = d.getOhlc(); return o.length ? o[o.length-1].o : d.getPrice(); },
      get high()   { const o = d.getOhlc(); return o.length ? o[o.length-1].h : d.getPrice(); },
      get low()    { const o = d.getOhlc(); return o.length ? o[o.length-1].l : d.getPrice(); },
      get close()  { return d.getPrice(); },
      get volume() { const v = d.getVolumeHistory(); return v.length ? v[v.length-1] : 0; },

      // ── 移动均线 ──────────────────────────────────────────
      // src 参数保留兼容性（策略可写 sma(close, 20)），但数据源始终为收盘价序列
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

      // ── 交叉信号（通过调用序号记忆前值，第一次调用返回 false）──
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

      // ── RSI（Wilder，无状态从价格历史计算）──
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

      // ── ATR（Wilder 平均真实波幅）──
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

      // ── Highest / Lowest（最近 len 根已完结 K 线，不含当前开放K线）──
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

      // ── 布林带，返回 { upper, mid, lower }──
      bb(len = 20, mult = 2.0) {
        const price = d.getPrice();
        const arr = d.getPriceHistory().slice(-len);
        if (arr.length < len) return { upper: price, mid: price, lower: price };
        const mid = arr.reduce((a, b) => a + b, 0) / len;
        const std = Math.sqrt(arr.reduce((s, v) => s + (v - mid) ** 2, 0) / len);
        return { upper: mid + mult * std, mid, lower: mid - mult * std };
      },

      // ── 随机指标，返回 { k, d }（均为 0-100）──
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

      // ── bar_index：已完结 K 线根数（0 起始）──
      get bar_index() { return Math.max(0, d.getOhlc().length - 1); },

      // ── strategy 对象：开平仓 API ──────────────────────────
      strategy: {
        // entry：平掉反向仓位，若该方向已有仓位则不重复开仓（幂等）
        // opts: { qty?, ratio?, sl?, tp? }
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

        // add：允许叠仓/加仓（不平反向，直接开新仓）
        // opts 与 entry 完全相同：{ qty?, ratio?, sl?, tp? }
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

        // close：平掉指定方向的所有仓位
        close(direction) {
          if (!_active) return;
          const dir = direction.toLowerCase() === 'long' ? 1 : -1;
          [...d.getOrders().filter(o => o.dir === dir).map(o => o.id)]
            .forEach(id => d.closeOrderById(id, false));
        },

        // closeAll：平掉所有仓位（多空均平）
        closeAll() {
          if (!_active) return;
          [...d.getOrders().map(o => o.id)].forEach(id => d.closeOrderById(id, false));
        },

        // position：只读快照，返回 { side, qty, avgPrice, unrealized }
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

  /* ── 公开 API ──────────────────────────────────────────── */

  /** 注入依赖（页面初始化时调用一次） */
  function init(deps) {
    _deps = deps;
  }

  /** 编译 Pine 代码，返回 Function 或 null（失败时显示 toast） */
  function compile(code) {
    try {
      return new Function('pineEnv', `with(pineEnv){${code}}`);
    } catch (e) {
      _deps.showToast('Strategy compile error: ' + e.message, 'error');
      return null;
    }
  }

  /** 编译并激活策略，返回 true 表示成功 */
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

  /** 停用策略（不平仓，平仓由主文件在调用 stop 后自行处理） */
  function stop() {
    _active = false;
  }

  /** 完全重置内部状态（用于 resetGame，清除策略函数和跨 tick 状态） */
  function reset() {
    _active = false;
    _fn     = null;
    _ctx    = {};
    _crossState.clear();
    _crossLastTick.clear();
    _crossTick = 0;
    _crossIdx = 0;
  }

  /** 每 tick 执行一次（替代 evaluateStrategy）*/
  function tick() {
    if (!_active || !_fn) return;
    _crossTick++;  // 递增 tick 计数，用于 crossover/crossunder 陈旧值检测
    _crossIdx = 0; // 重置 crossover/crossunder 调用计数
    try {
      _fn.call(_ctx, _buildEnv());
    } catch (e) {
      console.warn('Strategy execution error', e);
      _deps.showToast('Strategy execution error, stopped: ' + e.message, 'error');
      _active = false;
      if (_deps.onStop) _deps.onStop();
    }
    // 保证 strategy.close/closeAll 的结果在本 tick 立即反映到 UI
    _deps.onAfterTick();
  }

  /** 返回策略当前激活状态 */
  function isActive() {
    return _active;
  }

  return { init, compile, start, stop, reset, tick, isActive };
})();
