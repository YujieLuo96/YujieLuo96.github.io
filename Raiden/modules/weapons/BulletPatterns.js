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

        // ── 进阶弹幕模式（全部兼容 factory；行为参数走 opts.bulletOpts 透传）──

        // 留安全缺口的环：gapAngle 方向 ±gapHalf 范围内不出弹 —— 经典"找缝隙钻"弹幕
        ringGap(ex, ey, count, speed, offset, gapAngle, gapHalf = 0.45, opts = {}, factory = null) {
            const arr   = [];
            const bOpts = opts.bulletOpts;
            for (let i = 0; i < count; i++) {
                const a = (Math.PI * 2 / count) * i + offset;
                let d = a - gapAngle;
                while (d >  Math.PI) d -= Math.PI * 2;
                while (d < -Math.PI) d += Math.PI * 2;
                if (Math.abs(d) < gapHalf) continue;
                arr.push(_b(ex, ey, a, speed, bOpts, factory));
            }
            return arr;
        },

        // 多旋臂：每条臂一发，逐帧递增 rotation 即形成风车/银河旋臂
        spiralArms(ex, ey, arms, rotation, speed, opts = {}, factory = null) {
            const arr   = [];
            const bOpts = opts.bulletOpts;
            for (let i = 0; i < arms; i++) {
                const a = (Math.PI * 2 / arms) * i + rotation;
                arr.push(_b(ex, ey, a, speed, bOpts, factory));
            }
            return arr;
        },

        // 横向弹墙：以 (ex,ey) 为中心、宽 width，留出第 gapIndex 个空位（<0 则不留）
        wall(ex, ey, count, width, speed, gapIndex = -1, opts = {}, factory = null) {
            const arr   = [];
            const bOpts = opts.bulletOpts;
            const step  = width / Math.max(count - 1, 1);
            for (let i = 0; i < count; i++) {
                if (i === gapIndex || i === gapIndex + 1) continue;
                arr.push(_b(ex - width / 2 + step * i, ey, Math.PI / 2, speed, bOpts, factory));
            }
            return arr;
        },

        // 蛇形瞄准弹：count 发并排蛇行逼近（waveAmp/waveFreq 可由 opts 覆盖）
        snake(ex, ey, px, py, speed, count = 3, opts = {}, factory = null) {
            const base = Math.atan2(py - ey, px - ex);
            const arr  = [];
            for (let i = 0; i < count; i++) {
                const bOpts = Object.assign({
                    type: 'shard', radius: 4.5, color: '#5f8',
                    waveAmp: 26, waveFreq: 0.14,
                    wavePhase: (i / Math.max(count, 1)) * Math.PI * 2,
                }, opts.bulletOpts || {});
                const spread = count > 1 ? (i - (count - 1) / 2) * 0.12 : 0;
                arr.push(_b(ex, ey, base + spread, speed, bOpts, factory));
            }
            return arr;
        },

        // 追踪火焰弹：限时追玩家的彗星（homing 帧数后改直线，留躲避窗口）
        homingFlare(ex, ey, px, py, speed = 3.2, opts = {}, factory = null) {
            const base  = Math.atan2(py - ey, px - ex);
            const bOpts = Object.assign({
                type: 'flare', radius: 4.5, color: '#f80', damage: 1,
                homing: 110, homingTurn: 0.030, life: 360,
            }, opts.bulletOpts || {});
            return [_b(ex, ey, base, speed, bOpts, factory)];
        },

        // 绽放花弹：慢速星弹环出膛后逐渐加速散开，形成"花开"压迫感
        bloom(ex, ey, count, offset = 0, opts = {}, factory = null) {
            const arr = [];
            for (let i = 0; i < count; i++) {
                const bOpts = Object.assign({
                    type: 'star', radius: 4, color: '#f6c', spin: 0.18,
                    accel: 0.045, maxSpeed: 4.6,
                }, opts.bulletOpts || {});
                const a = (Math.PI * 2 / count) * i + offset;
                arr.push(_b(ex, ey, a, opts.speed || 0.9, bOpts, factory));
            }
            return arr;
        },
    };
})();
