# 市场引擎设计说明

> 文件覆盖：`OrdinaryMarketEngine.js` / `RegimeEngine.js` / `SwanEngine.js` / `SREngine.js`
> 基准参数（见 `MarketConfig.js`）：`mu_user = 0.30`，`sigma_user = 0.25`，`simN = 20`，`1T = 1/365 年`
> ⚠ 参数一律以代码为准；本文数值与代码同步于最近一次校准（含天鹅门控阈值 Monte Carlo 实测）。

---

## 一、系统总览

每一个 tick，价格更新由以下七种力叠加而成（均在对数价格空间）：

```
log(P_{t+1}/P_t) =
    drift·dt                     ← 随机漂移（OU）
  + sigma_t·swanVolScale·√dt·W1  ← 扩散（GBM diffusion，复用杠杆效应 W1）
  + jump                         ← Merton 跳跃（含聚类、肥尾、情景偏置）
  + swanDriftAdd/N               ← 天鹅事件持续漂移偏置
  + swanGap                      ← 天鹅跳空（仅触发第一 tick）
  + srForce                      ← 支撑/压力位合力
  + momentumForce                ← 行为动量反转力
  + meanRevForce                 ← 长期均值回归力（OU）
```

其中 `dt = DT_BASE/simN = (1/365)/simN` 年，每 T（= 1 天）有 `simN` 个 tick。

---

## 二、随机参数：Heston 风格双 OU 过程

### 2.1 波动率过程 σ_t（含杠杆效应）

```
σ_{t+dt} = clamp(
    σ_t + κ_v·(σ_base − σ_t)·dt + ν·σ_t·W2·√dt,
    σ_min, σ_max
)
```

| 符号 | 含义 | 参数 | 值 |
|------|------|------|----|
| κ_v | 波动率均值回归速度 | `VOL_KAPPA` | 2.5 |
| ν | Vol-of-Vol（波动率的波动率） | `VOL_OF_VOL` | 0.70 |
| σ_base | 情景混合基准波动率 | `sigma_user × blend(sigMult)` | 见 §4 |
| σ_min | 最低波动率 | `sigma_user × 0.30` | ≈0.075 |
| σ_max | 情景感知上界 | `sigma_user × blend(sigCap)` | 见 §4 |
| W2 | 与价格负相关的噪声 | Cholesky 变换 | 见 §2.3 |

**半衰期**：σ_t 向 σ_base 收敛的半衰期 = ln(2)/κ_v ≈ **0.28 年 ≈ 101 T**（年化速率作用于模型时间 dt = 1/365/N）。

### 2.2 漂移过程 μ_t

```
μ_{t+dt} = clamp(
    μ_t + κ_d·(μ_base − μ_t)·dt + ξ·Z·√dt,
    −0.8, 0.8
)
```

| 符号 | 含义 | 参数 | 值 |
|------|------|------|----|
| κ_d | 漂移均值回归速度 | `DRIFT_KAPPA` | 0.8 |
| ξ | 漂移随机扰动强度 | `DRIFT_VOL` | 0.15 |
| μ_base | 情景混合基准漂移 | `mu_user·blend(muMult) + blend(muAdd)` | 见 §4 |
| Z | 独立标准正态 | 独立采样 | — |

**半衰期**：μ_t 向 μ_base 收敛的半衰期 = ln(2)/κ_d ≈ **0.87 年 ≈ 316 T**。

### 2.3 杠杆效应（Leverage Effect，Cholesky 分解）

```
W1 ~ N(0,1)                          ← 价格扩散噪声
Z2 ~ N(0,1)（独立）
W2 = ρ·W1 + √(1−ρ²)·Z2              ← 波动率扰动噪声
```

| 参数 | 值 | 含义 |
|------|----|------|
| `LEVERAGE_RHO` ρ | −0.65 | 价格-波动率负相关 |
| `LEVERAGE_SQRT1RHO2` √(1−ρ²) | ≈0.7599 | Cholesky 正交分量 |

**效果**：当价格上涨（W1 > 0）时，W2 倾向于为负 → σ_t 受到向下扰动；当价格下跌（W1 < 0）时，σ_t 倾向于上升，即"跌时波动率放大"的真实市场现象。

---

## 三、GBM 价格更新

```
drift = μ_t − ½·σ_t²
diffusion = σ_t·swanVolScale·√dt·W1
rawLogRet = drift·dt + diffusion + jump
```

`W1` 由 `_stepStochasticParams` 返回，在 diffusion 和波动率 OU 中共享同一随机数，是杠杆效应的核心机制。

**每 tick 对数收益标准差**（无跳跃、无天鹅、无修正力时）：

```
std(log-ret per tick) = σ_t·swanVolScale·√dt = σ_t·swanVolScale / √(365·simN)
```

典型值（V.BULL，σ_t≈0.40，N=20）：`0.40 / √7300 ≈ 0.47%`（每 tick），
对应每 T（天）≈ `0.40/√365 ≈ 2.1%` 的日内噪声。

---

## 四、情景切换系统（RegimeEngine）

### 4.1 五种情景参数表

| 情景 | muMult | muAdd | sigMult | sigCap | jumpMult | meanRevMult | P_eq≈ |
|------|--------|-------|---------|--------|----------|-------------|-------|
| BULL | 0.50 | +0.10 | 1.05 | 1.7 | 0.6 | 0.60 | 422 |
| BEAR | 0.50 | −0.08 | 1.40 | 2.0 | 1.8 | 0.50 | 74 |
| CHOP | 0.08 | 0.00 | 0.50 | 1.2 | 0.5 | 0.90 | 107 |
| V.BULL | 0.60 | +0.08 | 1.60 | 2.5 | 1.0 | 0.60 | 332 |
| Q.BEAR | 0.30 | −0.05 | 0.70 | 1.8 | 1.3 | 0.50 | 93 |

**均衡价格公式**（完整版含 Itô 修正与跳跃拖拽，推导见 §7 与 `RegimeEngine.js` 头注释）：
```
log(P_eq/refPrice) = (μ_base − ½σ̄² + E[jumps/year]) / (κ₀ × meanRevMult)
μ_base = mu_user × muMult + muAdd        （mu_user = 0.30 基准）
κ₀ = MEAN_REV_KAPPA0 = 0.25
```
上表 P_eq 以 mu_user=0.30、sigma_user=0.25、refPrice≈100 计。

### 4.2 情景混合插值

情景切换时，两个情景之间在 `REGIME_TRANSITION = 30 T` 内线性插值：

```
blend(prop) = currSnap[prop] × α + prevSnap[prop] × (1−α)
α = regimeBlend ∈ [0,1]，每 tick 增加 1/(30×N)
```

所有情景参数（sigMult、muAdd、jumpMult、meanRevMult 等）均通过此插值传递给其他引擎，避免参数突变。

### 4.3 情景属性噪声（每次切换时重新采样）

```
muAdd_actual    = muAdd    + U[−0.020, +0.020]
sigMult_actual  = sigMult  × (1 + U[−0.20, +0.20])
jumpMult_actual = jumpMult × (1 + U[−0.30, +0.30])
```

同一情景每次进入时强度略有不同，防止玩家记忆规律。

### 4.4 Markov 转移矩阵

```
          BULL   BEAR   CHOP  V.BULL Q.BEAR
BULL   [  0.00,  0.10,  0.30,  0.40,  0.20 ]
BEAR   [  0.10,  0.00,  0.40,  0.05,  0.45 ]
CHOP   [  0.28,  0.17,  0.00,  0.27,  0.28 ]
V.BULL [  0.45,  0.05,  0.28,  0.00,  0.22 ]
Q.BEAR [  0.15,  0.38,  0.42,  0.05,  0.00 ]
```

每行加上权重噪声 `U[−0.05, +0.05]` 后归一化，再按轮盘赌采样下一情景。

---

## 五、跳跃扩散（Enhanced Merton Jump-Diffusion）

### 5.1 基础跳跃

每 tick 以 `totalJumpProb/simN` 的概率触发跳跃：

```
totalJumpProb = effectiveJumpProb × _jumpProbFactor + jumpCluster

effectiveJumpProb = JUMP_PROB × blend(jumpMult) × _jumpProbFactor（两层噪声）
```

跳跃大小：
```
volRatio = σ_t / σ_user               ← 与当前波动率正相关
jumpMean = JUMP_MEAN + _jumpMeanOffset ± JUMP_BEAR_BIAS（熊市时额外负偏）
jump = jumpMean + JUMP_STD × _jumpStdFactor × volRatio × Z
```

| 参数 | 值 | 含义 |
|------|----|------|
| `JUMP_PROB` | 0.018 | 每 T 基础跳跃概率（≈6.6 次/年；BEAR ≈12 次/年） |
| `JUMP_MEAN` | 0.000 | 跳跃均值中性（方向由肥尾 / 熊市偏置决定） |
| `JUMP_STD` | 0.06 | 跳跃标准差 |
| `JUMP_BEAR_THRESH` | −0.03 | 触发熊市负偏的 muAdd 阈值 |
| `JUMP_BEAR_BIAS` | 0.006 | 熊市额外负偏量（JUMP_MEAN=0 时是唯一系统性方向来源） |

**跳跃参数噪声**（每次情景切换时重采样）：
```
_jumpProbFactor = clamp(1 + U[−0.30,+0.30], 0.30, ∞)  → JUMP_PROB ×[0.7, 1.3]
_jumpMeanOffset = U[−0.003, +0.003]
_jumpStdFactor  = clamp(1 + U[−0.20,+0.20], 0.30, ∞)  → JUMP_STD ×[0.8, 1.2]
```

### 5.2 跳跃聚类（危机传染）

```
发生跳跃时：jumpCluster += JUMP_CLUSTER_BOOST (=0.07)，上限 JUMP_CLUSTER_MAX = 0.18
每 tick：   jumpCluster *= _jumpClusterDecayPerTick
            _jumpClusterDecayPerTick = JUMP_CLUSTER_DECAY^(1/N) = 0.78^(1/20) ≈ 0.9877
```

一次跳跃后，下一 T 的跳跃概率从 ≈1.8% 升至最高 **≈20%**（基础 + 0.18 聚类上限），随后按每 T ×0.78 指数衰减回基准（半衰期 ≈ 2.8 T）。

### 5.3 肥尾放大器（Fat-tail Amplifier）

```
以 12% 概率，在已触发的跳跃上额外叠加：
  tailMag = Exp(JUMP_FAT_TAIL_SCALE=0.08)   ← 指数分布
  方向：75% 向下（−tailMag），25% 向上（+tailMag）
```

此机制使跳跃分布呈现左偏厚尾，模拟崩盘/熔断的极端事件。

---

## 六、黑白天鹅系统（SwanEngine）

### 6.1 六步触发漏斗

```
① 状态机门控
   - 事件进行中（_ticksLeft > 0）：倒计时，结束进入冷却
   - 冷却期（_cooldownLeft > 0）：禁止触发，倒计时
   - 空闲：进入触发检测

② 泊松到达（情景感知频率）
   bias = clamp(muAddBlend / 0.10, −1, 1)    ← SWAN_MU_NORM = 当前情景表最大 |muAdd|
   freqMult = 1 + 0.50 × |bias|             ← 极端情景最多 ×1.5
   触发概率/tick = SWAN_BASE_PROB × freqMult / N = 0.014×freqMult/N

③ 方向概率（情景偏置）
   posProb = clamp(0.42 + bias × 0.28, 0.15, 0.85)
   牛市(bias→+1) → posProb≈0.70；熊市(bias→−1) → posProb≈0.15

④ 等级不对称
   白天鹅升级为+3的概率：22%
   黑天鹅升级为-3的概率：35%（崩盘比暴涨更易极端化）

⑤ 控制函数门控
   f(t) = (π²·sin(e²·t) + e²·cos(π²·t)) / (e²+π²)，t = totalTicks + swanTOffset
   正向：+2 需 f(t) > 0.50；+3 需 f(t) > 0.75
   负向：−2 需 f(t) < −0.50；−3 需 f(t) < −0.75
   π² ≈ 9.870，e² ≈ 7.389（不可公度 → 准周期，无确定性套利规律）
   阈值按整数 tick 采样的实测分布校准：P(f>0.50)≈18.8%，P(f>0.75)≈8.7%
   （旧阈值 0.80/0.93 的实际通过率仅 6.8%/2.3%，事件比设计稀有约 3 倍）

⑥ 确认触发
   swanLevel = proposed，_ticksLeft = ceil(U[3,16]·N)
```

### 6.2 事件参数表

| 等级 | 每 T 漂移偏置 | 波动率放大 | 跳空（基准） | 随机因子 |
|------|-------------|-----------|-------------|---------|
| +3（白天鹅大） | +1.4%/T | ×5.5 | +9% | ×U[0.6,1.4] |
| +2（白天鹅小） | +0.7%/T | ×4.2 | +4.5% | ×U[0.6,1.4] |
| −2（黑天鹅小） | −1.1%/T | ×5.2 | −9% | ×U[0.6,1.4] |
| −3（黑天鹅大） | −2.4%/T | ×8.0 | −16% | ×U[0.6,1.4] |

**跳空**仅在事件触发的第一个 tick 施加（`changed=true`），之后仅有持续漂移偏置和波动率放大。
（跳空基准参考：1987 黑色星期一 −22.6%，COVID 单日 −12%。）

### 6.3 冷却参数

| 参数 | 值 | 含义 |
|------|----|------|
| `SWAN_COOLDOWN_T` | 8 T | 事件结束后禁止触发新事件 |
| `SWAN_DUR_MIN_T` | 3 T | 事件最短持续时间 |
| `SWAN_DUR_MAX_T` | 16 T | 事件最长持续时间 |

---

## 七、长期均值回归（Price-Level OU）

### 7.1 每 tick 回归力

```
meanRevForce = −κ₀ × blend(meanRevMult) × (1 ± 0.15) × log(P/refPrice) × dt
```

| 参数 | 值 | 含义 |
|------|----|------|
| `MEAN_REV_KAPPA0` | 0.25 | 年化 OU 回归速度 |
| `MEAN_REV_NOISE` | 0.15 | ±15% 随机扰动（防确定性套利） |
| `blend(meanRevMult)` | 情景值 | 放大/缩小回归速度 |

### 7.2 均衡价格推导

在稳定状态下，均值回归力与持续漂移均衡：

```
κ₀ × meanRevMult × log(P_eq/refPrice) × dt = μ_base × dt

⟹ P_eq = refPrice × exp( μ_base / (κ₀ × meanRevMult) )

μ_base = mu_user × muMult + muAdd
```

| 情景 | μ_base（mu_user=0.30） | κ₀×meanRevMult | P_eq（refPrice≈100，含 Itô/跳跃修正） |
|------|----------------------|---------------|---------------------|
| CHOP | 0.30×0.08+0 = 0.024 | 0.25×0.90 = 0.225 | ≈107 |
| BULL | 0.30×0.50+0.10 = 0.25 | 0.25×0.60 = 0.150 | ≈422 |
| V.BULL | 0.30×0.60+0.08 = 0.26 | 0.25×0.60 = 0.150 | ≈332 |
| Q.BEAR | 0.30×0.30−0.05 = 0.04 | 0.25×0.50 = 0.125 | ≈93 |
| BEAR | 0.30×0.50−0.08 = 0.07 | 0.25×0.50 = 0.125 | ≈74 |

（BEAR/Q.BEAR 的 μ_base 名义为正，但 Itô 修正 −½σ̄² 与负向跳跃期望使净漂移为负，
 推导细节见 `RegimeEngine.js` 各情景头注释。）

### 7.3 refPrice 锚

```
refPrice_{t+1} = refPrice_t + k × (P_t − refPrice_t)
k = 2 / (MEAN_REV_SLOW_T × simN + 1) = 2/(5000×20+1) ≈ 2×10⁻⁵
```

EMA 周期对应 **5000 T**（`MarketConfig.MEAN_REV_SLOW_T`），游戏期间几乎不移动，是稳定的价格锚。

---

## 八、支撑 / 压力位系统（SREngine）

三条 EMA（周期 20 / 55 / 120 T）作为动态 S/R 水平线，对价格施加两类力：

### 8.1 近区回归阻力

当 `|d| < SR_ZONE`（d = (P−EMA)/EMA）时：
```
srForce += side × SR_MAX_FORCE × (1/N) × (1 − |d|/SR_ZONE) × proxBoost
proxBoost = 1 + min(1, touchCount / (TOUCH_PROX_T×N))   ← 最多 ×2
```

| 参数 | 值 | 含义 |
|------|----|------|
| `SR_ZONE` | 0.018 | 近区边界（±1.8%） |
| `SR_MAX_FORCE` | 0.0015 | 最大近区力（≈11% 日均噪声，1T=1天校准） |
| `TOUCH_PROX_T` | 8 T | 饱和所需停留时长 |

### 8.2 突破动量

价格穿越 EMA（side 翻转）时：
```
srBreakDrift += side × SR_BREAK_BASE × √(period/20) × breakBoost
breakBoost = 1 + min(1, touchCount / (TOUCH_BREAK_T×N)) × 3   ← 最多 ×4
```

突破动量按每 tick 系数 `SR_BREAK_DECAY^(1/N)` 指数衰减，保证 N 个 tick（1 T）后总衰减恒为 0.82。

| 参数 | 值 | 含义 |
|------|----|------|
| `SR_BREAK_BASE` | 0.0025 | 突破动量基础力（20周期 EMA，1T=1天校准） |
| `SR_BREAK_DECAY` | 0.82 | 每 T 的动量衰减系数 |
| `TOUCH_BREAK_T` | 5 T | 突破力饱和所需停留时长 |

**三条 EMA 的突破力对比**（√(period/20)）：
- 20 T EMA：×1.0
- 55 T EMA：×1.66
- 120 T EMA：×2.45

---

## 九、行为动量反转（Momentum Reversal）

```
每 tick：momentumScore = momentumScore × MOMENTUM_DECAY^(1/N) + sign(rawLogRet)/N

当 |momentumScore| > MOMENTUM_THRESH：
    momentumForce = −sign(momentumScore) × (MOMENTUM_FORCE/N)
                    × min(1, (|score| − THRESH) / THRESH)
```

| 参数 | 值 | 含义 |
|------|----|------|
| `MOMENTUM_DECAY` | 0.92 | 每 T 衰减，半衰期 ≈ 8.3 T |
| `MOMENTUM_THRESH` | 1.5 | 连续趋势约 1.5 T 后触发 |
| `MOMENTUM_FORCE` | 0.0020 | 最大反转力（per T，1T=1天校准） |

`rawLogRet` 使用未修正的 diffusion+jump，避免修正力触发自身反馈循环。

---

## 十、N 无关性保证

所有以"每 T"为语义定义的力，在实现时均通过 `÷N` 或 `^(1/N)` 转换：

| 机制 | N 无关性实现方式 |
|------|----------------|
| 跳跃概率 | `totalJumpProb / N` |
| 跳跃聚类衰减 | `_jumpClusterDecayPerTick = JUMP_CLUSTER_DECAY^(1/N)` |
| 动量衰减 | `_momentumDecayPerTick = MOMENTUM_DECAY^(1/N)` |
| 动量力 | `MOMENTUM_FORCE / N` |
| SR 近区力 | `SR_MAX_FORCE × (1/N)` |
| SR 突破衰减 | `_srDecay = SR_BREAK_DECAY^(1/N)` |
| 情景过渡 | `regimeBlend += 1/(REGIME_TRANSITION×N)` |
| 均值回归力 | `dt = 1/N` 天然含 `1/N` |
| 天鹅触发概率 | `SWAN_BASE_PROB / N` |
| 天鹅持续时长 | `U[DUR_MIN, DUR_MAX] × N`（tick 数） |
| 天鹅冷却 | `SWAN_COOLDOWN_T × N`（tick 数） |
| SR 自适应饱和 | `TOUCH_PROX_T × N`（tick 数） |

---

## 十一、Warmup 设计

游戏开始前预热 `WARMUP_T × N` 个 tick（`MarketConfig.WARMUP_T = 3000 T ≈ 8 年`），目的：

1. **SR EMA 收敛**：20/55/120 T 的 EMA 需足够 tick 数才能反映真实价格水平
2. **refPrice 稳定**：超慢 EMA（5000 T 周期）在 warmup 内初步建立锚点
3. **价格分布自然化**：从固定初始价 100 开始随机游走，到游戏时价格已处于"自然分布"
4. **图表历史填充**：warmup 产出的 OHLC 直接作为开局可见历史

Warmup 与游戏期使用**完全相同的 `stepPriceCore` 十步逻辑**（含情景切换、天鹅、S/R、
跳跃聚类等全部机制），保证开局图表的统计性质与游戏期无缝衔接。
3000 T 的长度足以初始化各 EMA，又不足以在系统性负漂移情景中累积出极端低价。

---

## 十二、参数修改指南

### 12.1 调整价格波动幅度

主要旋钮：`sigma_user`（UI 滑块）

```
sigma_user 变化时，必须同步考虑：
  ① sigMult（决定 sigma_base = sigma_user × sigMult）→ 已按 sigma=0.25 校准
  ② sigCap（决定 sigma_t 上界 = sigma_user × sigCap）
  ③ SR_MAX_FORCE / SR_BREAK_BASE（应与 sigma 量级匹配）
  ④ MOMENTUM_FORCE（应与 sigma 量级匹配）
  ⑤ SWAN swanGapBase（已按 sigma=0.25 基准设计）
```

经验比例（1T=1天，sigma_user=0.25，日均噪声≈1.31%）：
```
SR_MAX_FORCE   ≈ 0.006 × sigma_user   → sigma=0.25 时 ≈ 0.0015（≈11% 日均噪声）
SR_BREAK_BASE  ≈ 0.010 × sigma_user   → sigma=0.25 时 ≈ 0.0025
MOMENTUM_FORCE ≈ 0.008 × sigma_user   → sigma=0.25 时 ≈ 0.0020（≈15% 日均噪声）
```

### 12.2 调整情景均衡价格

修改 `meanRevMult` 或 `muAdd`（RegimeEngine.js）：

```
P_eq = refPrice × exp( (mu_user×muMult + muAdd) / (0.25 × meanRevMult) )

提高 P_eq → 减小 meanRevMult 或增大 muAdd（方向为正）
降低 P_eq → 增大 meanRevMult 或减小 muAdd（方向为负）
```

### 12.3 调整天鹅触发频率

提案频率约 **每 71 T 一次**（空闲期）：
```
期望提案间隔 = 1 / (SWAN_BASE_PROB × freqMult)
            = 1 / (0.014 × freqMult) T
```

控制函数门控将提案稀释为实际触发（实测：f > 0.50 的时间比例 ≈18.8%，> 0.75 ≈8.7%），
小天鹅有效间隔 ≈ 1/(0.014×0.188) ≈ **380 T**，再叠加事件时长（3-16 T）与冷却（8 T）。

### 12.4 调整跳跃强度

```
每 T 期望跳跃概率（BEAR 情景为例）：
  概率 = JUMP_PROB × jumpMult_BEAR × _jumpProbFactor ≈ 0.018×1.8×1.0 = 0.032/T
  大小 ≈ |JUMP_MEAN + JUMP_BEAR_BIAS| + JUMP_STD × volRatio
       ≈ 0.006 + 0.06×(sigma_t/0.25)

增大跳跃幅度 → JUMP_STD ↑
增大跳跃频率 → JUMP_PROB ↑ 或 jumpMult ↑
增大极端尾部 → JUMP_FAT_TAIL_SCALE ↑ 或 JUMP_FAT_TAIL_PROB ↑
```

---

## 十三、依赖关系图

```
sigma_user ──┬──→ sigma_base = sigma_user × blend(sigMult)
             │         └──→ σ_t（OU 均值）
             ├──→ sigMin = sigma_user × 0.30
             ├──→ sigMax = sigma_user × blend(sigCap)
             └──→ volRatio = σ_t / sigma_user → jump 大小

mu_user ─────┬──→ mu_base = mu_user × blend(muMult) + blend(muAdd)
             │         └──→ μ_t（OU 均值）→ drift
             └──→ P_eq（通过 meanRevMult 计算）

blend(×) ────← regimeBlend（情景过渡插值权重）
              ← currSnap / prevSnap（含各情景参数 + 噪声采样）

MEAN_REV_KAPPA0 × blend(meanRevMult) × (1 ± noise) → meanRevForce
                  ↑ 情景决定均衡价格位置

JUMP_PROB × blend(jumpMult) × _jumpProbFactor
+ jumpCluster（聚类残余）
÷ simN → per-tick 跳跃概率

SwanEngine.step() ← RE.blend('muAdd')（方向偏置 + 频率感知）
                  → swanVolScale → σ_t × swanVolScale（diffusion 放大）
                  → swanDriftAdd / N（持续漂移偏置）
                  → swanGap（一次性跳空，changed=true 时）

SREngine ← updateEMA(newPrice)（每 tick 价格确定后更新）
         → computeForce(currentPrice)（每 tick 计算 srForce）
```
