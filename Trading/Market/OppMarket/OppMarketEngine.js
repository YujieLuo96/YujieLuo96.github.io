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
        - 每 tick 按 OPP_DECAY^(1/N) 指数衰减

   完全自包含，无外部依赖。
   挂载为 window.OppMarketEngine，接口与 OrdinaryMarketEngine 完全兼容。
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     逆压力参数
  ══════════════════════════════════════════════════════════════ */
  /** 单次交易注入的压力量级（年化 log-return 单位，即每 T 施加的对数收益偏置）
      值 0.10 意味着：一次下单后，若压力未衰减，每 T 价格约受 ±10% 对数偏移。
      实际压力会立即开始衰减，单次操作的累积影响远小于此上限。 */
  const OPP_FORCE_BASE   = 0.10;

  /** 玩家压力每 T 的衰减系数（0.78 → 半衰期约 2.8 T）
      越小衰减越快，市场"记住"玩家操作的时间越短。 */
  const OPP_PRESSURE_DECAY = 0.78;

  /** 压力绝对值上限（防止连续操作无限累积） */
  const OPP_PRESSURE_MAX = 0.45;

  /* ══════════════════════════════════════════════════════════════
     随机过程参数（Heston-lite OU）
  ══════════════════════════════════════════════════════════════ */
  const VOL_KAPPA          = 1.5;    // sigma_t 均值回归速度
  const VOL_OF_VOL         = 0.40;   // vol-of-vol
  const DRIFT_KAPPA        = 0.6;    // mu_t 均值回归速度
  const DRIFT_VOL          = 0.12;   // mu_t 随机扰动强度
  const LEVERAGE_RHO       = -0.55;  // 价格-波动率相关系数
  const LEVERAGE_SQRT1RHO2 = Math.sqrt(1 - 0.55 * 0.55);  // ≈ 0.8352

  /* ══════════════════════════════════════════════════════════════
     长期均值回归（OU 锚）
  ══════════════════════════════════════════════════════════════ */
  const MEAN_REV_KAPPA0  = 0.20;      // 年化 OU 回归速度
  const MEAN_REV_NOISE   = 0.10;      // ±10% kappa 随机扰动
  const MEAN_REV_SLOW_K  = 2 / 20001; // refPrice 超慢 EMA（≈5000T 收敛）
  const MEAN_REV_EMA_K   = 2 / 201;   // longEma 200T EMA（HUD 显示）

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
  let mu_user    = 0.08;
  let sigma_user = 0.25;
  let mu_t       = 0.08;
  let sigma_t    = 0.25;
  let longEma    = 0;
  let refPrice   = 0;

  /** 玩家压力积累器（负 = 下行压力，正 = 上行压力） */
  let _playerPressure        = 0;
  let _oppDecayPerTick       = Math.pow(OPP_PRESSURE_DECAY, 1 / 4);

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
    get srEmaValues()  { return _EMPTY_MAP; },
    get srPrevSide()   { return _EMPTY_MAP; },
    get srBreakDrift() { return 0; },
    set srBreakDrift(v) { /* no-op */ },

    updateSREMA(price) { /* no-op */ },

    /* ════════════════════════════════════════════════════════════
       applyN(simN)
       切换 simN 时重新计算每 tick 衰减系数。
    ════════════════════════════════════════════════════════════ */
    applyN(simN) {
      _oppDecayPerTick = Math.pow(OPP_PRESSURE_DECAY, 1 / simN);
    },

    /* ════════════════════════════════════════════════════════════
       reset(simN)
       完整重置引擎状态。
    ════════════════════════════════════════════════════════════ */
    reset(simN) {
      mu_t            = mu_user;
      sigma_t         = sigma_user;
      longEma         = 0;
      refPrice        = 0;
      _playerPressure = 0;
      _oppDecayPerTick = Math.pow(OPP_PRESSURE_DECAY, 1 / simN);
    },

    /* ════════════════════════════════════════════════════════════
       notifyTrade(direction, shares)
       由 MarketHub 在玩家下单时注入信号。
         direction : +1 = 买入（做多）→ 施加向下压力（负值）
                     -1 = 卖出（做空）→ 施加向上压力（正值）
         shares    : 交易数量（当前实现中固定施加基准压力，
                     可按需改为与 shares 比例挂钩）
    ════════════════════════════════════════════════════════════ */
    notifyTrade(direction, shares) {
      /* 买入 → 压力为负（market 下行），卖出 → 压力为正（market 上行） */
      _playerPressure -= direction * OPP_FORCE_BASE;
      /* 限幅：防止连续操作无限累积 */
      if (_playerPressure >  OPP_PRESSURE_MAX)  _playerPressure =  OPP_PRESSURE_MAX;
      if (_playerPressure < -OPP_PRESSURE_MAX)  _playerPressure = -OPP_PRESSURE_MAX;
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
      const sigMax = sigma_user * 2.0;
      const sigMin = sigma_user * 0.25;

      /* ① 随机参数 OU（Heston-lite + 杠杆效应 Cholesky） */
      const W1 = normalRandom();
      const W2 = LEVERAGE_RHO * W1 + LEVERAGE_SQRT1RHO2 * normalRandom();

      sigma_t = Math.max(sigMin, Math.min(sigMax,
        sigma_t + VOL_KAPPA  * (sigma_user - sigma_t) * dt
                + VOL_OF_VOL * sigma_t * W2 * sqDt
      ));
      mu_t = Math.max(-0.8, Math.min(0.8,
        mu_t + DRIFT_KAPPA * (mu_user - mu_t) * dt
             + DRIFT_VOL   * normalRandom()   * sqDt
      ));

      /* ② 长期均值回归力（连续 OU，dt 含 1/simN，天然 N 无关） */
      let meanRevForce = 0;
      if (refPrice > 0) {
        const logDev = Math.log(currentPrice / refPrice);
        const noise  = MEAN_REV_NOISE * (Math.random() * 2 - 1);
        meanRevForce = -MEAN_REV_KAPPA0 * (1 + noise) * logDev * dt;
      }

      /* ③ 玩家压力：每 tick 衰减，每 T 施加总压力恒为 _playerPressure
         ÷simN 转换为 per-tick 力，保证 N ticks（1 T）内累计施力不随 simN 变化 */
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

      /* ⑥ 相对成交量估算（与价格变动正相关） */
      const absReturn         = Math.abs(Math.log(newPrice / currentPrice));
      const priceChangeFactor = Math.min(1 + 3 * absReturn / Math.max(sigma_t * sqDt, 1e-6), 4);
      const relVol = (sigma_t / Math.max(sigma_user, 0.001))
                     * priceChangeFactor
                     * (0.55 + 0.45 * Math.random());

      return { newPrice, swanEffect: _noSwan, relVol };
    },

    /* ════════════════════════════════════════════════════════════
       warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume)
       预热 6000×simN 个 tick，同 OrdinaryMarketEngine 逻辑对齐。
    ════════════════════════════════════════════════════════════ */
    warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume) {
      const initLen = 6000 * simN;
      let p = 100;

      for (let i = 0; i < initLen; i++) {
        const open = p;
        const { newPrice, relVol } = this.stepPriceCore(p, i, simN, dt, normalRandom);
        p = newPrice;
        const micro = sigma_t * 0.25 * Math.random();
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
