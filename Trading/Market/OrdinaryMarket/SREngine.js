/* ═══════════════════════════════════════════════════════════════════
   Market/SREngine.js  — 支撑 / 压力位系统
   用三条独立 EMA（20 / 55 / 120）作为动态 S/R 水平线。
   挂载为 window.SREngine，由 MarketEngine.js 统一调用。

   ── 双重力学机制 ──
   近区（|d| < SR_ZONE）：
     均值回归阻力，靠近 EMA 时产生反向 force。
     自适应强度：价格在该区域停留越久（touchCount 越大），阻力越强（最多 ×2）。
   突破穿越（side 翻转）：
     动量加速 srBreakDrift，指数衰减。
     自适应强度：突破前停留越久（touchCount 越大），突破动量越强（最多 ×4）。
     突破后 touchCount 归零（支撑/压力失效重置）。

   ── N 无关性 ──
     _srDecay = SR_BREAK_DECAY^(1/N)：N ticks 后总衰减恒等于 SR_BREAK_DECAY
     _srForceScale = 1/N：保证每 T 的 SR 近区力总和不变
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 常量 ── */
  const SR_PERIODS     = [20, 55, 120];
  const SR_ZONE        = 0.018;    // 近区相对距离阈值（±1.8%）
  const SR_MAX_FORCE   = 0.0050;   // 最大近区回归力（已乘 _srForceScale；随 sigma_user 放大以保持感知效果）
  const SR_BREAK_BASE  = 0.0080;   // 突破动量基础力（按 sqrt(period/20) 缩放；sigma_user=0.25 下调至可见）
  const SR_BREAK_DECAY = 0.82;     // 每 T 的突破动量衰减系数

  /* 自适应参数 */
  const TOUCH_MAX_PROX_BOOST  = 1.0;  // 近区力最大额外倍率（总上限 2×）
  const TOUCH_MAX_BREAK_BOOST = 3.0;  // 突破力最大额外倍率（总上限 4×）
  // T 周期数语义：在 EMA 近区停留 X 个 T 后力量达到上限
  // 以 T 为单位定义，applyN() 将其换算为 tick 数，消除 N 相关性
  const TOUCH_PROX_T  = 8;   // 近区力饱和所需 T 数（N=4 时对应原 ~30 ticks）
  const TOUCH_BREAK_T = 5;   // 突破力饱和所需 T 数（N=4 时对应原 ~20 ticks）

  // N 相关衍生量：_touchProxScale / _touchBreakScale = T数 × simN（tick 数）
  // 初始值对应默认 N=4
  let _touchProxScale  = TOUCH_PROX_T  * 4;
  let _touchBreakScale = TOUCH_BREAK_T * 4;

  /* ── 状态 ── */
  const srEmaValues  = new Map();  // period → 实时 EMA 值
  const srPrevSide   = new Map();  // period → 上一 tick 相对侧 (+1 / -1)
  const srTouchCount = new Map();  // period → 近区停留 tick 数（突破后归零）
  let   srBreakDrift = 0;          // 当前累积突破动量 drift

  // N 相关衍生量（初始值对应 N=4）
  let _srDecay      = Math.pow(SR_BREAK_DECAY, 1 / 4);
  let _srForceScale = 1 / 4;

  /* ════════════════════════════════════════════════════════
     公开 API
  ════════════════════════════════════════════════════════ */
  window.SREngine = {

    /* ── 常量 & 状态暴露（供主文件 / Crypto.js / CryptoCtx 引用） ── */
    get SR_PERIODS()   { return SR_PERIODS; },
    get srEmaValues()  { return srEmaValues; },
    get srPrevSide()   { return srPrevSide; },
    get srBreakDrift() { return srBreakDrift; },
    set srBreakDrift(v){ srBreakDrift = v; },

    /* ════════════════════════════════════════════════════════
       updateEMA(price)
       价格确定后增量更新三条 EMA。
       每 tick 在 computeForce 之前由 MarketEngine 调用。
    ════════════════════════════════════════════════════════ */
    updateEMA(price) {
      for (const p of SR_PERIODS) {
        const k    = 2 / (p + 1);
        const prev = srEmaValues.get(p);
        srEmaValues.set(p, prev === undefined ? price : prev + k * (price - prev));
      }
    },

    /* ════════════════════════════════════════════════════════
       computeForce(currentPrice)
       计算本 tick 支撑/压力位对价格的合力（log-return 空间）。

       返回值为累加了突破动量释放量和近区回归力的标量，
       直接加入 GBM 的 log-return 公式中。

       同时更新 srBreakDrift（突破动量衰减）和 srTouchCount。
    ════════════════════════════════════════════════════════ */
    computeForce(currentPrice) {
      /* 释放本 tick 的突破动量分量（几何级数求和保证 N ticks 内总量恒定） */
      let srForce  = srBreakDrift * (1 - _srDecay) / (1 - SR_BREAK_DECAY);
      srBreakDrift *= _srDecay;
      if (Math.abs(srBreakDrift) < 5e-5) srBreakDrift = 0;

      for (const p of SR_PERIODS) {
        const L = srEmaValues.get(p);
        if (L === undefined || L <= 0) continue;

        const d    = (currentPrice - L) / L;
        const side = d >= 0 ? 1 : -1;
        const prev = srPrevSide.get(p);

        if (prev !== undefined && prev !== side) {
          /* ── 突破事件：动量加速 ── */
          const touches    = srTouchCount.get(p) || 0;
          // 自适应突破力：停留越久突破力越强（体现假突破减少，真突破放大）
          const breakBoost = 1 + TOUCH_MAX_BREAK_BOOST * Math.min(1, touches / _touchBreakScale);
          srBreakDrift += side * SR_BREAK_BASE * Math.sqrt(p / 20) * breakBoost;
          srTouchCount.set(p, 0);  // 突破后重置（支撑/压力位强度归零）
        }
        srPrevSide.set(p, side);

        const absd = Math.abs(d);
        if (absd < SR_ZONE) {
          /* ── 近区：均值回归阻力 ── */
          const touches  = srTouchCount.get(p) || 0;
          const proxBoost = 1 + TOUCH_MAX_PROX_BOOST * Math.min(1, touches / _touchProxScale);
          srForce += side * SR_MAX_FORCE * _srForceScale
                   * (1 - absd / SR_ZONE)    // 线性衰减：越靠近力越大
                   * proxBoost;              // 自适应：停留越久阻力越强
          srTouchCount.set(p, touches + 1);
        }
      }

      return srForce;
    },

    /* ════════════════════════════════════════════════════════
       applyN(simN)
       切换 simN 时重新推导衍生量，保证 N 无关性。
    ════════════════════════════════════════════════════════ */
    applyN(simN) {
      _srDecay        = Math.pow(SR_BREAK_DECAY, 1 / simN);
      _srForceScale   = 1 / simN;
      _touchProxScale  = TOUCH_PROX_T  * simN;   // T 数 → tick 数，保证 N 无关性
      _touchBreakScale = TOUCH_BREAK_T * simN;
    },

    /* ════════════════════════════════════════════════════════
       reset()
       完整重置所有 S/R 状态（游戏 RESET 时调用）
    ════════════════════════════════════════════════════════ */
    reset() {
      srEmaValues.clear();
      srPrevSide.clear();
      srTouchCount.clear();
      srBreakDrift = 0;
    },
  };

})();
