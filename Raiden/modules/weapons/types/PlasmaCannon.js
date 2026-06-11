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
            this.age          = 0;
            this.exploding    = false;
            this.explodeTimer = 0;
        }

        update(dt) {
            if (this.exploding) {
                this.explodeTimer += dt;
                if (this.explodeTimer > 14) this.alive = false;
                return;
            }
            this.age += dt;
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

            // 内部翻滚纹理：两层反向旋转的偏心亮斑（等离子对流感）
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.pulse * 1.6);
            const r1 = r * 0.34;
            const g1 = ctx.createRadialGradient(r * 0.32, 0, 0, r * 0.32, 0, r * 0.62);
            g1.addColorStop(0, `hsla(${h},100%,82%,0.75)`);
            g1.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g1;
            ctx.beginPath(); ctx.arc(r * 0.32, 0, r * 0.62, 0, Math.PI * 2); ctx.fill();
            ctx.rotate(-this.pulse * 3.9);
            const g2 = ctx.createRadialGradient(-r * 0.28, r * 0.18, 0, -r * 0.28, r * 0.18, r * 0.5);
            g2.addColorStop(0, `hsla(${(h + 35) % 360},100%,75%,0.6)`);
            g2.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g2;
            ctx.beginPath(); ctx.arc(-r * 0.28, r * 0.18, r * 0.5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(this.x, this.y, r * 0.38, 0, Math.PI * 2); ctx.fill();

            // 出膛闪光：前 4 帧叠加扩张光环
            if (this.age < 4) {
                const k = 1 - this.age / 4;
                ctx.globalAlpha = 0.75 * k;
                ctx.strokeStyle = `hsl(${h},100%,80%)`;
                ctx.lineWidth   = 3 * k + 1;
                ctx.beginPath(); ctx.arc(this.x, this.y, r * (1.2 + (1 - k) * 1.0), 0, Math.PI * 2); ctx.stroke();
                ctx.globalAlpha = 1;
            }
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
            const shot = new PlasmaShot(player.x, player.y - 32, pw);
            // 出膛闪光火花（单次 ≤6 粒）
            ParticleSystem.spawn(player.x, player.y - 32, {
                count: 6, angle: -Math.PI / 2, spread: 1.3,
                speed: 4, life: 14, size: 2.5, shape: 'spark',
                colors: [`hsl(${shot.hue},100%,75%)`, `hsl(${shot.hue},100%,88%)`, '#fff']
            });
            return [shot];
        },
        getAmmo()     { return _ammo; },
        getMaxAmmo()  { return MAX_AMMO; },
        isExhausted() { return _ammo <= 0; },
        reset()       { _ammo = MAX_AMMO; _fireTimer = 0; },
        refill()      { _ammo = MAX_AMMO; _fireTimer = 0; },
        PlasmaShot
    };
})();
