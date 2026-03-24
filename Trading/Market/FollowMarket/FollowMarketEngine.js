/* ═══════════════════════════════════════════════════════════════════
   FollowMarket/FollowMarketEngine.js  — 顺玩家市场引擎

   设计宗旨：跟随玩家操作方向顺势运动。
     · 玩家买入（做多）→ 市场承受向上作用力
     · 玩家卖出（做空）→ 市场承受向下作用力

   核心机制：
     ① 基础 GBM（含 Heston-lite vol/drift OU 过程 + 杠杆效应）
     ② 长期均值回归（连续 OU，防止价格无限漂移）
     ③ 玩家顺势压力积累器（_playerPressure）
        - notifyTrade(direction, shares) 由 MarketHub 在玩家下单时注入
        - 每次买入追加正压力（向上），每次卖出追加负压力（向下）
        - 每 tick 按 FOLLOW_DECAY^(1/N) 指数衰减

   完全自包含，无外部依赖。
   挂载为 window.FollowMarketEngine，接口与 OrdinaryMarketEngine 完全兼容。
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     顺势压力参数
  ══════════════════════════════════════════════════════════════ */
  /** 单次交易注入的压力量级（年化 log-return 单位） */
  const FOLLOW_FORCE_BASE   = 0.10;

  /** 玩家压力每 T 的衰减系数（0.78 → 半衰期约 2.8 T） */
  const FOLLOW_PRESSURE_DECAY = 0.78;

  /** 压力绝对值上限 */
  const FOLLOW_PRESSURE_MAX = 0.45;

  /* ══════════════════════════════════════════════════════════════
     随机过程参数（Heston-lite OU）
  ══════════════════════════════════════════════════════════════ */
  const VOL_KAPPA          = 1.5;
  const VOL_OF_VOL         = 0.40;
  const DRIFT_KAPPA        = 0.6;
  const DRIFT_VOL          = 0.12;
  const LEVERAGE_RHO       = -0.55;
  const LEVERAGE_SQRT1RHO2 = Math.sqrt(1 - 0.55 * 0.55);  // ≈ 0.8352

  /* ══════════════════════════════════════════════════════════════
     长期均值回归（OU 锚）
  ══════════════════════════════════════════════════════════════ */
  const MEAN_REV_KAPPA0  = 0.20;
  const MEAN_REV_NOISE   = 0.10;
  const MEAN_REV_SLOW_K  = 2 / 20001;
  const MEAN_REV_EMA_K   = 2 / 201;

  /* ══════════════════════════════════════════════════════════════
     虚拟情景定义（单情景，供 HUD / 图表兼容）
  ══════════════════════════════════════════════════════════════ */
  const REGIMES = [
    {
      name: 'FOLLOW', color: '#39ff14',
      muMult: 1, muAdd: 0, sigMult: 1, jumpMult: 0, sigCap: 2, meanRevMult: 0.5,
    },
  ];

  const _EMPTY_MAP = new Map();

  /* ══════════════════════════════════════════════════════════════
     引擎状态（闭包隔离）
  ══════════════════════════════════════════════════════════════ */
  let mu_user    = 0.08;
  let sigma_user = 0.25;
  let mu_t       = 0.08;
  let sigma_t    = 0.25;
  let longEma    = 0;
  let refPrice   = 0;

  /** 玩家顺势压力（正 = 上行，负 = 下行） */
  let _playerPressure     = 0;
  let _followDecayPerTick = Math.pow(FOLLOW_PRESSURE_DECAY, 1 / 4);

  const _noSwan = {
    changed: false, swanLevel: 0,
    swanVolScale: 1, swanDriftAdd: 0,
    swanGap: 0, swanVolBoost: 1,
  };

  /* ══════════════════════════════════════════════════════════════
     公开 API
  ══════════════════════════════════════════════════════════════ */
  window.FollowMarketEngine = {

    get REGIMES()    { return REGIMES; },
    get JUMP_PROB()  { return 0; },
    get JUMP_MEAN()  { return 0; },
    get JUMP_STD()   { return 0; },
    get SR_PERIODS() { return []; },

    get mu_user()    { return mu_user; },    set mu_user(v)    { mu_user = v; },
    get sigma_user() { return sigma_user; }, set sigma_user(v) { sigma_user = v; },

    get mu_base()           { return mu_user; },
    get sigma_base()        { return sigma_user; },
    get mu_t()              { return mu_t; },
    get sigma_t()           { return sigma_t; },
    get effectiveJumpProb() { return 0; },
    get longEma()           { return longEma; },
    get refPrice()          { return refPrice; },

    get regimeIdx()     { return 0; },
    get prevRegimeIdx() { return 0; },
    get regimeBlend()   { return 1; },

    get swanLevel()   { return 0; },
    get swanTOffset() { return 0; },

    get srEmaValues()   { return _EMPTY_MAP; },
    get srPrevSide()    { return _EMPTY_MAP; },
    get srBreakDrift()  { return 0; },
    set srBreakDrift(v) { /* no-op */ },

    updateSREMA(price) { /* no-op */ },

    applyN(simN) {
      _followDecayPerTick = Math.pow(FOLLOW_PRESSURE_DECAY, 1 / simN);
    },

    reset(simN) {
      mu_t               = mu_user;
      sigma_t            = sigma_user;
      longEma            = 0;
      refPrice           = 0;
      _playerPressure    = 0;
      _followDecayPerTick = Math.pow(FOLLOW_PRESSURE_DECAY, 1 / simN);
    },

    /* ════════════════════════════════════════════════════════════
       notifyTrade(direction, shares)
         direction : +1 = 买入（做多）→ 施加向上压力（正值）
                     -1 = 卖出（做空）→ 施加向下压力（负值）
    ════════════════════════════════════════════════════════════ */
    notifyTrade(direction, shares) {
      /* 顺势：与 OppMarket 符号相反 */
      _playerPressure += direction * FOLLOW_FORCE_BASE;
      if (_playerPressure >  FOLLOW_PRESSURE_MAX)  _playerPressure =  FOLLOW_PRESSURE_MAX;
      if (_playerPressure < -FOLLOW_PRESSURE_MAX)  _playerPressure = -FOLLOW_PRESSURE_MAX;
    },

    stepPriceCore(currentPrice, totalTicks, simN, dt, normalRandom) {
      const sqDt   = Math.sqrt(dt);
      const sigMax = sigma_user * 2.0;
      const sigMin = sigma_user * 0.25;

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

      let meanRevForce = 0;
      if (refPrice > 0) {
        const logDev = Math.log(currentPrice / refPrice);
        const noise  = MEAN_REV_NOISE * (Math.random() * 2 - 1);
        meanRevForce = -MEAN_REV_KAPPA0 * (1 + noise) * logDev * dt;
      }

      /* 顺势压力：÷simN 保证 N 无关性 */
      _playerPressure *= _followDecayPerTick;
      const pressureForce = _playerPressure / simN;

      const drift     = mu_t - 0.5 * sigma_t * sigma_t;
      const diffusion = sigma_t * sqDt * W1;
      let newPrice = currentPrice * Math.exp(
        drift * dt + diffusion + meanRevForce + pressureForce
      );
      if (newPrice < 0.01) newPrice = 0.01;

      longEma  = longEma  === 0 ? newPrice : longEma  + MEAN_REV_EMA_K  * (newPrice - longEma);
      refPrice = refPrice === 0 ? newPrice : refPrice + MEAN_REV_SLOW_K * (newPrice - refPrice);

      const absReturn         = Math.abs(Math.log(newPrice / currentPrice));
      const priceChangeFactor = Math.min(1 + 3 * absReturn / Math.max(sigma_t * sqDt, 1e-6), 4);
      const relVol = (sigma_t / Math.max(sigma_user, 0.001))
                     * priceChangeFactor
                     * (0.55 + 0.45 * Math.random());

      return { newPrice, swanEffect: _noSwan, relVol };
    },

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
