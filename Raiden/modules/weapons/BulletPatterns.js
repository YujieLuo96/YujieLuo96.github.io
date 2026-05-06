var BulletPatterns = (() => {
    // Default factory — creates an EnemyBullet
    const _enemyFactory = (opts = {}) =>
        (x, y, vx, vy) => new EnemyBullet(x, y, vx, vy, opts);

    // Core: apply factory (or default) to produce one bullet
    function _b(x, y, angle, speed, bulletOpts, factory) {
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        return factory
            ? factory(x, y, vx, vy)
            : new EnemyBullet(x, y, vx, vy, bulletOpts);
    }

    return {
        // ── Convenience factories ─────────────────────────────────────────
        // Usage: const f = BulletPatterns.FACTORY.enemy({ color:'#f44', radius:5 })
        //        BulletPatterns.ring(x, y, 12, 3, 0, {}, f)
        FACTORY: {
            enemy:  (opts = {}) => (x, y, vx, vy) => new EnemyBullet(x, y, vx, vy, opts),
            // GenericPlayerBullet is defined in PlayerBulletBase.js (loads later);
            // this function is only called at runtime so the global will exist.
            player: (opts = {}) => (x, y, vx, vy) => new GenericPlayerBullet(x, y, vx, vy, opts),
        },

        // ── Pattern functions ─────────────────────────────────────────────
        // All accept an optional `factory` as their last argument.
        // When omitted they create EnemyBullets (fully backward-compatible).

        // N-way aimed spread
        aimed(ex, ey, px, py, speed, opts = {}, factory = null) {
            const base  = Math.atan2(py - ey, px - ex);
            const count = opts.count || 1;
            const spr   = opts.spread || 0;
            const bOpts = opts.bulletOpts;
            const arr   = [];
            for (let i = 0; i < count; i++) {
                const a = count > 1 ? base - spr / 2 + (spr / (count - 1)) * i : base;
                arr.push(_b(ex, ey, a, speed, bOpts, factory));
            }
            return arr;
        },

        // Uniform ring
        ring(ex, ey, count, speed, offset = 0, opts = {}, factory = null) {
            const arr = [];
            const bOpts = opts.bulletOpts;
            for (let i = 0; i < count; i++) {
                const a = (Math.PI * 2 / count) * i + offset;
                arr.push(_b(ex, ey, a, speed, bOpts, factory));
            }
            return arr;
        },

        // Fan / spread from a base direction
        fan(ex, ey, count, speed, baseAngle, totalAngle, opts = {}, factory = null) {
            const arr   = [];
            const bOpts = opts.bulletOpts;
            for (let i = 0; i < count; i++) {
                const a = baseAngle - totalAngle / 2 + (totalAngle / Math.max(count - 1, 1)) * i;
                arr.push(_b(ex, ey, a, speed, bOpts, factory));
            }
            return arr;
        },

        // Rotating ring (spiral when called each frame with incrementing rotation)
        spiral(ex, ey, count, speed, rotation, opts = {}, factory = null) {
            const arr   = [];
            const bOpts = opts.bulletOpts;
            for (let i = 0; i < count; i++) {
                const a = (Math.PI * 2 / count) * i + rotation;
                arr.push(_b(ex, ey, a, speed, bOpts, factory));
            }
            return arr;
        },

        // Wave: bullets in a sine-wave spread
        wave(ex, ey, count, speed, baseAngle, opts = {}, factory = null) {
            const arr   = [];
            const bOpts = opts.bulletOpts;
            for (let i = 0; i < count; i++) {
                const a = baseAngle + Math.sin(i * 0.9) * 0.55;
                const s = speed * (0.8 + Math.random() * 0.4);
                arr.push(_b(ex, ey, a, s, bOpts, factory));
            }
            return arr;
        },

        // Burst: random-spread cluster around a direction (useful for explosions)
        burst(ex, ey, count, speed, baseAngle, halfAngle = Math.PI, factory = null) {
            const arr = [];
            for (let i = 0; i < count; i++) {
                const a = baseAngle + (Math.random() - 0.5) * 2 * halfAngle;
                const s = speed * (0.6 + Math.random() * 0.8);
                arr.push(_b(ex, ey, a, s, null, factory));
            }
            return arr;
        },

        // Fast aimed laser beam(s) — cyan piercing bolt
        // count: number of parallel beams (slight angular spread when >1)
        laserBeam(ex, ey, px, py, speed = 11, count = 1, factory = null) {
            const base  = Math.atan2(py - ey, px - ex);
            const bOpts = { type: 'laser', radius: 3, color: '#0ef', damage: 2 };
            const arr   = [];
            for (let i = 0; i < count; i++) {
                const spread = count > 1 ? (i - (count - 1) / 2) * 0.10 : 0;
                arr.push(_b(ex, ey, base + spread, speed, bOpts, factory));
            }
            return arr;
        },

        // Neutron pulse — slow purple-black beam surrounded by crackling lightning
        neutronPulse(ex, ey, px, py, speed = 4.5, factory = null) {
            const base  = Math.atan2(py - ey, px - ex);
            const bOpts = { type: 'neutron_pulse', radius: 4, color: '#80f', damage: 3 };
            return [_b(ex, ey, base, speed, bOpts, factory)];
        },

        // Ring of slow neutron orbs (purple-white glowing spheres)
        neutronOrbs(ex, ey, count, speed, offset = 0, factory = null) {
            const bOpts = { type: 'neutron_orb', radius: 7, color: '#90f', damage: 2 };
            const arr   = [];
            for (let i = 0; i < count; i++) {
                const a = (Math.PI * 2 / count) * i + offset;
                arr.push(_b(ex, ey, a, speed, bOpts, factory));
            }
            return arr;
        },
    };
})();
