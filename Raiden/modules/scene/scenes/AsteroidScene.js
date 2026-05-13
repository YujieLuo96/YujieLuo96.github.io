var AsteroidScene = (() => {
    let _stars = [], _asteroids = [], _dust = [], _clouds = [], _fc = 0;
    let _bgPlanet = null, _farAsteroids = [], _collisionFlash = null;
    const ASTEROID_COUNT = 22, DUST_COUNT = 60, CLOUD_COUNT = 8;

    // Fixed light source direction (upper-right)
    const LX = 0.48, LY = -0.88;

    function _makeAsteroid(W, H, initial) {
        const sz = 12 + Math.random() * 46;
        const x  = initial ? Math.random() * W : W + sz + 10;
        const y  = initial ? Math.random() * H : Math.random() * H * 0.94;
        const n  = 7 + Math.floor(Math.random() * 5);
        const pts = [];
        for (let i = 0; i < n; i++) {
            const angle = (i / n) * Math.PI * 2;
            pts.push({ a: angle, r: sz * (0.58 + Math.random() * 0.58) });
        }
        // Asteroid type: C-type (dark carbon), S-type (stony), M-type (metallic)
        const kind = Math.random();
        let col, hi, lo, glowCol;
        if (kind < 0.42) {
            const g = 32 + Math.floor(Math.random() * 28);
            col = [g+2,  g-2,  g-8];
            hi  = [g+32, g+24, g+14];
            lo  = [Math.max(0,g-22), Math.max(0,g-26), Math.max(0,g-28)];
            glowCol = null;
        } else if (kind < 0.78) {
            const g = 68 + Math.floor(Math.random() * 52);
            col = [g+12, g+2,  Math.max(0,g-14)];
            hi  = [Math.min(255,g+60), Math.min(255,g+46), Math.min(255,g+22)];
            lo  = [Math.max(0,g-30), Math.max(0,g-36), Math.max(0,g-40)];
            glowCol = null;
        } else {
            const g = 60 + Math.floor(Math.random() * 42);
            col = [g+4,  g+6,  g+10];
            hi  = [Math.min(255,g+58), Math.min(255,g+60), Math.min(255,g+66)];
            lo  = [Math.max(0,g-28),   Math.max(0,g-26),   Math.max(0,g-20)];
            glowCol = `rgba(130,155,255,0.10)`;
        }
        // Craters
        const craters = [];
        const nc = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < nc; i++) {
            craters.push({
                cx: (Math.random() - 0.5) * sz * 0.70,
                cy: (Math.random() - 0.5) * sz * 0.55,
                r:  sz * (0.07 + Math.random() * 0.16)
            });
        }
        return {
            x, y, sz, pts, craters, col, hi, lo, glowCol,
            vx: -(0.30 + Math.random() * 0.72),
            vy: (Math.random() - 0.5) * 0.30,
            rot: Math.random() * Math.PI * 2,
            rotSpd: (Math.random() - 0.5) * 0.013,
            trailLen: Math.random() < 0.28 ? 8 + Math.random() * 20 : 0
        };
    }

    function _makeBgPlanet(W, H) {
        const warm = Math.random() < 0.55;
        return {
            x:    W + 85,
            y:    H * (0.07 + Math.random() * 0.30),
            r:    36 + Math.random() * 24,
            vx:   -(0.010 + Math.random() * 0.016),
            col:  warm ? [195, 130, 70] : [72, 112, 195],
            ring: warm ? 'rgba(215,182,118,' : 'rgba(128,155,205,'
        };
    }

    return {
        init() {
            const W = Renderer.W, H = Renderer.H;
            _fc = 0;
            // Stars with Milky Way band concentration
            _stars = [];
            for (let i = 0; i < 190; i++) {
                const inBand = Math.random() < 0.40;
                const sx = Math.random() * W;
                const sy = inBand
                    ? H * 0.28 + (Math.random() - 0.5) * H * 0.60 + (sx - W * 0.5) * 0.22
                    : Math.random() * H;
                const t = Math.random();
                _stars.push({
                    x: sx, y: sy,
                    r:     Math.random() * (inBand ? 1.6 : 1.2) + 0.15,
                    alpha: (inBand ? 0.28 : 0.20) + Math.random() * 0.68,
                    twinkle: Math.random() * Math.PI * 2,
                    speed:   0.015 + Math.random() * 0.030,
                    color: t < 0.22 ? '#aac4ff' : (t < 0.32 ? '#ffeedd' : '#ffffff'),
                    bright: inBand && Math.random() < 0.08
                });
            }
            // Asteroids
            _asteroids = [];
            for (let i = 0; i < ASTEROID_COUNT; i++) _asteroids.push(_makeAsteroid(W, H, true));
            // Dust streaks
            _dust = [];
            for (let i = 0; i < DUST_COUNT; i++) {
                _dust.push({
                    x:     Math.random() * W,
                    y:     Math.random() * H,
                    len:   6 + Math.random() * 40,
                    vx:    -(0.65 + Math.random() * 1.45),
                    alpha: 0.04 + Math.random() * 0.15,
                    tilt:  (Math.random() - 0.5) * 0.18,
                    col:   Math.random() < 0.30 ? '#b8aacc' : '#8899bb'
                });
            }
            // Diffuse dust clouds (slow-moving elliptical blobs)
            _clouds = [];
            for (let i = 0; i < CLOUD_COUNT; i++) {
                const col = Math.random() < 0.50
                    ? [70, 44, 140]
                    : [36, 56, 110];
                _clouds.push({
                    x:    Math.random() * W,
                    y:    Math.random() * H,
                    rx:   55 + Math.random() * 130,
                    ry:   28 + Math.random() * 72,
                    rot:  Math.random() * Math.PI,
                    alpha:0.042 + Math.random() * 0.072,
                    col,
                    vx:   -(0.038 + Math.random() * 0.075)
                });
            }
            // Background gas giant
            _bgPlanet = _makeBgPlanet(W, H);
            // Far-field small asteroid layer
            _farAsteroids = Array.from({ length: 18 }, () => {
                const g = 28 + Math.floor(Math.random() * 38);
                return {
                    x:     Math.random() * W,
                    y:     Math.random() * H,
                    r:     2.5 + Math.random() * 4.5,
                    vx:    -(0.08 + Math.random() * 0.12),
                    alpha: 0.18 + Math.random() * 0.24,
                    g
                };
            });
            _collisionFlash = null;
        },

        update(dt) {
            _fc += dt;
            const W = Renderer.W, H = Renderer.H;
            for (const s of _stars) s.twinkle += s.speed * dt;
            for (const a of _asteroids) {
                a.x += a.vx * dt;
                a.y += a.vy * dt;
                a.rot += a.rotSpd * dt;
                if (a.x < -a.sz * 2) Object.assign(a, _makeAsteroid(W, H, false));
            }
            for (const d of _dust) {
                d.x += d.vx * dt;
                if (d.x < -d.len) { d.x = W + d.len; d.y = Math.random() * H; }
            }
            for (const c of _clouds) {
                c.x += c.vx * dt;
                if (c.x + c.rx < 0) c.x = W + c.rx;
            }
            // Background planet
            _bgPlanet.x += _bgPlanet.vx * dt;
            if (_bgPlanet.x + _bgPlanet.r * 2.5 < 0) _bgPlanet = _makeBgPlanet(W, H);
            // Far asteroids
            for (const fa of _farAsteroids) {
                fa.x += fa.vx * dt;
                if (fa.x + fa.r < 0) { fa.x = W + fa.r * 2; fa.y = Math.random() * H; }
            }
            // Collision flash (rare event)
            if (!_collisionFlash && Math.random() < 0.0012 * dt) {
                _collisionFlash = {
                    x: W * (0.08 + Math.random() * 0.84),
                    y: H * (0.08 + Math.random() * 0.84),
                    r: 9 + Math.random() * 14,
                    life: 0, maxLife: 9
                };
            }
            if (_collisionFlash) {
                _collisionFlash.life += dt;
                if (_collisionFlash.life >= _collisionFlash.maxLife) _collisionFlash = null;
            }
        },

        draw(ctx) {
            const W = Renderer.W, H = Renderer.H;
            const fc = _fc;

            // ── Background ─────────────────────────────────────────────────
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0,    '#010014');
            bg.addColorStop(0.38, '#03001c');
            bg.addColorStop(0.72, '#050018');
            bg.addColorStop(1,    '#020010');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);

            // ── Milky Way band (diagonal diffuse glow) ──────────────────────
            const mw = ctx.createLinearGradient(0, H * 0.65, W, H * 0.05);
            mw.addColorStop(0,    'rgba(0,0,0,0)');
            mw.addColorStop(0.28, 'rgba(38,18,82,0.12)');
            mw.addColorStop(0.50, 'rgba(52,28,98,0.17)');
            mw.addColorStop(0.72, 'rgba(32,15,68,0.10)');
            mw.addColorStop(1,    'rgba(0,0,0,0)');
            ctx.fillStyle = mw;
            ctx.fillRect(0, 0, W, H);

            // ── Background gas giant (deepest layer) ─────────────────────────
            {
                const p = _bgPlanet;
                const c = p.col;
                const RING_R = p.r * 1.72;
                const TILT   = 0.26;
                ctx.save();
                ctx.translate(p.x, p.y);
                // Back ring half (upper semicircle, behind planet body)
                ctx.save();
                ctx.scale(1, TILT);
                ctx.strokeStyle = p.ring + '0.42)';
                ctx.lineWidth   = p.r * 0.22;
                ctx.globalAlpha = 0.72;
                ctx.beginPath(); ctx.arc(0, 0, RING_R, Math.PI, Math.PI * 2); ctx.stroke();
                ctx.restore();
                // Planet body
                const pg = ctx.createRadialGradient(-p.r*0.28, -p.r*0.28, 0, 0, 0, p.r);
                pg.addColorStop(0,   `rgb(${Math.min(255,c[0]+48)},${Math.min(255,c[1]+35)},${Math.min(255,c[2]+22)})`);
                pg.addColorStop(0.55,`rgb(${c[0]},${c[1]},${c[2]})`);
                pg.addColorStop(1,   `rgb(${Math.max(0,c[0]-42)},${Math.max(0,c[1]-35)},${Math.max(0,c[2]-30)})`);
                ctx.fillStyle = pg;
                ctx.globalAlpha = 0.88;
                ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
                // Atmosphere limb glow
                const ag = ctx.createRadialGradient(0, 0, p.r * 0.86, 0, 0, p.r * 1.24);
                ag.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0)`);
                ag.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0.38)`);
                ctx.fillStyle = ag;
                ctx.globalAlpha = 0.58;
                ctx.beginPath(); ctx.arc(0, 0, p.r * 1.24, 0, Math.PI * 2); ctx.fill();
                // Front ring half (lower semicircle, in front of planet body)
                ctx.save();
                ctx.scale(1, TILT);
                ctx.strokeStyle = p.ring + '0.60)';
                ctx.lineWidth   = p.r * 0.22;
                ctx.globalAlpha = 0.90;
                ctx.beginPath(); ctx.arc(0, 0, RING_R, 0, Math.PI); ctx.stroke();
                ctx.restore();
                ctx.globalAlpha = 1;
                ctx.restore();
            }

            // ── Nebula wisps ─────────────────────────────────────────────────
            const nebulae = [
                { x: W*0.14, y: H*0.24, r: W*0.32, c: [75, 35, 160] },
                { x: W*0.80, y: H*0.62, r: W*0.25, c: [28, 52, 128] },
                { x: W*0.46, y: H*0.07, r: W*0.22, c: [95, 22, 118] },
                { x: W*0.92, y: H*0.18, r: W*0.20, c: [18, 36,  95] },
            ];
            for (const nb of nebulae) {
                const ng = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, nb.r);
                ng.addColorStop(0,   `rgba(${nb.c[0]},${nb.c[1]},${nb.c[2]},0.14)`);
                ng.addColorStop(0.5, `rgba(${nb.c[0]},${nb.c[1]},${nb.c[2]},0.05)`);
                ng.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = ng;
                ctx.fillRect(0, 0, W, H);
            }

            // ── Dust clouds ──────────────────────────────────────────────────
            for (const c of _clouds) {
                ctx.save();
                ctx.translate(c.x, c.y);
                ctx.rotate(c.rot);
                const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, c.rx);
                cg.addColorStop(0,   `rgba(${c.col[0]},${c.col[1]},${c.col[2]},${c.alpha})`);
                cg.addColorStop(0.6, `rgba(${c.col[0]},${c.col[1]},${c.col[2]},${c.alpha * 0.35})`);
                cg.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = cg;
                ctx.scale(1, c.ry / c.rx);
                ctx.beginPath(); ctx.arc(0, 0, c.rx, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }

            // ── Stars ────────────────────────────────────────────────────────
            for (const s of _stars) {
                const alpha = s.alpha * (0.66 + 0.34 * Math.sin(s.twinkle));
                ctx.globalAlpha = alpha;
                ctx.fillStyle   = s.color;
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
                // Bright stars: faint diffraction cross
                if (s.bright && alpha > 0.55) {
                    ctx.globalAlpha = alpha * 0.28;
                    ctx.strokeStyle = s.color;
                    ctx.lineWidth   = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(s.x - s.r * 3, s.y); ctx.lineTo(s.x + s.r * 3, s.y);
                    ctx.moveTo(s.x, s.y - s.r * 3); ctx.lineTo(s.x, s.y + s.r * 3);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;

            // ── Far-field small asteroids (depth layer) ──────────────────────
            for (const fa of _farAsteroids) {
                ctx.globalAlpha = fa.alpha;
                ctx.fillStyle   = `rgb(${fa.g},${fa.g},${fa.g})`;
                ctx.beginPath(); ctx.arc(fa.x, fa.y, fa.r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;

            // ── Dust streaks (angled, varying color) ─────────────────────────
            ctx.lineCap = 'round';
            for (const d of _dust) {
                ctx.globalAlpha = d.alpha;
                ctx.strokeStyle = d.col;
                ctx.lineWidth   = 0.75;
                ctx.beginPath();
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x + d.len, d.y + d.len * d.tilt);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.lineCap = 'butt';

            // ── Asteroids ────────────────────────────────────────────────────
            ctx.lineCap = 'round';
            for (const a of _asteroids) {
                // Dust trail (world-space, drawn before body so it renders behind)
                if (a.trailLen) {
                    const tg = ctx.createLinearGradient(a.x + a.sz, a.y, a.x + a.sz + a.trailLen, a.y);
                    tg.addColorStop(0, 'rgba(155,145,170,0.14)');
                    tg.addColorStop(1, 'rgba(155,145,170,0)');
                    ctx.strokeStyle = tg;
                    ctx.lineWidth   = Math.max(2.5, a.sz * 0.38);
                    ctx.globalAlpha = 0.55;
                    ctx.beginPath();
                    ctx.moveTo(a.x + a.sz * 0.88, a.y);
                    ctx.lineTo(a.x + a.sz + a.trailLen, a.y);
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }

                ctx.save();
                ctx.translate(a.x, a.y);
                ctx.rotate(a.rot);

                // M-type metallic ambient glow
                if (a.glowCol) {
                    const gg = ctx.createRadialGradient(0, 0, a.sz * 0.5, 0, 0, a.sz * 1.7);
                    gg.addColorStop(0, a.glowCol);
                    gg.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = gg;
                    ctx.beginPath(); ctx.arc(0, 0, a.sz * 1.7, 0, Math.PI * 2); ctx.fill();
                }

                // Body: highlight from light source direction
                const hx = -a.sz * LX * 0.40, hy = -a.sz * LY * 0.40;
                const ag = ctx.createRadialGradient(hx, hy, 0, hx * 0.35, hy * 0.35, a.sz * 1.18);
                ag.addColorStop(0,    `rgb(${a.hi[0]},${a.hi[1]},${a.hi[2]})`);
                ag.addColorStop(0.40, `rgb(${a.col[0]},${a.col[1]},${a.col[2]})`);
                ag.addColorStop(1,    `rgb(${a.lo[0]},${a.lo[1]},${a.lo[2]})`);

                ctx.beginPath();
                ctx.moveTo(a.pts[0].r * Math.cos(a.pts[0].a), a.pts[0].r * Math.sin(a.pts[0].a));
                for (let i = 1; i < a.pts.length; i++) {
                    ctx.lineTo(a.pts[i].r * Math.cos(a.pts[i].a), a.pts[i].r * Math.sin(a.pts[i].a));
                }
                ctx.closePath();
                ctx.fillStyle   = ag;
                ctx.fill();
                ctx.strokeStyle = `rgba(${a.lo[0]},${a.lo[1]},${a.lo[2]},0.72)`;
                ctx.lineWidth   = 0.9;
                ctx.stroke();

                // Craters
                for (const c of a.craters) {
                    ctx.fillStyle = 'rgba(0,0,0,0.50)';
                    ctx.beginPath(); ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = `rgba(${a.hi[0]},${a.hi[1]},${a.hi[2]},0.24)`;
                    ctx.lineWidth   = 0.7;
                    ctx.beginPath();
                    ctx.arc(c.cx - c.r * LX * 0.28, c.cy - c.r * LY * 0.28,
                        c.r * 1.06, Math.PI * 0.85, Math.PI * 1.85);
                    ctx.stroke();
                }

                ctx.restore();
            }
            ctx.lineCap = 'butt';

            // ── Collision flash (rare debris impact event) ───────────────────
            if (_collisionFlash) {
                const t  = _collisionFlash.life / _collisionFlash.maxLife;
                const fa = t < 0.30 ? t / 0.30 : (1 - t) / 0.70;
                const fg = ctx.createRadialGradient(
                    _collisionFlash.x, _collisionFlash.y, 0,
                    _collisionFlash.x, _collisionFlash.y, _collisionFlash.r);
                fg.addColorStop(0,    `rgba(255,255,220,${fa})`);
                fg.addColorStop(0.40, `rgba(255,200,80,${fa * 0.55})`);
                fg.addColorStop(1,    'rgba(255,100,0,0)');
                ctx.fillStyle = fg;
                ctx.beginPath(); ctx.arc(_collisionFlash.x, _collisionFlash.y, _collisionFlash.r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    };
})();

SceneRegistry.register({ label:'ASTEROID BELT', getScene:()=>AsteroidScene });
