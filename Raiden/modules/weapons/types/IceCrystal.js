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
            this.age  = 0;
        }

        update(dt) {
            this.age += dt;
            this.x   += this.vx * dt;
            this.y   += this.vy * dt;
            this.rot += this.spin * dt;
            if (this.isOffscreen()) this.alive = false;
        }

        draw(ctx) {
            // 淡蓝拖影：沿速度反方向拉长的渐变椭圆（无历史点）
            const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            const ta  = Math.atan2(this.vy, this.vx);
            const tl  = 6 + spd * 1.6;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(ta);
            const tg = ctx.createLinearGradient(0, 0, -tl, 0);
            tg.addColorStop(0, 'rgba(160,235,255,0.40)');
            tg.addColorStop(1, 'rgba(160,235,255,0)');
            ctx.fillStyle = tg;
            ctx.beginPath();
            ctx.ellipse(-tl * 0.5, 0, tl * 0.5, 3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rot);
            ctx.shadowColor = this.col.glow;
            ctx.shadowBlur  = 9;
            // 棱面六边形：长短轴交替的尖晶造型
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i * Math.PI) / 3;
                const r = i % 2 === 0 ? 8.5 : 5.5;   // 长短交替 → 棱晶
                i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                        : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fillStyle   = this.col.main;
            ctx.globalAlpha = 0.72;
            ctx.fill();
            ctx.shadowBlur = 0;
            // 棱面分割线：三条过心对角线，体现切面
            ctx.globalAlpha = 0.55;
            ctx.strokeStyle = this.col.core;
            ctx.lineWidth   = 0.8;
            ctx.beginPath();
            for (let i = 0; i < 3; i++) {
                const a = (i * Math.PI) / 3;
                const r = i % 2 === 0 ? 8.5 : 5.5;
                ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                ctx.lineTo(-Math.cos(a) * r, -Math.sin(a) * r);
            }
            ctx.stroke();
            // Inner bright core
            ctx.globalAlpha = 1;
            ctx.fillStyle   = this.col.core;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i * Math.PI) / 3;
                i === 0 ? ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3)
                        : ctx.lineTo(Math.cos(a) * 3, Math.sin(a) * 3);
            }
            ctx.closePath();
            ctx.fill();
            // 出膛闪光：前 3 帧
            if (this.age < 3) {
                const k = 1 - this.age / 3;
                ctx.globalAlpha = 0.8 * k;
                ctx.fillStyle = this.col.core;
                ctx.beginPath(); ctx.arc(0, 0, 6 + k * 6, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
            }
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
