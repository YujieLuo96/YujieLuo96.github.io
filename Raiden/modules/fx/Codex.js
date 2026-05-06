var Codex = (() => {
    let _open  = false;
    let _tab   = 0;
    let _fc    = 0;
    let _ready = false;
    let _scrollY = [0, 0, 0, 0];
    let _totalH  = [9999, 9999, 9999, 9999];

    const TABS = ['ENEMIES', 'WEAPONS', 'SCENES', 'ITEMS'];
    const PAD = 14, GAP = 8;
    const CW = 130, CH = 112, LH = 20;

    let _eDummies = [];
    let _iDummies = [];

    function _init() {
        if (_ready) return;

        // Ensure all scenes have their particle/star arrays populated
        for (const sd of SceneRegistry.getDefs()) {
            const sc = sd.getScene();
            if (sc && typeof sc.init === 'function') sc.init();
        }

        _eDummies = EnemyRegistry.getDefs().map(d => {
            let inst = null;
            try {
                inst = d.mk();
                inst.x = 0; inst.y = 0;
                if (inst.flashTimer !== undefined) inst.flashTimer = 0;
                if (inst.alpha      !== undefined) inst.alpha      = 1;
                if (typeof inst.phase === 'string' && inst.phase === 'entry') inst.phase = 'fight';
            } catch(_e) {}
            return { label:d.label, scale:d.scale, group:d.group, inst };
        });

        _iDummies = ItemRegistry.getDefs().map(d => {
            let inst = null;
            try {
                inst = d.mk();
                inst.x = 0; inst.y = 0;
                inst._scale = 1; inst._age = 8;
            } catch(_e) {}
            return { label:d.label, col:d.col, inst };
        });

        _ready = true;
    }

    function _hexRgb(hex) {
        hex = hex.replace('#','');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        if (hex.length === 4) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3];
        if (hex.length !== 6 && hex.length !== 8) return '255,255,255';
        return `${parseInt(hex.slice(0,2),16)},${parseInt(hex.slice(2,4),16)},${parseInt(hex.slice(4,6),16)}`;
    }

    function _ncols(W) { return Math.max(3, Math.floor((W - PAD*2 + GAP) / (CW + GAP))); }

    function _cellBg(ctx, ox, oy, w, h) {
        ctx.fillStyle   = 'rgba(255,255,255,0.04)';
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.roundRect(ox, oy, w, h, 4); ctx.fill(); ctx.stroke();
    }

    function _cellLabel(ctx, text, cx, bottom, col) {
        ctx.font = '9px "Courier New",monospace';
        ctx.fillStyle = col || '#aaa';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(text, cx, bottom - 3);
    }

    function _groupHeader(ctx, text, lx, y, rowW) {
        ctx.font = 'bold 10px "Courier New",monospace';
        ctx.fillStyle = '#555'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(text, lx, y);
        const tw = ctx.measureText(text).width + 8;
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(lx + tw, y); ctx.lineTo(lx + rowW, y); ctx.stroke();
    }

    // ── Tab: ENEMIES ───────────────────────────────────────────────────────
    function _tabEnemies(ctx, W) {
        const nc = _ncols(W);
        const rowW = nc * CW + (nc - 1) * GAP;
        const lx   = (W - rowW) / 2;
        let x = lx, y = PAD, col = 0, lastGroup;

        for (const e of _eDummies) {
            if (e.group && e.group !== lastGroup) {
                if (col > 0) { y += CH + GAP; col = 0; x = lx; }
                y += 6; _groupHeader(ctx, e.group, lx, y + 7, rowW); y += 18;
                lastGroup = e.group;
            }
            _cellBg(ctx, x, y, CW, CH);
            if (e.inst) {
                const prevH = CH - LH, cx = x + CW / 2, cy = y + prevH / 2;
                ctx.save();
                ctx.beginPath(); ctx.rect(x + 2, y + 2, CW - 4, prevH - 4); ctx.clip();
                ctx.translate(cx, cy); ctx.scale(e.scale, e.scale);
                try { e.inst.draw(ctx, 0, _fc); } catch(_e) {}
                ctx.restore();
            }
            _cellLabel(ctx, e.label, x + CW / 2, y + CH);
            col++;
            if (col >= nc) { col = 0; x = lx; y += CH + GAP; } else x += CW + GAP;
        }
        return (col > 0 ? y + CH + GAP : y) + PAD;
    }

    // ── Tab: WEAPONS ───────────────────────────────────────────────────────
    function _tabWeapons(ctx, W) {
        const WCW = Math.min(190, Math.floor((W - PAD * 2 - GAP * 2) / 3));
        const WCH = 108;
        const nc  = Math.max(2, Math.floor((W - PAD * 2 + GAP) / (WCW + GAP)));
        const rowW = nc * WCW + (nc - 1) * GAP;
        const lx   = (W - rowW) / 2;
        let x = lx, y = PAD, col = 0;

        for (const w of WeaponRegistry.getDefs()) {
            const rgb = _hexRgb(w.col);
            ctx.fillStyle   = 'rgba(0,0,0,0.45)';
            ctx.strokeStyle = `rgba(${rgb},0.35)`;
            ctx.lineWidth   = 1;
            ctx.beginPath(); ctx.roundRect(x, y, WCW, WCH, 4); ctx.fill(); ctx.stroke();
            ctx.fillStyle = w.col; ctx.globalAlpha = 0.18;
            ctx.fillRect(x + 1, y + 1, WCW - 2, 4); ctx.globalAlpha = 1;
            ctx.font = 'bold 14px "Courier New",monospace';
            ctx.fillStyle = w.col; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.shadowColor = w.col; ctx.shadowBlur = 6;
            ctx.fillText(`[${w.key}]`, x + 8, y + 10); ctx.shadowBlur = 0;
            ctx.font = 'bold 9px "Courier New",monospace';
            ctx.fillStyle = '#ddd';
            ctx.fillText(w.label, x + 8, y + 28);
            ctx.font = 'bold 8px "Courier New",monospace';
            ctx.fillStyle = w.col; ctx.globalAlpha = 0.85;
            ctx.fillText(w.sub, x + 8, y + 42); ctx.globalAlpha = 1;
            ctx.font = '8px "Courier New",monospace';
            ctx.fillStyle = '#666';
            ctx.fillText(w.desc, x + 8, y + 62);
            ctx.strokeStyle = w.col; ctx.globalAlpha = 0.20; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x+8, y+WCH-8); ctx.lineTo(x+WCW-8, y+WCH-8); ctx.stroke();
            ctx.globalAlpha = 1;

            col++;
            if (col >= nc) { col = 0; x = lx; y += WCH + GAP; } else x += WCW + GAP;
        }
        return (col > 0 ? y + WCH + GAP : y) + PAD;
    }

    // ── Tab: SCENES ────────────────────────────────────────────────────────
    function _tabScenes(ctx, W) {
        const SCW = Math.floor((W - PAD * 2 - GAP) / 2);
        const SCH = Math.round(SCW * 0.60);
        const lblH = 18;
        const lx   = (W - (SCW * 2 + GAP)) / 2;
        let x = lx, y = PAD, col = 0;

        for (const sd of SceneRegistry.getDefs()) {
            ctx.strokeStyle = 'rgba(100,150,255,0.22)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(x, y, SCW, SCH + lblH, 4); ctx.stroke();
            try {
                const sc = sd.getScene();
                ctx.save();
                ctx.beginPath(); ctx.rect(x + 1, y + 1, SCW - 2, SCH - 2); ctx.clip();
                ctx.translate(x + 1, y + 1);
                ctx.scale((SCW - 2) / Renderer.W, (SCH - 2) / Renderer.H);
                sc.draw(ctx);
                ctx.restore();
            } catch(_e) {}
            ctx.font = '10px "Courier New",monospace';
            ctx.fillStyle = '#7af'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(sd.label, x + SCW / 2, y + SCH + lblH / 2);

            col++;
            if (col >= 2) { col = 0; x = lx; y += SCH + lblH + GAP; } else x += SCW + GAP;
        }
        return (col > 0 ? y + SCH + lblH + GAP : y) + PAD;
    }

    // ── Tab: ITEMS ─────────────────────────────────────────────────────────
    function _tabItems(ctx, W) {
        const nc   = _ncols(W);
        const rowW = nc * CW + (nc - 1) * GAP;
        const lx   = (W - rowW) / 2;
        let x = lx, y = PAD, col = 0;

        for (const it of _iDummies) {
            _cellBg(ctx, x, y, CW, CH);
            if (it.inst) {
                const prevH = CH - LH, cx = x + CW / 2, cy = y + prevH / 2;
                ctx.save();
                ctx.beginPath(); ctx.rect(x + 2, y + 2, CW - 4, prevH - 4); ctx.clip();
                ctx.translate(cx, cy); ctx.scale(2.2, 2.2);
                try { it.inst.draw(ctx, _fc); } catch(_e) {}
                ctx.restore();
            }
            _cellLabel(ctx, it.label, x + CW / 2, y + CH, it.col);
            col++;
            if (col >= nc) { col = 0; x = lx; y += CH + GAP; } else x += CW + GAP;
        }
        return (col > 0 ? y + CH + GAP : y) + PAD;
    }

    // ── Public API ─────────────────────────────────────────────────────────
    return {
        isOpen()  { return _open; },
        open()    { _open = true; _init(); },
        close()   { _open = false; },
        toggle()  { _open ? this.close() : this.open(); },

        scroll(d) {
            if (!_open) return;
            _scrollY[_tab] = Math.max(0, _scrollY[_tab] + d);
        },

        handleKey(key) {
            if (!_open) return false;
            if (key === 'ArrowLeft'  || key === 'q' || key === 'Q') { _tab = (_tab + TABS.length - 1) % TABS.length; _scrollY[_tab] = 0; }
            if (key === 'ArrowRight' || key === 'e' || key === 'E') { _tab = (_tab + 1) % TABS.length; _scrollY[_tab] = 0; }
            if (key === 'ArrowUp'   ) { this.scroll(-55); }
            if (key === 'ArrowDown' ) { this.scroll( 55); }
            return true;
        },

        update(dt) {
            if (!_open) return;
            _fc += dt;
            for (const sd of SceneRegistry.getDefs()) {
                const sc = sd.getScene();
                if (sc && typeof sc.update === 'function') sc.update(dt);
            }
        },

        draw(ctx) {
            if (!_open) return;
            const W = Renderer.W, H = Renderer.H;

            ctx.fillStyle = 'rgba(0,0,12,0.94)';
            ctx.fillRect(0, 0, W, H);

            ctx.shadowColor = 'rgba(80,160,255,0.55)'; ctx.shadowBlur = 14;
            ctx.font = 'bold 20px "Courier New",monospace';
            ctx.fillStyle = '#eef'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText('◈  CODEX  ◈', W / 2, 10);
            ctx.shadowBlur = 0;

            ctx.font = '9px "Courier New",monospace';
            ctx.fillStyle = '#444'; ctx.textAlign = 'right';
            ctx.fillText('[M / ESC] CLOSE   ← Q E → TABS   ↑ ↓ SCROLL', W - 8, 14);

            const TY = 36;
            const tabW = Math.min(118, Math.floor((W - 24) / TABS.length));
            const tx0  = (W - tabW * TABS.length) / 2;
            TABS.forEach((tab, i) => {
                const tx = tx0 + i * tabW, active = _tab === i;
                ctx.fillStyle   = active ? 'rgba(40,90,220,0.50)' : 'rgba(255,255,255,0.04)';
                ctx.strokeStyle = active ? 'rgba(110,170,255,0.90)' : 'rgba(255,255,255,0.12)';
                ctx.lineWidth   = 1;
                ctx.beginPath(); ctx.roundRect(tx + 2, TY, tabW - 4, 20, 3); ctx.fill(); ctx.stroke();
                ctx.font      = `${active ? 'bold ' : ''}10px "Courier New",monospace`;
                ctx.fillStyle = active ? '#adf' : '#555';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(tab, tx + tabW / 2, TY + 10);
            });

            const CT = TY + 26, CH_avail = H - CT - 6;
            ctx.save();
            ctx.beginPath(); ctx.rect(0, CT, W, CH_avail); ctx.clip();
            ctx.translate(0, CT - _scrollY[_tab]);

            let totalH = 0;
            switch (_tab) {
                case 0: totalH = _tabEnemies(ctx, W); break;
                case 1: totalH = _tabWeapons(ctx, W); break;
                case 2: totalH = _tabScenes(ctx, W);  break;
                case 3: totalH = _tabItems(ctx, W);   break;
            }
            _totalH[_tab] = totalH;
            ctx.restore();

            _scrollY[_tab] = Math.max(0, Math.min(_scrollY[_tab], Math.max(0, totalH - CH_avail)));

            if (totalH > CH_avail) {
                const sbH  = Math.max(24, (CH_avail / totalH) * CH_avail);
                const sbY  = CT + (_scrollY[_tab] / Math.max(1, totalH - CH_avail)) * (CH_avail - sbH);
                ctx.fillStyle = 'rgba(100,150,255,0.28)';
                ctx.beginPath(); ctx.roundRect(W - 5, sbY, 3, sbH, 1.5); ctx.fill();
            }

            ctx.textAlign = 'left'; ctx.globalAlpha = 1;
        }
    };
})();
