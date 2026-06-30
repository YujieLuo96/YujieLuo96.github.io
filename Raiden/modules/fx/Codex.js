var Codex = (() => {
    let _open  = false;
    let _tab   = 0;
    let _fc    = 0;
    let _ready = false;
    let _scrollY = [0, 0, 0, 0];
    let _totalH  = [9999, 9999, 9999, 9999];

    const TABS = ['ENEMIES', 'WEAPONS', 'SCENES', 'ITEMS'];
    const PAD  = 14, GAP = 8;
    const CW   = 148;  // cell width
    const CEH  = 158;  // enemy cell height
    const CIH  = 112;  // item cell height

    let _eDummies = [];
    let _iDummies = [];

    // ── Static data ────────────────────────────────────────────────────────────
    const _EDATA = {
        scout:       { tags:['FAST','SWARM'],           atks:['AIMED SHOT (12% CHANCE)'] },
        fighter:     { tags:['WOBBLE','STEADY'],        atks:['3-WAY SPREAD AIM'] },
        bomber:      { tags:['HEAVY','SLOW'],           atks:['5-WIDE FAN SHOT'] },
        drone:       { tags:['SWARM','ORBIT'],          atks:['NO WEAPON — COLLISION ONLY'] },
        interceptor: { tags:['FAST','SIDE ENTRY'],      atks:['2-SHOT BURST (PASS-THROUGH)'] },
        gunship:     { tags:['BURST','HOVER'],          atks:['2×BARREL ×3 BURST SALVO'] },
        predator:    { tags:['CLOAK','HUNTER'],         atks:['4-SPREAD (VISIBLE PHASE ONLY)'] },
        carrier:     { tags:['CARRIER'],                atks:['5-FAN SHOT', 'PERIODIC DRONE LAUNCH'] },
        marauder:    { tags:['DIVE ATTACK'],            atks:['3× AIMED FIRE (DIVE PHASE)'] },
        spinner:     { tags:['ROTATING','RING FIRE'],   atks:['8-BULLET RING BURST'] },
        vanguard:    { tags:['ASSAULT','HEAVY FIRE'],   atks:['3-WAY SPREAD AIM'] },
        elite:       { tags:['ADAPTIVE'],               atks:['RING×8 / 3-WAY / FAST AIM', '(RANDOM BEHAVIOR PER SPAWN)'] },
        spectre:     { tags:['STEALTH','PHASE-BLINK'],  atks:['3-SPIRAL BURST', 'BLINK + 4-WAY AIM'] },
        devastator:  { tags:['FIELD COMMANDER'],        atks:['3-SPREAD AIM', 'HOMING MISSILES ×2'] },
        siren:       { tags:['LOCK-ON','RING-GAP'],     atks:['CHARGES → GAP-RING', '(SAFE GAP TRACKS YOUR BEARING)'] },
        weaver:      { tags:['WEAVE','SERPENT'],        atks:['3× SINE-WAVE SNAKE AIM'] },
        splitter:    { tags:['FRAGMENTS'],              atks:['2× AIMED FIRE', 'SPLITS INTO 3 DIVERS ON DEATH'] },
        midboss:     { tags:['MID BOSS'],               atks:['P1: RING×16 + AIM×3', 'P2: AIM×5 + SPIRAL×4'] },
        midboss2:    { tags:['MID BOSS'],               atks:['P1: RING×20 + AIM×3', 'P2: AIM×5 + SPIRAL ×8'] },
        boss1:       { tags:['BOSS · 3 PHASES'],        atks:['P1: RING×14 + TURRETS ×4', 'P2: +AIM×3 · P3: +SPIRAL'] },
        boss2:       { tags:['BOSS · 3 PHASES'],        atks:['P1: AIM×3 + DUAL CANNONS', 'P2: +RING×14 · P3: +SPIRAL'] },
        boss3:       { tags:['BOSS · 4 PHASES'],        atks:['RING BARRAGE + TELEPORT', 'ALL PHASES ESCALATE TO BULLET HELL'] },
        boss4:       { tags:['BOSS · 5 PHASES'],        atks:['RING → SPIRAL → DASH → SUMMON', 'ENRAGE PHASE AT 15% HP'] },
        boss5:       { tags:['BOSS · 4 MODES'],         atks:['SIEGE / BARRAGE / SWARM', 'OVERLOAD (PHASE 2+ ONLY)'] },
        boss6:       { tags:['BOSS · 3 PHASES'],        atks:['NEUTRON RING×24 + LIGHTNING', 'CLUSTER BURST + RING NOVA'] },
        boss7:       { tags:['FINAL BOSS · 2 STAGES'],  atks:['RING+AIM+SPIRAL ALL AT ONCE', 'STAGE 2: RAGE + SUMMON ELITES'] },
        boss8:       { tags:['BOSS · ARENA SHAPER'],    atks:['DROPS WALL-ARRAYS (MOVING GAP)', 'P2: DOUBLE WALLS · P3: GAP HOMERS'] },
    };

    const _IDATA = {
        power:      { l1:'+1 WEAPON POWER LEVEL',       l2:'Stack to 100 — shifts color spectrum' },
        bomb:       { l1:'+1 BOMB CHARGE  (MAX 5)',      l2:'Bombs clear all enemies on screen' },
        health:     { l1:'RESTORE 1 HULL INTEGRITY',     l2:'Does not stack beyond maximum HP' },
        shield:     { l1:'8s INVINCIBILITY SHIELD',      l2:'Absorbs all incoming damage' },
        weapon_item:{ l1:'EQUIP NEW WEAPON SYSTEM',      l2:'Weapon type varies by drop source' },
        timeslow:   { l1:'10s  ALL ENEMIES 50% SLOWER',  l2:'Projectiles also slowed' },
        multiplier: { l1:'15s  DOUBLE SCORE GAIN',       l2:'Combo multiplier is also doubled' },
        megabomb:   { l1:'SCREEN-CLEAR MEGA EXPLOSION',  l2:'Destroys all bullets and enemies' },
    };

    // ── Shot animation state (per cell index) ──────────────────────────────────
    const _shotS = {};

    function _mkShots(type, cycle) {
        const shots = [];
        const S = 1.55;
        const ra = () => (Math.random() * 2 - 1) * 0.18; // small random angle noise

        const ring = (n, spd, baseAng, col) => {
            for (let i = 0; i < n; i++) {
                const a = baseAng + (i / n) * Math.PI * 2;
                shots.push({ ox:0, oy:0, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd, col });
            }
        };
        const aimed = (n, spd, spread, col) => {
            for (let i = 0; i < n; i++) {
                const a = Math.PI/2 + (n > 1 ? (i/(n-1) - 0.5) * spread : 0);
                shots.push({ ox:0, oy:0, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd, col });
            }
        };
        const fan = (n, spd, ca, sp, col) => {
            for (let i = 0; i < n; i++) {
                const a = ca + (n > 1 ? (i/(n-1) - 0.5) * sp : 0);
                shots.push({ ox:0, oy:0, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd, col });
            }
        };
        const spiral = (n, spd, baseAng, col) => {
            for (let i = 0; i < n; i++) {
                const a = baseAng + (i/n)*Math.PI*2 + ra();
                shots.push({ ox:0, oy:0, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd, col });
            }
        };
        const rng = () => Math.random() * Math.PI * 2;

        switch (type) {
            case 'scout':       aimed(1, S, 0,    '#ffaa44'); break;
            case 'fighter':     aimed(3, S, 0.42, '#ffaa44'); break;
            case 'bomber':      fan(5, S, Math.PI/2, 0.55, '#ff8844'); break;
            case 'drone':
                shots.push({ ox:-7, oy:-4, vx:0, vy:S*0.4, col:'#cc66ff' });
                shots.push({ ox: 7, oy:-4, vx:0, vy:S*0.4, col:'#cc66ff' });
                break;
            case 'interceptor': aimed(2, S*1.2, 0.22, '#ff8844'); break;
            case 'gunship':
                for (const ox of [-4, 4]) {
                    shots.push({ ox, oy:5, vx: ox*0.025, vy: S,      col:'#44ccff' });
                    shots.push({ ox, oy:5, vx: ox*0.060, vy: S*0.97, col:'#44ccff' });
                    shots.push({ ox, oy:5, vx:-ox*0.025, vy: S,      col:'#44ccff' });
                }
                break;
            case 'predator':    aimed(4, S, 0.28, '#ff4488'); break;
            case 'carrier':
                fan(5, S*0.85, Math.PI/2, 0.9, '#88aaff');
                shots.push({ ox:-5, oy:10, vx:0, vy:S*0.45, col:'#cc88ff' });
                shots.push({ ox: 5, oy:10, vx:0, vy:S*0.45, col:'#cc88ff' });
                break;
            case 'marauder':
                aimed(cycle%2===0 ? 3 : 1, S*1.3, 0.3, '#ff8844'); break;
            case 'spinner':
                ring(8, S*0.9, rng(), '#ffff44'); break;
            case 'vanguard':    aimed(3, S, 0.38, '#88ff44'); break;
            case 'elite': {
                const p = cycle % 3;
                if (p === 0)      ring(8, S*1.1, rng(), '#ff44ff');
                else if (p === 1) aimed(3, S, 0.44, '#ff88ff');
                else              aimed(2, S*1.3, 0.2, '#ff44aa');
                break;
            }
            case 'spectre': {
                if (cycle%2===0) {
                    for (let i=0; i<3; i++) {
                        const a = (i/3)*Math.PI*2 + rng()*0.1;
                        shots.push({ ox:Math.cos(a)*5, oy:Math.sin(a)*5, vx:Math.cos(a)*S*0.9, vy:Math.sin(a)*S*0.9, col:'#8844ff' });
                    }
                } else { aimed(4, S, 0.32, '#aa44ff'); }
                break;
            }
            case 'devastator': {
                if (cycle%2===0) { aimed(3, S, 0.25, '#ff6644'); }
                else {
                    shots.push({ ox:-14, oy:0, vx:-0.3, vy:S*0.65, col:'#ff4400' });
                    shots.push({ ox: 14, oy:0, vx: 0.3, vy:S*0.65, col:'#ff4400' });
                    aimed(2, S*0.8, 0.2, '#ff6644');
                }
                break;
            }
            case 'siren': {
                // 留缝环预览：缺口朝下（玩家方向）
                for (let i = 0; i < 13; i++) {
                    const a = (i / 13) * Math.PI * 2 + rng() * 0.1;
                    let d = a - Math.PI / 2;
                    while (d >  Math.PI) d -= Math.PI * 2;
                    while (d < -Math.PI) d += Math.PI * 2;
                    if (Math.abs(d) < 0.55) continue;
                    shots.push({ ox:0, oy:0, vx:Math.cos(a)*S*0.85, vy:Math.sin(a)*S*0.85, col:'#ff5f8f' });
                }
                break;
            }
            case 'weaver':   aimed(3, S, 0.30, '#5ad7c0'); break;
            case 'splitter': aimed(2, S, 0.22, '#ffa050'); break;
            case 'midboss': {
                const p = cycle%2;
                if (p===0) { ring(16, S*1.1, rng(), '#ff8844'); aimed(3, S*1.2, 0.4, '#ffaa44'); }
                else        { aimed(5, S*1.3, 0.55, '#ff6600'); spiral(4, S*1.1, rng(), '#ffcc44'); }
                break;
            }
            case 'midboss2': {
                const p = cycle%2;
                if (p===0) { ring(20, S, rng(), '#ff4444'); aimed(3, S*1.2, 0.4, '#ff8844'); }
                else        { aimed(5, S*1.4, 0.55, '#ff4400'); ring(8, S*0.85, rng(), '#ffaa00'); }
                break;
            }
            case 'boss1': {
                const p = cycle%3;
                if (p===0) ring(14, S*1.1, rng(), '#6699ff');
                else if (p===1) aimed(3, S*1.3, 0.35, '#44aaff');
                else { ring(14, S*0.9, rng(), '#aaccff'); spiral(6, S*1.2, rng(), '#6688ff'); }
                break;
            }
            case 'boss2': {
                const p = cycle%3;
                if (p===0) aimed(3, S*1.2, 0.5, '#ffaa44');
                else if (p===1) { ring(14, S*1.1, rng(), '#ffcc44'); aimed(2, S, 0.25, '#ff8800'); }
                else { ring(14, S, rng(), '#ff6600'); aimed(4, S*1.3, 0.5, '#ffaa44'); spiral(5, S*1.1, rng(), '#ffdd44'); }
                break;
            }
            case 'boss3': {
                const p = cycle%4;
                if (p===0) ring(12, S*1.1, rng(), '#cc44ff');
                else if (p===1) { ring(12, S, rng(), '#aa22ff'); aimed(3, S*1.2, 0.4, '#dd44ff'); }
                else if (p===2) ring(18, S*1.2, rng(), '#ff44ff');
                else { ring(24, S*1.3, rng(), '#ff22cc'); aimed(5, S*1.4, 0.5, '#cc00ff'); }
                break;
            }
            case 'boss4': {
                const p = cycle%5;
                if (p===0) ring(16, S, rng(), '#4488ff');
                else if (p===1) spiral(8, S*1.1, rng(), '#44aaff');
                else if (p===2) aimed(4, S*1.5, 0.4, '#0066ff');
                else if (p===3) { ring(12, S*0.8, rng(), '#66aaff'); aimed(2, S*1.2, 0.15, '#ffffff'); }
                else { ring(20, S*1.4, rng(), '#2255ff'); spiral(6, S*1.5, rng(), '#88ccff'); }
                break;
            }
            case 'boss5': {
                const p = cycle%4;
                if (p===0) { ring(12, S, rng(), '#ff4400'); aimed(3, S*1.1, 0.35, '#ff8800'); }
                else if (p===1) fan(7, S*1.3, Math.PI/2, 1.2, '#ffdd44');
                else if (p===2) { ring(8, S*0.7, rng(), '#44ff88'); ring(8, S*0.7, rng()+Math.PI/8, '#88ff44'); }
                else { ring(16, S*1.4, rng(), '#ff2200'); aimed(5, S*1.5, 0.6, '#ffaa00'); }
                break;
            }
            case 'boss6': {
                const p = cycle%3;
                if (p===0) ring(24, S*0.9, rng(), '#44ccff');
                else if (p===1) {
                    for (let i=0; i<6; i++) {
                        const a = rng();
                        shots.push({ ox:Math.cos(a)*12, oy:Math.sin(a)*8, vx:Math.cos(a)*S*0.8, vy:Math.sin(a)*S*0.8, col:'#eefeff' });
                    }
                } else { ring(24, S*1.3, rng(), '#00eeff'); spiral(8, S*1.1, rng(), '#88eeff'); }
                break;
            }
            case 'boss7': {
                const p = cycle%4;
                if (p===0) { ring(10, S, rng(), '#ff4422'); aimed(2, S*1.2, 0.22, '#ffffff'); }
                else if (p===1) { ring(14, S*1.1, rng(), '#ff4400'); aimed(3, S*1.3, 0.22, '#ffffff'); }
                else if (p===2) { ring(14, S*1.2, rng(), '#ff6600'); aimed(3, S*1.3, 0.22, '#ffffff'); ring(10, S*0.9, rng()+Math.PI/14, '#ffaa44'); }
                else { ring(20, S*1.4, rng(), '#ff3300'); aimed(3, S*1.5, 0.22, '#ffffff'); spiral(6, S*1.2, rng(), '#ffcc44'); }
                break;
            }
            case 'boss8': {
                // 弹墙阵预览：一排下落弹（中段留缺口）+ 瞄准爆发
                for (let i = 0; i < 9; i++) {
                    if (i === 4 || i === 5) continue;          // 缺口
                    shots.push({ ox:(i-4)*7, oy:-8, vx:0, vy:S, col:'#7fe0ff' });
                }
                aimed(cycle%2===0 ? 3 : 4, S*1.1, 0.4, '#7fd0ff');
                break;
            }
        }
        return shots;
    }

    function _updateShots(idx, type) {
        if (!_shotS[idx]) _shotS[idx] = { fc:-9999, cycle:0, shots:[] };
        const ss = _shotS[idx];
        const period = 60;
        if (_fc - ss.fc >= period) {
            ss.fc    = _fc;
            ss.cycle = (ss.cycle + 1) & 0xff;
            ss.shots = _mkShots(type, ss.cycle);
        }
    }

    function _drawShots(ctx, idx, cx, cy) {
        const ss = _shotS[idx];
        if (!ss || !ss.shots.length) return;
        const age = _fc - ss.fc;
        if (age < 0) return;
        const maxAge = 55;
        for (const s of ss.shots) {
            const fade = Math.min(1, age/6) * Math.max(0, 1 - Math.max(0, age - maxAge*0.55) / (maxAge*0.45));
            if (fade < 0.02) continue;
            ctx.globalAlpha = fade * 0.88;
            ctx.fillStyle   = s.col;
            ctx.beginPath();
            ctx.arc(cx + s.ox + s.vx*age*0.55, cy + s.oy + s.vy*age*0.55, 2.5, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ── UI helpers ─────────────────────────────────────────────────────────────
    function _hexRgb(hex) {
        hex = hex.replace('#','');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        if (hex.length !== 6 && hex.length !== 8) return '255,255,255';
        return `${parseInt(hex.slice(0,2),16)},${parseInt(hex.slice(2,4),16)},${parseInt(hex.slice(4,6),16)}`;
    }

    function _ncols(W) { return Math.max(2, Math.floor((W - PAD*2 + GAP) / (CW + GAP))); }

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

    // Compact 12-segment mini bar
    function _miniSegs(ctx, x, y, w, h, ratio, col) {
        const n = 12, gap = 1, sw = Math.floor((w - gap*(n-1)) / n);
        const fill = Math.round(Math.max(0, Math.min(1, ratio)) * n);
        for (let i = 0; i < n; i++) {
            ctx.fillStyle = i < fill ? col : 'rgba(12,20,30,0.9)';
            ctx.fillRect(x + i*(sw+gap), y, sw, h);
        }
    }

    // Colored tag chip — returns x after chip
    function _tagChip(ctx, x, y, text) {
        ctx.font = '7px "Courier New",monospace';
        const tw = ctx.measureText(text).width;
        const cw = tw + 6;
        ctx.fillStyle   = 'rgba(90,105,175,0.16)';
        ctx.strokeStyle = 'rgba(100,115,195,0.38)';
        ctx.lineWidth   = 0.5;
        ctx.beginPath(); ctx.roundRect(x, y, cw, 11, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle   = '#7a8ac0';
        ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        ctx.fillText(text, x + 3, y + 1.5);
        return x + cw;
    }

    // ── Init ───────────────────────────────────────────────────────────────────
    function _init() {
        if (_ready) return;
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
            return { label:d.label, col:d.col, inst, kind:inst?.kind };
        });
        _ready = true;
    }

    // ── Tab: ENEMIES ───────────────────────────────────────────────────────────
    function _tabEnemies(ctx, W) {
        const nc   = _ncols(W);
        const rowW = nc * CW + (nc - 1) * GAP;
        const lx   = (W - rowW) / 2;
        let x = lx, y = PAD, col = 0, lastGroup;

        _eDummies.forEach((e, idx) => {
            if (e.group && e.group !== lastGroup) {
                if (col > 0) { y += CEH + GAP; col = 0; x = lx; }
                y += 6; _groupHeader(ctx, e.group, lx, y + 7, rowW); y += 18;
                lastGroup = e.group;
            }

            _cellBg(ctx, x, y, CW, CEH);

            // Preview area (80px tall)
            const prevH = 80;
            const cx = x + CW / 2, cy = y + prevH / 2;
            if (e.inst) {
                // Draw enemy sprite
                ctx.save();
                ctx.beginPath(); ctx.rect(x + 2, y + 2, CW - 4, prevH - 4); ctx.clip();
                ctx.translate(cx, cy); ctx.scale(e.scale, e.scale);
                try { e.inst.draw(ctx, 0, _fc); } catch(_e2) {}
                ctx.restore();
                // Draw attack animation (clipped to preview area)
                ctx.save();
                ctx.beginPath(); ctx.rect(x + 2, y + 2, CW - 4, prevH - 4); ctx.clip();
                _updateShots(idx, e.inst.type);
                _drawShots(ctx, idx, cx, cy);
                ctx.restore();
            }

            // Divider between preview and info rows
            ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x + 4, y + prevH + 1); ctx.lineTo(x + CW - 4, y + prevH + 1); ctx.stroke();

            // Stats row: HP bar + SCORE
            const hp    = e.inst?.maxHp ?? '?';
            const score = e.inst?.score ?? '?';
            ctx.font = '7px "Courier New",monospace';
            ctx.textBaseline = 'top'; ctx.textAlign = 'left';
            ctx.fillStyle = '#556';
            ctx.fillText('HP', x + 6, y + 84);
            _miniSegs(ctx, x + 20, y + 85, 66, 5, 1.0, e.group === 'BOSSES' ? '#dd4444' : '#ff6644');
            ctx.fillStyle = '#668';
            ctx.textAlign = 'right';
            ctx.fillText(`SCR ${score}`, x + CW - 5, y + 84);

            // Attack description lines
            const d = _EDATA[e.inst?.type];
            ctx.font = '8px "Courier New",monospace';
            ctx.textAlign = 'left';
            if (d?.atks?.[0]) {
                ctx.fillStyle = e.group === 'BOSSES' ? '#cc7766' : '#cc9955';
                ctx.fillText(`▸ ${d.atks[0]}`, x + 6, y + 97);
            }
            if (d?.atks?.[1]) {
                ctx.fillStyle = '#886644';
                ctx.fillText(`▸ ${d.atks[1]}`, x + 6, y + 108);
            }

            // Tags row
            if (d?.tags) {
                ctx.font = '7px "Courier New",monospace';
                let tx = x + 6;
                for (const tag of d.tags) {
                    if (tx + ctx.measureText(tag).width + 10 > x + CW - 4) break;
                    tx = _tagChip(ctx, tx, y + 120, tag) + 3;
                }
            }

            // Cell label at bottom
            const lblCol = e.group === 'BOSSES' ? '#ee8877' : '#aaa';
            _cellLabel(ctx, e.label, x + CW / 2, y + CEH, lblCol);

            col++;
            if (col >= nc) { col = 0; x = lx; y += CEH + GAP; } else x += CW + GAP;
        });

        return (col > 0 ? y + CEH + GAP : y) + PAD;
    }

    // ── Tab: WEAPONS ───────────────────────────────────────────────────────────
    function _tabWeapons(ctx, W) {
        const WCW = Math.min(200, Math.floor((W - PAD * 2 - GAP * 2) / 3));
        const WCH = 118;
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
            // Header accent bar
            ctx.fillStyle = w.col; ctx.globalAlpha = 0.18;
            ctx.fillRect(x + 1, y + 1, WCW - 2, 5); ctx.globalAlpha = 1;

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
            // Word-wrap desc at ~WCW-16px
            const maxW = WCW - 16;
            const words = w.desc.split(' ');
            let line = '', lineY = y + 58;
            for (const wd of words) {
                const test = line ? `${line} ${wd}` : wd;
                if (ctx.measureText(test).width > maxW && line) {
                    ctx.fillText(line, x + 8, lineY); line = wd; lineY += 11;
                } else { line = test; }
            }
            if (line) ctx.fillText(line, x + 8, lineY);

            ctx.strokeStyle = w.col; ctx.globalAlpha = 0.20; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x+8, y+WCH-8); ctx.lineTo(x+WCW-8, y+WCH-8); ctx.stroke();
            ctx.globalAlpha = 1;

            col++;
            if (col >= nc) { col = 0; x = lx; y += WCH + GAP; } else x += WCW + GAP;
        }
        return (col > 0 ? y + WCH + GAP : y) + PAD;
    }

    // ── Tab: SCENES ────────────────────────────────────────────────────────────
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

    // ── Tab: ITEMS ─────────────────────────────────────────────────────────────
    function _tabItems(ctx, W) {
        const nc   = _ncols(W);
        const rowW = nc * CW + (nc - 1) * GAP;
        const lx   = (W - rowW) / 2;
        let x = lx, y = PAD, col = 0;
        const prevH = 70;

        for (const it of _iDummies) {
            _cellBg(ctx, x, y, CW, CIH);

            if (it.inst) {
                const icx = x + CW / 2, icy = y + prevH / 2;
                ctx.save();
                ctx.beginPath(); ctx.rect(x + 2, y + 2, CW - 4, prevH - 4); ctx.clip();
                ctx.translate(icx, icy); ctx.scale(2.5, 2.5);
                try { it.inst.draw(ctx, _fc); } catch(_e) {}
                ctx.restore();
            }

            // Divider
            ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x+4, y+prevH+1); ctx.lineTo(x+CW-4, y+prevH+1); ctx.stroke();

            // Description
            const id = _IDATA[it.kind] || (it.kind?.endsWith('_w') ? _IDATA['weapon_item'] : null);
            ctx.font = '8px "Courier New",monospace';
            ctx.textBaseline = 'top'; ctx.textAlign = 'left';
            if (id) {
                ctx.fillStyle = 'rgba(180,210,255,0.75)';
                ctx.fillText(id.l1, x + 6, y + prevH + 5);
                ctx.fillStyle = 'rgba(120,150,200,0.55)';
                ctx.fillText(id.l2, x + 6, y + prevH + 16);
            }

            _cellLabel(ctx, it.label, x + CW / 2, y + CIH, it.col);
            col++;
            if (col >= nc) { col = 0; x = lx; y += CIH + GAP; } else x += CW + GAP;
        }
        return (col > 0 ? y + CIH + GAP : y) + PAD;
    }

    // ── Public API ─────────────────────────────────────────────────────────────
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
            if (key === 'ArrowUp'   ) { this.scroll(-60); }
            if (key === 'ArrowDown' ) { this.scroll( 60); }
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
                const sbH = Math.max(24, (CH_avail / totalH) * CH_avail);
                const sbY = CT + (_scrollY[_tab] / Math.max(1, totalH - CH_avail)) * (CH_avail - sbH);
                ctx.fillStyle = 'rgba(100,150,255,0.28)';
                ctx.beginPath(); ctx.roundRect(W - 5, sbY, 3, sbH, 1.5); ctx.fill();
            }

            ctx.textAlign = 'left'; ctx.globalAlpha = 1;
        }
    };
})();
