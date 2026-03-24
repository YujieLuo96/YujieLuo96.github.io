/* ═══════════════════════════════════════════════════════════════════
   Market/MarketHub.js  — 市场引擎总线

   统一代理接口，自动汇总所有注册的市场引擎。
   调用方只需 window.MarketEngine（或 window.MarketHub），
   无需关心底层是哪个引擎，切换引擎只需 setActiveEngine(id)。

   ── 添加新引擎只需两步 ──
     1. 在 TradingSimulator.html 中于本文件之前引入引擎 JS
     2. 在下方 _ENGINES 数组中追加条目：{ id, name, engine }

   ── 接口扩展 ──
     hub.getEngineList()         → [{id, name}, ...]（供 UI 动态生成切换按钮）
     hub.getActiveEngineId()     → 当前引擎 id
     hub.setActiveEngine(id)     → 切换引擎（同步用户参数，调用方负责 resetGame）
     hub.notifyTrade(dir, shares)→ 玩家信号注入（引擎不支持时静默忽略）

   挂载为 window.MarketHub，同时设置 window.MarketEngine 别名（向后兼容）。
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     注册表
     每条目：{ id: string, name: string, engine: window.XxxMarketEngine }
       id   — setActiveEngine / HTML data-engine 属性使用
       name — Markets 菜单显示文字
  ══════════════════════════════════════════════════════════════ */
  const _ENGINES = [
    { id: 'ordinary', name: 'ORDINARY',    engine: window.OrdinaryMarketEngine  },
    { id: 'opp',      name: 'OPP MARKET',  engine: window.OppMarketEngine       },
    { id: 'follow',   name: 'FOLLOW MKT',  engine: window.FollowMarketEngine    },
    { id: 'storm',    name: 'STORM',        engine: window.StormMarketEngine     },
  ];

  /* ── 当前活跃引擎（默认第一个） ── */
  let _active   = _ENGINES[0].engine;
  let _activeId = _ENGINES[0].id;

  /* ════════════════════════════════════════════════════════════
     Hub 对象
  ════════════════════════════════════════════════════════════ */
  const hub = {

    /* ── 引擎管理 API ──────────────────────────────────────────── */

    /** 返回所有注册引擎的简要列表（只含 id 和 name，不暴露引擎内部对象） */
    getEngineList() {
      return _ENGINES.map(e => ({ id: e.id, name: e.name }));
    },

    /** 返回当前活跃引擎的 id */
    getActiveEngineId() {
      return _activeId;
    },

    /**
     * 切换到指定引擎。
     *   - 自动将当前引擎的 mu_user / sigma_user 同步到新引擎
     *   - 不调用 reset：由调用方在切换后执行 resetGame()
     * @param {string} id  目标引擎 id
     */
    setActiveEngine(id) {
      const entry = _ENGINES.find(e => e.id === id);
      if (!entry) { console.warn('[MarketHub] Unknown engine id:', id); return; }
      if (entry.engine === _active) return;   // 已是当前引擎，无需切换
      /* 将用户参数迁移到新引擎，保持滑块设置连续 */
      entry.engine.mu_user    = _active.mu_user;
      entry.engine.sigma_user = _active.sigma_user;
      _active   = entry.engine;
      _activeId = id;
    },

    /**
     * 玩家信号注入 — 在玩家开仓时由 TradingSimulator 调用。
     *   direction : +1 = 买入/做多，-1 = 卖出/做空
     *   shares    : 开仓数量
     * 如果活跃引擎未实现 notifyTrade，静默忽略。
     */
    notifyTrade(direction, shares) {
      if (typeof _active.notifyTrade === 'function') {
        _active.notifyTrade(direction, shares);
      }
    },

    /* ── 代理：常量 ───────────────────────────────────────────── */
    get REGIMES()    { return _active.REGIMES; },
    get JUMP_PROB()  { return _active.JUMP_PROB; },
    get JUMP_MEAN()  { return _active.JUMP_MEAN; },
    get JUMP_STD()   { return _active.JUMP_STD; },
    get SR_PERIODS() { return _active.SR_PERIODS; },

    /* ── 代理：用户参数（读写） ──────────────────────────────── */
    get mu_user()    { return _active.mu_user; },
    set mu_user(v)   { _active.mu_user = v; },
    get sigma_user() { return _active.sigma_user; },
    set sigma_user(v){ _active.sigma_user = v; },

    /* ── 代理：衍生状态（只读） ──────────────────────────────── */
    get mu_base()           { return _active.mu_base; },
    get sigma_base()        { return _active.sigma_base; },
    get mu_t()              { return _active.mu_t; },
    get sigma_t()           { return _active.sigma_t; },
    get effectiveJumpProb() { return _active.effectiveJumpProb; },
    get longEma()           { return _active.longEma; },
    get refPrice()          { return _active.refPrice; },

    /* ── 代理：情景状态 ──────────────────────────────────────── */
    get regimeIdx()     { return _active.regimeIdx; },
    get prevRegimeIdx() { return _active.prevRegimeIdx; },
    get regimeBlend()   { return _active.regimeBlend; },

    /* ── 代理：天鹅状态 ──────────────────────────────────────── */
    get swanLevel()   { return _active.swanLevel; },
    get swanTOffset() { return _active.swanTOffset; },

    /* ── 代理：S/R ───────────────────────────────────────────── */
    get srEmaValues()  { return _active.srEmaValues; },
    get srPrevSide()   { return _active.srPrevSide; },
    get srBreakDrift() { return _active.srBreakDrift; },
    set srBreakDrift(v){ _active.srBreakDrift = v; },

    /* ── 代理：方法 ──────────────────────────────────────────── */
    updateSREMA(price) {
      return _active.updateSREMA(price);
    },
    applyN(simN) {
      return _active.applyN(simN);
    },
    reset(simN) {
      return _active.reset(simN);
    },
    stepPriceCore(currentPrice, totalTicks, simN, dt, normalRandom) {
      return _active.stepPriceCore(currentPrice, totalTicks, simN, dt, normalRandom);
    },
    warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume) {
      return _active.warmup(simN, dt, normalRandom, outOhlc, outPrice, outVolume);
    },
  };

  /* 向后兼容：原有代码使用 window.MarketEngine 的部分无需修改 */
  window.MarketHub    = hub;
  window.MarketEngine = hub;

})();
