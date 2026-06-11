/**
 * EMACache.js — EMA 与 K 线聚合缓存模块
 *
 * 管理两类缓存：
 *  1. EMA 缓存（tick 驱动，200ms 更新一次）
 *     - emaCache     : Map<period, Float64Array>  基于 priceHistory 的 EMA 序列
 *     - aggEmaCache  : Map<period, {stableLen, stableLastClose, ema}>  聚合 K 线的稳定段 EMA
 *     - aggEmaScratch: Map<period, Float64Array>  复用输出 buffer，避免 60fps GC 分配
 *     - emaCacheTick : Map<period, number>  上次更新时的 totalTicks，用于增量路径验证
 *
 *  2. 聚合 K 线缓存（帧驱动，60fps，cache-miss 时每 tick 重建一次）
 *     - _aggCache    : null | object  聚合 OHLC 结果，帧内 O(1) 更新末尾 partial candle
 *
 * 公开 API：
 *   init(deps)                      — 注入依赖（一次）
 *   update()                        — 每 tick 更新 EMA 缓存（替代 updateEMACache）
 *   computeEMA(period)              — 读取 emaCache（供 drawEMALine 使用）
 *   getAggEMA(closes, period)       — 聚合 K 线的 EMA（供 drawEMALine 使用）
 *   getAggregated(animP)            — 聚合 OHLC/vol/closes（供 drawChart 使用）
 *   reset()                         — 全量清空（4×Map + _aggCache），不执行 update
 *   invalidateAgg()                 — 仅清空 aggEmaCache + _aggCache（TF 切换时用）
 *   extendForLiveBar(price)         — Crypto 直播专用：emaCache 各 period 延长一步
 *   getRawAggCache()                — 返回 _aggCache 原始值（_cryptoCtx getter 使用）
 *   setRawAggCache(v)               — 直接写 _aggCache（_cryptoCtx setter 使用）
 *
 * deps 对象字段：
 *   getPriceHistory()  → number[]
 *   getOhlc()          → Array<{o,h,l,c}>
 *   getVolumeHistory() → number[]
 *   getTotalTicks()    → number
 *   getCandleSize()    → number
 *   getShowDetailedEMA() → boolean
 *   getShowRainbowEMA()  → boolean
 *   getMaxHistory()    → number   （let MAX_HISTORY，随 simN 变化）
 */
window.EMACache = (function () {
  'use strict';

  /* ── 私有数据结构 ───────────────────────────────────────── */
  // emaCache 记录结构：{ buf: Float64Array(容量), len: 有效长度, view: buf.subarray(0,len) }
  // 容量按需翻倍增长 → priceHistory 增长期的每 tick 更新为 O(1) 均摊（旧实现为
  // O(n) 全量重算 + 全新分配，在数组到达 MAX_HISTORY 前的整个会话期间持续发生）。
  const emaCache      = new Map(); // period → {buf, len, view}
  const aggEmaCache   = new Map(); // period → { stableLen, stableLastClose, ema }
  const aggEmaScratch = new Map(); // period → Float64Array（复用 buffer）
  const emaCacheTick  = new Map(); // period → totalTicks（增量更新验证）
  let   _aggCache     = null;      // 聚合 K 线缓存对象

  let _deps = null; // 注入的依赖

  const _EMPTY = new Float64Array(0);

  /* 保证 rec.buf 容量 ≥ n（翻倍扩容，保留已有数据），返回 rec */
  function _ensureCap(rec, n) {
    if (rec.buf.length < n) {
      const grown = new Float64Array(Math.max(n, rec.buf.length * 2, 1024));
      grown.set(rec.buf.subarray(0, rec.len));
      rec.buf = grown;
    }
    return rec;
  }

  /* ── 私有：纯计算，对任意 close 数组求 EMA ──────────────── */
  // 可选 len 参数：只处理 arr 的前 len 个元素，避免调用方做 arr.slice(0, len)
  function _emaFromArray(arr, period, len = arr.length) {
    if (len < period) return new Float64Array(0);
    const k   = 2 / (period + 1);
    const out = new Float64Array(len - period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += arr[i];
    out[0] = sum / period;
    for (let i = period; i < len; i++)
      out[i - period + 1] = (arr[i] - out[i - period]) * k + out[i - period];
    return out;
  }

  /* ── 私有：每 tick 重建聚合 K 线稳定段（O(MAX_HISTORY)）── */
  // 仅在 getAggregated 检测到 cache miss 时调用，每 tick 最多一次
  function _rebuildAggCache() {
    const d   = _deps;
    const sz  = d.getCandleSize();
    const ohlc         = d.getOhlc();
    const volumeHistory= d.getVolumeHistory();
    const totalTicks   = d.getTotalTicks();
    const len          = ohlc.length;

    // sz <= 1 时 getAggregated 走早返回路径，不会调用本函数
    // len === 0 时也不调用，故此处无需再判断

    // ── 与原逻辑相同：从右向左确定分组边界 ──────────────────
    const partialSize = ((totalTicks - 1) % sz) + 1;

    // partial 组（最右侧，未完成）
    const pEnd   = len;
    const pStart = Math.max(0, pEnd - partialSize);

    // 稳定组：右向左收集，然后 reverse 成旧→新
    const sStarts = [];
    const sEnds   = [];
    let pos = pEnd - partialSize;
    while (pos > 0) {
      const start = Math.max(0, pos - sz);
      sStarts.push(start);
      sEnds.push(pos);
      pos = start;
    }
    sStarts.reverse();
    sEnds.reverse();

    // ── 构建稳定段输出数组 ────────────────────────────────────
    const ag     = [];
    const vol    = [];
    const closes = [];

    for (let gi = 0; gi < sStarts.length; gi++) {
      const gStart = sStarts[gi];
      const gEnd   = sEnds[gi];
      if (gStart >= gEnd) continue;
      let hi = -Infinity, lo = Infinity, vSum = 0;
      for (let j = gStart; j < gEnd; j++) {
        const c = ohlc[j];
        if (c.h > hi) hi = c.h;
        if (c.l < lo) lo = c.l;
        vSum += volumeHistory[j] || 0;
      }
      ag.push({ o: ohlc[gStart].o, h: hi, l: lo, c: ohlc[gEnd - 1].c });
      vol.push(vSum);
      closes.push(ohlc[gEnd - 1].c);
    }

    // ── partial 组：预算 baseH/baseL/vol/open，animP 留到帧内接入 ──
    let partialBaseH = -Infinity, partialBaseL = Infinity, partialVSum = 0;
    for (let j = pStart; j < pEnd; j++) {
      const c = ohlc[j];
      if (c.h > partialBaseH) partialBaseH = c.h;
      if (c.l < partialBaseL) partialBaseL = c.l;
      partialVSum += volumeHistory[j] || 0;
    }
    const partialOpen   = ohlc[pStart].o;
    const stableCount   = ag.length;

    // partial 槽：占位对象，h/l/c 在每帧由 getAggregated 填写
    ag.push({ o: partialOpen, h: 0, l: 0, c: 0 });
    vol.push(partialVSum);
    closes.push(0); // placeholder，每帧更新为 animP

    _aggCache = {
      totalTicks,
      sz, len,
      stableCount,
      ag, vol, closes,
      partialBaseH,
      partialBaseL,
      partialOpen,
    };
  }

  /* ── 公开 API ───────────────────────────────────────────── */

  /** 注入依赖（页面初始化时调用一次） */
  function init(deps) {
    _deps = deps;
  }

  /**
   * 每 tick 调用（替代 updateEMACache）
   * 按当前 showDetailedEMA / showRainbowEMA 标志决定需要哪些 period，
   * 对每个 period 走增量或全量 EMA 路径写入 emaCache。
   */
  function update() {
    if (!_deps) return; // init() 尚未调用（resetGame 在 init 之前执行时的防御）
    const d = _deps;
    const ph = d.getPriceHistory();
    const n  = ph.length;
    const tt = d.getTotalTicks();
    const steady = (n === d.getMaxHistory());

    const needed = new Set([5, 20]);
    if (d.getShowDetailedEMA()) [1,2,3,5,7,10,20,30,60].forEach(p => needed.add(p));
    if (d.getShowRainbowEMA())  for (let p = 1; p <= 60; p++) needed.add(p);

    needed.forEach(period => {
      const k        = 2 / (period + 1);
      const rec      = emaCache.get(period);
      const lastTick = emaCacheTick.get(period) ?? -1;
      const adjacent = (tt - lastTick === 1);

      if (steady && rec && rec.len === n && adjacent) {
        // ── 滚动路径（数组已达容量上限，每 tick shift+push）──
        // 原地左移 + 写入末位，无分配（copyWithin 为原生 memmove）
        const b = rec.buf;
        b.copyWithin(0, 1, n);
        b[n-1] = (ph[n-1] - b[n-2]) * k + b[n-2];
      } else if (rec && rec.len === n - 1 && adjacent) {
        // ── 追加路径（数组增长期，每 tick 仅 push）──
        // EMA 递推只依赖前值，追加一步与全量重算逐位等价；O(1) 均摊
        _ensureCap(rec, n);
        const b = rec.buf;
        b[n-1]   = (ph[n-1] - b[n-2]) * k + b[n-2];
        rec.len  = n;
        rec.view = b.subarray(0, n);
      } else if (rec && rec.len === n && adjacent && n >= 2) {
        // ── 末位修正路径（crypto：live bar 经 extendForLiveBar 预延长，
        //    收盘时长度不变仅末值定稿）── 用正式收盘价重写最后一位
        const b = rec.buf;
        b[n-1] = (ph[n-1] - b[n-2]) * k + b[n-2];
      } else {
        // ── 全量重建（首次启用 / period 关闭多 tick 后重开 / 数组被裁剪）──
        const r = rec ? _ensureCap(rec, n) : { buf: new Float64Array(Math.max(n, 1024)), len: 0, view: _EMPTY };
        const b = r.buf;
        b[0] = ph[0];
        for (let i = 1; i < n; i++) b[i] = (ph[i] - b[i-1]) * k + b[i-1];
        r.len  = n;
        r.view = b.subarray(0, n);
        emaCache.set(period, r);
      }
      emaCacheTick.set(period, tt);
    });
  }

  /**
   * 读取 emaCache（供 drawEMALine 在 candleSize<=1 时使用）
   * 返回 Float64Array 视图或空数组（period 尚未计算时）；
   * view 在 update/extend 时预先建好，60fps 读取零分配。
   */
  function computeEMA(period) {
    const rec = emaCache.get(period);
    return rec ? rec.view : _EMPTY;
  }

  /**
   * 聚合 K 线的 EMA（供 drawEMALine 在 candleSize>1 时使用）
   * 稳定段每 tick 计算一次（aggEmaCache），末尾 animP 那一步每帧 O(1) 接入。
   */
  function getAggEMA(closes, period) {
    const totalLen = closes.length;
    if (totalLen < period) return [];

    // 稳定收盘 = 除最后一根（= animP）之外的所有 close
    const stableLen       = totalLen - 1;
    const stableLastClose = stableLen > 0 ? closes[stableLen - 1] : 0;

    const cached = aggEmaCache.get(period);
    let baseEma;
    if (cached && cached.stableLen === stableLen && cached.stableLastClose === stableLastClose) {
      baseEma = cached.ema; // tick 边界未变，直接复用
    } else {
      // 仅 tick 更新时（200ms）才重算稳定段，O(stableLen) 但每秒只跑 5 次
      baseEma = stableLen >= period
        ? _emaFromArray(closes, period, stableLen)
        : new Float64Array(0);
      aggEmaCache.set(period, { stableLen, stableLastClose, ema: baseEma });
    }

    if (baseEma.length === 0) return _emaFromArray(closes, period); // 兜底

    // 用 O(1) 把 animP 那一步接上去，复用 scratch buffer 避免分配
    const outLen = baseEma.length + 1;
    let out = aggEmaScratch.get(period);
    if (!out || out.length !== outLen) {
      out = new Float64Array(outLen);
      aggEmaScratch.set(period, out);
    }
    out.set(baseEma);
    const k       = 2 / (period + 1);
    const prevEma = baseEma[baseEma.length - 1];
    out[baseEma.length] = prevEma + k * (closes[totalLen - 1] - prevEma);
    return out;
  }

  /**
   * 聚合 OHLC / vol / closes（供 drawChart 每帧调用）
   * cache hit 时帧内工作量 = O(1)（只写 partial 槽的 5 个字段）。
   * cache miss 时调用 _rebuildAggCache（O(MAX_HISTORY)，每 tick 最多一次）。
   */
  function getAggregated(animP) {
    if (!_deps) return { ag: [], vol: [], closes: [] };
    const d    = _deps;
    const sz   = d.getCandleSize();
    const ohlc = d.getOhlc();

    if (sz <= 1) {
      return { ag: ohlc, vol: d.getVolumeHistory(), closes: d.getPriceHistory() };
    }

    const len = ohlc.length;
    if (len === 0) return { ag: [], vol: [], closes: [] };

    // 缓存失效条件：totalTicks / candleSize / ohlc 长度任一变化
    const tt = d.getTotalTicks();
    if (_aggCache === null
        || _aggCache.totalTicks !== tt
        || _aggCache.sz         !== sz
        || _aggCache.len        !== len) {
      _rebuildAggCache();
      // 极端情况：rebuild 后仍为 null（理论上不会发生，加防御）
      if (_aggCache === null) return { ag: [], vol: [], closes: [] };
    }

    // ── O(1)：将 animP 融入末尾 partial candle ───────────────
    const sc         = _aggCache.stableCount;
    const partCandle = _aggCache.ag[sc];
    const bH         = _aggCache.partialBaseH;
    const bL         = _aggCache.partialBaseL;

    partCandle.o           = _aggCache.partialOpen;
    partCandle.h           = bH > animP ? bH : animP;
    partCandle.l           = bL < animP ? bL : animP;
    partCandle.c           = animP;
    _aggCache.closes[sc]   = animP;
    // vol[sc] 在 _rebuildAggCache 时已设置，无需每帧更新

    return { ag: _aggCache.ag, vol: _aggCache.vol, closes: _aggCache.closes };
  }

  /**
   * 全量重置：清空所有 4 个 Map + 置 _aggCache = null
   * 不执行 update()，调用方按需决定是否跟随调用 update()
   * 用于：resetGame()、applySimN()
   */
  function reset() {
    emaCache.clear();
    aggEmaCache.clear();
    aggEmaScratch.clear();
    emaCacheTick.clear();
    _aggCache = null;
  }

  /**
   * 部分重置：仅清空 aggEmaCache + 置 _aggCache = null
   * 用于：TF（时间周期）切换按钮
   * emaCache 中的数据仍然有效（基于 priceHistory，与 TF 无关）
   */
  function invalidateAgg() {
    aggEmaCache.clear();
    _aggCache = null;
  }

  /**
   * Crypto 直播模式专用：新 K 线刚推入 priceHistory 时（bar 尚未关闭），
   * 将 emaCache 中每个 period 延长一步，保持 ema 长度 === priceHistory 长度。
   * 下一个 bar 关闭时 update() 会以正式数据覆盖本步的近似值。
   * （{buf,len} 结构下为 O(1) 追加，无需整段复制）
   */
  function extendForLiveBar(price) {
    emaCache.forEach((rec, period) => {
      if (rec.len === 0) return;
      _ensureCap(rec, rec.len + 1);
      const k    = 2 / (period + 1);
      const prev = rec.buf[rec.len - 1];
      rec.buf[rec.len] = prev + k * (price - prev);
      rec.len++;
      rec.view = rec.buf.subarray(0, rec.len);
    });
  }

  /**
   * 返回 _aggCache 原始值（_cryptoCtx getter 使用）
   * Crypto.js 通过 _cryptoCtx._aggCache 读取，以检测缓存是否有效
   */
  function getRawAggCache() { return _aggCache; }

  /**
   * 直接写 _aggCache（_cryptoCtx setter 使用）
   * Crypto.js 会在切换 K 线数据时执行 _cryptoCtx._aggCache = null 使缓存失效
   */
  function setRawAggCache(v) { _aggCache = v; }

  return {
    init,
    update,
    computeEMA,
    getAggEMA,
    getAggregated,
    reset,
    invalidateAgg,
    extendForLiveBar,
    getRawAggCache,
    setRawAggCache,
  };
})();
