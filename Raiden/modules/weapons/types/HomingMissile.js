var HomingMissile = (() => {
    const MAX_AMMO = 36;   // 22→36：导弹约 7 秒即耗尽（audit），提高留存
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
            this.age    = 0;
            this.retarget = 15;                    // 重新锁敌倒计时（帧驱动，帧率无关）
            this.bank   = 0;                       // 转向倾斜量（平滑）
            this.smoke  = Math.random() * 3.5;     // 排烟节流相位（错开各弹）
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
            // 周期重锁：用倒计时而非 age%15（连续浮点取模会跳过命中窗口，导致漏锁）
            this.retarget -= dt;
            if (this.retarget <= 0) { this.target = this._pick(enemies); this.retarget = 15; }
            let turned = 0;
            if (this.target && this.target.alive) {
                const ta = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                const ca = Math.atan2(this.vy, this.vx);
                let diff = ta - ca;
                while (diff >  Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                turned   = Math.sign(diff) * Math.min(Math.abs(diff), this.turn * dt * 3);
                const na = ca + turned;
                this.vx  = Math.cos(na) * this.speed;
                this.vy  = Math.sin(na) * this.speed;
            }
            // 倾斜感：朝转向方向滚转，无转向时缓慢回正（指数平滑，帧率无关）
            this.bank += (turned * 7 - this.bank) * (1 - Math.pow(0.82, dt));
            this.x += this.vx * dt; this.y += this.vy * dt;
            // 排气尾烟：每 ~3.5 帧 1 粒（节流）
            this.smoke += dt;
            if (this.smoke >= 3.5) {
                this.smoke -= 3.5;
                const ang = Math.atan2(this.vy, this.vx);
                ParticleSystem.spawn(this.x - Math.cos(ang) * 9, this.y - Math.sin(ang) * 9, {
                    count: 1, angle: ang + Math.PI, spread: 0.5,
                    speed: 1.2, life: 24, size: 2.6, drag: 0.93,
                    colors: ['#9a9aa8', '#777788', '#ffb866']
                });
            }
            if (this.isOffscreen()) this.alive = false;
        }

        draw(ctx) {
            const ang = Math.atan2(this.vy, this.vx);
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang + Math.PI / 2);
            // 尾焰拖影：沿速度反方向拉长的渐变（不存历史轨迹点）
            const plumeL = 7 + this.speed * 2.0;
            const pg = ctx.createLinearGradient(0, 5, 0, 5 + plumeL);
            pg.addColorStop(0,    this.col.exhaust);
            pg.addColorStop(0.35, this.col.trail);
            pg.addColorStop(1,    'rgba(0,0,0,0)');
            ctx.fillStyle = pg;
            ctx.beginPath();
            ctx.moveTo(-2.4, 5);
            ctx.lineTo(2.4, 5);
            ctx.lineTo(0.4, 5 + plumeL);
            ctx.lineTo(-0.4, 5 + plumeL);
            ctx.closePath();
            ctx.fill();
            // 转向倾斜：横向压缩模拟滚转 + 轻微附加旋转
            const bk = Math.max(-0.6, Math.min(0.6, this.bank));
            ctx.rotate(bk * 0.22);
            ctx.scale(1 - Math.abs(bk) * 0.45, 1);
            ctx.shadowColor = this.col.glow; ctx.shadowBlur = 8;
            ctx.fillStyle   = this.col.body;
            ctx.beginPath();
            ctx.moveTo(0, -11); ctx.lineTo(4, 5); ctx.lineTo(0, 2); ctx.lineTo(-4, 5);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle  = this.col.glow;
            ctx.beginPath(); ctx.arc(0, -4, 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            // 喷口亮点（火焰核心闪烁）
            ctx.fillStyle = this.col.exhaust;
            ctx.beginPath(); ctx.arc(0, 5.5, 2 + (this.age % 2), 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, 5.2, 1, 0, Math.PI * 2); ctx.fill();
            // 出膛闪光：前 3 帧
            if (this.age < 3) {
                const k = 1 - this.age / 3;
                ctx.globalAlpha = 0.8 * k;
                ctx.fillStyle = '#ffe9b0';
                ctx.beginPath(); ctx.arc(0, 6, 5 + k * 6, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
            }
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
