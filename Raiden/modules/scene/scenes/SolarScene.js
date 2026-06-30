var SolarScene = (() => {
    let _fc = 0, _flares = [], _sunspots = [], _streams = [], _stars = [];
    let _prominences = [], _planets = [];
    let _lensFlares = [], _cme = null, _cmeTimer = 0, _bgPlanet = null;
    const STREAM_COUNT = 14, SPOT_COUNT = 6;
    const SURF_Y_OFFSET = 88;   // solar surface top distance from canvas bottom

    function _makeFlare(W, H) {
        return {
            x:       W * (0.06 + Math.random() * 0.88),
            baseY:   H,
            angle:   -Math.PI / 2 + (Math.random() - 0.5) * 0.72,
            length:  H * (0.18 + Math.random() * 0.40),
            width:   5 + Math.random() * 24,
            bendX:   (Math.random() - 0.5) * 68,
            life:    0,
            maxLife: 95 + Math.random() * 110
        };
    }

    function _makeProminence(W, H) {
        return {
            x:       W * (0.06 + Math.random() * 0.88),
            height:  H * (0.055 + Math.random() * 0.20),
            span:    W * (0.035 + Math.random() * 0.10),
            twist:   (Math.random() - 0.5) * 0.85,
            life:    0,
            maxLife: 280 + Math.random() * 220,
            col:     Math.random() < 0.50 ? [255, 72, 55] : [255, 115, 200]
        };
    }

    function _makePlanet(W, H) {
        return {
            x:  W + 12,
            y:  H * (0.07 + Math.random() * 0.56),
            r:  3 + Math.random() * 8,
            vx: -(0.055 + Math.random() * 0.12)
        };
    }

    return {
        init() {
            const W = Renderer.W, H = Renderer.H;
            _fc = 0; _flares = []; _prominences = []; _planets = [];
            _cme = null; _cmeTimer = 0;

            // Dim stars visible in upper corona region
            _stars = [];
            for (let i = 0; i < 80; i++) {
                _stars.push({
                    x:       Math.random() * W,
                    y:       Math.random() * H * 0.50,
                    r:       Math.random() * 1.0 + 0.14,
                    alpha:   0.08 + Math.random() * 0.22,
                    twinkle: Math.random() * Math.PI * 2
                });
            }

            // Sunspots (distributed across surface)
            _sunspots = [];
            for (let i = 0; i < SPOT_COUNT; i++) {
                _sunspots.push({
                    x:     W * (0.06 + (i / SPOT_COUNT) * 0.88 + (Math.random() - 0.5) * 0.06),
                    y:     H - 28 - Math.random() * 42,
                    rx:    10 + Math.random() * 24,
                    ry:    5  + Math.random() * 11,
                    pulse: Math.random() * Math.PI * 2
                });
            }

            // Solar wind streams (rising from surface)
            _streams = [];
            for (let i = 0; i < STREAM_COUNT; i++) {
                _streams.push({
                    x:      Math.random() * W,
                    y:      H - 55 - Math.random() * 65,
                    vy:     -(0.42 + Math.random() * 0.90),
                    alpha:  0.05 + Math.random() * 0.15,
                    len:    20 + Math.random() * 72,
                    phase:  Math.random() * Math.PI * 2,
                    wobble: (Math.random() - 0.5) * 0.040,
                    col:    Math.random() < 0.40 ? [255, 205, 95] : [255, 138, 38]
                });
            }

            for (let i = 0; i < 2; i++) _flares.push(_makeFlare(W, H));
            for (let i = 0; i < 2; i++) _prominences.push(_makeProminence(W, H));
            if (Math.random() < 0.55) _planets.push(_makePlanet(W, H));

            // Lens flare spots along vertical axis (sun-in-frame effect)
            _lensFlares = [
                { yFrac: 0.16, xOff:  0.06, r: 24, col: [255, 245, 210], a: 0.065 },
                { yFrac: 0.34, xOff:  0.12, r: 14, col: [255, 218, 170], a: 0.048 },
                { yFrac: 0.50, xOff: -0.08, r: 10, col: [180, 215, 255], a: 0.038 },
                { yFrac: 0.68, xOff:  0.04, r: 18, col: [255, 235, 200], a: 0.052 },
            ];

            // Distant background planet in upper sky
            _bgPlanet = {
                x:   W * (0.08 + Math.random() * 0.84),
                y:   H * (0.05 + Math.random() * 0.20),
                r:   15 + Math.random() * 18,
                vx:  -(0.015 + Math.random() * 0.020),
                col: Math.random() < 0.5 ? [155, 115, 75] : [90, 130, 185]
            };
        },

        update(dt) {
            _fc += dt;
            const W = Renderer.W, H = Renderer.H;

            for (const sp of _sunspots) sp.pulse += 0.029 * dt;

            for (const s of _streams) {
                s.y += s.vy * dt;
                s.phase += s.wobble * dt;
                if (s.y + s.len < 0) { s.y = H - 55 - Math.random() * 65; s.x = Math.random() * W; }
            }

            for (const f of _flares) f.life += dt;
            for (let i = _flares.length - 1; i >= 0; i--) {
                if (_flares[i].life >= _flares[i].maxLife) _flares.splice(i, 1);
            }
            if (_flares.length < 5 && Math.random() < 0.006 * dt) _flares.push(_makeFlare(W, H));

            for (const p of _prominences) p.life += dt;
            for (let i = _prominences.length - 1; i >= 0; i--) {
                if (_prominences[i].life >= _prominences[i].maxLife) _prominences.splice(i, 1);
            }
            if (_prominences.length < 3 && Math.random() < 0.003 * dt) _prominences.push(_makeProminence(W, H));

            for (let i = _planets.length - 1; i >= 0; i--) {
                _planets[i].x += _planets[i].vx * dt;
                if (_planets[i].x < -_planets[i].r * 2) _planets.splice(i, 1);
            }
            if (_planets.length === 0 && Math.random() < 0.0004 * dt) _planets.push(_makePlanet(W, H));

            // Background planet
            _bgPlanet.x += _bgPlanet.vx * dt;
            if (_bgPlanet.x + _bgPlanet.r * 2 < 0) {
                _bgPlanet.x   = W + _bgPlanet.r;
                _bgPlanet.y   = H * (0.05 + Math.random() * 0.20);
                _bgPlanet.col = Math.random() < 0.5 ? [155, 115, 75] : [90, 130, 185];
            }

            // CME event (triggers every ~12-25 seconds at 60fps)
            _cmeTimer += dt;
            if (!_cme && _cmeTimer > 420 + Math.random() * 360) {
                _cme = {
                    x:       W * (0.08 + Math.random() * 0.84),
                    life:    0,
                    maxLife: 88,
                    maxR:    H * (0.28 + Math.random() * 0.22)
                };
                _cmeTimer = 0;
            }
            if (_cme) {
                _cme.life += dt;
                if (_cme.life >= _cme.maxLife) _cme = null;
            }
        },

        draw(ctx) {
            const W = Renderer.W, H = Renderer.H;
            const fc = _fc;
            const SURF_Y = H - SURF_Y_OFFSET;

            // ── Sky gradient: deep space → hot corona ─────────────────────
            const sky = ctx.createLinearGradient(0, 0, 0, H);
            sky.addColorStop(0,    '#020100');
            sky.addColorStop(0.22, '#0e0400');
            sky.addColorStop(0.48, '#2a0900');
            sky.addColorStop(0.70, '#4e1500');
            sky.addColorStop(0.87, '#7e2800');
            sky.addColorStop(1,    '#ff5800');
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, W, H);

            // ── Multi-layer corona glow ───────────────────────────────────
            const coOuter = ctx.createRadialGradient(W/2, H, 0, W/2, H, H * 0.82);
            coOuter.addColorStop(0,   'rgba(255,185,42,0.07)');
            coOuter.addColorStop(0.4, 'rgba(255,100,12,0.04)');
            coOuter.addColorStop(1,   'rgba(255,50,0,0)');
            ctx.fillStyle = coOuter;
            ctx.fillRect(0, 0, W, H);

            const coInner = ctx.createRadialGradient(W/2, H, 0, W/2, H, H * 0.45);
            coInner.addColorStop(0,   'rgba(255,218,82,0.22)');
            coInner.addColorStop(0.30,'rgba(255,148,22,0.13)');
            coInner.addColorStop(0.70,'rgba(255,82,0,0.05)');
            coInner.addColorStop(1,   'rgba(255,42,0,0)');
            ctx.fillStyle = coInner;
            ctx.fillRect(0, H * 0.35, W, H * 0.65);

            const coBulge = ctx.createRadialGradient(W*0.38, H, 0, W*0.38, H, H * 0.35);
            coBulge.addColorStop(0,   'rgba(255,200,60,0.08)');
            coBulge.addColorStop(1,   'rgba(255,80,0,0)');
            ctx.fillStyle = coBulge;
            ctx.fillRect(0, H * 0.50, W, H * 0.50);

            // ── Stars (dim through corona atmosphere) ─────────────────────
            for (const s of _stars) {
                ctx.globalAlpha = s.alpha * (0.68 + 0.32 * Math.sin(s.twinkle + fc * 0.038));
                ctx.fillStyle   = '#ffe8b0';
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;

            // ── Background planet (distant body in upper sky) ─────────────
            {
                const bp = _bgPlanet;
                const bc = bp.col;
                ctx.save();
                ctx.translate(bp.x, bp.y);
                const pg = ctx.createRadialGradient(-bp.r*0.30, -bp.r*0.30, 0, 0, 0, bp.r);
                pg.addColorStop(0,   `rgba(${Math.min(255,bc[0]+45)},${Math.min(255,bc[1]+32)},${Math.min(255,bc[2]+20)},0.62)`);
                pg.addColorStop(1,   `rgba(${bc[0]},${bc[1]},${bc[2]},0.50)`);
                ctx.fillStyle = pg;
                ctx.globalAlpha = 0.65;
                ctx.beginPath(); ctx.arc(0, 0, bp.r, 0, Math.PI * 2); ctx.fill();
                const ag = ctx.createRadialGradient(0, 0, bp.r * 0.84, 0, 0, bp.r * 1.30);
                ag.addColorStop(0, `rgba(${bc[0]},${bc[1]},${bc[2]},0)`);
                ag.addColorStop(1, `rgba(${bc[0]},${bc[1]},${bc[2]},0.32)`);
                ctx.fillStyle = ag;
                ctx.globalAlpha = 0.52;
                ctx.beginPath(); ctx.arc(0, 0, bp.r * 1.30, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
                ctx.restore();
            }

            // ── Coronal magnetic field arcs ───────────────────────────────
            for (let i = 0; i < 10; i++) {
                const ax = W * (0.06 + (i / 10) * 0.88);
                const ht = H * (0.038 + Math.sin(fc * 0.016 + i * 0.92) * 0.022);
                ctx.globalAlpha = Math.max(0, 0.028 + Math.sin(fc * 0.024 + i) * 0.014);
                ctx.strokeStyle = '#ffb040';
                ctx.lineWidth   = 0.85;
                ctx.beginPath();
                ctx.moveTo(ax - 20, SURF_Y);
                ctx.quadraticCurveTo(ax + (Math.random() < 0.5 ? 12 : -12), SURF_Y - ht, ax + 20, SURF_Y);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // ── Solar flares (two-pass: outer glow + bright core) ─────────
            ctx.lineCap = 'round';
            for (const f of _flares) {
                const t   = f.life / f.maxLife;
                const fa  = t < 0.18 ? t / 0.18 : t > 0.72 ? (1 - t) / 0.28 : 1;
                const len = f.length * Math.sin(t * Math.PI);
                const ex  = f.x + Math.cos(f.angle) * len;
                const ey  = f.baseY + Math.sin(f.angle) * len;
                const cpx = f.x + Math.cos(f.angle) * len * 0.50 + f.bendX;
                const cpy = f.baseY + Math.sin(f.angle) * len * 0.50;

                const fgO = ctx.createLinearGradient(f.x, f.baseY, ex, ey);
                fgO.addColorStop(0,   'rgba(255,200,80,0.9)');
                fgO.addColorStop(0.45,'rgba(255,105,18,0.55)');
                fgO.addColorStop(1,   'rgba(255,40,0,0)');
                ctx.globalAlpha = fa * 0.30;
                ctx.strokeStyle = fgO;
                ctx.lineWidth   = f.width * (1 - t * 0.35) * 2.4;
                ctx.beginPath(); ctx.moveTo(f.x, f.baseY); ctx.quadraticCurveTo(cpx, cpy, ex, ey); ctx.stroke();

                const fgC = ctx.createLinearGradient(f.x, f.baseY, ex, ey);
                fgC.addColorStop(0,   'rgba(255,245,105,1)');
                fgC.addColorStop(0.35,'rgba(255,132,12,0.88)');
                fgC.addColorStop(1,   'rgba(255,52,0,0)');
                ctx.globalAlpha = fa * 0.75;
                ctx.strokeStyle = fgC;
                ctx.lineWidth   = f.width * (1 - t * 0.44);
                ctx.beginPath(); ctx.moveTo(f.x, f.baseY); ctx.quadraticCurveTo(cpx, cpy, ex, ey); ctx.stroke();

                ctx.globalAlpha = fa * 0.38 * (1 - t * 0.62);
                const bf = ctx.createRadialGradient(f.x, f.baseY, 0, f.x, f.baseY, f.width * 3.2);
                bf.addColorStop(0, 'rgba(255,255,190,1)');
                bf.addColorStop(1, 'rgba(255,120,0,0)');
                ctx.fillStyle = bf;
                ctx.beginPath(); ctx.arc(f.x, f.baseY, f.width * 3.2, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.lineCap = 'butt';

            // ── Prominences (plasma loops arching above surface) ──────────
            ctx.lineCap = 'round';
            for (const p of _prominences) {
                const t  = p.life / p.maxLife;
                const fa = t < 0.14 ? t / 0.14 : t > 0.82 ? (1 - t) / 0.18 : 1;
                const ht = p.height * Math.sin(t * Math.PI);
                const cpx = p.x + p.twist * p.span;
                const cpy = SURF_Y - ht;
                const x0  = p.x - p.span, x1 = p.x + p.span;

                ctx.globalAlpha = fa * 0.20;
                ctx.strokeStyle = `rgba(${p.col[0]},${p.col[1]},${p.col[2]},0.7)`;
                ctx.lineWidth   = 9;
                ctx.beginPath(); ctx.moveTo(x0, SURF_Y); ctx.quadraticCurveTo(cpx, cpy, x1, SURF_Y); ctx.stroke();

                const pg = ctx.createLinearGradient(x0, SURF_Y, x1, SURF_Y);
                pg.addColorStop(0,   'rgba(0,0,0,0)');
                pg.addColorStop(0.18,`rgba(${p.col[0]},${p.col[1]},${p.col[2]},0.72)`);
                pg.addColorStop(0.50,`rgba(${p.col[0]},${p.col[1]},${p.col[2]},0.92)`);
                pg.addColorStop(0.82,`rgba(${p.col[0]},${p.col[1]},${p.col[2]},0.72)`);
                pg.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.globalAlpha = fa * 0.62;
                ctx.strokeStyle = pg;
                ctx.lineWidth   = 2.2 + (1 - t) * 1.8;
                ctx.beginPath(); ctx.moveTo(x0, SURF_Y); ctx.quadraticCurveTo(cpx, cpy, x1, SURF_Y); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.lineCap = 'butt';

            // ── CME (Coronal Mass Ejection — rare dramatic eruption) ───────
            if (_cme) {
                const ct  = _cme.life / _cme.maxLife;
                const cfa = ct < 0.14 ? ct / 0.14 : 1 - (ct - 0.14) / 0.86;
                const cr  = _cme.maxR * ct;
                // Main plasma ejection
                const cg = ctx.createRadialGradient(_cme.x, SURF_Y, 0, _cme.x, SURF_Y, cr);
                cg.addColorStop(0,    `rgba(255,245,120,${cfa * 0.68})`);
                cg.addColorStop(0.28, `rgba(255,140,20,${cfa * 0.38})`);
                cg.addColorStop(0.65, `rgba(255,55,0,${cfa * 0.14})`);
                cg.addColorStop(1,    'rgba(255,0,0,0)');
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.arc(_cme.x, SURF_Y, cr, Math.PI, Math.PI * 2); ctx.fill();
                // Shockwave leading edge ring
                const swg = ctx.createRadialGradient(_cme.x, SURF_Y, cr * 0.88, _cme.x, SURF_Y, cr);
                swg.addColorStop(0,    'rgba(255,210,80,0)');
                swg.addColorStop(0.55, `rgba(255,200,70,${cfa * 0.28})`);
                swg.addColorStop(1,    'rgba(255,140,20,0)');
                ctx.fillStyle = swg;
                ctx.beginPath(); ctx.arc(_cme.x, SURF_Y, cr, Math.PI, Math.PI * 2); ctx.fill();
            }

            // ── Stellar-wind curtains: 两侧从表面升腾的等离子帘（加色辉光，正弦摇曳）──
            ctx.globalCompositeOperation = 'lighter';
            for (let side = 0; side < 2; side++) {
                const baseX = side === 0 ? W * 0.18 : W * 0.82;
                for (let k = 0; k < 5; k++) {
                    const xx = baseX + (k - 2) * 12 + Math.sin(fc * 0.012 + k + side * 2) * 18;
                    const cg = ctx.createLinearGradient(0, SURF_Y, 0, H * 0.10);
                    cg.addColorStop(0, 'rgba(255,170,60,0.055)');
                    cg.addColorStop(1, 'rgba(255,120,30,0)');
                    ctx.fillStyle = cg;
                    ctx.fillRect(xx - 10, H * 0.10, 20, SURF_Y - H * 0.10);
                }
            }
            ctx.globalCompositeOperation = 'source-over';

            // ── Solar wind streams ────────────────────────────────────────
            ctx.lineCap = 'round';
            for (const s of _streams) {
                const sg = ctx.createLinearGradient(s.x, s.y + s.len, s.x + Math.sin(s.phase) * 14, s.y);
                sg.addColorStop(0, `rgba(${s.col[0]},${s.col[1]},${s.col[2]},${s.alpha})`);
                sg.addColorStop(1, `rgba(${s.col[0]},${s.col[1]},${s.col[2]},0)`);
                ctx.strokeStyle = sg;
                ctx.lineWidth   = 1.1 + Math.sin(s.phase * 2.8) * 0.45;
                ctx.globalAlpha = 0.82;
                ctx.beginPath();
                ctx.moveTo(s.x, s.y + s.len);
                ctx.lineTo(s.x + Math.sin(s.phase) * 14, s.y);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.lineCap = 'butt';

            // ── Solar surface band ────────────────────────────────────────
            const surf = ctx.createLinearGradient(0, SURF_Y, 0, H);
            surf.addColorStop(0,    '#ffa800');
            surf.addColorStop(0.22, '#ff7c00');
            surf.addColorStop(0.52, '#ff5600');
            surf.addColorStop(1,    '#cc3a00');
            ctx.fillStyle = surf;
            ctx.fillRect(0, SURF_Y, W, H - SURF_Y);

            // Convection cells (granulation) — two offset layers
            const CS = 26;
            for (let sx = 0; sx < W; sx += CS) {
                const phase  = fc * 0.080 + sx * 0.108;   // 翻倍闪动 → 表面更"沸腾"
                const amp    = 4.5 + Math.sin(phase) * 3.2;
                const bright = 0.12 + Math.abs(Math.sin(phase * 0.72)) * 0.15;
                const cg = ctx.createRadialGradient(sx, SURF_Y, 0, sx, SURF_Y, CS * 1.15);
                cg.addColorStop(0,   `rgba(255,242,115,${bright})`);
                cg.addColorStop(0.5, `rgba(255,165,32,${bright * 0.38})`);
                cg.addColorStop(1,   'rgba(255,80,0,0)');
                ctx.fillStyle = cg;
                ctx.fillRect(sx - CS, SURF_Y - amp, CS * 2, amp + 7);
            }
            for (let sx = CS / 2; sx < W; sx += CS) {
                const phase  = fc * 0.072 + sx * 0.092 + 1.55;
                const bright = 0.07 + Math.abs(Math.sin(phase * 0.80)) * 0.10;
                const cg = ctx.createRadialGradient(sx, SURF_Y + 12, 0, sx, SURF_Y + 12, CS * 0.92);
                cg.addColorStop(0,   `rgba(255,185,52,${bright})`);
                cg.addColorStop(1,   'rgba(255,80,0,0)');
                ctx.fillStyle = cg;
                ctx.fillRect(sx - CS, SURF_Y + 4, CS * 2, 16);
            }

            // ── Chromosphere (thin pinkish-red layer at surface boundary) ─
            const chromo = ctx.createLinearGradient(0, SURF_Y - 12, 0, SURF_Y + 5);
            chromo.addColorStop(0,    'rgba(255,55,115,0)');
            chromo.addColorStop(0.42, 'rgba(255,50,95,0.32)');
            chromo.addColorStop(0.75, 'rgba(255,78,58,0.18)');
            chromo.addColorStop(1,    'rgba(255,100,0,0)');
            ctx.fillStyle = chromo;
            ctx.fillRect(0, SURF_Y - 12, W, 17);

            // ── Sunspots (umbra + penumbra gradient) ──────────────────────
            for (const sp of _sunspots) {
                const p = 1 + Math.sin(sp.pulse) * 0.10;

                const pg = ctx.createRadialGradient(sp.x, sp.y, sp.rx * p * 0.5, sp.x, sp.y, sp.rx * p * 1.75);
                pg.addColorStop(0,   'rgba(75, 18, 0, 0.58)');
                pg.addColorStop(0.5, 'rgba(145,52, 0, 0.32)');
                pg.addColorStop(1,   'rgba(200,80, 0, 0)');
                ctx.fillStyle = pg;
                ctx.beginPath(); ctx.ellipse(sp.x, sp.y, sp.rx*p*1.75, sp.ry*p*1.75, 0, 0, Math.PI*2); ctx.fill();

                ctx.fillStyle = 'rgba(38, 7, 0, 0.92)';
                ctx.beginPath(); ctx.ellipse(sp.x, sp.y, sp.rx*p, sp.ry*p, 0, 0, Math.PI*2); ctx.fill();
            }

            // ── Planet silhouettes (transiting across solar disk) ─────────
            for (const p of _planets) {
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
                const pg = ctx.createRadialGradient(p.x, p.y, p.r * 0.72, p.x, p.y, p.r * 1.58);
                pg.addColorStop(0, 'rgba(0,0,0,0)');
                pg.addColorStop(1, 'rgba(100,48,0,0.38)');
                ctx.fillStyle = pg;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.58, 0, Math.PI * 2); ctx.fill();
            }

            // ── Lens flares (sun-in-frame optical effect, drawn last) ─────
            const lfPulse = 0.80 + 0.20 * Math.sin(fc * 0.038);
            for (const lf of _lensFlares) {
                const lx = W * (0.5 + lf.xOff);
                const ly = H * lf.yFrac;
                const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, lf.r);
                lg.addColorStop(0,    `rgba(${lf.col[0]},${lf.col[1]},${lf.col[2]},${(lf.a * lfPulse).toFixed(3)})`);
                lg.addColorStop(0.50, `rgba(${lf.col[0]},${lf.col[1]},${lf.col[2]},${(lf.a * lfPulse * 0.28).toFixed(3)})`);
                lg.addColorStop(1,    'rgba(255,255,255,0)');
                ctx.fillStyle = lg;
                ctx.beginPath(); ctx.arc(lx, ly, lf.r, 0, Math.PI * 2); ctx.fill();
            }
        }
    };
})();

SceneRegistry.register({ label:'SOLAR SYSTEM', getScene:()=>SolarScene });
