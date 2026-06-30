var NormalGun = (() => {

    // Spectrum color: Lv 1-20 = default cyan, Lv 21-100 red→violet, Lv 101+ loops
    function _color(pw) {
        if (pw <= 20) return { main: '#7ef', core: '#fff', glow: '#4af' };
        const t   = Math.min(1, (pw - 21) / 79);   // 0 at Lv21 → 1 at Lv100
        const hue = Math.round(t * 270);             // 0=red … 270=violet
        return {
            main: `hsl(${hue},100%,65%)`,
            core: `hsl(${hue},60%,92%)`,
            glow: `hsl(${hue},100%,50%)`
        };
    }

    // 火力分级 → 弹形进化档（数值不变，仅视觉）：
    // T1 光珠 → T2 加侧鳍 → T3 锐针尖 → T4 燕尾刃 → T5 光谱伴流线 → T6 加重泛光 → T7 幻影侧翼
    function _tier(pw) {
        return pw >= 76 ? 7 : pw >= 51 ? 6 : pw >= 21 ? 5 : pw >= 16 ? 4 : pw >= 11 ? 3 : pw >= 6 ? 2 : 1;
    }

    // ── 精灵缓存：自机弹随火力可达每帧 200+ 发，每弹每帧建渐变 + shadowBlur
    //    是大头开销。按 (颜色|尺寸|长度档|形态档) 预渲染（辉光烘焙进精灵）。──
    const _sprites = new Map();
    const _SPRITE_CAP = 400;   // 颜色随等级渐变会产生新键，超限整体清空防泄漏

    function _bulletSprite(col, sz, len, tier) {
        const szQ  = Math.round(sz * 2) / 2;
        const lenQ = Math.round(len / 6) * 6;
        const key  = col.main + '|' + szQ + '|' + lenQ + '|' + tier;
        let s = _sprites.get(key);
        if (s) return s;
        if (_sprites.size >= _SPRITE_CAP) _sprites.clear();

        const w  = Math.ceil(szQ * 4) + 18;        // 留出辉光与侧鳍余量
        const h  = Math.ceil(lenQ * 1.5) + 18;
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const c  = cv.getContext('2d');
        const cx = w / 2, cy = h / 2;

        c.shadowColor = col.glow;
        c.shadowBlur  = tier >= 7 ? 14 : tier >= 6 ? 11 : 8;   // 高阶档加重泛光
        const g = c.createLinearGradient(0, cy - lenQ * 0.55, 0, cy + lenQ * 0.45);
        g.addColorStop(0,   'rgba(0,0,0,0)');
        g.addColorStop(0.2, col.main);
        g.addColorStop(0.5, col.core);
        g.addColorStop(0.8, col.main);
        g.addColorStop(1,   'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(cx, cy - lenQ * 0.05, szQ * 0.42, lenQ * 0.52, 0, 0, Math.PI * 2);
        c.fill();

        // T3+：锐利针尖（覆盖在椭圆顶端，让弹头更"扎"）
        if (tier >= 3) {
            c.fillStyle = col.core;
            c.beginPath();
            c.moveTo(cx, cy - lenQ * 0.72);
            c.lineTo(cx + szQ * 0.34, cy - lenQ * 0.28);
            c.lineTo(cx - szQ * 0.34, cy - lenQ * 0.28);
            c.closePath();
            c.fill();
        }
        // T2+：尾部侧鳍（小三角，随档位变长）
        if (tier >= 2) {
            const finL = lenQ * (tier >= 4 ? 0.34 : 0.22);
            c.fillStyle = col.main;
            c.globalAlpha = 0.85;
            c.beginPath();
            c.moveTo(cx - szQ * 0.30, cy + lenQ * 0.05);
            c.lineTo(cx - szQ * 1.05, cy + lenQ * 0.05 + finL);
            c.lineTo(cx - szQ * 0.30, cy + lenQ * 0.30);
            c.closePath();
            c.moveTo(cx + szQ * 0.30, cy + lenQ * 0.05);
            c.lineTo(cx + szQ * 1.05, cy + lenQ * 0.05 + finL);
            c.lineTo(cx + szQ * 0.30, cy + lenQ * 0.30);
            c.closePath();
            c.fill();
            c.globalAlpha = 1;
        }
        c.shadowBlur = 0;
        // T5：两侧伴流光线（光谱段专属）
        if (tier >= 5) {
            c.strokeStyle = col.main;
            c.globalAlpha = 0.55;
            c.lineWidth   = 1;
            c.beginPath();
            c.moveTo(cx - szQ * 0.95, cy - lenQ * 0.30); c.lineTo(cx - szQ * 0.95, cy + lenQ * 0.42);
            c.moveTo(cx + szQ * 0.95, cy - lenQ * 0.30); c.lineTo(cx + szQ * 0.95, cy + lenQ * 0.42);
            c.stroke();
            c.globalAlpha = 1;
        }
        // T7：两道半透明幻影侧翼（速度与威压的视觉化）
        if (tier >= 7) {
            c.globalAlpha = 0.35;
            c.fillStyle   = col.core;
            c.beginPath();
            c.moveTo(cx - szQ * 1.25, cy - lenQ * 0.22);
            c.lineTo(cx - szQ * 0.70, cy + lenQ * 0.28);
            c.lineTo(cx - szQ * 1.05, cy + lenQ * 0.34);
            c.closePath();
            c.moveTo(cx + szQ * 1.25, cy - lenQ * 0.22);
            c.lineTo(cx + szQ * 0.70, cy + lenQ * 0.28);
            c.lineTo(cx + szQ * 1.05, cy + lenQ * 0.34);
            c.closePath();
            c.fill();
            c.globalAlpha = 1;
        }
        c.fillStyle  = col.core;
        c.fillRect(cx - szQ * 0.14, cy - lenQ * 0.42, szQ * 0.28, lenQ * 0.72);

        s = { cv, ox: cx, oy: cy };
        _sprites.set(key, s);
        return s;
    }

    // 出膛闪光精灵（按颜色缓存一次）
    function _flashSprite(col) {
        const key = 'fl|' + col.main;
        let s = _sprites.get(key);
        if (s) return s;
        const cv = document.createElement('canvas');
        cv.width = 28; cv.height = 28;
        const c = cv.getContext('2d');
        const g = c.createRadialGradient(14, 14, 0, 14, 14, 13);
        g.addColorStop(0,   '#fff');
        g.addColorStop(0.3, col.core);
        g.addColorStop(0.65, col.main);
        g.addColorStop(1,   'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(14, 14, 13, 0, Math.PI * 2); c.fill();
        s = { cv, ox: 14, oy: 14 };
        _sprites.set(key, s);
        return s;
    }

    class NormalBullet extends PlayerBulletBase {
        constructor(x, y, vx, vy, opts = {}) {
            super(x, y, { damage: opts.damage || 1, piercing: false });
            this.vx   = vx;
            this.vy   = vy;
            this.ax   = opts.ax  || 0;   // horizontal curve acceleration
            this.col  = opts.col || { main: '#7ef', core: '#fff', glow: '#4af' };
            this.sz   = opts.sz  || 4;
            this.tier = opts.tier || 1;
            this.age  = 0;
        }
        update(dt) {
            this.age += dt;
            this.vx += this.ax * dt;
            this.x  += this.vx * dt;
            this.y  += this.vy * dt;
            if (this.isOffscreen()) this.alive = false;
        }
        draw(ctx) {
            const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            const len = this.sz * 2.5 + spd * 0.55;
            const s   = _bulletSprite(this.col, this.sz, len, this.tier);
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
            ctx.drawImage(s.cv, -s.ox, -s.oy);
            // 出膛闪光：离开炮口的前 3 帧叠一个衰减光斑
            if (this.age < 3) {
                const f  = _flashSprite(this.col);
                const k  = 1 - this.age / 3;
                ctx.globalAlpha = 0.85 * k;
                const sc = 0.7 + k * 0.6;
                ctx.drawImage(f.cv, -f.ox * sc, -f.oy * sc + len * 0.3, 28 * sc, 28 * sc);
                ctx.globalAlpha = 1;
            }
            ctx.restore();
        }
        getBounds() {
            return { x: this.x - this.sz * 0.5, y: this.y - 10, w: this.sz, h: 20 };
        }
    }

    return {
        NormalBullet,

        shoot(player) {
            const pw  = player.powerLevel;
            const px  = player.x;
            const py  = player.y - 12;
            const col  = _color(pw);
            const tier = _tier(pw);
            const spd  = Math.min(20, 12 + pw * 0.16);
            const sz   = Math.min(6.5, 3 + pw * 0.07);

            // B(offsetX, vx, vy, curveAx)
            function B(ox, vx, vy, ax) {
                return new NormalBullet(px + ox, py, vx, vy, { col, sz, tier, ax: ax || 0 });
            }

            const bullets = [];

            // ── TIER 1 Lv 1-5: straight shots (column grows wider) ────────
            // Lv 1: single center
            bullets.push(B(0, 0, -spd));
            // Lv 2: tight pair
            if (pw >= 2) { bullets.push(B(-7, 0, -spd)); bullets.push(B(7, 0, -spd)); }
            // Lv 3: wider pair
            if (pw >= 3) { bullets.push(B(-15, 0, -spd * 0.97)); bullets.push(B(15, 0, -spd * 0.97)); }
            // Lv 4: even wider
            if (pw >= 4) { bullets.push(B(-24, 0, -spd * 0.94)); bullets.push(B(24, 0, -spd * 0.94)); }
            // Lv 5: outermost straight pair
            if (pw >= 5) { bullets.push(B(-34, 0, -spd * 0.90)); bullets.push(B(34, 0, -spd * 0.90)); }

            // ── TIER 2 Lv 6-10: diagonal fan (adds angled shots) ─────────
            if (pw >= 6)  { bullets.push(B(-12, -3, -spd * 0.98)); bullets.push(B(12, 3, -spd * 0.98)); }
            if (pw >= 7)  { bullets.push(B(-20, -6, -spd * 0.95)); bullets.push(B(20, 6, -spd * 0.95)); }
            if (pw >= 8)  { bullets.push(B(-29, -10, -spd * 0.91)); bullets.push(B(29, 10, -spd * 0.91)); }
            if (pw >= 9)  { bullets.push(B(-38, -14, -spd * 0.87)); bullets.push(B(38, 14, -spd * 0.87)); }
            if (pw >= 10) { bullets.push(B(-47, -18, -spd * 0.83)); bullets.push(B(47, 18, -spd * 0.83)); }

            // ── TIER 3 Lv 11-15: outward-curving shots ────────────────────
            // ax > 0 means curving right, ax < 0 curving left
            if (pw >= 11) { bullets.push(B(-10, -1, -spd * 0.97, -0.10)); bullets.push(B(10, 1, -spd * 0.97, 0.10)); }
            if (pw >= 12) { bullets.push(B(-19, -1, -spd * 0.95, -0.14)); bullets.push(B(19, 1, -spd * 0.95, 0.14)); }
            if (pw >= 13) { bullets.push(B(-28, 0, -spd * 0.93, -0.17)); bullets.push(B(28, 0, -spd * 0.93, 0.17)); }
            // Lv 14-15: inward-then-out curves (start angled in, acceleration takes them out)
            if (pw >= 14) { bullets.push(B(-38, 4, -spd * 0.91, -0.20)); bullets.push(B(38, -4, -spd * 0.91, 0.20)); }
            if (pw >= 15) { bullets.push(B(-47, 6, -spd * 0.88, -0.23)); bullets.push(B(47, -6, -spd * 0.88, 0.23)); }

            // ── TIER 4 Lv 16-20: dense wave (mixed straight+curve fill) ───
            if (pw >= 16) { bullets.push(B(-16, -2, -spd * 0.97, -0.08)); bullets.push(B(16, 2, -spd * 0.97, 0.08)); }
            if (pw >= 17) { bullets.push(B(-25, 5, -spd * 0.94, -0.16)); bullets.push(B(25, -5, -spd * 0.94, 0.16)); }
            if (pw >= 18) { bullets.push(B(-54, -19, -spd * 0.80)); bullets.push(B(54, 19, -spd * 0.80)); }
            if (pw >= 19) { bullets.push(B(0, 0, -spd * 1.14, 0)); }  // ultra-fast center
            if (pw >= 20) { bullets.push(B(-35, 7, -spd * 0.91, -0.24)); bullets.push(B(35, -7, -spd * 0.91, 0.24)); }

            // ── TIER 5 Lv 21+: spectrum color + gradual density add ───────
            if (pw >= 25) { bullets.push(B(-60, -20, -spd * 0.78)); bullets.push(B(60, 20, -spd * 0.78)); }
            if (pw >= 30) { bullets.push(B(-42, 8, -spd * 0.89, -0.26)); bullets.push(B(42, -8, -spd * 0.89, 0.26)); }
            if (pw >= 35) { bullets.push(B(-66, -21, -spd * 0.76)); bullets.push(B(66, 21, -spd * 0.76)); }
            if (pw >= 40) { bullets.push(B(-50, 9, -spd * 0.87, -0.28)); bullets.push(B(50, -9, -spd * 0.87, 0.28)); }
            if (pw >= 45) { bullets.push(B(0, 0, -spd * 1.18, 0)); }
            if (pw >= 50) { bullets.push(B(-72, -22, -spd * 0.74)); bullets.push(B(72, 22, -spd * 0.74)); }
            if (pw >= 60) { bullets.push(B(-58, 10, -spd * 0.85, -0.30)); bullets.push(B(58, -10, -spd * 0.85, 0.30)); }
            if (pw >= 70) { bullets.push(B(-78, -23, -spd * 0.72)); bullets.push(B(78, 23, -spd * 0.72)); }
            if (pw >= 80) { bullets.push(B(0, 0, -spd * 1.22, 0)); }
            if (pw >= 90) { bullets.push(B(-64, 11, -spd * 0.83, -0.32)); bullets.push(B(64, -11, -spd * 0.83, 0.32)); }
            if (pw >= 100){ bullets.push(B(-84, -24, -spd * 0.70)); bullets.push(B(84, 24, -spd * 0.70)); }

            return bullets;
        }
    };
})();
