var EnemyBullet = (() => {
    // ── 精灵缓存：normal / big / shard / flare / star 按 (type|color|radius) 预渲染一次，
    //    运行时仅 drawImage，省去每弹每帧的渐变创建（高峰 300+ 发时是最热路径）──
    const _sprites = new Map();

    function _getSprite(type, color, radius) {
        const r   = Math.round(radius * 2) / 2;   // 量化到 0.5px，控制缓存键数量
        const key = type + '|' + color + '|' + r;
        let s = _sprites.get(key);
        if (s) return s;

        const cv = document.createElement('canvas');
        const c  = cv.getContext('2d');
        if (type === 'big') {
            const R = Math.ceil(r * 2.8) + 2;
            cv.width = cv.height = R * 2;
            const g = c.createRadialGradient(R, R, 1, R, R, r * 2.8);
            g.addColorStop(0,    '#fdd');
            g.addColorStop(0.35, color);
            g.addColorStop(1,    'rgba(200,0,0,0)');
            c.fillStyle = g;
            c.beginPath(); c.arc(R, R, r * 2.8, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#fff';
            c.beginPath(); c.arc(R, R, r * 0.5, 0, Math.PI * 2); c.fill();
            s = { cv, ox: R, oy: R };
        } else if (type === 'shard') {
            // 棱面水晶弹：细长菱形 + 白色内核 + 侧棱高光，按速度方向旋转
            const len = r * 3.2, hw = r * 1.3;
            const w = Math.ceil(hw * 2) + 6, h = Math.ceil(len * 2) + 6;
            cv.width = w; cv.height = h;
            const cx = w / 2, cy = h / 2;
            c.shadowColor = color; c.shadowBlur = 5;
            const g = c.createLinearGradient(0, cy - len, 0, cy + len);
            g.addColorStop(0, '#fff'); g.addColorStop(0.35, color); g.addColorStop(1, color);
            c.fillStyle = g;
            c.beginPath();
            c.moveTo(cx, cy - len); c.lineTo(cx + hw, cy);
            c.lineTo(cx, cy + len); c.lineTo(cx - hw, cy);
            c.closePath(); c.fill();
            c.shadowBlur = 0;
            // 内核
            c.fillStyle = 'rgba(255,255,255,0.9)';
            c.beginPath();
            c.moveTo(cx, cy - len * 0.55); c.lineTo(cx + hw * 0.4, cy);
            c.lineTo(cx, cy + len * 0.55); c.lineTo(cx - hw * 0.4, cy);
            c.closePath(); c.fill();
            // 侧棱
            c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 0.7;
            c.beginPath(); c.moveTo(cx, cy - len); c.lineTo(cx, cy + len); c.stroke();
            s = { cv, ox: cx, oy: cy };
        } else if (type === 'flare') {
            // 彗星火焰弹：亮白头部在上、拖尾在下（旋转约定：精灵 -y 轴对准速度方向）
            const tail = r * 5.0, hw = r * 1.7;
            const w = Math.ceil(hw * 2) + 6, h = Math.ceil(tail + r * 2.2) + 6;
            cv.width = w; cv.height = h;
            const cx = w / 2, hy = r * 1.8 + 3;   // 头部圆心
            // 拖尾
            const tg = c.createLinearGradient(0, hy + tail, 0, hy);
            tg.addColorStop(0, 'rgba(255,120,0,0)');
            tg.addColorStop(0.55, color);
            tg.addColorStop(1, '#ffd');
            c.fillStyle = tg;
            c.beginPath();
            c.moveTo(cx, hy + tail);
            c.quadraticCurveTo(cx + hw, hy + tail * 0.35, cx + hw * 0.55, hy);
            c.lineTo(cx - hw * 0.55, hy);
            c.quadraticCurveTo(cx - hw, hy + tail * 0.35, cx, hy + tail);
            c.closePath(); c.fill();
            // 头部
            const hg = c.createRadialGradient(cx, hy, 0, cx, hy, r * 1.6);
            hg.addColorStop(0, '#fff');
            hg.addColorStop(0.45, color);
            hg.addColorStop(1, 'rgba(255,80,0,0)');
            c.fillStyle = hg;
            c.beginPath(); c.arc(cx, hy, r * 1.6, 0, Math.PI * 2); c.fill();
            s = { cv, ox: cx, oy: hy };
        } else if (type === 'star') {
            // 四芒星弹：旋转的星形光刃（绘制时按 this.rot 自旋）
            const R = Math.ceil(r * 2.6) + 3;
            cv.width = cv.height = R * 2;
            c.shadowColor = color; c.shadowBlur = 6;
            c.fillStyle = color;
            c.beginPath();
            for (let i = 0; i < 4; i++) {
                const a  = (Math.PI / 2) * i;
                const am = a + Math.PI / 4;
                c.lineTo(R + Math.cos(a)  * r * 2.4, R + Math.sin(a)  * r * 2.4);
                c.lineTo(R + Math.cos(am) * r * 0.8, R + Math.sin(am) * r * 0.8);
            }
            c.closePath(); c.fill();
            c.shadowBlur = 0;
            c.fillStyle = '#fff';
            c.beginPath(); c.arc(R, R, r * 0.65, 0, Math.PI * 2); c.fill();
            s = { cv, ox: R, oy: R };
        } else {
            // 竖向弹体，绘制时按速度方向旋转
            const len = r * 2.6;
            const w   = Math.ceil(r * 1.5) + 4;
            const h   = Math.ceil(len * 2) + 4;
            cv.width = w; cv.height = h;
            const cx = w / 2, cy = h / 2;
            const g = c.createLinearGradient(0, cy - len, 0, cy + len);
            g.addColorStop(0,    'rgba(255,100,100,0)');
            g.addColorStop(0.25, color);
            g.addColorStop(0.5,  '#fcc');
            g.addColorStop(0.75, color);
            g.addColorStop(1,    'rgba(255,100,100,0)');
            c.fillStyle = g;
            c.fillRect(cx - r * 0.75, cy - len, r * 1.5, len * 2);
            c.fillStyle = '#fee';
            c.beginPath(); c.arc(cx, cy, r * 0.55, 0, Math.PI * 2); c.fill();
            s = { cv, ox: cx, oy: cy };
        }
        _sprites.set(key, s);
        return s;
    }

    class EnemyBullet {
        constructor(x, y, vx, vy, opts = {}) {
            this.x      = x; this.y = y;
            this.vx     = vx; this.vy = vy;
            this.radius = opts.radius || 4;
            this.color  = opts.color  || '#f44';
            this.type   = opts.type   || 'normal'; // 'normal'|'big'|'laser'|'shard'|'flare'|'star'|'neutron_pulse'|'neutron_orb'
            this.alive  = true;
            this.damage = opts.damage || 1;

            // ── 行为扩展（默认全 0/false：普通弹只付出几次假值判断）──────────
            this.accel      = opts.accel || 0;          // 沿航向加速度 px/frame²（负值=减速）
            this.minSpeed   = opts.minSpeed !== undefined ? opts.minSpeed : 0.35;
            this.maxSpeed   = opts.maxSpeed || 13;
            this.turn       = opts.turn || 0;           // 恒定角速度 rad/frame → 弧线弹
            this.homing     = opts.homing || 0;         // 追踪剩余帧数（>0 时朝玩家转向）
            this.homingTurn = opts.homingTurn || 0.035; // 追踪转向速率 rad/frame
            this.waveAmp    = opts.waveAmp || 0;        // 蛇形横摆幅度 px
            this.waveFreq   = opts.waveFreq || 0.15;    // 蛇形频率 rad/frame
            this.wavePhase  = opts.wavePhase || 0;
            this.spin       = opts.spin || 0;           // star/shard 视觉自旋 rad/frame
            this.rot        = opts.rot !== undefined ? opts.rot : Math.random() * Math.PI * 2;
            this.life       = opts.life || 0;           // >0：存活帧数耗尽自毁（弧线/追踪弹防滞留）
        }
        update(dt) {
            if (this.homing > 0) {
                this.homing -= dt;
                if (typeof Player !== 'undefined') {
                    const p    = Player.getPos();
                    const cur  = Math.atan2(this.vy, this.vx);
                    let   diff = Math.atan2(p.y - this.y, p.x - this.x) - cur;
                    while (diff >  Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    const step = Math.max(-this.homingTurn * dt, Math.min(this.homingTurn * dt, diff));
                    const spd  = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                    const a    = cur + step;
                    this.vx = Math.cos(a) * spd; this.vy = Math.sin(a) * spd;
                }
            }
            if (this.turn) {
                const a   = Math.atan2(this.vy, this.vx) + this.turn * dt;
                const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                this.vx = Math.cos(a) * spd; this.vy = Math.sin(a) * spd;
            }
            if (this.accel) {
                const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 0.0001;
                const ns  = Math.max(this.minSpeed, Math.min(this.maxSpeed, spd + this.accel * dt));
                const k   = ns / spd;
                this.vx *= k; this.vy *= k;
            }
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            if (this.waveAmp) {
                this.wavePhase += this.waveFreq * dt;
                const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 1;
                const off = Math.cos(this.wavePhase) * this.waveAmp * this.waveFreq * dt;
                this.x += (-this.vy / spd) * off;
                this.y += ( this.vx / spd) * off;
            }
            if (this.spin) this.rot += this.spin * dt;
            if (this.life > 0) {
                this.life -= dt;
                if (this.life <= 0) { this.alive = false; return; }
            }
            // 弧线/追踪弹可能折返，给更宽的出界余量
            const m = (this.homing > 0 || this.turn) ? 100 : 40;
            if (this.y > Renderer.H + m || this.y < -m - 10 ||
                this.x < -m  || this.x > Renderer.W + m)
                this.alive = false;
        }
        draw(ctx) {
            const r = this.radius;
            if (this.type === 'big') {
                const s = _getSprite('big', this.color, r);
                ctx.drawImage(s.cv, this.x - s.ox, this.y - s.oy);
            } else if (this.type === 'shard' || this.type === 'flare') {
                // 速度朝向的缓存精灵（精灵头朝下绘制 → 旋转角 = atan2 - π/2 再补 π）
                const s = _getSprite(this.type, this.color, r);
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
                ctx.drawImage(s.cv, -s.ox, -s.oy);
                ctx.restore();
            } else if (this.type === 'star') {
                const s = _getSprite('star', this.color, r);
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.rot);
                ctx.drawImage(s.cv, -s.ox, -s.oy);
                ctx.restore();
            } else if (this.type === 'laser') {
                const ang = Math.atan2(this.vy, this.vx);
                ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang + Math.PI / 2);
                const hl = 46;
                ctx.shadowColor = '#0ef'; ctx.shadowBlur = 6;
                const og = ctx.createLinearGradient(-r * 1.8, 0, r * 1.8, 0);
                og.addColorStop(0,   'rgba(0,220,255,0)');
                og.addColorStop(0.3, 'rgba(0,200,255,0.38)');
                og.addColorStop(0.5, 'rgba(160,240,255,0.55)');
                og.addColorStop(0.7, 'rgba(0,200,255,0.38)');
                og.addColorStop(1,   'rgba(0,220,255,0)');
                ctx.fillStyle = og;
                ctx.fillRect(-r * 1.8, -hl, r * 3.6, hl * 2);
                ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
                ctx.fillStyle = 'rgba(220,250,255,0.92)';
                ctx.fillRect(-r * 0.3, -hl * 0.95, r * 0.6, hl * 1.9);
                ctx.shadowBlur = 0;
                ctx.restore();
            } else if (this.type === 'neutron_pulse') {
                const ang = Math.atan2(this.vy, this.vx);
                ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang + Math.PI / 2);
                const hl = 42;
                ctx.shadowColor = '#80f'; ctx.shadowBlur = 8;
                // purple corona
                const pg = ctx.createLinearGradient(-r * 2.4, 0, r * 2.4, 0);
                pg.addColorStop(0,    'rgba(50,0,100,0)');
                pg.addColorStop(0.22, 'rgba(110,0,200,0.50)');
                pg.addColorStop(0.5,  'rgba(160,20,240,0.68)');
                pg.addColorStop(0.78, 'rgba(110,0,200,0.50)');
                pg.addColorStop(1,    'rgba(50,0,100,0)');
                ctx.fillStyle = pg;
                ctx.fillRect(-r * 2.4, -hl, r * 4.8, hl * 2);
                // dark core
                ctx.fillStyle = 'rgba(5,0,22,0.90)';
                ctx.fillRect(-r * 0.55, -hl * 0.92, r * 1.1, hl * 1.84);
                // crackling lightning arcs (randomised each frame → flickering)
                for (let k = 0; k < 4; k++) {
                    const side = (k % 2 === 0 ? 1 : -1) * (r * 1.1 + Math.random() * r * 0.9);
                    ctx.lineWidth   = 0.45 + Math.random() * 0.65;
                    ctx.strokeStyle = `rgba(188,80,255,${0.40 + Math.random() * 0.45})`;
                    ctx.beginPath();
                    const sy = -hl * 0.82;
                    ctx.moveTo(side + (Math.random() - 0.5) * r * 0.8, sy);
                    const steps = 4 + Math.floor(Math.random() * 3);
                    for (let s = 1; s <= steps; s++) {
                        ctx.lineTo(side + (Math.random() - 0.5) * r * 2.0,
                                   sy + (hl * 1.64 / steps) * s);
                    }
                    ctx.stroke();
                }
                // bright center filament
                ctx.strokeStyle = 'rgba(230,170,255,0.82)';
                ctx.lineWidth = 0.7;
                ctx.beginPath(); ctx.moveTo(0, -hl * 0.90); ctx.lineTo(0, hl * 0.90); ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.restore();
            } else if (this.type === 'neutron_orb') {
                ctx.shadowColor = '#90f'; ctx.shadowBlur = 8;
                const nr = r * 2.5;
                const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, nr);
                g.addColorStop(0,    'rgba(255,255,255,0.96)');
                g.addColorStop(0.20, 'rgba(210,130,255,0.88)');
                g.addColorStop(0.45, 'rgba(100,0,210,0.60)');
                g.addColorStop(0.70, 'rgba(28,0,90,0.28)');
                g.addColorStop(1,    'rgba(0,0,30,0)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(this.x, this.y, nr, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = 'rgba(255,230,255,0.95)';
                ctx.beginPath(); ctx.arc(this.x, this.y, r * 0.4, 0, Math.PI * 2); ctx.fill();
            } else {
                // Oriented normal bullet — 预渲染精灵 + 旋转贴图
                const s = _getSprite('normal', this.color, r);
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
                ctx.drawImage(s.cv, -s.ox, -s.oy);
                ctx.restore();
            }
        }
        getBounds() {
            return { x: this.x - this.radius, y: this.y - this.radius,
                     w: this.radius * 2,      h: this.radius * 2 };
        }
    }
    return EnemyBullet;
})();
