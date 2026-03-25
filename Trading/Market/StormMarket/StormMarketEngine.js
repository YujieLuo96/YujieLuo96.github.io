/* ═══════════════════════════════════════════════════════════════════
   StormMarket/StormMarketEngine.js  — 风暴市场引擎

   设计宗旨：一切涨跌趋于极端与无序。
     · 底噪波动率是普通市场的 3 倍
     · 超高 vol-of-vol：波动率本身会剧烈聚类，平静→暴风毫无征兆
     · 频繁双向大跳跃：上下对称，没有方向性偏见，纯粹混乱
     · 动量放大器：趋势不会被修正，而是被持续加速（正反馈）
     · 几乎无均值回归：价格可以无限制地远离锚点
     · 跳跃聚类：一次大跳后，后续更易连环爆发
     · 肥尾极化：极端事件出现频率远高于正态分布

   完全自包含，无外部依赖。
   挂载为 window.StormMarketEngine，接口与 OrdinaryMarketEngine 完全兼容。
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 全局配置（MarketConfig.js 须先加载） ── */
  const { SIM_N_DEFAULT, MEAN_REV_SLOW_T, MEAN_REV_LONG_T, WARMUP_T } = window.MarketConfig;

  /* ══════════════════════════════════════════════════════════════
     引擎参数配置（所有硬编码常量集中于此，分组管理）
  ══════════════════════════════════════════════════════════════ */
  const CONFIG = {

    /* ── 波动率放大 ──────────────────────────────────────────── */
    SIGMA_MULT:     3.5,   // sigma_user × 此值 = 实际基础 sigma（底噪约 3.5 倍）
    SIGMA_CAP:      5.0,   // sigma_t 上限倍数（sigma_user × 此值）
    SIGMA_MIN_MULT: 0.20,  // sigma_t 下限倍数（风暴中"平静期"仍保持最低噪声）

    /* ── Heston-style OU：vol / drift 随机过程 ──────────────── */
    VOL_OF_VOL:  2.2,  // vol-of-vol（普通市场约 0.40；风暴 2.2 → 数 tick 内从平静飙至极端）
    VOL_KAPPA:   0.8,  // sigma_t 均值回归速度（越小极端状态持续越久）
    DRIFT_KAPPA: 0.4,  // mu_t 均值回归速度（高随机性，漂移方向频繁翻转）
    DRIFT_VOL:   0.18, // mu_t 随机扰动强度（从 0.25 降低，防漂移长时间锁定在极负值）
    DRIFT_CLAMP: 1.2,  // mu_t 截断范围 ±DRIFT_CLAMP

    /* ── 杠杆效应（减弱，风暴中价格与波动率关联更低，更无序）── */
    LEVERAGE_RHO: -0.30,  // 价格-波动率相关系数

    /* ── 跳跃扩散 ────────────────────────────────────────────── */
    JUMP_PROB: 0.18,   // 每 T（天）基础跳跃概率（普通市场 0.018；约每 5-6 T 必有跳跃）
    JUMP_MEAN: 0,      // 跳跃均值为 0：上下对称，没有方向偏见，纯粹随机混乱
    JUMP_STD:  0.18,   // 跳跃标准差（普通市场 0.06；风暴 0.18 → 单次可达 ±18%+）

    /* ── 跳跃聚类 ────────────────────────────────────────────── */
    JUMP_CLUSTER_BOOST: 0.20,  // 单次跳跃后后续爆发概率暴增此量
    JUMP_CLUSTER_DECAY: 0.65,  // 每 T（天）衰减；半衰期约 1.7 天，余震高度集中
    JUMP_CLUSTER_MAX:   0.40,  // 聚类概率上限（per-T）

    /* ── 肥尾放大器 ──────────────────────────────────────────── */
    FAT_TAIL_PROB:  0.35,  // 触发概率（普通市场 0.12；每 3 次跳跃约 1 次触发肥尾）
    FAT_TAIL_SCALE: 0.25,  // 指数分布均值（普通市场 0.08；风暴 0.25）

    /* ── 动量放大器（正反馈：趋势加速，与普通市场动量反转方向相反）*/
    MOMENTUM_AMP:    0.005, // 顺势最大额外推力（per-T）
    MOMENTUM_DECAY:  0.88,  // 每 T 衰减；越大信号记忆越短 → 随机翻转越频繁
    MOMENTUM_THRESH: 0.8,   // 连续单向运动 T 数超过此值后激活放大器

    /* ── 均值回归（极弱，仅防止无限漂移）──────────────────────── */
    MEAN_REV_KAPPA: 0.06,  // 年化 OU 回归速度（风暴极弱，普通市场 0.25）
    MEAN_REV_NOISE: 0.30,  // kappa 随机噪声幅度（±30%，让仅有的回归力也充满不确定性）

    /* ── 软地板保护（防死亡螺旋）───────────────────────────────── */
    FLOOR_RATIO: 0.20,  // 价格低于 refPrice × 此值时触发（refPrice 的 20% 以下）
    FLOOR_KAPPA: 1.20,  // 软地板拉力强度（大于均值回归，足以逆转死亡螺旋）

    /* ── 成交量模型 ──────────────────────────────────────────── *
       归一化分母用 sigma_user（基准期望），与 sigma_t/sigma_user 因子解耦：
       · sigma_t/sigma_user  — 波动率水平对量能的贡献
       · priceChangeFactor   — 本 tick 相对于"正常日内波动"的异常程度
       风暴市场：斜率更大（5），上限更高（12），量能极端               */
    VOL_PRICE_FACTOR: 5,    // priceChangeFactor 斜率系数
    VOL_CAP:         12,    // priceChangeFactor 上限（从 8 提高到 12）
    VOL_NOISE_MIN:   0.55,  // 随机噪声下界
    VOL_NOISE_RANGE: 0.45,  // 随机噪声范围（上界 = MIN + RANGE = 1.0）
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
      name: 'STORM', color: '#f5e642',
      muMult: 1, muAdd: 0, sigMult: CONFIG.SIGMA_MULT, jumpMult: 6,
      sigCap: CONFIG.SIGMA_CAP, meanRevMult: 0.08,
    },
  ];

  const _EMPTY_MAP = new Map();

  /* ══════════════════════════════════════════════════════════════
     引擎状态（闭包隔离）
  ══════════════════════════════════════════════════════════════ */
  let mu_user    = window.MarketConfig.MU_DEFAULT;
  let sigma_user = window.MarketConfig.SIGMA_DEFAULT;
  let mu_t       = window.MarketConfig.MU_DEFAULT;
  let sigma_t    = 0.25;
  let longEma    = 0;
  let refPrice   = 0;

  let jumpCluster             = 0;
  let momentumScore           = 0;
  let _clusterDecayPerTick    = Math.pow(CONFIG.JUMP_CLUSTER_DECAY, 1 / SIM_N_DEFAULT);
  let _momentumDecayPerTick   = Math.pow(CONFIG.MOMENTUM_DECAY,     1 / SIM_N_DEFAULT);

  const _noSwan = {
    changed: false, swanLevel: 0,
    swanVolScale: 1, swanDriftAdd: 0,
    swanGap: 0, swanVolBoost: 1,
  };

  /* ══════════════════════════════════════════════════════════════
     公开 API
  ══════════════════════════════════════════════════════════════ */
  window.StormMarketEngine = {

    get REGIMES()    { return REGIMES; },
    get JUMP_PROB()  { return CONFIG.JUMP_PROB; },
    get JUMP_MEAN()  { return CONFIG.JUMP_MEAN; },
    get JUMP_STD()   { return CONFIG.JUMP_STD; },
    get SR_PERIODS() { return []; },

    get mu_user()    { return mu_user; },    set mu_user(v)    { mu_user = v; },
    get sigma_user() { return sigma_user; }, set sigma_user(v) { sigma_user = v; },

    get mu_base()           { return mu_user; },
    get sigma_base()        { return sigma_user * CONFIG.SIGMA_MULT; },
    get mu_t()              { return mu_t; },
    get sigma_t()           { return sigma_t; },
    get effectiveJumpProb() { return CONFIG.JUMP_PROB; },
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
      _clusterDecayPerTick  = Math.pow(CONFIG.JUMP_CLUSTER_DECAY, 1 / simN);
      _momentumDecayPerTick = Math.pow(CONFIG.MOMENTUM_DECAY,     1 / simN);
      MEAN_REV_SLOW_K       = 2 / (MEAN_REV_SLOW_T * simN + 1);
      MEAN_REV_EMA_K        = 2 / (MEAN_REV_LONG_T  * simN + 1);
    },

    reset(simN) {
      /* 初始 sigma_t 就设为放大后的基准，避免 warmup 前期过于平静 */
      mu_t          = mu_user;
      sigma_t       = sigma_user * CONFIG.SIGMA_MULT;
      longEma       = 0;
      refPrice      = 0;
      jumpCluster   = 0;
      momentumScore = 0;
      _clusterDecayPerTick  = Math.pow(CONFIG.JUMP_CLUSTER_DECAY, 1 / simN);
      _momentumDecayPerTick = Math.pow(CONFIG.MOMENTUM_DECAY,     1 / simN);
      MEAN_REV_SLOW_K       = 2 / (MEAN_REV_SLOW_T * simN + 1);
      MEAN_REV_EMA_K        = 2 / (MEAN_REV_LONG_T  * simN + 1);
    },

    /* notifyTrade：风暴市场不受玩家信号影响，保持纯随机混乱 */
    notifyTrade(direction, shares) { /* no-op */ },

    /* ════════════════════════════════════════════════════════════
       stepPriceCore
       每 tick 价格计算核心：
         ① 超高 Vol-of-Vol OU（波动率剧烈聚类 + 杠杆效应弱化）
         ② Drift OU（高随机性）
         ③ 跳跃扩散（频繁 + 大幅 + 聚类 + 肥尾）
         ④ 动量放大器（正反馈，趋势加速）
         ⑤ 极弱均值回归 + 软地板保护
         ⑥ GBM 价格更新
         ⑦ EMA 更新 + 成交量估算
    ════════════════════════════════════════════════════════════ */
    stepPriceCore(currentPrice, totalTicks, simN, dt, normalRandom) {
      const sqDt    = Math.sqrt(dt);
      const sigBase = sigma_user * CONFIG.SIGMA_MULT;
      const sigMax  = sigma_user * CONFIG.SIGMA_CAP;
      const sigMin  = sigma_user * CONFIG.SIGMA_MIN_MULT;

      /* ① 超高 Vol-of-Vol OU（杠杆效应弱化，更无序）*/
      const W1 = normalRandom();
      const W2 = CONFIG.LEVERAGE_RHO * W1 + LEVERAGE_SQRT1RHO2 * normalRandom();

      sigma_t = Math.max(sigMin, Math.min(sigMax,
        sigma_t + CONFIG.VOL_KAPPA  * (sigBase - sigma_t) * dt
                + CONFIG.VOL_OF_VOL * sigma_t * W2 * sqDt
      ));

      /* ② Drift OU（高随机扰动，漂移方向频繁翻转） */
      mu_t = Math.max(-CONFIG.DRIFT_CLAMP, Math.min(CONFIG.DRIFT_CLAMP,
        mu_t + CONFIG.DRIFT_KAPPA * (mu_user - mu_t) * dt
             + CONFIG.DRIFT_VOL   * normalRandom()   * sqDt
      ));

      /* ③ 跳跃扩散（聚类 + 肥尾）
         jumpCluster 以 per-T 概率单位存储，÷simN 换算 per-tick */
      jumpCluster *= _clusterDecayPerTick;
      const totalJumpProb = (CONFIG.JUMP_PROB + jumpCluster) / simN;

      let jump = 0;
      if (Math.random() < totalJumpProb) {
        const volRatio = sigma_t / Math.max(sigma_user, 0.001);
        jump = CONFIG.JUMP_MEAN + CONFIG.JUMP_STD * volRatio * normalRandom();

        /* 肥尾放大：上下均等（50/50），风暴中无方向偏见 */
        if (Math.random() < CONFIG.FAT_TAIL_PROB) {
          const tailMag = -Math.log(1 - Math.random()) * CONFIG.FAT_TAIL_SCALE;
          jump += (Math.random() < 0.5 ? 1 : -1) * tailMag;
        }

        /* 聚类增益：跳跃后后续爆发概率暴增 */
        jumpCluster += CONFIG.JUMP_CLUSTER_BOOST;
        if (jumpCluster > CONFIG.JUMP_CLUSTER_MAX) jumpCluster = CONFIG.JUMP_CLUSTER_MAX;
      }

      /* ④ 动量放大器（正反馈：顺势加速，而非普通市场的反转）
         ── Ito 修正：使用固定基准 sigBase 而非瞬时 sigma_t ──────────────
         标准 GBM 的 drift = mu_t - 0.5·sigma_t²；当 sigma_t 飙至极端（如 1.5）
         时，Ito 修正项达 -1.125/T，即使 mu_t > 0 价格也会系统性向 0 坍塌。
         改为锚定在 sigBase²：波动率仍然极端，但不再携带系统性下行偏移。 */
      const drift     = mu_t - 0.5 * sigBase * sigBase;
      const diffusion = sigma_t * sqDt * W1;  // diffusion 仍用 sigma_t，保留极端振幅
      const rawLogRet = drift * dt + diffusion + jump;

      momentumScore = momentumScore * _momentumDecayPerTick + Math.sign(rawLogRet) / simN;
      let momentumForce = 0;
      const absMomentum = Math.abs(momentumScore);
      if (absMomentum > CONFIG.MOMENTUM_THRESH) {
        /* 同向放大（+号，而非普通市场的 -号） */
        momentumForce = Math.sign(momentumScore) * (CONFIG.MOMENTUM_AMP / simN)
                        * Math.min(1, (absMomentum - CONFIG.MOMENTUM_THRESH) / CONFIG.MOMENTUM_THRESH);
      }

      /* ⑤ 均值回归 + 软地板保护 */
      let meanRevForce = 0;
      if (refPrice > 0) {
        const logDev = Math.log(currentPrice / refPrice);
        const noise  = CONFIG.MEAN_REV_NOISE * (Math.random() * 2 - 1);
        /* 基础回归（极弱，仅防止无限漂移） */
        meanRevForce = -CONFIG.MEAN_REV_KAPPA * (1 + noise) * logDev * dt;

        /* 软地板：价格跌破 refPrice × FLOOR_RATIO 时，额外强力向上拉
           力度随偏离程度线性增大，彻底打断死亡螺旋，不影响正常波动范围 */
        const floorThresh = Math.log(CONFIG.FLOOR_RATIO);  // ≈ -1.609
        if (logDev < floorThresh) {
          meanRevForce += -CONFIG.FLOOR_KAPPA * (logDev - floorThresh) * dt;
        }
      }

      /* ⑥ GBM 价格更新 */
      let newPrice = currentPrice * Math.exp(
        rawLogRet + momentumForce + meanRevForce
      );
      if (newPrice < 0.01) newPrice = 0.01;

      /* ⑦ EMA 更新 */
      longEma  = longEma  === 0 ? newPrice : longEma  + MEAN_REV_EMA_K  * (newPrice - longEma);
      refPrice = refPrice === 0 ? newPrice : refPrice + MEAN_REV_SLOW_K * (newPrice - refPrice);

      /* 成交量：归一化分母用 sigma_user（基准期望），与 sigma_t/sigma_user 因子解耦。
         风暴市场斜率更大（5），上限更高（12），量能极端                           */
      const absReturn         = Math.abs(Math.log(newPrice / currentPrice));
      const priceChangeFactor = 1 + CONFIG.VOL_PRICE_FACTOR * absReturn
                                    / Math.max(sigma_user * sqDt, 1e-6);
      const relVol = (sigma_t / Math.max(sigma_user, 0.001))
                     * Math.min(priceChangeFactor, CONFIG.VOL_CAP)
                     * (CONFIG.VOL_NOISE_MIN + CONFIG.VOL_NOISE_RANGE * Math.random());

      return { newPrice, swanEffect: _noSwan, relVol };
    },

    warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume) {
      const initLen = WARMUP_T * simN;
      let p = 100;

      const sqDt = Math.sqrt(dt);
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
