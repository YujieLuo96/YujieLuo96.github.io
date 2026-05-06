var Boss6_NeutronCluster = (() => {

    // ── Arc rendering helpers ─────────────────────────────────────────────────
    // Midpoint-displacement: builds a jagged lightning path between two points.
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

    function _strokePts(ctx, pts) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
    }

    // 3-layer thick plasma arc (center → satellite)
    function _thickArc(ctx, x1, y1, x2, y2, alpha) {
        const pts = _arcPts(x1, y1, x2, y2, 3, 26);
        ctx.lineWidth = 6.5; ctx.strokeStyle = `rgba(0,140,255,${alpha * 0.14})`; _strokePts(ctx, pts);
        ctx.lineWidth = 3.2; ctx.strokeStyle = `rgba(40,190,255,${alpha * 0.60})`; _strokePts(ctx, pts);
        ctx.lineWidth = 1.0; ctx.strokeStyle = `rgba(210,248,255,${alpha * 0.88})`; _strokePts(ctx, pts);
    }

    // 2-layer thin arc (satellite ↔ satellite)
    function _thinArc(ctx, x1, y1, x2, y2, alpha) {
        const pts = _arcPts(x1, y1, x2, y2, 2, 15);
        ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(60,210,255,${alpha * 0.55})`; _strokePts(ctx, pts);
        ctx.lineWidth = 0.4; ctx.strokeStyle = `rgba(220,250,255,${alpha * 0.72})`; _strokePts(ctx, pts);
    }

    // Irregular arc that wraps around a sphere surface.
    // r=base radius, startA=start angle, arcLen=angular length (radians),
    // disp=radial jitter, lw=line width scale, alpha=opacity scale
    function _sphereArc(ctx, r, startA, arcLen, disp, lw, alpha) {
        const steps = 4 + Math.floor(Math.random() * 4);
        const pts = [];
        for (let s = 0; s <= steps; s++) {
            const a  = startA + (arcLen / steps) * s;
            const rd = r + (Math.random() - 0.5) * disp;
            pts.push([Math.cos(a) * rd, Math.sin(a) * rd]);
        }
        ctx.lineWidth   = lw * (0.5 + Math.random() * 0.9);
        ctx.strokeStyle = `rgba(160,242,255,${alpha * (0.38 + Math.random() * 0.48)})`;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
        ctx.stroke();
    }

    // ── Boss class ────────────────────────────────────────────────────────────
    class Boss6_NeutronCluster extends EnemyBase {
        constructor() {
            super({
                x: Renderer.W / 2, y: -95, hp: 400, score: 22000,
                type: 'boss6',
                dropChance: 1.0,
                dropTable: ['bomb','health','shield','satellite_w','ice_w','megabomb'],
                w: 72, h: 72
            });
            this.entryY = 152;
            this.entry  = true;
            this.t      = 0;

            // 7 satellites — each has unique orbital phase, spiral offset, and fire timer
            this.sats = Array.from({ length: 7 }, (_, i) => ({
                phaseOff:  (i / 7) * Math.PI * 2,
                spiralOff: (i / 7) * Math.PI * 2 + 0.4 * i,
                speedOff:  (Math.random() - 0.5) * 0.005,
                fireTimer: Math.random() * 130,          // staggered start
                fireCd:    115 + Math.random() * 65,     // 115–180 frames between shots
            }));

            this.ringTimer    = 0;
            this.resonTimer   = 0;
            this.cascadeTimer = 0;
            this.laserTimer    = 0;
            this.pulseTimer    = 0;
            this.orbTimer      = 0;
            this.spiralRot     = 0;

            this.beamPhase     = 'idle';   // 'idle' | 'aim' | 'fire'
            this.beamTimer     = 0;
            this.beamAngle     = 0;
            this.beamShotTimer = 0;

            this.baseX = Renderer.W / 2;
            this.baseY = 0; // set after entry
        }

        _phase() {
            const r = this.hp / this.maxHp;
            if (r > 0.75) return 0;
            if (r > 0.50) return 1;
            if (r > 0.25) return 2;
            return 3;
        }

        // Local (offset from boss center) position of satellite i
        _satPos(i) {
            const s      = this.sats[i];
            const r      = 96;
            const angle  = s.phaseOff + (0.0085 + s.speedOff) * this.t;
            return { x: r * Math.cos(angle), y: r * Math.sin(angle), angle };
        }

        update(dt, fc) {
            if (this.entry) {
                this.y += 0.85 * dt;
                if (this.y >= this.entryY) {
                    this.y = this.entryY;
                    this.entry = false;
                    this.baseX = this.x;
                    this.baseY = this.y;
                }
                this.checkEntered();
                return null;
            }

            this.t         += dt;
            this.spiralRot += 0.09 * dt;

            const ph      = this._phase();
            const ix      = 1 + ph * 0.32;   // intensity multiplier
            const bullets = [];

            // Slow drift with subtle vertical undulation
            this.x = this.baseX + Math.sin(this.t * 0.008) * 42;
            this.y = this.baseY + Math.sin(this.t * 0.013) * 16;

            const cx = this.x, cy = this.y;

            // ── Ring discharge from center ────────────────────────────────
            const ringInt = Math.max(26, Math.round(70 / ix));
            this.ringTimer += dt;
            if (this.ringTimer >= ringInt) {
                this.ringTimer = 0;
                const cnt = 10 + ph * 3;
                BulletPatterns.ring(cx, cy, cnt, 2.9 + ph * 0.35).forEach(b => bullets.push(b));
                if (ph >= 1) {
                    // Interleaved second ring, slightly faster
                    BulletPatterns.ring(cx, cy, 9, 4.4, Math.PI / cnt).forEach(b => bullets.push(b));
                }
            }

            // ── Per-satellite independent attacks ─────────────────────────
            {
                const p = Player.getPos();
                this.sats.forEach((s, i) => {
                    s.fireTimer += dt;
                    if (s.fireTimer < Math.max(55, s.fireCd / ix)) return;
                    s.fireTimer = 0;
                    const sp = this._satPos(i);
                    const sx = cx + sp.x, sy = cy + sp.y;
                    // Alternate attack type: every 3rd satellite fires a laser at ph≥1
                    if (i % 3 === 0 && ph >= 1) {
                        BulletPatterns.laserBeam(sx, sy, p.x, p.y, 10 + ph * 0.6, 1)
                            .forEach(b => bullets.push(b));
                    } else {
                        BulletPatterns.aimed(sx, sy, p.x, p.y,
                            4.0 + ph * 0.5, { count: ph >= 2 ? 2 : 1, spread: 0.22 })
                            .forEach(b => bullets.push(b));
                    }
                });
            }

            // ── Resonance (phase 2+): all 7 satellites fire outward ───────
            if (ph >= 2) {
                const resonInt = Math.max(48, Math.round(95 / ix));
                this.resonTimer += dt;
                if (this.resonTimer >= resonInt) {
                    this.resonTimer = 0;
                    this.sats.forEach((_, i) => {
                        const sp = this._satPos(i);
                        BulletPatterns.fan(cx + sp.x, cy + sp.y,
                            3, 4.0 + ph * 0.4, sp.angle + Math.PI, 0.65)
                            .forEach(b => bullets.push(b));
                    });
                }
            }

            // ── Cascade spiral (phase 3): dense spiral from center ─────────
            if (ph >= 3) {
                this.cascadeTimer += dt;
                if (this.cascadeTimer >= 9) {
                    this.cascadeTimer = 0;
                    BulletPatterns.spiral(cx, cy, 5, 5.0, this.spiralRot)
                        .forEach(b => bullets.push(b));
                }
            }

            // ── Laser beams — fast aimed cyan bolts from center ───────────
            const laserInt = Math.max(50, Math.round(90 / ix));
            this.laserTimer += dt;
            if (this.laserTimer >= laserInt) {
                this.laserTimer = 0;
                const p    = Player.getPos();
                const lCnt = 1 + Math.floor(ph / 2);          // 1→1, 2→2, 3→2
                BulletPatterns.laserBeam(cx, cy, p.x, p.y, 11 + ph * 0.8, lCnt)
                    .forEach(b => bullets.push(b));
                // phase 2+: one satellite fires a laser too
                if (ph >= 2) {
                    const sp = this._satPos(Math.floor(Math.random() * 7));
                    BulletPatterns.laserBeam(cx + sp.x, cy + sp.y, p.x, p.y, 10, 1)
                        .forEach(b => bullets.push(b));
                }
            }

            // ── Neutron pulse — slow purple-black beams with lightning ─────
            const pulseInt = Math.max(75, Math.round(130 / ix));
            this.pulseTimer += dt;
            if (this.pulseTimer >= pulseInt) {
                this.pulseTimer = 0;
                const p = Player.getPos();
                BulletPatterns.neutronPulse(cx, cy, p.x, p.y, 5 + ph * 0.5)
                    .forEach(b => bullets.push(b));
                // phase 1+: second pulse with slight angular offset
                if (ph >= 1) {
                    BulletPatterns.neutronPulse(cx, cy, p.x + 50, p.y, 4.5 + ph * 0.4)
                        .forEach(b => bullets.push(b));
                }
            }

            // ── Neutron orbs — ring of drifting purple orbs from center ────
            const orbInt = Math.max(55, Math.round(110 / ix));
            this.orbTimer += dt;
            if (this.orbTimer >= orbInt) {
                this.orbTimer = 0;
                const orbCnt = 6 + ph * 2;
                BulletPatterns.neutronOrbs(cx, cy, orbCnt, 2.2 + ph * 0.3, this.spiralRot * 0.6)
                    .forEach(b => bullets.push(b));
            }

            // ── Mega screen-crossing beam ─────────────────────────────────
            {
                const beamCd      = Math.max(200, Math.round(340 / ix));
                const beamAimDur  = 55;
                const beamFireDur = 80 + ph * 10;

                this.beamTimer += dt;

                if (this.beamPhase === 'idle') {
                    if (this.beamTimer >= beamCd) {
                        this.beamTimer = 0;
                        this.beamPhase = 'aim';
                        const p = Player.getPos();
                        this.beamAngle = Math.atan2(p.y - cy, p.x - cx);
                    }
                } else if (this.beamPhase === 'aim') {
                    if (this.beamTimer >= beamAimDur) {
                        this.beamTimer = 0;
                        this.beamShotTimer = 0;
                        this.beamPhase = 'fire';
                    }
                } else if (this.beamPhase === 'fire') {
                    this.beamShotTimer += dt;
                    if (this.beamShotTimer >= 4) {
                        this.beamShotTimer = 0;
                        const bcos = Math.cos(this.beamAngle);
                        const bsin = Math.sin(this.beamAngle);
                        // Three parallel laser tracks for wide-beam feel
                        for (let w = -1; w <= 1; w++) {
                            const ox = cx - bsin * w * 14;
                            const oy = cy + bcos * w * 14;
                            BulletPatterns.laserBeam(ox, oy,
                                ox + bcos * 300, oy + bsin * 300, 22, 1)
                                .forEach(b => bullets.push(b));
                        }
                    }
                    if (this.beamTimer >= beamFireDur) {
                        this.beamTimer = 0;
                        this.beamPhase = 'idle';
                    }
                }
            }

            this.checkEntered();
            if (this.y > Renderer.H + 120) this.alive = false;
            return bullets.length > 0 ? bullets : null;
        }

        draw(ctx, dt, fc) {
            ctx.save();
            ctx.translate(this.x, this.y);
            const flash  = this._applyFlash(ctx, dt);
            const t      = this.t;
            const pulse  = 0.5 + Math.sin(t * 0.13) * 0.5;
            const pulse2 = 0.5 + Math.sin(t * 0.20 + 1.3) * 0.5;

            // Satellite positions in local space (offsets from boss center)
            const sps = this.sats.map((_, i) => this._satPos(i));

            if (!flash) {
                // ══ LAYER 1: System-wide nebula glow ═════════════════════
                const nebula = ctx.createRadialGradient(0, 0, 28, 0, 0, 148);
                nebula.addColorStop(0,   `rgba(20,160,255,${0.14 + pulse * 0.07})`);
                nebula.addColorStop(0.45,`rgba(0,100,220,0.07)`);
                nebula.addColorStop(1,   'rgba(0,30,120,0)');
                ctx.fillStyle = nebula;
                ctx.beginPath(); ctx.arc(0, 0, 148, 0, Math.PI * 2); ctx.fill();

                // ══ LAYER 3: Thick arcs — center → each satellite ═════════
                ctx.shadowColor = '#08c8ff';
                ctx.shadowBlur  = 16;
                sps.forEach((sp, i) => {
                    const alpha = 0.7 + Math.sin(t * 0.28 + i * 0.85) * 0.25;
                    _thickArc(ctx, 0, 0, sp.x, sp.y, alpha);
                });
                ctx.shadowBlur = 0;

                // ══ LAYER 4: Thin arcs — consecutive satellites ════════════
                ctx.shadowColor = '#50e8ff';
                ctx.shadowBlur  = 8;
                for (let i = 0; i < 7; i++) {
                    const a     = sps[i];
                    const b     = sps[(i + 1) % 7];
                    const alpha = 0.5 + Math.sin(t * 0.24 + i * 0.65) * 0.3;
                    _thinArc(ctx, a.x, a.y, b.x, b.y, alpha);
                }
                ctx.shadowBlur = 0;

                // ══ LAYER 5: Satellite orbs ════════════════════════════════
                sps.forEach((sp, i) => {
                    ctx.save();
                    ctx.translate(sp.x, sp.y);
                    const sp_pulse = 0.5 + Math.sin(t * 0.17 + i * 0.94) * 0.5;

                    // ── Glow A: outermost diffuse nebula (~52px) ──────────
                    const glowA = ctx.createRadialGradient(0, 0, 0, 0, 0, 52 + sp_pulse * 10);
                    glowA.addColorStop(0,    `rgba(60,200,255,${0.20 + sp_pulse * 0.10})`);
                    glowA.addColorStop(0.28, `rgba(20,150,240,0.10)`);
                    glowA.addColorStop(0.58, `rgba(0,90,210,0.04)`);
                    glowA.addColorStop(1,    'rgba(0,30,160,0)');
                    ctx.fillStyle = glowA;
                    ctx.beginPath(); ctx.arc(0, 0, 52 + sp_pulse * 10, 0, Math.PI * 2); ctx.fill();

                    // ── Glow B: mid corona (~32px) ────────────────────────
                    const glowB = ctx.createRadialGradient(0, 0, 0, 0, 0, 32 + sp_pulse * 6);
                    glowB.addColorStop(0,    `rgba(100,225,255,${0.40 + sp_pulse * 0.20})`);
                    glowB.addColorStop(0.35, `rgba(40,180,255,0.20)`);
                    glowB.addColorStop(0.70, `rgba(0,120,230,0.07)`);
                    glowB.addColorStop(1,    'rgba(0,60,190,0)');
                    ctx.fillStyle = glowB;
                    ctx.beginPath(); ctx.arc(0, 0, 32 + sp_pulse * 6, 0, Math.PI * 2); ctx.fill();

                    // ── Glow C: tight inner bright ring (~18px) ───────────
                    const glowC = ctx.createRadialGradient(0, 0, 5, 0, 0, 18 + sp_pulse * 3);
                    glowC.addColorStop(0,   `rgba(180,245,255,${0.60 + sp_pulse * 0.28})`);
                    glowC.addColorStop(0.5, `rgba(80,210,255,0.28)`);
                    glowC.addColorStop(1,   'rgba(0,150,240,0)');
                    ctx.fillStyle = glowC;
                    ctx.beginPath(); ctx.arc(0, 0, 18 + sp_pulse * 3, 0, Math.PI * 2); ctx.fill();

                    // ── Energy ball — gradient fades to transparent (no hard edge) ──
                    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
                    sg.addColorStop(0,    'rgba(238,252,255,0.96)');
                    sg.addColorStop(0.15, 'rgba(158,232,255,0.88)');
                    sg.addColorStop(0.38, 'rgba(38,162,245,0.74)');
                    sg.addColorStop(0.62, 'rgba(4,98,218,0.46)');
                    sg.addColorStop(0.82, 'rgba(0,52,184,0.18)');
                    sg.addColorStop(1,    'rgba(0,18,148,0)');
                    ctx.fillStyle   = sg;
                    ctx.shadowColor = '#0cf'; ctx.shadowBlur = 30;
                    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0;

                    // ── Surface arcs ──────────────────────────────────────
                    ctx.shadowColor = '#7ef'; ctx.shadowBlur = 7;
                    const arcN = 2 + Math.floor(Math.random() * 2);
                    for (let k = 0; k < arcN; k++) {
                        _sphereArc(ctx, 9 + Math.random() * 3,
                            Math.random() * Math.PI * 2,
                            0.6 + Math.random() * 1.0, 4, 0.9, 0.88);
                    }
                    ctx.shadowBlur = 0;

                    ctx.restore();
                });

                // ══ LAYER 6: Center corona sparks ═════════════════════════
                ctx.shadowColor = '#60e8ff'; ctx.shadowBlur = 10;
                for (let a = 0; a < 12; a++) {
                    const angle  = (a / 12) * Math.PI * 2 + t * 0.22 + (a % 3) * 0.12;
                    const flicker = Math.sin(t * 1.1 + a * 0.9);
                    const r1     = 25 + flicker * 4;
                    const r2     = r1 + 7 + Math.abs(Math.sin(t * 0.9 + a * 1.4)) * 11;
                    const dA     = 0.14 + Math.random() * 0.20;
                    const x1 = Math.cos(angle) * r1,          y1 = Math.sin(angle) * r1;
                    const x2 = Math.cos(angle + dA) * r2,     y2 = Math.sin(angle + dA) * r2;
                    const mx = (x1+x2)*0.5 + (Math.random()-0.5) * 7;
                    const my = (y1+y2)*0.5 + (Math.random()-0.5) * 7;
                    ctx.lineWidth   = 0.7 + Math.random() * 0.8;
                    ctx.strokeStyle = `rgba(130,230,255,${0.30 + Math.random() * 0.38})`;
                    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(mx,my); ctx.lineTo(x2,y2); ctx.stroke();
                }
                ctx.shadowBlur = 0;

                // ══ LAYER 7A: Far nebula halo (~100px) ════════════════════
                const haloFar = ctx.createRadialGradient(0, 0, 0, 0, 0, 100 + pulse * 22);
                haloFar.addColorStop(0,    `rgba(30,170,255,${0.22 + pulse * 0.10})`);
                haloFar.addColorStop(0.25, `rgba(10,130,240,0.12)`);
                haloFar.addColorStop(0.55, `rgba(0,80,210,0.05)`);
                haloFar.addColorStop(1,    'rgba(0,20,150,0)');
                ctx.fillStyle = haloFar;
                ctx.beginPath(); ctx.arc(0, 0, 100 + pulse * 22, 0, Math.PI * 2); ctx.fill();

                // ══ LAYER 7B: Mid corona (~68px) ══════════════════════════
                const haloMid = ctx.createRadialGradient(0, 0, 0, 0, 0, 68 + pulse2 * 16);
                haloMid.addColorStop(0,    `rgba(60,200,255,${0.34 + pulse2 * 0.14})`);
                haloMid.addColorStop(0.35, `rgba(20,155,245,0.18)`);
                haloMid.addColorStop(0.68, `rgba(0,100,220,0.06)`);
                haloMid.addColorStop(1,    'rgba(0,40,180,0)');
                ctx.fillStyle = haloMid;
                ctx.beginPath(); ctx.arc(0, 0, 68 + pulse2 * 16, 0, Math.PI * 2); ctx.fill();

                // ══ LAYER 7C: Near bright corona (~46px) ══════════════════
                const haloNear = ctx.createRadialGradient(0, 0, 18, 0, 0, 46 + pulse * 12);
                haloNear.addColorStop(0,   `rgba(100,230,255,${0.50 + pulse * 0.22})`);
                haloNear.addColorStop(0.45,`rgba(50,190,255,0.24)`);
                haloNear.addColorStop(0.80,`rgba(0,130,235,0.08)`);
                haloNear.addColorStop(1,   'rgba(0,70,200,0)');
                ctx.fillStyle = haloNear;
                ctx.beginPath(); ctx.arc(0, 0, 46 + pulse * 12, 0, Math.PI * 2); ctx.fill();

                // ══ Mega beam telegraph / fire visual ════════════════════
                if (this.beamPhase === 'aim' || this.beamPhase === 'fire') {
                    ctx.save();
                    ctx.rotate(this.beamAngle);
                    const blen = 1500;

                    if (this.beamPhase === 'aim') {
                        const aimProg = Math.min(1, this.beamTimer / 55);
                        // Animated dashed warning line
                        ctx.strokeStyle = `rgba(255,80,60,${0.22 + aimProg * 0.55})`;
                        ctx.lineWidth   = 2 + aimProg * 6;
                        ctx.setLineDash([14, 10]);
                        ctx.lineDashOffset = -t * 1.8;
                        ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(blen, 0); ctx.stroke();
                        ctx.setLineDash([]);
                        // Pulsing warning rings along beam path
                        const wr = 13 + Math.sin(t * 0.42) * 5;
                        ctx.strokeStyle = `rgba(255,130,60,${0.32 + aimProg * 0.52})`;
                        ctx.lineWidth   = 1.5;
                        [230, 490, 760, 1020, 1280].forEach(d => {
                            ctx.beginPath();
                            ctx.arc(d, 0, wr * (1 - d / 1600 * 0.28), 0, Math.PI * 2);
                            ctx.stroke();
                        });
                    } else {
                        // Fire phase: full thick beam with lightning wrap
                        const shimmer = 0.84 + Math.sin(t * 0.88) * 0.10 + Math.sin(t * 2.1) * 0.06;

                        // Outer diffuse halo (±55px)
                        ctx.shadowColor = '#0df'; ctx.shadowBlur = 44;
                        const og = ctx.createLinearGradient(0, -55, 0, 55);
                        og.addColorStop(0,    'rgba(0,180,255,0)');
                        og.addColorStop(0.28, `rgba(0,200,255,${0.28 * shimmer})`);
                        og.addColorStop(0.5,  `rgba(50,230,255,${0.50 * shimmer})`);
                        og.addColorStop(0.72, `rgba(0,200,255,${0.28 * shimmer})`);
                        og.addColorStop(1,    'rgba(0,180,255,0)');
                        ctx.fillStyle = og;
                        ctx.fillRect(34, -55, blen, 110);

                        // Mid beam body (±22px)
                        ctx.shadowColor = '#8ff'; ctx.shadowBlur = 24;
                        const mg = ctx.createLinearGradient(0, -22, 0, 22);
                        mg.addColorStop(0,    'rgba(140,230,255,0)');
                        mg.addColorStop(0.22, `rgba(80,220,255,${0.72 * shimmer})`);
                        mg.addColorStop(0.5,  `rgba(210,248,255,${0.94 * shimmer})`);
                        mg.addColorStop(0.78, `rgba(80,220,255,${0.72 * shimmer})`);
                        mg.addColorStop(1,    'rgba(140,230,255,0)');
                        ctx.fillStyle = mg;
                        ctx.fillRect(34, -22, blen, 44);

                        // White-hot core spine (±5px)
                        ctx.shadowColor = '#fff'; ctx.shadowBlur = 16;
                        ctx.fillStyle   = `rgba(255,255,255,${0.95 * shimmer})`;
                        ctx.fillRect(34, -5, blen, 10);
                        ctx.shadowBlur  = 0;

                        // Lightning arcs wrapping around beam
                        ctx.shadowColor = '#c0f'; ctx.shadowBlur = 14;
                        for (let a = 0; a < 10; a++) {
                            const segStart = 34 + (a * 142 + Math.floor(fc * 0.4) * 53 + a * 73) % (blen - 80);
                            const segLen   = 80 + (a * 57) % 140;
                            const side1    = (a % 2 === 0 ? 1 : -1) * (24 + (a * 13) % 18);
                            const side2    = (a % 2 === 0 ? -1 : 1) * (18 + Math.random() * 22);
                            const arcPts   = _arcPts(segStart, side1, segStart + segLen, side2, 4, 22);
                            ctx.lineWidth   = 0.5 + Math.random() * 1.2;
                            ctx.strokeStyle = a % 3 === 0
                                ? `rgba(200,100,255,${0.52 + Math.random() * 0.40})`
                                : `rgba(100,230,255,${0.50 + Math.random() * 0.44})`;
                            _strokePts(ctx, arcPts);
                        }
                        ctx.shadowBlur = 0;
                    }
                    ctx.restore();
                }
            }

            // ══ LAYER 8: Central energy ball (no hard boundary) ══════════
            const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
            cg.addColorStop(0,    flash ? 'rgba(255,255,255,0.98)' : 'rgba(242,252,255,0.96)');
            cg.addColorStop(0.15, flash ? 'rgba(255,255,255,0.90)' : 'rgba(138,232,255,0.88)');
            cg.addColorStop(0.38, flash ? 'rgba(210,210,210,0.72)' : 'rgba(18,148,250,0.74)');
            cg.addColorStop(0.62, flash ? 'rgba(155,155,155,0.42)' : 'rgba(0,88,218,0.46)');
            cg.addColorStop(0.82, flash ? 'rgba(110,110,110,0.15)' : 'rgba(0,42,178,0.18)');
            cg.addColorStop(1,    'rgba(0,0,0,0)');
            ctx.fillStyle   = cg;
            ctx.shadowColor = flash ? '#fff' : '#0cf';
            ctx.shadowBlur  = flash ? 14 : 48;
            ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;

            if (!flash) {
                // ── Surface arcs wrapping the central sphere ──────────────
                ctx.shadowColor = '#8ef'; ctx.shadowBlur = 14;
                const cArcN = 4 + Math.floor(Math.random() * 4);
                for (let k = 0; k < cArcN; k++) {
                    _sphereArc(ctx, 22 + Math.random() * 8,
                        Math.random() * Math.PI * 2,
                        0.5 + Math.random() * 1.7, 9, 1.3, 0.92);
                }
                ctx.shadowBlur = 0;
            }

            this.drawHpBar(ctx, 80, 46);
            ctx.restore();
            ctx.globalAlpha = 1;
        }
    }

    return { Boss6_NeutronCluster };
})();

EnemyRegistry.register({ label:'Neutron Cluster', scale:0.18, group:'BOSSES', mk:()=>new Boss6_NeutronCluster.Boss6_NeutronCluster() });
