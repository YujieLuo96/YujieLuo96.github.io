var PlasmaCannon = (() => {
    const MAX_AMMO = 10;
    let _ammo      = MAX_AMMO;
    let _fireTimer = 0;
    const INTERVAL = 38;

    class PlasmaShot extends PlayerBulletBase {
        constructor(x, y, pw) {
            pw = pw || 1;
            const r = Math.min(22, 14 + pw * 0.12);
            super(x, y, { damage: 6 + pw * 0.25, piercing: false });
            this.type         = 'plasma';
            this.pw           = pw;
            // hue: 0=red (low pw) → 270=violet (high pw)
            this.hue          = pw <= 20 ? 0 : Math.round(((Math.min(pw, 100) - 21) / 79) * 270);
            this.radius       = r;
            this.explosionR   = Math.min(100, 60 + pw * 0.7);
            this.vy           = -5.5;
            this.vx           = 0;
            this.pulse        = 0;
            this.exploding    = false;
            this.explodeTimer = 0;
        }

        update(dt) {
            if (this.exploding) {
                this.explodeTimer += dt;
                if (this.explodeTimer > 14) this.alive = false;
                return;
            }
            this.x += this.vx * dt; this.y += this.vy * dt;
            this.pulse += 0.18 * dt;
            if (this.y < -30) this.alive = false;
        }

        explode() {
            if (this.exploding) return;
            this.exploding = true;
            const h = this.hue;
            ParticleSystem.spawn(this.x, this.y, {
                count: 25,
                colors: [`hsl(${h},100%,62%)`, `hsl(${h},90%,72%)`, `hsl(${h},80%,84%)`],
                speed: 6, life: 28, size: 6, scatter: 10
            });
            ExplosionFX.largeEnemy(this.x, this.y, `hsl(${h},100%,60%)`);
        }

        draw(ctx) {
            const h = this.hue;
            if (this.exploding) {
                const prog = this.explodeTimer / 14;
                const r    = this.explosionR * prog;
                const alp  = 1 - prog;
                const g    = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
                g.addColorStop(0,   `hsla(${h},100%,65%,${alp * 0.9})`);
                g.addColorStop(0.5, `hsla(${h},100%,45%,${alp * 0.55})`);
                g.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.fill();
                return;
            }
            const wb = Math.sin(this.pulse) * 2.5;
            const r  = this.radius + wb;
            const g  = ctx.createRadialGradient(this.x, this.y, 1, this.x, this.y, r * 2.2);
            g.addColorStop(0,    `hsl(${h},100%,90%)`);
            g.addColorStop(0.4,  `hsl(${h},100%,55%)`);
            g.addColorStop(0.75, `hsla(${h},100%,38%,0.5)`);
            g.addColorStop(1,    'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(this.x, this.y, r * 2.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(this.x, this.y, r * 0.38, 0, Math.PI * 2); ctx.fill();
        }

        getBounds() {
            return this.exploding
                ? { x: this.x - this.explosionR, y: this.y - this.explosionR, w: this.explosionR * 2, h: this.explosionR * 2 }
                : { x: this.x - this.radius,     y: this.y - this.radius,     w: this.radius * 2,     h: this.radius * 2 };
        }
    }

    return {
        shoot(player, pw) {
            pw = pw || 1;
            if (_ammo <= 0) return [];
            _fireTimer++;
            if (_fireTimer < INTERVAL) return [];
            _fireTimer = 0; _ammo--;
            return [new PlasmaShot(player.x, player.y - 32, pw)];
        },
        getAmmo()     { return _ammo; },
        getMaxAmmo()  { return MAX_AMMO; },
        isExhausted() { return _ammo <= 0; },
        reset()       { _ammo = MAX_AMMO; _fireTimer = 0; },
        refill()      { _ammo = MAX_AMMO; _fireTimer = 0; },
        PlasmaShot
    };
})();
