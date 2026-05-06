var SpaceScene = (() => {
    let _stars = [], _nebulas = [], _meteors = [], _fc = 0;

    function _mkStar(initial) {
        const layer = Math.floor(Math.random() * 3);
        return {
            x: Math.random() * Renderer.W,
            y: initial ? Math.random() * Renderer.H : -5,
            r: [0.6, 1.2, 2.0][layer],
            spd: [0.6, 1.2, 2.2][layer],
            alpha: 0.3 + Math.random() * 0.7,
            twkSpd: 0.015 + Math.random() * 0.02,
            twkOff: Math.random() * Math.PI * 2
        };
    }

    return {
        init() {
            const W = Renderer.W, H = Renderer.H;
            _stars = Array.from({ length: 100 }, () => _mkStar(true));
            _nebulas = [
                { x: W * 0.19, y: H * 0.25, rx: W * 0.23, ry: 70,  col: 'rgba(80,40,120,',  spd: 0.08 },
                { x: W * 0.79, y: H * 0.62, rx: W * 0.27, ry: 90,  col: 'rgba(40,80,140,',  spd: 0.06 },
                { x: W * 0.42, y: H * 0.87, rx: W * 0.21, ry: 60,  col: 'rgba(100,30,80,',  spd: 0.09 }
            ];
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

            if (Math.random() < 0.004 * dt) {
                _meteors.push({ x: Math.random() * W, y: -20, vx: 2 + Math.random() * 3,
                    vy: 4 + Math.random() * 4, life: 40 + Math.random() * 30, maxLife: 70, trail: [] });
            }
            for (let i = _meteors.length - 1; i >= 0; i--) {
                const m = _meteors[i];
                m.trail.push({ x: m.x, y: m.y });
                if (m.trail.length > 12) m.trail.shift();
                m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt;
                if (m.life <= 0) _meteors.splice(i, 1);
            }
        },
        draw(ctx) {
            const W = Renderer.W, H = Renderer.H;
            const bg = ctx.createLinearGradient(0, 0, 0, H);
            bg.addColorStop(0, '#000018'); bg.addColorStop(0.5, '#000028'); bg.addColorStop(1, '#000015');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

            for (const n of _nebulas) {
                const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, Math.max(n.rx, n.ry));
                g.addColorStop(0, n.col + '0.18)'); g.addColorStop(1, n.col + '0)');
                ctx.fillStyle = g;
                ctx.save(); ctx.scale(n.rx / Math.max(n.rx, n.ry), n.ry / Math.max(n.rx, n.ry));
                ctx.beginPath();
                ctx.arc(n.x * (Math.max(n.rx,n.ry)/n.rx), n.y * (Math.max(n.rx,n.ry)/n.ry), Math.max(n.rx,n.ry), 0, Math.PI*2);
                ctx.fill(); ctx.restore();
            }

            for (const s of _stars) {
                const twk = Math.sin(_fc * s.twkSpd + s.twkOff) * 0.35 + 0.65;
                ctx.globalAlpha = s.alpha * twk;
                ctx.fillStyle = '#c8d8ff';
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
                if (s.r > 1.5 && twk > 0.8) {
                    ctx.globalAlpha = s.alpha * twk * 0.35;
                    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 2.8, 0, Math.PI * 2); ctx.fill();
                }
            }
            ctx.globalAlpha = 1;

            for (const m of _meteors) {
                const prog = m.life / m.maxLife;
                for (let i = 1; i < m.trail.length; i++) {
                    ctx.globalAlpha = (i / m.trail.length) * prog * 0.7;
                    ctx.strokeStyle = '#adf'; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.moveTo(m.trail[i-1].x, m.trail[i-1].y);
                    ctx.lineTo(m.trail[i].x, m.trail[i].y); ctx.stroke();
                }
                ctx.globalAlpha = prog;
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(m.x, m.y, 2, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
    };
})();

SceneRegistry.register({ label:'DEEP SPACE', getScene:()=>SpaceScene });
