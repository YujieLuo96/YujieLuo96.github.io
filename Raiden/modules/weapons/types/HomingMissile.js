var HomingMissile = (() => {
    const MAX_AMMO = 22;
    let _ammo      = MAX_AMMO;
    let _fireTimer = 0;
    const INTERVAL = 20;

    function _color(pw) {
        if (pw <= 20) return { body: '#c4e', glow: '#e6f', exhaust: '#ff8', trail: '#e6f' };
        const t = Math.min(1, (pw - 21) / 79);
        const h = (280 + Math.round(t * 80)) % 360; // magenta(280°) → red(0°)
        return { body: `hsl(${h},90%,65%)`, glow: `hsl(${h},100%,78%)`, exhaust: '#ff8', trail: `hsl(${h},100%,70%)` };
    }

    function _missileCount(pw) {
        return pw >= 60 ? 4 : pw >= 30 ? 3 : pw >= 12 ? 2 : 1;
    }

    class Missile extends PlayerBulletBase {
        constructor(x, y, speed, dmg, col) {
            super(x, y, { damage: dmg || 3, piercing: false });
            this.needsEnemies = true;
            this.speed  = speed || 7.5;
            this.vx     = (Math.random() - 0.5) * 2;
            this.vy     = -this.speed;
            this.turn   = 0.07;
            this.target = null;
            this.trail  = [];
            this.age    = 0;
            this.col    = col || { body: '#c4e', glow: '#e6f', exhaust: '#ff8', trail: '#e6f' };
        }

        _pick(enemies) {
            let best = null, bd = Infinity;
            for (const e of enemies) {
                if (!e.alive) continue;
                const dx = e.x - this.x, dy = e.y - this.y;
                const d  = dx * dx + dy * dy;
                if (d < bd) { bd = d; best = e; }
            }
            return best;
        }

        update(dt, enemies) {
            this.age += dt;
            if (this.age % 15 < 1) this.target = this._pick(enemies);
            if (this.target && this.target.alive) {
                const ta = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                const ca = Math.atan2(this.vy, this.vx);
                let diff = ta - ca;
                while (diff >  Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                const na = ca + Math.sign(diff) * Math.min(Math.abs(diff), this.turn * dt * 3);
                this.vx  = Math.cos(na) * this.speed;
                this.vy  = Math.sin(na) * this.speed;
            }
            this.x += this.vx * dt; this.y += this.vy * dt;
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > 14) this.trail.shift();
            if (this.isOffscreen()) this.alive = false;
        }

        draw(ctx) {
            for (let i = 0; i < this.trail.length - 1; i++) {
                const t = this.trail[i];
                ctx.globalAlpha = (i / this.trail.length) * 0.45;
                ctx.fillStyle   = this.col.trail;
                ctx.beginPath(); ctx.arc(t.x, t.y, 1.8 * (i / this.trail.length) + 0.4, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
            const ang = Math.atan2(this.vy, this.vx);
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang + Math.PI / 2);
            ctx.shadowColor = this.col.glow; ctx.shadowBlur = 8;
            ctx.fillStyle   = this.col.body;
            ctx.beginPath();
            ctx.moveTo(0, -11); ctx.lineTo(4, 5); ctx.lineTo(0, 2); ctx.lineTo(-4, 5);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle  = this.col.glow;
            ctx.beginPath(); ctx.arc(0, -4, 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle  = this.col.exhaust;
            ctx.beginPath(); ctx.arc(0, 5.5, 2, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        getBounds() { return { x: this.x - 5, y: this.y - 11, w: 10, h: 15 }; }
    }

    return {
        shoot(player, enemies, pw) {
            pw = pw || 1;
            if (_ammo <= 0) return [];
            _fireTimer++;
            if (_fireTimer < INTERVAL) return [];
            _fireTimer = 0; _ammo--;

            const count = _missileCount(pw);
            const speed = Math.min(14, 7.5 + pw * 0.065);
            const dmg   = 3 + pw * 0.12;
            const col   = _color(pw);
            const arr   = [];
            for (let i = 0; i < count; i++) {
                const m = new Missile(
                    player.x + (i - (count - 1) / 2) * 14,
                    player.y - 22,
                    speed, dmg, col
                );
                m.target = m._pick(enemies);
                arr.push(m);
            }
            return arr;
        },
        getAmmo()     { return _ammo; },
        getMaxAmmo()  { return MAX_AMMO; },
        isExhausted() { return _ammo <= 0; },
        reset()       { _ammo = MAX_AMMO; _fireTimer = 0; },
        refill()      { _ammo = MAX_AMMO; _fireTimer = 0; },
        Missile
    };
})();
