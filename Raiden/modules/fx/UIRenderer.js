var UIRenderer = (() => {
    function _text(ctx, txt, x, y, opts = {}) {
        ctx.font         = opts.font  || '14px "Courier New",monospace';
        ctx.fillStyle    = opts.color || '#fff';
        ctx.textAlign    = opts.align || 'left';
        ctx.textBaseline = 'top';
        if (opts.shadow) { ctx.shadowColor = opts.shadow; ctx.shadowBlur = 8; }
        ctx.fillText(txt, x, y);
        ctx.shadowBlur = 0;
    }

    function _heartRow(ctx, count, x, y) {
        ctx.font = '16px serif';
        ctx.textBaseline = 'top';
        for (let i = 0; i < count; i++) {
            ctx.fillStyle = '#f44';
            ctx.fillText('♥', x + i * 20, y);
        }
    }

    function _bombRow(ctx, count, x, y) {
        ctx.font = '14px serif';
        ctx.textBaseline = 'top';
        for (let i = 0; i < count; i++) ctx.fillText('💣', x + i * 20, y);
    }

    // PWR color matching NormalGun spectrum
    function _pwrColor(pw) {
        if (pw >= 21) {
            const hue = Math.round(((Math.min(pw, 100) - 21) / 79) * 270);
            return `hsl(${hue},100%,68%)`;
        }
        if (pw >= 16) return '#4df';
        if (pw >= 11) return '#4cf';
        if (pw >= 6)  return '#6ef';
        return ['', '#8f8', '#af8', '#cf8', '#ff8', '#fa0'][pw] || '#8f8';
    }

    function _weaponBar(ctx, ammoInfo, x, y) {
        if (ammoInfo.type === 'normal') return;
        const LABELS = { spread:'SPREAD', laser:'LASER', homing:'HOMING', plasma:'PLASMA', lightning:'LIGHTNING', ice:'ICE', satellite:'SATELLITE', graviton:'GRAVITON ORB' };
        const COLS   = { spread:'#4af', laser:'#4f8', homing:'#d4f', plasma:'#f55', lightning:'#fff8a0', ice:'#a0f0ff', satellite:'#ffb830', graviton:'#cc60ff' };
        const label  = LABELS[ammoInfo.type] || '';
        const col    = COLS[ammoInfo.type]   || '#fff';
        _text(ctx, label, x, y, { color: col, font: 'bold 11px "Courier New",monospace' });
        const bw = 80, bh = 5;
        const ratio = ammoInfo.type === 'laser'
            ? 1 - (ammoInfo.heat || 0) / 100
            : ammoInfo.cur / Math.max(1, ammoInfo.max);
        ctx.fillStyle = '#333'; ctx.fillRect(x, y + 14, bw, bh);
        ctx.fillStyle = (ammoInfo.type === 'laser' && ratio < 0.3) ? '#f44' : col;
        ctx.fillRect(x, y + 14, bw * Math.max(0, ratio), bh);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y + 14, bw, bh);
        if (ammoInfo.type === 'laser') {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '9px "Courier New",monospace';
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText(ratio < 0.1 ? 'OVERHEAT' : `HEAT ${Math.floor((1-ratio)*100)}%`, x, y + 22);
        }
    }

    const BOSS_NAMES = {
        midboss:  'CRUISER',
        midboss2: 'COMMAND INTERCEPTOR',
        boss1: 'FORTRESS',
        boss2: 'COLOSSUS',
        boss3: 'CHAOS',
        boss4: 'THE VOID',
        boss5: 'LEVIATHAN',
        boss6: 'NEUTRON CLUSTER',
        boss7: 'CRIMSON SOVEREIGN'
    };
    const WEAPON_COLS = { spread:'#4af', laser:'#4f8', homing:'#d4f', plasma:'#f55', lightning:'#fff8a0', ice:'#a0f0ff', satellite:'#ffb830', graviton:'#cc60ff' };

    return {
        draw(ctx, gd) {
            const { score, highScore, lives, bombs, combo, comboMult, comboTimer, comboMax,
                    scoreMultiplier, multiplierTimer, timeSlowActive, timeSlowTimer,
                    ammoInfo, frameCount, shieldTimer, powerLevel,
                    stageName, weaponFlash, bhWarning } = gd;
            const W = Renderer.W, H = Renderer.H;

            // ── Low-life danger vignette (pulsing red rim) ────────────────
            if (lives === 1) {
                const pulse = Math.abs(Math.sin(frameCount * 0.048)) * 0.16;
                const vg = ctx.createRadialGradient(W/2, H/2, H * 0.26, W/2, H/2, H * 0.82);
                vg.addColorStop(0, 'rgba(180,0,0,0)');
                vg.addColorStop(1, `rgba(180,0,0,${pulse})`);
                ctx.fillStyle = vg;
                ctx.fillRect(0, 0, W, H);
            }

            // ── Black hole gravity pull edge glow ─────────────────────────
            if (bhWarning) {
                const { angle, intensity } = bhWarning;
                const ex = W/2 + Math.cos(angle) * W * 0.92;
                const ey = H/2 + Math.sin(angle) * H * 0.92;
                const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, H * 0.68);
                eg.addColorStop(0,   `rgba(120,30,220,${0.24 * intensity})`);
                eg.addColorStop(0.5, `rgba(60,0,130,${0.10 * intensity})`);
                eg.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = eg;
                ctx.fillRect(0, 0, W, H);
            }

            // ── Score ─────────────────────────────────────────────────────
            _text(ctx, `${score}`, 10, 10, {
                font: 'bold 18px "Courier New",monospace', color: '#fff',
                shadow: 'rgba(100,200,255,0.6)' });
            _text(ctx, `BEST ${highScore}`, 10, 32, {
                font: '11px "Courier New",monospace', color: '#fa0' });

            // ── Power level (spectrum color above Lv 20) ──────────────────
            const pw    = powerLevel || 1;
            const pwCol = _pwrColor(pw);
            _text(ctx, `PWR Lv.${pw}`, 10, 50, {
                font: 'bold 11px "Courier New",monospace', color: pwCol,
                shadow: pw >= 21 ? pwCol : undefined });

            // ── Weapon bar ────────────────────────────────────────────────
            if (ammoInfo) _weaponBar(ctx, ammoInfo, 10, 66);

            // ── Shield ────────────────────────────────────────────────────
            if (shieldTimer > 0) {
                _text(ctx, `SHIELD ${Math.ceil(shieldTimer / 60)}s`, 10, 100,
                    { font: '11px "Courier New",monospace', color: '#4af' });
            }

            // ── Time slow ─────────────────────────────────────────────────
            if (timeSlowActive) {
                ctx.fillStyle = 'rgba(160,255,255,0.1)';
                ctx.fillRect(0, 0, W, H);
                _text(ctx, `SLOW ${Math.ceil(timeSlowTimer / 60)}s`, 10, 114,
                    { font: '11px "Courier New",monospace', color: '#aff' });
            }

            // ── Score multiplier ──────────────────────────────────────────
            if (scoreMultiplier > 1) {
                const tp = multiplierTimer > 0 ? Math.ceil(multiplierTimer / 60) : 0;
                _text(ctx, `×${scoreMultiplier} SCORE ${tp}s`, 10, 128,
                    { font: 'bold 11px "Courier New",monospace', color: '#ff8' });
            }

            // ── Lives & Bombs (top right) ─────────────────────────────────
            _text(ctx, 'LIFE', W - 106, 10,
                { font: '11px "Courier New",monospace', color: '#aaa', align: 'right' });
            _heartRow(ctx, lives, W - 100, 10);
            _text(ctx, 'BOMB', W - 106, 30,
                { font: '11px "Courier New",monospace', color: '#aaa', align: 'right' });
            _bombRow(ctx, bombs, W - 100, 28);
            ctx.textAlign = 'left';

            // ── Stage name (top center, subtle) ───────────────────────────
            if (stageName) {
                ctx.textAlign    = 'center';
                ctx.font         = '10px "Microsoft YaHei","Courier New",monospace';
                ctx.fillStyle    = 'rgba(150,175,225,0.62)';
                ctx.textBaseline = 'top';
                ctx.fillText(stageName, W / 2, 8);
                ctx.textAlign = 'left';
            }

            // ── Combo + decay bar ─────────────────────────────────────────
            if (combo >= 5) {
                const cx    = W / 2;
                const pulse = 0.7 + Math.sin(frameCount * 0.2) * 0.25;
                ctx.globalAlpha = pulse;
                _text(ctx, `×${comboMult.toFixed(1)}  COMBO  ${combo}`, cx, 20,
                    { font: 'bold 14px "Courier New",monospace', color: '#ff8',
                      align: 'center', shadow: 'rgba(255,220,0,0.8)' });
                ctx.globalAlpha = 1;
                // Decay bar: shows how long before combo resets
                if (comboTimer !== undefined && comboMax) {
                    const barW = 100, barH = 3, bx = cx - barW / 2, by = 36;
                    const ratio = Math.max(0, comboTimer / comboMax);
                    ctx.fillStyle = 'rgba(60,40,0,0.65)';
                    ctx.fillRect(bx, by, barW, barH);
                    // Color shifts red as combo is about to expire
                    const rr = 255, rg = Math.floor(220 * ratio);
                    ctx.fillStyle = `rgba(${rr},${rg},0,0.9)`;
                    ctx.fillRect(bx, by, barW * ratio, barH);
                }
            }

            // ── Weapon pickup flash notification (center screen, brief) ───
            if (weaponFlash && weaponFlash.timer > 0) {
                const maxT  = 120;
                const t     = weaponFlash.timer / maxT;
                // Fade in fast, hold, fade out
                const alpha = t < 0.18 ? t / 0.18 : t > 0.75 ? (1 - t) / 0.25 : 1;
                const wCol  = WEAPON_COLS[weaponFlash.type] || '#fff';
                ctx.globalAlpha  = alpha * 0.92;
                ctx.textAlign    = 'center';
                ctx.font         = 'bold 15px "Courier New",monospace';
                ctx.fillStyle    = wCol;
                ctx.shadowColor  = wCol; ctx.shadowBlur = 12;
                ctx.textBaseline = 'top';
                ctx.fillText(`⚡ ${weaponFlash.label}`, W / 2, H * 0.38);
                ctx.shadowBlur   = 0; ctx.globalAlpha = 1; ctx.textAlign = 'left';
            }

            // ── Black hole pull warning text ──────────────────────────────
            if (bhWarning && bhWarning.intensity > 0.3) {
                const t     = (bhWarning.intensity - 0.3) / 0.7;
                const blink = 0.5 + Math.sin(frameCount * 0.2) * 0.42;
                ctx.globalAlpha  = t * blink;
                ctx.textAlign    = 'center';
                ctx.font         = 'bold 10px "Courier New",monospace';
                ctx.fillStyle    = '#b060ff';
                ctx.shadowColor  = '#7020cc'; ctx.shadowBlur = 6;
                ctx.textBaseline = 'top';
                ctx.fillText('▼  GRAVITY PULL  ▼', W / 2, H - 66);
                ctx.shadowBlur   = 0; ctx.globalAlpha = 1; ctx.textAlign = 'left';
            }

            // ── Boss HP bar (bottom center, responsive width) ─────────────
            const boss = EnemyManager.getActiveBoss();
            if (boss) {
                const bw = Math.min(W - 60, 320), bh = 12;
                const bx = (W - bw) / 2, by = H - 28;
                ctx.fillStyle = '#111';
                ctx.fillRect(bx, by, bw, bh);
                const ratio = Math.max(0, boss.hp / boss.maxHp);
                const bg    = ctx.createLinearGradient(bx, 0, bx + bw, 0);
                bg.addColorStop(0, '#d00'); bg.addColorStop(0.5, '#ff4'); bg.addColorStop(1, '#f80');
                ctx.fillStyle = bg;
                ctx.fillRect(bx, by, bw * ratio, bh);
                // Pulsing border when low HP
                const borderAlpha = ratio < 0.25 ? 0.5 + Math.sin(frameCount * 0.2) * 0.4 : 0.4;
                ctx.strokeStyle = `rgba(255,255,255,${borderAlpha})`; ctx.lineWidth = 1;
                ctx.strokeRect(bx, by, bw, bh);
                // Boss name
                const bossName = BOSS_NAMES[boss.type] || 'BOSS';
                _text(ctx, bossName, W / 2, H - 48,
                    { font: 'bold 12px "Courier New",monospace', color: '#f88',
                      align: 'center', shadow: 'rgba(255,0,0,0.6)' });
                // Attack mode label (boss5 Leviathan only)
                if (boss.modeLabel) {
                    const modeHue = Math.round(boss.reactorHue || 0);
                    _text(ctx, boss.modeLabel, W / 2, H - 60,
                        { font: '10px "Courier New",monospace',
                          color: `hsl(${modeHue},100%,68%)`,
                          align: 'center' });
                }
                // HP percentage
                _text(ctx, `${Math.floor(ratio * 100)}%`, bx + bw + 6, by + 1,
                    { font: '10px "Courier New",monospace', color: '#f88' });
            }
        },

        drawMenu(ctx, fc) {
            const W = Renderer.W, H = Renderer.H;
            ctx.fillStyle = 'rgba(0,0,8,0.82)';
            ctx.fillRect(0, 0, W, H);

            ctx.font      = 'bold 58px "Courier New",monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.shadowColor = 'rgba(80,160,255,0.9)'; ctx.shadowBlur = 28;
            ctx.fillText('RAIDEN', W / 2, H / 2 - 80);
            ctx.shadowBlur = 0;

            ctx.font = 'bold 12px "Courier New",monospace';
            ctx.fillStyle = '#aaa';
            ctx.fillText('THUNDER FORCE', W / 2, H / 2 - 28);

            const p = 0.62 + Math.sin(Date.now() * 0.004) * 0.33;
            ctx.globalAlpha = p;
            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 16px "Courier New",monospace';
            ctx.fillText('CLICK / PRESS SPACE TO START', W / 2, H / 2 + 20);
            ctx.globalAlpha = 1;

            ctx.strokeStyle = 'rgba(80,140,255,0.35)'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(W / 2 - 140, H / 2 + 42);
            ctx.lineTo(W / 2 + 140, H / 2 + 42);
            ctx.stroke();

            ctx.fillStyle = '#555';
            ctx.font = '11px "Courier New",monospace';
            ctx.fillText('ARROWS / WASD MOVE  ·  SPACE BOMB  ·  P PAUSE  ·  T TEST MODE', W / 2, H / 2 + 54);
            ctx.fillText('TOUCH: DRAG TO MOVE', W / 2, H / 2 + 72);
        },

        drawPause(ctx) {
            const W = Renderer.W, H = Renderer.H;
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(0, 0, W, H);
            ctx.font = 'bold 42px "Courier New",monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.shadowColor = 'rgba(255,200,0,0.8)'; ctx.shadowBlur = 16;
            ctx.fillText('PAUSED', W / 2, H / 2 - 30);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#aaa'; ctx.font = '14px "Courier New",monospace';
            ctx.fillText('PRESS P TO RESUME', W / 2, H / 2 + 20);
        },

        drawGameOver(ctx, score, highScore) {
            const W = Renderer.W, H = Renderer.H;
            ctx.fillStyle = 'rgba(0,0,0,0.80)';
            ctx.fillRect(0, 0, W, H);
            ctx.font = 'bold 44px "Courier New",monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#f44';
            ctx.shadowColor = 'rgba(255,0,0,0.7)'; ctx.shadowBlur = 18;
            ctx.fillText('GAME OVER', W / 2, H / 2 - 60);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff'; ctx.font = 'bold 20px "Courier New",monospace';
            ctx.fillText(`FINAL SCORE: ${score}`, W / 2, H / 2 + 4);
            if (score > 0 && score >= highScore && highScore > 0) {
                const pulse = 0.6 + Math.sin(Date.now() * 0.005) * 0.35;
                ctx.globalAlpha = pulse;
                ctx.fillStyle = '#ff0'; ctx.font = 'bold 16px "Courier New",monospace';
                ctx.fillText('🏆 NEW HIGH SCORE!', W / 2, H / 2 + 36);
                ctx.globalAlpha = 1;
            }
            ctx.fillStyle = '#888'; ctx.font = '13px "Courier New",monospace';
            ctx.fillText('CLICK OR PRESS SPACE TO RESTART', W / 2, H / 2 + 72);
        },

        drawStageClear(ctx, stageIdx) {
            // (unused — stage clear now uses _addPopup floating text)
        },
        drawAllClear(ctx) {
            // (unused — all clear now uses _addPopup floating text)
        }
    };
})();
