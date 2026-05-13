var BlackholeScene = (() => {
    let _stars = [], _fc = 0, _t = 0;
    let _bx = 0, _by = 0, _baseX = 0, _baseY = 0;
    let _particles = [];

    const PULL_RADIUS   = 220;
    const DAMAGE_RADIUS = 38;
    const RANGE_X = 155, RANGE_Y = 115;

    function _initStars(W, H) {
        _stars = [];
        for (let i = 0; i < 220; i++) {
            _stars.push({
                x: Math.random() * W,
                y: Math.random() * H,
                r: Math.random() * 1.5 + 0.2,
                alpha: Math.random() * 0.7 + 0.25,
                twinkle: Math.random() * Math.PI * 2,
                speed: 0.018 + Math.random() * 0.028,
                color: Math.random() < 0.18 ? '#c8aaff' : (Math.random() < 0.12 ? '#fffbe0' : '#fff')
            });
        }
    }

    function _initParticles() {
        _particles = [];
        for (let i = 0; i < 80; i++) {
            const dist = DAMAGE_RADIUS * 1.6 + Math.random() * (PULL_RADIUS * 0.58);
            _particles.push({
                angle: Math.random() * Math.PI * 2,
                dist,
                orbitSpeed: 0.005 + 1.8 / dist,
                inSpeed:    0.025 + Math.random() * 0.02,
                alpha: Math.random() * 0.55 + 0.2,
                r:    Math.random() * 1.4 + 0.4,
                warm: Math.random() < 0.55
            });
        }
    }

    return {
        init() {
            const W = Renderer.W, H = Renderer.H;
            _fc = 0; _t = 0;
            _baseX = W / 2;
            _baseY = H * 0.36;
            _bx = _baseX;
            _by = _baseY;
            _initStars(W, H);
            _initParticles();
        },

        update(dt) {
            _fc += dt;
            _t  += dt;
            _bx = _baseX + Math.sin(_t * 0.0075) * RANGE_X;
            _by = _baseY + Math.cos(_t * 0.0048) * RANGE_Y;
            for (const s of _stars) s.twinkle += s.speed * dt;
            for (const p of _particles) {
                p.angle += p.orbitSpeed * dt;
                p.dist  -= p.inSpeed * dt;
                if (p.dist < DAMAGE_RADIUS * 1.1) {
                    p.angle = Math.random() * Math.PI * 2;
                    p.dist  = DAMAGE_RADIUS * 2.2 + Math.random() * (PULL_RADIUS * 0.52);
                    p.orbitSpeed = 0.005 + 1.8 / p.dist;
                    p.alpha = Math.random() * 0.55 + 0.2;
                }
            }
        },

        draw(ctx) {
            const W = Renderer.W, H = Renderer.H;
            const bx = _bx, by = _by;
            const t  = _t;

            // ── Background ───────────────────────────────────────────────────
            ctx.fillStyle = '#00000a';
            ctx.fillRect(0, 0, W, H);

            const wash = ctx.createRadialGradient(W * 0.15, H * 0.1, 0, W * 0.15, H * 0.1, W * 0.85);
            wash.addColorStop(0,   'rgba(10,4,28,0.55)');
            wash.addColorStop(0.6, 'rgba(4,0,14,0.22)');
            wash.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = wash;
            ctx.fillRect(0, 0, W, H);

            // ── Nebula layers ─────────────────────────────────────────────────
            const nb1 = ctx.createRadialGradient(bx, by, 0, bx, by, W * 0.68);
            nb1.addColorStop(0,    'rgba(55,0,100,0.16)');
            nb1.addColorStop(0.35, 'rgba(40,0,80,0.10)');
            nb1.addColorStop(0.7,  'rgba(20,0,50,0.05)');
            nb1.addColorStop(1,    'rgba(0,0,0,0)');
            ctx.fillStyle = nb1; ctx.fillRect(0, 0, W, H);

            const nb2 = ctx.createRadialGradient(bx - W*0.22, by + H*0.12, 0, bx - W*0.22, by + H*0.12, W*0.42);
            nb2.addColorStop(0,   'rgba(30,0,70,0.10)');
            nb2.addColorStop(0.5, 'rgba(15,0,40,0.05)');
            nb2.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = nb2; ctx.fillRect(0, 0, W, H);

            const nb3 = ctx.createRadialGradient(bx + W*0.18, by - H*0.08, 0, bx + W*0.18, by - H*0.08, W*0.36);
            nb3.addColorStop(0,   'rgba(10,0,55,0.07)');
            nb3.addColorStop(0.6, 'rgba(5,0,30,0.03)');
            nb3.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = nb3; ctx.fillRect(0, 0, W, H);

            // ── Stars with stronger Einstein deflection ───────────────────────
            for (const s of _stars) {
                const sdx   = s.x - bx, sdy = s.y - by;
                const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
                const fade  = sdist < PULL_RADIUS
                    ? Math.max(0, (sdist - DAMAGE_RADIUS * 1.8) / (PULL_RADIUS * 0.75 - DAMAGE_RADIUS * 1.8))
                    : 1;
                if (fade <= 0) continue;

                let dx = s.x, dy = s.y;
                if (sdist < PULL_RADIUS * 0.75 && sdist > DAMAGE_RADIUS * 2.2) {
                    const str = (1 - sdist / (PULL_RADIUS * 0.75)) * 26;
                    dx += (-sdy / sdist) * str;
                    dy += ( sdx / sdist) * str;
                }

                ctx.globalAlpha = s.alpha * (0.68 + 0.32 * Math.sin(s.twinkle)) * fade;
                ctx.fillStyle   = s.color;
                ctx.beginPath(); ctx.arc(dx, dy, s.r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;

            // ── Relativistic jets ─────────────────────────────────────────────
            const diskAngle = t * 0.016;
            const jetPulse  = 0.5 + Math.sin(t * 0.068) * 0.45;
            for (let s = -1; s <= 1; s += 2) {
                const jLen = DAMAGE_RADIUS * 4.5 + jetPulse * 18;
                const jx   = bx + Math.cos(diskAngle + Math.PI * 0.5) * s * 8;
                const jy   = by - s * jLen;
                const jg   = ctx.createRadialGradient(jx, jy, 0, jx, jy, jLen * 0.9);
                const jcol = s > 0 ? '160,70,255' : '255,130,40';
                jg.addColorStop(0,    `rgba(${jcol},${0.18 + jetPulse * 0.10})`);
                jg.addColorStop(0.45, `rgba(${jcol},0.06)`);
                jg.addColorStop(1,    'rgba(0,0,0,0)');
                ctx.fillStyle = jg;
                ctx.fillRect(0, 0, W, H);
            }

            // ── BH-local rendering ────────────────────────────────────────────
            ctx.save();
            ctx.translate(bx, by);

            const phR       = DAMAGE_RADIUS + 7;
            const phPulse   = 0.5 + Math.sin(_fc * 0.088) * 0.44;
            const warpPulse = 0.5 + Math.sin(t  * 0.035)  * 0.45;
            const hotPulse  = 0.5 + Math.sin(t  * 0.23)   * 0.45;

            // -- Gravitational lensing distortion rings --
            // Each ring represents a stack of bent-light images at increasing radii
            const WARP_RINGS = [
                { r: 210, w: 10, a: 0.018 + warpPulse * 0.008 },
                { r: 165, w:  7, a: 0.030 + warpPulse * 0.012 },
                { r: 120, w:  6, a: 0.046 + warpPulse * 0.016 },
                { r:  85, w:  5, a: 0.068 + warpPulse * 0.022 },
            ];
            for (const wr of WARP_RINGS) {
                const wg = ctx.createRadialGradient(0, 0, wr.r - wr.w, 0, 0, wr.r + wr.w);
                wg.addColorStop(0,   'rgba(0,0,0,0)');
                wg.addColorStop(0.5, `rgba(170,145,255,${wr.a})`);
                wg.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = wg;
                ctx.beginPath(); ctx.arc(0, 0, wr.r + wr.w, 0, Math.PI * 2); ctx.fill();
            }

            // -- Radial infall streaks (spacetime stretch visual) --
            const N_STREAKS  = 14;
            const streakBase = 0.5 + Math.sin(t * 0.022) * 0.45;
            for (let i = 0; i < N_STREAKS; i++) {
                const ang = (i / N_STREAKS) * Math.PI * 2 + t * 0.005;
                const r0  = DAMAGE_RADIUS + 6;
                const r1  = 100 + Math.sin(t * 0.04 + i * 1.1) * 14;
                const x0  = Math.cos(ang) * r0,  y0 = Math.sin(ang) * r0;
                const x1  = Math.cos(ang) * r1,  y1 = Math.sin(ang) * r1;
                const sg  = ctx.createLinearGradient(x1, y1, x0, y0);
                sg.addColorStop(0,    'rgba(160,100,255,0)');
                sg.addColorStop(0.55, `rgba(210,165,255,${0.034 + streakBase * 0.025})`);
                sg.addColorStop(1,    `rgba(240,215,255,${0.090 + streakBase * 0.044})`);
                ctx.strokeStyle = sg;
                ctx.lineWidth   = 1.0 + Math.sin(t * 0.06 + i * 0.9) * 0.5;
                ctx.globalAlpha = 0.50 + Math.sin(t * 0.07 + i * 0.7) * 0.38;
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x0, y0); ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // -- Wide ambient halo from accretion heat --
            const ambG = ctx.createRadialGradient(0, 0, DAMAGE_RADIUS * 1.3, 0, 0, PULL_RADIUS * 0.55);
            ambG.addColorStop(0,    'rgba(140,60,255,0.12)');
            ambG.addColorStop(0.28, 'rgba(100,20,200,0.07)');
            ambG.addColorStop(0.6,  'rgba(60,0,140,0.03)');
            ambG.addColorStop(1,    'rgba(0,0,0,0)');
            ctx.fillStyle = ambG;
            ctx.beginPath(); ctx.arc(0, 0, PULL_RADIUS * 0.55, 0, Math.PI * 2); ctx.fill();

            // -- Outer warm glow ring --
            const outerHeat = ctx.createRadialGradient(0, 0, DAMAGE_RADIUS * 1.5, 0, 0, 118);
            outerHeat.addColorStop(0,    'rgba(255,140,20,0)');
            outerHeat.addColorStop(0.38, `rgba(255,140,20,${0.14 + warpPulse * 0.04})`);
            outerHeat.addColorStop(0.65, 'rgba(255,90,0,0.07)');
            outerHeat.addColorStop(1,    'rgba(200,40,0,0)');
            ctx.fillStyle = outerHeat;
            ctx.beginPath(); ctx.arc(0, 0, 118, 0, Math.PI * 2); ctx.fill();

            // -- Hotspot (plasma blob orbiting near photon sphere) --
            const hsr = 58;
            // Trailing afterglow copies (orbital persistence effect)
            for (let i = 2; i >= 1; i--) {
                ctx.save();
                ctx.rotate(diskAngle * 2.48 + t * 0.004 - i * 0.20);
                const tG = ctx.createRadialGradient(hsr, 0, 0, hsr, 0, 20 - i * 2);
                tG.addColorStop(0,   `rgba(255,210,90,${0.30 - i * 0.09 + hotPulse * 0.05})`);
                tG.addColorStop(1,   'rgba(255,80,0,0)');
                ctx.globalAlpha = 0.45 - i * 0.14;
                ctx.fillStyle = tG;
                ctx.beginPath(); ctx.arc(hsr, 0, 20 - i * 2, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
            ctx.save();
            ctx.rotate(diskAngle * 2.48 + t * 0.004);
            const hsG = ctx.createRadialGradient(hsr, 0, 0, hsr, 0, 20);
            hsG.addColorStop(0,    `rgba(255,248,210,${0.72 + hotPulse * 0.25})`);
            hsG.addColorStop(0.35, `rgba(255,196,60, ${0.38 + hotPulse * 0.15})`);
            hsG.addColorStop(1,    'rgba(255,120,0,0)');
            ctx.globalAlpha = 1;
            ctx.fillStyle = hsG;
            ctx.beginPath(); ctx.arc(hsr, 0, 20, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            // -- Lensed star arcs (gravitational shear near photon sphere) --
            // Short bright arc segments simulate star images stretched by shear lensing
            const N_ARCS = 8;
            for (let i = 0; i < N_ARCS; i++) {
                const arcR   = phR + 14 + Math.sin(t * 0.015 + i * 2.3) * 6;
                const aStart = (i / N_ARCS) * Math.PI * 2 + t * 0.003 + i * 0.44;
                const aLen   = 0.07 + Math.sin(t * 0.04 + i * 1.7) * 0.025;
                ctx.globalAlpha = 0.12 + Math.sin(t * 0.055 + i * 2.1) * 0.07;
                ctx.strokeStyle = '#f0e8ff';
                ctx.lineWidth   = 0.9;
                ctx.beginPath(); ctx.arc(0, 0, arcR, aStart, aStart + aLen); ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // -- Secondary Einstein ring (2nd-order gravitational lensing image) --
            const secR     = phR * 1.88;
            const secPulse = 0.4 + Math.sin(_fc * 0.044) * 0.35;
            const secG = ctx.createRadialGradient(0, 0, secR - 5, 0, 0, secR + 10);
            secG.addColorStop(0,   'rgba(0,0,0,0)');
            secG.addColorStop(0.4, `rgba(190,160,255,${0.10 + secPulse * 0.06})`);
            secG.addColorStop(0.7, `rgba(215,195,255,${0.15 + secPulse * 0.08})`);
            secG.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = secG;
            ctx.beginPath(); ctx.arc(0, 0, secR + 10, 0, Math.PI * 2); ctx.fill();

            // -- Photon ring with chromatic aberration --
            // Red-shifted outer component (longer wavelengths escape from deeper in the potential well)
            const phRed = ctx.createRadialGradient(0, 0, phR + 5, 0, 0, phR + 24);
            phRed.addColorStop(0,   'rgba(255,80,40,0)');
            phRed.addColorStop(0.4, `rgba(255,100,30,${0.20 + phPulse * 0.10})`);
            phRed.addColorStop(1,   'rgba(200,40,0,0)');
            ctx.fillStyle = phRed;
            ctx.beginPath(); ctx.arc(0, 0, phR + 24, 0, Math.PI * 2); ctx.fill();

            // White/violet outer halo
            const phOut = ctx.createRadialGradient(0, 0, phR, 0, 0, phR + 28);
            phOut.addColorStop(0,    `rgba(210,140,255,${0.50 + phPulse * 0.22})`);
            phOut.addColorStop(0.28, `rgba(180,90,255, ${0.30 + phPulse * 0.14})`);
            phOut.addColorStop(0.60, 'rgba(100,20,200,0.08)');
            phOut.addColorStop(1,    'rgba(60,0,150,0)');
            ctx.fillStyle = phOut;
            ctx.beginPath(); ctx.arc(0, 0, phR + 28, 0, Math.PI * 2); ctx.fill();

            // Inner halo (fades inward)
            const phIn = ctx.createRadialGradient(0, 0, DAMAGE_RADIUS - 2, 0, 0, phR + 4);
            phIn.addColorStop(0,   'rgba(0,0,0,0)');
            phIn.addColorStop(0.5, `rgba(200,120,255,${0.28 + phPulse * 0.18})`);
            phIn.addColorStop(1,   `rgba(230,160,255,${0.42 + phPulse * 0.20})`);
            ctx.fillStyle = phIn;
            ctx.beginPath(); ctx.arc(0, 0, phR + 4, 0, Math.PI * 2); ctx.fill();

            // Blue-shifted inner component (shorter wavelengths from near-horizon region)
            const phBlue = ctx.createRadialGradient(0, 0, DAMAGE_RADIUS + 1, 0, 0, phR);
            phBlue.addColorStop(0,    'rgba(0,0,0,0)');
            phBlue.addColorStop(0.65, `rgba(110,185,255,${0.16 + phPulse * 0.10})`);
            phBlue.addColorStop(1,    `rgba(155,210,255,${0.22 + phPulse * 0.13})`);
            ctx.fillStyle = phBlue;
            ctx.beginPath(); ctx.arc(0, 0, phR, 0, Math.PI * 2); ctx.fill();

            // Thin bright core peak
            const phCore = ctx.createRadialGradient(0, 0, phR - 3, 0, 0, phR + 5);
            phCore.addColorStop(0,    'rgba(255,230,255,0)');
            phCore.addColorStop(0.45, `rgba(255,230,255,${0.55 + phPulse * 0.28})`);
            phCore.addColorStop(1,    'rgba(200,150,255,0)');
            ctx.fillStyle = phCore;
            ctx.beginPath(); ctx.arc(0, 0, phR + 5, 0, Math.PI * 2); ctx.fill();

            // -- Event horizon: solid black with wide soft edge --
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(0, 0, DAMAGE_RADIUS, 0, Math.PI * 2); ctx.fill();

            // Wide edge softener — 16px gradual fade (vs previous 5px)
            const ehEdge = ctx.createRadialGradient(0, 0, DAMAGE_RADIUS - 2, 0, 0, DAMAGE_RADIUS + 16);
            ehEdge.addColorStop(0,    'rgba(0,0,0,1)');
            ehEdge.addColorStop(0.30, 'rgba(0,0,0,0.85)');
            ehEdge.addColorStop(0.65, 'rgba(0,0,0,0.40)');
            ehEdge.addColorStop(1,    'rgba(0,0,0,0)');
            ctx.fillStyle = ehEdge;
            ctx.beginPath(); ctx.arc(0, 0, DAMAGE_RADIUS + 16, 0, Math.PI * 2); ctx.fill();

            ctx.restore(); // translate(bx, by)

            // ── Spiraling gas particles with glow ─────────────────────────────
            for (const p of _particles) {
                const px  = bx + Math.cos(p.angle) * p.dist;
                const py  = by + Math.sin(p.angle) * p.dist * 0.25;
                const prx = px - bx, pry = py - by;
                if (Math.sqrt(prx * prx + pry * pry) < DAMAGE_RADIUS * 1.05) continue;
                const nearness = 1 - Math.max(0, (p.dist - DAMAGE_RADIUS * 1.1) / (PULL_RADIUS * 0.52));
                ctx.globalAlpha = p.alpha * nearness * 0.75;
                ctx.shadowColor = p.warm ? '#ff7020' : '#aa44ff';
                ctx.shadowBlur  = 3 + nearness * 3;
                ctx.fillStyle   = p.warm ? '#ff9930' : '#cc60ff';
                ctx.beginPath(); ctx.arc(px, py, p.r * (0.4 + nearness * 0.9), 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.shadowBlur  = 0;
        },

        getBlackhole() {
            return { x: _bx, y: _by, pullRadius: PULL_RADIUS, damageRadius: DAMAGE_RADIUS };
        }
    };
})();

SceneRegistry.register({ label:'BLACK HOLE', getScene:()=>BlackholeScene });
