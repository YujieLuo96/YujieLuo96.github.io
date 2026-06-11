var SpreadGun = (() => {
    const MAX_AMMO = 180;
    let _ammo      = MAX_AMMO;
    let _fireTimer = 0;

    // 基准色相：随威力 cyan(192°) → blue(240°)；每片"扇叶"再按角度微调色相
    function _baseHue(pw) {
        if (pw <= 20) return 192;
        const t = Math.min(1, (pw - 21) / 79);
        return Math.round(192 + t * 48);
    }
    function _bladeColor(hue) {
        return { main: `hsl(${hue},100%,68%)`, core: `hsl(${hue},80%,94%)`, glow: `hsl(${hue},100%,52%)` };
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
            this.age = 0;
        }
        update(dt) {
            this.age += dt;
            this.x += this.vx * dt; this.y += this.vy * dt;
            if (this.isOffscreen()) this.alive = false;
        }
        draw(ctx) {
            const ang = Math.atan2(this.vy, this.vx);
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang + Math.PI / 2);
            ctx.shadowColor = this.col.glow; ctx.shadowBlur = 7;
            // 扇叶形弹体：尖头 + 内凹尾，像一片旋出去的刀叶
            ctx.fillStyle = this.col.main;
            ctx.beginPath();
            ctx.moveTo(0, -12);            // 尖头
            ctx.lineTo(3.4, 1);            // 右肩
            ctx.lineTo(2.2, 6);            // 右尾
            ctx.lineTo(0, 3.4);            // 尾部内凹
            ctx.lineTo(-2.2, 6);           // 左尾
            ctx.lineTo(-3.4, 1);           // 左肩
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
            // 亮芯叶脉
            ctx.fillStyle = this.col.core;
            ctx.beginPath();
            ctx.moveTo(0, -10.5);
            ctx.lineTo(1.3, 0.5);
            ctx.lineTo(0, 3);
            ctx.lineTo(-1.3, 0.5);
            ctx.closePath();
            ctx.fill();
            // 出膛闪光：前 3 帧的衰减光斑
            if (this.age < 3) {
                const k = 1 - this.age / 3;
                ctx.globalAlpha = 0.8 * k;
                ctx.fillStyle = this.col.core;
                ctx.beginPath(); ctx.arc(0, 4, 5 + k * 5, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
            }
            ctx.restore();
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
            const hue0  = _baseHue(pw);
            const dmg   = 0.9 + pw * 0.04;
            const span  = Math.PI * Math.min(0.8, 0.5 + pw * 0.004);
            const base  = -Math.PI / 2;
            const arr   = [];
            for (let i = 0; i < count; i++) {
                const a = count === 1 ? base : base - span / 2 + (span / (count - 1)) * i;
                // 扇叶层次：色相沿扇面从中心向两侧偏移（中心冷白蓝，外缘偏青/偏紫）
                const rel = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;   // -1 … 1
                const col = _bladeColor(hue0 + Math.round(rel * 26));
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
