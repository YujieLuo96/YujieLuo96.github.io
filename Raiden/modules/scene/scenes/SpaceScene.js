var SpaceScene = (() => {
    let _stars = [], _nebulas = [], _meteors = [], _fc = 0;
    let _deepStars = [], _warpLines = [];
    let _galaxy = null;
    let _meteorRate = 0.004;   // 每局随机：从稀疏到流星雨，增加重玩变化

    // 远方旋涡星系：场景焦点锚，给"穿行浩瀚宇宙"的尺度感（加色淡绘，缓慢自转漂移）
    function _mkGalaxy(W, H) {
        const arms = [];
        for (let arm = 0; arm < 2; arm++) {
            for (let i = 0; i < 64; i++) {
                const t = i / 64;
                arms.push({
                    r:    9 + t * 128,
                    a:    arm * Math.PI + t * 5.6,
                    size: 0.5 + Math.random() * 1.5,
                    br:   (1 - t) * 0.65 + 0.12,
                    col:  Math.random() < 0.5 ? '200,210,255' : '255,228,196',
                });
            }
        }
        return {
            x: W * (Math.random() < 0.5 ? 0.78 : 0.2),
            y: H * (0.16 + Math.random() * 0.14),
            rot: Math.random() * Math.PI, drift: -(0.003 + Math.random() * 0.004),
            tilt: 0.36 + Math.random() * 0.14, arms,
        };
    }

    function _drawGalaxy(ctx, g) {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.rot);
        ctx.scale(1, g.tilt);
        ctx.globalCompositeOperation = 'lighter';
        // 外晕
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 152);
        halo.addColorStop(0,   'rgba(170,160,255,0.05)');
        halo.addColorStop(0.4, 'rgba(110,80,200,0.022)');
        halo.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(0, 0, 152, 0, Math.PI * 2); ctx.fill();
        // 旋臂星点
        for (const d of g.arms) {
            ctx.globalAlpha = d.br * 0.16;
            ctx.fillStyle = `rgb(${d.col})`;
            ctx.beginPath(); ctx.arc(Math.cos(d.a) * d.r, Math.sin(d.a) * d.r, d.size, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 核球
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
        core.addColorStop(0,   'rgba(255,250,232,0.18)');
        core.addColorStop(0.4, 'rgba(255,222,176,0.08)');
        core.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }

    function _mkStar(initial) {
        const layer = Math.floor(Math.random() * 3);
        const t = Math.random();
        return {
            x:      Math.random() * Renderer.W,
            y:      initial ? Math.random() * Renderer.H : -5,
            r:      [0.6, 1.2, 2.0][layer],
            spd:    [0.6, 1.2, 2.2][layer],
            alpha:  0.3 + Math.random() * 0.7,
            twkSpd: 0.015 + Math.random() * 0.02,
            twkOff: Math.random() * Math.PI * 2,
            color:  t < 0.10 ? '#ffaa88' : t < 0.18 ? '#ffddcc' : t < 0.28 ? '#fffce8' : t < 0.33 ? '#aad4ff' : '#c8d8ff'
        };
    }

    function _mkWarpLine(W, H) {
        return {
            angle: Math.random() * Math.PI * 2,
            dist:  20 + Math.random() * Math.max(W, H) * 0.45,
            spd:   1.8 + Math.random() * 2.8,
            len:   10  + Math.random() * 22
        };
    }

    return {
        init() {
            const W = Renderer.W, H = Renderer.H;
            _stars     = Array.from({ length: 100 }, () => _mkStar(true));
            _deepStars = Array.from({ length: 300 }, () => ({ x: Math.random() * W, y: Math.random() * H }));
            _nebulas = [
                { x: W*0.19, y: H*0.25, rx: W*0.23, ry: 70,  col: 'rgba(80,40,120,',  spd: 0.08, pOff: 0.0 },
                { x: W*0.79, y: H*0.62, rx: W*0.27, ry: 90,  col: 'rgba(40,80,140,',  spd: 0.06, pOff: 1.2 },
                { x: W*0.42, y: H*0.87, rx: W*0.21, ry: 60,  col: 'rgba(100,30,80,',  spd: 0.09, pOff: 2.4 },
                { x: W*0.65, y: H*0.18, rx: W*0.24, ry: 65,  col: 'rgba(180,55,130,', spd: 0.07, pOff: 0.8 },
                { x: W*0.33, y: H*0.55, rx: W*0.18, ry: 50,  col: 'rgba(35,175,135,', spd: 0.05, pOff: 1.6 },
                { x: W*0.88, y: H*0.38, rx: W*0.16, ry: 44,  col: 'rgba(175,90,25,',  spd: 0.08, pOff: 3.1 },
                { x: W*0.52, y: H*0.72, rx: W*0.20, ry: 56,  col: 'rgba(45,60,170,',  spd: 0.06, pOff: 2.0 },
            ];
            _warpLines = Array.from({ length: 22 }, () => _mkWarpLine(W, H));
            _galaxy = _mkGalaxy(W, H);
            _meteorRate = 0.0028 + Math.random() * 0.0050;
            _meteors = [];
            _fc = 0;
        },

        update(dt) {
            const W = Renderer.W, H = Renderer.H;
            _fc += dt;
            for (const s of _stars) {
                s.y += s.spd * dt;
                if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
            }
            for (const n of _nebulas) { n.y += n.spd * dt; if (n.y > H + 100) n.y = -100; }

            if (Math.random() < _meteorRate * dt) {
                _meteors.push({
                    x: Math.random() * W, y: -20,
                    vx: 2 + Math.random() * 3, vy: 4 + Math.random() * 4,
                    life: 40 + Math.random() * 30, maxLife: 70, trail: [],
                    col: Math.random() < 0.25 ? '#ffcc88' : '#aaddff'
                });
            }
            for (let i = _meteors.length - 1; i >= 0; i--) {
                const m = _meteors[i];
                m.trail.push({ x: m.x, y: m.y });
                if (m.trail.length > 12) m.trail.shift();
                m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt;
                if (m.life <= 0) _meteors.splice(i, 1);
            }

            const maxD = Math.max(W, H) * 0.78;
            for (const wl of _warpLines) {
                wl.dist += wl.spd * dt;
                if (wl.dist > maxD) Object.assign(wl, _mkWarpLine(W, H), { dist: 15 + Math.random() * 50 });
            }

            if (_galaxy) {
                _galaxy.rot += 0.0006 * dt;
                _galaxy.x   += _galaxy.drift * dt;
                if (_galaxy.x < -180) { _galaxy.x = W + 180; _galaxy.y = H * (0.16 + Math.random() * 0.14); }
            }
        },

        draw(ctx) {
            const W = Renderer.W, H = Renderer.H;
            const bg = ctx.createLinearGradient(0, 0, 0, H);
            bg.addColorStop(0, '#000018'); bg.addColorStop(0.5, '#000028'); bg.addColorStop(1, '#000015');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

            // Deep field base layer — 300 pixel-sized distant stars, single batched pass
            ctx.globalAlpha = 0.09;
            ctx.fillStyle = '#c4d4f0';
            for (const ds of _deepStars) ctx.fillRect(ds.x | 0, ds.y | 0, 1, 1);
            ctx.globalAlpha = 1;

            // 远方旋涡星系（深空之后、星云之前）
            if (_galaxy) _drawGalaxy(ctx, _galaxy);

            for (const n of _nebulas) {
                const pulse = 0.82 + 0.18 * Math.sin(_fc * 0.007 + n.pOff);
                const a     = (0.15 * pulse).toFixed(2);   // 调暗星云：让它真正坐到星点之后（纵深更清晰）
                const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, Math.max(n.rx, n.ry));
                g.addColorStop(0, n.col + a + ')'); g.addColorStop(1, n.col + '0)');
                ctx.fillStyle = g;
                ctx.save(); ctx.scale(n.rx / Math.max(n.rx, n.ry), n.ry / Math.max(n.rx, n.ry));
                ctx.beginPath();
                ctx.arc(n.x * (Math.max(n.rx,n.ry)/n.rx), n.y * (Math.max(n.rx,n.ry)/n.ry), Math.max(n.rx,n.ry), 0, Math.PI*2);
                ctx.fill(); ctx.restore();
            }

            for (const s of _stars) {
                const twk = Math.sin(_fc * s.twkSpd + s.twkOff) * 0.35 + 0.65;
                ctx.globalAlpha = s.alpha * twk;
                ctx.fillStyle = s.color;
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
                if (s.r > 1.5 && twk > 0.8) {
                    ctx.globalAlpha = s.alpha * twk * 0.35;
                    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 2.8, 0, Math.PI * 2); ctx.fill();
                    if (s.alpha > 0.75) {
                        ctx.globalAlpha = s.alpha * twk * 0.15;
                        ctx.strokeStyle = s.color; ctx.lineWidth = 0.6;
                        ctx.beginPath();
                        ctx.moveTo(s.x - s.r * 4, s.y); ctx.lineTo(s.x + s.r * 4, s.y);
                        ctx.moveTo(s.x, s.y - s.r * 4); ctx.lineTo(s.x, s.y + s.r * 4);
                        ctx.stroke();
                    }
                }
            }
            ctx.globalAlpha = 1;

            // Warp lines — radiating from centre outward, single batched path
            const cx = W * 0.5, cy = H * 0.5;
            ctx.strokeStyle = '#b8d0f0';
            ctx.lineWidth = 0.55;
            ctx.globalAlpha = 0.08;
            ctx.beginPath();
            for (const wl of _warpLines) {
                const co = Math.cos(wl.angle), si = Math.sin(wl.angle);
                ctx.moveTo(cx + co * wl.dist,            cy + si * wl.dist);
                ctx.lineTo(cx + co * (wl.dist + wl.len), cy + si * (wl.dist + wl.len));
            }
            ctx.stroke();
            ctx.globalAlpha = 1;

            for (const m of _meteors) {
                const prog = m.life / m.maxLife;
                for (let i = 1; i < m.trail.length; i++) {
                    ctx.globalAlpha = (i / m.trail.length) * prog * 0.7;
                    ctx.strokeStyle = m.col; ctx.lineWidth = 1.6;
                    ctx.beginPath(); ctx.moveTo(m.trail[i-1].x, m.trail[i-1].y);
                    ctx.lineTo(m.trail[i].x, m.trail[i].y); ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;
            // 流星头部 + 再入灼烧光晕（加色脉冲，越靠近越炽烈）
            ctx.globalCompositeOperation = 'lighter';
            for (const m of _meteors) {
                const prog = m.life / m.maxLife;
                const aura = 4 + Math.sin(_fc * 0.3 + m.x * 0.1) * 1.4;
                const ag = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, aura * 2.6);
                ag.addColorStop(0,   `rgba(255,242,215,${(prog * 0.85).toFixed(2)})`);
                ag.addColorStop(0.5, `rgba(255,180,90,${(prog * 0.30).toFixed(2)})`);
                ag.addColorStop(1,   'rgba(255,120,40,0)');
                ctx.fillStyle = ag;
                ctx.beginPath(); ctx.arc(m.x, m.y, aura * 2.6, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
    };
})();

SceneRegistry.register({ label:'DEEP SPACE', getScene:()=>SpaceScene });
