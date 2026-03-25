/* ═══════════════════════════════════════════════════════════════════
   OppMarket/OppMarketEngine.js  — 逆玩家市场引擎

   设计宗旨：与玩家操作反着来。
     · 玩家买入（做多）→ 市场承受向下作用力
     · 玩家卖出（做空）→ 市场承受向上作用力

   核心机制：
     ① 基础 GBM（含 Heston-lite vol/drift OU 过程 + 杠杆效应）
     ② 长期均值回归（连续 OU，防止价格无限漂移）
     ③ 玩家压力积累器（_playerPressure）
        - notifyTrade(direction, shares) 由 MarketHub 在玩家下单时注入
        - 每次买入追加负压力，每次卖出追加正压力
        - 每 tick 按 PRESSURE_DECAY^(1/N) 指数衰减

   完全自包含，无外部依赖。
   挂载为 window.OppMarketEngine，接口与 OrdinaryMarketEngine 完全兼容。
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 全局配置（MarketConfig.js 须先加载） ── */
  const { SIM_N_DEFAULT, MEAN_REV_SLOW_T, MEAN_REV_LONG_T, WARMUP_T } = window.MarketConfig;

  /* ══════════════════════════════════════════════════════════════
     引擎参数配置（所有硬编码常量集中于此，分组管理）
  ══════════════════════════════════════════════════════════════ */
  const CONFIG = {

    /* ── 玩家逆压力 ──────────────────────────────────────────── */
    FORCE_BASE:     0.10,  // 单次交易注入的压力量级（年化 log-return 单位）
    PRESSURE_DECAY: 0.78,  // 每 T 衰减系数（0.78 → 半衰期约 2.8 T）
    PRESSURE_MAX:   0.45,  // 压力绝对值上限（防止连续操作无限累积）

    /* ── Heston-lite OU：vol / drift 随机过程 ──────────────── */
    VOL_KAPPA:   1.5,   // sigma_t 均值回归速度
    VOL_OF_VOL:  0.40,  // vol-of-vol
    DRIFT_KAPPA: 0.6,   // mu_t 均值回归速度
    DRIFT_VOL:   0.12,  // mu_t 随机扰动强度

    /* ── 杠杆效应 ────────────────────────────────────────────── */
    LEVERAGE_RHO: -0.55,  // 价格-波动率相关系数

    /* ── 长期均值回归（OU 锚）──────────────────────────────────── */
    MEAN_REV_KAPPA0: 0.20,  // 年化 OU 回归速度
    MEAN_REV_NOISE:  0.10,  // kappa 随机噪声幅度（±10%）

    /* ── 随机过程边界 ────────────────────────────────────────── */
    SIGMA_MAX_MULT: 2.0,   // sigMax = sigma_user × 此值
    SIGMA_MIN_MULT: 0.25,  // sigMin = sigma_user × 此值
    DRIFT_CLAMP:    0.80,  // mu_t 截断范围 ±DRIFT_CLAMP

    /* ── 成交量模型 ──────────────────────────────────────────── *
       归一化分母用 sigma_user（基准期望），与 sigma_t/sigma_user 因子解耦：
       · sigma_t/sigma_user  — 波动率水平对量能的贡献
       · priceChangeFactor   — 本 tick 相对于"正常日内波动"的异常程度
       两者独立叠加，提高上限（8）以区分大幅移动与普通波动               */
    VOL_PRICE_FACTOR: 3,    // priceChangeFactor 斜率系数
    VOL_CAP:          8,    // priceChangeFactor 上限（从 4 提高到 8）
    VOL_NOISE_MIN:    0.55, // 随机噪声下界
    VOL_NOISE_RANGE:  0.45, // 随机噪声范围（上界 = MIN + RANGE = 1.0）
  };

  /* ── 杠杆效应 Cholesky 正交分量（由 CONFIG.LEVERAGE_RHO 派生） ── */
  const LEVERAGE_SQRT1RHO2 = Math.sqrt(1 - CONFIG.LEVERAGE_RHO * CONFIG.LEVERAGE_RHO);

  /* ── EMA 系数（applyN / reset 时按 simN 动态重算） ── */
  let MEAN_REV_SLOW_K = 2 / (MEAN_REV_SLOW_T * SIM_N_DEFAULT + 1);
  let MEAN_REV_EMA_K  = 2 / (MEAN_REV_LONG_T  * SIM_N_DEFAULT + 1);

  /* ══════════════════════════════════════════════════════════════
     虚拟情景定义（单情景，供 HUD / 图表兼容）
  ══════════════════════════════════════════════════════════════ */
  const REGIMES = [
    {
      name: 'OPP', color: '#ff2d78',
      muMult: 1, muAdd: 0, sigMult: 1, jumpMult: 0, sigCap: 2, meanRevMult: 0.5,
    },
  ];

  /* SR 为空 Map（不使用支撑/压力线） */
  const _EMPTY_MAP = new Map();

  /* ══════════════════════════════════════════════════════════════
     引擎状态（所有状态均在此闭包内，完全隔离）
  ══════════════════════════════════════════════════════════════ */
  let mu_user    = window.MarketConfig.MU_DEFAULT;
  let sigma_user = window.MarketConfig.SIGMA_DEFAULT;
  let mu_t       = window.MarketConfig.MU_DEFAULT;
  let sigma_t    = 0.25;
  let longEma    = 0;
  let refPrice   = 0;

  /** 玩家压力积累器（负 = 下行压力，正 = 上行压力） */
  let _playerPressure  = 0;
  let _oppDecayPerTick = Math.pow(CONFIG.PRESSURE_DECAY, 1 / SIM_N_DEFAULT);

  /* 无天鹅事件，始终返回此哑对象 */
  const _noSwan = {
    changed: false, swanLevel: 0,
    swanVolScale: 1, swanDriftAdd: 0,
    swanGap: 0, swanVolBoost: 1,
  };

  /* ══════════════════════════════════════════════════════════════
     公开 API（接口与 OrdinaryMarketEngine 完全兼容）
  ══════════════════════════════════════════════════════════════ */
  window.OppMarketEngine = {

    /* ── 常量 ─────────────────────────────────────────────────── */
    get REGIMES()    { return REGIMES; },
    get JUMP_PROB()  { return 0; },
    get JUMP_MEAN()  { return 0; },
    get JUMP_STD()   { return 0; },
    get SR_PERIODS() { return []; },

    /* ── 用户参数 ──────────────────────────────────────────────── */
    get mu_user()    { return mu_user; },    set mu_user(v)    { mu_user = v; },
    get sigma_user() { return sigma_user; }, set sigma_user(v) { sigma_user = v; },

    /* ── 衍生状态（只读） ─────────────────────────────────────── */
    get mu_base()           { return mu_user; },
    get sigma_base()        { return sigma_user; },
    get mu_t()              { return mu_t; },
    get sigma_t()           { return sigma_t; },
    get effectiveJumpProb() { return 0; },
    get longEma()           { return longEma; },
    get refPrice()          { return refPrice; },

    /* ── 情景状态（单情景，无过渡） ──────────────────────────── */
    get regimeIdx()     { return 0; },
    get prevRegimeIdx() { return 0; },
    get regimeBlend()   { return 1; },

    /* ── 天鹅状态（无天鹅） ──────────────────────────────────── */
    get swanLevel()   { return 0; },
    get swanTOffset() { return 0; },

    /* ── S/R（无） ───────────────────────────────────────────── */
    get srEmaValues()   { return _EMPTY_MAP; },
    get srPrevSide()    { return _EMPTY_MAP; },
    get srBreakDrift()  { return 0; },
    set srBreakDrift(v) { /* no-op */ },

    updateSREMA(price) { /* no-op */ },

    /* ════════════════════════════════════════════════════════════
       applyN(simN)
       切换 simN 时重新计算每 tick 衰减系数。
    ════════════════════════════════════════════════════════════ */
    applyN(simN) {
      _oppDecayPerTick = Math.pow(CONFIG.PRESSURE_DECAY, 1 / simN);
      MEAN_REV_SLOW_K  = 2 / (MEAN_REV_SLOW_T * simN + 1);
      MEAN_REV_EMA_K   = 2 / (MEAN_REV_LONG_T  * simN + 1);
    },

    /* ════════════════════════════════════════════════════════════
       reset(simN)
       完整重置引擎状态。
    ════════════════════════════════════════════════════════════ */
    reset(simN) {
      mu_t             = mu_user;
      sigma_t          = sigma_user;
      longEma          = 0;
      refPrice         = 0;
      _playerPressure  = 0;
      _oppDecayPerTick = Math.pow(CONFIG.PRESSURE_DECAY, 1 / simN);
      MEAN_REV_SLOW_K  = 2 / (MEAN_REV_SLOW_T * simN + 1);
      MEAN_REV_EMA_K   = 2 / (MEAN_REV_LONG_T  * simN + 1);
    },

    /* ════════════════════════════════════════════════════════════
       notifyTrade(direction, shares)
       由 MarketHub 在玩家下单时注入信号。
         direction : +1 = 买入（做多）→ 施加向下压力（负值）
                     -1 = 卖出（做空）→ 施加向上压力（正值）
    ════════════════════════════════════════════════════════════ */
    notifyTrade(direction, shares) {
      /* 买入 → 压力为负（market 下行），卖出 → 压力为正（market 上行） */
      _playerPressure -= direction * CONFIG.FORCE_BASE;
      /* 限幅：防止连续操作无限累积 */
      if (_playerPressure >  CONFIG.PRESSURE_MAX)  _playerPressure =  CONFIG.PRESSURE_MAX;
      if (_playerPressure < -CONFIG.PRESSURE_MAX)  _playerPressure = -CONFIG.PRESSURE_MAX;
    },

    /* ════════════════════════════════════════════════════════════
       stepPriceCore(currentPrice, totalTicks, simN, dt, normalRandom)
       每 tick 价格计算核心：
         ① Heston-lite vol/drift OU（含杠杆效应）
         ② 长期均值回归力
         ③ 玩家压力衰减 + 施加
         ④ GBM 价格更新
         ⑤ EMA 更新
         ⑥ 成交量估算

       返回 { newPrice, swanEffect, relVol }
    ════════════════════════════════════════════════════════════ */
    stepPriceCore(currentPrice, totalTicks, simN, dt, normalRandom) {
      const sqDt   = Math.sqrt(dt);
      const sigMax = sigma_user * CONFIG.SIGMA_MAX_MULT;
      const sigMin = sigma_user * CONFIG.SIGMA_MIN_MULT;

      /* ① 随机参数 OU（Heston-lite + 杠杆效应 Cholesky） */
      const W1 = normalRandom();
      const W2 = CONFIG.LEVERAGE_RHO * W1 + LEVERAGE_SQRT1RHO2 * normalRandom();

      sigma_t = Math.max(sigMin, Math.min(sigMax,
        sigma_t + CONFIG.VOL_KAPPA  * (sigma_user - sigma_t) * dt
                + CONFIG.VOL_OF_VOL * sigma_t * W2 * sqDt
      ));
      mu_t = Math.max(-CONFIG.DRIFT_CLAMP, Math.min(CONFIG.DRIFT_CLAMP,
        mu_t + CONFIG.DRIFT_KAPPA * (mu_user - mu_t) * dt
             + CONFIG.DRIFT_VOL   * normalRandom()   * sqDt
      ));

      /* ② 长期均值回归力（连续 OU，dt 含 1/simN，天然 N 无关） */
      let meanRevForce = 0;
      if (refPrice > 0) {
        const logDev = Math.log(currentPrice / refPrice);
        const noise  = CONFIG.MEAN_REV_NOISE * (Math.random() * 2 - 1);
        meanRevForce = -CONFIG.MEAN_REV_KAPPA0 * (1 + noise) * logDev * dt;
      }

      /* ③ 玩家压力：每 tick 衰减，÷simN 转换为 per-tick 力，
         保证 N ticks（1 T）内累计施力不随 simN 变化 */
      _playerPressure *= _oppDecayPerTick;
      const pressureForce = _playerPressure / simN;

      /* ④ GBM 价格更新 */
      const drift     = mu_t - 0.5 * sigma_t * sigma_t;
      const diffusion = sigma_t * sqDt * W1;
      let newPrice = currentPrice * Math.exp(
        drift * dt + diffusion + meanRevForce + pressureForce
      );
      if (newPrice < 0.01) newPrice = 0.01;

      /* ⑤ EMA 更新（longEma 供 HUD；refPrice 作 OU 锚） */
      longEma  = longEma  === 0 ? newPrice : longEma  + MEAN_REV_EMA_K  * (newPrice - longEma);
      refPrice = refPrice === 0 ? newPrice : refPrice + MEAN_REV_SLOW_K * (newPrice - refPrice);

      /* ⑥ 成交量：归一化分母用 sigma_user（基准期望），使价格变动因子与波动率水平解耦 */
      const absReturn         = Math.abs(Math.log(newPrice / currentPrice));
      const priceChangeFactor = 1 + CONFIG.VOL_PRICE_FACTOR * absReturn
                                    / Math.max(sigma_user * sqDt, 1e-6);
      const relVol = (sigma_t / Math.max(sigma_user, 0.001))
                     * Math.min(priceChangeFactor, CONFIG.VOL_CAP)
                     * (CONFIG.VOL_NOISE_MIN + CONFIG.VOL_NOISE_RANGE * Math.random());

      return { newPrice, swanEffect: _noSwan, relVol };
    },

    /* ════════════════════════════════════════════════════════════
       warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume)
       预热 WARMUP_T×simN 个 tick，同 OrdinaryMarketEngine 逻辑对齐。
    ════════════════════════════════════════════════════════════ */
    warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume) {
      const initLen = WARMUP_T * simN;
      const sqDt    = Math.sqrt(dt);
      let p = 100;

      for (let i = 0; i < initLen; i++) {
        const open = p;
        const { newPrice, relVol } = this.stepPriceCore(p, i, simN, dt, normalRandom);
        p = newPrice;
        const micro = sigma_t * sqDt * Math.random();
        outOhlc.push({
          o: open,
          h: Math.max(open, p) * (1 + micro),
          l: Math.max(0.01, Math.min(open, p) * (1 - micro)),
          c: p,
        });
        outPrice.push(p);
        outVolume.push(relVol);
      }

      return p;
    },
  };

})();
