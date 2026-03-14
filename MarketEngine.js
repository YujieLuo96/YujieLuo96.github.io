/* ═══════════════════════════════════════════════════════════════════
   MarketEngine.js  — 市场价格模型
   封装：情景系统 (Bull / Bear / Chop)、天鹅事件、
         随机参数（Heston-style vol + drift）、支撑/压力位
   挂载为 window.MarketEngine，由 TradingSimulator.html 调用。
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 随机参数常量 ── */
  const VOL_KAPPA   = 2.5;
  const VOL_OF_VOL  = 0.65;  // 增大：更明显的波动率聚集
  const DRIFT_KAPPA = 0.8;
  const DRIFT_VOL   = 0.15;  // 增大：漂移更活跃
  const JUMP_PROB   = 0.025;
  const JUMP_MEAN   = -0.005;
  const JUMP_STD    = 0.04;

  /* ═══════════════════════════════════════════
     情景系统
  ═══════════════════════════════════════════ */
  const REGIMES = [
    { name:'BULL', weight:0.33, color:'#39ff14', muMult:0.5,  muAdd:+0.09, sigMult:1.30, jumpMult:0.6 },
    { name:'BEAR', weight:0.27, color:'#ff2d78', muMult:0.5,  muAdd:-0.11, sigMult:1.80, jumpMult:2.2 },
    { name:'CHOP', weight:0.40, color:'#f5e642', muMult:0.08, muAdd: 0.00, sigMult:0.38, jumpMult:0.4 },
  ];
  const REGIME_TRANSITION = 30;

  let regimeIdx      = 2;
  let prevRegimeIdx  = 2;
  let regimeTick     = 0;
  let regimeDuration = 120 + Math.floor(Math.random() * 180);
  let regimeBlend    = 1.0;

  /* ═══════════════════════════════════════════
     天鹅事件系统
     f(t) = (e·sin(t/π^e) + π·cos(t/e^π) + 7·sin(t/17)) / (e+π+7)
     level: ±2 = small/black swan, ±3 = large/epic swan
  ═══════════════════════════════════════════ */
  const SWAN_PI_E  = Math.pow(Math.PI, Math.E);   // π^e ≈ 22.46
  const SWAN_E_PI  = Math.pow(Math.E,  Math.PI);  // e^π ≈ 23.14
  const SWAN_DENOM = Math.E + Math.PI + 7;         // ≈ 12.86

  function swanF(t) {
    return (Math.E  * Math.sin(t / SWAN_PI_E)
          + Math.PI * Math.cos(t / SWAN_E_PI)
          + 7       * Math.sin(t / 17)) / SWAN_DENOM;
  }

  let swanLevel     = 0;   // current swan level (-3/-2/0/+2/+3)
  let prevSwanLevel = 0;   // for edge detection (toast only fires once per entry)
  let swanTOffset   = 1 + Math.floor(Math.random() * 2999); // 随机相位偏移 [1,2999]

  /* ═══════════════════════════════════════════
     压力位 / 支撑位系统
     用三条独立 EMA 作为动态 S/R 水平线：
       EMA20  → 短期支撑/压力
       EMA55  → 中期支撑/压力
       EMA120 → 长期支撑/压力
     邻近区域：均值回归力（靠近 → 受阻）
     突破区域：动量加速力（穿越 → 惯性延续）
  ═══════════════════════════════════════════ */
  const SR_PERIODS    = [20, 55, 120];
  const SR_ZONE       = 0.018;    // 相对距离阈值（±1.8%）
  const SR_MAX_FORCE  = 0.0022;   // 最大近区回归力（proximity=1 时）
  const SR_BREAK_BASE = 0.0035;   // 突破动量基础力（按 sqrt(period/20) 缩放）
  const SR_BREAK_DECAY= 0.82;     // 每 tick 动量衰减系数

  const srEmaValues = new Map();  // period → 实时 EMA 值（增量更新，独立于显示缓存）
  const srPrevSide  = new Map();  // period → 上一 tick 相对侧 (1=above / -1=below)
  let   srBreakDrift = 0;         // 当前累积突破动量 drift

  // N 相关衍生量，由 applyN() 维护（初始值对应 N=4）
  let _srDecay      = Math.pow(SR_BREAK_DECAY, 1 / 4);
  let _srForceScale = 1 / 4;

  /* ── 随机参数状态 ── */
  let mu_user    = 0.02;
  let sigma_user = 0.10;
  let mu_base    = mu_user;
  let sigma_base = sigma_user;
  let mu_t       = mu_user;
  let sigma_t    = sigma_user;
  let effectiveJumpProb = JUMP_PROB;

  /* ══════════════════════════════════════════════════════════════
     公开 API
  ══════════════════════════════════════════════════════════════ */
  window.MarketEngine = {

    /* ── 导出常量（供主文件引用） ── */
    get REGIMES()    { return REGIMES; },
    get JUMP_PROB()  { return JUMP_PROB; },
    get JUMP_MEAN()  { return JUMP_MEAN; },
    get JUMP_STD()   { return JUMP_STD; },
    get SR_PERIODS() { return SR_PERIODS; },

    /* ── 用户参数（由 UI 滑块读写） ── */
    get mu_user()    { return mu_user; },    set mu_user(v)    { mu_user = v; },
    get sigma_user() { return sigma_user; }, set sigma_user(v) { sigma_user = v; },

    /* ── 衍生状态（主文件只读，供渲染 / HUD 使用） ── */
    get mu_base()    { return mu_base; },
    get sigma_base() { return sigma_base; },
    get mu_t()       { return mu_t; },    set mu_t(v)    { mu_t = v; },
    get sigma_t()    { return sigma_t; }, set sigma_t(v) { sigma_t = v; },
    get effectiveJumpProb() { return effectiveJumpProb; },

    /* ── 情景状态（主文件只读，供图表 / HUD 使用） ── */
    get regimeIdx()     { return regimeIdx; },
    get prevRegimeIdx() { return prevRegimeIdx; },
    get regimeBlend()   { return regimeBlend; },

    /* ── 天鹅状态（主文件只读，供图表 / HUD 使用） ── */
    get swanLevel()   { return swanLevel; },
    get swanTOffset() { return swanTOffset; },

    /* ── SR Maps（通过引用共享，主文件 / CryptoCtx 直接操作） ── */
    get srEmaValues()  { return srEmaValues; },
    get srPrevSide()   { return srPrevSide; },
    get srBreakDrift() { return srBreakDrift; }, set srBreakDrift(v) { srBreakDrift = v; },

    /* ════════════════════════════════════════════════════════
       stepRegime(simN)
       每 tick 推进情景切换状态，更新 mu_base / sigma_base / effectiveJumpProb
    ════════════════════════════════════════════════════════ */
    stepRegime(simN) {
      regimeTick++;
      regimeBlend = Math.min(1, regimeBlend + 1 / (REGIME_TRANSITION * simN));
      if (regimeTick >= regimeDuration) {
        prevRegimeIdx = regimeIdx;
        let next = regimeIdx, tries = 0;
        while (next === regimeIdx && tries++ < 20) {
          const r = Math.random(); let cum = 0;
          for (let i = 0; i < REGIMES.length; i++) {
            cum += REGIMES[i].weight;
            if (r < cum) { next = i; break; }
          }
        }
        regimeIdx      = next;
        regimeTick     = 0;
        regimeDuration = simN * (100 + Math.floor(Math.random() * 320));
        regimeBlend    = 0;
      }
      const b = regimeBlend, curr = REGIMES[regimeIdx], prev = REGIMES[prevRegimeIdx];
      mu_base    = Math.max(-0.5, Math.min(0.5,
        mu_user * (prev.muMult*(1-b) + curr.muMult*b) + (prev.muAdd*(1-b) + curr.muAdd*b)));
      sigma_base = Math.max(0.005,
        sigma_user * (prev.sigMult*(1-b) + curr.sigMult*b));
      effectiveJumpProb = JUMP_PROB * (prev.jumpMult*(1-b) + curr.jumpMult*b);
    },

    /* ════════════════════════════════════════════════════════
       stepStochasticParams(dt, normalRandom)
       每 tick 随机游走波动率 sigma_t 与漂移 mu_t（Heston-style）
    ════════════════════════════════════════════════════════ */
    stepStochasticParams(dt, normalRandom) {
      const sqDt = Math.sqrt(dt);
      sigma_t = Math.max(sigma_user * 0.5,
        Math.min(sigma_user * 2.0,
          sigma_t + VOL_KAPPA * (sigma_base - sigma_t) * dt + VOL_OF_VOL * sigma_t * normalRandom() * sqDt
        )
      );
      mu_t = Math.max(-0.8, Math.min(0.8,
        mu_t + DRIFT_KAPPA * (mu_base - mu_t) * dt + DRIFT_VOL * normalRandom() * sqDt
      ));
    },

    /* ════════════════════════════════════════════════════════
       stepSwan(totalTicks, simN)
       检测天鹅事件等级，返回本 tick 的价格参数修正：
         swanVolScale — 波动率放大系数（乘以 sigma_t·diffusion）
         swanDriftAdd — 每 T 目标漂移偏置（÷simN 换算到每 tick）
         swanVolBoost — 成交量放大系数（天鹅期间激增）
         changed      — true = swanLevel 刚进入新状态（触发 Toast 用）
    ════════════════════════════════════════════════════════ */
    stepSwan(totalTicks, simN) {
      const sf = swanF(totalTicks / simN + swanTOffset);
      prevSwanLevel = swanLevel;
      swanLevel = sf >  0.98 ?  3
                : sf >  0.92 ?  2
                : sf < -0.98 ? -3
                : sf < -0.92 ? -2
                : 0;

      const swanVolScale = swanLevel ===  3 ? 2.2
                         : swanLevel ===  2 ? 1.6
                         : swanLevel === -2 ? 2.0
                         : swanLevel === -3 ? 3.2
                         : 1.0;
      const swanDriftAdd = swanLevel ===  3 ? +0.015
                         : swanLevel ===  2 ? +0.008
                         : swanLevel === -2 ? -0.010
                         : swanLevel === -3 ? -0.022
                         : 0;
      const swanVolBoost = swanLevel !== 0 ? swanVolScale * 1.4 : 1.0;
      const changed      = swanLevel !== 0 && swanLevel !== prevSwanLevel;

      return { swanVolScale, swanDriftAdd, swanVolBoost, changed };
    },

    /* ════════════════════════════════════════════════════════
       updateSREMA(price)
       价格确定后增量更新三条 EMA（用于支撑/压力位计算）
    ════════════════════════════════════════════════════════ */
    updateSREMA(price) {
      for (const p of SR_PERIODS) {
        const k    = 2 / (p + 1);
        const prev = srEmaValues.get(p);
        srEmaValues.set(p, prev === undefined ? price : prev + k * (price - prev));
      }
    },

    /* ════════════════════════════════════════════════════════
       computeSRForce(currentPrice)
       计算本 tick 支撑/压力位对价格的合力（log-return 空间）
       同时衰减 srBreakDrift（突破动量）
       注释：
         _srDecay = SR_BREAK_DECAY^(1/N)，保证 N 个 tick 后总衰减仍为 SR_BREAK_DECAY
         动量每 tick 释放量 = srBreakDrift*(1-_srDecay)/(1-SR_BREAK_DECAY)
           → N 个 tick 的总和恒等于 srBreakDrift，与 N 无关（几何级数求和）
         _srForceScale = 1/N，保证 SR 邻近力每 T 总和不变
    ════════════════════════════════════════════════════════ */
    computeSRForce(currentPrice) {
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
          srBreakDrift += side * SR_BREAK_BASE * Math.sqrt(p / 20);
        }
        srPrevSide.set(p, side);

        const absd = Math.abs(d);
        if (absd < SR_ZONE) {
          srForce += side * SR_MAX_FORCE * _srForceScale * (1 - absd / SR_ZONE);
        }
      }
      return srForce;
    },

    /* ════════════════════════════════════════════════════════
       applyN(simN)
       切换 simN 时同步更新 N 相关衍生量，并将当前 regime 计时器
       重置到新 N 的刻度，避免当前 regime 以旧 N 节奏跑完
    ════════════════════════════════════════════════════════ */
    applyN(simN) {
      _srDecay      = Math.pow(SR_BREAK_DECAY, 1 / simN);
      _srForceScale = 1 / simN;
      regimeDuration = simN * (100 + Math.floor(Math.random() * 320));
      regimeTick  = 0;
      regimeBlend = 1.0;
    },

    /* ════════════════════════════════════════════════════════
       reset(simN)
       完整重置所有市场模型状态（游戏 RESET 时调用）
    ════════════════════════════════════════════════════════ */
    reset(simN) {
      regimeIdx      = 2;
      prevRegimeIdx  = 2;
      regimeTick     = 0;
      regimeDuration = simN * (120 + Math.floor(Math.random() * 180));
      regimeBlend    = 1.0;
      mu_base        = mu_user;
      sigma_base     = sigma_user;
      mu_t           = mu_user;
      sigma_t        = sigma_user;
      effectiveJumpProb = JUMP_PROB;
      swanLevel      = 0;
      prevSwanLevel  = 0;
      swanTOffset    = 1 + Math.floor(Math.random() * 2999);
      srEmaValues.clear();
      srPrevSide.clear();
      srBreakDrift   = 0;
    },

    /* ════════════════════════════════════════════════════════
       stepPriceCore(currentPrice, totalTicks, simN, dt, normalRandom)
       每 tick 的纯价格计算核心：
         1. stepRegime        — 情景切换
         2. stepStochasticParams — Heston vol/drift 随机游走
         3. stepSwan          — 天鹅事件检测
         4. computeSRForce    — 支撑/压力合力
         5. GBM 价格更新      — drift + diffusion + jump + swan + SR
         6. updateSREMA       — 价格确定后更新 EMA
         7. 计算 relVol       — 相对成交量（天鹅期间放大）
       返回 { newPrice, swanEffect, relVol }
       所有应用层副作用（数据记录、UI、策略）由调用方处理。
    ════════════════════════════════════════════════════════ */
    stepPriceCore(currentPrice, totalTicks, simN, dt, normalRandom) {
      this.stepRegime(simN);
      this.stepStochasticParams(dt, normalRandom);

      const swanEffect = this.stepSwan(totalTicks, simN);
      const srForce    = this.computeSRForce(currentPrice);

      const drift     = mu_t - 0.5 * sigma_t * sigma_t;
      const diffusion = sigma_t * swanEffect.swanVolScale * Math.sqrt(dt) * normalRandom();
      // 跳跃概率按 1/N 缩放，保证每 T 期内期望跳跃次数不变
      const jump      = Math.random() < effectiveJumpProb / simN
                        ? JUMP_MEAN + JUMP_STD * normalRandom() : 0;

      // swanDriftAdd 是每 T 的目标 log-return 偏移，÷simN 换算为每 sub-tick 量
      let newPrice = currentPrice * Math.exp(
          drift * dt + diffusion + jump + swanEffect.swanDriftAdd / simN + srForce
      );
      if (newPrice < 0.01) newPrice = 0.01;

      this.updateSREMA(newPrice);  // 价格确定后更新 S/R EMA

      // 成交量：天鹅事件期间量能激增
      const relVol = (sigma_t / Math.max(sigma_user, 0.001))
                     * (0.7 + 0.6 * Math.random())
                     * swanEffect.swanVolBoost;

      return { newPrice, swanEffect, relVol };
    },

    /* ════════════════════════════════════════════════════════
       warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume)
       initPrice() 调用：预热 100*simN 个 tick 的随机游走
       将生成的 OHLC / 价格 / 成交量数据写入传入的数组
       同时预热 SR EMA（使其在游戏开始时已收敛）
       更新 ME.sigma_t / ME.mu_t 为预热末尾状态
       返回最终价格（由 initPrice 写入 currentPrice）
    ════════════════════════════════════════════════════════ */
    warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume) {
      const sqDt    = Math.sqrt(dt);
      const initLen = 100 * simN;
      let p = 100, s = sigma_user, m = mu_user;

      for (let i = 0; i < initLen; i++) {
        s = Math.max(sigma_user*0.5, Math.min(sigma_user*2.0,
            s + VOL_KAPPA*(sigma_user-s)*dt + VOL_OF_VOL*s*normalRandom()*sqDt));
        m = Math.max(-0.8, Math.min(0.8,
            m + DRIFT_KAPPA*(mu_user-m)*dt + DRIFT_VOL*normalRandom()*sqDt));
        const drift = m - 0.5*s*s;
        const jump  = Math.random() < JUMP_PROB/simN ? JUMP_MEAN + JUMP_STD*normalRandom() : 0;
        p = p * Math.exp(drift*dt + s*sqDt*normalRandom() + jump);
        if (p < 0.01) p = 0.01;

        // 预热 S/R EMA，游戏开始时 srEmaValues 已收敛
        for (const per of SR_PERIODS) {
          const k    = 2 / (per + 1);
          const prev = srEmaValues.get(per);
          srEmaValues.set(per, prev === undefined ? p : prev + k * (p - prev));
        }

        const open  = i === 0 ? p : outOhlc[i - 1].c;
        const micro = s * 0.25 * Math.random();
        outOhlc.push({
          o: open,
          h: Math.max(open, p) * (1 + micro),
          l: Math.max(0.01, Math.min(open, p) * (1 - micro)),
          c: p,
        });
        outPrice.push(p);
        outVolume.push((s / Math.max(sigma_user, 0.001)) * (0.7 + 0.6 * Math.random()));
      }

      // 将预热末尾的随机参数状态写回
      sigma_t = s;
      mu_t    = m;
      return p;  // 最终价格，由 initPrice() 写入 currentPrice
    },

  };
})();
