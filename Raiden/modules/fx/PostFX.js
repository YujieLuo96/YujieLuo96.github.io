// ──────────────────────────────────────────────────────────────────────────
//  PostFX — 全屏后期处理层（在所有战斗层之上、HUD 之下绘制）
//  · 场景调色（soft-light 柔光叠加，随关卡场景平滑过渡，统一画面情绪）
//  · 动态暗角（常态 + Boss 临场加深 + 残血红色脉冲）
//  · 色散边缘（极轻的红/蓝边缘错位，Boss/黑洞时增强，营造能量畸变感）
//  由 GameCore 每帧驱动；C 键可整体开关。开销：每帧 ~3 次 fillRect。
// ──────────────────────────────────────────────────────────────────────────
var PostFX = (() => {
    // 各场景的调色目标色（RGB）
    const GRADE = {
        space:     [70, 96, 165],
        asteroid:  [128, 108, 82],
        solar:     [255, 120, 44],
        blackhole: [122, 74, 198],
        nebula:    [70, 180, 168],
        '':        [90, 110, 150],
    };

    let _r = 90, _g = 110, _b = 150;     // 当前平滑后的调色色
    let _enabled = true;
    try { _enabled = localStorage.getItem('raidenPostfx') !== '0'; } catch (e) {}

    return {
        setEnabled(v) { _enabled = v; try { localStorage.setItem('raidenPostfx', v ? '1' : '0'); } catch (e) {} },
        toggle()      { this.setEnabled(!_enabled); return _enabled; },
        isEnabled()   { return _enabled; },

        update(dt, sceneName) {
            const t = GRADE[sceneName] || GRADE[''];
            const k = Math.min(1, 0.025 * dt);   // 慢速逼近 → 切场时调色平滑过渡
            _r += (t[0] - _r) * k;
            _g += (t[1] - _g) * k;
            _b += (t[2] - _b) * k;
        },

        // info: { boss, lives, frameCount, bhWarn (0..1) }
        draw(ctx, info) {
            if (!_enabled) return;
            const W = Renderer.W, H = Renderer.H;
            const fc = info.frameCount || 0;

            // ── 1) 场景柔光调色（soft-light：染色但保留对比，不糊画面）──────
            ctx.globalCompositeOperation = 'soft-light';
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = `rgb(${_r | 0},${_g | 0},${_b | 0})`;
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';

            // ── 2) 动态暗角 ──────────────────────────────────────────────
            const boss = info.boss ? 1 : 0;
            const low  = info.lives === 1 ? 1 : 0;
            const bossPulse = boss ? (0.06 + Math.abs(Math.sin(fc * 0.05)) * 0.06) : 0;
            const lowPulse  = low  ? (0.10 + Math.abs(Math.sin(fc * 0.10)) * 0.16) : 0;
            const baseA = 0.20 + bossPulse;
            const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.84);
            vg.addColorStop(0, 'rgba(0,0,0,0)');
            if (low) {
                vg.addColorStop(0.7, `rgba(120,0,0,${(lowPulse * 0.5).toFixed(3)})`);
                vg.addColorStop(1,   `rgba(150,0,0,${(baseA + lowPulse).toFixed(3)})`);
            } else if (boss) {
                vg.addColorStop(1, `rgba(20,2,16,${baseA.toFixed(3)})`);
            } else {
                vg.addColorStop(1, `rgba(0,0,10,${baseA.toFixed(3)})`);
            }
            ctx.fillStyle = vg;
            ctx.fillRect(0, 0, W, H);

            // ── 3) 色散边缘（加色：四边轻微红/蓝错位光晕）──────────────────
            const ca = 0.045 + boss * 0.05 + (info.bhWarn || 0) * 0.10;
            if (ca > 0.02) {
                ctx.globalCompositeOperation = 'lighter';
                // 红：偏上偏左
                const rg = ctx.createRadialGradient(W * 0.5 - 6, H * 0.5 - 6, H * 0.46, W * 0.5 - 6, H * 0.5 - 6, H * 0.86);
                rg.addColorStop(0, 'rgba(0,0,0,0)');
                rg.addColorStop(1, `rgba(255,40,40,${(ca).toFixed(3)})`);
                ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
                // 蓝：偏下偏右
                const bg = ctx.createRadialGradient(W * 0.5 + 6, H * 0.5 + 6, H * 0.46, W * 0.5 + 6, H * 0.5 + 6, H * 0.86);
                bg.addColorStop(0, 'rgba(0,0,0,0)');
                bg.addColorStop(1, `rgba(40,90,255,${(ca).toFixed(3)})`);
                ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
                ctx.globalCompositeOperation = 'source-over';
            }
        }
    };
})();
