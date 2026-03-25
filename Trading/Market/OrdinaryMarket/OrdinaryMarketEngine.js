/* ═══════════════════════════════════════════════════════════════════
   Market/MarketEngine.js  — 市场价格模型协调器
   整合三个子引擎：RegimeEngine / SwanEngine / SREngine
   在此基础上实现增强特性：
     ① 情景感知的 sigma_t 动态上界（熊市 / V.BULL 允许更高波动上限）
     ② 跳跃升级：波动率相关大小 + 跳跃聚类（危机传染）+ 情景方向偏置 + 肥尾放大
     ③ 行为金融动量反转：连续单向运动后施加反向修正力
     ④ 成交量增强：与价格变动幅度正相关
     ⑤ 长期均值回归（OU）：连续 OU 漂移约束，以慢速参考锚（~5000T EMA）为均值，防止价格无限漂移
     ⑥ 杠杆效应（Leverage Effect）：价格与波动率扰动负相关（Cholesky ρ = -0.65）
   挂载为 window.MarketEngine，与原版 API 完全兼容。
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 全局配置（MarketConfig.js 须先加载） ── */
  const { SIM_N_DEFAULT, MEAN_REV_SLOW_T, MEAN_REV_LONG_T, WARMUP_T } = window.MarketConfig;

  /* ── 子引擎快捷引用（三个文件须在本文件之前加载） ── */
  const RE = window.RegimeEngine;
  const SE = window.SwanEngine;
  const SR = window.SREngine;

  /* ══════════════════════════════════════════════════════════════
     引擎参数配置（所有硬编码常量集中于此，分组管理）
  ══════════════════════════════════════════════════════════════ */
  const CONFIG = {

    /* ── Heston-style OU：vol / drift 随机过程 ──────────────── */
    VOL_KAPPA:   2.5,   // sigma_t 均值回归速度
    VOL_OF_VOL:  0.70,  // sigma_t 随机扰动强度（vol-of-vol），波动率聚类程度
    DRIFT_KAPPA: 0.8,   // mu_t 均值回归速度
    DRIFT_VOL:   0.15,  // mu_t 随机扰动强度

    /* ── 杠杆效应（Leverage Effect）────────────────────────────
       价格涨时波动率倾向降低，跌时倾向升高（Cholesky 分解）      */
    LEVERAGE_RHO: -0.65,  // 价格-波动率相关系数

    /* ── 跳跃扩散（Merton Jump-Diffusion）─────────────────────── */
    JUMP_PROB: 0.018,   // 每 T（天）基础跳跃概率（≈6.6次/年），BEAR 约 12次/年
    JUMP_MEAN: 0.000,   // 跳跃均值中性：方向由肥尾/熊市偏置决定，消除系统性负漂移
    JUMP_STD:  0.060,   // 跳跃标准差，单次跳幅适中

    /* ── 跳跃聚类（Jump Clustering）─────────────────────────────
       一次跳跃后短期内概率显著上升，以指数衰减恢复正常             */
    JUMP_CLUSTER_BOOST: 0.07,  // 单次跳跃后聚类概率叠加量（per-T）
    JUMP_CLUSTER_DECAY: 0.78,  // 每 T（天）衰减；半衰期 ≈ 3.9 天
    JUMP_CLUSTER_MAX:   0.18,  // 聚类概率上限（per-T），配合 JUMP_PROB 与 BOOST 校准

    /* ── 跳跃方向偏置（情景感知）────────────────────────────────
       当情景 muAdd < THRESH 时（熊市/阴跌），负跳跃概率额外上升    */
    JUMP_BEAR_THRESH: -0.03,
    JUMP_BEAR_BIAS:    0.006,  // 额外负偏置（JUMP_MEAN=0 时是唯一方向来源）

    /* ── 跳跃肥尾放大器（Fat-tail）─────────────────────────────
       约每 8-9 次跳跃触发一次，75% 向下 / 25% 向上                */
    JUMP_FAT_TAIL_PROB:  0.12,  // 触发概率
    JUMP_FAT_TAIL_SCALE: 0.08,  // 指数分布均值，极端跳幅适中

    /* ── 跳跃参数随机噪声（每次情景切换时重新采样）──────────────
       模拟不同市场周期的跳跃特性变化                               */
    JUMP_NOISE_PROB: 0.30,   // JUMP_PROB 相对乘法噪声
    JUMP_NOISE_MEAN: 0.003,  // JUMP_MEAN 绝对加法噪声
    JUMP_NOISE_STD:  0.20,   // JUMP_STD 相对乘法噪声

    /* ── 行为金融：动量反转（Overreaction & Reversal）───────────
       连续单向运动超过阈值后施加反向修正力                         */
    MOMENTUM_DECAY:  0.92,    // 每 T（天）衰减；半衰期 ≈ 8.3 天
    MOMENTUM_THRESH: 1.5,     // 触发反转力所需最低连续趋势 T 数（N 无关）
    MOMENTUM_FORCE:  0.0020,  // 反转力最大量（per-T）

    /* ── 长期均值回归（OU 过程）─────────────────────────────────
       无阈值连续 OU，以慢速参考锚 refPrice 为均值，noise ±15% 防套利 */
    MEAN_REV_KAPPA0: 0.25,  // 年化 OU 回归速度
    MEAN_REV_NOISE:  0.15,  // kappa 随机噪声幅度（±15%）

    /* ── 随机过程边界 ────────────────────────────────────────── */
    SIGMA_MIN_MULT: 0.30,  // sigMin = sigma_user × 此值
    DRIFT_CLAMP:    0.80,  // mu_t 截断范围 ±DRIFT_CLAMP

    /* ── 成交量模型 ──────────────────────────────────────────── *
       归一化分母用 sigma_user（基准期望），与 sigma_t/sigma_user 因子解耦：
       · sigma_t/sigma_user  — 波动率水平对量能的贡献
       · priceChangeFactor   — 本 tick 相对于"正常日内波动"的异常程度
       两者独立叠加：高波动期的大幅移动产生最高量能，符合市场直觉。
       提高 VOL_CAP 使跳跃事件（~10+σ）在量柱上明显区别于普通波动（~1σ）。*/
    VOL_PRICE_FACTOR: 3,    // priceChangeFactor 斜率系数
    VOL_CAP:         10,    // priceChangeFactor 上限（从 4 提高到 10）
    VOL_NOISE_MIN:   0.55,  // 随机噪声下界
    VOL_NOISE_RANGE: 0.45,  // 随机噪声范围（上界 = MIN + RANGE = 1.0）
  };

  /* ── 杠杆效应 Cholesky 正交分量（由 CONFIG.LEVERAGE_RHO 派生） ── */
  const LEVERAGE_SQRT1RHO2 = Math.sqrt(1 - CONFIG.LEVERAGE_RHO * CONFIG.LEVERAGE_RHO);

  /* ── EMA 系数（applyN / reset 时按 simN 动态重算，保证 T 周期 N 无关） ── */
  let MEAN_REV_SLOW_K = 2 / (MEAN_REV_SLOW_T * SIM_N_DEFAULT + 1);
  let MEAN_REV_EMA_K  = 2 / (MEAN_REV_LONG_T  * SIM_N_DEFAULT + 1);

  /* ══════════════════════════════════════════════════════════════
     用户参数（由 UI 滑块读写）
  ══════════════════════════════════════════════════════════════ */
  let mu_user    = window.MarketConfig.MU_DEFAULT;
  let sigma_user = window.MarketConfig.SIGMA_DEFAULT;

  /* ══════════════════════════════════════════════════════════════
     衍生状态（由 stepRegime 维护）
  ══════════════════════════════════════════════════════════════ */
  let mu_base           = mu_user;
  let sigma_base        = sigma_user;
  let mu_t              = mu_user;
  let sigma_t           = sigma_user;
  let effectiveJumpProb = CONFIG.JUMP_PROB;

  /* ── 内部动态状态 ── */
  let jumpCluster   = 0;   // 当前跳跃聚类残余概率（per-T 概率单位）
  let momentumScore = 0;   // 行为动量累积信号
  let longEma       = 0;   // 200T EMA（HUD 显示，0 = 未初始化）
  let refPrice      = 0;   // OU 均值回归锚（≈5000T 慢速 EMA，0 = 未初始化）

  /* 跳跃参数噪声因子（每次情景切换时由 _resampleJumpNoise 更新） */
  let _jumpProbFactor = 1.0;
  let _jumpMeanOffset = 0.0;
  let _jumpStdFactor  = 1.0;

  /* ── N 相关衍生量（初始值对应默认 simN，由 applyN / reset 维护） ──
     _jumpClusterDecayPerTick = JUMP_CLUSTER_DECAY^(1/N)
       保证 N ticks 后聚类残余的总衰减恒等于 JUMP_CLUSTER_DECAY（每 T 衰减量不变）
     _momentumDecayPerTick    = MOMENTUM_DECAY^(1/N)
       保证动量信号的记忆长度（半衰期）按 T 而非 tick 度量，与 N 无关
  ── */
  let _jumpClusterDecayPerTick = Math.pow(CONFIG.JUMP_CLUSTER_DECAY, 1 / SIM_N_DEFAULT);
  let _momentumDecayPerTick    = Math.pow(CONFIG.MOMENTUM_DECAY,     1 / SIM_N_DEFAULT);

  /* ── 辅助：情景切换时重新采样跳跃参数噪声 ── */
  function _resampleJumpNoise() {
    _jumpProbFactor = Math.max(0.30, 1 + CONFIG.JUMP_NOISE_PROB * (Math.random() * 2 - 1));
    _jumpMeanOffset = CONFIG.JUMP_NOISE_MEAN * (Math.random() * 2 - 1);
    _jumpStdFactor  = Math.max(0.30, 1 + CONFIG.JUMP_NOISE_STD  * (Math.random() * 2 - 1));
  }

  function _syncRegimeDerived() {
    mu_base = Math.max(-0.5, Math.min(0.5,
      mu_user * RE.blend('muMult') + RE.blend('muAdd')));
    sigma_base        = Math.max(0.005, sigma_user * RE.blend('sigMult'));
    effectiveJumpProb = CONFIG.JUMP_PROB * RE.blend('jumpMult');
  }

  /* ════════════════════════════════════════════════════════════
     私有步骤函数（仅供 stepPriceCore 内部按序调用）
  ════════════════════════════════════════════════════════════ */
  function _stepRegime(simN) {
    if (RE.step(simN)) _resampleJumpNoise();
    _syncRegimeDerived();
  }

  function _stepStochasticParams(dt, normalRandom) {
    const sqDt   = Math.sqrt(dt);
    const sigMax = sigma_user * RE.blend('sigCap');
    const sigMin = sigma_user * CONFIG.SIGMA_MIN_MULT;

    /* 杠杆效应 Cholesky 分解：
         W1 — 价格扩散噪声（返回给 stepPriceCore 用于 diffusion）
         W2 = ρ·W1 + √(1-ρ²)·Z2 — 与价格负相关的波动率扰动
       当 W1 > 0（价格上涨）时 W2 < 0（波动率倾向下行），反之亦然。 */
    const W1 = normalRandom();
    const W2 = CONFIG.LEVERAGE_RHO * W1 + LEVERAGE_SQRT1RHO2 * normalRandom();

    sigma_t = Math.max(sigMin, Math.min(sigMax,
      sigma_t + CONFIG.VOL_KAPPA  * (sigma_base - sigma_t) * dt
              + CONFIG.VOL_OF_VOL * sigma_t * W2 * sqDt
    ));
    mu_t = Math.max(-CONFIG.DRIFT_CLAMP, Math.min(CONFIG.DRIFT_CLAMP,
      mu_t + CONFIG.DRIFT_KAPPA * (mu_base - mu_t) * dt
           + CONFIG.DRIFT_VOL   * normalRandom()   * sqDt
    ));

    return W1;  // 供 stepPriceCore ⑧ 直接用于 diffusion，复用同一随机数实现杠杆效应
  }

  function _stepSwan(totalTicks, simN) {
    return SE.step(totalTicks, simN, RE.blend('muAdd'));
  }

  function _computeSRForce(currentPrice) {
    return SR.computeForce(currentPrice);
  }

  /* ════════════════════════════════════════════════════════════
     公开 API（与原版 window.MarketEngine 接口完全兼容）
  ════════════════════════════════════════════════════════════ */
  window.OrdinaryMarketEngine = {

    /* ── 导出常量（供主文件 / Crypto.js 引用） ── */
    get REGIMES()    { return RE.REGIMES; },
    get JUMP_PROB()  { return CONFIG.JUMP_PROB; },
    get JUMP_MEAN()  { return CONFIG.JUMP_MEAN; },
    get JUMP_STD()   { return CONFIG.JUMP_STD; },
    get SR_PERIODS() { return SR.SR_PERIODS; },

    /* ── 用户参数（UI 滑块读写） ── */
    get mu_user()    { return mu_user; },    set mu_user(v)    { mu_user = v; },
    get sigma_user() { return sigma_user; }, set sigma_user(v) { sigma_user = v; },

    /* ── 衍生状态（只读供渲染 / HUD） ── */
    get mu_base()           { return mu_base; },
    get sigma_base()        { return sigma_base; },
    get mu_t()              { return mu_t; },
    get sigma_t()           { return sigma_t; },
    get effectiveJumpProb() { return effectiveJumpProb; },
    get longEma()           { return longEma; },
    get refPrice()          { return refPrice; },

    /* ── 情景状态（委托给 RegimeEngine） ── */
    get regimeIdx()     { return RE.regimeIdx; },
    get prevRegimeIdx() { return RE.prevRegimeIdx; },
    get regimeBlend()   { return RE.regimeBlend; },

    /* ── 天鹅状态（委托给 SwanEngine） ── */
    get swanLevel()   { return SE.swanLevel; },
    get swanTOffset() { return SE.swanTOffset; },

    /* ── S/R Maps（委托给 SREngine，通过引用共享） ── */
    get srEmaValues()  { return SR.srEmaValues; },
    get srPrevSide()   { return SR.srPrevSide; },
    get srBreakDrift() { return SR.srBreakDrift; }, set srBreakDrift(v) { SR.srBreakDrift = v; },

    /* ════════════════════════════════════════════════════════
       updateSREMA(price)
       委托给 SREngine（Crypto.js / CryptoCtx 直接调用此接口）。
    ════════════════════════════════════════════════════════ */
    updateSREMA(price) {
      SR.updateEMA(price);
    },

    /* ════════════════════════════════════════════════════════
       applyN(simN)
       切换 simN 时同步更新所有引擎的 N 相关衍生量。
    ════════════════════════════════════════════════════════ */
    applyN(simN) {
      SR.applyN(simN);
      RE.applyN(simN);
      _jumpClusterDecayPerTick = Math.pow(CONFIG.JUMP_CLUSTER_DECAY, 1 / simN);
      _momentumDecayPerTick    = Math.pow(CONFIG.MOMENTUM_DECAY,     1 / simN);
      MEAN_REV_SLOW_K = 2 / (MEAN_REV_SLOW_T * simN + 1);
      MEAN_REV_EMA_K  = 2 / (MEAN_REV_LONG_T  * simN + 1);
    },

    /* ════════════════════════════════════════════════════════
       reset(simN)
       完整重置所有市场模型状态（游戏 RESET 时调用）。
    ════════════════════════════════════════════════════════ */
    reset(simN) {
      RE.reset(simN);
      SE.reset();
      SR.reset();
      SR.applyN(simN);            // 同步 SR 内部 N 相关衍生量
      mu_t              = mu_user;
      sigma_t           = sigma_user;
      jumpCluster       = 0;
      momentumScore     = 0;
      longEma           = 0;
      refPrice          = 0;
      _jumpClusterDecayPerTick = Math.pow(CONFIG.JUMP_CLUSTER_DECAY, 1 / simN);
      _momentumDecayPerTick    = Math.pow(CONFIG.MOMENTUM_DECAY,     1 / simN);
      MEAN_REV_SLOW_K = 2 / (MEAN_REV_SLOW_T * simN + 1);
      MEAN_REV_EMA_K  = 2 / (MEAN_REV_LONG_T  * simN + 1);
      _resampleJumpNoise();       // 重置时为新局采样跳跃参数噪声
      _syncRegimeDerived();       // 以重置后的 CHOP 情景正确初始化各衍生量
    },

    /* ════════════════════════════════════════════════════════
       stepPriceCore(currentPrice, totalTicks, simN, dt, normalRandom)
       每 tick 的纯价格计算核心（完整升级版）：

         ① stepRegime            — 情景切换 + 混合参数
         ② stepStochasticParams  — 情景感知 Heston vol/drift + 杠杆效应
         ③ stepSwan              — 天鹅事件检测
         ④ computeSRForce        — 自适应支撑/压力合力
         ⑤ 跳跃（Enhanced）     — vol 相关大小 + 聚类 + 情景偏置 + 肥尾
         ⑥ 行为动量反转力        — 连涨/连跌后施加均值修正
         ⑦ 长期均值回归力        — 情景感知 OU 回归拉力
         ⑧ GBM 价格更新
         ⑨ updateSREMA + longEma + refPrice — 价格确定后更新所有 EMA
         ⑩ 成交量（Enhanced）   — 与价格变动幅度正相关

       返回 { newPrice, swanEffect, relVol }
       所有 UI 副作用（Toast、数据记录）由调用方处理。
    ════════════════════════════════════════════════════════ */
    stepPriceCore(currentPrice, totalTicks, simN, dt, normalRandom) {
      /* ① 情景推进 */
      _stepRegime(simN);

      /* ② 随机参数更新（返回 W1 供 ⑧ diffusion 复用，实现杠杆效应） */
      const W1 = _stepStochasticParams(dt, normalRandom);

      /* ③ 天鹅事件 */
      const swanEffect = _stepSwan(totalTicks, simN);

      /* ④ S/R 合力 */
      const srForce = _computeSRForce(currentPrice);

      /* ⑤ 增强跳跃（N 无关性修正）
         jumpCluster 以 per-T 概率单位存储，÷simN 换算为 per-tick 概率，
         保证 simN 变化时每 T 期内的期望聚类跳跃次数不变。
         衰减使用 per-tick 系数 _jumpClusterDecayPerTick = DECAY^(1/N)，
         保证 N ticks（1 T）后的总衰减恒等于 JUMP_CLUSTER_DECAY。 */
      jumpCluster *= _jumpClusterDecayPerTick;

      /* effectiveJumpProb 已含情景 jumpMult（来自 RegimeEngine 快照）；
         _jumpProbFactor 再叠加全局基础概率的周期性扰动，两层独立噪声模拟真实市场 */
      const totalJumpProb = (effectiveJumpProb * _jumpProbFactor + jumpCluster) / simN;
      let jump = 0;
      if (Math.random() < totalJumpProb) {
        /* 跳跃大小与当前波动率正相关（vol-clustering 期间更易出现大跳） */
        const volRatio = sigma_t / Math.max(sigma_user, 0.001);
        let jumpMean = CONFIG.JUMP_MEAN + _jumpMeanOffset;

        /* 情景偏置：使用混合漂移偏置（过渡期平滑，非突变） */
        if (RE.blend('muAdd') < CONFIG.JUMP_BEAR_THRESH) jumpMean -= CONFIG.JUMP_BEAR_BIAS;

        jump = jumpMean + CONFIG.JUMP_STD * _jumpStdFactor * volRatio * normalRandom();

        /* 肥尾放大器（Fat-tail）：约 12% 概率叠加指数分布额外幅度（75% 向下 / 25% 向上），
           模拟极端崩盘/熔断等黑尾事件；-Math.log(1-U) 生成指数分布随机量 */
        if (Math.random() < CONFIG.JUMP_FAT_TAIL_PROB) {
          const tailMag = -Math.log(1 - Math.random()) * CONFIG.JUMP_FAT_TAIL_SCALE;
          jump += (Math.random() < 0.25 ? 1 : -1) * tailMag;
        }

        /* 触发聚类（危机传染：此跳后短期跳跃概率上升，以 per-T 单位累积） */
        jumpCluster += CONFIG.JUMP_CLUSTER_BOOST;
        if (jumpCluster > CONFIG.JUMP_CLUSTER_MAX) jumpCluster = CONFIG.JUMP_CLUSTER_MAX;
      }

      /* ⑥ 行为动量反转力（N 无关性修正）
         momentumScore 衰减使用 _momentumDecayPerTick = DECAY^(1/N)，
         保证动量"记忆半衰期"按 T 数计量，与 simN 无关。
         momentumForce ÷simN 使每 T 的总反转力恒定。 */
      const sqDt      = Math.sqrt(dt);
      const drift     = mu_t - 0.5 * sigma_t * sigma_t;
      /* W1 来自 ② _stepStochasticParams，复用同一随机数实现杠杆效应负相关 */
      const diffusion = sigma_t * swanEffect.swanVolScale * sqDt * W1;
      const rawLogRet = drift * dt + diffusion + jump;

      /* ±1/simN per tick → 每 T 累积 ±1，与 N 无关；THRESH 含义：连续趋势 T 数
         故意使用 rawLogRet（不含 srForce / momentumForce），避免修正力触发自身反馈循环 */
      momentumScore = momentumScore * _momentumDecayPerTick + Math.sign(rawLogRet) / simN;
      let momentumForce = 0;
      const absMomentum = Math.abs(momentumScore);
      if (absMomentum > CONFIG.MOMENTUM_THRESH) {
        /* 力量随超出阈值的程度线性增大，÷simN 保证每 T 总力恒定 */
        momentumForce = -Math.sign(momentumScore) * (CONFIG.MOMENTUM_FORCE / simN)
                        * Math.min(1, (absMomentum - CONFIG.MOMENTUM_THRESH) / CONFIG.MOMENTUM_THRESH);
      }

      /* ⑦ 长期均值回归力（连续 OU 过程）
         force = -κ₀ · regimeMult · (1±noise) · log(P/ref) · dt
         无阈值：偏离越大力越强，自然形成有界均衡。
         dt 已含 1/simN，天然 N 无关；noise ±15% 防止确定性套利。 */
      let meanRevForce = 0;
      if (refPrice > 0) {
        const logDev     = Math.log(currentPrice / refPrice);
        const regimeMult = RE.blend('meanRevMult');
        const noise      = CONFIG.MEAN_REV_NOISE * (Math.random() * 2 - 1);
        meanRevForce     = -CONFIG.MEAN_REV_KAPPA0 * regimeMult * (1 + noise) * logDev * dt;
      }

      /* ⑧ GBM 价格更新
         swanDriftAdd 是每 T 的 log-return 偏移，÷simN 换算到每 sub-tick
         swanGap 是事件触发第一 tick 的一次性跳空（黑/白天鹅缺口） */
      let newPrice = currentPrice * Math.exp(
        rawLogRet + swanEffect.swanDriftAdd / simN + srForce + momentumForce + meanRevForce
        + swanEffect.swanGap
      );
      if (newPrice < 0.01) newPrice = 0.01;

      /* ⑨ 价格确定后更新 S/R EMA、longEma（HUD）及 refPrice（OU 锚） */
      SR.updateEMA(newPrice);
      longEma  = longEma  === 0 ? newPrice : longEma  + MEAN_REV_EMA_K  * (newPrice - longEma);
      refPrice = refPrice === 0 ? newPrice : refPrice + MEAN_REV_SLOW_K * (newPrice - refPrice);

      /* ⑩ 成交量
         归一化分母用 sigma_user·sqDt（用户基准波动），使两个效果独立叠加：
           · sigma_t / sigma_user  — 波动率水平对量能的贡献（高波动期基础量更大）
           · priceChangeFactor     — 本 tick 相对于"正常日内波动"的异常程度
         当高波动率期同时发生大幅移动时，两者共同放大量柱，符合市场直觉。
         VOL_CAP 提高到 10，使跳跃事件（~10+σ 移动）在量柱上明显区别于普通波动。*/
      const absReturn         = Math.abs(Math.log(newPrice / currentPrice));
      const priceChangeFactor = 1 + CONFIG.VOL_PRICE_FACTOR * absReturn
                                    / Math.max(sigma_user * sqDt, 1e-6);
      const relVol = (sigma_t / Math.max(sigma_user, 0.001))
                     * Math.min(priceChangeFactor, CONFIG.VOL_CAP)
                     * (CONFIG.VOL_NOISE_MIN + CONFIG.VOL_NOISE_RANGE * Math.random())
                     * swanEffect.swanVolBoost;

      return { newPrice, swanEffect, relVol };
    },

    /* ════════════════════════════════════════════════════════
       warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume)
       游戏开始前预热 WARMUP_T×simN 个 tick，与 stepPriceCore 使用完全相同的十步逻辑。
       返回最终价格（由 initPrice() 写入 currentPrice）。
    ════════════════════════════════════════════════════════ */
    warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume) {
      const initLen = WARMUP_T * simN;
      const sqDt    = Math.sqrt(dt);   // 预计算，避免循环内重复 sqrt
      let p = 100;

      for (let i = 0; i < initLen; i++) {
        const open = p;  // 本 tick 开盘价 = 上一 tick 收盘价
        const { newPrice, relVol } = this.stepPriceCore(p, i, simN, dt, normalRandom);
        p = newPrice;

        /* OHLC 封装（高低用 sigma_t 微扰模拟 tick 内波动，stepPriceCore 已更新 sigma_t）
           micro 以 sigma_t * sqrt(dt) 为尺度（= tick 级实际波动量级）              */
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
