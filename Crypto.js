/* ══════════════════════════════════════════════════════════════════
   Crypto.js  —  Crypto Live Mode Module for TradingSimulator
   Loaded as standard <script src="Crypto.js"> in TradingSimulator.html
   Exposes: window._initCryptoModule(ctx)  →  CryptoAPI

   Features:
   · Binance REST API pre-loads 500 historical klines on entry
   · Kline WebSocket stream (symbol@kline_Xm) drives chart updates
     – Live kline messages update the last bar in real-time
     – Closed kline (k.x=true) triggers the full game step
   · Tick interval is stopped on entry; kline-close events are the tick
   · Timeframe selector: 1m / 5m / 15m
   · Volume normalised against historical median
   ══════════════════════════════════════════════════════════════════ */
(function () {

  /* ── Inject CSS ──────────────────────────────────────────────── */
  const _style = document.createElement('style');
  _style.textContent = `
    .crypto-mode-btn {
      background: rgba(255,170,0,0.08);
      border: 1px solid rgba(255,170,0,0.55);
      border-bottom: 2px solid rgba(255,170,0,0.9);
      color: rgba(255,200,60,0.95);
      font-family: 'Orbitron', monospace;
      font-size: 0.78rem; font-weight: 700;
      padding: 5px 18px; cursor: pointer; border-radius: 2px;
      letter-spacing: 0.18em; white-space: nowrap;
      text-shadow: 0 0 8px rgba(255,170,0,0.75), 0 0 20px rgba(255,170,0,0.35);
      box-shadow: 0 2px 10px rgba(255,170,0,0.2), 0 0 22px rgba(255,170,0,0.08), inset 0 1px 0 rgba(255,200,0,0.1);
      transition: all 0.2s;
      animation: cryptoIdleGlow 3s ease-in-out infinite;
    }
    @keyframes cryptoIdleGlow {
      0%,100% { box-shadow: 0 2px 10px rgba(255,170,0,0.2), 0 0 22px rgba(255,170,0,0.08), inset 0 1px 0 rgba(255,200,0,0.1); }
      50%      { box-shadow: 0 2px 16px rgba(255,170,0,0.35), 0 0 36px rgba(255,170,0,0.18), inset 0 1px 0 rgba(255,200,0,0.15); }
    }
    .crypto-mode-btn:hover {
      color: #ffcc00; background: rgba(255,170,0,0.18); border-color: rgba(255,200,0,0.85);
      text-shadow: 0 0 12px #ffcc00, 0 0 28px rgba(255,170,0,0.7);
      box-shadow: 0 2px 20px rgba(255,170,0,0.55), 0 0 45px rgba(255,170,0,0.28), inset 0 1px 0 rgba(255,220,0,0.2);
      animation: none;
    }
    .crypto-mode-btn.active {
      background: rgba(255,170,0,0.16); border-color: #ffcc00;
      border-bottom-color: #ffcc00; color: #ffee80;
      text-shadow: 0 0 10px #ffcc00, 0 0 22px rgba(255,200,0,0.8);
      animation: cryptoActivePulse 1.8s ease-in-out infinite;
    }
    @keyframes cryptoActivePulse {
      0%,100% { box-shadow: 0 2px 18px rgba(255,170,0,0.45), 0 0 38px rgba(255,170,0,0.2), inset 0 1px 0 rgba(255,220,0,0.15); }
      50%      { box-shadow: 0 2px 30px rgba(255,190,0,0.7), 0 0 60px rgba(255,170,0,0.38), inset 0 1px 0 rgba(255,230,0,0.25); }
    }
    .crypto-panel {
      width: 100%; background: rgba(255,170,0,0.04);
      border: 1px solid rgba(255,170,0,0.18); border-radius: 3px;
      padding: 10px 14px; display: none; flex-wrap: wrap; gap: 8px; align-items: center;
    }
    .crypto-panel.open { display: flex; }
    .crypto-panel-label {
      font-size: 0.58rem; color: rgba(255,170,0,0.55);
      letter-spacing: 0.2em; text-transform: uppercase; margin-right: 4px;
    }
    .crypto-sep { color: rgba(255,170,0,0.25); font-size: 0.85rem; margin: 0 2px; user-select: none; }
    .crypto-sym-btn {
      background: rgba(255,170,0,0.05); border: 1px solid rgba(255,170,0,0.22);
      border-bottom: 2px solid rgba(255,170,0,0.35);
      color: rgba(255,170,0,0.7); font-family: 'Share Tech Mono', monospace;
      font-size: 0.72rem; padding: 3px 11px; cursor: pointer; border-radius: 2px;
      transition: all 0.12s; letter-spacing: 0.08em;
    }
    .crypto-sym-btn:hover, .crypto-sym-btn:active {
      background: rgba(255,170,0,0.12); color: #ffaa00; border-color: rgba(255,170,0,0.55);
    }
    .crypto-sym-btn.active {
      background: rgba(255,170,0,0.18); border-color: #ffaa00;
      color: #ffaa00; box-shadow: 0 0 10px rgba(255,170,0,0.25);
    }
    .crypto-tf-btn {
      background: rgba(255,170,0,0.04); border: 1px solid rgba(255,170,0,0.18);
      border-bottom: 2px solid rgba(255,170,0,0.28);
      color: rgba(255,170,0,0.55); font-family: 'Share Tech Mono', monospace;
      font-size: 0.68rem; padding: 2px 9px; cursor: pointer; border-radius: 2px;
      transition: all 0.12s; letter-spacing: 0.06em;
    }
    .crypto-tf-btn:hover { background: rgba(255,170,0,0.1); color: #ffaa00; border-color: rgba(255,170,0,0.45); }
    .crypto-tf-btn.active { background: rgba(255,170,0,0.15); border-color: #ffaa00; color: #ffaa00; }
    .crypto-ws-status {
      font-size: 0.6rem; letter-spacing: 0.12em; margin-left: auto;
      padding: 2px 8px; border-radius: 2px; border: 1px solid;
    }
    .crypto-ws-status.connecting { color: rgba(245,230,66,0.8); border-color: rgba(245,230,66,0.4); }
    .crypto-ws-status.live       { color: rgba(57,255,20,0.9);  border-color: rgba(57,255,20,0.5); animation: liveBlink 1.5s infinite; }
    .crypto-ws-status.error      { color: rgba(255,45,120,0.9); border-color: rgba(255,45,120,0.5); }
    @keyframes liveBlink { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
    .crypto-mode-btn, .crypto-sym-btn, .crypto-tf-btn { touch-action: manipulation; }
  `;
  document.head.appendChild(_style);

  /* ══════════════════════════════════════════════════════════════════
     Module Factory
  ══════════════════════════════════════════════════════════════════ */
  window._initCryptoModule = function (ctx) {

    /* ── Private State ──────────────────────────────────────────── */
    let _cryptoMode         = false;
    let _cryptoWS           = null;
    let _cryptoSymbol       = 'btcusdt';
    let _cryptoInterval     = '1m';
    let _cryptoLiveBar      = null;   // current open kline bar from WS (null = no bar yet)
    let _cryptoVolMedian    = 1;      // median volume from history (for normalisation)
    let _cryptoLoadRevision = 0;      // incremented on each entry/exit to cancel stale fetches

    /* ── DOM Injection ──────────────────────────────────────────── */
    const cryptoModeBtn = document.createElement('button');
    cryptoModeBtn.className   = 'crypto-mode-btn';
    cryptoModeBtn.id          = 'btn-crypto-mode';
    cryptoModeBtn.textContent = '⬡ CRYPTO';
    document.querySelector('.title-row').appendChild(cryptoModeBtn);

    const cryptoPanel = document.createElement('div');
    cryptoPanel.className = 'crypto-panel';
    cryptoPanel.id        = 'crypto-panel';
    cryptoPanel.innerHTML = `
      <span class="crypto-panel-label">⬡ LIVE CRYPTO</span>
      <button class="crypto-sym-btn active" data-sym="btcusdt">BTC/USDT</button>
      <button class="crypto-sym-btn" data-sym="ethusdt">ETH/USDT</button>
      <button class="crypto-sym-btn" data-sym="bnbusdt">BNB/USDT</button>
      <button class="crypto-sym-btn" data-sym="solusdt">SOL/USDT</button>
      <button class="crypto-sym-btn" data-sym="xrpusdt">XRP/USDT</button>
      <button class="crypto-sym-btn" data-sym="dogeusdt">DOGE/USDT</button>
      <button class="crypto-sym-btn" data-sym="adausdt">ADA/USDT</button>
      <button class="crypto-sym-btn" data-sym="avaxusdt">AVAX/USDT</button>
      <span class="crypto-sep">│</span>
      <button class="crypto-tf-btn active" data-tf="1m">1m</button>
      <button class="crypto-tf-btn" data-tf="5m">5m</button>
      <button class="crypto-tf-btn" data-tf="15m">15m</button>
      <span class="crypto-ws-status connecting" id="crypto-ws-status">⬡ LOADING</span>
    `;
    const settingsPanel = document.getElementById('settings-panel');
    settingsPanel.parentNode.insertBefore(cryptoPanel, settingsPanel.nextSibling);

    const cryptoWsStatus = document.getElementById('crypto-ws-status');

    /* ── Helpers ────────────────────────────────────────────────── */
    function _setCryptoWsStatus(cls, text) {
      const defaults = { connecting: '⬡ LOADING', live: '● LIVE', error: '✕ ERROR' };
      cryptoWsStatus.textContent = (text !== undefined) ? text : (defaults[cls] || cls);
      cryptoWsStatus.className   = 'crypto-ws-status ' + cls;
    }

    function _normalizeVol(v) {
      return Math.max(0.1, Math.min(4, v / Math.max(_cryptoVolMedian, 1e-9)));
    }

    function _resetAccountState() {
      ctx.initialCash = parseFloat(ctx.initAssetInput.value) || 1000;
      ctx.cash = ctx.initialCash; ctx.realizedPnl = 0; ctx.liquidated = false;
      ctx.ordersDiv.innerHTML = ''; ctx.cardRefs.clear();
      ctx.orders = []; ctx.nextOrderId = 1;
      ctx.tradeHistory = []; ctx.netAssetHistory = []; ctx._smReset();
      ctx.historyList.innerHTML = ''; ctx.historySummary.textContent = '';
      ctx._histRenderedLen = 0;
      ctx.historyPanel.classList.remove('open'); ctx.btnHistory.classList.remove('active');
      ctx.summaryPanel.classList.remove('open'); ctx.btnSummary.classList.remove('active');
      ctx.liqIndicator.style.display = 'none';
    }

    function _resetChartState() {
      ctx.ohlc = []; ctx.priceHistory = []; ctx.volumeHistory = [];
      ctx.currentPrice = 0; ctx.prevTickPrice = 0; ctx.totalTicks = 0;
      ctx._aggCache = null;
      ctx.emaCache.clear(); ctx.aggEmaCache.clear();
      ctx.aggEmaScratch.clear(); ctx.emaCacheTick.clear();
      ctx.trades = [];
      ctx.srEmaValues.clear(); ctx.srPrevSide.clear(); ctx.srBreakDrift = 0;
    }

    /* ── WebSocket ──────────────────────────────────────────────── */
    function _disconnectCryptoWS() {
      if (_cryptoWS) {
        _cryptoWS.onclose = null;
        _cryptoWS.onerror = null;
        _cryptoWS.close();
        _cryptoWS = null;
      }
    }

    function _connectCryptoWS(symbol, interval) {
      _disconnectCryptoWS();
      _cryptoLiveBar = null;
      _setCryptoWsStatus('connecting');
      const url = `wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { _setCryptoWsStatus('error'); return; }
      _cryptoWS = ws;

      ws.onmessage = (evt) => {
        if (!_cryptoMode || ws !== _cryptoWS) return;
        try {
          const d = JSON.parse(evt.data);
          const k = d.k;
          if (!k) return;
          const bar = {
            o: parseFloat(k.o), h: parseFloat(k.h),
            l: parseFloat(k.l), c: parseFloat(k.c),
            v: parseFloat(k.v)
          };
          if (!isFinite(bar.c) || bar.c <= 0) return;

          if (k.x) {
            // Kline closed → full game step
            _onBarClose(bar);
            _cryptoLiveBar = null;
          } else {
            // Kline still open → real-time visual update of last bar
            _onBarLive(bar);
            _cryptoLiveBar = bar;
          }
          if (cryptoWsStatus.className.indexOf('live') < 0) _setCryptoWsStatus('live');
        } catch (_) {}
      };

      ws.onerror = () => { if (ws === _cryptoWS) _setCryptoWsStatus('error'); };

      ws.onclose = () => {
        if (!_cryptoMode || ws !== _cryptoWS) return;
        _setCryptoWsStatus('error');
        setTimeout(() => {
          if (_cryptoMode && ws === _cryptoWS) _connectCryptoWS(symbol, interval);
        }, 3000);
      };
    }

    /* ── Live bar update (kline not yet closed) ─────────────────── */
    function _onBarLive(bar) {
      const ohlcArr = ctx.ohlc;
      if (ohlcArr.length === 0) return;  // history not loaded yet

      if (_cryptoLiveBar === null) {
        // First WS message for this bar: push a new placeholder
        ohlcArr.push({ o: bar.o, h: bar.h, l: bar.l, c: bar.c });
        ctx.priceHistory.push(bar.c);
        ctx.volumeHistory.push(0.1);
      } else {
        // Subsequent messages: update the last bar in-place
        const last = ohlcArr[ohlcArr.length - 1];
        last.h = Math.max(last.h, bar.h);
        last.l = Math.min(last.l, bar.l);
        last.c = bar.c;
        ctx.priceHistory[ctx.priceHistory.length - 1] = bar.c;
      }
      ctx.currentPrice = bar.c;
      if (ctx.prevTickPrice <= 0) ctx.prevTickPrice = bar.c;
      ctx.refreshUI();
    }

    /* ── Bar closed: full game step ─────────────────────────────── */
    function _onBarClose(bar) {
      const ohlcArr = ctx.ohlc;
      const relVol  = _normalizeVol(bar.v);

      if (_cryptoLiveBar !== null && ohlcArr.length > 0) {
        // Finalise the live bar that was being updated in real-time
        const last = ohlcArr[ohlcArr.length - 1];
        last.o = bar.o; last.h = bar.h; last.l = bar.l; last.c = bar.c;
        ctx.priceHistory[ctx.priceHistory.length - 1] = bar.c;
        ctx.volumeHistory[ctx.volumeHistory.length - 1] = relVol;
      } else {
        // No live bar shown yet (first close after history load or gap)
        const open = ohlcArr.length > 0 ? ohlcArr[ohlcArr.length - 1].c : bar.o;
        ohlcArr.push({ o: open, h: bar.h, l: bar.l, c: bar.c });
        ctx.priceHistory.push(bar.c);
        ctx.volumeHistory.push(relVol);
      }

      // Trim history
      if (ohlcArr.length > ctx.MAX_HISTORY) {
        ohlcArr.shift(); ctx.priceHistory.shift(); ctx.volumeHistory.shift();
        const tradesArr = ctx.trades;
        let w = 0;
        for (let i = 0; i < tradesArr.length; i++) {
          tradesArr[i].index--;
          if (tradesArr[i].index >= 0) tradesArr[w++] = tradesArr[i];
        }
        tradesArr.length = w;
      }

      ctx.totalTicks++;
      ctx.prevTickPrice = ctx.currentPrice;
      ctx.lastTickTime  = performance.now();
      ctx.currentPrice  = bar.c;
      if (ctx.prevTickPrice <= 0) ctx.prevTickPrice = bar.c;

      ctx.updateSREMA(bar.c);
      ctx.updateEMACache();
      ctx.checkSLTP();
      ctx.refreshUI();

      const snapEq  = ctx.orders.reduce((s, o) => s + ctx.orderEquity(o), 0);
      const naNew   = ctx.cash + snapEq;
      const naPrev  = ctx.netAssetHistory.length > 0
        ? ctx.netAssetHistory[ctx.netAssetHistory.length - 1] : 0;
      ctx.netAssetHistory.push(naNew);
      if (ctx.netAssetHistory.length > 2000) ctx.netAssetHistory.shift();
      ctx._recordNetAssetStat(naNew, naPrev);
      ctx.evaluateStrategy();
    }

    /* ── Historical kline loader (async) ────────────────────────── */
    async function _fetchAndLoadHistory(symbol, interval, rev) {
      _setCryptoWsStatus('connecting', '⬡ LOADING');
      try {
        const url = `https://api.binance.com/api/v3/klines` +
                    `?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=500`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!Array.isArray(data) || data.length === 0) throw new Error('empty response');
        if (rev !== _cryptoLoadRevision) return;  // superseded by newer entry/exit

        // Volume normalisation: use median of historical raw volumes
        const rawVols = data.map(k => parseFloat(k[5]));
        const sorted  = [...rawVols].sort((a, b) => a - b);
        _cryptoVolMedian = sorted[Math.floor(sorted.length / 2)] || 1;

        // Populate chart arrays (state already reset by caller)
        for (let i = 0; i < data.length; i++) {
          const k = data[i];
          const o = parseFloat(k[1]), h = parseFloat(k[2]),
                l = parseFloat(k[3]), c = parseFloat(k[4]);
          ctx.ohlc.push({ o, h, l, c });
          ctx.priceHistory.push(c);
          ctx.volumeHistory.push(_normalizeVol(rawVols[i]));
          ctx.updateSREMA(c);
        }

        // Trim to MAX_HISTORY
        if (ctx.ohlc.length > ctx.MAX_HISTORY) {
          const trim = ctx.ohlc.length - ctx.MAX_HISTORY;
          ctx.ohlc.splice(0, trim);
          ctx.priceHistory.splice(0, trim);
          ctx.volumeHistory.splice(0, trim);
        }

        ctx.totalTicks    = ctx.priceHistory.length;
        ctx.currentPrice  = ctx.priceHistory[ctx.priceHistory.length - 1] || 0;
        ctx.prevTickPrice = ctx.currentPrice;
        ctx.updateEMACache();
        ctx.refreshUI();
        ctx.triggerFlash();
        _setCryptoWsStatus('connecting', '⬡ CONNECTING');
      } catch (e) {
        console.warn('[Crypto] history fetch failed:', e);
        if (rev === _cryptoLoadRevision) _setCryptoWsStatus('error');
      }
    }

    /* ── Enter Crypto Mode ──────────────────────────────────────── */
    async function _enterCryptoMode(symbol, interval) {
      const rev = ++_cryptoLoadRevision;
      _cryptoMode     = true;
      _cryptoSymbol   = symbol;
      _cryptoInterval = interval || _cryptoInterval;
      _cryptoLiveBar  = null;

      _resetAccountState();
      _resetChartState();

      // UI
      cryptoPanel.querySelectorAll('.crypto-sym-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.sym === symbol));
      cryptoPanel.querySelectorAll('.crypto-tf-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tf === _cryptoInterval));
      cryptoPanel.classList.add('open');
      cryptoModeBtn.classList.add('active');
      cryptoModeBtn.textContent = '⬡ LIVE';
      document.getElementById('sim-n-slider').disabled = true;

      // Stop sim tick — this module drives updates via kline-close events
      ctx.stopTick();
      ctx.refreshUI();
      ctx.showToast(
        `<b>CRYPTO · ${symbol.replace('usdt','').toUpperCase()}/${_cryptoInterval.toUpperCase()}</b>`
        + `<br>Loading history…`, 'info', 3500);

      // Load history first, then open WS so first live bar connects to history tail
      await _fetchAndLoadHistory(symbol, _cryptoInterval, rev);
      if (rev !== _cryptoLoadRevision) return;  // superseded (user exited during load)
      _connectCryptoWS(symbol, _cryptoInterval);
    }

    /* ── Exit Crypto Mode ───────────────────────────────────────── */
    function _exitCryptoMode() {
      _cryptoLoadRevision++;   // cancel any in-flight fetch
      _cryptoMode    = false;
      _cryptoLiveBar = null;
      _disconnectCryptoWS();

      cryptoPanel.classList.remove('open');
      cryptoModeBtn.classList.remove('active');
      cryptoModeBtn.textContent = '⬡ CRYPTO';
      document.getElementById('sim-n-slider').disabled = false;

      ctx.stopTick();
      ctx.resetGame();
      ctx.startTick(ctx.TICK_MS_BASE / ctx.simN);
      ctx.showToast('Returning to <b>SIM mode</b>', 'info', 2000);
    }

    /* ── Soft Reset (keep mode & symbol, reload history) ────────── */
    async function _softReset() {
      const rev = ++_cryptoLoadRevision;
      _disconnectCryptoWS();
      _cryptoLiveBar = null;

      _resetAccountState();
      _resetChartState();
      ctx.refreshUI();

      await _fetchAndLoadHistory(_cryptoSymbol, _cryptoInterval, rev);
      if (rev !== _cryptoLoadRevision) return;
      _connectCryptoWS(_cryptoSymbol, _cryptoInterval);
      ctx.triggerFlash();
    }

    /* ── Event Listeners ────────────────────────────────────────── */
    cryptoModeBtn.addEventListener('click', () => {
      if (_cryptoMode) _exitCryptoMode();
      else             _enterCryptoMode(_cryptoSymbol);
    });

    cryptoPanel.querySelectorAll('.crypto-sym-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!_cryptoMode) return;
        const sym = btn.dataset.sym;
        if (sym === _cryptoSymbol) return;
        _enterCryptoMode(sym, _cryptoInterval);
      });
    });

    cryptoPanel.querySelectorAll('.crypto-tf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!_cryptoMode) return;
        const tf = btn.dataset.tf;
        if (tf === _cryptoInterval) return;
        _enterCryptoMode(_cryptoSymbol, tf);
      });
    });

    /* ── Public API ─────────────────────────────────────────────── */
    return {
      get mode()   { return _cryptoMode; },
      get symbol() { return _cryptoSymbol; },
      // step() is a no-op: in crypto mode the tick is stopped and
      // kline-close WS events drive all game logic directly.
      step()       {},
      disconnect() { _disconnectCryptoWS(); },
      softReset()  { _softReset(); },
    };
  };

})();
