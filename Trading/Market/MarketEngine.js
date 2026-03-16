/* ═══════════════════════════════════════════════════════════════════
   Market/MarketEngine.js  — 市场价格模型协调器
   整合三个子引擎：RegimeEngine / SwanEngine / SREngine
   在此基础上实现增强特性：
     ① 情景感知的 sigma_t 动态上界（熊市 / V.BULL 允许更高波动上限）
     ② 跳跃升级：波动率相关大小 + 跳跃聚类（危机传染）+ 情景方向偏置
     ③ 行为金融动量反转：连续单向运动后施加反向修正力
     ④ 成交量增强：与价格变动幅度正相关
   挂载为 window.MarketEngine，与原版 API 完全兼容。
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 子引擎快捷引用（三个文件须在本文件之前加载） ── */
  const RE = window.RegimeEngine;
  const SE = window.SwanEngine;
  const SR = window.SREngine;

  /* ══════════════════════════════════════════════════════════════
     随机参数常量（Heston-style OU 过程）
  ══════════════════════════════════════════════════════════════ */
  const VOL_KAPPA   = 2.5;   // sigma_t 均值回归速度
  const VOL_OF_VOL  = 0.65;  // sigma_t 的随机扰动强度（vol-of-vol）
  const DRIFT_KAPPA = 0.8;   // mu_t 均值回归速度
  const DRIFT_VOL   = 0.15;  // mu_t 的随机扰动强度

  /* ══════════════════════════════════════════════════════════════
     跳跃常量（Merton Jump-Diffusion）
  ══════════════════════════════════════════════════════════════ */
  const JUMP_PROB  = 0.025;  // 每 T 的基础跳跃概率
  const JUMP_MEAN  = -0.005; // 跳跃均值（略偏负，模拟恐慌性下跌更常见）
  const JUMP_STD   = 0.04;   // 跳跃标准差（在基础 sigma_user 下）

  /* 跳跃聚类（Jump Clustering）—— 危机传染效应
     一次跳跃后短期内跳跃概率显著上升，以指数衰减恢复正常。
     CLUSTER_BOOST : 单次跳跃触发后向 jumpCluster 叠加的概率量（per-T 单位）
     CLUSTER_DECAY : 每 T 的衰减系数；per-tick 衍生量见 _jumpClusterDecayPerTick */
  const JUMP_CLUSTER_BOOST = 0.06;
  const JUMP_CLUSTER_DECAY = 0.78;

  /* 跳跃方向偏置（情景感知）
     当情景 muAdd < JUMP_BEAR_THRESH 时（熊市/阴跌），负跳跃概率额外上升。 */
  const JUMP_BEAR_THRESH    = -0.03;
  const JUMP_BEAR_BIAS      = 0.004;  // 添加到 JUMP_MEAN 的额外负偏置

  /* ══════════════════════════════════════════════════════════════
     行为金融：动量反转（Overreaction & Reversal）
     连续单向运动（momentumScore 累积超过阈值）后施加反向修正力。
     MOMENTUM_DECAY  : 每 T 的衰减系数；per-tick 衍生量见 _momentumDecayPerTick
     MOMENTUM_THRESH : 触发反转力所需的最低信号强度（T 周期数语义：
                       每 tick 累积 ±1/simN，连续趋势约 THRESH T 后触发）
     MOMENTUM_FORCE  : 反转力最大量（momentumScore 越强越大，线性，per-T）
  ══════════════════════════════════════════════════════════════ */
  const MOMENTUM_DECAY  = 0.92;
  const MOMENTUM_THRESH = 1.5;   // ≈ 1.5 T 连续趋势后触发（与 N 无关）
  const MOMENTUM_FORCE  = 0.0018;

  /* ══════════════════════════════════════════════════════════════
     跳跃参数随机噪声（每次情景切换时重新采样，模拟不同市场周期的跳跃特性）
     NOISE_PROB : JUMP_PROB 相对乘法噪声（全局基础跳跃频率的周期性变化）
     NOISE_MEAN : JUMP_MEAN 绝对加法噪声（跳跃方向偏置的周期性变化）
     NOISE_STD  : JUMP_STD 相对乘法噪声（跳跃幅度离散度的周期性变化）
  ══════════════════════════════════════════════════════════════ */
  const JUMP_NOISE_PROB = 0.30;
  const JUMP_NOISE_MEAN = 0.003;
  const JUMP_NOISE_STD  = 0.25;

  /* ══════════════════════════════════════════════════════════════
     用户参数（由 UI 滑块读写）
  ══════════════════════════════════════════════════════════════ */
  let mu_user    = 0.02;
  let sigma_user = 0.10;

  /* ══════════════════════════════════════════════════════════════
     衍生状态（由 stepRegime 维护）
  ══════════════════════════════════════════════════════════════ */
  let mu_base           = mu_user;
  let sigma_base        = sigma_user;
  let mu_t              = mu_user;
  let sigma_t           = sigma_user;
  let effectiveJumpProb = JUMP_PROB;

  /* ── 内部动态状态 ── */
  let jumpCluster   = 0;   // 当前跳跃聚类残余概率（per-T 概率单位）
  let momentumScore = 0;   // 行为动量累积信号

  /* 跳跃参数噪声因子（每次情景切换时由 _resampleJumpNoise 更新） */
  let _jumpProbFactor = 1.0;  // JUMP_PROB 乘数
  let _jumpMeanOffset = 0.0;  // JUMP_MEAN 加法偏置
  let _jumpStdFactor  = 1.0;  // JUMP_STD 乘数

  /* ── N 相关衍生量（初始值对应 N=4，由 applyN / reset 维护） ──
     _jumpClusterDecayPerTick = JUMP_CLUSTER_DECAY^(1/N)
       保证 N ticks 后聚类残余的总衰减恒等于 JUMP_CLUSTER_DECAY（每 T 衰减量不变）
     _momentumDecayPerTick    = MOMENTUM_DECAY^(1/N)
       保证动量信号的记忆长度（半衰期）按 T 而非 tick 度量，与 N 无关
  ── */
  let _jumpClusterDecayPerTick = Math.pow(JUMP_CLUSTER_DECAY, 1 / 4);
  let _momentumDecayPerTick    = Math.pow(MOMENTUM_DECAY,     1 / 4);

  /* ── 辅助：情景切换时重新采样跳跃参数噪声 ── */
  function _resampleJumpNoise() {
    _jumpProbFactor = Math.max(0.30, 1 + JUMP_NOISE_PROB * (Math.random() * 2 - 1));
    _jumpMeanOffset = JUMP_NOISE_MEAN * (Math.random() * 2 - 1);
    _jumpStdFactor  = Math.max(0.30, 1 + JUMP_NOISE_STD  * (Math.random() * 2 - 1));
  }

  function _syncRegimeDerived() {
    mu_base = Math.max(-0.5, Math.min(0.5,
      mu_user * RE.blend('muMult') + RE.blend('muAdd')));
    sigma_base        = Math.max(0.005, sigma_user * RE.blend('sigMult'));
    effectiveJumpProb = JUMP_PROB * RE.blend('jumpMult');
  }

  /* ════════════════════════════════════════════════════════════
     公开 API（与原版 window.MarketEngine 接口完全兼容）
  ════════════════════════════════════════════════════════════ */
  window.MarketEngine = {

    /* ── 导出常量（供主文件 / Crypto.js 引用） ── */
    get REGIMES()    { return RE.REGIMES; },
    get JUMP_PROB()  { return JUMP_PROB; },
    get JUMP_MEAN()  { return JUMP_MEAN; },
    get JUMP_STD()   { return JUMP_STD; },
    get SR_PERIODS() { return SR.SR_PERIODS; },

    /* ── 用户参数（UI 滑块读写） ── */
    get mu_user()    { return mu_user; },    set mu_user(v)    { mu_user = v; },
    get sigma_user() { return sigma_user; }, set sigma_user(v) { sigma_user = v; },

    /* ── 衍生状态（只读供渲染 / HUD，mu_t / sigma_t 可由 warmup 回写） ── */
    get mu_base()    { return mu_base; },
    get sigma_base() { return sigma_base; },
    get mu_t()       { return mu_t; },    set mu_t(v)    { mu_t = v; },
    get sigma_t()    { return sigma_t; }, set sigma_t(v) { sigma_t = v; },
    get effectiveJumpProb() { return effectiveJumpProb; },

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
       stepRegime(simN)
       推进情景系统，同步更新 mu_base / sigma_base / effectiveJumpProb。
    ════════════════════════════════════════════════════════ */
    stepRegime(simN) {
      if (RE.step(simN)) _resampleJumpNoise();  // 情景切换时重采样跳跃噪声
      _syncRegimeDerived();
    },

    /* ════════════════════════════════════════════════════════
       stepStochasticParams(dt, normalRandom)
       Heston-style OU 随机游走 sigma_t 与 mu_t。
       【升级】sigma_t 上界改为情景感知（sigCap 属性），
       熊市 / V.BULL 情景允许更高波动上限，CHOP 收窄。
    ════════════════════════════════════════════════════════ */
    stepStochasticParams(dt, normalRandom) {
      const sqDt = Math.sqrt(dt);

      /* 情景混合的 sigma 上界（regime-aware cap） */
      const blendedSigCap = RE.blend('sigCap');
      const sigMax = sigma_user * blendedSigCap;
      const sigMin = sigma_user * 0.30;   // 下界固定为用户设置的 30%

      sigma_t = Math.max(sigMin, Math.min(sigMax,
        sigma_t + VOL_KAPPA * (sigma_base - sigma_t) * dt
                + VOL_OF_VOL * sigma_t * normalRandom() * sqDt
      ));

      mu_t = Math.max(-0.8, Math.min(0.8,
        mu_t + DRIFT_KAPPA * (mu_base - mu_t) * dt
             + DRIFT_VOL * normalRandom() * sqDt
      ));
    },

    /* ════════════════════════════════════════════════════════
       stepSwan(totalTicks, simN)
       委托给 SwanEngine，透传返回值。
    ════════════════════════════════════════════════════════ */
    stepSwan(totalTicks, simN) {
      return SE.step(totalTicks, simN);
    },

    /* ════════════════════════════════════════════════════════
       computeSRForce(currentPrice)
       委托给 SREngine。
    ════════════════════════════════════════════════════════ */
    computeSRForce(currentPrice) {
      return SR.computeForce(currentPrice);
    },

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
      _jumpClusterDecayPerTick = Math.pow(JUMP_CLUSTER_DECAY, 1 / simN);
      _momentumDecayPerTick    = Math.pow(MOMENTUM_DECAY,     1 / simN);
    },

    /* ════════════════════════════════════════════════════════
       reset(simN)
       完整重置所有市场模型状态（游戏 RESET 时调用）。
    ════════════════════════════════════════════════════════ */
    reset(simN) {
      RE.reset(simN);
      SE.reset();
      SR.reset();
      SR.applyN(simN);            // 同步 SR 内部 N 相关衍生量（_srDecay / _srForceScale 等）
      mu_t              = mu_user;
      sigma_t           = sigma_user;
      jumpCluster              = 0;
      momentumScore            = 0;
      _jumpClusterDecayPerTick = Math.pow(JUMP_CLUSTER_DECAY, 1 / simN);
      _momentumDecayPerTick    = Math.pow(MOMENTUM_DECAY,     1 / simN);
      _resampleJumpNoise();       // 重置时为新局采样跳跃参数噪声
      _syncRegimeDerived();       // 以重置后的 CHOP 情景正确初始化 mu_base / sigma_base / effectiveJumpProb
    },

    /* ════════════════════════════════════════════════════════
       stepPriceCore(currentPrice, totalTicks, simN, dt, normalRandom)
       每 tick 的纯价格计算核心（完整升级版）：

         ① stepRegime            — 情景切换 + 混合参数
         ② stepStochasticParams  — 情景感知 Heston vol/drift
         ③ stepSwan              — 天鹅事件检测
         ④ computeSRForce        — 自适应支撑/压力合力
         ⑤ 跳跃（Enhanced）     — vol 相关大小 + 聚类 + 情景偏置
         ⑥ 行为动量反转力        — 连涨/连跌后施加均值修正
         ⑦ GBM 价格更新
         ⑧ updateSREMA           — 价格确定后更新 EMA
         ⑨ 成交量（Enhanced）   — 与价格变动幅度正相关

       返回 { newPrice, swanEffect, relVol }
       所有 UI 副作用（Toast、数据记录）由调用方处理。
    ════════════════════════════════════════════════════════ */
    stepPriceCore(currentPrice, totalTicks, simN, dt, normalRandom) {
      /* ① 情景推进 */
      this.stepRegime(simN);

      /* ② 随机参数更新 */
      this.stepStochasticParams(dt, normalRandom);

      /* ③ 天鹅事件 */
      const swanEffect = this.stepSwan(totalTicks, simN);

      /* ④ S/R 合力 */
      const srForce = this.computeSRForce(currentPrice);

      /* ⑤ 增强跳跃（N 无关性修正）
         jumpCluster 以 per-T 概率单位存储，÷simN 换算为 per-tick 概率，
         保证 simN 变化时每 T 期内的期望聚类跳跃次数不变。
         衰减使用 per-tick 系数 _jumpClusterDecayPerTick = JUMP_CLUSTER_DECAY^(1/N)，
         保证 N ticks（1 T）后的总衰减恒等于 JUMP_CLUSTER_DECAY。 */
      jumpCluster *= _jumpClusterDecayPerTick;

      /* effectiveJumpProb 已含情景 jumpMult 噪声（来自 RegimeEngine 快照）；
         _jumpProbFactor 再叠加全局基础概率的周期性扰动，两层独立噪声模拟真实市场 */
      const totalJumpProb = (effectiveJumpProb * _jumpProbFactor + jumpCluster) / simN;
      let jump = 0;
      if (Math.random() < totalJumpProb) {
        /* 跳跃大小与当前波动率正相关（vol-clustering 期间更易出现大跳） */
        const volRatio = sigma_t / Math.max(sigma_user, 0.001);
        let jumpMean = JUMP_MEAN + _jumpMeanOffset;

        /* 情景偏置：使用混合漂移偏置（过渡期平滑，非突变） — Fix #3 */
        if (RE.blend('muAdd') < JUMP_BEAR_THRESH) jumpMean -= JUMP_BEAR_BIAS;

        jump = jumpMean + JUMP_STD * _jumpStdFactor * volRatio * normalRandom();

        /* 触发聚类（危机传染：此跳后短期跳跃概率上升，以 per-T 单位累积） */
        jumpCluster += JUMP_CLUSTER_BOOST;
        if (jumpCluster > 0.15) jumpCluster = 0.15;  // 防止无限累积
      }

      /* ⑥ 行为动量反转力（N 无关性修正）
         momentumScore 衰减使用 _momentumDecayPerTick = MOMENTUM_DECAY^(1/N)，
         保证动量"记忆半衰期"按 T 数计量，与 simN 无关。
         momentumForce ÷simN 使每 T 的总反转力恒定（类比 srForce 的 _srForceScale=1/N）。 */
      const sqDt      = Math.sqrt(dt);
      const drift     = mu_t - 0.5 * sigma_t * sigma_t;
      const diffusion = sigma_t * swanEffect.swanVolScale * sqDt * normalRandom();
      const rawLogRet = drift * dt + diffusion + jump;

      // ±1/simN per tick → 每 T 累积 ±1，与 N 无关；THRESH 含义：连续趋势 T 数
      // 故意使用 rawLogRet（不含 srForce / momentumForce），避免修正力触发自身反馈循环
      momentumScore = momentumScore * _momentumDecayPerTick + Math.sign(rawLogRet) / simN;
      let momentumForce = 0;
      const absMomentum = Math.abs(momentumScore);
      if (absMomentum > MOMENTUM_THRESH) {
        /* 力量随超出阈值的程度线性增大，÷simN 保证每 T 总力恒定 */
        momentumForce = -Math.sign(momentumScore) * (MOMENTUM_FORCE / simN)
                        * Math.min(1, (absMomentum - MOMENTUM_THRESH) / MOMENTUM_THRESH);
      }

      /* ⑦ GBM 价格更新
         swanDriftAdd 是每 T 的 log-return 偏移，÷simN 换算到每 sub-tick */
      let newPrice = currentPrice * Math.exp(
        rawLogRet + swanEffect.swanDriftAdd / simN + srForce + momentumForce
      );
      if (newPrice < 0.01) newPrice = 0.01;

      /* ⑧ 价格确定后更新 S/R EMA */
      this.updateSREMA(newPrice);

      /* ⑨ 增强成交量
         相对成交量 = 波动率因子 × 价格变动放大因子 × 随机噪声 × 天鹅放大
         价格变动放大因子：|log_return| 越大，量能越高（最多 ×4 封顶） */
      const absReturn       = Math.abs(Math.log(newPrice / currentPrice));
      const priceChangeFactor = 1 + 3 * absReturn / Math.max(sigma_t * sqDt, 1e-6);
      const relVol = (sigma_t / Math.max(sigma_user, 0.001))
                     * Math.min(priceChangeFactor, 4)
                     * (0.55 + 0.45 * Math.random())
                     * swanEffect.swanVolBoost;

      return { newPrice, swanEffect, relVol };
    },

    /* ════════════════════════════════════════════════════════
       warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume)
       游戏开始前预热 100×simN 个 tick：
         - 随机游走价格（无情景/天鹅，保持轻量）
         - 写入 OHLC / price / volume 数组
         - 同时预热 SR EMA（使其在游戏开始时已收敛）
         - 回写预热末尾的 sigma_t / mu_t 状态
       返回最终价格（由 initPrice() 写入 currentPrice）
    ════════════════════════════════════════════════════════ */
    warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume) {
      const sqDt    = Math.sqrt(dt);
      const initLen = 200 * simN;
      let p = 100, s = sigma_user, m = mu_user;

      for (let i = 0; i < initLen; i++) {
        /* 轻量 OU 随机游走（无情景混合，保持预热速度） */
        s = Math.max(sigma_user * 0.3, Math.min(sigma_user * 2.0,
            s + VOL_KAPPA  * (sigma_user - s) * dt + VOL_OF_VOL * s * normalRandom() * sqDt));
        m = Math.max(-0.8, Math.min(0.8,
            m + DRIFT_KAPPA * (mu_user - m)   * dt + DRIFT_VOL * normalRandom() * sqDt));

        const drift = m - 0.5 * s * s;
        const jump  = Math.random() < JUMP_PROB / simN
                    ? JUMP_MEAN + JUMP_STD * normalRandom() : 0;

        const open  = i === 0 ? p : outOhlc[i - 1].c;

        p = p * Math.exp(drift * dt + s * sqDt * normalRandom() + jump);
        if (p < 0.01) p = 0.01;

        /* 预热 S/R EMA */
        SR.updateEMA(p);
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

      /* 回写预热末尾随机参数状态 */
      sigma_t = s;
      mu_t    = m;
      return p;
    },
  };

})();
