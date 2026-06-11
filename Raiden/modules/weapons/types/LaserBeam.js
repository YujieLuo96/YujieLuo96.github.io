var LaserBeam = (() => {
    const MAX_AMMO    = 420;
    const UNLOCK_HEAT = 55;   // 过热锁定后需冷却到此值才能再次开火（滞回，防止 99.9 度无限续杯）
    let _ammo   = MAX_AMMO;
    let _heat   = 0;
    let _active = false;
    let _locked = false;
    let _pw     = 1;

    return {
        update(dt, pw) {
            if (pw !== undefined) _pw = pw;
            if (_active && _ammo > 0) {
                _ammo -= dt;
                _heat  = Math.min(100, _heat + dt * 0.9);
                if (_heat >= 100) { _active = false; _locked = true; }
            } else {
                _heat = Math.max(0, _heat - dt * 1.2);
                if (_locked && _heat <= UNLOCK_HEAT) _locked = false;
            }
            if (_ammo <= 0) _active = false;
        },
        activate()      { if (_ammo > 0 && !_locked) _active = true; },
        deactivate()    { _active = false; },
        isActive()      { return _active && _ammo > 0; },
        isOverheated()  { return _locked; },
        getHeat()       { return _heat; },
        getAmmo()       { return _ammo; },
        getMaxAmmo()    { return MAX_AMMO; },
        isExhausted()   { return _ammo <= 0; },
        reset()         { _ammo = MAX_AMMO; _heat = 0; _active = false; _locked = false; _pw = 1; },
        refill()        { _ammo = MAX_AMMO; _heat = Math.max(0, _heat - 40); },
        getDmgPerFrame(){ return 0.12 + _pw * 0.005; },

        draw(ctx, px, py, frameCount) {
            if (!_active || _ammo <= 0) return;
            const x   = px;
            const y1  = py - 30;   // beam bottom (near player)
            const y2  = 0;          // beam top (top of canvas)
            const hr  = _heat / 100;
            const pwF = 1 + _pw * 0.016;
            const hue = Math.max(55, 120 - _pw * 0.65);
            const fc  = frameCount;

            // Smooth animated shimmer — two sine waves, no hard frame steps
            const shimmer = 0.80 + Math.sin(fc * 0.44) * 0.12 + Math.sin(fc * 1.13) * 0.08;
            // 呼吸脉动：光束宽度缓慢起伏（±7%），热度越高呼吸越急促
            const breath = 1 + Math.sin(fc * (0.16 + hr * 0.10)) * 0.07;
            const bw  = Math.min(20, (4 + hr * 5) * pwF) * breath;

            // Outer soft halo (always present, intensity varies smoothly)
            ctx.shadowColor = `hsl(${hue},100%,65%)`;
            ctx.shadowBlur  = 14;
            const gx = ctx.createLinearGradient(x - bw * 5, 0, x + bw * 5, 0);
            gx.addColorStop(0,    `hsla(${hue},100%,60%,0)`);
            gx.addColorStop(0.35, `hsla(${hue},100%,65%,${(0.20 + hr * 0.06) * shimmer})`);
            gx.addColorStop(0.5,  `hsla(${hue},100%,82%,${(0.44 + hr * 0.08) * shimmer})`);
            gx.addColorStop(0.65, `hsla(${hue},100%,65%,${(0.20 + hr * 0.06) * shimmer})`);
            gx.addColorStop(1,    `hsla(${hue},100%,60%,0)`);
            ctx.fillStyle = gx;
            ctx.fillRect(x - bw * 5, y2, bw * 10, y1 - y2);

            // Core beam — always solid, no gaps
            ctx.shadowColor = hr > 0.65 ? '#ff8' : `hsl(${hue},100%,78%)`;
            ctx.shadowBlur  = 10;
            ctx.fillStyle   = hr > 0.65
                ? `rgba(255,255,120,${0.88 + shimmer * 0.10})`
                : `hsla(${hue},90%,88%,${0.90 + shimmer * 0.08})`;
            ctx.fillRect(x - bw * 0.5, y2, bw, y1 - y2);

            // Bright center spine — always solid white
            ctx.shadowBlur = 6;
            ctx.fillStyle  = `rgba(255,255,255,${0.90 + shimmer * 0.10})`;
            ctx.fillRect(x - 1.5, y2, 3, y1 - y2);
            ctx.shadowBlur = 0;

            // 边缘热浪微光：两条沿光束蜿蜒上行的细波纹（无 shadowBlur，开销极低）
            ctx.strokeStyle = `hsla(${hue},100%,80%,${0.22 + hr * 0.10})`;
            ctx.lineWidth   = 1;
            for (let side = -1; side <= 1; side += 2) {
                ctx.beginPath();
                let first = true;
                for (let yy = y1; yy >= y2; yy -= 26) {
                    const wob = Math.sin(yy * 0.055 - fc * 0.35 + side * 1.7) * (2.5 + hr * 2);
                    const xx  = x + side * (bw * 0.85) + wob;
                    if (first) { ctx.moveTo(xx, yy); first = false; }
                    else ctx.lineTo(xx, yy);
                }
                ctx.stroke();
            }

            // 出膛火花：炮口处偶发的微小光点（节流，每 7 帧 2 粒）
            if (fc % 7 === 0) {
                ParticleSystem.spawn(x, y1 - 6, {
                    count: 2, angle: -Math.PI / 2, spread: 1.1,
                    speed: 2.5 + hr * 2, life: 13, size: 1.8,
                    shape: 'spark',
                    colors: [`hsl(${hue},100%,85%)`, '#fff']
                });
            }

            // Muzzle flash at beam origin (where beam meets the ship)
            const muzzleR = bw * 2.0 * shimmer;
            const mg = ctx.createRadialGradient(x, y1, 0, x, y1, muzzleR * 2.2);
            mg.addColorStop(0,    '#fff');
            mg.addColorStop(0.28, `hsl(${hue},100%,85%)`);
            mg.addColorStop(1,    `hsla(${hue},100%,60%,0)`);
            ctx.fillStyle = mg;
            ctx.beginPath(); ctx.arc(x, y1, muzzleR * 2.2, 0, Math.PI * 2); ctx.fill();
        }
    };
})();
