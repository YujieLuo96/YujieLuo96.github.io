var ParticleSystem = (() => {
    const POOL_SIZE = 600;
    const _pool   = [];
    const _active = [];
    for (let i = 0; i < POOL_SIZE; i++) _pool.push({});

    function _get() { return _pool.length ? _pool.pop() : {}; }
    function _ret(p) { if (_pool.length < POOL_SIZE) _pool.push(p); }

    return {
        init() { /* pool already allocated at parse time */ },
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
                p.vx *= 0.97; p.vy *= 0.97;
                p.size *= 0.975;
                p.life -= dt;
                if (p.life <= 0 || p.size < 0.15) { _ret(p); _active.splice(i, 1); }
            }
        },
        draw(ctx) {
            for (const p of _active) {
                ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
                ctx.fillStyle   = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        },
        clear() { _active.forEach(p => _ret(p)); _active.length = 0; }
    };
})();
