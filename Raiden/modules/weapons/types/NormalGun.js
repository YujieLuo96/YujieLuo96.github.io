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

    class NormalBullet extends PlayerBulletBase {
        constructor(x, y, vx, vy, opts = {}) {
            super(x, y, { damage: opts.damage || 1, piercing: false });
            this.vx  = vx;
            this.vy  = vy;
            this.ax  = opts.ax  || 0;   // horizontal curve acceleration
            this.col = opts.col || { main: '#7ef', core: '#fff', glow: '#4af' };
            this.sz  = opts.sz  || 4;
        }
        update(dt) {
            this.vx += this.ax * dt;
            this.x  += this.vx * dt;
            this.y  += this.vy * dt;
            if (this.isOffscreen()) this.alive = false;
        }
        draw(ctx) {
            const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            const len = this.sz * 2.5 + spd * 0.55;
            const ang = Math.atan2(this.vy, this.vx);
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(ang + Math.PI / 2);
            ctx.shadowColor = this.col.glow;
            ctx.shadowBlur  = 8;
            // Outer glow body
            const g = ctx.createLinearGradient(0, -len * 0.55, 0, len * 0.45);
            g.addColorStop(0,   'rgba(0,0,0,0)');
            g.addColorStop(0.2, this.col.main);
            g.addColorStop(0.5, this.col.core);
            g.addColorStop(0.8, this.col.main);
            g.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(0, -len * 0.05, this.sz * 0.42, len * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
            // Bright core line
            ctx.shadowBlur = 0;
            ctx.fillStyle  = this.col.core;
            ctx.fillRect(-this.sz * 0.14, -len * 0.42, this.sz * 0.28, len * 0.72);
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
            const col = _color(pw);
            const spd = Math.min(20, 12 + pw * 0.16);
            const sz  = Math.min(6.5, 3 + pw * 0.07);

            // B(offsetX, vx, vy, curveAx)
            function B(ox, vx, vy, ax) {
                return new NormalBullet(px + ox, py, vx, vy, { col, sz, ax: ax || 0 });
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
