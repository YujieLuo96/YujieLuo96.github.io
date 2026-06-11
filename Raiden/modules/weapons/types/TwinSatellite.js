var TwinSatellite = (() => {
    const MAX_AMMO = 200;
    const ORBIT_R  = 52;
    const SHOT_INT = 20;

    let _ammo    = MAX_AMMO;
    let _sats    = [];
    let _angle   = 0;
    let _pending = [];
    let _pw      = 1;
    let _px      = 0, _py = 0;

    function _satCount(pw) {
        return pw >= 51 ? 5 : pw >= 31 ? 4 : pw >= 16 ? 3 : 2;
    }

    function _color(pw) {
        if (pw <= 20) return { sat: '#ffb830', core: '#fff8e0', glow: '#ff9800', bullet: '#ffd080' };
        const t = Math.min(1, (pw - 21) / 79);
        const h = Math.round(40 + t * 140); // gold(40°)→teal(180°)
        return { sat: `hsl(${h},100%,62%)`, core: `hsl(${h},80%,92%)`, glow: `hsl(${h},100%,48%)`, bullet: `hsl(${h},100%,76%)` };
    }

    class SatBullet extends PlayerBulletBase {
        constructor(x, y, col, dmg) {
            super(x, y, { damage: dmg || 2, piercing: false });
            this.vy  = -13;
            this.vx  = 0;
            this.col = col;
            this.age = 0;
        }
        update(dt) {
            this.age += dt;
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            if (this.isOffscreen()) this.alive = false;
        }
        draw(ctx) {
            ctx.save();
            ctx.shadowColor = this.col.glow; ctx.shadowBlur = 10;
            // 沿速度方向拉长的光弹（拖影感）
            const g = ctx.createLinearGradient(this.x, this.y - 8, this.x, this.y + 10);
            g.addColorStop(0,   this.col.core);
            g.addColorStop(0.4, this.col.bullet);
            g.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.ellipse(this.x, this.y, 3.2, 9, 0, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = this.col.core;
            ctx.beginPath(); ctx.arc(this.x, this.y - 3, 2, 0, Math.PI * 2); ctx.fill();
            // 出膛闪光：前 3 帧
            if (this.age < 3) {
                const k = 1 - this.age / 3;
                ctx.globalAlpha = 0.8 * k;
                ctx.fillStyle = this.col.core;
                ctx.beginPath(); ctx.arc(this.x, this.y + 4, 4 + k * 4, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
            }
            ctx.restore();
        }
        getBounds() { return { x: this.x - 4, y: this.y - 4, w: 8, h: 8 }; }
    }

    return {
        SatBullet,

        clearSats() { _sats = []; _pending = []; },

        update(dt, player, enemies, pw) {
            _pw = pw || 1;
            _px = player.x; _py = player.y;

            const count = _satCount(_pw);
            while (_sats.length < count) {
                _sats.push({ timer: Math.round((_sats.length * SHOT_INT) / count) });
            }
            while (_sats.length > count) _sats.pop();

            _angle += 0.028 * dt;
            const col = _color(_pw);
            const dmg = 1.6 + _pw * 0.05;

            for (let i = 0; i < _sats.length; i++) {
                const sat = _sats[i];
                const a   = _angle + (Math.PI * 2 / _sats.length) * i;
                sat.x = player.x + Math.cos(a) * ORBIT_R;
                sat.y = player.y + Math.sin(a) * ORBIT_R;
                sat.timer++;
                if (sat.flash > 0) sat.flash -= dt;
                if (sat.timer >= SHOT_INT && _ammo > 0) {
                    sat.timer = 0;
                    sat.flash = 4;   // 发射炮口闪光（持续 4 帧）
                    _ammo--;
                    _pending.push(new SatBullet(sat.x, sat.y - 8, col, dmg));
                }
            }
        },

        collectBullets() { const b = _pending; _pending = []; return b; },

        draw(ctx, fc) {
            if (_sats.length === 0) return;
            const col = _color(_pw);
            ctx.save();
            // Faint orbit ring
            ctx.strokeStyle = col.glow;
            ctx.globalAlpha = 0.18;
            ctx.lineWidth   = 1;
            ctx.setLineDash([4, 6]);
            ctx.beginPath(); ctx.arc(_px, _py, ORBIT_R, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]); ctx.globalAlpha = 1;

            for (const sat of _sats) {
                if (sat.x === undefined) continue;
                ctx.shadowColor = col.glow; ctx.shadowBlur = 14;
                const g = ctx.createRadialGradient(sat.x, sat.y, 0, sat.x, sat.y, 10);
                g.addColorStop(0,   col.core);
                g.addColorStop(0.4, col.sat);
                g.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(sat.x, sat.y, 10, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                // 旋转光环：两段缺口弧反向旋转
                ctx.strokeStyle = col.sat;
                ctx.lineWidth   = 1.4;
                ctx.globalAlpha = 0.75;
                const ra = fc * 0.09;
                ctx.beginPath(); ctx.arc(sat.x, sat.y, 7.5, ra, ra + Math.PI * 0.8); ctx.stroke();
                ctx.beginPath(); ctx.arc(sat.x, sat.y, 7.5, ra + Math.PI, ra + Math.PI * 1.8); ctx.stroke();
                // 充能指示：外圈弧随充能进度增长，满圈即发射
                const chg = Math.min(1, sat.timer / SHOT_INT);
                ctx.strokeStyle = col.core;
                ctx.lineWidth   = 1.8;
                ctx.globalAlpha = 0.5 + chg * 0.5;
                ctx.beginPath();
                ctx.arc(sat.x, sat.y, 11.5, -Math.PI / 2, -Math.PI / 2 + chg * Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.fillStyle  = '#fff';
                ctx.beginPath(); ctx.arc(sat.x, sat.y, 2.5, 0, Math.PI * 2); ctx.fill();
                // 发射炮口闪光
                if (sat.flash > 0) {
                    const k = sat.flash / 4;
                    ctx.globalAlpha = 0.85 * k;
                    const fg = ctx.createRadialGradient(sat.x, sat.y - 8, 0, sat.x, sat.y - 8, 9 * k + 3);
                    fg.addColorStop(0, '#fff');
                    fg.addColorStop(0.4, col.core);
                    fg.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = fg;
                    ctx.beginPath(); ctx.arc(sat.x, sat.y - 8, 9 * k + 3, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }
            ctx.restore();
        },

        isExhausted() { return _ammo <= 0; },
        getAmmo()     { return _ammo; },
        getMaxAmmo()  { return MAX_AMMO; },
        reset()       { _ammo = MAX_AMMO; _sats = []; _angle = 0; _pending = []; },
        refill()      { _ammo = Math.min(MAX_AMMO, _ammo + MAX_AMMO); }
    };
})();
