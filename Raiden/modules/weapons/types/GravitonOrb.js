var GravitonOrb = (() => {
    const MAX_AMMO = 8;
    let _ammo      = MAX_AMMO;
    let _fireTimer = 0;
    const INTERVAL = 55;

    function _arcPts(x1, y1, x2, y2, iters, disp) {
        let pts = [[x1, y1], [x2, y2]];
        for (let d = 0; d < iters; d++) {
            const next = [pts[0]];
            for (let i = 0; i < pts.length - 1; i++) {
                const mx = (pts[i][0] + pts[i+1][0]) * 0.5 + (Math.random() - 0.5) * disp;
                const my = (pts[i][1] + pts[i+1][1]) * 0.5 + (Math.random() - 0.5) * disp;
                next.push([mx, my], pts[i+1]);
            }
            pts = next;
            disp *= 0.52;
        }
        return pts;
    }

    class GravitonOrbBullet extends PlayerBulletBase {
        constructor(x, y, pw) {
            super(x, y, { damage: 0, piercing: true });
            // t is a continuous 0→1 factor; every property scales linearly with it
            const t = Math.min(Math.max((pw || 1) - 1, 0), 99) / 99;
            this.pw  = pw || 1;
            this.t   = t;   // store for draw()

            this.type         = 'graviton';
            this.needsEnemies = false;

            // Movement
            this.vy             = -(5.0 + t * 4.5);   // 5.0 … 9.5
            this.dragF          = 0.016;
            this.stopped        = false;
            this.stationaryTimer = 0;
            this.stationaryMax  = 150 + t * 200;       // 150 … 350 frames

            // Size (visual + collision)
            this.coreR = 14 + t * 22;                  // 14 … 36
            this.haloR = 38 + t * 46;                  // 38 … 84

            // Influence radii
            this.pullRadius   = 100 + t * 160;         // 100 … 260
            this.strikeRadius = 70  + t * 120;         // 70  … 190

            // Lightning stats
            this.strikeDmg      = 3  + t * 28;         // 3   … 31
            this.strikeInterval = 20 - t * 10;         // 20  … 10

            this.age            = 0;
            this.lightningTimer = 6;
            this.arcTargets     = [];
        }

        update(dt) {
            this.age += dt;

            if (!this.stopped) {
                this.y  += this.vy * dt;
                this.vy *= Math.pow(1 - this.dragF, dt);
                if (Math.abs(this.vy) < 0.06) {
                    this.vy      = 0;
                    this.stopped = true;
                }
            } else {
                this.stationaryTimer += dt;
                if (this.stationaryTimer >= this.stationaryMax) {
                    this.alive = false;
                    return;
                }
            }

            this.arcTargets = this.arcTargets
                .map(a => ({ x: a.x, y: a.y, life: a.life - dt }))
                .filter(a => a.life > 0);

            if (this.isOffscreen()) this.alive = false;
        }

        addArcTarget(x, y) {
            this.arcTargets.push({ x, y, life: 14 });
        }

        draw(ctx) {
            const { x, y, age } = this;
            const t      = this.t;          // 0 → 1
            const coreR  = this.coreR;
            const haloR  = this.haloR;

            // Fade in at birth; fade out at end of hover
            const birthFade  = Math.min(1, age / 20);
            const remainLife = this.stopped
                ? Math.max(0, this.stationaryMax - this.stationaryTimer)
                : Infinity;
            const deathFade  = Math.min(1, remainLife / 50);
            const fade       = birthFade * deathFade;

            const pulse   = 0.5 + Math.sin(age * 0.17) * 0.5;
            const pulse2  = 0.5 + Math.sin(age * 0.29 + 1.4) * 0.5;
            const flicker = 0.88 + Math.sin(age * 1.08) * 0.08 + Math.sin(age * 2.3) * 0.04;

            ctx.save();
            ctx.globalAlpha = fade;

            // ── Expanding gravity ripple rings ───────────────────────────
            // Ring line width and opacity both scale with t
            const rippleLW = 1.0 + t * 2.2;                 // 1.0 … 3.2
            const rp1 = (age % 55) / 55;
            const rp2 = ((age + 27) % 55) / 55;
            ctx.lineWidth = rippleLW;
            ctx.globalAlpha = fade * (1 - rp1) * (0.25 + t * 0.18);
            ctx.strokeStyle = '#9020ff';
            ctx.beginPath(); ctx.arc(x, y, rp1 * this.pullRadius, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = fade * (1 - rp2) * (0.18 + t * 0.14);
            ctx.beginPath(); ctx.arc(x, y, rp2 * this.pullRadius, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = fade;

            // ── Outer nebula halo ────────────────────────────────────────
            // Blur and color intensity scale with t
            ctx.shadowColor = '#6000cc';
            ctx.shadowBlur  = 24 + t * 32;                  // 24 … 56
            const haloAlpha = 0.18 + t * 0.22;              // 0.18 … 0.40
            const outerG = ctx.createRadialGradient(x, y, coreR * 0.6, x, y, haloR + pulse * 14);
            outerG.addColorStop(0,    `rgba(110,0,255,${haloAlpha + pulse * 0.08})`);
            outerG.addColorStop(0.40, `rgba(55,0,180,${0.06 + t * 0.08})`);
            outerG.addColorStop(0.72, `rgba(18,0,100,0.03)`);
            outerG.addColorStop(1,    'rgba(0,0,0,0)');
            ctx.fillStyle = outerG;
            ctx.beginPath(); ctx.arc(x, y, haloR + pulse * 14, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;

            // ── Dark void core ───────────────────────────────────────────
            ctx.save(); ctx.translate(x, y);
            const coreG = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
            coreG.addColorStop(0,    'rgba(1,0,8,0.98)');
            coreG.addColorStop(0.28, 'rgba(8,0,28,0.94)');
            coreG.addColorStop(0.55, `rgba(55,0,150,${0.58 + t * 0.28 + pulse * 0.10})`);
            coreG.addColorStop(0.80, `rgba(90,0,200,${0.28 + t * 0.24 + pulse2 * 0.10})`);
            coreG.addColorStop(1,    'rgba(0,0,0,0)');
            ctx.shadowColor = '#9010ee';
            ctx.shadowBlur  = 20 + t * 34;                  // 20 … 54
            ctx.fillStyle   = coreG;
            ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur  = 0;

            // Inner energy glow — radius and opacity scale with t
            const glowR     = coreR * (0.38 + t * 0.16) + pulse * (3 + t * 4);
            const glowAlpha = (0.48 + t * 0.42) * flicker;  // 0.48 … 0.90
            ctx.shadowColor = '#ee80ff';
            ctx.shadowBlur  = 12 + t * 24;                  // 12 … 36
            ctx.fillStyle   = `rgba(210,80,255,${glowAlpha})`;
            ctx.beginPath(); ctx.arc(0, 0, glowR, 0, Math.PI * 2); ctx.fill();
            // White-hot pinpoint
            ctx.fillStyle = `rgba(255,235,255,${0.88 * flicker})`;
            ctx.beginPath(); ctx.arc(0, 0, 3 + t * 5, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;

            // ── Surface corona sparks — count and size scale continuously ─
            // sparkCont is a real number; probabilistic rounding avoids discrete steps
            const sparkCont = 3 + t * 8;                    // 3.0 … 11.0
            const sparkN    = Math.floor(sparkCont) + (Math.random() < (sparkCont % 1) ? 1 : 0);
            const sparkLenX = 10 + t * 22;                  // spark reach: 10 … 32
            const sparkDisp = 8  + t * 20;                  // jitter: 8 … 28
            const sparkLW   = 0.5 + t * 1.4;                // line width: 0.5 … 1.9
            ctx.shadowColor = '#cc60ff';
            ctx.shadowBlur  = 7 + t * 16;                   // 7 … 23
            for (let k = 0; k < sparkN; k++) {
                const sa  = Math.random() * Math.PI * 2;
                const sr1 = coreR * 0.50 + Math.random() * coreR * 0.28;
                const sr2 = sr1 + sparkLenX * (0.6 + Math.random() * 0.8);
                const ea  = sa + 0.50 + Math.random() * 0.9;
                const pts = _arcPts(
                    Math.cos(sa) * sr1, Math.sin(sa) * sr1,
                    Math.cos(ea) * sr2, Math.sin(ea) * sr2,
                    3, sparkDisp
                );
                ctx.lineWidth   = sparkLW * (0.6 + Math.random() * 0.8);
                ctx.strokeStyle = `rgba(215,110,255,${0.45 + Math.random() * 0.48})`;
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
            ctx.restore();

            // ── Lightning arcs to struck targets — thickness/jitter scale ─
            if (this.arcTargets.length > 0) {
                const arcOuter = 2.5 + t * 5.0;             // outer arc width: 2.5 … 7.5
                const arcMid   = 1.0 + t * 3.5;             // mid arc width:   1.0 … 4.5
                const arcSpine = 0.5 + t * 1.5;             // spine width:     0.5 … 2.0
                const arcDisp  = 18  + t * 32;              // jitter: 18 … 50
                const arcOpMid = 0.70 + t * 0.28;           // mid opacity: 0.70 … 0.98
                ctx.shadowColor = '#cc40ff';
                ctx.shadowBlur  = 16 + t * 28;              // 16 … 44
                for (const a of this.arcTargets) {
                    const tf  = a.life / 14;
                    const pts = _arcPts(x, y, a.x, a.y, 4, arcDisp);
                    // Outer glow arc
                    ctx.lineWidth   = arcOuter * tf;
                    ctx.strokeStyle = `rgba(100,0,220,${0.28 * tf})`;
                    ctx.beginPath();
                    ctx.moveTo(pts[0][0], pts[0][1]);
                    pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
                    ctx.stroke();
                    // Main bright arc
                    ctx.lineWidth   = arcMid * tf;
                    ctx.strokeStyle = `rgba(200,80,255,${arcOpMid * tf})`;
                    ctx.beginPath();
                    ctx.moveTo(pts[0][0], pts[0][1]);
                    pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
                    ctx.stroke();
                    // Thin white-purple spine
                    const pts2 = _arcPts(x, y, a.x, a.y, 3, arcDisp * 0.5);
                    ctx.lineWidth   = arcSpine * tf;
                    ctx.strokeStyle = `rgba(240,180,255,${(0.85 + t * 0.13) * tf})`;
                    ctx.beginPath();
                    ctx.moveTo(pts2[0][0], pts2[0][1]);
                    pts2.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
                    ctx.stroke();
                }
                ctx.shadowBlur = 0;
            }

            ctx.globalAlpha = 1;
        }

        getBounds() {
            const r = this.coreR + 4;
            return { x: this.x - r, y: this.y - r, w: r * 2, h: r * 2 };
        }
    }

    return {
        shoot(player, pw) {
            pw = pw || 1;
            if (_ammo <= 0) return [];
            _fireTimer++;
            if (_fireTimer < INTERVAL) return [];
            _fireTimer = 0;
            _ammo--;
            return [new GravitonOrbBullet(player.x, player.y - 30, pw)];
        },
        getAmmo()       { return _ammo; },
        getMaxAmmo()    { return MAX_AMMO; },
        isExhausted()   { return _ammo <= 0; },
        reset()         { _ammo = MAX_AMMO; _fireTimer = 0; },
        refill()        { _ammo = MAX_AMMO; _fireTimer = 0; },
        GravitonOrbBullet
    };
})();
