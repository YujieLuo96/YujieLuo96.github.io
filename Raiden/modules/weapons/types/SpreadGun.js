var SpreadGun = (() => {
    const MAX_AMMO = 180;
    let _ammo      = MAX_AMMO;
    let _fireTimer = 0;

    function _color(pw) {
        if (pw <= 20) return { main: '#4cf', core: '#9ef', glow: '#2af' };
        const t   = Math.min(1, (pw - 21) / 79);
        const hue = Math.round(188 + t * 52); // cyan(188°) → blue(240°)
        return { main: `hsl(${hue},100%,68%)`, core: `hsl(${hue},80%,92%)`, glow: `hsl(${hue},100%,52%)` };
    }

    function _bulletCount(pw) {
        return pw >= 51 ? 12 : pw >= 26 ? 9 : pw >= 11 ? 7 : 5;
    }

    class SpreadBullet extends PlayerBulletBase {
        constructor(x, y, angle, col, dmg) {
            super(x, y, { damage: dmg || 1, piercing: false });
            this.vx  = Math.cos(angle) * 10;
            this.vy  = Math.sin(angle) * 10;
            this.col = col;
        }
        update(dt) {
            this.x += this.vx * dt; this.y += this.vy * dt;
            if (this.isOffscreen()) this.alive = false;
        }
        draw(ctx) {
            const ang = Math.atan2(this.vy, this.vx);
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang + Math.PI / 2);
            ctx.shadowColor = this.col.glow; ctx.shadowBlur = 7;
            ctx.fillStyle   = this.col.main;
            ctx.fillRect(-3, -10, 6, 16);
            ctx.fillStyle   = this.col.core;
            ctx.fillRect(-1.5, -8, 3, 10);
            ctx.shadowBlur  = 0; ctx.restore();
        }
        getBounds() { return { x: this.x - 3, y: this.y - 10, w: 6, h: 14 }; }
    }

    return {
        shoot(player, pw) {
            pw = pw || 1;
            if (_ammo <= 0) return [];
            _fireTimer++;
            const interval = Math.max(8, 18 - Math.floor(pw / 8));
            if (_fireTimer < interval) return [];
            _fireTimer = 0; _ammo--;

            const count = _bulletCount(pw);
            const col   = _color(pw);
            const dmg   = 0.9 + pw * 0.04;
            const span  = Math.PI * Math.min(0.8, 0.5 + pw * 0.004);
            const base  = -Math.PI / 2;
            const arr   = [];
            for (let i = 0; i < count; i++) {
                const a = count === 1 ? base : base - span / 2 + (span / (count - 1)) * i;
                arr.push(new SpreadBullet(player.x, player.y - 22, a, col, dmg));
            }
            return arr;
        },
        getAmmo()     { return _ammo; },
        getMaxAmmo()  { return MAX_AMMO; },
        isExhausted() { return _ammo <= 0; },
        reset()       { _ammo = MAX_AMMO; _fireTimer = 0; },
        refill(n)     { _ammo = Math.min(MAX_AMMO, _ammo + (n || MAX_AMMO)); }
    };
})();
