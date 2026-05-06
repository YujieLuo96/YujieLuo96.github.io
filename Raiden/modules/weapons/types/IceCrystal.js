var IceCrystal = (() => {
    const MAX_AMMO = 140;
    let _ammo      = MAX_AMMO;
    let _fireTimer = 0;

    function _color(pw) {
        if (pw <= 20) return { main: '#a0f0ff', core: '#fff', glow: '#60d0ff' };
        const t   = Math.min(1, (pw - 21) / 79);
        const hue = Math.round(188 + t * 82); // 188(ice blue) → 270(violet)
        return { main: `hsl(${hue},100%,78%)`, core: `hsl(${hue},60%,96%)`, glow: `hsl(${hue},100%,62%)` };
    }

    function _shardCount(pw) {
        return pw >= 51 ? 5 : pw >= 31 ? 4 : pw >= 16 ? 3 : pw >= 6 ? 2 : 1;
    }

    class IceShard extends PlayerBulletBase {
        constructor(x, y, vx, vy, opts = {}) {
            super(x, y, { damage: opts.damage || 2, piercing: true });
            this.vx   = vx;
            this.vy   = vy;
            this.col  = opts.col || { main: '#a0f0ff', core: '#fff', glow: '#60d0ff' };
            this.rot  = Math.random() * Math.PI;
            this.spin = (Math.random() - 0.5) * 0.14;
        }

        update(dt) {
            this.x   += this.vx * dt;
            this.y   += this.vy * dt;
            this.rot += this.spin * dt;
            if (this.isOffscreen()) this.alive = false;
        }

        draw(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rot);
            ctx.shadowColor = this.col.glow;
            ctx.shadowBlur  = 12;
            // Outer hexagon
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i * Math.PI) / 3;
                i === 0 ? ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7)
                        : ctx.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
            }
            ctx.closePath();
            ctx.fillStyle   = this.col.main;
            ctx.globalAlpha = 0.72;
            ctx.fill();
            // Inner bright core
            ctx.globalAlpha = 1;
            ctx.fillStyle   = this.col.core;
            ctx.shadowBlur  = 5;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i * Math.PI) / 3;
                i === 0 ? ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3)
                        : ctx.lineTo(Math.cos(a) * 3, Math.sin(a) * 3);
            }
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        getBounds() { return { x: this.x - 7, y: this.y - 7, w: 14, h: 14 }; }
    }

    return {
        shoot(player, pw) {
            pw = pw || 1;
            if (_ammo <= 0) return [];
            _fireTimer++;
            const interval = Math.max(10, 26 - Math.floor(pw / 5));
            if (_fireTimer < interval) return [];
            _fireTimer = 0;
            _ammo--;

            const count  = _shardCount(pw);
            const col    = _color(pw);
            const dmg    = 1.6 + pw * 0.08;
            const speed  = Math.min(17, 13 + pw * 0.05);
            const spread = count === 1 ? 0 : Math.min(0.65, 0.15 + count * 0.10);

            const shards = [];
            for (let i = 0; i < count; i++) {
                const angle = count === 1 ? -Math.PI / 2
                    : -Math.PI / 2 - spread + (spread * 2 / (count - 1)) * i;
                shards.push(new IceShard(
                    player.x + (i - (count - 1) / 2) * 10,
                    player.y - 20,
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed,
                    { damage: dmg, col }
                ));
            }
            return shards;
        },
        getAmmo()     { return _ammo; },
        getMaxAmmo()  { return MAX_AMMO; },
        isExhausted() { return _ammo <= 0; },
        reset()       { _ammo = MAX_AMMO; _fireTimer = 0; },
        refill()      { _ammo = Math.min(MAX_AMMO, _ammo + MAX_AMMO); }
    };
})();
