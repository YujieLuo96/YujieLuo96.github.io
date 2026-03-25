/* ═══════════════════════════════════════════════════════════════════
   Market/SwanEngine.js  — 天鹅事件系统（泊松随机到达版）
   挂载为 window.SwanEngine，由 MarketEngine.js 统一调用。

   原设计使用拟周期三角函数驱动，导致事件可预测且与情景解耦。
   现改为：
     ① 泊松随机到达：每 tick 以 SWAN_BASE_PROB/simN 的概率触发新事件
     ② 情景方向偏置：muAddBlend > 0（牛市）→ 正向天鹅概率上升
     ③ 冷却期：事件结束后 SWAN_COOLDOWN_T 个 T 内不触发新事件
     ④ 随机持续时长：每次事件持续 [DUR_MIN, DUR_MAX] 个 T
     ⑤ 控制函数门控：f(t)=(π²sin(e²t)+e²cos(π²t))/(e²+π²) 须超过阈值事件才真正触发
          正向 +2：f(t) > 0.80；正向 +3：f(t) > 0.93
          负向 -2：f(t) < -0.80；负向 -3：f(t) < -0.93
   API 与原版完全兼容（step 返回结构不变）。
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     泊松到达参数
       SWAN_BASE_PROB    : 每 T（天）的基础天鹅触发概率（≈每 100 天一次，约 3-4 次/年）
       SWAN_POS_BASE     : 无情景偏置时正向天鹅基础概率（略偏负，恐慌更常见）
       SWAN_L3_POS_PROB  : 白天鹅升级为 +3 级的概率
       SWAN_L3_NEG_PROB  : 黑天鹅升级为 -3 级的概率（高于正向：崩盘比暴涨更极端）
       SWAN_DUR_MIN_T    : 事件最短持续 T 数
       SWAN_DUR_MAX_T    : 事件最长持续 T 数
       SWAN_COOLDOWN_T   : 事件结束后冷却 T 数（防止连续触发）
       SWAN_BIAS_STRENGTH: muAddBlend 对方向概率的偏置强度
       SWAN_MU_NORM      : muAddBlend 归一化参考值（= 新参数下最大 |muAdd| = 0.13）
       SWAN_FREQ_BOOST   : 极端情景下触发频率额外放大系数（|bias|=1 时最多 +50%）
  ══════════════════════════════════════════════════════════════ */
  const SWAN_BASE_PROB     = 0.014;  // ↑0.010→0.014，≈每70T一次（空闲期）；约4-5次/年有效
  const SWAN_POS_BASE      = 0.42;   // 负向天鹅略多于正向（恐慌不对称性）
  const SWAN_L3_POS_PROB   = 0.22;   // 白天鹅：22% 概率升级为 +3 级（↑0.20）
  const SWAN_L3_NEG_PROB   = 0.35;   // 黑天鹅：35% 概率升级为 -3 级↑0.30（崩盘更易极端化）
  const SWAN_DUR_MIN_T     = 3;      // 最短 3T
  const SWAN_DUR_MAX_T     = 16;     // 最长↑12→16T，极端事件持续时间延长
  const SWAN_COOLDOWN_T    = 8;      // 冷却 8T
  const SWAN_BIAS_STRENGTH = 0.28;   // 情景偏置强度（muAdd 满偏时最多 ±28%）
  const SWAN_MU_NORM       = 0.13;   // muAddBlend 归一化参考值（新 BEAR muAdd = -0.13）
  const SWAN_FREQ_BOOST    = 0.50;   // 极端情景频率加成（|bias|=1 时触发概率 ×1.5）

  /* ── 控制函数门控常量（私有，外部不可见）
     f(t) = (π²sin(e²t) + e²cos(π²t)) / (e²+π²)，值域 [-1, 1]
     π² 与 e² 不可公度 → 准周期，不形成确定性套利规律。 */
  const _CTRL_PI2           = Math.PI * Math.PI;           // π² ≈ 9.8696
  const _CTRL_E2            = Math.E  * Math.E;            // e² ≈ 7.3891
  const _CTRL_DENOM         = _CTRL_E2 + _CTRL_PI2;        // e²+π² ≈ 17.259（归一化分母）
  const SWAN_CTRL_THRESH_L2 = 0.80;  // 小天鹅（±2）门控阈值
  const SWAN_CTRL_THRESH_L3 = 0.93;  // 大天鹅（±3）门控阈值

  /* ── 天鹅事件参数表 ──
     swanGapBase : 事件触发瞬间的一次性跳空 log-return 基准值
                   （实际跳空 = base × 随机因子 0.6~1.4，模拟缺口大小不确定性）
                   负向天鹅跳空幅度故意大于正向（恐慌不对称性）。 */
  const SWAN_PARAMS = {
    // swanDriftAdd：每 T（天）额外漂移（1T=1天；持续 3-16 天，总累积 = DriftAdd × 天数）
    // swanGapBase：触发瞬间一次性跳空 log-return（参考：1987 黑色星期一 -22.6%，COVID 单日 -12%）
    '3' : { swanVolScale: 5.5, swanDriftAdd: +0.014, swanGapBase: +0.090 },  // 白天鹅大↑：+9%跳空，+1.4%/天，波动×5.5
    '2' : { swanVolScale: 4.2, swanDriftAdd: +0.007, swanGapBase: +0.045 },  // 白天鹅小↑：+4.5%跳空，+0.7%/天
    '-2': { swanVolScale: 5.2, swanDriftAdd: -0.011, swanGapBase: -0.090 },  // 黑天鹅小↑：-9%跳空，-1.1%/天
    '-3': { swanVolScale: 8.0, swanDriftAdd: -0.024, swanGapBase: -0.160 },  // 黑天鹅大↑：-16%跳空，-2.4%/天（崩盘级）
  };

  /* ── 控制函数（私有辅助）：f(t) ∈ [-1, 1] ── */
  function _swanCtrl(t) {
    return (_CTRL_PI2 * Math.sin(_CTRL_E2 * t) + _CTRL_E2 * Math.cos(_CTRL_PI2 * t)) / _CTRL_DENOM;
  }

  /* ── 状态 ── */
  let swanLevel     = 0;
  let prevSwanLevel = 0;
  let swanTOffset   = 1 + Math.floor(Math.random() * 2999);  // 保留兼容性
  let _ticksLeft    = 0;   // 当前事件剩余 tick 数
  let _cooldownLeft = 0;   // 冷却剩余 tick 数

  /* ════════════════════════════════════════════════════════
     公开 API
  ════════════════════════════════════════════════════════ */
  window.SwanEngine = {

    get swanLevel()   { return swanLevel; },
    get swanTOffset() { return swanTOffset; },

    /* ════════════════════════════════════════════════════════
       step(totalTicks, simN, muAddBlend)
       检测天鹅事件等级，返回本 tick 的价格参数修正对象：
         swanVolScale — 波动率放大系数（乘以 sigma_t·diffusion）
         swanDriftAdd — 每 T 目标漂移偏置（÷simN 换算到每 tick）
         swanVolBoost — 成交量放大系数
         changed      — true = swanLevel 刚进入新状态（触发 Toast）

       muAddBlend（可选）：当前情景混合的年化漂移偏置，
         正值（牛市）→ 正向天鹅概率上升，负值（熊市）→ 负向概率上升。
    ════════════════════════════════════════════════════════ */
    step(totalTicks, simN, muAddBlend = 0) {
      prevSwanLevel = swanLevel;

      if (_ticksLeft > 0) {
        /* 事件进行中：倒计时，结束时清零并进入冷却 */
        _ticksLeft--;
        if (_ticksLeft === 0) {
          swanLevel     = 0;
          _cooldownLeft = SWAN_COOLDOWN_T * simN;
        }
      } else if (_cooldownLeft > 0) {
        /* 冷却期：不触发新事件 */
        _cooldownLeft--;
      } else {
        /* 泊松到达检测（每 tick 独立伯努利试验）
           ① 归一化 bias：参考值改为 SWAN_MU_NORM=0.13，匹配新参数下最大 |muAdd|
           ② 频率情景感知：极端情景（|bias| 越大）触发概率越高（最多 ×1.5），
              模拟 BEAR / V.BULL 期间市场更容易出现极端事件 */
        const bias      = Math.max(-1, Math.min(1, muAddBlend / SWAN_MU_NORM));
        const freqMult  = 1 + SWAN_FREQ_BOOST * Math.abs(bias);
        if (Math.random() < SWAN_BASE_PROB * freqMult / simN) {
          /* ③ 方向概率：情景偏置调整白/黑天鹅比例 */
          const posProb    = Math.min(0.85, Math.max(0.15,
                               SWAN_POS_BASE + bias * SWAN_BIAS_STRENGTH));
          const isPositive = Math.random() < posProb;

          /* ④ 等级不对称：黑天鹅升级为 -3 的概率（30%）高于白天鹅升级为 +3（20%） */
          const isLevel3  = Math.random() < (isPositive ? SWAN_L3_POS_PROB : SWAN_L3_NEG_PROB);
          const proposed  = isPositive ? (isLevel3 ? 3 : 2) : (isLevel3 ? -3 : -2);

          /* ⑤ 控制函数门控：计算 f(totalTicks + swanTOffset)，按拟触发等级选取阈值后判断
             正向：f(t) > threshold；负向：f(t) < -threshold
             swanTOffset 在每局 reset() 时随机化，保证每局起始相位不同，防止早期天鹅规律固化。
             未通过时静默忽略（不写 swanLevel / _ticksLeft，不进入冷却，下 tick 可再试） */
          const threshold = (proposed === 3 || proposed === -3)
                            ? SWAN_CTRL_THRESH_L3 : SWAN_CTRL_THRESH_L2;
          const ctrl      = _swanCtrl(totalTicks + swanTOffset);
          const passes    = proposed > 0 ? ctrl > threshold : ctrl < -threshold;

          if (passes) {
            swanLevel  = proposed;
            _ticksLeft = Math.ceil(
              (SWAN_DUR_MIN_T + Math.random() * (SWAN_DUR_MAX_T - SWAN_DUR_MIN_T)) * simN
            );
          }
        }
      }

      const p          = SWAN_PARAMS[swanLevel];
      const swanVolScale = p ? p.swanVolScale : 1.0;
      const swanDriftAdd = p ? p.swanDriftAdd : 0;
      const swanVolBoost = swanLevel !== 0 ? swanVolScale * 1.4 : 1.0;
      const changed      = swanLevel !== 0 && swanLevel !== prevSwanLevel;

      /* 跳空缺口：仅在事件刚触发的第一个 tick（changed=true）施加一次性跳空。
         随机因子 [0.6, 1.4] 模拟缺口大小的不确定性；方向由 swanGapBase 符号决定。 */
      const swanGap = (changed && p)
        ? p.swanGapBase * (0.6 + 0.8 * Math.random())
        : 0;

      return { swanVolScale, swanDriftAdd, swanVolBoost, changed, swanGap };
    },

    /* ════════════════════════════════════════════════════════
       reset()
       完整重置天鹅状态（游戏 RESET 时调用）
    ════════════════════════════════════════════════════════ */
    reset() {
      swanLevel     = 0;
      prevSwanLevel = 0;
      swanTOffset   = 1 + Math.floor(Math.random() * 2999);
      _ticksLeft    = 0;
      _cooldownLeft = 0;
    },
  };

})();
