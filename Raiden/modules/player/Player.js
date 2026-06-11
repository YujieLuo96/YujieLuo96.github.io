var Player = (() => {
    const CFG = PlayerConfig;
    const FOCUS_MUL   = 0.42;   // Focus 模式（Shift）移动倍率
    const ACCEL_K     = 0.45;   // 速度平滑系数/帧：~3 帧到满速，跟手且无生硬瞬移
    const DRAG_SENS   = 1.15;   // 指针相对拖拽灵敏度
    let _x, _y, _pw, _invTimer, _shieldActive, _shieldTimer, _engineFlame;
    let _vx = 0, _vy = 0;       // 平滑后的实际速度（也驱动侧倾与尾焰）
    let _bank = 0;              // 侧倾 -1..1
    let _focus = false;
    let _trailTimer = 0;

    function _reset() {
        _x           = Renderer.W / 2;
        _y           = CFG.startY;
        _pw          = 1;
        _invTimer    = 0;
        _shieldActive= false;
        _shieldTimer = 0;
        _engineFlame = 0;
        _vx = 0; _vy = 0; _bank = 0; _focus = false;
        _trailTimer  = 0;
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
            _focus = InputManager.isFocus();
            const spdMul = _focus ? FOCUS_MUL : 1;

            let tvx = 0, tvy = 0;          // 目标速度
            let dragged = false;

            // 输入优先级：键盘（按下即夺回控制）→ 虚拟摇杆（实际推动时）→ 指针拖拽。
            // 触屏笔记本等混合设备上三种方式随时可换，互不架空。
            const dir = InputManager.getMoveDir();
            const joy = (typeof MobileControls !== 'undefined' && MobileControls.isActive())
                ? MobileControls.getJoyDir() : null;

            if (dir.vx !== 0 || dir.vy !== 0) {
                tvx = dir.vx * CFG.speed * spdMul;
                tvy = dir.vy * CFG.speed * spdMul;
            } else if (joy && (joy.vx !== 0 || joy.vy !== 0)) {
                tvx = joy.vx * CFG.speed * spdMul;
                tvy = joy.vy * CFG.speed * spdMul;
            } else if (InputManager.useTouch() && ptr.down) {
                // 相对拖拽：按指针帧间增量直接位移——零延迟、机体不被手指/光标遮挡
                const d = InputManager.consumePointerDelta();
                const sens = DRAG_SENS * spdMul;
                // 单帧增量钳制：防止其它输入方式切换过来时积累的增量造成瞬移
                const ddx = Math.max(-40, Math.min(40, d.dx * sens));
                const ddy = Math.max(-40, Math.min(40, d.dy * sens));
                _x += ddx;
                _y += ddy;
                // 增量同步进速度（驱动侧倾/尾焰，松手后保留少量惯性滑行）
                const cap = CFG.speed * 1.6;
                _vx = Math.max(-cap, Math.min(cap, ddx / Math.max(0.001, dt)));
                _vy = Math.max(-cap, Math.min(cap, ddy / Math.max(0.001, dt)));
                dragged = true;
            }

            if (!dragged) {
                // 速度平滑：~3 帧加速到满、~3 帧停稳，消除数字键的瞬移生硬感
                const k = Math.min(1, ACCEL_K * dt);
                _vx += (tvx - _vx) * k;
                _vy += (tvy - _vy) * k;
                _x  += _vx * dt;
                _y  += _vy * dt;
            }

            _x = Math.max(CFG.width / 2, Math.min(Renderer.W - CFG.width / 2, _x));
            _y = Math.max(CFG.height / 2, Math.min(Renderer.H - CFG.height / 2, _y));

            // 侧倾随横向速度平滑过渡
            const bankTarget = Math.max(-1, Math.min(1, _vx / CFG.speed));
            _bank += (bankTarget - _bank) * Math.min(1, 0.22 * dt);

            // 引擎尾焰粒子流：移动越快越密，Focus 模式收束变蓝白
            _trailTimer += dt;
            const spd = Math.sqrt(_vx * _vx + _vy * _vy);
            const trailGap = spd > 2 ? 1.6 : 2.6;
            if (_trailTimer >= trailGap) {
                _trailTimer = 0;
                ParticleSystem.spawn(_x + (Math.random() - 0.5) * (_focus ? 3 : 8), _y + 24, {
                    count: 1,
                    colors: _focus ? ['#cef', '#fff'] : ['#4af', '#28f', '#7df'],
                    angle: Math.PI / 2, spread: 0.35,
                    speed: 2.2 + spd * 0.18,
                    life: 14, size: _focus ? 2 : 3,
                });
            }

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

            // ── 机体随火力进化（与弹幕同步的光谱色：Lv21 红 → Lv100 紫） ──
            const tierHue = _pw >= 21 ? Math.round((Math.min(_pw, 100) - 21) / 79 * 270) : null;

            // Lv100+：脉动光环
            if (_pw >= 100) {
                const aw = 0.35 + Math.sin(fc * 0.1) * 0.15;
                ctx.strokeStyle = `hsla(${tierHue},100%,70%,${aw})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(0, -2, 30 + Math.sin(fc * 0.05) * 3, 0, Math.PI * 2); ctx.stroke();
            }

            // ── 侧倾（压翼滚转）：横移时机体旋转 + 横向压缩，经典雷电动作 ──
            ctx.save();
            ctx.rotate(_bank * 0.10);
            ctx.scale(1 - Math.abs(_bank) * 0.22, 1);

            // Lv21+：光谱色外侧翼刃
            if (tierHue !== null) {
                const wingCol = `hsl(${tierHue},100%,62%)`;
                ctx.fillStyle = wingCol;
                ctx.shadowColor = wingCol;
                ctx.shadowBlur = 7;
                ctx.beginPath();
                ctx.moveTo(-17, 0); ctx.lineTo(-26, 10); ctx.lineTo(-16, 12);
                ctx.closePath(); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(17, 0); ctx.lineTo(26, 10); ctx.lineTo(16, 12);
                ctx.closePath(); ctx.fill();
                ctx.shadowBlur = 0;
                // Lv51+：翼刃金色描边
                if (_pw >= 51) {
                    ctx.strokeStyle = 'rgba(255,220,120,0.85)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(-17, 0); ctx.lineTo(-26, 10); ctx.lineTo(-16, 12); ctx.closePath();
                    ctx.moveTo(17, 0);  ctx.lineTo(26, 10);  ctx.lineTo(16, 12);  ctx.closePath();
                    ctx.stroke();
                }
            }

            // Engine flames — 尾焰随实际速度拉长，推进感跟手
            const spdN = Math.min(1, Math.sqrt(_vx * _vx + _vy * _vy) / CFG.speed);
            const fh  = (14 + Math.sin(_engineFlame) * 7)   * (0.85 + spdN * 0.45);
            const fh2 = (9  + Math.cos(_engineFlame * 1.7) * 4) * (0.85 + spdN * 0.45);
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

            // 翼尖航行灯：左红右绿交替频闪（与敌机灯语呼应）
            const strobe = Math.floor(fc / 18) % 2;
            ctx.fillStyle = strobe ? 'rgba(255,80,80,0.95)' : 'rgba(255,80,80,0.30)';
            ctx.beginPath(); ctx.arc(-17.5, 3, 1.4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = strobe ? 'rgba(80,255,140,0.30)' : 'rgba(80,255,140,0.95)';
            ctx.beginPath(); ctx.arc(17.5, 3, 1.4, 0, Math.PI * 2); ctx.fill();

            // 炮口闪光：与主炮 6 帧射速同步的机鼻脉冲
            if (fc % 6 < 2) {
                const mg = ctx.createRadialGradient(0, -28, 0, 0, -28, 9);
                mg.addColorStop(0, 'rgba(255,255,255,0.85)');
                mg.addColorStop(0.4, 'rgba(120,220,255,0.45)');
                mg.addColorStop(1, 'rgba(80,170,255,0)');
                ctx.fillStyle = mg;
                ctx.beginPath(); ctx.arc(0, -28, 9, 0, Math.PI * 2); ctx.fill();
            }

            ctx.restore();   // 侧倾变换结束（护盾/判定点不随机体滚转）

            // Focus 模式：精确判定点指示
            if (_focus) {
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(0, -2, 2.5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = `rgba(255,255,255,${0.5 + Math.sin(fc * 0.25) * 0.25})`;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(0, -2, 10 + Math.sin(fc * 0.12) * 1.5, 0, Math.PI * 2); ctx.stroke();
            }

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
