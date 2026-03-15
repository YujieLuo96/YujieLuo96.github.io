/**
 * BackTest.js — 策略回测模块
 *
 * 封装为 window.BackTest，在 StrategyEditor.html 中加载并调用。
 * 两种模式：
 *   SIM    — 自包含 GBM 市场模拟器，支持 Monte Carlo 多次运行
 *   CRYPTO — 拉取 Binance 历史 K线，支持 Walk-Forward 分段测试
 *
 * Public API:
 *   BackTest.open({ stratCode, mode, mu, sigma, leverage, cash, symbol })
 *   BackTest.close()
 */
window.BackTest = (function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     常量
  ═══════════════════════════════════════════════════════════════ */
  const FEE_RATE        = 0.0008;
  const FEE_FIXED       = 1;
  const MAINT           = 0.05;    // 维持保证金比率
  const MAX_CHART_PTS   = 350;     // 权益曲线最大采样点（性能限制）
  const MAX_TRADES_SHOW = 60;      // 交易记录最大显示条数

  /* ═══════════════════════════════════════════════════════════════
     1. 工具：Seeded PRNG + Box-Muller
  ═══════════════════════════════════════════════════════════════ */
  function _mulberry32(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function _normalRandom(rng) {
    let u, v;
    do { u = rng(); v = rng(); } while (u === 0);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ═══════════════════════════════════════════════════════════════
     2. Mini Market Simulator（独立 GBM，不碰主 MarketEngine）
  ═══════════════════════════════════════════════════════════════ */
  function _simMarket({ mu, sigma, ticks, seed, includeRegimes }) {
    const rng      = _mulberry32(seed || 42);
    const nr       = () => _normalRandom(rng);
    const dt       = 1 / 252;
    const sqDt     = Math.sqrt(dt);
    const prices   = [];
    const ohlc     = [];
    const volumes  = [];

    // Simplified regimes: BEAR / CHOP / BULL
    const REGIMES = [
      { muAdd: -0.08, sigMult: 1.70 },
      { muAdd:  0.00, sigMult: 0.45 },
      { muAdd: +0.07, sigMult: 1.25 },
    ];
    let regimeIdx  = 1;  // start CHOP
    let regimeTick = 0;
    let regimeDur  = 80 + Math.floor(rng() * 120);

    let price    = 100;
    let sigma_t  = Math.max(0.01, sigma);
    let mu_t     = mu;

    for (let i = 0; i < ticks; i++) {
      // Regime transition
      if (includeRegimes && ++regimeTick >= regimeDur) {
        let next = regimeIdx;
        let tries = 0;
        while (next === regimeIdx && tries++ < 10) next = Math.floor(rng() * 3);
        regimeIdx  = next;
        regimeTick = 0;
        regimeDur  = 80 + Math.floor(rng() * 150);
      }

      const r        = REGIMES[regimeIdx];
      const muBase   = mu + r.muAdd;
      const sigBase  = Math.max(0.01, sigma * r.sigMult);

      // Heston-style vol / drift mean-reversion
      sigma_t = Math.max(sigma * 0.4, Math.min(sigma * 2.2,
        sigma_t + 2.5 * (sigBase - sigma_t) * dt + 0.65 * sigma_t * nr() * sqDt
      ));
      mu_t = Math.max(-0.8, Math.min(0.8,
        mu_t + 0.8 * (muBase - mu_t) * dt + 0.15 * nr() * sqDt
      ));

      const drift = mu_t - 0.5 * sigma_t * sigma_t;
      const diff  = sigma_t * sqDt * nr();
      const jump  = rng() < 0.025 ? -0.005 + 0.04 * nr() : 0;
      price = Math.max(0.01, price * Math.exp(drift * dt + diff + jump));

      const open  = i === 0 ? price : ohlc[i - 1].c;
      const micro = sigma_t * 0.25 * rng();
      ohlc.push({
        o: open,
        h: Math.max(open, price) * (1 + micro),
        l: Math.max(0.01, Math.min(open, price) * (1 - micro)),
        c: price,
      });
      prices.push(price);
      volumes.push((sigma_t / Math.max(sigma, 0.001)) * (0.7 + 0.6 * rng()));
    }

    return { prices, ohlc, volumes };
  }

  /* ═══════════════════════════════════════════════════════════════
     3. Pine 指标环境构建（与 StrategyEngine 对称实现）
        接收全数组 + barIdx，避免 O(N²) 切片分配
  ═══════════════════════════════════════════════════════════════ */
  function _buildPineEnv({
    prices, ohlc, volumes, barIdx,
    crossState, getCrossIdx,
    orders, getFreeCash, leverage, fractional,
    placeOrder, closeOrderById,
  }) {
    const price = prices[barIdx];
    const bar   = ohlc[barIdx] || { o: price, h: price, l: price, c: price };

    // 有界切片工具（避免大分配）
    function _ps(len) {
      return prices.slice(Math.max(0, barIdx + 1 - len), barIdx + 1);
    }
    function _os(len, excludeLast) {
      const end = barIdx + (excludeLast ? 0 : 1);
      return ohlc.slice(Math.max(0, end - len), end);
    }

    function sma(_, len) {
      const a = _ps(len);
      return a.length >= len ? a.reduce((s, v) => s + v, 0) / len : price;
    }

    function ema(_, len) {
      const a = _ps(Math.max(len * 3, len + 10));
      if (a.length < len) return price;
      const k = 2 / (len + 1);
      let e = a[0];
      for (let i = 1; i < a.length; i++) e = (a[i] - e) * k + e;
      return e;
    }

    function rsi(len = 14) {
      const a = _ps(Math.max(len * 3, len + 10));
      if (a.length < 2) return 50;
      const k    = 1 / len;
      const init = Math.min(len, a.length - 1);
      let uA = 0, dA = 0;
      for (let i = 1; i <= init; i++) {
        const d = a[i] - a[i - 1];
        uA += Math.max(d, 0); dA += Math.max(-d, 0);
      }
      uA /= init; dA /= init;
      for (let i = init + 1; i < a.length; i++) {
        const d = a[i] - a[i - 1];
        uA = uA * (1 - k) + Math.max(d, 0) * k;
        dA = dA * (1 - k) + Math.max(-d, 0) * k;
      }
      return dA === 0 ? (uA === 0 ? 50 : 100) : 100 - 100 / (1 + uA / dA);
    }

    function atr(len = 14) {
      const sl = _os(Math.max(len * 3, len + 10));
      if (sl.length < 2) return sl[0] ? sl[0].h - sl[0].l : 0;
      const k = 1 / len;
      // 初始 TR 包含前一根 close，避免仅用 HL range 低估波动
      let v = Math.max(sl[1].h - sl[1].l,
                       Math.abs(sl[1].h - sl[0].c),
                       Math.abs(sl[1].l - sl[0].c));
      for (let i = 1; i < sl.length; i++) {
        const tr = Math.max(
          sl[i].h - sl[i].l,
          Math.abs(sl[i].h - sl[i - 1].c),
          Math.abs(sl[i].l - sl[i - 1].c)
        );
        v = v * (1 - k) + tr * k;
      }
      return v;
    }

    function highest(len = 20) {
      const sl = _os(len, true);
      return sl.length ? Math.max(...sl.map(b => b.h)) : price;
    }

    function lowest(len = 20) {
      const sl = _os(len, true);
      return sl.length ? Math.min(...sl.map(b => b.l)) : price;
    }

    function bb(len = 20, mult = 2.0) {
      const a = _ps(len);
      if (a.length < len) return { upper: price, mid: price, lower: price };
      const mid = a.reduce((s, v) => s + v, 0) / len;
      const std = Math.sqrt(a.reduce((s, v) => s + (v - mid) ** 2, 0) / len);
      return { upper: mid + mult * std, mid, lower: mid - mult * std };
    }

    function stoch(kLen = 14, dLen = 3) {
      if (barIdx + 1 < kLen) return { k: 50, d: 50 };
      const calcK = bars => {
        const hh = Math.max(...bars.map(b => b.h));
        const ll = Math.min(...bars.map(b => b.l));
        return hh === ll ? 50 : (bars[bars.length - 1].c - ll) / (hh - ll) * 100;
      };
      const k = calcK(_os(kLen));
      let dSum = 0, dCnt = 0;
      for (let i = 0; i < dLen; i++) {
        const end2 = barIdx + 1 - i;
        if (end2 - kLen < 0) break;
        dSum += calcK(ohlc.slice(end2 - kLen, end2));
        dCnt++;
      }
      return { k, d: dCnt ? dSum / dCnt : k };
    }

    function crossover(a, b) {
      const idx = getCrossIdx();
      const s   = crossState.get(idx);
      const res = s != null && s.a <= s.b && a > b;
      crossState.set(idx, { a, b });
      return res;
    }

    function crossunder(a, b) {
      const idx = getCrossIdx();
      const s   = crossState.get(idx);
      const res = s != null && s.a >= s.b && a < b;
      crossState.set(idx, { a, b });
      return res;
    }

    // ── Strategy API（镜像 StrategyEngine）──────────────────────
    const strategy = {
      entry(direction, opts = {}) {
        const dir   = direction.toLowerCase() === 'long' ? 1 : -1;
        let hasSame = false;
        const oppIds = [];
        for (const o of orders) {
          if (o.dir === dir) hasSame = true;
          else oppIds.push(o.id);
        }
        oppIds.forEach(id => closeOrderById(id));
        if (!hasSame) {
          const shares = _calcShares(opts);
          if (shares > 0) placeOrder(dir, shares, opts.sl ?? null, opts.tp ?? null);
        }
      },
      add(direction, opts = {}) {
        const dir    = direction.toLowerCase() === 'long' ? 1 : -1;
        const shares = _calcShares(opts);
        if (shares > 0) placeOrder(dir, shares, opts.sl ?? null, opts.tp ?? null);
      },
      close(direction) {
        const dir = direction.toLowerCase() === 'long' ? 1 : -1;
        [...orders].filter(o => o.dir === dir).forEach(o => closeOrderById(o.id));
      },
      closeAll() {
        [...orders].forEach(o => closeOrderById(o.id));
      },
      get position() {
        let lQ = 0, sQ = 0, lS = 0, sS = 0, lU = 0, sU = 0;
        for (const o of orders) {
          const u = o.dir * o.shares * (price - o.openPrice);
          if (o.dir === 1) { lQ += o.shares; lS += o.openPrice * o.shares; lU += u; }
          else              { sQ += o.shares; sS += o.openPrice * o.shares; sU += u; }
        }
        if (lQ > 0 && sQ === 0) return { side: 'long',  qty: lQ, avgPrice: lS / lQ, unrealized: lU };
        if (sQ > 0 && lQ === 0) return { side: 'short', qty: sQ, avgPrice: sS / sQ, unrealized: sU };
        return { side: 'none', qty: 0, avgPrice: 0, unrealized: 0 };
      },
    };

    function _calcShares(opts) {
      if (opts.qty != null) return Math.max(0, fractional ? opts.qty : Math.floor(opts.qty));
      const ratio  = opts.ratio != null ? Math.min(1, Math.max(0, opts.ratio)) : 1.0;
      const budget = ratio * getFreeCash() - FEE_FIXED;
      const raw    = budget / (price * (1 / leverage + FEE_RATE));
      // crypto 模式：保留 4 位小数（0.2497 BTC）；sim 模式：整数份额
      return Math.max(0, fractional ? Math.floor(raw * 1e4) / 1e4 : Math.floor(raw));
    }

    return {
      get open()        { return bar.o; },
      get high()        { return bar.h; },
      get low()         { return bar.l; },
      get close()       { return price; },
      get volume()      { return volumes[barIdx] || 0; },
      get bar_index()   { return barIdx; },
      get bar_changed() { return true; },  // 回测中每 bar 均为新 bar
      sma, ema, rsi, atr, highest, lowest, bb, stoch,
      crossover, crossunder, strategy, Math,
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     4. Strategy Runner（单次回测循环）
  ═══════════════════════════════════════════════════════════════ */
  function _runStrategy(stratCode, market, { initialCash, leverage, fractional = false }) {
    // 编译
    let fn;
    try { fn = new Function('pineEnv', `with(pineEnv){${stratCode}}`); }
    catch (e) { return { error: 'Compile error: ' + e.message }; }

    const { prices, ohlc, volumes } = market;
    const N = prices.length;

    let cash    = initialCash;
    let nextId  = 1;
    const orders  = [];   // { id, dir, shares, openPrice, sl, tp, margin }
    const trades  = [];   // { dir, open, close, net, reason }
    const equity  = [initialCash];

    const stratCtx  = {};
    const crossState = new Map();
    let   _crossIdx  = 0;

    // ── 当前价格（闭包共享，每 bar 更新）
    let _cp = prices[0];

    function _unrealized() {
      let u = 0;
      for (const o of orders) u += o.dir * o.shares * (_cp - o.openPrice);
      return u;
    }

    function getFreeCash() {
      return cash + _unrealized();
    }

    function _equity() {
      return cash + orders.reduce((s, o) => s + o.margin, 0) + _unrealized();
    }

    function closeOrderAt(id, closePrice, reason) {
      const idx = orders.findIndex(o => o.id === id);
      if (idx < 0) return;
      const o        = orders.splice(idx, 1)[0];
      const gross    = o.dir * o.shares * (closePrice - o.openPrice);
      const closeFee = closePrice * o.shares * FEE_RATE + FEE_FIXED;
      const net      = gross - closeFee;
      cash += o.margin + net;
      trades.push({
        dir: o.dir, open: o.openPrice, close: closePrice, net, reason,
        shares: o.shares, openFee: o.openFee || 0, closeFee,
      });
    }

    function closeOrderById(id) {
      closeOrderAt(id, _cp, 'STRAT');
    }

    function placeOrder(dir, shares, sl, tp) {
      if (shares < 1e-8) return; // 支持分数股，但过滤浮点噪声
      const margin = _cp * shares / leverage;
      const fee    = _cp * shares * FEE_RATE + FEE_FIXED;
      if (margin + fee > getFreeCash() + 0.01) return; // 资金不足
      cash -= (margin + fee);
      orders.push({ id: nextId++, dir, shares, openPrice: _cp, sl, tp, margin, openFee: fee });
    }

    // ── 主 tick 循环
    for (let i = 0; i < N; i++) {
      _cp = prices[i];

      // SL / TP 检查
      for (const o of [...orders]) {
        if (o.dir === 1) {
          if (o.sl != null && _cp <= o.sl) closeOrderAt(o.id, Math.min(_cp, o.sl), 'SL');
          else if (o.tp != null && _cp >= o.tp) closeOrderAt(o.id, Math.max(_cp, o.tp), 'TP');
        } else {
          if (o.sl != null && _cp >= o.sl) closeOrderAt(o.id, Math.max(_cp, o.sl), 'SL');
          else if (o.tp != null && _cp <= o.tp) closeOrderAt(o.id, Math.min(_cp, o.tp), 'TP');
        }
      }

      // 爆仓检查
      if (orders.length > 0 && _equity() < initialCash * MAINT) {
        for (const o of [...orders]) closeOrderAt(o.id, _cp, 'LIQ');
      }

      // 运行策略
      _crossIdx = 0;
      const env = _buildPineEnv({
        prices, ohlc, volumes, barIdx: i,
        crossState,
        getCrossIdx: () => _crossIdx++,
        orders, getFreeCash, leverage, fractional,
        placeOrder, closeOrderById,
      });

      try { fn.call(stratCtx, env); }
      catch (e) { break; }

      // 记录权益
      equity.push(_equity());
    }

    // 回测结束，强制平仓
    _cp = prices[N - 1];
    for (const o of [...orders]) closeOrderAt(o.id, _cp, 'EOT');
    equity.push(cash);

    return { trades, equity, finalEquity: cash, initialCash };
  }

  /* ═══════════════════════════════════════════════════════════════
     5. 统计计算
  ═══════════════════════════════════════════════════════════════ */
  function _computeRunStats({ trades, equity, initialCash }) {
    const finalEq     = equity[equity.length - 1];
    const totalReturn = (finalEq - initialCash) / initialCash * 100;

    const wins   = trades.filter(t => t.net > 0);
    const losses = trades.filter(t => t.net <= 0);
    const winRate      = trades.length ? wins.length / trades.length * 100 : 0;
    const grossProfit  = wins.reduce((s, t) => s + t.net, 0);
    const grossLoss    = Math.abs(losses.reduce((s, t) => s + t.net, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss
                        : grossProfit > 0 ? 9999 : 0;

    // 最大回撤
    let peak = -Infinity, maxDD = 0;
    for (const v of equity) {
      if (v > peak) peak = v;
      const dd = peak > 0 ? (v - peak) / peak * 100 : 0;
      if (dd < maxDD) maxDD = dd;
    }

    // Sharpe（年化，基于逐 bar 收益率）
    const rets = [];
    for (let i = 1; i < equity.length; i++) {
      if (equity[i - 1] > 0) rets.push((equity[i] - equity[i - 1]) / equity[i - 1]);
    }
    let sharpe = 0;
    if (rets.length > 1) {
      const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
      const std  = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length);
      sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;
    }

    const bestTrade  = trades.reduce((m, t) => t.net > m ? t.net : m, -Infinity);
    const worstTrade = trades.reduce((m, t) => t.net < m ? t.net : m, Infinity);

    // 手续费 & 换手率指标
    const totalFees   = trades.reduce((s, t) => s + (t.openFee || 0) + (t.closeFee || 0), 0);
    const feeDrag     = initialCash > 0 ? totalFees / initialCash * 100 : 0;
    const grossTotal  = grossProfit + grossLoss;
    const feeToGross  = grossTotal > 0 ? totalFees / grossTotal * 100 : 0;
    // 换手率：每笔开仓名义价值之和 / 初始资金（倍数）
    const turnover    = initialCash > 0
      ? trades.reduce((s, t) => s + (t.shares || 0) * t.open, 0) / initialCash
      : 0;
    const avgTurnoverPerTrade = trades.length > 0 ? turnover / trades.length : 0;

    return {
      totalReturn,
      winRate,
      maxDD,
      sharpe,
      profitFactor,
      totalTrades : trades.length,
      wins        : wins.length,
      grossProfit,
      grossLoss,
      avgWin      : wins.length  ? grossProfit / wins.length  : 0,
      avgLoss     : losses.length ? grossLoss  / losses.length : 0,
      bestTrade   : isFinite(bestTrade)  ? bestTrade  : 0,
      worstTrade  : isFinite(worstTrade) ? worstTrade : 0,
      finalEquity : finalEq,
      totalFees,
      feeDrag,
      feeToGross,
      turnover,
      avgTurnoverPerTrade,
    };
  }

  function _computeMultiStats(statsList) {
    const KEYS = ['totalReturn', 'winRate', 'maxDD', 'sharpe', 'profitFactor', 'totalTrades',
                  'totalFees', 'feeDrag', 'feeToGross', 'turnover'];
    const res  = {};
    for (const key of KEYS) {
      const vals = statsList.map(s => s[key]).filter(v => isFinite(v)).sort((a, b) => a - b);
      if (!vals.length) { res[key] = { mean: 0, std: 0, min: 0, median: 0, max: 0 }; continue; }
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const std  = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
      res[key] = {
        mean,
        std,
        min    : vals[0],
        median : vals[Math.floor(vals.length / 2)],
        max    : vals[vals.length - 1],
      };
    }
    res.probOfProfit = statsList.filter(s => s.totalReturn > 0).length / statsList.length * 100;
    return res;
  }

  /* ═══════════════════════════════════════════════════════════════
     6. Crypto K 线获取（分页）
  ═══════════════════════════════════════════════════════════════ */
  async function _fetchKlines(symbol, interval, startMs, endMs) {
    const BASE  = 'https://api.binance.com/api/v3/klines';
    const LIMIT = 1000;
    const raw   = [];
    let from    = startMs;

    while (from < endMs) {
      const url  = `${BASE}?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${from}&endTime=${endMs}&limit=${LIMIT}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Binance API ${resp.status}: ${await resp.text().catch(() => '')}`);
      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) break;
      raw.push(...data);
      from = data[data.length - 1][0] + 1;
      if (data.length < LIMIT) break;
    }

    if (!raw.length) return null;

    // 成交量归一化（除以中位数）
    const vols   = raw.map(k => parseFloat(k[5])).sort((a, b) => a - b);
    const medVol = vols[Math.floor(vols.length / 2)] || 1;

    return {
      prices  : raw.map(k => parseFloat(k[4])),
      ohlc    : raw.map(k => ({ o: parseFloat(k[1]), h: parseFloat(k[2]), l: parseFloat(k[3]), c: parseFloat(k[4]) })),
      volumes : raw.map(k => parseFloat(k[5]) / medVol),
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     7. 主运行器
  ═══════════════════════════════════════════════════════════════ */
  async function _runSimBacktest(params, onProgress) {
    const { stratCode, mu, sigma, ticks, runs, initialCash, leverage, includeRegimes } = params;
    const results    = [];
    const statsList  = [];

    // 每次调用生成唯一 session seed，保证多次点击 RUN 结果真正不同
    const sessionSeed = (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;

    for (let i = 0; i < runs; i++) {
      // 每个 run 在 sessionSeed 基础上偏移，保证同次调用内各 run 也互相独立
      const seed   = (sessionSeed + i * 0x9E3779B9) >>> 0;
      const market = _simMarket({ mu, sigma, ticks, seed, includeRegimes });
      const run    = _runStrategy(stratCode, market, { initialCash, leverage, fractional: false });
      if (!run.error) {
        results.push({ ...run, runIdx: i });
        statsList.push(_computeRunStats(run));
      }
      onProgress(i + 1, runs);
      await _yield(); // UI 不卡顿
    }

    return {
      results,
      statsList,
      summary : statsList.length > 1 ? _computeMultiStats(statsList) : null,
    };
  }

  async function _runCryptoBacktest(params, onProgress) {
    const { stratCode, symbol, interval, startMs, endMs, runs, initialCash, leverage } = params;

    const fullMarket = await _fetchKlines(symbol, interval, startMs, endMs);
    if (!fullMarket) return { error: '未获取到数据，请检查日期范围与网络。' };

    const N          = fullMarket.prices.length;
    const results    = [];
    const statsList  = [];

    if (runs <= 1) {
      const run = _runStrategy(stratCode, fullMarket, { initialCash, leverage, fractional: true });
      if (!run.error) {
        results.push({ ...run, runIdx: 0 });
        statsList.push(_computeRunStats(run));
      }
      onProgress(1, 1);
    } else {
      // Walk-Forward：等分 N 段，各段独立测试
      const segLen = Math.max(50, Math.floor(N / runs));
      for (let i = 0; i < runs; i++) {
        const start   = i * segLen;
        const end     = i === runs - 1 ? N : Math.min(N, (i + 1) * segLen);
        const segment = {
          prices  : fullMarket.prices.slice(start, end),
          ohlc    : fullMarket.ohlc.slice(start, end),
          volumes : fullMarket.volumes.slice(start, end),
        };
        if (segment.prices.length < 10) { onProgress(i + 1, runs); continue; }
        const run = _runStrategy(stratCode, segment, { initialCash, leverage, fractional: true });
        if (!run.error) {
          results.push({ ...run, runIdx: i });
          statsList.push(_computeRunStats(run));
        }
        onProgress(i + 1, runs);
        await _yield();
      }
    }

    return {
      results,
      statsList,
      summary : statsList.length > 1 ? _computeMultiStats(statsList) : null,
    };
  }

  function _yield() {
    return new Promise(r => setTimeout(r, 0));
  }

  /* ═══════════════════════════════════════════════════════════════
     8. UI
  ═══════════════════════════════════════════════════════════════ */
  let _panel     = null;
  let _mode      = 'sim';
  let _initP     = {};
  let _stratCode = '';

  // ── CSS 注入（只注入一次）──────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('bt-css')) return;
    const s = document.createElement('style');
    s.id = 'bt-css';
    s.textContent = `
      /* ── 内联面板（嵌入 StrategyEditor 底部）── */
      #bt-inline {
        display: none; flex-direction: column;
        flex-shrink: 0;
        max-height: 64vh; min-height: 0;
        background: #06090f;
        border-top: 1px solid rgba(0,245,255,0.18);
        font-family: 'Share Tech Mono','Fira Code',monospace;
        color: #c0d0e0;
        overflow: hidden;
        -webkit-font-smoothing: antialiased;
      }

      /* ── Header ── */
      #bt-hdr {
        background: #0a111e;
        border-bottom: 1px solid rgba(0,245,255,0.12);
        padding: 6px 14px;
        display: flex; align-items: center; gap: 10px;
        flex-shrink: 0; flex-wrap: wrap;
        min-height: 42px;
        box-shadow: 0 1px 12px rgba(0,245,255,0.04);
      }
      #bt-title {
        font-family: 'Orbitron',monospace;
        color: #00f5ff; font-size: 0.92rem;
        letter-spacing: 2px;
        text-shadow: 0 0 10px rgba(0,245,255,0.75), 0 0 22px rgba(0,245,255,0.25);
        flex: 1; white-space: nowrap;
      }
      #bt-close {
        background: rgba(255,45,120,0.07);
        border: 1px solid rgba(255,45,120,0.32);
        border-bottom: 2px solid rgba(255,45,120,0.50);
        color: #ff2d78; padding: 6px 14px;
        border-radius: 3px; cursor: pointer;
        font-family: inherit; font-size: 0.82rem;
        min-height: 36px; min-width: 44px;
        touch-action: manipulation;
        transition: background 0.12s, box-shadow 0.12s;
      }
      #bt-close:hover {
        background: rgba(255,45,120,0.16);
        box-shadow: 0 0 12px rgba(255,45,120,0.3);
      }
      #bt-close:active { transform: translateY(1px); border-bottom-width: 1px; }

      /* ── 模式切换按钮 ── */
      .bt-mbtn {
        background: rgba(0,245,255,0.04);
        border: 1px solid rgba(0,245,255,0.22);
        border-bottom: 2px solid rgba(0,245,255,0.32);
        color: rgba(0,245,255,0.5);
        padding: 4px 10px; border-radius: 3px; cursor: pointer;
        font-family: inherit; font-size: 0.72rem; letter-spacing: 0.08em;
        min-height: 32px; touch-action: manipulation;
        transition: all 0.12s;
      }
      .bt-mbtn:hover { background: rgba(0,245,255,0.1); color: #00f5ff; }
      .bt-mbtn-on {
        background: rgba(0,245,255,0.15);
        border-color: rgba(0,245,255,0.7);
        border-bottom-color: #00f5ff;
        color: #00f5ff;
        box-shadow: 0 0 10px rgba(0,245,255,0.2);
      }

      /* ── Body（cyber scrollbar）── */
      #bt-body {
        flex: 1; overflow-y: auto; padding: 16px;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: rgba(0,245,255,0.38) rgba(0,245,255,0.03);
      }
      #bt-body::-webkit-scrollbar { width: 5px; }
      #bt-body::-webkit-scrollbar-track {
        background: rgba(0,245,255,0.025);
        border-left: 1px solid rgba(0,245,255,0.08);
      }
      #bt-body::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, rgba(0,245,255,0.52), rgba(255,45,120,0.42));
        border-radius: 0;
        border-left: 1px solid rgba(0,245,255,0.22);
        box-shadow: inset 0 0 4px rgba(0,245,255,0.18), 0 0 6px rgba(0,245,255,0.22);
      }
      #bt-body::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, rgba(0,245,255,0.80), rgba(255,45,120,0.65));
        box-shadow: inset 0 0 4px rgba(0,245,255,0.30), 0 0 10px rgba(0,245,255,0.42);
      }
      #bt-body::-webkit-scrollbar-corner { background: transparent; }

      /* ── Form ── */
      #bt-form { }
      .bt-sec {
        color: rgba(0,245,255,0.7);
        font-size: 0.72rem; letter-spacing: 1.2px;
        margin: 18px 0 9px; padding: 0 0 5px 8px;
        border-bottom: 1px solid rgba(0,245,255,0.1);
        border-left: 2px solid rgba(0,245,255,0.45);
      }
      /* ── 2-col parameter grid ── */
      .bt-form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 5px 8px;
        margin-bottom: 4px;
      }
      /* shared full-span helper */
      .full { grid-column: 1 / -1; }
      /* segmented field: [Label | input] in one bordered box */
      .bt-field {
        display: flex; align-items: stretch;
        border: 1px solid rgba(0,245,255,0.15);
        border-radius: 2px; overflow: hidden;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .bt-field:focus-within {
        border-color: rgba(0,245,255,0.48);
        box-shadow: 0 0 0 1px rgba(0,245,255,0.09), 0 0 8px rgba(0,245,255,0.07);
      }
      .bt-lbl {
        font-size: 0.61rem; color: rgba(192,208,224,0.46);
        white-space: nowrap; letter-spacing: 0.15px;
        padding: 0 7px;
        background: rgba(0,245,255,0.025);
        border-right: 1px solid rgba(0,245,255,0.1);
        flex-shrink: 0;
        display: flex; align-items: center;
      }
      .bt-inp {
        flex: 1; min-width: 0;
        background: transparent; border: none; outline: none;
        color: #c0d0e0;
        padding: 7px 8px; font-family: inherit;
        font-size: 0.80rem; min-height: 34px;
        -webkit-appearance: none; appearance: none;
        touch-action: manipulation;
        transition: background 0.12s;
      }
      .bt-inp:focus { background: rgba(0,245,255,0.03); }
      select.bt-inp { background: #080e18; cursor: pointer; }
      .bt-inp[type="date"] { color-scheme: dark; background: transparent; }
      /* checkbox row — sits directly in grid as a label element */
      .bt-field-cb {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 10px; cursor: pointer;
        background: rgba(0,245,255,0.02);
        border: 1px solid rgba(0,245,255,0.12);
        border-radius: 2px;
        font-size: 0.74rem; color: rgba(192,208,224,0.62);
        user-select: none;
        transition: border-color 0.15s;
      }
      .bt-field-cb:hover { border-color: rgba(0,245,255,0.28); }
      .bt-cb { width: 14px; height: 14px; accent-color: #00f5ff; cursor: pointer; flex-shrink: 0; }
      .bt-run {
        background: linear-gradient(135deg, rgba(0,245,255,0.13), rgba(0,245,255,0.06));
        border: 1px solid rgba(0,245,255,0.38);
        border-bottom: 2px solid rgba(0,245,255,0.58);
        color: #00f5ff; padding: 11px 24px;
        border-radius: 3px; cursor: pointer;
        font-family: 'Orbitron',inherit; font-size: 0.85rem;
        letter-spacing: 1px; width: 100%; margin-top: 22px;
        min-height: 48px; touch-action: manipulation;
        transition: background 0.12s, box-shadow 0.12s, transform 0.08s;
      }
      .bt-run:hover:not(:disabled) {
        background: linear-gradient(135deg, rgba(0,245,255,0.22), rgba(0,245,255,0.12));
        box-shadow: 0 0 18px rgba(0,245,255,0.22), 0 2px 8px rgba(0,0,0,0.4);
      }
      .bt-run:active:not(:disabled) { transform: translateY(1px); border-bottom-width: 1px; }
      .bt-run:disabled { opacity: 0.32; cursor: not-allowed; }

      /* ── Progress（inline below form）── */
      #bt-prog {
        padding: 10px 0 4px;
        border-top: 1px solid rgba(0,245,255,0.10);
        margin-top: 8px;
      }
      .bt-pbar {
        background: rgba(0,245,255,0.07);
        border: 1px solid rgba(0,245,255,0.1);
        border-radius: 2px; height: 4px;
        margin: 8px 0 6px; overflow: hidden;
        position: relative;
      }
      .bt-pfill {
        height: 100%;
        background: linear-gradient(90deg, rgba(0,245,255,0.9), rgba(255,45,120,0.7), rgba(0,245,255,0.9));
        background-size: 200% 100%;
        border-radius: 2px;
        transition: width 0.22s ease;
        animation: bt-shimmer 1.6s linear infinite;
        box-shadow: 0 0 8px rgba(0,245,255,0.5);
      }
      @keyframes bt-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      .bt-plbl  { font-size: 0.73rem; color: rgba(192,208,224,0.42); }
      .bt-pmsg  { font-size: 0.78rem; color: rgba(0,245,255,0.72); letter-spacing: 0.3px; }

      /* ── Result section header ── */
      .bt-res-hdr {
        font-size: 0.72rem; color: rgba(0,245,255,0.7);
        letter-spacing: 0.8px; display: flex; align-items: center; gap: 10px;
        padding: 14px 0 10px 8px;
        border-top: 1px solid rgba(0,245,255,0.14);
        border-left: 2px solid rgba(0,245,255,0.45);
        margin-top: 6px;
      }

      /* ── Form wrap + Results ── */
      #bt-form-wrap { max-width: 540px; margin: 0 auto; }
      #bt-res { }

      /* ── Stat cards ── */
      .bt-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 8px; margin-bottom: 12px;
      }
      .bt-card {
        background: rgba(0,245,255,0.03);
        border: 1px solid rgba(0,245,255,0.11);
        border-radius: 4px; padding: 11px 8px;
        text-align: center;
        transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
        cursor: default;
      }
      .bt-card:hover {
        background: rgba(0,245,255,0.07);
        border-color: rgba(0,245,255,0.22);
        box-shadow: 0 0 10px rgba(0,245,255,0.08);
      }
      .bt-cv { font-size: 1.15rem; font-family: 'Orbitron',inherit; }
      .bt-cl { font-size: 0.67rem; color: rgba(192,208,224,0.45); margin-top: 4px; letter-spacing: 0.3px; }
      .bt-pos  { color: #39ff14; text-shadow: 0 0 8px rgba(57,255,20,0.35); }
      .bt-neg  { color: #ff2d78; text-shadow: 0 0 8px rgba(255,45,120,0.35); }
      .bt-neu  { color: #00f5ff; text-shadow: 0 0 8px rgba(0,245,255,0.3); }
      .bt-warn { color: #ffaa00; text-shadow: 0 0 8px rgba(255,170,0,0.35); }

      /* ── Multi-run table ── */
      .bt-mtbl { width: 100%; border-collapse: collapse; font-size: 0.75rem; margin-bottom: 14px; }
      .bt-mtbl th {
        color: rgba(0,245,255,0.5); text-align: left;
        padding: 6px 8px;
        border-bottom: 1px solid rgba(0,245,255,0.1);
        font-size: 0.68rem; letter-spacing: 0.5px;
        background: rgba(0,245,255,0.02);
      }
      .bt-mtbl td { padding: 5px 8px; border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.1s; }
      .bt-mtbl tr:hover td { background: rgba(0,245,255,0.05); }

      /* ── Canvas chart ── */
      .bt-cwrap {
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(0,245,255,0.1);
        border-radius: 4px; overflow: hidden;
        margin-bottom: 14px;
        transition: border-color 0.2s;
      }
      .bt-cwrap:hover { border-color: rgba(0,245,255,0.2); }
      .bt-ctitle {
        font-size: 0.68rem; color: rgba(0,245,255,0.4);
        padding: 6px 12px 4px; letter-spacing: 0.6px;
        border-bottom: 1px solid rgba(0,245,255,0.06);
      }
      .bt-canvas { display: block; width: 100%; height: 180px; }

      /* ── Best/Worst ── */
      .bt-bw { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
      .bt-bwcard {
        background: rgba(0,0,0,0.18);
        border: 1px solid rgba(0,245,255,0.08);
        border-radius: 4px; padding: 10px 13px; font-size: 0.74rem;
        transition: background 0.15s, border-color 0.15s;
      }
      .bt-bwcard:hover {
        background: rgba(0,245,255,0.04);
        border-color: rgba(0,245,255,0.16);
      }
      .bt-bwt { color: rgba(0,245,255,0.5); margin-bottom: 6px; font-size: 0.68rem; letter-spacing: 0.3px; }
      .bt-bwcard div + div { margin-top: 3px; }

      /* ── Trades table ── */
      .bt-ttitle {
        font-size: 0.72rem; color: rgba(0,245,255,0.55);
        margin: 14px 0 6px; letter-spacing: 0.4px;
        padding-left: 6px; border-left: 2px solid rgba(0,245,255,0.3);
      }
      .bt-ttbl { width: 100%; border-collapse: collapse; font-size: 0.71rem; }
      .bt-ttbl th {
        color: rgba(0,245,255,0.42); padding: 5px 6px; text-align: right;
        border-bottom: 1px solid rgba(0,245,255,0.08);
        background: rgba(0,245,255,0.02); font-size: 0.67rem; letter-spacing: 0.3px;
      }
      .bt-ttbl th:first-child { text-align: left; }
      .bt-ttbl td { padding: 4px 6px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.025); transition: background 0.08s; }
      .bt-ttbl td:first-child { text-align: left; color: rgba(192,208,224,0.6); }
      .bt-ttbl tr:hover td { background: rgba(0,245,255,0.04); }

      /* ── Overflow table wrappers (horizontal cyber scrollbar) ── */
      [style*="overflow-x:auto"], [style*="overflow-x: auto"] {
        scrollbar-width: thin;
        scrollbar-color: rgba(0,245,255,0.38) rgba(0,245,255,0.03);
      }
      [style*="overflow-x:auto"]::-webkit-scrollbar,
      [style*="overflow-x: auto"]::-webkit-scrollbar { height: 4px; }
      [style*="overflow-x:auto"]::-webkit-scrollbar-track,
      [style*="overflow-x: auto"]::-webkit-scrollbar-track {
        background: rgba(0,245,255,0.025);
        border-top: 1px solid rgba(0,245,255,0.08);
      }
      [style*="overflow-x:auto"]::-webkit-scrollbar-thumb,
      [style*="overflow-x: auto"]::-webkit-scrollbar-thumb {
        background: linear-gradient(90deg, rgba(0,245,255,0.52), rgba(255,45,120,0.42));
        border-radius: 0;
        box-shadow: inset 0 0 3px rgba(0,245,255,0.15);
      }
      [style*="overflow-x:auto"]::-webkit-scrollbar-thumb:hover,
      [style*="overflow-x: auto"]::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(90deg, rgba(0,245,255,0.80), rgba(255,45,120,0.65));
        box-shadow: inset 0 0 3px rgba(0,245,255,0.25);
      }

      /* ── Section label ── */
      .bt-slbl {
        font-size: 0.71rem; color: rgba(0,245,255,0.6);
        letter-spacing: 0.6px; margin: 14px 0 10px;
        padding-left: 8px; border-left: 2px solid rgba(0,245,255,0.4);
      }

      /* ── 雷达 + 指标行布局 ── */
      .bt-sr-row { display: flex; gap: 14px; align-items: flex-start; }
      .bt-sr-stats { flex: 1; min-width: 0; }
      .bt-sr-radar {
        flex-shrink: 0; width: 190px;
        background: rgba(0,0,0,0.22);
        border: 1px solid rgba(0,245,255,0.1);
        border-radius: 4px;
        display: flex; flex-direction: column; align-items: center;
        padding-bottom: 6px;
        box-shadow: 0 0 14px rgba(0,245,255,0.04);
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .bt-sr-radar:hover {
        border-color: rgba(0,245,255,0.2);
        box-shadow: 0 0 20px rgba(0,245,255,0.08);
      }
      .bt-radar-canvas { display: block; width: 180px; height: 180px; }

      /* ══ Tablet 481–640px: keep 2-col, bigger touch targets ══ */
      @media (max-width: 640px) {
        #bt-inline { max-height: none; }
        #bt-body { padding: 10px; scrollbar-width: none; }
        #bt-body::-webkit-scrollbar { display: none; }
        .bt-inp  { min-height: 40px; font-size: 0.78rem; }
        .bt-run  { min-height: 50px; }
        .bt-cards { grid-template-columns: repeat(2, 1fr); gap: 7px; }
        .bt-cv  { font-size: 1rem; }
        .bt-canvas { height: 130px; }
        .bt-bw  { grid-template-columns: 1fr; }
        .bt-mtbl { font-size: 0.69rem; }
        .bt-sr-row { flex-direction: column; }
        .bt-sr-radar { width: min(200px, 88vw); margin: 0 auto; }
        .bt-radar-canvas { width: 100%; height: auto; aspect-ratio: 1; }
        .bt-res-hdr { padding: 10px 0 8px 8px; }
        .bt-sec { margin-top: 14px; }
      }
      /* ══ Phone ≤480px: keep 2-col, larger touch ══ */
      @media (max-width: 480px) {
        .bt-form-grid { gap: 4px; }
        .bt-lbl { font-size: 0.60rem; padding: 0 5px; }
        .bt-inp  { min-height: 42px; padding: 6px 5px; font-size: 0.76rem; }
      }
      @media (max-width: 380px) {
        .bt-cards { grid-template-columns: repeat(2, 1fr); gap: 6px; }
        .bt-canvas { height: 110px; }
        .bt-cv { font-size: 0.92rem; }
        .bt-cl { font-size: 0.63rem; }
      }

      /* ── Multi-Market Heatmap ── */
      #bt-mm-tooltip {
        position: fixed; display: none;
        background: rgba(6,9,15,0.96);
        border: 1px solid rgba(0,245,255,0.38);
        color: #c0d0e0; font-size: 0.71rem;
        padding: 4px 10px; border-radius: 3px;
        pointer-events: none; z-index: 9999;
        white-space: nowrap;
        font-family: 'Share Tech Mono','Fira Code',monospace;
        box-shadow: 0 0 12px rgba(0,245,255,0.18);
        letter-spacing: 0.2px;
      }
      .bt-mm-row {
        display: flex; gap: 10px;
        margin-bottom: 14px; flex-wrap: wrap;
      }
      .bt-mm-wrap {
        flex: 1 1 180px; min-width: 0;
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(0,245,255,0.10);
        border-radius: 4px; overflow: hidden;
        transition: border-color 0.2s;
      }
      .bt-mm-wrap:hover { border-color: rgba(0,245,255,0.22); }
      .bt-mm-title {
        font-size: 0.67rem; color: rgba(0,245,255,0.42);
        padding: 5px 10px 3px;
        border-bottom: 1px solid rgba(0,245,255,0.06);
        letter-spacing: 0.5px;
      }
      .bt-mm-canvas {
        display: block; width: 100%; height: 200px;
        cursor: crosshair;
      }
      @media (max-width: 640px) {
        .bt-mm-row { flex-direction: column; gap: 8px; }
        .bt-mm-canvas { height: min(72vw, 280px); }
      }
      @media (max-width: 380px) {
        .bt-mm-canvas { height: 200px; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── 创建/激活面板（注入到 #bt-inline 内联容器）──────────────
  function _createPanel() {
    const container = document.getElementById('bt-inline');
    if (!container) {
      console.warn('BackTest: #bt-inline not found in DOM.');
      return null;
    }
    container.style.display = 'flex';
    container.innerHTML = `
      <div id="bt-hdr">
        <div id="bt-title">📊 BACKTEST</div>
        <button id="bt-close" title="Close">✕</button>
      </div>
      <div id="bt-body">
        <div id="bt-form-wrap">
          <div id="bt-form"></div>
          <div id="bt-prog" style="display:none"></div>
        </div>
        <div id="bt-res" style="display:none"></div>
      </div>
    `;
    container.querySelector('#bt-close').addEventListener('click', _closePanel);
    // 移动端：面板位于页面底部，需滚动到可见区域
    requestAnimationFrame(() => {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return container;
  }

  // ── 模式切换按钮（注入一次到 header）──────────────────────────
  function _injectModeToggle() {
    if (_el('bt-mode-toggle')) return; // 已存在
    const hdr = _el('bt-hdr');
    if (!hdr) return;
    const wrap = document.createElement('div');
    wrap.id = 'bt-mode-toggle';
    wrap.style.cssText = 'display:flex;gap:4px;align-items:center;';
    wrap.innerHTML = `
      <button id="bt-msim"    class="bt-mbtn ${_mode === 'sim'    ? 'bt-mbtn-on' : ''}">SIM</button>
      <button id="bt-mcrypto" class="bt-mbtn ${_mode === 'crypto' ? 'bt-mbtn-on' : ''}">CRYPTO</button>
      <button id="bt-mmulti"  class="bt-mbtn ${_mode === 'multi'  ? 'bt-mbtn-on' : ''}">MULTI</button>
    `;
    // 插到 title 后面、close 前面
    const closeBtn = _el('bt-close');
    hdr.insertBefore(wrap, closeBtn);
    wrap.querySelector('#bt-msim').addEventListener('click', () => {
      _mode = 'sim';
      wrap.querySelector('#bt-msim').classList.add('bt-mbtn-on');
      wrap.querySelector('#bt-mcrypto').classList.remove('bt-mbtn-on');
      wrap.querySelector('#bt-mmulti').classList.remove('bt-mbtn-on');
      _showForm();
    });
    wrap.querySelector('#bt-mcrypto').addEventListener('click', () => {
      _mode = 'crypto';
      wrap.querySelector('#bt-mcrypto').classList.add('bt-mbtn-on');
      wrap.querySelector('#bt-msim').classList.remove('bt-mbtn-on');
      wrap.querySelector('#bt-mmulti').classList.remove('bt-mbtn-on');
      _showForm();
    });
    wrap.querySelector('#bt-mmulti').addEventListener('click', () => {
      _mode = 'multi';
      wrap.querySelector('#bt-mmulti').classList.add('bt-mbtn-on');
      wrap.querySelector('#bt-msim').classList.remove('bt-mbtn-on');
      wrap.querySelector('#bt-mcrypto').classList.remove('bt-mbtn-on');
      _showForm();
    });
  }

  // ── 参数表单 ─────────────────────────────────────────────────
  function _showForm() {
    _injectModeToggle();
    // 同步切换按钮状态（_mode 可能在 open() 时就确定了）
    const simBtn    = _el('bt-msim');
    const cryptoBtn = _el('bt-mcrypto');
    const multiBtn  = _el('bt-mmulti');
    if (simBtn && cryptoBtn) {
      simBtn.classList.toggle('bt-mbtn-on',    _mode === 'sim');
      cryptoBtn.classList.toggle('bt-mbtn-on', _mode === 'crypto');
      if (multiBtn) multiBtn.classList.toggle('bt-mbtn-on', _mode === 'multi');
    }
    if (_mode === 'multi') { _showMultiForm(); return; }

    const p  = _initP;
    const mu = (p.mu ?? 0).toFixed(2);
    const sg = (p.sigma ?? 0.15).toFixed(2);
    const lv = p.leverage ?? 1;
    const ca = p.cash ?? 10000;

    if (_mode === 'sim') {
      _el('bt-form').innerHTML = `
        <div class="bt-sec">▸ MARKET PARAMETERS</div>
        <div class="bt-form-grid">
          <div class="bt-field">
            <span class="bt-lbl">Market Drift μ</span>
            <input class="bt-inp" id="btp-mu" type="number" step="0.01" value="${mu}">
          </div>
          <div class="bt-field">
            <span class="bt-lbl">Volatility σ</span>
            <input class="bt-inp" id="btp-sigma" type="number" step="0.01" min="0.01" value="${sg}">
          </div>
          <label class="bt-field-cb full">
            <input class="bt-cb" id="btp-reg" type="checkbox" checked>
            <span>Include Regimes</span>
          </label>
        </div>

        <div class="bt-sec">▸ TEST PARAMETERS</div>
        <div class="bt-form-grid">
          <div class="bt-field">
            <span class="bt-lbl">Duration (bars)</span>
            <input class="bt-inp" id="btp-ticks" type="number" min="50" max="5000" value="500">
          </div>
          <div class="bt-field">
            <span class="bt-lbl">Initial Cash ($)</span>
            <input class="bt-inp" id="btp-cash" type="number" min="100" value="${ca}">
          </div>
          <div class="bt-field">
            <span class="bt-lbl">Leverage</span>
            <input class="bt-inp" id="btp-lev" type="number" min="1" max="100" value="${lv}">
          </div>
          <div class="bt-field">
            <span class="bt-lbl">Number of Runs</span>
            <input class="bt-inp" id="btp-runs" type="number" min="1" max="50" value="10">
          </div>
        </div>
        <button class="bt-run" id="bt-runbtn">▶ RUN BACKTEST</button>
      `;
    } else {
      const sym = (p.symbol || 'BTCUSDT').toUpperCase();
      const now = new Date();
      const def90 = new Date(now - 90 * 864e5);
      const toStr = d => d.toISOString().slice(0, 10);

      _el('bt-form').innerHTML = `
        <div class="bt-sec">▸ MARKET PARAMETERS</div>
        <div class="bt-form-grid">
          <div class="bt-field">
            <span class="bt-lbl">Symbol</span>
            <input class="bt-inp" id="btp-sym" type="text" value="${sym}" placeholder="BTCUSDT">
          </div>
          <div class="bt-field">
            <span class="bt-lbl">Interval</span>
            <select class="bt-inp" id="btp-iv">
              <option value="1h" selected>1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
              <option value="15m">15m</option>
              <option value="5m">5m</option>
            </select>
          </div>
          <div class="bt-field">
            <span class="bt-lbl">Date From</span>
            <input class="bt-inp" id="btp-from" type="date" value="${toStr(def90)}">
          </div>
          <div class="bt-field">
            <span class="bt-lbl">Date To</span>
            <input class="bt-inp" id="btp-to" type="date" value="${toStr(now)}">
          </div>
        </div>

        <div class="bt-sec">▸ TEST PARAMETERS</div>
        <div class="bt-form-grid">
          <div class="bt-field">
            <span class="bt-lbl">Initial Cash ($)</span>
            <input class="bt-inp" id="btp-cash" type="number" min="100" value="${ca}">
          </div>
          <div class="bt-field">
            <span class="bt-lbl">Leverage</span>
            <input class="bt-inp" id="btp-lev" type="number" min="1" max="100" value="${lv}">
          </div>
          <div class="bt-field full">
            <span class="bt-lbl">Runs (walk-fwd)</span>
            <input class="bt-inp" id="btp-runs" type="number" min="1" max="12" value="1">
          </div>
        </div>
        <button class="bt-run" id="bt-runbtn">▶ RUN BACKTEST</button>
      `;
    }

    _el('bt-runbtn').addEventListener('click', _startRun);
  }

  // ── 开始运行 ─────────────────────────────────────────────────
  async function _startRun() {
    // 每次 RUN 时从编辑器实时读取最新代码，防止面板开启后用户修改了策略
    const editorEl = document.getElementById('code');
    if (editorEl && editorEl.value.trim()) _stratCode = editorEl.value;
    const code = _stratCode;
    if (!code || !code.trim()) {
      alert('策略代码为空，请先编写策略再运行回测。');
      return;
    }

    if (_mode === 'multi') { await _startMultiRun(code); return; }

    // 提前读取所有参数（表单保持可见，参数始终可读）
    const runs = _intVal('btp-runs', 1);
    const cash = _floatVal('btp-cash', 10000);
    const lev  = _floatVal('btp-lev', 1);

    let simP = null, cryptoP = null;
    if (_mode === 'sim') {
      simP = {
        mu     : _floatVal('btp-mu', 0),
        sigma  : Math.max(0.01, _floatVal('btp-sigma', 0.15)),
        ticks  : _intVal('btp-ticks', 500),
        incReg : document.getElementById('btp-reg')?.checked ?? true,
      };
    } else {
      const sym  = (_el('btp-sym')?.value || 'BTCUSDT').trim().toUpperCase();
      const iv   = _el('btp-iv')?.value   || '1h';
      const from = _el('btp-from')?.value;
      const to   = _el('btp-to')?.value;
      if (!from || !to) { alert('请填写日期范围。'); return; }
      const startMs = new Date(from).getTime();
      const endMs   = new Date(to).getTime() + 864e5;
      if (endMs <= startMs) { alert('结束日期必须晚于开始日期。'); return; }
      cryptoP = { sym, iv, startMs, endMs };
    }

    // 禁用按钮，显示进度条（表单保持可见）
    const runBtn = _el('bt-runbtn');
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = '⏳ RUNNING...'; }
    _showProgress(runs);

    function onProgress(done, total) {
      const pct  = done / total * 100;
      const fill = document.getElementById('bt-pfill');
      const lbl  = document.getElementById('bt-plbl');
      if (fill) fill.style.width = pct + '%';
      if (lbl)  lbl.textContent  = `${done} / ${total} runs`;
    }

    try {
      let res;
      if (_mode === 'sim') {
        res = await _runSimBacktest({
          stratCode: code, mu: simP.mu, sigma: simP.sigma, ticks: simP.ticks,
          runs, initialCash: cash, leverage: lev, includeRegimes: simP.incReg,
        }, onProgress);
      } else {
        const pmsg = document.getElementById('bt-pmsg');
        if (pmsg) pmsg.textContent = `正在下载 ${cryptoP.sym} ${cryptoP.iv} 历史数据...`;
        res = await _runCryptoBacktest({
          stratCode: code, symbol: cryptoP.sym, interval: cryptoP.iv,
          startMs: cryptoP.startMs, endMs: cryptoP.endMs,
          runs, initialCash: cash, leverage: lev,
        }, onProgress);
      }

      _el('bt-prog').style.display = 'none';

      if (res.error) {
        _showError(res.error);
      } else {
        _renderResults(res.results, res.statsList, res.summary, runs);
      }
    } catch (e) {
      _el('bt-prog').style.display = 'none';
      _showError('运行失败: ' + e.message);
    }

    _resetBtn();
  }

  function _resetBtn() {
    const btn = document.getElementById('bt-runbtn');
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = _mode === 'multi' ? '▶ RUN MULTI-MARKET' : '▶ RUN BACKTEST';
  }

  function _showProgress(runs) {
    // 表单保持可见，进度条显示在表单下方，清空旧结果
    _el('bt-res').style.display  = 'none';
    _el('bt-prog').style.display = 'block';
    _el('bt-prog').innerHTML = `
      <div class="bt-pmsg" id="bt-pmsg">正在运行回测...</div>
      <div class="bt-pbar"><div class="bt-pfill" id="bt-pfill" style="width:0%"></div></div>
      <div class="bt-plbl" id="bt-plbl">0 / ${runs} runs</div>
    `;
  }

  function _showError(msg) {
    const r = _el('bt-res');
    r.style.display = 'block';
    r.innerHTML = `
      <div class="bt-res-hdr">▸ RESULT</div>
      <div style="color:#ff2d78;padding:10px 0">${_esc(msg)}</div>
    `;
    r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── 渲染结果 ─────────────────────────────────────────────────
  function _renderResults(results, statsList, summary, runs) {
    const r = _el('bt-res');
    r.style.display = 'block';

    if (!results.length) {
      r.innerHTML = `
        <div class="bt-res-hdr">▸ RESULT</div>
        <div style="color:#ff2d78;padding:10px 0">策略未产生任何交易。</div>
      `;
      r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const isSingle = runs === 1 || statsList.length === 1;
    const runsInfo = `${statsList.length} run${statsList.length > 1 ? 's' : ''} · ${results[0]?.equity?.length ?? 0} bars`;
    let html = `
      <div class="bt-res-hdr">
        ▸ RESULT
        <span style="font-size:0.67rem;color:rgba(192,208,224,0.38)">${runsInfo}</span>
      </div>
    `;

    if (isSingle) {
      html += _htmlSingleStats(statsList[0]);
      html += _htmlChartWrap('EQUITY CURVE');
      html += _htmlTradesTable(results[0].trades);
    } else {
      html += '<div class="bt-slbl">▸ SUMMARY (' + statsList.length + ' runs)</div>';
      html += _htmlMultiStats(summary, statsList);
      html += _htmlChartWrap('EQUITY CURVES — all runs (median = cyan)');
      html += _htmlBestWorst(statsList);
    }

    r.innerHTML = html;
    r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // 绘制权益曲线 + 雷达图（nextFrame 等 DOM 生效）
    requestAnimationFrame(() => {
      // 权益曲线
      const canvas = document.getElementById('bt-chart');
      if (canvas) {
        const equityArrs = results.map(res => res.equity);
        const posMask    = statsList.map(s => s.totalReturn >= 0);
        _drawChart(canvas, equityArrs, posMask, isSingle);
      }

      // 雷达图
      const rc = document.getElementById('bt-radar');
      if (rc) {
        const scores = isSingle
          ? _computeRadarScores(statsList[0])
          : _computeRadarScoresMean(summary, statsList);
        _drawRadarChart(rc, scores);
      }
    });
  }

  // ── HTML 片段生成 ────────────────────────────────────────────
  function _htmlSingleStats(s) {
    const f  = (v, pct) => (v >= 0 ? '+' : '') + v.toFixed(2) + (pct ? '%' : '');
    const c  = v => v >= 0 ? 'bt-pos' : 'bt-neg';
    const pf = isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞';
    // 手续费越高越红；换手率用中性色
    const feeCls = s.feeDrag > 5 ? 'bt-neg' : s.feeDrag > 2 ? 'bt-warn' : 'bt-neu';
    return `
      <div class="bt-sr-row">
        <div class="bt-sr-stats">
          <div class="bt-cards">
            ${_card(f(s.totalReturn, true), 'TOTAL RETURN', c(s.totalReturn))}
            ${_card(s.winRate.toFixed(1) + '%', 'WIN RATE', 'bt-neu')}
            ${_card(f(s.maxDD, true), 'MAX DRAWDOWN', 'bt-neg')}
            ${_card(s.sharpe.toFixed(2), 'SHARPE', c(s.sharpe))}
            ${_card(pf, 'PROFIT FACTOR', 'bt-neu')}
            ${_card(s.totalTrades, 'TRADES', 'bt-neu')}
          </div>
          <div class="bt-cards" style="margin-bottom:6px">
            ${_card('$' + s.avgWin.toFixed(0), 'AVG WIN', 'bt-pos')}
            ${_card('$' + s.avgLoss.toFixed(0), 'AVG LOSS', 'bt-neg')}
            ${_card('$' + s.bestTrade.toFixed(0), 'BEST TRADE', 'bt-pos')}
            ${_card('$' + s.worstTrade.toFixed(0), 'WORST TRADE', 'bt-neg')}
          </div>
          <div class="bt-cards" style="margin-bottom:6px">
            ${_card('$' + s.totalFees.toFixed(0), 'TOTAL FEES', feeCls)}
            ${_card(s.feeDrag.toFixed(2) + '%', 'FEE DRAG', feeCls)}
            ${_card(s.feeToGross.toFixed(1) + '%', 'FEE/GROSS', feeCls)}
            ${_card(s.turnover.toFixed(2) + 'x', 'TURNOVER', 'bt-neu')}
            ${_card(s.avgTurnoverPerTrade.toFixed(3) + 'x', 'TURN/TRADE', 'bt-neu')}
          </div>
        </div>
        <div class="bt-sr-radar">
          <div style="font-size:0.65rem;color:rgba(0,245,255,0.45);letter-spacing:0.5px;padding:6px 0 2px;text-align:center">STRATEGY SCORE</div>
          <canvas class="bt-radar-canvas" id="bt-radar"></canvas>
        </div>
      </div>
    `;
  }

  function _card(val, lbl, cls) {
    return `<div class="bt-card"><div class="bt-cv ${cls}">${val}</div><div class="bt-cl">${lbl}</div></div>`;
  }

  function _htmlMultiStats(summary, statsList) {
    if (!summary) return '';
    const prob    = summary.probOfProfit;
    const probCls = prob >= 50 ? 'bt-pos' : 'bt-neg';

    function row(key, label, isPct) {
      const s = summary[key];
      if (!s) return '';
      const fmt = v => {
        if (!isFinite(v)) return '∞';
        return (isPct && v >= 0 ? '+' : '') + v.toFixed(isPct ? 1 : 2) + (isPct ? '%' : '');
      };
      const mc = s.mean >= 0 ? 'bt-pos' : 'bt-neg';
      return `<tr>
        <td>${label}</td>
        <td class="${mc}">${fmt(s.mean)}</td>
        <td style="color:rgba(192,208,224,0.4)">±${Math.abs(s.std).toFixed(1)}${isPct ? '%' : ''}</td>
        <td class="${s.min >= 0 ? 'bt-pos' : 'bt-neg'}">${fmt(s.min)}</td>
        <td>${fmt(s.median)}</td>
        <td class="${s.max >= 0 ? 'bt-pos' : 'bt-neg'}">${fmt(s.max)}</td>
      </tr>`;
    }

    return `
      <div class="bt-sr-row">
        <div class="bt-sr-stats">
          <div class="bt-cards" style="margin-bottom:10px">
            ${_card(prob.toFixed(0) + '%', 'PROB. OF PROFIT', probCls)}
            ${_card(statsList.length, 'RUNS', 'bt-neu')}
          </div>
          <div style="overflow-x:auto;margin-bottom:14px">
            <table class="bt-mtbl">
              <thead><tr>
                <th>Metric</th><th>Mean</th><th>±Std</th><th>Min</th><th>Median</th><th>Max</th>
              </tr></thead>
              <tbody>
                ${row('totalReturn',  'Return',        true)}
                ${row('winRate',      'Win Rate',      true)}
                ${row('maxDD',        'Max Drawdown',  true)}
                ${row('sharpe',       'Sharpe',        false)}
                ${row('profitFactor', 'Profit Factor', false)}
                ${row('totalTrades',  'Trades',        false)}
                <tr><td colspan="6" style="height:4px;padding:0;border:none"></td></tr>
                ${row('totalFees',    'Total Fees ($)', false)}
                ${row('feeDrag',      'Fee Drag',      true)}
                ${row('feeToGross',   'Fee/Gross',     true)}
                ${row('turnover',     'Turnover (x)',  false)}
              </tbody>
            </table>
          </div>
        </div>
        <div class="bt-sr-radar">
          <div style="font-size:0.65rem;color:rgba(0,245,255,0.45);letter-spacing:0.5px;padding:6px 0 2px;text-align:center">STRATEGY SCORE</div>
          <canvas class="bt-radar-canvas" id="bt-radar"></canvas>
        </div>
      </div>
    `;
  }

  function _htmlBestWorst(statsList) {
    let bi = 0, wi = 0;
    statsList.forEach((s, i) => {
      if (s.totalReturn > statsList[bi].totalReturn) bi = i;
      if (s.totalReturn < statsList[wi].totalReturn) wi = i;
    });
    const best  = statsList[bi];
    const worst = statsList[wi];
    const f = (v, pct) => (v >= 0 ? '+' : '') + v.toFixed(2) + (pct ? '%' : '');

    return `
      <div class="bt-bw">
        <div class="bt-bwcard">
          <div class="bt-bwt">🏆 BEST RUN (Run #${bi + 1})</div>
          <div>Return: <span class="bt-pos">${f(best.totalReturn, true)}</span></div>
          <div>Win Rate: <span class="bt-neu">${best.winRate.toFixed(1)}%</span></div>
          <div>Max DD: <span class="bt-neg">${f(best.maxDD, true)}</span></div>
          <div>Sharpe: <span class="${best.sharpe >= 0 ? 'bt-pos' : 'bt-neg'}">${best.sharpe.toFixed(2)}</span></div>
          <div>Trades: ${best.totalTrades}</div>
        </div>
        <div class="bt-bwcard">
          <div class="bt-bwt">📉 WORST RUN (Run #${wi + 1})</div>
          <div>Return: <span class="bt-neg">${f(worst.totalReturn, true)}</span></div>
          <div>Win Rate: <span class="bt-neu">${worst.winRate.toFixed(1)}%</span></div>
          <div>Max DD: <span class="bt-neg">${f(worst.maxDD, true)}</span></div>
          <div>Sharpe: <span class="${worst.sharpe >= 0 ? 'bt-pos' : 'bt-neg'}">${worst.sharpe.toFixed(2)}</span></div>
          <div>Trades: ${worst.totalTrades}</div>
        </div>
      </div>
    `;
  }

  function _htmlChartWrap(title) {
    return `
      <div class="bt-cwrap">
        <div class="bt-ctitle">${title}</div>
        <canvas class="bt-canvas" id="bt-chart"></canvas>
      </div>
    `;
  }

  function _htmlTradesTable(trades) {
    if (!trades.length) return '<div class="bt-ttitle">无交易记录。</div>';
    const shown = trades.slice(-MAX_TRADES_SHOW);
    const rows  = shown.map((t, i) => `
      <tr>
        <td>${trades.length - shown.length + i + 1}. ${t.dir === 1 ? '▲L' : '▼S'}</td>
        <td>$${t.open.toFixed(2)}</td>
        <td>$${t.close.toFixed(2)}</td>
        <td class="${t.net >= 0 ? 'bt-pos' : 'bt-neg'}">$${t.net.toFixed(2)}</td>
        <td style="color:rgba(192,208,224,0.4)">${t.reason}</td>
      </tr>
    `).join('');
    return `
      <div class="bt-ttitle">▸ LAST ${shown.length} TRADES${trades.length > shown.length ? ' (of ' + trades.length + ')' : ''}</div>
      <div style="overflow-x:auto">
        <table class="bt-ttbl">
          <thead><tr><th>#</th><th>Open</th><th>Close</th><th>Net P&amp;L</th><th>Reason</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════
     9. Canvas 权益曲线绘制
  ═══════════════════════════════════════════════════════════════ */
  function _drawChart(canvas, equityArrs, posMask, isSingle) {
    const W  = canvas.offsetWidth  || 600;
    const H  = canvas.offsetHeight || 180;
    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    const PAD = { t: 8, r: 8, b: 28, l: 54 };
    const cW  = W - PAD.l - PAD.r;
    const cH  = H - PAD.t - PAD.b;

    // 全局 min/max
    let gMin =  Infinity;
    let gMax = -Infinity;
    for (const arr of equityArrs) {
      for (const v of arr) {
        if (v < gMin) gMin = v;
        if (v > gMax) gMax = v;
      }
    }
    if (gMin === gMax) gMax = gMin + 1;
    const range = gMax - gMin;

    const toX = (i, len) => PAD.l + (i / Math.max(1, len - 1)) * cW;
    const toY = v         => PAD.t + (1 - (v - gMin) / range) * cH;

    // 辅助网格
    ctx.strokeStyle = 'rgba(0,245,255,0.05)';
    ctx.lineWidth   = 1;
    for (let g = 0; g <= 4; g++) {
      const y = PAD.t + (g / 4) * cH;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    }

    // 零线（初始权益线）
    const initEq = equityArrs[0]?.[0] ?? gMin;
    ctx.strokeStyle = 'rgba(192,208,224,0.1)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(PAD.l, toY(initEq));
    ctx.lineTo(W - PAD.r, toY(initEq));
    ctx.stroke();
    ctx.setLineDash([]);

    // ── 下采样工具
    function downsample(arr) {
      if (arr.length <= MAX_CHART_PTS) return arr;
      const step = (arr.length - 1) / (MAX_CHART_PTS - 1);
      const res  = [];
      for (let j = 0; j < MAX_CHART_PTS - 1; j++) res.push(arr[Math.round(j * step)]);
      res.push(arr[arr.length - 1]);
      return res;
    }

    // ── 绘制各曲线
    for (let ri = 0; ri < equityArrs.length; ri++) {
      const pts   = downsample(equityArrs[ri]);
      const isPos = posMask ? posMask[ri] : (pts[pts.length - 1] >= pts[0]);

      ctx.beginPath();
      pts.forEach((v, i) => {
        const x = toX(i, pts.length);
        const y = toY(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });

      if (!isSingle) {
        // 多曲线：半透明细线
        ctx.strokeStyle = isPos ? 'rgba(57,255,20,0.22)' : 'rgba(255,45,120,0.22)';
        ctx.lineWidth   = 1;
        ctx.stroke();
      } else {
        // 单曲线：渐变填充 + 加粗线
        const lastX  = toX(pts.length - 1, pts.length);
        const firstX = toX(0, pts.length);
        const botY   = PAD.t + cH; // 图表底部
        ctx.lineTo(lastX, botY);
        ctx.lineTo(firstX, botY);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
        if (isPos) {
          grad.addColorStop(0, 'rgba(57,255,20,0.14)');
          grad.addColorStop(1, 'rgba(57,255,20,0.01)');
        } else {
          grad.addColorStop(0, 'rgba(255,45,120,0.14)');
          grad.addColorStop(1, 'rgba(255,45,120,0.01)');
        }
        ctx.fillStyle = grad;
        ctx.fill();

        // 重绘线条
        ctx.beginPath();
        pts.forEach((v, i) => {
          const x = toX(i, pts.length);
          const y = toY(v);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = isPos ? '#39ff14' : '#ff2d78';
        ctx.lineWidth   = 2;
        ctx.stroke();
      }
    }

    // ── 多曲线时：绘制中位数曲线（青色粗线）
    if (!isSingle && equityArrs.length > 1) {
      const minLen = Math.min(...equityArrs.map(a => a.length));
      const medPts = [];
      for (let j = 0; j < minLen; j++) {
        const vals = equityArrs
          .map(a => a[Math.round(j / (minLen - 1) * (a.length - 1))])
          .filter(v => isFinite(v))
          .sort((a, b) => a - b);
        if (vals.length) medPts.push(vals[Math.floor(vals.length / 2)]);
      }
      const medDS = downsample(medPts);
      ctx.beginPath();
      medDS.forEach((v, i) => {
        const x = toX(i, medDS.length);
        const y = toY(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#00f5ff';
      ctx.lineWidth   = 2;
      ctx.stroke();
    }

    // ── Y 轴标签
    ctx.fillStyle  = 'rgba(192,208,224,0.45)';
    ctx.font       = `10px Share Tech Mono, monospace`;
    ctx.textAlign  = 'right';
    ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const v = gMax - (g / 4) * range;
      const y = PAD.t + (g / 4) * cH;
      const label = Math.abs(v) >= 10000 ? '$' + (v / 1000).toFixed(0) + 'k'
                                         : '$' + Math.round(v);
      ctx.fillText(label, PAD.l - 4, y);
    }

    // ── X 轴标签（bar 数）
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    const maxLen = Math.max(...equityArrs.map(a => a.length));
    [0, 0.25, 0.5, 0.75, 1].forEach(t => {
      const x = PAD.l + t * cW;
      const v = Math.round(t * (maxLen - 1));
      ctx.fillText(v, x, H - PAD.b + 4);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     10. 六边形雷达图（镜像 TradingSimulator 实现）
         6 轴: EDGE / WIN% / RISK / R/R / STAB / EFF
         scores: 长度 6 的数组，每项 0–100
  ═══════════════════════════════════════════════════════════════ */

  /** 从单次统计对象计算 6 轴评分 */
  function _computeRadarScores(s) {
    const mdd     = Math.abs(s.maxDD) / 100;          // % → fraction
    const pf      = s.profitFactor;
    const winFrac = s.winRate / 100;                  // % → fraction
    const rr      = (s.avgLoss > 0 && s.avgWin > 0) ? s.avgWin / s.avgLoss : null;
    const calmar  = mdd > 1e-6 ? s.totalReturn / (mdd * 100) : null;
    const n       = s.totalTrades;

    const sEdge = n === 0 ? 0 : Math.min(100, pf >= 9999 ? 100 : pf / 4 * 100);
    const sAcc  = winFrac * 100;
    const sRisk = Math.max(0, 100 - mdd * 200);
    const sPay  = rr === null ? 0 : Math.min(100, rr / 3 * 100);
    const sStab = s.sharpe !== undefined
      ? Math.max(0, Math.min(100, (s.sharpe + 2) / 5 * 100)) : 0;
    const sEff  = calmar === null ? 0 : Math.max(0, Math.min(100, calmar / 5 * 100));

    return [sEdge, sAcc, sRisk, sPay, sStab, sEff];
  }

  /** 从多次运行摘要计算均值评分 */
  function _computeRadarScoresMean(summary, statsList) {
    const mean = k => (summary[k] ? summary[k].mean : 0);
    const avgWin  = statsList.reduce((s, st) => s + st.avgWin,  0) / statsList.length;
    const avgLoss = statsList.reduce((s, st) => s + st.avgLoss, 0) / statsList.length;
    return _computeRadarScores({
      maxDD        : mean('maxDD'),
      profitFactor : mean('profitFactor'),
      winRate      : mean('winRate'),
      avgWin,
      avgLoss,
      sharpe       : mean('sharpe'),
      totalReturn  : mean('totalReturn'),
      totalTrades  : mean('totalTrades'),
    });
  }

  /** 绘制六边形雷达图 */
  function _drawRadarChart(rc, scores) {
    const S   = rc.offsetWidth  || 180;
    rc.width  = S;
    rc.height = S;
    const ctx = rc.getContext('2d');

    const N   = 6;
    const cx  = S / 2, cy = S / 2;
    const R   = S * 0.27;
    const LR  = S * 0.375;
    const lFs = Math.max(7, Math.floor(S * 0.047));
    const lh  = lFs * 1.45;
    const ax  = i => (i / N) * 2 * Math.PI - Math.PI / 2;

    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, S, S);

    // 背景网格（5 层同心六边形）
    for (let ring = 1; ring <= 5; ring++) {
      const r = R * ring / 5;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const a = ax(i);
        i === 0 ? ctx.moveTo(cx + r*Math.cos(a), cy + r*Math.sin(a))
                : ctx.lineTo(cx + r*Math.cos(a), cy + r*Math.sin(a));
      }
      ctx.closePath();
      ctx.strokeStyle = ring === 5 ? 'rgba(0,245,255,0.14)' : 'rgba(0,245,255,0.05)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    // 80分参考线
    { const r80 = R * 0.8;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const a = ax(i);
        i === 0 ? ctx.moveTo(cx + r80*Math.cos(a), cy + r80*Math.sin(a))
                : ctx.lineTo(cx + r80*Math.cos(a), cy + r80*Math.sin(a));
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0,245,255,0.18)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }

    // 轴线
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(0,245,255,0.1)';
    for (let i = 0; i < N; i++) {
      const a = ax(i);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R*Math.cos(a), cy + R*Math.sin(a));
      ctx.stroke();
    }

    // 综合评分与颜色
    const avg = scores.reduce((s, v) => s + v, 0) / N;
    const rgb = avg >= 65 ? '57,255,20' : avg >= 35 ? '245,230,66' : '255,45,120';

    // 无数据提示
    if (scores.every(v => v === 0)) {
      ctx.fillStyle = 'rgba(0,245,255,0.3)';
      ctx.font = `${lFs+1}px "Share Tech Mono"`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('NO TRADES', cx, cy);
      return;
    }

    // 数据多边形（fill + stroke）
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const a = ax(i);
      const r = R * scores[i] / 100;
      i === 0 ? ctx.moveTo(cx + r*Math.cos(a), cy + r*Math.sin(a))
              : ctx.lineTo(cx + r*Math.cos(a), cy + r*Math.sin(a));
    }
    ctx.closePath();
    ctx.fillStyle   = `rgba(${rgb},0.10)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${rgb},0.90)`;
    ctx.lineWidth   = 1.4;
    ctx.shadowColor = `rgba(${rgb},0.55)`;
    ctx.shadowBlur  = 7;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // 顶点圆点
    for (let i = 0; i < N; i++) {
      const a = ax(i);
      const r = R * scores[i] / 100;
      ctx.beginPath();
      ctx.arc(cx + r*Math.cos(a), cy + r*Math.sin(a), 2.2, 0, 2*Math.PI);
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.fill();
    }

    // 轴标签 + 分数
    const LABELS = ['EDGE','WIN%','RISK','R/R','STAB','EFF'];
    ctx.textBaseline = 'middle';
    for (let i = 0; i < N; i++) {
      const a  = ax(i);
      const ax2 = Math.cos(a), ay2 = Math.sin(a);
      const lx = cx + LR * ax2;
      const ly = cy + LR * ay2;
      ctx.textAlign = ax2 > 0.3 ? 'left' : ax2 < -0.3 ? 'right' : 'center';

      ctx.font      = `${lFs}px "Share Tech Mono"`;
      ctx.fillStyle = 'rgba(0,245,255,0.7)';
      ctx.fillText(LABELS[i], lx, ly - lh * 0.5);

      const sc = scores[i];
      ctx.font      = `bold ${lFs+1}px "Share Tech Mono"`;
      ctx.fillStyle = sc >= 65 ? '#39ff14' : sc >= 35 ? '#f5e642' : '#ff2d78';
      ctx.fillText(Math.round(sc), lx, ly + lh * 0.45);
    }

    // 中心：综合评分 + 等级
    const grade  = avg >= 80 ? 'S' : avg >= 65 ? 'A' : avg >= 50 ? 'B' : avg >= 35 ? 'C' : 'D';
    const bigFs  = Math.floor(S * 0.10);
    const smFs   = Math.floor(S * 0.062);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font      = `bold ${bigFs}px "Orbitron",monospace`;
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.shadowColor = `rgb(${rgb})`; ctx.shadowBlur = 12;
    ctx.fillText(Math.round(avg), cx, cy - bigFs * 0.45);
    ctx.shadowBlur = 0;
    ctx.font      = `${smFs}px "Share Tech Mono"`;
    ctx.fillStyle = 'rgba(0,245,255,0.4)';
    ctx.fillText('GRADE  ' + grade, cx, cy + smFs * 1.0);
  }

  /* ═══════════════════════════════════════════════════════════════
     11. 工具函数
  ═══════════════════════════════════════════════════════════════ */
  function _el(id)             { return document.getElementById(id); }
  function _floatVal(id, def)  { const el = _el(id); if (!el) return def; const v = parseFloat(el.value); return isNaN(v) ? def : v; }
  function _intVal(id, def)    { const el = _el(id); if (!el) return def; const v = parseInt(el.value, 10); return isNaN(v) ? def : v; }
  function _esc(s)             { return String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }

  function _closePanel() {
    const container = document.getElementById('bt-inline');
    if (container) container.style.display = 'none';
    if (_mmTooltipEl) _mmTooltipEl.style.display = 'none';
    _panel = null;
  }

  /* ═══════════════════════════════════════════════════════════════
     12. Multi-Market Heatmap（40×40 参数网格回测）
         X轴: μ ∈ [-0.40, +0.40]  Y轴: σ ∈ [0.025, 1.00]
         每格跑 runsPerCell 次取均值，输出 3 张热力图：
         totalReturn / winRate / profitFactor
  ═══════════════════════════════════════════════════════════════ */
  const MM_GRID   = 40;
  const MM_MU_MIN = -0.4, MM_MU_MAX  = 0.4;

  function _mmMuValues() {
    return Array.from({length: MM_GRID}, (_, i) =>
      MM_MU_MIN + i * (MM_MU_MAX - MM_MU_MIN) / (MM_GRID - 1));
  }
  function _mmSigValues() {
    // σ: 0.025 ~ 1.0（避免 σ=0 退化情况）
    return Array.from({length: MM_GRID}, (_, i) => (i + 1) / MM_GRID);
  }

  async function _runMultiMarket(params, onProgress) {
    const { stratCode, ticks, runsPerCell, initialCash, leverage, includeRegimes } = params;
    const GRID      = MM_GRID;
    const muValues  = _mmMuValues();
    const sigValues = _mmSigValues();
    const total     = GRID * GRID;
    const retGrid   = new Float32Array(GRID * GRID);
    const wrGrid    = new Float32Array(GRID * GRID);
    const pfGrid    = new Float32Array(GRID * GRID);

    const sessionSeed = (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;

    for (let si = 0; si < GRID; si++) {
      const sigma = sigValues[si];
      for (let mi = 0; mi < GRID; mi++) {
        const mu  = muValues[mi];
        const idx = si * GRID + mi;
        let sumRet = 0, sumWr = 0, sumPf = 0, validRuns = 0;

        for (let r = 0; r < runsPerCell; r++) {
          const seed   = (sessionSeed + (idx * runsPerCell + r + 1) * 0x9E3779B9) >>> 0;
          const market = _simMarket({ mu, sigma, ticks, seed, includeRegimes });
          const run    = _runStrategy(stratCode, market, { initialCash, leverage, fractional: false });
          if (!run.error) {
            const stats = _computeRunStats(run);
            sumRet += stats.totalReturn;
            sumWr  += stats.winRate;
            const pf = isFinite(stats.profitFactor) ? Math.min(stats.profitFactor, 10) : 10;
            sumPf  += pf;
            validRuns++;
          }
        }
        retGrid[idx] = validRuns > 0 ? sumRet / validRuns : 0;
        wrGrid[idx]  = validRuns > 0 ? sumWr  / validRuns : 0;
        pfGrid[idx]  = validRuns > 0 ? sumPf  / validRuns : 0;
      }
      // 每行（40格）yield 一次，保持 UI 响应
      onProgress(Math.min((si + 1) * GRID, total), total);
      await _yield();
    }
    return { retGrid, wrGrid, pfGrid, muValues, sigValues };
  }

  // ── 色彩映射函数（t∈[0,1]，vMin/vMax 用于语义中心定位）─────

  /** totalReturn：以 0% 为中心，负→红，正→绿 */
  function _mmColorReturn(t, vMin, vMax) {
    const vRange = (vMax - vMin) || 1;
    const zeroT  = Math.max(0, Math.min(1, (0 - vMin) / vRange));
    if (t <= zeroT) {
      const u = zeroT > 0 ? t / zeroT : 0;
      return [Math.round(220 - 150*u), Math.round(20 + 10*u), Math.round(40 + 80*u)];
    } else {
      const u = zeroT < 1 ? (t - zeroT) / (1 - zeroT) : 1;
      return [Math.round(70*(1-u) + 10*u), Math.round(30 + 225*u), Math.round(120*(1-u) + 15*u)];
    }
  }

  /** winRate：深蓝→亮青，单色递进 */
  function _mmColorWinrate(t) {
    return [6, Math.round(20 + 225*t), Math.round(30 + 215*t)];
  }

  /** profitFactor：以 1.0 为中心，< 1→红，> 1→绿 */
  function _mmColorPF(t, vMin, vMax) {
    const vRange = (vMax - vMin) || 1;
    const oneT   = Math.max(0, Math.min(1, (1 - vMin) / vRange));
    if (t <= oneT) {
      const u = oneT > 0 ? t / oneT : 0;
      return [Math.round(160 - 100*u), Math.round(10 + 15*u), Math.round(20 + 15*u)];
    } else {
      const u = oneT < 1 ? (t - oneT) / (1 - oneT) : 1;
      return [Math.round(60*(1-u)), Math.round(25 + 230*u), Math.round(35*(1-u))];
    }
  }

  // ── 热力图 Canvas 绘制 ─────────────────────────────────────────
  function _drawHeatmap(canvas, grid, { GRID, muValues, sigValues, colorFn, fmtLbl }) {
    const W = canvas.offsetWidth  || 260;
    const H = canvas.offsetHeight || 200;
    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#06090f';
    ctx.fillRect(0, 0, W, H);

    const PAD = { t: 8, r: 58, b: 26, l: 32 };
    const gW  = W - PAD.l - PAD.r;
    const gH  = H - PAD.t - PAD.b;
    const cW  = gW / GRID;
    const cH  = gH / GRID;

    // 值域（避免 spread 大数组）
    let vMin = grid[0], vMax = grid[0];
    for (let i = 1; i < grid.length; i++) {
      if (grid[i] < vMin) vMin = grid[i];
      if (grid[i] > vMax) vMax = grid[i];
    }
    const vRange = (vMax - vMin) || 1;

    // 绘制格子
    for (let si = 0; si < GRID; si++) {
      for (let mi = 0; mi < GRID; mi++) {
        const v  = grid[si * GRID + mi];
        const t  = Math.max(0, Math.min(1, (v - vMin) / vRange));
        const [r, g, b] = colorFn(t, vMin, vMax);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        // +0.5 消除子像素缝隙
        ctx.fillRect(
          PAD.l + mi * cW,
          PAD.t + (GRID - 1 - si) * cH,
          Math.ceil(cW) + 0.5, Math.ceil(cH) + 0.5
        );
      }
    }

    // ── 图例色条（右侧）
    const barX = W - PAD.r + 8;
    const barW = 10;
    for (let j = 0; j < gH; j++) {
      const t = 1 - j / gH;
      const [r, g, b] = colorFn(t, vMin, vMax);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(barX, PAD.t + j, barW, 1);
    }
    ctx.strokeStyle = 'rgba(0,245,255,0.14)';
    ctx.lineWidth   = 0.5;
    ctx.strokeRect(barX, PAD.t, barW, gH);

    // 图例标签
    ctx.fillStyle    = 'rgba(192,208,224,0.50)';
    ctx.font         = '9px "Share Tech Mono",monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmtLbl(vMax),          barX + barW + 2, PAD.t + 5);
    ctx.fillText(fmtLbl((vMin+vMax)/2), barX + barW + 2, PAD.t + gH / 2);
    ctx.fillText(fmtLbl(vMin),          barX + barW + 2, PAD.t + gH - 5);

    // ── μ 轴（X，底部）
    ctx.fillStyle    = 'rgba(192,208,224,0.40)';
    ctx.font         = '8px "Share Tech Mono",monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    [0, 10, 20, 30, 39].forEach(i => {
      ctx.fillText(muValues[i].toFixed(2), PAD.l + (i + 0.5) * cW, H - PAD.b + 2);
    });
    ctx.fillStyle = 'rgba(0,245,255,0.50)';
    ctx.font      = '9px "Share Tech Mono",monospace';
    ctx.fillText('μ (drift)', PAD.l + gW / 2, H - 11);

    // ── σ 轴（Y，左侧）
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = 'rgba(192,208,224,0.40)';
    ctx.font         = '8px "Share Tech Mono",monospace';
    [0, 10, 20, 30, 39].forEach(i => {
      const y = PAD.t + (GRID - 1 - i) * cH + cH / 2;
      ctx.fillText(sigValues[i].toFixed(2), PAD.l - 3, y);
    });
    ctx.fillStyle = 'rgba(0,245,255,0.50)';
    ctx.save();
    ctx.translate(9, PAD.t + gH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = '9px "Share Tech Mono",monospace';
    ctx.fillText('σ (vol)', 0, 0);
    ctx.restore();
  }

  // ── Tooltip（共用 fixed div，body 级，避免 overflow:hidden 裁剪）──
  let _mmTooltipEl = null;

  function _ensureMMTooltip() {
    if (!_mmTooltipEl) {
      _mmTooltipEl = document.createElement('div');
      _mmTooltipEl.id = 'bt-mm-tooltip';
      document.body.appendChild(_mmTooltipEl);
    }
    return _mmTooltipEl;
  }

  function _attachHeatmapTooltip(canvas, grid, muValues, sigValues, fmtVal) {
    const GRID = MM_GRID;
    const tt   = _ensureMMTooltip();

    function _pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const cx   = clientX - rect.left;
      const cy   = clientY - rect.top;
      const W    = rect.width, H = rect.height;
      const PAD  = { t: 8, r: 58, b: 26, l: 32 };
      const gW   = W - PAD.l - PAD.r;
      const gH   = H - PAD.t - PAD.b;
      if (cx < PAD.l || cx > PAD.l + gW || cy < PAD.t || cy > PAD.t + gH) return null;
      const mi  = Math.min(GRID - 1, Math.floor((cx - PAD.l) / gW * GRID));
      const si  = Math.min(GRID - 1, GRID - 1 - Math.floor((cy - PAD.t) / gH * GRID));
      if (mi < 0 || si < 0) return null;
      return { mi, si };
    }

    function onMove(e) {
      const clientX = e.clientX !== undefined ? e.clientX : e.touches?.[0]?.clientX;
      const clientY = e.clientY !== undefined ? e.clientY : e.touches?.[0]?.clientY;
      if (clientX === undefined) return;
      const cell = _pick(clientX, clientY);
      if (!cell) { tt.style.display = 'none'; return; }
      const { mi, si } = cell;
      const val = grid[si * GRID + mi];
      const mu  = muValues[mi];
      const sig = sigValues[si];
      tt.textContent = `μ=${mu>=0?'+':''}${mu.toFixed(3)}  σ=${sig.toFixed(3)}  →  ${fmtVal(val)}`;
      tt.style.display = 'block';
      tt.style.left    = (clientX + 14) + 'px';
      tt.style.top     = (clientY - 36) + 'px';
    }
    canvas.addEventListener('mousemove',  onMove);
    canvas.addEventListener('mouseleave', () => { tt.style.display = 'none'; });
    canvas.addEventListener('touchmove',  onMove, { passive: true });
    canvas.addEventListener('touchend',   () => { tt.style.display = 'none'; });
  }

  // ── Multi 参数表单 ─────────────────────────────────────────────
  function _showMultiForm() {
    const p  = _initP;
    const lv = p.leverage ?? 1;
    const ca = p.cash ?? 10000;
    _el('bt-form').innerHTML = `
      <div class="bt-sec">▸ MULTI-MARKET GRID</div>
      <div style="font-size:0.65rem;color:rgba(192,208,224,0.36);padding:0 0 10px 8px;line-height:1.6">
        40×40 网格：μ ∈ [−0.40, +0.40] × σ ∈ [0.025, 1.00]<br>
        共 1600 格，每格独立回测取均值，绘制三张热力图。
      </div>
      <div class="bt-sec">▸ TEST PARAMETERS</div>
      <div class="bt-form-grid">
        <div class="bt-field">
          <span class="bt-lbl">Duration (bars)</span>
          <input class="bt-inp" id="btp-mm-ticks" type="number" min="50" max="2000" value="300">
        </div>
        <div class="bt-field">
          <span class="bt-lbl">Runs / Cell</span>
          <input class="bt-inp" id="btp-mm-rpc" type="number" min="1" max="10" value="2">
        </div>
        <div class="bt-field">
          <span class="bt-lbl">Initial Cash ($)</span>
          <input class="bt-inp" id="btp-mm-cash" type="number" min="100" value="${ca}">
        </div>
        <div class="bt-field">
          <span class="bt-lbl">Leverage</span>
          <input class="bt-inp" id="btp-mm-lev" type="number" min="1" max="100" value="${lv}">
        </div>
        <label class="bt-field-cb full">
          <input class="bt-cb" id="btp-mm-reg" type="checkbox" checked>
          <span>Include Regimes</span>
        </label>
      </div>
      <div style="font-size:0.67rem;color:rgba(192,208,224,0.28);padding:4px 0 0 2px">
        建议 Runs/Cell ≤ 3（总计 1600×runs 次回测）
      </div>
      <button class="bt-run" id="bt-runbtn">▶ RUN MULTI-MARKET</button>
    `;
    _el('bt-runbtn').addEventListener('click', _startRun);
  }

  // ── Multi 主运行入口 ───────────────────────────────────────────
  async function _startMultiRun(code) {
    const ticks       = _intVal('btp-mm-ticks', 300);
    const runsPerCell = Math.min(10, Math.max(1, _intVal('btp-mm-rpc', 2)));
    const cash        = _floatVal('btp-mm-cash', 10000);
    const lev         = _floatVal('btp-mm-lev', 1);
    const incReg      = document.getElementById('btp-mm-reg')?.checked ?? true;
    const total       = MM_GRID * MM_GRID;

    const runBtn = _el('bt-runbtn');
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = '⏳ RUNNING...'; }

    _el('bt-res').style.display  = 'none';
    _el('bt-prog').style.display = 'block';
    _el('bt-prog').innerHTML = `
      <div class="bt-pmsg" id="bt-pmsg">正在计算 1600 个市场参数组合...</div>
      <div class="bt-pbar"><div class="bt-pfill" id="bt-pfill" style="width:0%"></div></div>
      <div class="bt-plbl" id="bt-plbl">0 / ${total} cells</div>
    `;

    function onProgress(done, tot) {
      const pct  = done / tot * 100;
      const fill = _el('bt-pfill'), lbl = _el('bt-plbl'), msg = _el('bt-pmsg');
      if (fill) fill.style.width = pct + '%';
      if (lbl)  lbl.textContent  = `${done} / ${tot} cells`;
      if (msg)  msg.textContent  = `Multi-Market: 已完成 ${done} / ${tot} 格`;
    }

    try {
      const data = await _runMultiMarket({
        stratCode: code, ticks, runsPerCell,
        initialCash: cash, leverage: lev, includeRegimes: incReg,
      }, onProgress);
      _el('bt-prog').style.display = 'none';
      _renderMultiResults(data);
    } catch (e) {
      _el('bt-prog').style.display = 'none';
      _showError('Multi-Market 运行失败: ' + e.message);
    }
    _resetBtn();
  }

  // ── 结果渲染（3 张热力图）────────────────────────────────────
  function _renderMultiResults({ retGrid, wrGrid, pfGrid, muValues, sigValues }) {
    const r = _el('bt-res');
    r.style.display = 'block';
    r.innerHTML = `
      <div class="bt-res-hdr">
        ▸ MULTI-MARKET HEATMAP
        <span style="font-size:0.67rem;color:rgba(192,208,224,0.38)">40×40 grid · hover/touch for values</span>
      </div>
      <div class="bt-mm-row">
        <div class="bt-mm-wrap">
          <div class="bt-mm-title">TOTAL RETURN (%)</div>
          <canvas class="bt-mm-canvas" id="bt-mm-ret"></canvas>
        </div>
        <div class="bt-mm-wrap">
          <div class="bt-mm-title">WIN RATE (%)</div>
          <canvas class="bt-mm-canvas" id="bt-mm-wr"></canvas>
        </div>
        <div class="bt-mm-wrap">
          <div class="bt-mm-title">PROFIT FACTOR (cap 10)</div>
          <canvas class="bt-mm-canvas" id="bt-mm-pf"></canvas>
        </div>
      </div>
    `;
    r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    requestAnimationFrame(() => {
      const GRID = MM_GRID;
      const retCanvas = _el('bt-mm-ret');
      const wrCanvas  = _el('bt-mm-wr');
      const pfCanvas  = _el('bt-mm-pf');

      if (retCanvas) {
        _drawHeatmap(retCanvas, retGrid, {
          GRID, muValues, sigValues, colorFn: _mmColorReturn,
          fmtLbl: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%',
        });
        _attachHeatmapTooltip(retCanvas, retGrid, muValues, sigValues,
          v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%');
      }
      if (wrCanvas) {
        _drawHeatmap(wrCanvas, wrGrid, {
          GRID, muValues, sigValues, colorFn: _mmColorWinrate,
          fmtLbl: v => v.toFixed(1) + '%',
        });
        _attachHeatmapTooltip(wrCanvas, wrGrid, muValues, sigValues,
          v => v.toFixed(1) + '% win rate');
      }
      if (pfCanvas) {
        _drawHeatmap(pfCanvas, pfGrid, {
          GRID, muValues, sigValues, colorFn: _mmColorPF,
          fmtLbl: v => v.toFixed(2),
        });
        _attachHeatmapTooltip(pfCanvas, pfGrid, muValues, sigValues,
          v => 'PF=' + v.toFixed(2));
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     Public API
  ═══════════════════════════════════════════════════════════════ */
  /**
   * 打开回测面板
   * @param {object} opts
   *   stratCode {string}  — 策略代码
   *   mode      {string}  — 'sim' | 'crypto'
   *   mu        {number}  — 年化漂移率（sim 默认值）
   *   sigma     {number}  — 年化波动率（sim 默认值）
   *   leverage  {number}  — 杠杆（默认值）
   *   cash      {number}  — 初始资金（默认值）
   *   symbol    {string}  — 交易对（crypto 默认值）
   */
  function open(opts = {}) {
    _injectCSS();
    if (_panel) _closePanel();

    _mode      = (opts.mode === 'crypto') ? 'crypto' : 'sim';
    _stratCode = opts.stratCode || '';
    _initP     = {
      mu       : opts.mu       ?? 0,
      sigma    : opts.sigma    ?? 0.15,
      leverage : opts.leverage ?? 1,
      cash     : opts.cash     ?? 10000,
      symbol   : opts.symbol   ?? 'BTCUSDT',
    };

    _panel = _createPanel();
    _showForm();
  }

  return { open, close: _closePanel };
})();
