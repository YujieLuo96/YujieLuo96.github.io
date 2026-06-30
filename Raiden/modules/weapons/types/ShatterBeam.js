// ──────────────────────────────────────────────────────────────────────────
//  ShatterBeam — 碎裂光束
//  快速正弦蛇形晶弹；命中敌人后碎裂为 3 枚前向散射子弹（在 GameCore 碰撞中处理）。
//  填补"多段抛射 / 命中级联"空缺：对密集编队收益最高。
// ──────────────────────────────────────────────────────────────────────────
var ShatterBeam = (() => {
    const MAX_AMMO = 320;
    const INTERVAL = 7;
    let _ammo  = MAX_AMMO;
    let _timer = 0;

    function _col(pw) {
        if (pw <= 20) return { main: '#5fefff', core: '#ffffff', glow: '#20c8ff' };
        const t = Math.min(1, (pw - 21) / 79);
        const h = Math.round(186 - t * 60);   // teal(186°) → green-cyan，与激光/冰区分
        return { main: `hsl(${h},100%,70%)`, core: '#ffffff', glow: `hsl(${h},100%,55%)` };
    }

    class ShatterBolt extends PlayerBulletBase {
        constructor(x, y, opts = {}) {
            super(x, y, { damage: opts.damage || 2.5, piercing: false });
            this.type     = 'shatter';        // GameCore 据此触发命中碎裂
            this.vy       = -(opts.speed || 13);
            this.baseX    = x;
            this.t        = 0;
            this.amp      = opts.amp  || 13;
            this.freq     = opts.freq || 0.5;
            this.phase    = opts.phase || 0;
            this.childDmg = opts.childDmg || 1.4;
            this.col      = opts.col || { main: '#5fefff', core: '#fff', glow: '#20c8ff' };
            this.age      = 0;
            this.x        = x;
        }
        update(dt) {
            this.t   += dt;
            this.age += dt;
            this.y   += this.vy * dt;
            this.x    = this.baseX + Math.sin(this.t * this.freq + this.phase) * this.amp;
            if (this.isOffscreen()) this.alive = false;
        }
        draw(ctx) {
            const ang = Math.atan2(this.vy, Math.cos(this.t * this.freq + this.phase) * this.amp * this.freq);
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(ang + Math.PI / 2);
            ctx.shadowColor = this.col.glow; ctx.shadowBlur = 8;
            // 晶体棱形弹头
            const g = ctx.createLinearGradient(0, -10, 0, 8);
            g.addColorStop(0, this.col.core);
            g.addColorStop(0.5, this.col.main);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, -11); ctx.lineTo(4, -2); ctx.lineTo(2.4, 6);
            ctx.lineTo(-2.4, 6); ctx.lineTo(-4, -2);
            ctx.closePath(); ctx.fill();
            // 内核高光
            ctx.shadowBlur = 0;
            ctx.fillStyle = this.col.core;
            ctx.fillRect(-1, -9, 2, 12);
            // 出膛闪光
            if (this.age < 3) {
                const k = 1 - this.age / 3;
                ctx.globalAlpha = 0.8 * k;
                ctx.fillStyle = this.col.core;
                ctx.beginPath(); ctx.arc(0, 2, 4 + k * 5, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
            }
            ctx.restore();
        }
        getBounds() { return { x: this.x - 4, y: this.y - 9, w: 8, h: 18 }; }
    }

    return {
        ShatterBolt,

        shoot(player, pw) {
            pw = pw || 1;
            if (_ammo <= 0) return [];
            _timer++;
            if (_timer < INTERVAL) return [];
            _timer = 0; _ammo--;

            const count    = pw >= 21 ? 3 : pw >= 8 ? 2 : 1;
            const dmg      = 2.2 + pw * 0.06;
            const childDmg = 1.2 + pw * 0.04;
            const speed    = Math.min(17, 12 + pw * 0.05);
            const col      = _col(pw);
            const arr = [];
            for (let i = 0; i < count; i++) {
                arr.push(new ShatterBolt(
                    player.x + (i - (count - 1) / 2) * 16, player.y - 20,
                    { speed, damage: dmg, childDmg, amp: 13, freq: 0.5, phase: i * Math.PI * 0.6, col }
                ));
            }
            return arr;
        },

        // 命中碎裂出的散射子（普通光束，不再二次碎裂）—— GameCore 命中时调用
        makeShard(x, y, angle, dmg) {
            const spd = 9;
            return new GenericPlayerBullet(x, y, Math.cos(angle) * spd, Math.sin(angle) * spd,
                { color: '#7ff0ff', core: '#fff', r: 3, damage: dmg || 1.2 });
        },

        getAmmo()     { return _ammo; },
        getMaxAmmo()  { return MAX_AMMO; },
        isExhausted() { return _ammo <= 0; },
        reset()       { _ammo = MAX_AMMO; _timer = 0; },
        refill()      { _ammo = MAX_AMMO; _timer = 0; }
    };
})();
