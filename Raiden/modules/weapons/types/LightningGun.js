var LightningGun = (() => {
    const MAX_AMMO = 22;
    let _ammo = MAX_AMMO;
    let _fireTimer = 0;

    function _color(pw) {
        if (pw <= 20) return { main: '#fff8a0', core: '#fff', glow: '#ffe040' };
        const hue = Math.round(50 + ((Math.min(pw, 100) - 21) / 79) * 60); // 50→110 yellow-green
        return { main: `hsl(${hue},100%,80%)`, core: '#fff', glow: `hsl(${hue},100%,65%)` };
    }

    class LightningBolt extends PlayerBulletBase {
        constructor(x, y, opts = {}) {
            super(x, y, { damage: opts.damage || 2.5, piercing: false });
            this.speed        = opts.speed || 14;
            this.vx           = (Math.random() - 0.5) * 2;
            this.vy           = -this.speed;
            this.turn         = opts.turn || 0.11;
            this.target       = null;
            this.col          = opts.col || { main: '#fff8a0', core: '#fff', glow: '#ffe040' };
            this.trail        = [];
            this.age          = 0;
            this.needsEnemies = true; // flag for WeaponManager bullet update
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
            if (this.age % 12 < 1) this.target = this._pick(enemies);
            if (this.target && this.target.alive) {
                const ta  = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                const ca  = Math.atan2(this.vy, this.vx);
                let diff  = ta - ca;
                while (diff >  Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                const na  = ca + Math.sign(diff) * Math.min(Math.abs(diff), this.turn * dt * 3);
                this.vx   = Math.cos(na) * this.speed;
                this.vy   = Math.sin(na) * this.speed;
            }
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            // zigzag trail point
            this.trail.push({ x: this.x + (Math.random() - 0.5) * 4, y: this.y });
            if (this.trail.length > 12) this.trail.shift();
            if (this.age > 90 || this.isOffscreen()) this.alive = false;
        }

        draw(ctx) {
            // Electric zigzag trail
            if (this.trail.length > 1) {
                ctx.strokeStyle = this.col.glow;
                ctx.lineWidth   = 1.5;
                ctx.shadowColor = this.col.glow; ctx.shadowBlur = 10;
                ctx.globalAlpha = 0.55;
                ctx.beginPath();
                ctx.moveTo(this.trail[0].x, this.trail[0].y);
                for (let i = 1; i < this.trail.length; i++) ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.stroke();
                ctx.shadowBlur = 0; ctx.globalAlpha = 1;
            }
            // Bolt head
            const ang = Math.atan2(this.vy, this.vx);
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(ang + Math.PI / 2);
            ctx.shadowColor = this.col.glow; ctx.shadowBlur = 12;
            const g = ctx.createLinearGradient(0, -15, 0, 6);
            g.addColorStop(0,   this.col.core);
            g.addColorStop(0.4, this.col.main);
            g.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(-2.5, -15, 5, 19);
            ctx.fillStyle = '#fff';
            ctx.fillRect(-1, -13, 2, 14);
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        getBounds() { return { x: this.x - 5, y: this.y - 12, w: 10, h: 16 }; }
    }

    return {
        LightningBolt,
        shoot(player, enemies) {
            if (_ammo <= 0) return [];
            _fireTimer++;
            const pw       = player.powerLevel;
            const interval = Math.max(12, 22 - Math.floor(pw / 5));
            if (_fireTimer < interval) return [];
            _fireTimer = 0;
            _ammo--;

            const boltCount = pw >= 30 ? 4 : pw >= 16 ? 3 : pw >= 6 ? 2 : 1;
            const dmg       = 2.2 + pw * 0.10;
            const speed     = Math.min(18, 11 + pw * 0.14);
            const turn      = Math.min(0.22, 0.09 + pw * 0.002);
            const col       = _color(pw);

            // Sort alive enemies by distance, assign different targets
            const alive = enemies.filter(e => e.alive).sort((a, b) => {
                const da = (a.x - player.x) ** 2 + (a.y - player.y) ** 2;
                const db = (b.x - player.x) ** 2 + (b.y - player.y) ** 2;
                return da - db;
            });

            const bolts = [];
            for (let i = 0; i < boltCount; i++) {
                const bolt = new LightningBolt(
                    player.x + (i - (boltCount - 1) / 2) * 12,
                    player.y - 22,
                    { damage: dmg, speed, col, turn }
                );
                if (alive[i]) bolt.target = alive[i];
                bolts.push(bolt);
            }
            return bolts;
        },
        getAmmo()     { return _ammo; },
        getMaxAmmo()  { return MAX_AMMO; },
        isExhausted() { return _ammo <= 0; },
        reset()       { _ammo = MAX_AMMO; _fireTimer = 0; },
        refill()      { _ammo = Math.min(MAX_AMMO, _ammo + MAX_AMMO); }
    };
})();
