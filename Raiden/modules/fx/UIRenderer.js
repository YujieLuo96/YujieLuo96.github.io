var UIRenderer = (() => {
    const WEAPON_META = {
        spread:    { label: 'SPREAD',       col: '#4aaeff' },
        laser:     { label: 'LASER',        col: '#44ff88' },
        homing:    { label: 'HOMING',       col: '#dd44ff' },
        plasma:    { label: 'PLASMA',       col: '#ff5544' },
        lightning: { label: 'LIGHTNING',    col: '#fff880' },
        ice:       { label: 'ICE CRYSTAL',  col: '#a0f0ff' },
        satellite: { label: 'SATELLITE',    col: '#ffb830' },
        graviton:  { label: 'GRAVITON ORB', col: '#cc60ff' }
    };
    const BOSS_NAMES = {
        midboss:  'CRUISER',          midboss2: 'CMD INTERCEPTOR',
        boss1:    'FORTRESS',         boss2:    'COLOSSUS',
        boss3:    'CHAOS',            boss4:    'THE VOID',
        boss5:    'LEVIATHAN',        boss6:    'NEUTRON CLUSTER',
        boss7:    'CRIMSON SOVEREIGN'
    };

    // Corner-bracket panel with rivet bolts
    function _panel(ctx, x, y, w, h, col) {
        ctx.fillStyle = 'rgba(2,6,18,0.91)';
        ctx.fillRect(x, y, w, h);
        const C = 6, bc = col || '#0d4a6a';
        ctx.strokeStyle = bc;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x+C, y);     ctx.lineTo(x, y);     ctx.lineTo(x, y+C);
        ctx.moveTo(x+w-C, y);   ctx.lineTo(x+w, y);   ctx.lineTo(x+w, y+C);
        ctx.moveTo(x, y+h-C);   ctx.lineTo(x, y+h);   ctx.lineTo(x+C, y+h);
        ctx.moveTo(x+w-C, y+h); ctx.lineTo(x+w, y+h); ctx.lineTo(x+w, y+h-C);
        ctx.stroke();
        // Rivet bolts at inner corners
        ctx.fillStyle = bc;
        ctx.beginPath(); ctx.arc(x+3,   y+3,   1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x+w-3, y+3,   1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x+3,   y+h-3, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x+w-3, y+h-3, 1.5, 0, Math.PI*2); ctx.fill();
    }

    // Segmented bar with gauge tick marks at 25 / 50 / 75 %
    function _segs(ctx, x, y, w, h, ratio, col) {
        const n = 16, gap = 1, sw = Math.floor((w - gap * (n - 1)) / n);
        const fill = Math.round(Math.max(0, Math.min(1, ratio)) * n);
        for (let i = 0; i < n; i++) {
            ctx.fillStyle = i < fill ? col : 'rgba(16,26,36,0.9)';
            ctx.fillRect(x + i * (sw + gap), y, sw, h);
        }
        // Overlay tick marks — dark notches at 1/4, 1/2, 3/4
        ctx.fillStyle = 'rgba(0,5,18,0.72)';
        ctx.fillRect(x + Math.floor(w * 0.25) - 1, y, 1, h);
        ctx.fillRect(x + Math.floor(w * 0.50) - 1, y, 1, h);
        ctx.fillRect(x + Math.floor(w * 0.75) - 1, y, 1, h);
    }

    // Filled diamond pip
    function _pip(ctx, cx, cy, r, col) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
        ctx.closePath(); ctx.fill();
    }

    // Outline-only diamond pip (empty slot)
    function _pipEmpty(ctx, cx, cy, r, col) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
        ctx.closePath(); ctx.stroke();
    }

    // Screen-edge cockpit bracket decorations + edge crosshairs
    function _hudFrame(ctx, W, H) {
        const cs = 44;
        ctx.strokeStyle = 'rgba(0,110,170,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cs, 0);   ctx.lineTo(0, 0);   ctx.lineTo(0, cs);
        ctx.moveTo(W-cs, 0); ctx.lineTo(W, 0);   ctx.lineTo(W, cs);
        ctx.moveTo(0, H-cs); ctx.lineTo(0, H);   ctx.lineTo(cs, H);
        ctx.moveTo(W-cs, H); ctx.lineTo(W, H);   ctx.lineTo(W, H-cs);
        ctx.stroke();
        // Crosshair targets at edge midpoints
        ctx.strokeStyle = 'rgba(0,90,140,0.30)';
        ctx.beginPath();
        ctx.moveTo(W*0.5-12, 0);  ctx.lineTo(W*0.5+12, 0);
        ctx.moveTo(W*0.5,    0);  ctx.lineTo(W*0.5,    8);
        ctx.moveTo(W*0.5-12, H);  ctx.lineTo(W*0.5+12, H);
        ctx.moveTo(W*0.5,    H);  ctx.lineTo(W*0.5,    H-8);
        ctx.moveTo(0, H*0.5-12);  ctx.lineTo(0, H*0.5+12);
        ctx.moveTo(0, H*0.5);     ctx.lineTo(8, H*0.5);
        ctx.moveTo(W, H*0.5-12);  ctx.lineTo(W, H*0.5+12);
        ctx.moveTo(W, H*0.5);     ctx.lineTo(W-8, H*0.5);
        ctx.stroke();
        // Quarter ticks on all four edges
        ctx.strokeStyle = 'rgba(0,60,100,0.18)';
        ctx.beginPath();
        ctx.moveTo(W*0.25, 0);   ctx.lineTo(W*0.25, 5);
        ctx.moveTo(W*0.75, 0);   ctx.lineTo(W*0.75, 5);
        ctx.moveTo(W*0.25, H);   ctx.lineTo(W*0.25, H-5);
        ctx.moveTo(W*0.75, H);   ctx.lineTo(W*0.75, H-5);
        ctx.moveTo(0, H*0.25);   ctx.lineTo(5, H*0.25);
        ctx.moveTo(0, H*0.75);   ctx.lineTo(5, H*0.75);
        ctx.moveTo(W, H*0.25);   ctx.lineTo(W-5, H*0.25);
        ctx.moveTo(W, H*0.75);   ctx.lineTo(W-5, H*0.75);
        ctx.stroke();
    }

    function _pwrColor(pw) {
        if (pw >= 21) return `hsl(${Math.round(((Math.min(pw,100)-21)/79)*270)},100%,68%)`;
        if (pw >= 16) return '#4df';
        if (pw >= 11) return '#4cf';
        if (pw >= 6)  return '#6ef';
        return ['', '#8f8', '#af8', '#cf8', '#ff8', '#fa0'][pw] || '#8f8';
    }

    return {
        draw(ctx, gd) {
            const { score, highScore, lives, bombs, combo, comboMult, comboTimer, comboMax,
                    scoreMultiplier, multiplierTimer, timeSlowActive, timeSlowTimer,
                    ammoInfo, frameCount, shieldTimer, powerLevel,
                    stageName, weaponFlash, bhWarning } = gd;
            const W = Renderer.W, H = Renderer.H;

            // ── Danger vignette ───────────────────────────────────────────
            if (lives === 1) {
                const pulse = Math.abs(Math.sin(frameCount * 0.048)) * 0.16;
                const vg = ctx.createRadialGradient(W/2, H/2, H*0.26, W/2, H/2, H*0.82);
                vg.addColorStop(0, 'rgba(180,0,0,0)');
                vg.addColorStop(1, `rgba(180,0,0,${pulse})`);
                ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
            }

            // ── Blackhole gravity edge glow ───────────────────────────────
            if (bhWarning) {
                const { angle, intensity } = bhWarning;
                const ex = W/2 + Math.cos(angle) * W * 0.92;
                const ey = H/2 + Math.sin(angle) * H * 0.92;
                const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, H * 0.68);
                eg.addColorStop(0,   `rgba(120,30,220,${0.24*intensity})`);
                eg.addColorStop(0.5, `rgba(60,0,130,${0.10*intensity})`);
                eg.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = eg; ctx.fillRect(0, 0, W, H);
            }

            // ── Radar sweep line ──────────────────────────────────────────
            const sweepY = (frameCount * 0.45) % H;
            const sg = ctx.createLinearGradient(0, sweepY - 30, 0, sweepY + 2);
            sg.addColorStop(0, 'rgba(0,140,210,0)');
            sg.addColorStop(1, 'rgba(0,140,210,0.055)');
            ctx.fillStyle = sg;
            ctx.fillRect(0, sweepY - 30, W, 32);

            ctx.textBaseline = 'top';
            ctx.textAlign    = 'left';

            // ── Left info panel ───────────────────────────────────────────
            const wm     = ammoInfo && WEAPON_META[ammoInfo.type];
            const panelH = wm ? 92 : 70;
            _panel(ctx, 6, 6, 124, panelH);
            // Name-plate header band
            ctx.fillStyle = 'rgba(0,50,88,0.52)';
            ctx.fillRect(7, 7, 122, 12);
            ctx.font      = '8px "Courier New",monospace';
            ctx.fillStyle = '#3a9ab8';
            ctx.fillText('◈ SCORE', 12, 10);

            ctx.font        = 'bold 15px "Courier New",monospace';
            ctx.fillStyle   = '#d8f2ff';
            ctx.shadowColor = 'rgba(0,180,255,0.55)';
            ctx.shadowBlur  = 7;
            ctx.fillText(`${score}`, 12, 22);
            ctx.shadowBlur  = 0;

            ctx.font      = '9px "Courier New",monospace';
            ctx.fillStyle = '#cc8800';
            ctx.fillText(`─ HI  ${highScore}`, 12, 40);

            ctx.strokeStyle = '#0c3448';
            ctx.lineWidth   = 1;
            ctx.beginPath(); ctx.moveTo(12, 52); ctx.lineTo(124, 52); ctx.stroke();

            const pw    = powerLevel || 1;
            const pwCol = _pwrColor(pw);
            ctx.font      = '9px "Courier New",monospace';
            ctx.fillStyle = '#2a7090';
            ctx.fillText('PWR', 12, 56);
            ctx.fillStyle = pwCol;
            ctx.fillText(`LV.${pw}`, 38, 56);
            _segs(ctx, 12, 67, 112, 4, Math.min(pw, 100) / 100, pwCol);

            if (wm) {
                const wmRatio = ammoInfo.type === 'laser'
                    ? 1 - (ammoInfo.heat || 0) / 100
                    : ammoInfo.cur / Math.max(1, ammoInfo.max);
                ctx.font      = '9px "Courier New",monospace';
                ctx.fillStyle = wm.col;
                ctx.fillText(wm.label, 12, 77);
                _segs(ctx, 12, 88, 112, 4, wmRatio,
                    ammoInfo.type === 'laser' && wmRatio < 0.3 ? '#ff3333' : wm.col);
            }

            // ── Status chips below left panel ─────────────────────────────
            let tagY = 6 + panelH + 5;
            ctx.font = '9px "Courier New",monospace';
            if (shieldTimer > 0) {
                ctx.fillStyle = 'rgba(0,44,68,0.88)';
                ctx.fillRect(6, tagY, 70, 14);
                ctx.fillStyle = '#33bbff';
                ctx.fillText(`◈ SHIELD  ${Math.ceil(shieldTimer/60)}s`, 10, tagY + 2);
                tagY += 16;
            }
            if (timeSlowActive) {
                ctx.fillStyle = 'rgba(160,255,255,0.07)';
                ctx.fillRect(0, 0, W, H);
                ctx.fillStyle = 'rgba(0,40,50,0.88)';
                ctx.fillRect(6, tagY, 70, 14);
                ctx.fillStyle = '#aaffee';
                ctx.fillText(`◈ SLOW  ${Math.ceil(timeSlowTimer/60)}s`, 10, tagY + 2);
                tagY += 16;
            }
            if (scoreMultiplier > 1 && multiplierTimer > 0) {
                ctx.fillStyle = 'rgba(50,38,0,0.88)';
                ctx.fillRect(6, tagY, 86, 14);
                ctx.fillStyle = '#ffdd44';
                ctx.fillText(`◈ ×${scoreMultiplier} SCORE  ${Math.ceil(multiplierTimer/60)}s`, 10, tagY + 2);
            }

            // ── Right panel: HULL / ARMAMENT ──────────────────────────────
            // rpH=76: HULL band(y7-21) + pips(y34) + divider(y44) + ARM band(y45-59) + pips(y67) + bottom(y82)
            const rpW = 116, rpH = 76, rpX = W - rpW - 6;
            _panel(ctx, rpX, 6, rpW, rpH);

            // ── HULL section header plate ─────────────────────────────────
            ctx.fillStyle = 'rgba(148,22,32,0.45)';
            ctx.fillRect(rpX + 1, 7, rpW - 2, 14);

            ctx.font      = 'bold 8px "Courier New",monospace';
            ctx.fillStyle = '#ff9098';
            ctx.fillText('■ HULL', rpX + 8, 11);
            ctx.fillStyle = lives > 0 ? '#ff5566' : '#2e1420';
            ctx.textAlign = 'right';
            ctx.fillText(`×${lives}`, rpX + rpW - 8, 11);
            ctx.textAlign = 'left';

            // HULL pips — r=7, glow on active, outline on empty
            const pipR = 7, hullPipY = 34, pipStartX = rpX + 13;
            for (let i = 0; i < 5; i++) {
                const px = pipStartX + i * 19;
                if (i < lives) {
                    ctx.shadowColor = 'rgba(255,45,65,0.82)';
                    ctx.shadowBlur  = 14;
                    _pip(ctx, px, hullPipY, pipR, '#ff3344');
                    ctx.shadowBlur  = 0;
                } else {
                    _pipEmpty(ctx, px, hullPipY, pipR, '#3a1820');
                }
            }

            // Separator
            ctx.strokeStyle = '#0c2030'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(rpX + 6, 44); ctx.lineTo(rpX + rpW - 6, 44);
            ctx.stroke();

            // ── ARMAMENT section header plate ─────────────────────────────
            ctx.fillStyle = 'rgba(18,52,168,0.45)';
            ctx.fillRect(rpX + 1, 45, rpW - 2, 14);

            ctx.font      = 'bold 8px "Courier New",monospace';
            ctx.fillStyle = '#78aaff';
            ctx.fillText('■ ARMAMENT', rpX + 8, 49);
            ctx.fillStyle = bombs > 0 ? '#3399ff' : '#1a2638';
            ctx.textAlign = 'right';
            ctx.fillText(`×${bombs}`, rpX + rpW - 8, 49);
            ctx.textAlign = 'left';

            // ARMAMENT pips
            const bombPipY = 67;
            for (let i = 0; i < 5; i++) {
                const px = pipStartX + i * 19;
                if (i < bombs) {
                    ctx.shadowColor = 'rgba(45,135,255,0.82)';
                    ctx.shadowBlur  = 14;
                    _pip(ctx, px, bombPipY, pipR, '#3399ff');
                    ctx.shadowBlur  = 0;
                } else {
                    _pipEmpty(ctx, px, bombPipY, pipR, '#1a2840');
                }
            }

            // ── Stage name ────────────────────────────────────────────────
            if (stageName) {
                ctx.textAlign = 'center';
                ctx.font      = '9px "Courier New",monospace';
                ctx.fillStyle = 'rgba(120,165,210,0.52)';
                ctx.fillText(stageName, W / 2, 8);
                ctx.textAlign = 'left';
            }

            // ── Combo chain + decay bar ───────────────────────────────────
            if (combo >= 5) {
                const cx = W / 2, cw = 170, cby = 16;
                const plse = 0.7 + Math.sin(frameCount * 0.2) * 0.25;
                _panel(ctx, cx - cw/2, cby, cw, 26, '#3a3000');
                ctx.globalAlpha = plse;
                ctx.textAlign   = 'center';
                ctx.font        = 'bold 11px "Courier New",monospace';
                ctx.fillStyle   = '#ffdd00';
                ctx.shadowColor = 'rgba(255,210,0,0.8)'; ctx.shadowBlur = 8;
                ctx.fillText(`[ ×${comboMult.toFixed(1)}  CHAIN  ${combo} ]`, cx, cby + 7);
                ctx.shadowBlur = 0; ctx.globalAlpha = 1;
                if (comboTimer !== undefined && comboMax) {
                    const ratio = Math.max(0, comboTimer / comboMax);
                    const bx = cx - 76;
                    ctx.fillStyle = 'rgba(44,30,0,0.8)';
                    ctx.fillRect(bx, cby + 22, 152, 2);
                    ctx.fillStyle = `rgb(255,${Math.floor(220*ratio)},0)`;
                    ctx.fillRect(bx, cby + 22, 152 * ratio, 2);
                }
                ctx.textAlign = 'left';
            }

            // ── Weapon pickup flash ───────────────────────────────────────
            if (weaponFlash && weaponFlash.timer > 0) {
                const t     = weaponFlash.timer / 120;
                const alpha = t < 0.18 ? t / 0.18 : t > 0.75 ? (1 - t) / 0.25 : 1;
                const wfCol = (WEAPON_META[weaponFlash.type] || {col:'#fff'}).col;
                ctx.globalAlpha = alpha * 0.92;
                ctx.textAlign   = 'center';
                ctx.font        = 'bold 12px "Courier New",monospace';
                ctx.fillStyle   = wfCol;
                ctx.shadowColor = wfCol; ctx.shadowBlur = 12;
                ctx.fillText(`▶  ${weaponFlash.label}  ◀`, W / 2, H * 0.38);
                ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.textAlign = 'left';
            }

            // ── Blackhole warning ─────────────────────────────────────────
            if (bhWarning && bhWarning.intensity > 0.3) {
                const t     = (bhWarning.intensity - 0.3) / 0.7;
                const blink = 0.5 + Math.sin(frameCount * 0.2) * 0.42;
                ctx.globalAlpha = t * blink;
                ctx.textAlign   = 'center';
                ctx.font        = 'bold 9px "Courier New",monospace';
                ctx.fillStyle   = '#aa44ff';
                ctx.shadowColor = '#6600cc'; ctx.shadowBlur = 6;
                ctx.fillText('▼  GRAVITY PULL  ▼', W / 2, H - 58);
                ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.textAlign = 'left';
            }

            // ── Boss HP panel ─────────────────────────────────────────────
            const boss = EnemyManager.getActiveBoss();
            if (boss) {
                const bw    = Math.min(W - 60, 320), bh = 8;
                const bx    = (W - bw) / 2;
                const byTop = H - 40;
                _panel(ctx, bx - 8, byTop, bw + 16, 34, '#380808');

                const bossName = BOSS_NAMES[boss.type] || 'BOSS';
                ctx.textAlign = 'center';
                if (boss.modeLabel) {
                    ctx.font      = '7px "Courier New",monospace';
                    ctx.fillStyle = `hsl(${Math.round(boss.reactorHue || 0)},100%,68%)`;
                    ctx.fillText(boss.modeLabel, W / 2, byTop + 2);
                    ctx.font      = '9px "Courier New",monospace';
                    ctx.fillStyle = '#cc4444';
                    ctx.fillText(`─ ${bossName} ─`, W / 2, byTop + 10);
                } else {
                    ctx.font      = '9px "Courier New",monospace';
                    ctx.fillStyle = '#cc4444';
                    ctx.fillText(`─ ${bossName} ─`, W / 2, byTop + 5);
                }
                ctx.textAlign = 'left';

                const ratio   = Math.max(0, boss.hp / boss.maxHp);
                const by      = byTop + 22;
                const segN    = 20, segGap = 1;
                const segW    = Math.floor((bw - segGap * (segN - 1)) / segN);
                const segFill = Math.ceil(ratio * segN);
                for (let i = 0; i < segN; i++) {
                    if (i >= segFill) {
                        ctx.fillStyle = 'rgba(36,6,6,0.9)';
                    } else if (ratio < 0.25) {
                        ctx.fillStyle = `rgba(255,${Math.round(28+i*3)},0,${0.6+Math.sin(frameCount*0.2)*0.3})`;
                    } else if (ratio < 0.50) {
                        ctx.fillStyle = `rgb(255,${Math.round(155-i*4)},0)`;
                    } else {
                        ctx.fillStyle = `hsl(${Math.round(4+ratio*22)},88%,50%)`;
                    }
                    ctx.fillRect(bx + i * (segW + segGap), by, segW, bh);
                }
                ctx.font      = '8px "Courier New",monospace';
                ctx.fillStyle = ratio < 0.25 ? '#ff4444' : '#aa6666';
                ctx.fillText(`${Math.floor(ratio * 100)}%`, bx + bw + 4, by);
            }

            // ── Cockpit HUD frame (screen-edge bracket decorations) ────────
            _hudFrame(ctx, W, H);
        },

        drawMenu(ctx, fc) {
            const W = Renderer.W, H = Renderer.H;
            ctx.fillStyle = 'rgba(0,0,10,0.92)'; ctx.fillRect(0, 0, W, H);

            // Tactical grid
            ctx.strokeStyle = 'rgba(0,55,82,0.22)';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            for (let x = 0; x < W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
            for (let y = 0; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
            ctx.stroke();

            // Title frame
            const ty = H / 2 - 96, tw = 268, th = 86;
            const tx = W / 2 - tw / 2;
            _panel(ctx, tx, ty, tw, th, '#1a5070');

            ctx.textAlign    = 'center';
            ctx.textBaseline = 'top';

            // Chromatic aberration on title
            ctx.font      = 'bold 52px "Courier New",monospace';
            ctx.fillStyle = 'rgba(255,0,0,0.22)';
            ctx.fillText('RAIDEN', W / 2 - 2, ty + 12);
            ctx.fillStyle = 'rgba(0,60,255,0.22)';
            ctx.fillText('RAIDEN', W / 2 + 2, ty + 12);
            ctx.fillStyle   = '#00ccff';
            ctx.shadowColor = 'rgba(0,190,255,0.9)';
            ctx.shadowBlur  = 30;
            ctx.fillText('RAIDEN', W / 2, ty + 12);
            ctx.shadowBlur  = 0;

            ctx.font      = '10px "Courier New",monospace';
            ctx.fillStyle = '#2a5f7a';
            ctx.fillText('─── THUNDER FORCE ───', W / 2, ty + 70);

            // Blinking start prompt
            const p = 0.5 + Math.sin(fc * 0.06) * 0.48;
            ctx.globalAlpha = p;
            ctx.font        = 'bold 12px "Courier New",monospace';
            ctx.fillStyle   = '#ffdd00';
            ctx.fillText('[ CLICK  OR  SPACE  TO  START ]', W / 2, H / 2 + 20);
            ctx.globalAlpha = 1;

            // Controls panel
            const cpy = H / 2 + 50, cpw = Math.min(W - 20, 340);
            _panel(ctx, W / 2 - cpw / 2, cpy, cpw, 46, '#0a2c40');
            ctx.font      = '8px "Courier New",monospace';
            ctx.fillStyle = '#1d5878';
            ctx.fillText('CONTROLS', W / 2 - cpw / 2 + 7, cpy + 4);
            ctx.font      = '9px "Courier New",monospace';
            ctx.fillStyle = '#3a7088';
            ctx.fillText('MOVE · ARROWS/WASD    BOMB · SPACE    PAUSE · P', W / 2, cpy + 18);
            ctx.fillText('TOUCH: DRAG TO MOVE', W / 2, cpy + 32);
            ctx.textAlign = 'left';
        },

        drawPause(ctx) {
            const W = Renderer.W, H = Renderer.H;
            ctx.fillStyle = 'rgba(0,0,0,0.74)'; ctx.fillRect(0, 0, W, H);

            const pw = 260, ph = 72, px = W / 2 - 130, py = H / 2 - 42;
            _panel(ctx, px, py, pw, ph, '#2a4800');

            ctx.textAlign    = 'center';
            ctx.textBaseline = 'top';
            ctx.font         = 'bold 36px "Courier New",monospace';
            ctx.fillStyle    = '#ccff00';
            ctx.shadowColor  = 'rgba(180,255,0,0.7)'; ctx.shadowBlur = 14;
            ctx.fillText('PAUSED', W / 2, py + 10);
            ctx.shadowBlur   = 0;

            ctx.strokeStyle = '#1a3600'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(px+16, py+52); ctx.lineTo(px+pw-16, py+52); ctx.stroke();

            ctx.font      = '10px "Courier New",monospace';
            ctx.fillStyle = '#3a6020';
            ctx.fillText('PRESS  P  TO  RESUME', W / 2, py + 57);
            ctx.textAlign = 'left';
        },

        drawGameOver(ctx, score, highScore) {
            const W = Renderer.W, H = Renderer.H;
            ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(0, 0, W, H);

            // Scanline overlay
            ctx.strokeStyle = 'rgba(60,0,0,0.18)';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            for (let y = 0; y < H; y += 3) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
            ctx.stroke();

            const pw = 300, ph = 130, px = W / 2 - 150, py = H / 2 - 76;
            _panel(ctx, px, py, pw, ph, '#3a0808');

            ctx.textAlign    = 'center';
            ctx.textBaseline = 'top';
            ctx.font         = 'bold 34px "Courier New",monospace';
            ctx.fillStyle    = '#ff2222';
            ctx.shadowColor  = 'rgba(255,0,0,0.7)'; ctx.shadowBlur = 18;
            ctx.fillText('MISSION FAILED', W / 2, py + 12);
            ctx.shadowBlur   = 0;

            ctx.strokeStyle = '#300808'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px+16, py+52); ctx.lineTo(px+pw-16, py+52); ctx.stroke();

            ctx.font      = '8px "Courier New",monospace';
            ctx.fillStyle = '#4a2020';
            ctx.fillText('FINAL  SCORE', W / 2, py + 58);
            ctx.font      = 'bold 22px "Courier New",monospace';
            ctx.fillStyle = '#ddf0ff';
            ctx.fillText(`${score}`, W / 2, py + 70);

            if (score > 0 && score >= highScore && highScore > 0) {
                const pulse = 0.6 + Math.sin(Date.now() * 0.005) * 0.35;
                ctx.globalAlpha = pulse;
                ctx.font        = 'bold 11px "Courier New",monospace';
                ctx.fillStyle   = '#ffdd00';
                ctx.shadowColor = 'rgba(255,220,0,0.8)'; ctx.shadowBlur = 8;
                ctx.fillText('◈  NEW HIGH SCORE  ◈', W / 2, py + 96);
                ctx.shadowBlur = 0; ctx.globalAlpha = 1;
            }

            ctx.font      = '9px "Courier New",monospace';
            ctx.fillStyle = '#2a4860';
            ctx.fillText('>  PRESS SPACE OR CLICK TO REBOOT', W / 2, py + 114);
            ctx.textAlign = 'left';
        },

        drawStageClear(ctx, stageIdx) {},
        drawAllClear(ctx) {}
    };
})();
