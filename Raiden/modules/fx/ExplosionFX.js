var ExplosionFX = (() => {
    const _flashes = [];
    const _rings   = [];   // 冲击波扩散环（炸弹等）

    function _flash(x, y, r, life, color) {
        _flashes.push({ x, y, r, life, maxLife: life, color: color || 'rgba(255,200,100,' });
    }

    function _ring(x, y, startR, speed, life, rgb, width) {
        _rings.push({ x, y, r: startR, speed, life, maxLife: life, rgb, width });
    }

    return {
        smallEnemy(x, y) {
            ParticleSystem.spawn(x, y, { count: 8,  colors: ['#f80', '#ff4', '#f40'], speed: 3, life: 20, size: 3 });
            ParticleSystem.spawn(x, y, { count: 5,  colors: ['#ffd', '#fc6'], speed: 6, life: 12, size: 2.5, shape: 'spark' });
        },
        mediumEnemy(x, y, color) {
            ParticleSystem.spawn(x, y, { count: 18, colors: [color, '#fff', '#ff8'], speed: 4.5, life: 28, size: 4 });
            ParticleSystem.spawn(x, y, { count: 10, colors: ['#ffd', color], speed: 7.5, life: 16, size: 3, shape: 'spark' });
            _flash(x, y, 36, 8);
            _ring(x, y, 4, 5, 14, '255,210,140', 2.5);
        },
        largeEnemy(x, y, color) {
            ParticleSystem.spawn(x, y, { count: 30, colors: [color, '#fff', '#fa0'], speed: 5.5, life: 36, size: 6 });
            ParticleSystem.spawn(x, y, { count: 16, colors: ['#ffd', '#fa0', color], speed: 9, life: 20, size: 3.5, shape: 'spark' });
            // 带重力的燃烧碎片，余烬下坠
            ParticleSystem.spawn(x, y, { count: 8, colors: ['#f60', '#a42'], speed: 4, life: 46, size: 3.5, gravity: 0.09 });
            _flash(x, y, 60, 10);
            _ring(x, y, 6, 7, 20, '255,200,120', 4);
        },
        boss(x, y, color) {
            ParticleSystem.spawn(x, y, { count: 70, colors: [color, '#fff', '#fa0', '#f44'], speed: 7, life: 55, size: 9, scatter: 35 });
            ParticleSystem.spawn(x, y, { count: 26, colors: ['#ffd', '#fc8', color], speed: 11, life: 26, size: 4, shape: 'spark', scatter: 20 });
            ParticleSystem.spawn(x, y, { count: 14, colors: ['#f60', '#a42', '#666'], speed: 5, life: 60, size: 4.5, gravity: 0.08, scatter: 30 });
            [0, 130, 260].forEach(delay => {
                setTimeout(() => {
                    if (_flashes.length < 20)
                        ParticleSystem.spawn(x + (Math.random()-0.5)*80, y + (Math.random()-0.5)*50,
                            { count: 25, colors: ['#f80','#ff4'], speed: 5, life: 32, size: 6 });
                }, delay);
            });
            _flash(x, y, 100, 18);
            _ring(x, y, 10,  16, 34, '255,220,150', 7);
            _ring(x, y, -50, 13, 42, '255,140,80',  5);   // 延迟出现的第二冲击波
        },
        bulletHit(x, y) {
            ParticleSystem.spawn(x, y, { count: 4, colors: ['#ff8', '#fa0'], speed: 2.5, life: 10, size: 2.5 });
        },
        shieldBreak(x, y) {
            ParticleSystem.spawn(x, y, { count: 28, colors: ['#8cf', '#4af', '#fff'], speed: 4.5, life: 26, size: 3 });
            _flash(x, y, 40, 7, 'rgba(100,200,255,');
        },
        playerHit(x, y) {
            ParticleSystem.spawn(x, y, { count: 35, colors: ['#f80', '#f40', '#ff0'], speed: 5.5, life: 38, size: 5 });
            _flash(x, y, 60, 10);
        },
        // 炸弹：全屏闪光 + 从引爆点（玩家位置）扩散的双冲击波环
        bomb(x, y) {
            const cx = x !== undefined ? x : Renderer.W / 2;
            const cy = y !== undefined ? y : Renderer.H / 2;
            _flash(cx, cy, Renderer.H * 1.2, 22, 'rgba(255,230,80,');
            _ring(cx, cy, 12,  30, 30, '255,240,160', 8);
            _ring(cx, cy, -40, 26, 38, '120,200,255', 5);   // 负起始半径 = 延迟出现的第二环
        },
        update(dt) {
            for (let i = _flashes.length - 1; i >= 0; i--) {
                _flashes[i].life -= dt;
                if (_flashes[i].life <= 0) _flashes.splice(i, 1);
            }
            for (let i = _rings.length - 1; i >= 0; i--) {
                const r = _rings[i];
                r.r    += r.speed * dt;
                r.life -= dt;
                if (r.life <= 0) _rings.splice(i, 1);
            }
        },
        draw(ctx) {
            for (const r of _rings) {
                if (r.r <= 0) continue;
                const a = (r.life / r.maxLife) * 0.85;
                ctx.strokeStyle = `rgba(${r.rgb},${a})`;
                ctx.lineWidth   = Math.max(1, r.width * (r.life / r.maxLife));
                ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
            }
            for (const f of _flashes) {
                const t   = 1 - f.life / f.maxLife;
                const r   = f.r * (0.3 + t * 0.7);
                const alp = (f.life / f.maxLife) * 0.55;
                const g   = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
                g.addColorStop(0,   f.color + alp + ')');
                g.addColorStop(0.5, f.color + alp * 0.5 + ')');
                g.addColorStop(1,   f.color + '0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        },
        clear() { _flashes.length = 0; _rings.length = 0; }
    };
})();
