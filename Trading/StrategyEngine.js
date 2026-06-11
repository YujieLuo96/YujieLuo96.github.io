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

  const PI = window.PineIndicators;

  /* ── 私有状态 ──────────────────────────────────────────── */
  let _deps     = null;
  let _active   = false;
  let _fn       = null;
  let _ctx      = {};     // 策略持久状态（策略代码中 this.xxx）
  let _lastBarLen  = -1;  // 上一 tick 时的 ohlc 长度（bar_changed 检测）
  let _barChanged  = true;

  // crossover/crossunder 跨 tick 保存前值（调用序号每 tick 重置）
  const _cs = PI.makeCrossState();

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

      // src 参数保留兼容性（策略可写 sma(close, 20)），数据源始终为收盘价序列
      sma(_s, len)    { return PI.sma(d.getPriceHistory(), len, d.getPrice()); },
      ema(_s, len)    { return PI.ema(d.getPriceHistory(), len, d.getPrice()); },
      rsi(len)        { return PI.rsi(d.getPriceHistory(), len); },
      atr(len)        { return PI.atr(d.getOhlc(), len); },
      highest(len)    { return PI.highest(d.getOhlc(), len, d.getPrice()); },
      lowest(len)     { return PI.lowest(d.getOhlc(), len, d.getPrice()); },
      bb(len, mult)   { return PI.bb(d.getPriceHistory(), len, mult, d.getPrice()); },
      stoch(kL, dL)   { return PI.stoch(d.getOhlc(), kL, dL); },
      crossover(a, b) { return PI.crossover(a, b, _cs); },
      crossunder(a, b){ return PI.crossunder(a, b, _cs); },

      // ── bar_index：已完结 K 线根数（0 起始）──
      get bar_index() { return Math.max(0, d.getOhlc().length - 1); },

      // ── bar_changed：本 tick 是否进入了新 bar ──
      // SIM 模式每 tick 推一根新 bar → 恒为 true；CRYPTO 模式 tick() 仅在
      // K 线收盘时被调用 → 同样每次为 true。按 ohlc 长度检测以保证语义稳健。
      get bar_changed() { return _barChanged; },

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

  /** 编译 Pine 代码，返回 Function 或 null（失败时显示 toast）
      包装必须带换行：否则策略末行以 // 注释结尾时，收尾 } 会被注释吞掉 */
  function compile(code) {
    try {
      return new Function('pineEnv', `with(pineEnv){\n${code}\n}`);
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
    _cs.state.clear();
    _cs.lastTick.clear();
    _cs.tick = 0;
    _lastBarLen = -1;
    _barChanged = true;
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
    _cs.state.clear();
    _cs.lastTick.clear();
    _cs.tick = 0;
    _cs.idx  = 0;
    _lastBarLen = -1;
    _barChanged = true;
  }

  /** 每 tick 执行一次（替代 evaluateStrategy）*/
  function tick() {
    if (!_active || !_fn) return;
    _cs.tick++;
    _cs.idx = 0;
    const _len  = _deps.getOhlc().length;
    _barChanged = (_len !== _lastBarLen);
    _lastBarLen = _len;
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
