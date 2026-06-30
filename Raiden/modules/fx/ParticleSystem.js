var ParticleSystem = (() => {
    const POOL_SIZE = 600;
    const _pool   = [];
    const _active = [];
    for (let i = 0; i < POOL_SIZE; i++) _pool.push({});

    function _get() { return _pool.length ? _pool.pop() : {}; }
    function _ret(p) { if (_pool.length < POOL_SIZE) _pool.push(p); }

    return {
        init() { /* pool already allocated at parse time */ },
        // opts: count, angle, spread, speed, scatter, size, life, gravity,
        //       color | colors[], shape ('dot'|'spark'), drag (默认 0.97)
        spawn(x, y, opts = {}) {
            const n = opts.count || 1;
            for (let i = 0; i < n; i++) {
                if (_active.length >= 480) break;
                const p   = _get();
                const ang = (opts.angle !== undefined)
                    ? opts.angle + (Math.random() - 0.5) * (opts.spread !== undefined ? opts.spread : Math.PI * 2)
                    : Math.random() * Math.PI * 2;
                const spd = (opts.speed || 3) * (0.4 + Math.random() * 0.9);
                p.x       = x + (Math.random() - 0.5) * (opts.scatter || 0);
                p.y       = y + (Math.random() - 0.5) * (opts.scatter || 0);
                p.vx      = Math.cos(ang) * spd;
                p.vy      = Math.sin(ang) * spd;
                p.size    = (opts.size || 3) * (0.5 + Math.random() * 0.7);
                p.life    = opts.life || 30;
                p.maxLife = p.life;
                p.gravity = opts.gravity || 0;
                p.shape   = opts.shape || 'dot';
                p.drag    = opts.drag !== undefined ? opts.drag : 0.97;
                const cols = opts.colors || [opts.color || '#ff8'];
                p.color = cols[Math.floor(Math.random() * cols.length)];
                _active.push(p);
            }
        },
        update(dt) {
            for (let i = _active.length - 1; i >= 0; i--) {
                const p = _active[i];
                p.x  += p.vx * dt;
                p.y  += p.vy * dt;
                p.vy += p.gravity * dt;
                p.vx *= p.drag; p.vy *= p.drag;
                p.size *= 0.975;
                p.life -= dt;
                if (p.life <= 0 || p.size < 0.15) { _ret(p); _active.splice(i, 1); }
            }
        },
        draw(ctx) {
            // 加色混合：粒子辉光相互叠加更亮 → 爆炸/火花更有能量感（深色背景上呈泛光）
            ctx.globalCompositeOperation = 'lighter';
            for (const p of _active) {
                ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
                if (p.shape === 'spark') {
                    // 速度方向拉长的火花线条 —— 高速碎片/金属火星
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth   = Math.max(0.4, p.size * 0.5);
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x - p.vx * 2.4, p.y - p.vy * 2.4);
                    ctx.stroke();
                } else if (p.shape === 'ring') {
                    // 随年龄扩张的细环 —— 擦弹/削弹冲击波
                    const rr = Math.max(1, (p.maxLife - p.life) * 0.7 + 2);
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth   = Math.max(0.5, p.size * 0.45);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
                    ctx.stroke();
                } else {
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineWidth   = 1;
            ctx.globalAlpha = 1;
        },
        clear() { _active.forEach(p => _ret(p)); _active.length = 0; }
    };
})();
