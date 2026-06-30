// ──────────────────────────────────────────────────────────────────────────
//  CrystallineNebulaScene — 晶体星云
//  恒星残骸冷凝成的棱晶场：漂浮自转的多面晶体（棱面反光 + 内核辉光）、
//  分叉游走的能量裂隙、青紫双色星云。介于"恒星风暴"与"黑洞"之间的过渡带。
// ──────────────────────────────────────────────────────────────────────────
var CrystallineNebulaScene = (() => {
    let _stars = [], _crystals = [], _fissures = [], _motes = [], _fc = 0;

    function _mkCrystal(W, H, initial) {
        const sz    = 14 + Math.random() * 42;
        const sides = Math.random() < 0.5 ? 4 : 6;
        const verts = [];
        for (let i = 0; i < sides; i++) {
            const a = (i / sides) * Math.PI * 2;
            verts.push({ a, r: sz * (0.62 + Math.random() * 0.5) });
        }
        const palette = Math.random();
        const hue = palette < 0.4 ? 188 + Math.random() * 22       // ice-cyan
                  : palette < 0.7 ? 268 + Math.random() * 24       // violet
                  :                 152 + Math.random() * 24;      // aqua-green
        return {
            x: initial ? Math.random() * W : Math.random() * W,
            y: initial ? Math.random() * H : -sz - 10,
            sz, verts, hue,
            vy:  0.35 + Math.random() * 0.7,
            vx:  (Math.random() - 0.5) * 0.3,
            rot: Math.random() * Math.PI * 2,
            rotSpd: (Math.random() - 0.5) * 0.012,
            glintPhase: Math.random() * Math.PI * 2,
            depth: 0.5 + Math.random() * 0.7,
        };
    }

    function _mkFissure(W, H) {
        const x0 = Math.random() * W;
        return {
            x0, y0: -20,
            x1: x0 + (Math.random() - 0.5) * W * 0.4,
            y1: H * (0.4 + Math.random() * 0.5),
            cx: x0 + (Math.random() - 0.5) * W * 0.5,
            cy: H * (0.2 + Math.random() * 0.3),
            hue: 180 + Math.random() * 110,
            phase: Math.random() * Math.PI * 2,
            vy: 0.4 + Math.random() * 0.5,
            life: 0, maxLife: 260 + Math.random() * 200,
        };
    }

    return {
        init() {
            const W = Renderer.W, H = Renderer.H;
            _fc = 0;
            _stars    = Array.from({ length: 150 }, () => ({
                x: Math.random() * W, y: Math.random() * H,
                r: Math.random() * 1.4 + 0.2,
                alpha: 0.25 + Math.random() * 0.6,
                tw: Math.random() * Math.PI * 2, sp: 0.015 + Math.random() * 0.03,
                col: Math.random() < 0.3 ? '#c9a6ff' : (Math.random() < 0.3 ? '#a0ffe8' : '#dceaff'),
            }));
            _crystals = Array.from({ length: 26 }, () => _mkCrystal(W, H, true));
            _fissures = Array.from({ length: 4 }, () => _mkFissure(W, H));
            _motes    = Array.from({ length: 40 }, () => ({
                x: Math.random() * W, y: Math.random() * H,
                r: 0.5 + Math.random() * 1.4, vy: 0.3 + Math.random() * 0.6,
                hue: 170 + Math.random() * 110, a: 0.1 + Math.random() * 0.25,
            }));
        },

        update(dt) {
            const W = Renderer.W, H = Renderer.H;
            _fc += dt;
            for (const s of _stars) s.tw += s.sp * dt;
            for (const c of _crystals) {
                c.y   += c.vy * dt;
                c.x   += c.vx * dt;
                c.rot += c.rotSpd * dt;
                c.glintPhase += 0.03 * dt;
                if (c.y > H + c.sz + 10) Object.assign(c, _mkCrystal(W, H, false));
            }
            for (let i = _fissures.length - 1; i >= 0; i--) {
                const f = _fissures[i];
                f.life += dt; f.phase += 0.05 * dt;
                f.y0 += f.vy * dt; f.y1 += f.vy * dt; f.cy += f.vy * dt;
                if (f.life >= f.maxLife || f.y0 > H) _fissures[i] = _mkFissure(W, H);
            }
            for (const m of _motes) {
                m.y += m.vy * dt;
                if (m.y > H + 4) { m.y = -4; m.x = Math.random() * W; }
            }
        },

        draw(ctx) {
            const W = Renderer.W, H = Renderer.H;
            const fc = _fc;

            // ── 背景渐变 ─────────────────────────────────────────────────
            const bg = ctx.createLinearGradient(0, 0, 0, H);
            bg.addColorStop(0,   '#080018');
            bg.addColorStop(0.5, '#0c0226');
            bg.addColorStop(1,   '#04010f');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

            // ── 星云团块 ─────────────────────────────────────────────────
            const NB = [
                { x: W*0.22, y: H*0.28, r: W*0.34, c: '120,40,180' },
                { x: W*0.78, y: H*0.58, r: W*0.30, c: '30,160,150' },
                { x: W*0.5,  y: H*0.85, r: W*0.26, c: '60,80,200' },
            ];
            for (const n of NB) {
                const pulse = 0.85 + 0.15 * Math.sin(fc * 0.006 + n.x);
                const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
                g.addColorStop(0,   `rgba(${n.c},${(0.13 * pulse).toFixed(3)})`);
                g.addColorStop(0.5, `rgba(${n.c},0.05)`);
                g.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            }

            // ── 星点 ─────────────────────────────────────────────────────
            for (const s of _stars) {
                ctx.globalAlpha = s.alpha * (0.6 + 0.4 * Math.sin(s.tw));
                ctx.fillStyle = s.col;
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;

            // ── 能量裂隙（分叉贝塞尔等离子束） ───────────────────────────
            for (const f of _fissures) {
                const t = Math.min(1, f.life / 40) * Math.min(1, (f.maxLife - f.life) / 40);
                const wob = Math.sin(f.phase) * 12;
                ctx.shadowColor = `hsl(${f.hue},100%,60%)`; ctx.shadowBlur = 10;
                for (let pass = 0; pass < 2; pass++) {
                    ctx.strokeStyle = pass === 0
                        ? `hsla(${f.hue},100%,70%,${0.18 * t})`
                        : `hsla(${f.hue},100%,88%,${0.45 * t})`;
                    ctx.lineWidth = pass === 0 ? 5 : 1.6;
                    ctx.beginPath();
                    ctx.moveTo(f.x0, f.y0);
                    ctx.quadraticCurveTo(f.cx + wob, f.cy, f.x1, f.y1);
                    ctx.stroke();
                }
                // 分叉裂纹：从曲线中点斜出 2 支（模拟应力裂解，读作"晶体开裂"而非"光束"）
                const mx = 0.25 * f.x0 + 0.5 * (f.cx + wob) + 0.25 * f.x1;
                const my = 0.25 * f.y0 + 0.5 * f.cy + 0.25 * f.y1;
                const dir = Math.atan2(f.y1 - f.y0, f.x1 - f.x0);
                const blen = Math.hypot(f.x1 - f.x0, f.y1 - f.y0) * 0.35;
                ctx.strokeStyle = `hsla(${f.hue},100%,84%,${(0.24 * t).toFixed(3)})`;
                ctx.lineWidth = 1;
                for (const sgn of [-1, 1]) {
                    const ba = dir + sgn * 0.62;
                    const ex = mx + Math.cos(ba) * blen, ey = my + Math.sin(ba) * blen;
                    ctx.beginPath();
                    ctx.moveTo(mx, my);
                    ctx.quadraticCurveTo(mx + Math.cos(ba) * blen * 0.5 + sgn * wob * 0.4,
                                         my + Math.sin(ba) * blen * 0.5, ex, ey);
                    ctx.stroke();
                }
                ctx.shadowBlur = 0;
            }

            // ── 晶格共振连线：每枚晶体连向最近邻的一缕微光（统一"矿脉"观感）──
            for (let i = 0; i < _crystals.length; i++) {
                const a = _crystals[i];
                let nb = null, nd = 130 * 130;
                for (let j = 0; j < _crystals.length; j++) {
                    if (j === i) continue;
                    const b = _crystals[j];
                    const dx = a.x - b.x, dy = a.y - b.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < nd) { nd = d2; nb = b; }
                }
                if (nb) {
                    const pulse = 0.5 + 0.5 * Math.sin(fc * 0.04 + i);
                    ctx.strokeStyle = `hsla(${a.hue},80%,62%,${(0.045 + pulse * 0.055).toFixed(3)})`;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(nb.x, nb.y); ctx.stroke();
                }
            }

            // ── 冰尘微粒 ─────────────────────────────────────────────────
            for (const m of _motes) {
                ctx.globalAlpha = m.a;
                ctx.fillStyle = `hsl(${m.hue},90%,75%)`;
                ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;

            // ── 漂浮自转晶体 ─────────────────────────────────────────────
            for (const c of _crystals) {
                ctx.save();
                ctx.translate(c.x, c.y);
                ctx.rotate(c.rot);
                const lit  = `hsl(${c.hue},100%,${Math.round(60 + 18 * c.depth)}%)`;
                const dark = `hsl(${c.hue},80%,22%)`;
                // 外辉光
                ctx.shadowColor = `hsl(${c.hue},100%,60%)`;
                ctx.shadowBlur  = 8 * c.depth;
                // 棱面体
                const g = ctx.createLinearGradient(-c.sz, -c.sz, c.sz, c.sz);
                g.addColorStop(0, lit);
                g.addColorStop(0.5, `hsl(${c.hue},85%,42%)`);
                g.addColorStop(1, dark);
                ctx.fillStyle = g;
                ctx.beginPath();
                c.verts.forEach((v, i) => {
                    const px = Math.cos(v.a) * v.r, py = Math.sin(v.a) * v.r;
                    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                });
                ctx.closePath(); ctx.fill();
                ctx.shadowBlur = 0;
                // 棱线
                ctx.strokeStyle = `hsla(${c.hue},100%,85%,0.5)`;
                ctx.lineWidth = 0.8; ctx.stroke();
                // 内核 + 中心棱线（从中心到各顶点）
                ctx.strokeStyle = `hsla(${c.hue},100%,90%,0.22)`;
                ctx.lineWidth = 0.6;
                ctx.beginPath();
                c.verts.forEach(v => { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(v.a) * v.r, Math.sin(v.a) * v.r); });
                ctx.stroke();
                // 移动高光（glint）
                const gl = 0.5 + 0.5 * Math.sin(c.glintPhase);
                ctx.fillStyle = `rgba(255,255,255,${(gl * 0.6).toFixed(2)})`;
                ctx.beginPath();
                ctx.arc(-c.sz * 0.2, -c.sz * 0.2, c.sz * 0.12 * gl + 0.6, 0, Math.PI * 2);
                ctx.fill();
                // 顶点折射辉光（加色，按 glintPhase 逐顶点呼吸 → 内部折光感）
                ctx.globalCompositeOperation = 'lighter';
                c.verts.forEach((v, vi) => {
                    const vg2 = 0.4 + 0.6 * Math.sin(c.glintPhase + vi * 0.5);
                    if (vg2 < 0.15) return;
                    const vx = Math.cos(v.a) * v.r, vy = Math.sin(v.a) * v.r;
                    const br = (1.3 + vg2 * 1.0);
                    const vgr = ctx.createRadialGradient(vx, vy, 0, vx, vy, br * 2.4);
                    vgr.addColorStop(0,   `rgba(255,255,255,${(vg2 * 0.5).toFixed(2)})`);
                    vgr.addColorStop(0.5, `hsla(${c.hue},100%,72%,${(vg2 * 0.3).toFixed(2)})`);
                    vgr.addColorStop(1,   'rgba(0,0,0,0)');
                    ctx.fillStyle = vgr;
                    ctx.beginPath(); ctx.arc(vx, vy, br * 2.4, 0, Math.PI * 2); ctx.fill();
                });
                ctx.globalCompositeOperation = 'source-over';
                ctx.restore();
            }
        }
    };
})();

SceneRegistry.register({ label:'CRYSTAL NEBULA', getScene:()=>CrystallineNebulaScene });
