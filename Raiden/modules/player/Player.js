var Player = (() => {
    const CFG = PlayerConfig;
    let _x, _y, _pw, _invTimer, _shieldActive, _shieldTimer, _engineFlame;

    function _reset() {
        _x           = Renderer.W / 2;
        _y           = CFG.startY;
        _pw          = 1;
        _invTimer    = 0;
        _shieldActive= false;
        _shieldTimer = 0;
        _engineFlame = 0;
    }
    _reset();

    return {
        get x() { return _x; },
        get y() { return _y; },
        get powerLevel() { return _pw; },

        reset: _reset,

        getPos() { return { x: _x, y: _y }; },

        getBounds() {
            return { x: _x - CFG.hitboxW / 2, y: _y - CFG.hitboxH / 2,
                     w: CFG.hitboxW, h: CFG.hitboxH };
        },

        addPower(n) { _pw = Math.min(CFG.maxPowerLevel, _pw + n); },
        setPower(n) { _pw = Math.max(1, Math.min(CFG.maxPowerLevel, n)); },

        activateShield(frames) { _shieldActive = true; _shieldTimer = frames; },
        hasShield()      { return _shieldActive; },
        getShieldTimer() { return _shieldTimer; },
        breakShield()    { _shieldActive = false; _shieldTimer = 0; _invTimer = 30; },

        get invincibleTimer() { return _invTimer; },
        restoreInvincibility() { _invTimer = CFG.invincibleFrames; },

        nudge(dx, dy) {
            _x = Math.max(CFG.width / 2, Math.min(Renderer.W - CFG.width / 2, _x + dx));
            _y = Math.max(CFG.height / 2, Math.min(Renderer.H - CFG.height / 2, _y + dy));
        },

        takeDamage() {
            if (_invTimer > 0) return false;
            if (_shieldActive) { this.breakShield(); return false; }
            _invTimer = CFG.invincibleFrames;
            _pw = Math.max(1, _pw - 1);
            return true;
        },

        update(dt, fc) {
            const ptr = InputManager.getPointer();

            if (typeof MobileControls !== 'undefined' && MobileControls.isActive()) {
                const joy = MobileControls.getJoyDir();
                _x += joy.vx * CFG.speed * dt;
                _y += joy.vy * CFG.speed * dt;
            } else if (InputManager.useTouch() && ptr.down) {
                // Smooth follow pointer
                const dx = ptr.x - _x, dy = ptr.y - _y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 2) {
                    const s = Math.min(CFG.speed, dist * 0.28) * dt;
                    _x += (dx / dist) * s;
                    _y += (dy / dist) * s;
                }
            } else {
                const dir = InputManager.getMoveDir();
                _x += dir.vx * CFG.speed * dt;
                _y += dir.vy * CFG.speed * dt;
            }

            _x = Math.max(CFG.width / 2, Math.min(Renderer.W - CFG.width / 2, _x));
            _y = Math.max(CFG.height / 2, Math.min(Renderer.H - CFG.height / 2, _y));

            if (_invTimer > 0) _invTimer -= dt;
            if (_shieldActive) {
                _shieldTimer -= dt;
                if (_shieldTimer <= 0) _shieldActive = false;
            }
            _engineFlame += 0.3 * dt;
        },

        draw(ctx, fc) {
            if (_invTimer > 0 && Math.floor(_invTimer * 10) % 2 === 0) ctx.globalAlpha = 0.45;

            ctx.save(); ctx.translate(_x, _y);

            // Engine flames
            const fh  = 14 + Math.sin(_engineFlame) * 7;
            const fh2 = 9  + Math.cos(_engineFlame * 1.7) * 4;
            [[0, fh, [-8, 8]], [-12, fh2, [-14, -5]], [12, fh2, [5, 14]]].forEach(([cx, flen, [lx, rx]]) => {
                const fg = ctx.createLinearGradient(0, 20, 0, 20 + flen);
                fg.addColorStop(0, '#4af'); fg.addColorStop(0.4, '#28f'); fg.addColorStop(1, 'rgba(0,80,255,0)');
                ctx.fillStyle = fg;
                ctx.beginPath();
                ctx.moveTo(cx + lx - cx, 22); ctx.lineTo(cx, 22 + flen); ctx.lineTo(cx + rx - cx, 22);
                ctx.closePath(); ctx.fill();
            });

            // Wing glow
            ctx.shadowColor = '#4af'; ctx.shadowBlur = 6;

            // Body
            const body = ctx.createLinearGradient(0, -26, 0, 22);
            body.addColorStop(0, '#7df'); body.addColorStop(0.3, '#39f');
            body.addColorStop(0.7, '#159'); body.addColorStop(1, '#036');
            ctx.fillStyle = body;
            ctx.beginPath();
            ctx.moveTo(0, -26);
            ctx.lineTo(5, -18); ctx.lineTo(16, -8); ctx.lineTo(18, 2);
            ctx.lineTo(14, 14); ctx.lineTo(8, 22);  ctx.lineTo(0, 16);
            ctx.lineTo(-8, 22); ctx.lineTo(-14, 14);ctx.lineTo(-18, 2);
            ctx.lineTo(-16, -8);ctx.lineTo(-5, -18);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(180,230,255,0.75)'; ctx.lineWidth = 1.5;
            ctx.shadowBlur = 0; ctx.stroke();

            // Cockpit
            const ck = ctx.createLinearGradient(0, -18, 0, -4);
            ck.addColorStop(0, '#cef'); ck.addColorStop(1, '#48b');
            ctx.fillStyle = ck;
            ctx.beginPath(); ctx.ellipse(0, -11, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath(); ctx.arc(-2, -14, 2, 0, Math.PI * 2); ctx.fill();

            // Wing detail lines
            ctx.strokeStyle = 'rgba(100,200,255,0.45)'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-8, -4); ctx.lineTo(-15, 6);
            ctx.moveTo(8, -4);  ctx.lineTo(15, 6);
            ctx.stroke();

            // Shield
            if (_shieldActive) {
                const sa = 0.38 + Math.sin(fc * 0.14) * 0.18;
                const sg = ctx.createRadialGradient(0, 0, 20, 0, 0, 34);
                sg.addColorStop(0, 'rgba(100,200,255,0)');
                sg.addColorStop(0.7, `rgba(100,200,255,${sa})`);
                sg.addColorStop(1, 'rgba(80,160,255,0)');
                ctx.fillStyle = sg;
                ctx.beginPath(); ctx.arc(0, -2, 34, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = `rgba(160,230,255,${sa + 0.3})`;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(0, -2, 33, 0, Math.PI * 2); ctx.stroke();
            }

            ctx.restore(); ctx.globalAlpha = 1;
        }
    };
})();
