var ExplosionFX = (() => {
    const _flashes = [];

    function _flash(x, y, r, life, color) {
        _flashes.push({ x, y, r, life, maxLife: life, color: color || 'rgba(255,200,100,' });
    }

    return {
        smallEnemy(x, y) {
            ParticleSystem.spawn(x, y, { count: 8,  colors: ['#f80', '#ff4', '#f40'], speed: 3, life: 20, size: 3 });
        },
        mediumEnemy(x, y, color) {
            ParticleSystem.spawn(x, y, { count: 18, colors: [color, '#fff', '#ff8'], speed: 4.5, life: 28, size: 4 });
            _flash(x, y, 36, 8);
        },
        largeEnemy(x, y, color) {
            ParticleSystem.spawn(x, y, { count: 30, colors: [color, '#fff', '#fa0'], speed: 5.5, life: 36, size: 6 });
            _flash(x, y, 60, 10);
        },
        boss(x, y, color) {
            ParticleSystem.spawn(x, y, { count: 70, colors: [color, '#fff', '#fa0', '#f44'], speed: 7, life: 55, size: 9, scatter: 35 });
            [0, 130, 260].forEach(delay => {
                setTimeout(() => {
                    if (_flashes.length < 20)
                        ParticleSystem.spawn(x + (Math.random()-0.5)*80, y + (Math.random()-0.5)*50,
                            { count: 25, colors: ['#f80','#ff4'], speed: 5, life: 32, size: 6 });
                }, delay);
            });
            _flash(x, y, 100, 18);
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
        bomb() {
            _flash(Renderer.W / 2, Renderer.H / 2, Renderer.H * 1.2, 22, 'rgba(255,230,80,');
        },
        update(dt) {
            for (let i = _flashes.length - 1; i >= 0; i--) {
                _flashes[i].life -= dt;
                if (_flashes[i].life <= 0) _flashes.splice(i, 1);
            }
        },
        draw(ctx) {
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
        clear() { _flashes.length = 0; }
    };
})();
