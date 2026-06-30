var LightningGun = (() => {
    const MAX_AMMO = 32;   // 22→32：延长闪电链留用窗口
    let _ammo = MAX_AMMO;
    let _fireTimer = 0;

    function _color(pw) {
        if (pw <= 20) return { main: '#fff8a0', core: '#fff', glow: '#ffe040' };
        const hue = Math.round(50 + ((Math.min(pw, 100) - 21) / 79) * 60); // 50→110 yellow-green
        return { main: `hsl(${hue},100%,80%)`, core: '#fff', glow: `hsl(${hue},100%,65%)` };
    }

    // 中点位移分形折线：每帧重新生成 → 天然电闪抖动，无需存历史轨迹
    function _frac(x1, y1, x2, y2, iters, disp) {
        let pts = [[x1, y1], [x2, y2]];
        for (let d = 0; d < iters; d++) {
            const next = [pts[0]];
            for (let i = 0; i < pts.length - 1; i++) {
                const mx = (pts[i][0] + pts[i + 1][0]) * 0.5 + (Math.random() - 0.5) * disp;
                const my = (pts[i][1] + pts[i + 1][1]) * 0.5 + (Math.random() - 0.5) * disp;
                next.push([mx, my], pts[i + 1]);
            }
            pts = next;
            disp *= 0.55;
        }
        return pts;
    }

    function _strokePts(ctx, pts) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
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
            this.age          = 0;
            this.retarget     = 12;     // 重新锁敌倒计时（帧驱动，帧率无关）
            this._sparked     = false;  // 接近目标时只迸一次电花
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
            // 周期重锁：用倒计时而非 age%12（连续浮点取模会跳过命中窗口，导致漏锁/乱飞）
            this.retarget -= dt;
            if (this.retarget <= 0) { this.target = this._pick(enemies); this.retarget = 12; }
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
            // 命中端点电花：贴近目标的一瞬迸出火花（每弹一次）
            if (!this._sparked && this.target && this.target.alive) {
                const dx = this.target.x - this.x, dy = this.target.y - this.y;
                if (dx * dx + dy * dy < 22 * 22) {
                    this._sparked = true;
                    ParticleSystem.spawn(this.target.x, this.target.y, {
                        count: 4, speed: 5, life: 12, size: 1.8,
                        shape: 'spark', drag: 0.92,
                        colors: [this.col.glow, this.col.main, '#fff']
                    });
                }
            }
            if (this.age > 90 || this.isOffscreen()) this.alive = false;
        }

        draw(ctx) {
            // 电弧尾迹：沿速度反方向的分形折线（每帧重生 → 自然抖动），带一条分叉
            const spd  = this.speed;
            const len  = 8 + spd * 2.6;
            const tx   = this.x - this.vx / spd * len;
            const ty   = this.y - this.vy / spd * len;
            const pts  = _frac(this.x, this.y, tx, ty, 3, 9);
            ctx.shadowColor = this.col.glow; ctx.shadowBlur = 10;
            // 外层辉光弧
            ctx.strokeStyle = this.col.glow;
            ctx.lineWidth   = 2.2;
            ctx.globalAlpha = 0.45;
            _strokePts(ctx, pts);
            // 白亮主脊
            ctx.strokeStyle = this.col.core;
            ctx.lineWidth   = 1;
            ctx.globalAlpha = 0.9;
            _strokePts(ctx, pts);
            // 一级分叉：从折线中段斜出一条短支（递归分形一层）
            const mid  = pts[Math.floor(pts.length / 2)];
            const bAng = Math.atan2(ty - this.y, tx - this.x) + (Math.random() < 0.5 ? 0.8 : -0.8);
            const bLen = len * 0.4;
            ctx.strokeStyle = this.col.main;
            ctx.lineWidth   = 1;
            ctx.globalAlpha = 0.55;
            _strokePts(ctx, _frac(mid[0], mid[1],
                mid[0] + Math.cos(bAng) * bLen, mid[1] + Math.sin(bAng) * bLen, 2, 6));
            ctx.shadowBlur = 0; ctx.globalAlpha = 1;

            // Bolt head（箭头形电芒 + 出膛光斑）
            const ang = Math.atan2(this.vy, this.vx);
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(ang + Math.PI / 2);
            const g = ctx.createLinearGradient(0, -15, 0, 6);
            g.addColorStop(0,   this.col.core);
            g.addColorStop(0.4, this.col.main);
            g.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, -16); ctx.lineTo(3, -6); ctx.lineTo(1.6, 5);
            ctx.lineTo(-1.6, 5); ctx.lineTo(-3, -6);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillRect(-1, -13, 2, 14);
            if (this.age < 3) {
                const k = 1 - this.age / 3;
                ctx.globalAlpha = 0.8 * k;
                ctx.fillStyle = this.col.core;
                ctx.beginPath(); ctx.arc(0, 0, 5 + k * 6, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
            }
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
