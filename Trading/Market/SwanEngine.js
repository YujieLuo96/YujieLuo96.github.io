/* ═══════════════════════════════════════════════════════════════════
   Market/SwanEngine.js  — 天鹅事件系统
   用拟周期三角函数 f(t) 驱动价格冲击等级（±2 / ±3）。
   挂载为 window.SwanEngine，由 MarketEngine.js 统一调用。

   f(t) = (e·sin(t/π^e) + π·cos(t/e^π) + 7·sin(t/17)) / (e+π+7)
   level: ±2 = small swan, ±3 = large/epic swan
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 预计算常量 ── */
  const SWAN_PI_E  = Math.pow(Math.PI, Math.E);   // π^e ≈ 22.46
  const SWAN_E_PI  = Math.pow(Math.E,  Math.PI);  // e^π ≈ 23.14
  const SWAN_DENOM = Math.E + Math.PI + 7;         // ≈ 12.86

  /* ── 天鹅事件参数表 ── */
  //   swanVolScale : 乘以 sigma_t·diffusion 的波动率放大系数
  //   swanDriftAdd : 每 T 的 log-return 偏置（÷simN 换算到每 tick）
  //   swanVolBoost : 成交量放大系数
  const SWAN_PARAMS = {
    '3' : { swanVolScale: 2.2, swanDriftAdd: +0.015 },
    '2' : { swanVolScale: 1.6, swanDriftAdd: +0.008 },
    '-2': { swanVolScale: 2.0, swanDriftAdd: -0.010 },
    '-3': { swanVolScale: 3.2, swanDriftAdd: -0.022 },
  };

  function swanF(t) {
    return (Math.E  * Math.sin(t / SWAN_PI_E)
          + Math.PI * Math.cos(t / SWAN_E_PI)
          + 7       * Math.sin(t / 17)) / SWAN_DENOM;
  }

  /* ── 状态 ── */
  let swanLevel     = 0;
  let prevSwanLevel = 0;
  let swanTOffset   = 1 + Math.floor(Math.random() * 2999);  // 随机相位偏移 [1,2999]

  /* ════════════════════════════════════════════════════════
     公开 API
  ════════════════════════════════════════════════════════ */
  window.SwanEngine = {

    get swanLevel()   { return swanLevel; },
    get swanTOffset() { return swanTOffset; },

    /* ════════════════════════════════════════════════════════
       step(totalTicks, simN)
       检测天鹅事件等级，返回本 tick 的价格参数修正对象：
         swanVolScale — 波动率放大系数（乘以 sigma_t·diffusion）
         swanDriftAdd — 每 T 目标漂移偏置
         swanVolBoost — 成交量放大系数
         changed      — true = swanLevel 刚进入新状态（触发 Toast）
    ════════════════════════════════════════════════════════ */
    step(totalTicks, simN) {
      const sf = swanF(totalTicks / simN + swanTOffset);
      prevSwanLevel = swanLevel;

      swanLevel = sf >  0.98 ?  3
                : sf >  0.92 ?  2
                : sf < -0.98 ? -3
                : sf < -0.92 ? -2
                : 0;

      const p = SWAN_PARAMS[swanLevel];
      const swanVolScale = p ? p.swanVolScale : 1.0;
      const swanDriftAdd = p ? p.swanDriftAdd : 0;
      // 天鹅期间成交量激增，level 越极端量能越大
      const swanVolBoost = swanLevel !== 0 ? swanVolScale * 1.4 : 1.0;
      // 边缘检测：只有刚进入非零状态时才触发 Toast
      const changed      = swanLevel !== 0 && swanLevel !== prevSwanLevel;

      return { swanVolScale, swanDriftAdd, swanVolBoost, changed };
    },

    /* ════════════════════════════════════════════════════════
       reset()
       完整重置天鹅状态，重新随机相位（游戏 RESET 时调用）
    ════════════════════════════════════════════════════════ */
    reset() {
      swanLevel     = 0;
      prevSwanLevel = 0;
      swanTOffset   = 1 + Math.floor(Math.random() * 2999);
    },
  };

})();
