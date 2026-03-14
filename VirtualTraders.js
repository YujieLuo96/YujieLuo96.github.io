/**
 * VirtualTraders.js  v2
 * Virtual trader simulation module — multiple independent AI bots.
 *
 * UI: one toggle button in the page → expands an inline panel with
 *     START ALL / STOP ALL / ADD TRADER / LEADERBOARD + trader cards.
 *     All detail / add / edit modals are overlays.
 *
 * Public API (window.VirtualTraders):
 *   .init(ctx)  — call after resetGame(); injects CSS + HTML
 *   .tick()     — call from stepPrice() each market tick
 */
(function (G) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════
     CONSTANTS
  ═══════════════════════════════════════════════════════════════════ */
  const COLORS = [
    '#00f5ff','#ff2d78','#f5e642','#39ff14','#ff6b35',
    '#b44fff','#ff9f1c','#2de2e6','#e040fb','#00e676',
  ];

  const FEE_RATE   = 0.0008;
  const FEE_FIXED  = 1;
  const MAINT      = 0.05;
  const MAX_HIST   = 200;
  const MAX_EQ     = 500;

  /* ── Built-in strategy presets ──────────────────────────────────── */
  const PRESETS = {
    'MA Cross': {
      desc: 'SMA(5/20) crossover — classic trend-following',
      code:
`// MA Cross: SMA(5) vs SMA(20)
var fast = sma(close, 5);
var slow = sma(close, 20);
if (crossover(fast, slow)) {
  strategy.closeAll();
  strategy.entry('long',  { ratio: 0.85, sl: close * 0.984, tp: close * 1.030 });
} else if (crossunder(fast, slow)) {
  strategy.closeAll();
  strategy.entry('short', { ratio: 0.85, sl: close * 1.016, tp: close * 0.970 });
}`,
    },
    'RSI Reversion': {
      desc: 'Buy oversold RSI<30, sell overbought RSI>70',
      code:
`// RSI Mean Reversion (14-period)
var r = rsi(14);
if (r < 30 && !this._long) {
  strategy.closeAll();
  strategy.entry('long',  { ratio: 0.65, sl: close * 0.975, tp: close * 1.026 });
  this._long = true; this._short = false;
} else if (r > 70 && !this._short) {
  strategy.closeAll();
  strategy.entry('short', { ratio: 0.65, sl: close * 1.025, tp: close * 0.974 });
  this._short = true; this._long = false;
} else if (r > 55 && this._long)  { strategy.close('long');  this._long  = false; }
else   if (r < 45 && this._short) { strategy.close('short'); this._short = false; }`,
    },
    'BB Breakout': {
      desc: 'Bollinger Band breakout — exit at midline',
      code:
`// Bollinger Band Breakout (20, 2σ)
var b = bb(20, 2.0);
if (!this._pos) this._pos = 0;
var prev = this._prev || close;
if (prev <= b.upper && close > b.upper && this._pos !== 1) {
  strategy.closeAll();
  strategy.entry('long',  { ratio: 0.70, sl: b.mid, tp: close + (b.upper - b.mid) * 2 });
  this._pos = 1;
} else if (prev >= b.lower && close < b.lower && this._pos !== -1) {
  strategy.closeAll();
  strategy.entry('short', { ratio: 0.70, sl: b.mid, tp: close - (b.mid - b.lower) * 2 });
  this._pos = -1;
} else if (this._pos === 1  && close < b.mid) { strategy.close('long');  this._pos = 0; }
else   if (this._pos === -1 && close > b.mid) { strategy.close('short'); this._pos = 0; }
this._prev = close;`,
    },
    'EMA Trend': {
      desc: 'Triple-EMA trend filter with ATR stops',
      code:
`// EMA Trend (9/21/50) + ATR(14) stops
var e9  = ema(close, 9);
var e21 = ema(close, 21);
var e50 = ema(close, 50);
var atrV = atr(14);
var trend = (e9 > e21 && e21 > e50) ? 1
          : (e9 < e21 && e21 < e50) ? -1 : 0;
if (!this._t) this._t = 0;
if (trend === 1 && this._t !== 1) {
  strategy.closeAll();
  strategy.entry('long',  { ratio: 0.75, sl: close - atrV*2.0, tp: close + atrV*4.0 });
  this._t = 1;
} else if (trend === -1 && this._t !== -1) {
  strategy.closeAll();
  strategy.entry('short', { ratio: 0.75, sl: close + atrV*2.0, tp: close - atrV*4.0 });
  this._t = -1;
} else if (trend === 0 && this._t !== 0) {
  strategy.closeAll(); this._t = 0;
}`,
    },
    'Stoch Scalper': {
      desc: 'Stochastic overbought/oversold momentum scalping',
      code:
`// Stochastic Scalper (14, 3)
var s = stoch(14, 3);
var k = s.k, d = s.d;
if (!this._sig) this._sig = 0;
if (k < 20 && d < 20 && crossover(k, d) && this._sig !== 1) {
  strategy.closeAll();
  strategy.entry('long',  { ratio: 0.55, sl: low,  tp: close + (close - low)  * 2.2 });
  this._sig = 1;
} else if (k > 80 && d > 80 && crossunder(k, d) && this._sig !== -1) {
  strategy.closeAll();
  strategy.entry('short', { ratio: 0.55, sl: high, tp: close - (high - close) * 2.2 });
  this._sig = -1;
} else if (this._sig === 1  && k > 75) { strategy.close('long');  this._sig = 0; }
else   if (this._sig === -1 && k < 25) { strategy.close('short'); this._sig = 0; }`,
    },
    'ATR Breakout': {
      desc: 'Highest/lowest channel breakout with ATR exits',
      code:
`// ATR Channel Breakout
var atrV = atr(14);
var hh   = highest(20);
var ll   = lowest(20);
if (!this._p) this._p = 0;
if (close > hh && this._p !== 1) {
  strategy.closeAll();
  strategy.entry('long',  { ratio: 0.70, sl: close - atrV*1.8, tp: close + atrV*3.5 });
  this._p = 1;
} else if (close < ll && this._p !== -1) {
  strategy.closeAll();
  strategy.entry('short', { ratio: 0.70, sl: close + atrV*1.8, tp: close - atrV*3.5 });
  this._p = -1;
}`,
    },
  };

  /* ═══════════════════════════════════════════════════════════════════
     MODULE STATE
  ═══════════════════════════════════════════════════════════════════ */
  let _ctx      = null;
  let _traders  = [];
  let _nextId   = 1;
  let _dirty    = false;
  let _detailId = null;
  let _editId   = null;
  let _panelOpen  = false;
  let _lbOpen     = false;
  // Structural version: incremented only on add/remove — triggers full grid rebuild
  let _gridVer     = 0;
  let _gridVerLast = -1;
  // Sparkline throttle: only redraw every N ticks to avoid canvas flash
  let _sparkTick = 0;
  const SPARK_INTERVAL = 10;

  /* ═══════════════════════════════════════════════════════════════════
     TRADER FACTORY
  ═══════════════════════════════════════════════════════════════════ */
  function _create(name, stratName, code, cash) {
    const id    = _nextId++;
    const color = COLORS[(id - 1) % COLORS.length];
    return {
      id, name, color, stratName, stratCode: code,
      initialCash: cash, cash,
      orders: [], history: [],
      isRunning: false,
      _stratCtx: {}, _crossState: new Map(), _crossIdx: 0,
      _stratFn: null, _compiled: false,
      _lastError: null, _errCount: 0,
      stats: {
        wins: 0, losses: 0, totalPnl: 0, totalFees: 0,
        peakEquity: cash, mdd: 0,
        bestTrade: null, worstTrade: null, totalTrades: 0,
        curWinStreak: 0, curLossStreak: 0,
        maxWinStreak: 0, maxLossStreak: 0,
      },
      equityHist: [{ t: Date.now(), v: cash }],
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     STRATEGY COMPILATION
     NOTE: "use strict" is intentionally omitted — `with` is
           a SyntaxError in strict mode.
  ═══════════════════════════════════════════════════════════════════ */
  function _compile(t) {
    try {
      t._stratFn = new Function('strategy', 'pineEnv',
        'with(pineEnv){\n' + t.stratCode + '\n}');
      t._compiled   = true;
      t._lastError  = null;
    } catch (e) {
      t._compiled   = false;
      t._lastError  = e.message;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     PINE ENVIRONMENT  (mirrors TradingSimulator pineEnv exactly)
  ═══════════════════════════════════════════════════════════════════ */
  function _pine(t) {
    const { ohlc, priceHistory, volumeHistory, currentPrice } = _ctx;

    function sma(_s, len) {
      const a = priceHistory.slice(-len);
      return a.length >= len ? a.reduce((x, y) => x + y, 0) / len : currentPrice;
    }
    function ema(_s, len) {
      const a = priceHistory.slice(-Math.max(len * 3, len + 10));
      if (a.length < len) return currentPrice;
      const k = 2 / (len + 1); let e = a[0];
      for (let i = 1; i < a.length; i++) e = (a[i] - e) * k + e;
      return e;
    }
    function rsi(len) {
      len = len || 14;
      const a = priceHistory.slice(-Math.max(len * 3, len + 10));
      if (a.length < 2) return 50;
      const k = 1 / len, init = Math.min(len, a.length - 1);
      let uA = 0, dA = 0;
      for (let i = 1; i <= init; i++) {
        const d = a[i] - a[i-1]; uA += Math.max(d,0); dA += Math.max(-d,0);
      }
      uA /= init; dA /= init;
      for (let i = init+1; i < a.length; i++) {
        const d = a[i] - a[i-1];
        uA = uA*(1-k) + Math.max(d,0)*k;
        dA = dA*(1-k) + Math.max(-d,0)*k;
      }
      return dA === 0 ? (uA === 0 ? 50 : 100) : 100 - 100/(1 + uA/dA);
    }
    function atr(len) {
      len = len || 14;
      if (ohlc.length < 2) return 0;
      const sl = ohlc.slice(-Math.max(len*3, len+10));
      if (sl.length < 2) return sl[0] ? sl[0].h - sl[0].l : 0;
      const k = 1/len; let v = sl[1].h - sl[1].l;
      for (let i=1; i<sl.length; i++) {
        const tr = Math.max(sl[i].h-sl[i].l,
          Math.abs(sl[i].h-sl[i-1].c), Math.abs(sl[i].l-sl[i-1].c));
        v = v*(1-k) + tr*k;
      }
      return v;
    }
    function highest(len) {
      len = len||20; const e=ohlc.length-1, sl=ohlc.slice(Math.max(0,e-len),e);
      return sl.length ? Math.max(...sl.map(b=>b.h)) : currentPrice;
    }
    function lowest(len) {
      len = len||20; const e=ohlc.length-1, sl=ohlc.slice(Math.max(0,e-len),e);
      return sl.length ? Math.min(...sl.map(b=>b.l)) : currentPrice;
    }
    function bb(len, mult) {
      len=len||20; mult=mult||2;
      const a=priceHistory.slice(-len);
      if (a.length<len) return {upper:currentPrice,mid:currentPrice,lower:currentPrice};
      const mid=a.reduce((s,v)=>s+v,0)/len;
      const std=Math.sqrt(a.reduce((s,v)=>s+(v-mid)**2,0)/len);
      return {upper:mid+mult*std,mid,lower:mid-mult*std};
    }
    function stoch(kL, dL) {
      kL=kL||14; dL=dL||3;
      if (ohlc.length<kL) return {k:50,d:50};
      const cK=b=>{const hh=Math.max(...b.map(x=>x.h)),ll=Math.min(...b.map(x=>x.l));
        return hh===ll?50:(b[b.length-1].c-ll)/(hh-ll)*100;};
      const k=cK(ohlc.slice(-kL)); let dS=0,dC=0;
      for(let i=0;i<dL;i++){const e2=ohlc.length-i;if(e2-kL<0)break;dS+=cK(ohlc.slice(e2-kL,e2));dC++;}
      return {k,d:dC?dS/dC:k};
    }
    function crossover(a, b) {
      const i=t._crossIdx++, s=t._crossState.get(i);
      const r=s!=null&&s.a<=s.b&&a>b; t._crossState.set(i,{a,b}); return r;
    }
    function crossunder(a, b) {
      const i=t._crossIdx++, s=t._crossState.get(i);
      const r=s!=null&&s.a>=s.b&&a<b; t._crossState.set(i,{a,b}); return r;
    }
    const cb = ohlc.length ? ohlc[ohlc.length-1]
                           : {o:currentPrice,h:currentPrice,l:currentPrice,c:currentPrice};
    return {
      get open()      { return cb.o; },
      get high()      { return cb.h; },
      get low()       { return cb.l; },
      get close()     { return currentPrice; },
      get volume()    { return volumeHistory.length ? volumeHistory[volumeHistory.length-1] : 0; },
      get bar_index() { return Math.max(0, ohlc.length-1); },
      sma, ema, rsi, atr, highest, lowest, bb, stoch, crossover, crossunder,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     ACCOUNT MANAGEMENT
  ═══════════════════════════════════════════════════════════════════ */
  function _eq(t) {
    let e = t.cash;
    const p = _ctx.currentPrice;
    for (const o of t.orders) e += o.margin + o.dir * o.shares * (p - o.openPrice);
    return e;
  }
  function _free(t) {
    return Math.max(0, _eq(t) - t.orders.reduce((s,o)=>s+o.margin, 0));
  }
  function _place(t, dir, opts) {
    opts = opts || {};
    const price  = _ctx.currentPrice;
    const d      = dir === 'long' ? 1 : -1;
    const lev    = opts.lev   != null ? opts.lev : 1;
    const ratio  = opts.ratio != null ? Math.min(1, Math.max(0, opts.ratio)) : 0.9;
    const budget = ratio * _free(t) - FEE_FIXED;
    if (budget <= 0) return;
    const shares = budget / (price * (1/lev + FEE_RATE));
    if (shares <= 0) return;
    const margin = shares * price / lev;
    const fee    = shares * price * FEE_RATE + FEE_FIXED;
    t.cash -= margin + fee;
    t.stats.totalFees += fee;
    t.orders.push({
      id: _nextId++ * 1e6 + Math.random(),
      dir: d, openPrice: price, shares, lev, margin,
      sl: opts.sl != null ? opts.sl : null,
      tp: opts.tp != null ? opts.tp : null,
    });
  }
  function _closeOrd(t, o, reason) {
    const price    = _ctx.currentPrice;
    const pnl      = o.dir * o.shares * (price - o.openPrice);
    const closeFee = o.shares * price * FEE_RATE + FEE_FIXED;
    const net      = pnl - closeFee;
    t.cash += o.margin + net;
    t.stats.totalFees  += closeFee;
    t.stats.totalPnl   += net;
    t.stats.totalTrades++;
    if (net > 0) {
      t.stats.wins++; t.stats.curWinStreak++; t.stats.curLossStreak=0;
      t.stats.maxWinStreak = Math.max(t.stats.maxWinStreak, t.stats.curWinStreak);
      t.stats.bestTrade    = t.stats.bestTrade==null ? net : Math.max(t.stats.bestTrade, net);
    } else {
      t.stats.losses++; t.stats.curLossStreak++; t.stats.curWinStreak=0;
      t.stats.maxLossStreak = Math.max(t.stats.maxLossStreak, t.stats.curLossStreak);
      t.stats.worstTrade    = t.stats.worstTrade==null ? net : Math.min(t.stats.worstTrade, net);
    }
    t.history.unshift({dir:o.dir, openPrice:o.openPrice, closePrice:price, netPnl:net, reason});
    if (t.history.length > MAX_HIST) t.history.pop();
    t.orders = t.orders.filter(x => x.id !== o.id);
  }
  function _sltp(t) {
    const price = _ctx.currentPrice;
    for (const o of [...t.orders]) {
      const liqP = o.dir===1 ? o.openPrice*(1-(1-MAINT)/o.lev) : o.openPrice*(1+(1-MAINT)/o.lev);
      const liq = (o.dir===1&&price<=liqP)||(o.dir===-1&&price>=liqP);
      const sl  = o.sl!=null&&((o.dir===1&&price<=o.sl)||(o.dir===-1&&price>=o.sl));
      const tp  = o.tp!=null&&((o.dir===1&&price>=o.tp)||(o.dir===-1&&price<=o.tp));
      if      (liq) _closeOrd(t, o, 'LIQ');
      else if (sl)  _closeOrd(t, o, 'SL');
      else if (tp)  _closeOrd(t, o, 'TP');
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     STRATEGY EVALUATION
  ═══════════════════════════════════════════════════════════════════ */
  function _eval(t) {
    if (!t.isRunning || !t._compiled || !t._stratFn) return;
    t._crossIdx = 0;
    const api = {
      entry(dir, opts) {
        opts = opts || {};
        const d = dir.toLowerCase()==='long' ? 1 : -1;
        let hasSame=false; const opp=[];
        for (const o of t.orders) { if(o.dir===d) hasSame=true; else opp.push(o); }
        opp.forEach(o => _closeOrd(t, o, 'STRATEGY'));
        if (!hasSame) _place(t, dir, opts);
      },
      add(dir, opts)  { _place(t, dir, opts||{}); },
      close(dir) {
        const d=dir.toLowerCase()==='long'?1:-1;
        [...t.orders.filter(o=>o.dir===d)].forEach(o=>_closeOrd(t,o,'STRATEGY'));
      },
      closeAll() { [...t.orders].forEach(o=>_closeOrd(t,o,'STRATEGY')); },
      get position() {
        let lQ=0,sQ=0,lS=0,sS=0,lU=0,sU=0; const p=_ctx.currentPrice;
        for(const o of t.orders){
          const u=o.dir*o.shares*(p-o.openPrice);
          if(o.dir===1){lQ+=o.shares;lS+=o.openPrice*o.shares;lU+=u;}
          else          {sQ+=o.shares;sS+=o.openPrice*o.shares;sU+=u;}
        }
        if(lQ>0&&sQ===0) return{side:'long', qty:lQ,avgPrice:lS/lQ,unrealized:lU};
        if(sQ>0&&lQ===0) return{side:'short',qty:sQ,avgPrice:sS/sQ,unrealized:sU};
        return{side:'none',qty:0,avgPrice:0,unrealized:0};
      },
    };
    try {
      t._stratFn.call(t._stratCtx, api, _pine(t));
      t._errCount = 0;
    } catch(e) {
      t._errCount++;
      t._lastError = e.message;
      if (t._errCount > 5) _stopTrader(t);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     TICK
  ═══════════════════════════════════════════════════════════════════ */
  function tick() {
    if (!_ctx || !_traders.length) return;
    const now = Date.now();
    for (const t of _traders) {
      if (!t.isRunning) continue;
      _sltp(t);
      _eval(t);
      const e = _eq(t);
      t.equityHist.push({t:now, v:e});
      if (t.equityHist.length > MAX_EQ) t.equityHist.shift();
      if (e > t.stats.peakEquity) t.stats.peakEquity = e;
      const dd = t.stats.peakEquity>0 ? (t.stats.peakEquity-e)/t.stats.peakEquity : 0;
      if (dd > t.stats.mdd) t.stats.mdd = dd;
    }
    _sparkTick++;
    // Only schedule a render if something is actually visible
    if (!_dirty && (_panelOpen || _detailId != null)) {
      _dirty = true;
      requestAnimationFrame(_renderAll);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     LEADERBOARD
  ═══════════════════════════════════════════════════════════════════ */
  function _lb() {
    return _traders.map(t => {
      const e=_ctx?_eq(t):t.initialCash, p=e-t.initialCash;
      return {t, e, p, pct:t.initialCash>0?p/t.initialCash*100:0,
              wr:t.stats.totalTrades>0?t.stats.wins/t.stats.totalTrades*100:0};
    }).sort((a,b)=>b.p-a.p);
  }

  /* ── Stop a single trader: close all open positions, then halt ── */
  function _stopTrader(t) {
    t.isRunning = false;
    [...t.orders].forEach(o => _closeOrd(t, o, 'STOPPED'));
  }

  /* ═══════════════════════════════════════════════════════════════════
     BATCH ACTIONS
  ═══════════════════════════════════════════════════════════════════ */
  function _startAll() {
    _traders.forEach(t => { if (!t._compiled) _compile(t); t.isRunning = true; });
    _gridVer++; _dirty = false; _renderAll();
  }
  function _stopAll() {
    _traders.forEach(t => _stopTrader(t));
    _gridVer++; _dirty = false; _renderAll();
  }

  /* ═══════════════════════════════════════════════════════════════════
     CSS
  ═══════════════════════════════════════════════════════════════════ */
  function _css() {
    if (document.getElementById('vt-css')) return;
    const s = document.createElement('style');
    s.id = 'vt-css';
    s.textContent = `
/* ── VirtualTraders ── */
#vt-btn-row {
  width: min(1440px, 98vw);
  position: relative; z-index: 1;
  display: flex; gap: 8px; justify-content: flex-end;
  margin: 4px 0 0;
}
#vt-toggle-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 16px; border-radius: 4px; cursor: pointer;
  font-family: 'Orbitron', sans-serif; font-size: 11px;
  font-weight: 700; letter-spacing: 2px;
  background: rgba(0,0,0,.55); color: rgba(0,245,255,.8);
  border: 1px solid rgba(0,245,255,.28);
  transition: all .18s; user-select: none;
}
#vt-toggle-btn:hover,
#vt-toggle-btn.open {
  background: rgba(0,245,255,.07);
  border-color: rgba(0,245,255,.55);
  color: #00f5ff;
  box-shadow: 0 0 16px rgba(0,245,255,.14);
}
#vt-toggle-btn .vt-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 4px;
  border-radius: 9px; background: rgba(0,245,255,.18);
  font-size: 9px; font-family: 'Share Tech Mono', monospace;
  letter-spacing: 0; color: #00f5ff;
}
#vt-toggle-btn .vt-running-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #39ff14; box-shadow: 0 0 5px #39ff14;
  animation: vtPulse 1.4s ease-in-out infinite;
  display: none;
}
#vt-toggle-btn.has-running .vt-running-dot { display: inline-block; }
@keyframes vtPulse { 0%,100%{opacity:1}50%{opacity:.25} }

/* ── Panel ─────────────────────────────────────── */
#vt-panel {
  width: min(1440px, 98vw);
  position: relative; z-index: 1;
  background: rgba(0,0,0,.5);
  border: 1px solid rgba(0,245,255,.18);
  border-radius: 6px;
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transition: max-height .35s cubic-bezier(.4,0,.2,1), opacity .25s ease;
}
#vt-panel.open { max-height: 2000px; opacity: 1; }

.vt-panel-head {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: rgba(0,245,255,.025);
  border-bottom: 1px solid rgba(0,245,255,.1);
  flex-wrap: wrap;
}
.vt-ph-title {
  font-family: 'Orbitron', sans-serif; font-size: 12px;
  font-weight: 900; letter-spacing: 3px; color: #00f5ff;
  text-shadow: 0 0 10px rgba(0,245,255,.6);
  margin-right: 4px;
}
.vt-ph-sep { width: 1px; height: 18px; background: rgba(0,245,255,.15); }
.vt-ph-btn {
  padding: 5px 13px; border-radius: 3px; cursor: pointer;
  font-family: 'Share Tech Mono', monospace; font-size: 10px;
  letter-spacing: 1px; transition: all .14s; border: 1px solid;
  white-space: nowrap;
}
.vt-ph-btn.go   { color: #39ff14; border-color: rgba(57,255,20,.3);  background: rgba(57,255,20,.05); }
.vt-ph-btn.go:hover   { background: rgba(57,255,20,.14); box-shadow: 0 0 10px rgba(57,255,20,.15); }
.vt-ph-btn.halt { color: #ff2d78; border-color: rgba(255,45,120,.3); background: rgba(255,45,120,.05); }
.vt-ph-btn.halt:hover { background: rgba(255,45,120,.14); box-shadow: 0 0 10px rgba(255,45,120,.15); }
.vt-ph-btn.add  { color: #f5e642; border-color: rgba(245,230,66,.3); background: rgba(245,230,66,.05); }
.vt-ph-btn.add:hover  { background: rgba(245,230,66,.14); box-shadow: 0 0 10px rgba(245,230,66,.12); }
.vt-ph-btn.lb   { color: rgba(0,245,255,.7); border-color: rgba(0,245,255,.2); background: rgba(0,245,255,.04); }
.vt-ph-btn.lb:hover   { background: rgba(0,245,255,.1); color: #00f5ff; }
.vt-ph-btn.lb.on { color: #00f5ff; border-color: rgba(0,245,255,.5); background: rgba(0,245,255,.1); }
.vt-spacer { flex: 1; }

/* ── Leaderboard ── */
#vt-lb {
  max-height: 0; overflow: hidden;
  transition: max-height .28s ease;
  border-bottom: 1px solid rgba(0,245,255,.07);
}
#vt-lb.open { max-height: 600px; }
.vt-lb-inner { padding: 8px 14px 10px; overflow-x: auto; }
.vt-lb-table { width: 100%; border-collapse: collapse; min-width: 560px; }
.vt-lb-table th {
  font-size: 9px; letter-spacing: 2px; color: rgba(0,245,255,.4);
  text-align: left; padding: 4px 8px;
  border-bottom: 1px solid rgba(0,245,255,.1);
}
.vt-lb-table td {
  padding: 6px 8px; font-size: 11px;
  font-family: 'Share Tech Mono', monospace; color: #b8d8e8;
  border-bottom: 1px solid rgba(0,245,255,.04);
  vertical-align: middle;
}
.vt-lb-table tr { cursor: pointer; transition: background .1s; }
.vt-lb-table tr:hover td { background: rgba(0,245,255,.028); }
.vt-rank { font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 700; }
.vt-rank.g { color: #f5e642; text-shadow: 0 0 5px rgba(245,230,66,.55); }
.vt-rank.s { color: #aaa; }
.vt-rank.b { color: #cd7f32; }
.vt-dot { display: inline-block; border-radius: 50%; vertical-align: middle; }
.vt-bar-w { width: 70px; height: 4px; background: rgba(0,0,0,.4); border-radius: 2px; overflow: hidden; }
.vt-bar-f { height: 100%; border-radius: 2px; transition: width .4s; }
.vt-lb-empty {
  text-align: center; padding: 18px;
  color: rgba(0,245,255,.25); font-size: 10px; letter-spacing: 2px;
}

/* ── Trader cards ── */
#vt-cards-wrap { padding: 10px 12px; }
#vt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 8px;
}
.vt-add-card {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 5px; min-height: 122px;
  border: 1.5px dashed rgba(0,245,255,.2); border-radius: 6px;
  background: rgba(0,245,255,.01); color: rgba(0,245,255,.38);
  font-family: 'Share Tech Mono', monospace; font-size: 11px;
  cursor: pointer; transition: all .17s; letter-spacing: 2px;
}
.vt-add-card:hover {
  border-color: rgba(0,245,255,.5); color: #00f5ff;
  background: rgba(0,245,255,.035); box-shadow: 0 0 18px rgba(0,245,255,.07);
}
.vt-add-icon { font-size: 24px; opacity: .45; }

/* card */
.vt-card {
  background: rgba(0,0,0,.38); border-radius: 6px; padding: 10px 12px;
  border: 1px solid rgba(0,245,255,.1); position: relative; overflow: hidden;
  transition: all .15s;
}
.vt-card::before {
  content:''; position: absolute; top:0; left:0; right:0; height:2px;
  background: var(--c); opacity: .8;
}
.vt-card:hover { background: rgba(0,0,0,.5); }
.vt-card.on { border-color: color-mix(in srgb, var(--c) 35%, transparent); }

.vt-ct { display: flex; align-items: center; gap: 7px; margin-bottom: 7px; }
.vt-av {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 900; color: #000;
  background: var(--c); box-shadow: 0 0 7px var(--c);
}
.vt-cn {
  font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700;
  color: #ddf4ff; letter-spacing: 1px; flex: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.vt-sd { width: 7px; height: 7px; border-radius: 50%; background: #222; flex-shrink: 0; }
.vt-sd.on  { background: #39ff14; box-shadow: 0 0 5px #39ff14; animation: vtPulse 1.4s ease-in-out infinite; }
.vt-sd.err { background: #ff2d78; box-shadow: 0 0 5px #ff2d78; }
.vt-sn {
  font-size: 10px; color: rgba(0,245,255,.42); letter-spacing: 1px;
  margin-bottom: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.vt-spark { width: 100%; height: 26px; display: block; margin-bottom: 7px; }
.vt-cm {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 3px 8px; margin-bottom: 8px;
}
.vt-ml { font-size: 9px; color: rgba(0,245,255,.36); letter-spacing: 1px; }
.vt-mv { font-size: 12px; font-family: 'Share Tech Mono', monospace; color: #ddf4ff; }
.vt-mv.p { color: #39ff14; } .vt-mv.n { color: #ff2d78; }
.vt-ca { display: flex; gap: 5px; }
.vt-cb {
  flex: 1; padding: 4px 0; border-radius: 3px; cursor: pointer;
  font-family: 'Share Tech Mono', monospace; font-size: 10px;
  letter-spacing: 1px; transition: all .13s;
  background: rgba(0,0,0,.45); color: rgba(0,245,255,.65);
  border: 1px solid rgba(0,245,255,.17);
}
.vt-cb:hover     { background: rgba(0,245,255,.07); color: #00f5ff; }
.vt-cb.go        { color: #39ff14; border-color: rgba(57,255,20,.28); }
.vt-cb.go:hover  { background: rgba(57,255,20,.09); }
.vt-cb.halt      { color: #ff2d78; border-color: rgba(255,45,120,.28); }
.vt-cb.halt:hover{ background: rgba(255,45,120,.09); }
.vt-cb.rm        { color: rgba(255,45,120,.45); border-color: rgba(255,45,120,.14); }
.vt-cb.rm:hover  { color: #ff2d78; background: rgba(255,45,120,.08); }

.vt-grid-empty {
  grid-column: 1/-1; text-align: center; padding: 22px;
  color: rgba(0,245,255,.24); font-size: 11px; letter-spacing: 2px;
}

/* ── Overlays / Modals ── */
.vt-ov {
  display: none; position: fixed; inset: 0;
  background: rgba(0,0,0,.82); z-index: 3000;
  align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.vt-ov.open { display: flex; }
.vt-modal {
  background: #04020f;
  border: 1px solid rgba(0,245,255,.22);
  border-radius: 8px; padding: 22px 24px;
  width: min(560px, 94vw); max-height: 90vh; overflow-y: auto;
  box-shadow: 0 0 50px rgba(0,245,255,.1), 0 0 90px rgba(0,0,0,.9);
  position: relative;
}
.vt-modal-xl { width: min(700px, 96vw); }
.vt-mt {
  font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 900;
  color: #00f5ff; letter-spacing: 3px; margin-bottom: 18px;
  text-shadow: 0 0 10px rgba(0,245,255,.6);
}
.vt-mx {
  position: absolute; top: 14px; right: 16px;
  background: none; border: none; color: rgba(0,245,255,.5);
  font-size: 18px; cursor: pointer; transition: color .15s;
}
.vt-mx:hover { color: #ff2d78; }
.vt-fg { margin-bottom: 14px; }
.vt-fl {
  display: block; font-size: 10px; letter-spacing: 2px;
  color: rgba(0,245,255,.5); margin-bottom: 5px;
}
.vt-fi {
  width: 100%; background: rgba(0,0,0,.55);
  border: 1px solid rgba(0,245,255,.17); border-radius: 4px;
  padding: 7px 10px; color: #00f5ff;
  font-family: 'Share Tech Mono', monospace; font-size: 12px;
  outline: none; transition: border-color .15s;
}
.vt-fi:focus { border-color: rgba(0,245,255,.5); }
.vt-pres { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.vt-pb {
  padding: 4px 10px; border-radius: 3px; cursor: pointer;
  border: 1px solid rgba(0,245,255,.17); background: rgba(0,0,0,.4);
  color: rgba(0,245,255,.6); font-family: 'Share Tech Mono', monospace;
  font-size: 10px; letter-spacing: 1px; transition: all .13s;
}
.vt-pb:hover,.vt-pb.on {
  background: rgba(0,245,255,.09); color: #00f5ff;
  border-color: rgba(0,245,255,.5);
}
.vt-code {
  width: 100%; background: rgba(0,0,0,.6);
  border: 1px solid rgba(0,245,255,.12); border-radius: 4px;
  padding: 10px; color: #39ff14;
  font-family: 'Share Tech Mono', monospace; font-size: 11px;
  line-height: 1.55; resize: vertical; min-height: 150px;
  outline: none; tab-size: 2; transition: border-color .15s;
}
.vt-code:focus { border-color: rgba(57,255,20,.35); }
.vt-ma { display: flex; gap: 8px; margin-top: 18px; }
.vt-mbtn {
  flex: 1; padding: 9px; border-radius: 4px; border: none; cursor: pointer;
  font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700;
  letter-spacing: 2px; transition: all .15s;
}
.vt-mbtn.ok {
  background: linear-gradient(90deg,rgba(0,245,255,.15),rgba(0,245,255,.07));
  color: #00f5ff; border: 1px solid rgba(0,245,255,.4);
}
.vt-mbtn.ok:hover { background: rgba(0,245,255,.2); box-shadow: 0 0 16px rgba(0,245,255,.2); }
.vt-mbtn.no {
  background: rgba(0,0,0,.4); color: rgba(0,245,255,.4);
  border: 1px solid rgba(0,245,255,.1);
}
.vt-mbtn.no:hover { color: rgba(0,245,255,.7); }

/* ── Detail modal ── */
.vt-dh { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.vt-dav {
  width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Orbitron', sans-serif; font-size: 14px; font-weight: 900; color: #000;
}
.vt-dn { font-family: 'Orbitron', sans-serif; font-size: 14px; font-weight: 900; color: #ddf4ff; letter-spacing: 2px; }
.vt-dsg { font-size: 10px; color: rgba(0,245,255,.5); letter-spacing: 1.5px; }
.vt-sg {
  display: grid; grid-template-columns: repeat(3,1fr);
  gap: 8px; margin-bottom: 14px;
}
.vt-sc { background: rgba(0,0,0,.35); border: 1px solid rgba(0,245,255,.09); border-radius: 4px; padding: 8px 10px; }
.vt-sl2 { font-size: 9px; letter-spacing: 1.5px; color: rgba(0,245,255,.36); margin-bottom: 3px; }
.vt-sv { font-size: 14px; font-family: 'Share Tech Mono', monospace; color: #ddf4ff; }
.vt-ec-wrap { margin-bottom: 14px; }
.vt-ec-lbl { font-size: 9px; letter-spacing: 2px; color: rgba(0,245,255,.36); margin-bottom: 6px; }
#vt-ec {
  width: 100%; height: 88px; display: block;
  border: 1px solid rgba(0,245,255,.09); border-radius: 4px; background: rgba(0,0,0,.3);
}
.vt-ht { width: 100%; border-collapse: collapse; margin-top: 8px; }
.vt-ht th { font-size: 9px; letter-spacing: 1.5px; color: rgba(0,245,255,.38); text-align: left; padding: 4px 6px; border-bottom: 1px solid rgba(0,245,255,.09); }
.vt-ht td { font-size: 10px; padding: 5px 6px; font-family: 'Share Tech Mono', monospace; color: #a8c8d8; border-bottom: 1px solid rgba(0,245,255,.04); }
.vt-dcode {
  background: rgba(0,0,0,.55); border: 1px solid rgba(0,245,255,.09);
  border-radius: 4px; padding: 10px; color: #39ff14;
  font-family: 'Share Tech Mono', monospace; font-size: 10px;
  line-height: 1.5; white-space: pre-wrap; word-break: break-all;
  max-height: 130px; overflow-y: auto; margin-top: 8px;
}
.vt-da { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
.vt-da .vt-mbtn { flex: none; padding: 8px 16px; font-size: 10px; }
.vt-derr { margin-top: 10px; font-size: 10px; letter-spacing: 1px; color: #ff2d78; display: none; word-break: break-all; }

/* ── Responsive ── */
@media(max-width:768px) {
  #vt-grid { grid-template-columns: 1fr 1fr; }
  .vt-sg   { grid-template-columns: 1fr 1fr; }
  .vt-panel-head { gap: 5px; }
}
@media(max-width:480px) {
  #vt-grid { grid-template-columns: 1fr; }
}
`;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════════════
     HTML INJECTION
  ═══════════════════════════════════════════════════════════════════ */
  function _html() {
    if (document.getElementById('vt-panel')) return;

    /* ── Toggle button row ── */
    const btnRow = document.createElement('div');
    btnRow.id = 'vt-btn-row';
    btnRow.innerHTML = `
<button id="vt-toggle-btn">
  <span>🤖</span>
  <span>VIRTUAL TRADERS</span>
  <span class="vt-badge" id="vt-badge">0</span>
  <span class="vt-running-dot"></span>
  <span id="vt-caret">▼</span>
</button>`;

    /* ── Collapsible panel ── */
    const panel = document.createElement('div');
    panel.id = 'vt-panel';
    panel.innerHTML = `
<!-- Panel header -->
<div class="vt-panel-head">
  <span class="vt-ph-title">🤖 VIRTUAL TRADERS</span>
  <div class="vt-ph-sep"></div>
  <button class="vt-ph-btn go"   id="vt-start-all">▶ START ALL</button>
  <button class="vt-ph-btn halt" id="vt-stop-all" >⏹ STOP ALL</button>
  <div class="vt-ph-sep"></div>
  <button class="vt-ph-btn add"  id="vt-add-top"  >＋ ADD TRADER</button>
  <div class="vt-spacer"></div>
  <button class="vt-ph-btn lb"   id="vt-lb-btn"   >☰ LEADERBOARD</button>
</div>

<!-- Leaderboard (collapsed by default) -->
<div id="vt-lb">
  <div class="vt-lb-inner">
    <table class="vt-lb-table">
      <thead>
        <tr>
          <th style="width:38px">#</th>
          <th>TRADER</th><th>STRATEGY</th>
          <th>EQUITY</th><th>NET P&amp;L</th><th>RETURN</th>
          <th>WIN%</th><th>TRADES</th><th>PERF</th>
        </tr>
      </thead>
      <tbody id="vt-lb-body"></tbody>
    </table>
    <div id="vt-lb-empty" class="vt-lb-empty" style="display:none;">
      No traders yet.
    </div>
  </div>
</div>

<!-- Cards -->
<div id="vt-cards-wrap">
  <div id="vt-grid">
    <div class="vt-add-card" id="vt-add-card">
      <div class="vt-add-icon">＋</div>
      <span>ADD VIRTUAL TRADER</span>
    </div>
  </div>
</div>
`;

    /* ── ADD TRADER MODAL ── */
    const addOv = document.createElement('div');
    addOv.className = 'vt-ov'; addOv.id = 'vt-add-ov';
    addOv.innerHTML = `
<div class="vt-modal">
  <button class="vt-mx" id="vt-add-x">✕</button>
  <div class="vt-mt">＋ ADD VIRTUAL TRADER</div>
  <div class="vt-fg">
    <label class="vt-fl">TRADER NAME</label>
    <input class="vt-fi" id="vt-nm" placeholder="e.g.  ALPHA-BOT" maxlength="20" />
  </div>
  <div class="vt-fg">
    <label class="vt-fl">INITIAL CAPITAL ($)</label>
    <input class="vt-fi" id="vt-cap" type="number" value="10000" min="100" max="10000000" step="100" />
  </div>
  <div class="vt-fg">
    <label class="vt-fl">STRATEGY PRESETS</label>
    <div class="vt-pres" id="vt-add-pre"></div>
  </div>
  <div class="vt-fg">
    <label class="vt-fl">STRATEGY CODE <span style="color:rgba(0,245,255,.28);font-size:9px;">(Pine-like)</span></label>
    <textarea class="vt-code" id="vt-add-code" spellcheck="false"></textarea>
  </div>
  <div class="vt-ma">
    <button class="vt-mbtn no" id="vt-add-no">CANCEL</button>
    <button class="vt-mbtn ok" id="vt-add-ok">CREATE TRADER</button>
  </div>
</div>`;

    /* ── EDIT STRATEGY MODAL ── */
    const editOv = document.createElement('div');
    editOv.className = 'vt-ov'; editOv.id = 'vt-edit-ov';
    editOv.innerHTML = `
<div class="vt-modal">
  <button class="vt-mx" id="vt-edit-x">✕</button>
  <div class="vt-mt">✎ EDIT STRATEGY</div>
  <div class="vt-fg">
    <label class="vt-fl">STRATEGY PRESETS</label>
    <div class="vt-pres" id="vt-edit-pre"></div>
  </div>
  <div class="vt-fg">
    <label class="vt-fl">STRATEGY CODE</label>
    <textarea class="vt-code" id="vt-edit-code" spellcheck="false" style="min-height:190px;"></textarea>
  </div>
  <div class="vt-ma">
    <button class="vt-mbtn no" id="vt-edit-no">CANCEL</button>
    <button class="vt-mbtn ok" id="vt-edit-ok">APPLY STRATEGY</button>
  </div>
</div>`;

    /* ── DETAIL MODAL ── */
    const detOv = document.createElement('div');
    detOv.className = 'vt-ov'; detOv.id = 'vt-det-ov';
    detOv.innerHTML = `
<div class="vt-modal vt-modal-xl">
  <button class="vt-mx" id="vt-det-x">✕</button>
  <div class="vt-dh">
    <div class="vt-dav" id="vt-d-av"></div>
    <div>
      <div class="vt-dn"  id="vt-d-nm"></div>
      <div class="vt-dsg" id="vt-d-sn"></div>
    </div>
    <div style="margin-left:auto;text-align:right;">
      <div class="vt-sl2" style="margin-bottom:2px;">STATUS</div>
      <div id="vt-d-st" style="font-size:11px;font-family:'Share Tech Mono',monospace;letter-spacing:1px;"></div>
    </div>
  </div>
  <div class="vt-sg">
    <div class="vt-sc"><div class="vt-sl2">EQUITY</div>      <div class="vt-sv" id="vt-d-eq">—</div></div>
    <div class="vt-sc"><div class="vt-sl2">NET P&amp;L</div> <div class="vt-sv" id="vt-d-pnl">—</div></div>
    <div class="vt-sc"><div class="vt-sl2">RETURN %</div>     <div class="vt-sv" id="vt-d-ret">—</div></div>
    <div class="vt-sc"><div class="vt-sl2">WIN RATE</div>     <div class="vt-sv" id="vt-d-wr">—</div></div>
    <div class="vt-sc"><div class="vt-sl2">TOTAL TRADES</div> <div class="vt-sv" id="vt-d-tr">—</div></div>
    <div class="vt-sc"><div class="vt-sl2">MAX DRAWDOWN</div> <div class="vt-sv" id="vt-d-mdd">—</div></div>
    <div class="vt-sc"><div class="vt-sl2">BEST TRADE</div>   <div class="vt-sv" id="vt-d-best">—</div></div>
    <div class="vt-sc"><div class="vt-sl2">WORST TRADE</div>  <div class="vt-sv" id="vt-d-worst">—</div></div>
    <div class="vt-sc"><div class="vt-sl2">TOTAL FEES</div>   <div class="vt-sv" id="vt-d-fees">—</div></div>
    <div class="vt-sc"><div class="vt-sl2">WIN STREAK</div>   <div class="vt-sv" id="vt-d-ws">—</div></div>
    <div class="vt-sc"><div class="vt-sl2">LOSS STREAK</div>  <div class="vt-sv" id="vt-d-ls">—</div></div>
    <div class="vt-sc"><div class="vt-sl2">OPEN POSITIONS</div><div class="vt-sv" id="vt-d-pos">—</div></div>
  </div>
  <div class="vt-ec-wrap">
    <div class="vt-ec-lbl">EQUITY CURVE</div>
    <canvas id="vt-ec"></canvas>
  </div>
  <div>
    <div class="vt-sl2" style="margin-bottom:6px;">RECENT TRADES (latest 15)</div>
    <table class="vt-ht">
      <thead>
        <tr><th>DIR</th><th>ENTRY</th><th>EXIT</th><th>NET P&amp;L</th><th>REASON</th></tr>
      </thead>
      <tbody id="vt-d-hist"></tbody>
    </table>
  </div>
  <details style="margin-top:12px;">
    <summary style="font-size:9px;letter-spacing:2px;color:rgba(0,245,255,.38);cursor:pointer;user-select:none;padding:2px 0;">
      ▸ STRATEGY CODE
    </summary>
    <pre class="vt-dcode" id="vt-d-code"></pre>
  </details>
  <div class="vt-da">
    <button class="vt-mbtn no" id="vt-d-edit">EDIT STRATEGY</button>
    <button class="vt-mbtn no" id="vt-d-tog"></button>
    <button class="vt-mbtn no" id="vt-d-rm"
      style="color:#ff2d78;border-color:rgba(255,45,120,.3);">REMOVE</button>
    <button class="vt-mbtn ok" id="vt-d-close">CLOSE</button>
  </div>
  <div class="vt-derr" id="vt-d-err"></div>
</div>`;

    /* Insert button row + panel before .hint div */
    const hint = document.querySelector('.hint');
    const wrapper = document.querySelector('.game-wrapper') || document.body;
    if (hint && hint.parentNode === wrapper) {
      wrapper.insertBefore(btnRow,  hint);
      wrapper.insertBefore(panel,   hint);
    } else {
      wrapper.appendChild(btnRow);
      wrapper.appendChild(panel);
    }
    document.body.appendChild(addOv);
    document.body.appendChild(editOv);
    document.body.appendChild(detOv);
  }

  /* ═══════════════════════════════════════════════════════════════════
     RENDERING
  ═══════════════════════════════════════════════════════════════════ */
  const _f   = (v,d=2) => (v!=null&&isFinite(v))?v.toFixed(d):'—';
  const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const _el  = id => document.getElementById(id);

  function _markDirty() {
    if (_dirty) return; _dirty = true;
    requestAnimationFrame(_renderAll);
  }

  function _renderAll() {
    _dirty = false;
    _renderBtn();
    if (_panelOpen) {
      if (_gridVer !== _gridVerLast) {
        // Structural change (add/remove): full rebuild
        _renderGrid();
        _gridVerLast = _gridVer;
      } else {
        // Data change only: update values in-place, no DOM rebuild
        _updateCards();
      }
      if (_lbOpen) _renderLB();
    }
    if (_detailId != null) {
      const t = _traders.find(x => x.id === _detailId);
      if (t) _renderDetail(t);
    }
  }

  /* ── Toggle button badge ── */
  function _renderBtn() {
    const badge = _el('vt-badge');
    const dot   = document.querySelector('#vt-toggle-btn .vt-running-dot');
    const btn   = _el('vt-toggle-btn');
    if (!badge || !btn) return;
    badge.textContent = _traders.length;
    const anyOn = _traders.some(t => t.isRunning);
    btn.classList.toggle('has-running', anyOn);
  }

  /* ── Trader cards grid ── */
  function _renderGrid() {
    const grid    = _el('vt-grid');
    const addCard = _el('vt-add-card');
    if (!grid) return;
    [...grid.children].forEach(el => { if (el !== addCard) el.remove(); });

    if (_traders.length === 0) {
      const emp = document.createElement('div');
      emp.className = 'vt-grid-empty';
      emp.textContent = 'No virtual traders yet — click "+ ADD TRADER" to create one.';
      grid.insertBefore(emp, addCard);
      return;
    }
    for (const t of _traders) grid.insertBefore(_buildCard(t), addCard);
  }

  function _buildCard(t) {
    const e    = _ctx ? _eq(t) : t.initialCash;
    const pnl  = e - t.initialCash;
    const pct  = pnl / t.initialCash * 100;
    const wr   = t.stats.totalTrades > 0 ? t.stats.wins / t.stats.totalTrades * 100 : 0;
    const pCls = pnl >= 0 ? 'p' : 'n';
    const abbr = t.name.replace(/[^A-Z0-9]/gi,'').slice(0,2).toUpperCase() || '??';

    const div = document.createElement('div');
    div.className = `vt-card${t.isRunning?' on':''}`;
    div.style.setProperty('--c', t.color);
    div.dataset.id = t.id;
    div.innerHTML = `
<div class="vt-ct">
  <div class="vt-av">${_esc(abbr)}</div>
  <div class="vt-cn">${_esc(t.name)}</div>
  <div class="vt-sd ${t.isRunning?'on':t._lastError?'err':''}"></div>
</div>
<div class="vt-sn">${_esc(t.stratName)}</div>
<canvas class="vt-spark" id="vt-sp-${t.id}"></canvas>
<div class="vt-cm">
  <div><div class="vt-ml">EQUITY</div><div class="vt-mv">$${_f(e)}</div></div>
  <div><div class="vt-ml">P&L</div>
    <div class="vt-mv ${pCls}">${pnl>=0?'+$':'-$'}${_f(Math.abs(pnl))} (${pct>=0?'+':''}${_f(pct,1)}%)</div>
  </div>
  <div><div class="vt-ml">WIN RATE</div>
    <div class="vt-mv">${_f(wr,1)}% <span style="font-size:10px;color:rgba(0,245,255,.38);">${t.stats.wins}W/${t.stats.losses}L</span></div>
  </div>
  <div><div class="vt-ml">POSITIONS</div><div class="vt-mv">${t.orders.length} open</div></div>
</div>
<div class="vt-ca">
  ${t.isRunning
    ? `<button class="vt-cb halt" data-a="stop"  data-id="${t.id}">⏹ STOP</button>`
    : `<button class="vt-cb go"   data-a="start" data-id="${t.id}">▶ START</button>`
  }
  <button class="vt-cb" data-a="det" data-id="${t.id}">STATS</button>
  <button class="vt-cb rm"           data-a="rm"  data-id="${t.id}">✕</button>
</div>`;

    requestAnimationFrame(() => {
      const c = _el(`vt-sp-${t.id}`);
      if (c) _sparkline(c, t.equityHist, t.color);
    });
    return div;
  }

  /* Update only the dynamic values inside already-existing cards.
     No DOM nodes are created or removed — buttons stay stable so
     clicks are never lost, and there is zero flicker. */
  function _updateCards() {
    const redrawSpark = (_sparkTick % SPARK_INTERVAL === 0);
    for (const t of _traders) {
      const card = document.querySelector(`#vt-grid .vt-card[data-id="${t.id}"]`);
      if (!card) continue;

      const e   = _ctx ? _eq(t) : t.initialCash;
      const pnl = e - t.initialCash;
      const pct = pnl / t.initialCash * 100;
      const wr  = t.stats.totalTrades > 0 ? t.stats.wins / t.stats.totalTrades * 100 : 0;

      // Running class on card border
      card.classList.toggle('on', t.isRunning);

      // Status dot
      const sd = card.querySelector('.vt-sd');
      if (sd) sd.className = `vt-sd ${t.isRunning ? 'on' : t._lastError ? 'err' : ''}`;

      // Metric values (order matches _buildCard vt-mv elements)
      const mvs = card.querySelectorAll('.vt-mv');
      if (mvs[0]) mvs[0].textContent = '$' + _f(e);
      if (mvs[1]) {
        mvs[1].className = `vt-mv ${pnl >= 0 ? 'p' : 'n'}`;
        mvs[1].textContent = `${pnl>=0?'+$':'-$'}${_f(Math.abs(pnl))} (${pct>=0?'+':''}${_f(pct,1)}%)`;
      }
      if (mvs[2]) mvs[2].textContent = `${_f(wr,1)}% ${t.stats.wins}W/${t.stats.losses}L`;
      if (mvs[3]) mvs[3].textContent = `${t.orders.length} open`;

      // Start/Stop button — only mutate attributes, never replace the node
      const togBtn = card.querySelector('[data-a="start"],[data-a="stop"]');
      if (togBtn) {
        if (t.isRunning && togBtn.dataset.a !== 'stop') {
          togBtn.dataset.a  = 'stop';
          togBtn.className  = 'vt-cb halt';
          togBtn.textContent = '⏹ STOP';
        } else if (!t.isRunning && togBtn.dataset.a !== 'start') {
          togBtn.dataset.a  = 'start';
          togBtn.className  = 'vt-cb go';
          togBtn.textContent = '▶ START';
        }
      }

      // Sparkline — only redraw every SPARK_INTERVAL ticks
      if (redrawSpark) {
        const spark = _el(`vt-sp-${t.id}`);
        if (spark) _sparkline(spark, t.equityHist, t.color);
      }
    }
  }

  function _sparkline(canvas, hist, color) {
    const dpr=devicePixelRatio||1, w=canvas.offsetWidth||240, h=26;
    canvas.width=w*dpr; canvas.height=h*dpr;
    const c=canvas.getContext('2d'); c.scale(dpr,dpr);
    if (hist.length<2) {
      c.strokeStyle=color+'44'; c.lineWidth=1;
      c.beginPath(); c.moveTo(0,h/2); c.lineTo(w,h/2); c.stroke(); return;
    }
    const vals=hist.map(p=>p.v), mn=Math.min(...vals), mx=Math.max(...vals), rng=mx-mn||1;
    const g=c.createLinearGradient(0,0,w,0);
    g.addColorStop(0,color+'55'); g.addColorStop(1,color+'cc');
    c.strokeStyle=g; c.lineWidth=1.6; c.beginPath();
    vals.forEach((v,i)=>{
      const x=(i/(vals.length-1))*w, y=h-((v-mn)/rng)*(h-5)-2;
      i===0?c.moveTo(x,y):c.lineTo(x,y);
    });
    c.stroke();
    c.lineTo(w,h); c.lineTo(0,h); c.closePath();
    c.fillStyle=color+'1a'; c.fill();
  }

  /* ── Leaderboard ── */
  function _renderLB() {
    const body=_el('vt-lb-body'), empty=_el('vt-lb-empty');
    if (!body) return;
    const lb=_lb();
    if (lb.length===0) { body.innerHTML=''; if(empty) empty.style.display='block'; return; }
    if (empty) empty.style.display='none';
    const maxA=Math.max(...lb.map(r=>Math.abs(r.p)),1);
    body.innerHTML=lb.map((r,i)=>{
      const t=r.t, rCls=i===0?'g':i===1?'s':i===2?'b':'';
      const rLbl=i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;
      const pC=r.p>=0?'#39ff14':'#ff2d78';
      const bw=Math.round(Math.abs(r.p)/maxA*100);
      return `<tr data-id="${t.id}">
  <td><span class="vt-rank ${rCls}">${rLbl}</span></td>
  <td>
    <span class="vt-dot" style="width:9px;height:9px;margin-right:6px;background:${t.color};box-shadow:0 0 4px ${t.color};"></span>
    ${_esc(t.name)}
    ${t.isRunning?`<span class="vt-dot" style="width:6px;height:6px;margin-left:5px;background:#39ff14;box-shadow:0 0 4px #39ff14;animation:vtPulse 1.4s ease-in-out infinite;"></span>`:''}
  </td>
  <td style="color:rgba(0,245,255,.5);font-size:10px;">${_esc(t.stratName)}</td>
  <td>$${_f(r.e)}</td>
  <td style="color:${pC};">${r.p>=0?'+$':'-$'}${_f(Math.abs(r.p))}</td>
  <td style="color:${pC};">${r.pct>=0?'+':''}${_f(r.pct,1)}%</td>
  <td style="color:${r.wr>=50?'#39ff14':'#ff2d78'};">${_f(r.wr,1)}%</td>
  <td>${t.stats.totalTrades}</td>
  <td><div class="vt-bar-w"><div class="vt-bar-f" style="width:${bw}%;background:${pC};"></div></div></td>
</tr>`;
    }).join('');
    body.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', ()=>{ const t=_traders.find(x=>x.id==row.dataset.id); if(t) _openDet(t); });
    });
  }

  /* ── Detail modal ── */
  function _renderDetail(t) {
    const e=_ctx?_eq(t):t.initialCash, pnl=e-t.initialCash, pct=pnl/t.initialCash*100;
    const wr=t.stats.totalTrades>0?t.stats.wins/t.stats.totalTrades*100:0;
    const pC=pnl>=0?'#39ff14':'#ff2d78';
    const abbr=t.name.replace(/[^A-Z0-9]/gi,'').slice(0,2).toUpperCase()||'??';
    const av=_el('vt-d-av');
    if (av) { av.textContent=abbr; av.style.cssText=`background:${t.color};box-shadow:0 0 14px ${t.color};color:#000;`; }
    const s=(id,v,c)=>{ const el=_el(id); if(!el) return; el.textContent=v; if(c) el.style.color=c; };
    s('vt-d-nm',  t.name);
    s('vt-d-sn',  t.stratName.toUpperCase());
    const stEl=_el('vt-d-st');
    if(stEl){ stEl.textContent=t.isRunning?'● RUNNING':t._lastError?'✕ ERROR':'◼ STOPPED'; stEl.style.color=t.isRunning?'#39ff14':t._lastError?'#ff2d78':'rgba(0,245,255,.4)'; }
    s('vt-d-eq',    '$'+_f(e));
    s('vt-d-pnl',   (pnl>=0?'+$':'-$')+_f(Math.abs(pnl)), pC);
    s('vt-d-ret',   (pct>=0?'+':'')+_f(pct,2)+'%', pC);
    s('vt-d-wr',    _f(wr,1)+'%', wr>=50?'#39ff14':'#ff2d78');
    s('vt-d-tr',    String(t.stats.totalTrades));
    s('vt-d-mdd',   _f(t.stats.mdd*100,1)+'%', '#ff9f1c');
    s('vt-d-best',  t.stats.bestTrade!=null?'+$'+_f(t.stats.bestTrade):'—', '#39ff14');
    s('vt-d-worst', t.stats.worstTrade!=null?'-$'+_f(Math.abs(t.stats.worstTrade)):'—', '#ff2d78');
    s('vt-d-fees',  '$'+_f(t.stats.totalFees));
    s('vt-d-ws',    String(t.stats.maxWinStreak));
    s('vt-d-ls',    String(t.stats.maxLossStreak));
    s('vt-d-pos',   t.orders.length+' open');
    const tog=_el('vt-d-tog');
    if(tog){ tog.textContent=t.isRunning?'⏹ STOP':'▶ START'; tog.style.color=t.isRunning?'#ff2d78':'#39ff14'; tog.style.borderColor=t.isRunning?'rgba(255,45,120,.3)':'rgba(57,255,20,.3)'; }
    const errEl=_el('vt-d-err');
    if(errEl){ errEl.style.display=t._lastError?'block':'none'; if(t._lastError) errEl.textContent='⚠ '+t._lastError; }
    const codeEl=_el('vt-d-code'); if(codeEl) codeEl.textContent=t.stratCode;
    const ec=_el('vt-ec'); if(ec&&t.equityHist.length>1) _echart(ec,t);
    const hist=_el('vt-d-hist');
    if(hist) hist.innerHTML=t.history.slice(0,15).map(h=>{
      const dc=h.dir===1?'#39ff14':'#ff2d78', pc=h.netPnl>=0?'#39ff14':'#ff2d78';
      return `<tr><td style="color:${dc};">${h.dir===1?'LONG':'SHORT'}</td><td>$${_f(h.openPrice)}</td><td>$${_f(h.closePrice)}</td><td style="color:${pc};">${h.netPnl>=0?'+$':'-$'}${_f(Math.abs(h.netPnl))}</td><td style="color:rgba(0,245,255,.45);font-size:9px;">${h.reason}</td></tr>`;
    }).join('')||`<tr><td colspan="5" style="text-align:center;color:rgba(0,245,255,.28);padding:12px;font-size:10px;letter-spacing:2px;">NO TRADES YET</td></tr>`;
  }

  function _echart(canvas, t) {
    const dpr=devicePixelRatio||1, w=canvas.clientWidth||600, h=canvas.clientHeight||88;
    canvas.width=w*dpr; canvas.height=h*dpr;
    const c=canvas.getContext('2d'); c.scale(dpr,dpr); c.clearRect(0,0,w,h);
    const vals=t.equityHist.map(p=>p.v);
    if(vals.length<2) return;
    const mn=Math.min(...vals), mx=Math.max(...vals), rng=mx-mn||1, pad=6;
    c.strokeStyle='rgba(0,245,255,.04)'; c.lineWidth=1;
    for(let i=1;i<4;i++){ const y=pad+(1-i/4)*(h-2*pad); c.beginPath(); c.moveTo(0,y); c.lineTo(w,y); c.stroke(); }
    const baseY=pad+(1-(t.initialCash-mn)/rng)*(h-2*pad);
    c.setLineDash([4,5]); c.strokeStyle='rgba(245,230,66,.28)'; c.lineWidth=1;
    c.beginPath(); c.moveTo(0,baseY); c.lineTo(w,baseY); c.stroke(); c.setLineDash([]);
    const g=c.createLinearGradient(0,0,w,0);
    g.addColorStop(0,t.color+'77'); g.addColorStop(1,t.color);
    c.strokeStyle=g; c.lineWidth=2.2; c.shadowColor=t.color; c.shadowBlur=5;
    c.beginPath();
    vals.forEach((v,i)=>{ const x=(i/(vals.length-1))*w, y=pad+(1-(v-mn)/rng)*(h-2*pad); i===0?c.moveTo(x,y):c.lineTo(x,y); });
    c.stroke(); c.shadowBlur=0;
    c.lineTo(w,h); c.lineTo(0,h); c.closePath();
    const fg=c.createLinearGradient(0,0,0,h);
    fg.addColorStop(0,t.color+'28'); fg.addColorStop(1,'transparent');
    c.fillStyle=fg; c.fill();
  }

  /* ═══════════════════════════════════════════════════════════════════
     MODAL HELPERS
  ═══════════════════════════════════════════════════════════════════ */
  function _openAdd() {
    const first=Object.keys(PRESETS)[0];
    _el('vt-nm').value='BOT-'+_nextId; _el('vt-cap').value='10000';
    _el('vt-add-code').value=PRESETS[first].code;
    _el('vt-add-pre').querySelectorAll('.vt-pb').forEach(b=>b.classList.toggle('on',b.dataset.p===first));
    _el('vt-add-ov').classList.add('open'); _el('vt-nm').focus();
  }
  function _closeAdd() { _el('vt-add-ov').classList.remove('open'); }

  function _openDet(t) {
    _detailId=t.id; _el('vt-det-ov').classList.add('open'); _renderDetail(t);
  }
  function _closeDet() { _el('vt-det-ov').classList.remove('open'); _detailId=null; }

  function _openEdit(t) {
    _editId=t.id; _el('vt-edit-code').value=t.stratCode;
    _el('vt-edit-pre').querySelectorAll('.vt-pb').forEach(b=>b.classList.toggle('on',b.dataset.p===t.stratName));
    _el('vt-edit-ov').classList.add('open');
  }
  function _closeEdit() { _el('vt-edit-ov').classList.remove('open'); _editId=null; }

  /* ═══════════════════════════════════════════════════════════════════
     EVENT BINDING
  ═══════════════════════════════════════════════════════════════════ */
  function _bind() {
    /* Preset buttons for add + edit modals */
    ['add','edit'].forEach(m=>{
      const pre=_el(`vt-${m}-pre`);
      for(const [name,strat] of Object.entries(PRESETS)){
        const btn=document.createElement('button');
        btn.className='vt-pb'; btn.textContent=name; btn.dataset.p=name; btn.title=strat.desc;
        btn.addEventListener('click',()=>{
          _el(`vt-${m}-code`).value=strat.code;
          pre.querySelectorAll('.vt-pb').forEach(b=>b.classList.toggle('on',b===btn));
        });
        pre.appendChild(btn);
      }
    });

    /* Toggle panel */
    _el('vt-toggle-btn').addEventListener('click', ()=>{
      _panelOpen = !_panelOpen;
      _el('vt-panel').classList.toggle('open', _panelOpen);
      _el('vt-toggle-btn').classList.toggle('open', _panelOpen);
      _el('vt-caret').textContent = _panelOpen ? '▲' : '▼';
      if (_panelOpen) { _renderGrid(); if (_lbOpen) _renderLB(); }
    });

    /* Start all / Stop all */
    _el('vt-start-all').addEventListener('click', _startAll);
    _el('vt-stop-all').addEventListener('click',  _stopAll);

    /* Add trader triggers */
    _el('vt-add-top').addEventListener('click',  _openAdd);
    _el('vt-add-card').addEventListener('click', _openAdd);

    /* Leaderboard toggle */
    _el('vt-lb-btn').addEventListener('click', ()=>{
      _lbOpen = !_lbOpen;
      _el('vt-lb').classList.toggle('open', _lbOpen);
      _el('vt-lb-btn').classList.toggle('on', _lbOpen);
      if (_lbOpen) _renderLB();
    });

    /* Close add modal */
    _el('vt-add-x').addEventListener('click',  _closeAdd);
    _el('vt-add-no').addEventListener('click', _closeAdd);
    _el('vt-add-ov').addEventListener('click', e=>{ if(e.target===_el('vt-add-ov')) _closeAdd(); });

    /* Confirm add */
    _el('vt-add-ok').addEventListener('click', ()=>{
      const name=((_el('vt-nm').value.trim())||'BOT-'+_nextId);
      const cash=(parseFloat(_el('vt-cap').value)||10000);
      const code=_el('vt-add-code').value.trim();
      let sn='Custom';
      for(const[n,s] of Object.entries(PRESETS)) if(s.code.trim()===code){sn=n;break;}
      const t=_create(name,sn,code,cash); _compile(t); _traders.push(t);
      _gridVer++;
      _closeAdd(); _renderBtn(); _renderGrid();
    });

    /* Grid delegation */
    _el('vt-grid').addEventListener('click', e=>{
      const btn=e.target.closest('[data-a]'); if(!btn) return; e.stopPropagation();
      const t=_traders.find(x=>x.id==btn.dataset.id); if(!t) return;
      if      (btn.dataset.a==='start') { if(!t._compiled)_compile(t); t.isRunning=true;  _renderBtn(); _renderGrid(); }
      else if (btn.dataset.a==='stop')  { _stopTrader(t); _renderBtn(); _renderGrid(); }
      else if (btn.dataset.a==='rm')    { _remove(t); }
      else if (btn.dataset.a==='det')   { _openDet(t); }
    });

    /* Detail close */
    _el('vt-det-x').addEventListener('click',    _closeDet);
    _el('vt-d-close').addEventListener('click',  _closeDet);
    _el('vt-det-ov').addEventListener('click', e=>{ if(e.target===_el('vt-det-ov')) _closeDet(); });

    /* Detail toggle */
    _el('vt-d-tog').addEventListener('click', ()=>{
      const t=_traders.find(x=>x.id===_detailId); if(!t) return;
      if(t.isRunning){ _stopTrader(t); } else { if(!t._compiled)_compile(t); t.isRunning=true; }
      _renderBtn(); _renderGrid(); _renderDetail(t);
    });

    /* Detail remove */
    _el('vt-d-rm').addEventListener('click', ()=>{
      const t=_traders.find(x=>x.id===_detailId); if(t) _remove(t,true);
    });

    /* Detail open edit */
    _el('vt-d-edit').addEventListener('click', ()=>{
      const t=_traders.find(x=>x.id===_detailId); if(t) _openEdit(t);
    });

    /* Close edit */
    _el('vt-edit-x').addEventListener('click',  _closeEdit);
    _el('vt-edit-no').addEventListener('click', _closeEdit);
    _el('vt-edit-ov').addEventListener('click', e=>{ if(e.target===_el('vt-edit-ov')) _closeEdit(); });

    /* Confirm edit */
    _el('vt-edit-ok').addEventListener('click', ()=>{
      const t=_traders.find(x=>x.id===_editId); if(!t) return;
      const code=_el('vt-edit-code').value.trim(); t.stratCode=code;
      let sn='Custom'; for(const[n,s] of Object.entries(PRESETS)) if(s.code.trim()===code){sn=n;break;}
      t.stratName=sn; t._stratCtx={}; t._crossState=new Map(); t._errCount=0; t._lastError=null;
      _compile(t); _closeEdit(); _renderGrid();
      if(_detailId===t.id) _renderDetail(t);
    });

    /* Escape */
    document.addEventListener('keydown', e=>{
      if(e.key!=='Escape') return; _closeAdd(); _closeDet(); _closeEdit();
    });
  }

  function _remove(t, fromDet=false) {
    if(!confirm(`Remove trader "${t.name}"?`)) return;
    _traders=_traders.filter(x=>x.id!==t.id);
    _gridVer++;
    if(fromDet) _closeDet();
    _renderBtn(); _renderGrid();
    if(_lbOpen) _renderLB();
  }

  /* ═══════════════════════════════════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════════════════════════════════ */
  function init(ctx) {
    _ctx = ctx; _css(); _html(); _bind(); _renderBtn();
  }

  G.VirtualTraders = { init, tick };

})(window);
