/* ═══════════════════════════════════════════════════════════════════
   Market/RegimeEngine.js  — 市场情景系统
   管理五种情景（BULL / BEAR / CHOP / V.BULL / Q.BEAR）的切换、
   混合插值及衍生参数计算。
   挂载为 window.RegimeEngine，由 MarketEngine.js 统一调用。
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     五种情景定义
       muMult  : mu_user 的乘数
       muAdd   : 固定漂移偏置（年化 log-return）
       sigMult : sigma_user 的乘数（用于 sigma_base）
       jumpMult: 跳跃概率乘数
       sigCap  : sigma_t 上界 = sigma_user × sigCap（情景感知上限）
       color   : HUD / 图表标签颜色
  ══════════════════════════════════════════════════════════════ */
  /* meanRevMult 校准：均衡价基于完整公式（含 Itô 修正和跳跃拖拽）
       log(P_eq/refPrice) = (μ_base − 0.5σ̄² + E[jumps/year]) / (κ₀ · meanRevMult)
     以 mu_user=0.30，sigma_user=0.25，JUMP_MEAN=0，κ₀=0.25 为基准，均衡（refPrice≈100）：
       CHOP≈107，BULL≈422，V.BULL≈332，Q.BEAR≈93，BEAR≈74
     设计意图：BULL/V.BULL 大幅高于参考价，BEAR/Q.BEAR 低于参考价但不趋零，
               合理区间保证长期 warmup 后价格不会崩溃至极小值。 */
  const REGIMES = [
    {
      // 均衡≈422：mu_base=0.25，σ̄=0.26，Itô=-0.034，EQ=0.216/(0.25×0.60)=1.44→×e≈422
      name:'BULL',   weight:0.26, color:'#39ff14',
      muMult:0.50, muAdd:+0.10, sigMult:1.05, jumpMult:0.6, sigCap:1.7, meanRevMult:0.60,
    },
    {
      // 均衡≈74：mu_base=0.07，σ̄=0.35，Itô=-0.061，E[j]=-0.047 → net=-0.038/(0.25×0.50)=-0.30→×e≈74
      // muAdd 由 -0.13 收窄至 -0.08，sigCap 2.8→2.0 抑制 Itô 放大，meanRevMult 大幅增强恢复力
      name:'BEAR',   weight:0.20, color:'#ff2d78',
      muMult:0.50, muAdd:-0.08, sigMult:1.40, jumpMult:1.8, sigCap:2.0, meanRevMult:0.50,
    },
    {
      // 均衡≈107：mu_base=0.024，σ̄=0.125，Itô=-0.008 → net=0.016/(0.25×0.90)=0.07→×e≈107
      name:'CHOP',   weight:0.28, color:'#f5e642',
      muMult:0.08, muAdd: 0.00, sigMult:0.50, jumpMult:0.5, sigCap:1.2, meanRevMult:0.90,
    },
    {
      // 均衡≈332：mu_base=0.26，σ̄=0.40，Itô=-0.080 → net=0.18/(0.25×0.60)=1.20→×e≈332
      // sigMult/sigCap 收窄以避免 Itô 修正吞噬正漂移（V.BULL 均衡应显著高于 BULL）
      name:'V.BULL', weight:0.14, color:'#00ffcc',
      muMult:0.60, muAdd:+0.08, sigMult:1.60, jumpMult:1.0, sigCap:2.5, meanRevMult:0.60,
    },
    {
      // 均衡≈93：mu_base=0.04，σ̄=0.175，Itô=-0.015，E[j]=-0.034 → net=-0.009/(0.25×0.50)=-0.07→×e≈93
      // 阴跌熊市：跌幅温和但持续，反弹力弱，适合空单持有
      name:'Q.BEAR', weight:0.12, color:'#ff6060',
      muMult:0.30, muAdd:-0.05, sigMult:0.70, jumpMult:1.3, sigCap:1.8, meanRevMult:0.50,
    },
  ];

  /* 情景过渡期（T 周期数）：两个情景之间线性混合持续 REGIME_TRANSITION 个 T。
     per-tick 增量 = 1 / (REGIME_TRANSITION × simN)，保证与 N 无关。 */
  const REGIME_TRANSITION = 30;

  /* 情景属性随机噪声幅度（每次切换情景时重新采样，模拟现实中同名情景的强度差异）
     NOISE_MUADD   : muAdd 绝对加法噪声（乘法在 CHOP muAdd=0 时失效，故用加法）
     NOISE_SIGMULT : sigMult 相对乘法噪声
     NOISE_JUMPMULT: jumpMult 相对乘法噪声
     NOISE_WEIGHT  : 切换时权重加法噪声（归一化后生效），模拟不同时代市场的偏好 */
  const REGIME_NOISE_MUADD    = 0.020;
  const REGIME_NOISE_SIGMULT  = 0.20;
  const REGIME_NOISE_JUMPMULT = 0.30;
  const REGIME_NOISE_WEIGHT   = 0.05;

  /* ══════════════════════════════════════════════════════════════
     情景转移矩阵（Markov Transition Matrix）
     TRANSITION[i][j] = 从情景 i 转向情景 j 的基础权重（对角线恒为 0）。
     行顺序与 REGIMES 一致：BULL(0) BEAR(1) CHOP(2) V.BULL(3) Q.BEAR(4)

     设计原则（基于真实市场路径规律）：
       · 强趋势（BULL/BEAR）通常经 CHOP 过渡，鲜少骤然逆转
       · V.BULL 最常淡化为 BULL，而非直跳 BEAR
       · Q.BEAR 可加速为 BEAR，也可在 CHOP 中稳定
       · CHOP 作为"中性地带"可向任意方向发展
  ══════════════════════════════════════════════════════════════ */
  const TRANSITION = [
  //   BULL   BEAR   CHOP  V.BULL Q.BEAR
    [ 0.00,  0.10,  0.30,  0.40,  0.20 ],  // from BULL  : 多往 V.BULL 或 CHOP
    [ 0.10,  0.00,  0.40,  0.05,  0.45 ],  // from BEAR  : 多往 Q.BEAR 或 CHOP
    [ 0.28,  0.17,  0.00,  0.27,  0.28 ],  // from CHOP  : 均衡发散，各方向均可
    [ 0.45,  0.05,  0.28,  0.00,  0.22 ],  // from V.BULL: 多淡化为 BULL
    [ 0.15,  0.38,  0.42,  0.05,  0.00 ],  // from Q.BEAR: 多稳定于 CHOP 或加速为 BEAR
  ];

  /* ── 情景状态 ── */
  let regimeIdx      = 2;   // 当前情景索引（默认 CHOP）
  let prevRegimeIdx  = 2;   // 过渡源情景索引
  let regimeTick     = 0;   // 当前情景已运行 ticks
  let regimeDuration = 120 + Math.floor(Math.random() * 180);  // 当前情景持续时长
  let regimeBlend    = 1.0; // 0 = 刚切换完（纯 prev），1 = 过渡完成（纯 curr）

  /* 当前 / 前一情景的属性快照（含采样噪声）
     blend() 在两者之间插值，而非直接读取 REGIMES 常量，
     使得每次进入同一情景时的实际强度略有不同。 */
  let _currSnap = { ...REGIMES[2] };  // 初始对应 CHOP，由 reset() 覆盖
  let _prevSnap = { ...REGIMES[2] };

  /* ── 辅助：对情景基准属性加噪声，生成本次进入该情景的快照 ── */
  function _sampleSnap(base) {
    return {
      ...base,   // 复制 name / color / weight / muMult / sigCap 等不扰动字段
      muAdd:    base.muAdd + REGIME_NOISE_MUADD * (Math.random() * 2 - 1),
      sigMult:  Math.max(0.10, base.sigMult  * (1 + REGIME_NOISE_SIGMULT  * (Math.random() * 2 - 1))),
      jumpMult: Math.max(0.05, base.jumpMult * (1 + REGIME_NOISE_JUMPMULT * (Math.random() * 2 - 1))),
    };
  }

  /* ── 辅助：根据转移矩阵当前行生成带噪声的归一化权重 ── */
  function _nextWeights() {
    const row = TRANSITION[regimeIdx];
    const w = row.map((base, j) => {
      if (j === regimeIdx) return 0;                                       // 对角线恒为 0
      return Math.max(0.001, base + REGIME_NOISE_WEIGHT * (Math.random() * 2 - 1));
    });
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map(x => x / sum);
  }

  /* ════════════════════════════════════════════════════════
     公开 API
  ════════════════════════════════════════════════════════ */
  window.RegimeEngine = {

    /* ── 只读暴露 ── */
    get REGIMES()      { return REGIMES; },
    get regimeIdx()    { return regimeIdx; },
    get prevRegimeIdx(){ return prevRegimeIdx; },
    get regimeBlend()  { return regimeBlend; },

    /* ════════════════════════════════════════════════════════
       step(simN)
       每 tick 推进情景计时器，超出 regimeDuration 时随机切换。
       regimeBlend 在过渡期内从 0 线性爬升到 1。
    ════════════════════════════════════════════════════════ */
    /* 返回 true 表示本 tick 发生了情景切换（供 MarketEngine 触发跳跃参数重采样） */
    step(simN) {
      regimeTick++;
      regimeBlend = Math.min(1, regimeBlend + 1 / (REGIME_TRANSITION * simN));

      if (regimeTick >= regimeDuration) {
        prevRegimeIdx = regimeIdx;
        _prevSnap     = _currSnap;

        /* 加权随机选取下一情景（权重带噪声，禁止选到同一情景） */
        const weights = _nextWeights();
        let next = regimeIdx, tries = 0;
        while (next === regimeIdx && tries++ < 20) {
          const r = Math.random();
          let cum = 0;
          for (let i = 0; i < REGIMES.length; i++) {
            cum += weights[i];
            if (r < cum) { next = i; break; }
          }
        }
        if (next === regimeIdx) return false;   // 极罕见兜底：放弃本次切换

        regimeIdx      = next;
        regimeTick     = 0;
        regimeDuration = simN * (100 + Math.floor(Math.random() * 320));
        regimeBlend    = 0;
        _currSnap      = _sampleSnap(REGIMES[regimeIdx]);
        return true;
      }
      return false;
    },

    /* ════════════════════════════════════════════════════════
       blend(prop)
       返回当前 regimeBlend 下两情景某属性的线性插值值。
       用法：RE.blend('sigMult') → 混合后的 sigMult
    ════════════════════════════════════════════════════════ */
    blend(prop) {
      return _currSnap[prop] * regimeBlend + _prevSnap[prop] * (1 - regimeBlend);
    },

    /* ════════════════════════════════════════════════════════
       applyN(simN)
       切换 simN 时重置计时器到新刻度，避免旧 N 节奏跑完。
    ════════════════════════════════════════════════════════ */
    applyN(simN) {
      regimeDuration = simN * (100 + Math.floor(Math.random() * 320));
      regimeTick     = 0;
      regimeBlend    = 1.0;
    },

    /* ════════════════════════════════════════════════════════
       reset(simN)
       完整重置情景状态（游戏 RESET 时调用）
    ════════════════════════════════════════════════════════ */
    reset(simN) {
      regimeIdx      = 2;
      prevRegimeIdx  = 2;
      regimeTick     = 0;
      regimeDuration = simN * (120 + Math.floor(Math.random() * 180));
      regimeBlend    = 1.0;
      _currSnap      = _sampleSnap(REGIMES[2]);
      _prevSnap      = _sampleSnap(REGIMES[2]);
    },
  };

})();
