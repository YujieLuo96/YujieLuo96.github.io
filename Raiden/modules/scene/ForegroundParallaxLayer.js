// ──────────────────────────────────────────────────────────────────────────
//  ForegroundParallaxLayer — 近景视差层
//  在背景场景之上、战斗实体之下统一叠加 2 条快速下坠的半透明近景粒子带
//  （尘屑 / 余烬 / 能量碎片），让原本扁平的星空获得纵深与速度感。
//  由 BackgroundManager 统一驱动（setScene/update/draw），各场景配色不同。
// ──────────────────────────────────────────────────────────────────────────
var ForegroundParallaxLayer = (() => {
    let _bands = [];

    // 每个场景 2 条带：近带更快更大（streak 拉成竖线 → 速度残影），稍远带为柔点
    const PRESETS = {
        space: { bands: [
            { count: 24, speed: 3.4, size: [0.6, 1.7], alpha: 0.42, streak: 0,
              colors: ['#cfe2ff', '#ffffff', '#bcd6ff'] },
            { count: 13, speed: 6.4, size: [0.5, 1.2], alpha: 0.34, streak: 1,
              colors: ['#e2eeff', '#ffffff'] },
        ] },
        asteroid: { bands: [
            { count: 22, speed: 3.0, size: [1.1, 2.8], alpha: 0.46, streak: 0,
              colors: ['#9a8f80', '#b6a892', '#6f665a', '#857b6c'] },
            { count: 12, speed: 5.6, size: [0.7, 1.8], alpha: 0.40, streak: 0,
              colors: ['#c8bba6', '#7a7163'] },
        ] },
        solar: { bands: [
            { count: 30, speed: 3.7, size: [0.8, 2.1], alpha: 0.50, streak: 0,
              colors: ['#ffd27a', '#ff9a3c', '#ffe9b0', '#ffb255'] },
            { count: 16, speed: 6.6, size: [0.6, 1.4], alpha: 0.42, streak: 1,
              colors: ['#ffc863', '#fff0c8'] },
        ] },
        blackhole: { bands: [
            { count: 22, speed: 3.2, size: [0.8, 2.1], alpha: 0.44, streak: 0,
              colors: ['#c89bff', '#9a5cff', '#e7d0ff'] },
            { count: 12, speed: 6.0, size: [0.6, 1.4], alpha: 0.40, streak: 1,
              colors: ['#cba6ff', '#efe0ff'] },
        ] },
        nebula: { bands: [
            { count: 26, speed: 3.3, size: [0.9, 2.3], alpha: 0.48, streak: 0,
              colors: ['#7df0e0', '#5ad7ff', '#c9a6ff', '#a0ffe8'] },
            { count: 14, speed: 6.2, size: [0.6, 1.5], alpha: 0.40, streak: 1,
              colors: ['#aef6ff', '#e0d0ff'] },
        ] },
    };

    function _mkPart(band, W, H, initial) {
        const [smin, smax] = band.size;
        return {
            x:   Math.random() * W,
            y:   initial ? Math.random() * H : -8,
            r:   smin + Math.random() * (smax - smin),
            spd: band.speed * (0.7 + Math.random() * 0.6),
            col: band.colors[Math.floor(Math.random() * band.colors.length)],
            drift: (Math.random() - 0.5) * 0.45,
            a:   band.alpha * (0.55 + Math.random() * 0.45),
        };
    }

    return {
        setScene(name) {
            const preset = PRESETS[name];
            _bands = [];
            if (!preset) return;
            const W = Renderer.W, H = Renderer.H;
            for (const b of preset.bands) {
                _bands.push({
                    parts:  Array.from({ length: b.count }, () => _mkPart(b, W, H, true)),
                    streak: b.streak || 0,
                });
            }
        },

        update(dt) {
            if (!_bands.length) return;
            const W = Renderer.W, H = Renderer.H;
            for (const band of _bands) {
                for (const p of band.parts) {
                    p.y += p.spd * dt;
                    p.x += p.drift * dt;
                    if (p.y > H + 10) { p.y = -8; p.x = Math.random() * W; }
                    if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
                }
            }
        },

        draw(ctx) {
            if (!_bands.length) return;
            for (const band of _bands) {
                if (band.streak > 0) {
                    // 近带：竖向速度残影线（motion-blur 感）
                    for (const p of band.parts) {
                        ctx.globalAlpha = p.a;
                        ctx.strokeStyle = p.col;
                        ctx.lineWidth   = Math.max(0.6, p.r);
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p.x - p.drift * 3, p.y - p.spd * 2.4);
                        ctx.stroke();
                    }
                } else {
                    // 远带：柔点
                    for (const p of band.parts) {
                        ctx.globalAlpha = p.a;
                        ctx.fillStyle = p.col;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
            ctx.globalAlpha = 1;
        },

        clear() { _bands = []; }
    };
})();
