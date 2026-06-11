var Boss5_Leviathan = (() => {
    // 4 attack modes, each with a name, duration (frames), and reactor hue
    const MODES = [
        { name: 'siege',    dur: 220, hue: 220, label: '— SIEGE —'    },
        { name: 'barrage',  dur: 180, hue: 28,  label: '— BARRAGE —'  },
        { name: 'swarm',    dur: 250, hue: 110, label: '— SWARM —'    },
        { name: 'overload', dur: 160, hue: 0,   label: '— OVERLOAD —' },
    ];

    class Boss5_Leviathan extends EnemyBase {
        constructor() {
            super({ x: Renderer.W / 2, y: -110, hp: 500, score: 30000, type: 'boss5',
                    dropChance: 1.0,
                    dropTable: ['bomb','health','shield','satellite_w','ice_w','megabomb'],
                    w: 90, h: 80 });
            this.entryY      = 130;
            this.entry       = true;
            this.t           = 0;
            this.turretAngle = 0;
            this.reactorHue  = 220;

            // Mode state
            this.modeIdx    = 0;
            this.modeTimer  = 0;
            this.modeLabel  = MODES[0].label; // exposed for UIRenderer

            // Per-attack timers
            this.siegeRingT  = 0;
            this.siegeAimT   = 0;
            this.barrageT    = 0;
            this.swarmT      = 0;
            this.swarmSpiT   = 0;
            this.overloadT   = 0;

            this.spiralRot   = 0;
            this.baseX       = Renderer.W / 2;

            // 新增：弹墙 / 蛇形弹 / overload 蓄力 telegraph / 受损烟雾
            this.wallT       = 0;      // barrage 弹墙计时
            this.snakeT      = 0;      // swarm 蛇形弹计时
            this.armDir      = 1;      // 旋臂方向（各节体环节错相）
            this.chargeT     = 0;      // overload 进场蓄力（0=未蓄力）
            this.chargeDur   = 36;
            this.chargeP     = 0;      // 蓄力粒子节流
            this.smokeT      = 0;      // 受损烟雾节流
            this.volleyLock  = 0;      // 大波次错帧锁：防多组弹幕同帧齐射爆量
        }

        // 0–3 based on HP; affects bullet count + intervals
        _phase() {
            const r = this.hp / this.maxHp;
            if (r > 0.75) return 0;
            if (r > 0.50) return 1;
            if (r > 0.25) return 2;
            return 3;
        }

        // Multiplier: 1.0 → 2.05 across 4 phases
        _ix() { return 1 + this._phase() * 0.35; }

        // Overload only unlocks at phase >= 2
        _modeCount() { return this._phase() >= 2 ? 4 : 3; }

        _advanceMode() {
            this.modeTimer = 0;
            this.modeIdx   = (this.modeIdx + 1) % this._modeCount();
            this.modeLabel = MODES[this.modeIdx].label;
            // Reset all attack timers on mode switch
            this.siegeRingT = this.siegeAimT = this.barrageT =
            this.swarmT = this.swarmSpiT = this.overloadT = 0;
            this.wallT = this.snakeT = 0;
            this.armDir = -this.armDir;
            // 模式切换闪光（反应堆换色瞬间）
            ExplosionFX.mediumEnemy(this.x, this.y,
                `hsl(${MODES[this.modeIdx].hue},90%,62%)`);
            // OVERLOAD 进场前先蓄力 36 帧（telegraph + 呼吸间隙）
            if (MODES[this.modeIdx].name === 'overload') this.chargeT = 0.01;
        }

        update(dt, fc) {
            if (this.entry) {
                this.y += 0.9 * dt;
                if (this.y >= this.entryY) {
                    this.y = this.entryY;
                    this.entry = false;
                    this.baseX = this.x;
                }
                this.checkEntered();
                return null;
            }

            this.t += dt;
            this.turretAngle += 0.018 * dt;

            // Advance mode timer
            this.modeTimer += dt;
            if (this.modeTimer >= MODES[this.modeIdx].dur) this._advanceMode();

            // Smoothly shift reactor hue toward target
            const targetHue = MODES[this.modeIdx].hue;
            this.reactorHue += (targetHue - this.reactorHue) * 0.04 * dt;

            const ix   = this._ix();
            const ph   = this._phase();
            const mode = MODES[this.modeIdx].name;
            const cx   = this.x, cy = this.y;
            const bullets = [];
            if (this.volleyLock > 0) this.volleyLock -= dt;

            // ── Movement per mode ─────────────────────────────────────────
            switch (mode) {
                case 'siege':
                    this.x = this.baseX + Math.sin(this.t * 0.008) * 55;
                    break;
                case 'barrage':
                    this.x = this.baseX + Math.sin(this.t * 0.022) * 90;
                    break;
                case 'swarm':
                    this.x = this.baseX + Math.cos(this.t * 0.012) * 70;
                    this.y = this.entryY + Math.sin(this.t * 0.010) * 22;
                    break;
                case 'overload':
                    this.x = this.baseX + Math.sin(this.t * 0.028) * 110;
                    this.y = this.entryY + Math.sin(this.t * 0.056) * 34;
                    break;
            }

            // ── OVERLOAD 蓄力 telegraph：停火聚能，爆发开场缺口环 ──────────
            if (mode === 'overload' && this.chargeT > 0) {
                this.chargeT += dt;
                this.chargeP += dt;
                if (this.chargeP >= 6) {
                    this.chargeP = 0;
                    ParticleSystem.spawn(cx, cy - 6,
                        { count: 4, colors: ['#ff8080', '#fff', '#ff4040'],
                          speed: 2.4, life: 13, size: 2.5, shape: 'spark', scatter: 48 });
                }
                if (this.chargeT >= this.chargeDur) {
                    this.chargeT = 0;
                    // 开场爆发：朝玩家方向留缺口的大型红色弹环（26 发）
                    const p  = Player.getPos();
                    const ga = Math.atan2(p.y - cy, p.x - cx);
                    BulletPatterns.ringGap(cx, cy - 6, 26, 3.6, this.turretAngle, ga, 0.5,
                        { bulletOpts: { type: 'big', radius: 5, color: '#f55' } })
                        .forEach(b => bullets.push(b));
                }
                this.checkEntered();
                return bullets.length > 0 ? bullets : null;
            }

            // ═══════════════════════════════════════════════════════════════
            //  MODE A — SIEGE: large rings + aimed shots
            // ═══════════════════════════════════════════════════════════════
            if (mode === 'siege' || mode === 'overload') {
                const ringInt = Math.max(18, Math.round(62 / ix));
                this.siegeRingT += dt;
                if (this.volleyLock <= 0 && this.siegeRingT >= ringInt) {
                    this.siegeRingT = 0;
                    this.volleyLock = 14;
                    const cnt = Math.min(Math.round(16 * ix), 24);
                    BulletPatterns.ring(cx, cy, cnt, 2.6, this.turretAngle)
                        .forEach(b => bullets.push(b));
                    // Phase 2+ adds an offset GAP ring — 缺口朝玩家，留出钻缝活路
                    if (ph >= 2) {
                        const p  = Player.getPos();
                        const ga = Math.atan2(p.y - cy, p.x - cx);
                        BulletPatterns.ringGap(cx, cy, Math.floor(cnt * 0.4), 3.8,
                            this.turretAngle + Math.PI / cnt, ga, 0.5,
                            { bulletOpts: { color: '#fa6' } })
                            .forEach(b => bullets.push(b));
                    }
                }
                const aimInt = Math.max(12, Math.round(38 / ix));
                this.siegeAimT += dt;
                if (this.siegeAimT >= aimInt) {
                    this.siegeAimT = 0;
                    const p = Player.getPos();
                    const cnt = Math.min(2 + ph, 5);
                    BulletPatterns.aimed(cx, cy + 40, p.x, p.y,
                        Math.min(5.4, 4.8 + ix * 0.5),
                        { count: cnt, spread: 0.30 })
                        .forEach(b => bullets.push(b));
                }
            }

            // ═══════════════════════════════════════════════════════════════
            //  MODE B — BARRAGE: triple broadside fan + fast aimed bursts
            // ═══════════════════════════════════════════════════════════════
            if (mode === 'barrage' || mode === 'overload') {
                const barrInt = Math.max(16, Math.round(48 / ix));
                this.barrageT += dt;
                if (this.volleyLock <= 0 && this.barrageT >= barrInt) {
                    this.barrageT = 0;
                    this.volleyLock = 10;
                    const p = Player.getPos();
                    const bulletsPerFan = Math.min(2 + ph, 6);
                    // 3 broadside turret offsets
                    [[-40, 8], [0, 28], [40, 8]].forEach(([ox, oy]) => {
                        const base = Math.atan2(p.y - (cy + oy), p.x - (cx + ox));
                        BulletPatterns.fan(cx + ox, cy + oy,
                            bulletsPerFan, 4.0 + ix * 0.6, base, 0.5)
                            .forEach(b => bullets.push(b));
                    });
                    // Phase 3: rear turrets fire backward fan
                    if (ph >= 3) {
                        [[-30, -20], [30, -20]].forEach(([ox, oy]) => {
                            BulletPatterns.fan(cx + ox, cy + oy, 3, 3.5,
                                -Math.PI / 2, 0.6).forEach(b => bullets.push(b));
                        });
                    }
                }
                // 横向下落弹墙：留 2 格空位逼玩家横移（巨兽推进压制感）
                const wallInt = Math.max(95, Math.round(150 / ix));
                this.wallT += dt;
                if (this.volleyLock <= 0 && this.wallT >= wallInt) {
                    this.wallT = 0;
                    this.volleyLock = 14;
                    const cnt = 11 + Math.min(ph, 2) * 2;
                    BulletPatterns.wall(Renderer.W / 2, cy + 24, cnt,
                        Renderer.W * 0.82, 2.4,
                        1 + Math.floor(Math.random() * (cnt - 3)),
                        { bulletOpts: { color: '#ffa040' } })
                        .forEach(b => bullets.push(b));
                }
            }

            // ═══════════════════════════════════════════════════════════════
            //  MODE C — SWARM: minion launch + outward spiral mines
            // ═══════════════════════════════════════════════════════════════
            if (mode === 'swarm' || mode === 'overload') {
                const swarmInt = Math.max(70, Math.round(170 / ix));
                this.swarmT += dt;
                if (this.swarmT >= swarmInt) {
                    this.swarmT = 0;
                    EnemyManager.spawnKind('drone', Math.round(4 * ix), { x: cx, y: cy });
                    if (ph >= 1) {
                        EnemyManager.spawnKind('interceptor', 2, { fromLeft: Math.random() < 0.5 });
                    }
                    if (ph >= 3) {
                        EnemyManager.spawnKind('gunship', 1, { x: cx, y: cy });
                    }
                }
                const spiInt = Math.max(9, Math.round(18 / ix));
                this.swarmSpiT += dt;
                if (this.swarmSpiT >= spiInt) {
                    this.swarmSpiT = 0;
                    this.spiralRot += 0.16 * this.armDir;
                    const arms = Math.min(2 + ph, 5);
                    // 双发射口错相旋臂风车：绿色棱晶弹，巨兽节体感
                    BulletPatterns.spiralArms(cx, cy - 6, arms, this.spiralRot, 3.2,
                        { bulletOpts: { type: 'shard', color: '#6f9', life: 330 } })
                        .forEach(b => bullets.push(b));
                    // 第二节体错相反转旋臂 —— 仅 swarm 本体模式（overload 合流时收敛弹量）
                    if (ph >= 1 && mode === 'swarm') {
                        BulletPatterns.spiralArms(cx, cy + 22, arms,
                            -this.spiralRot + Math.PI / arms, 2.7,
                            { bulletOpts: { type: 'shard', color: '#3da', life: 330 } })
                            .forEach(b => bullets.push(b));
                    }
                }
                // 蛇形瞄准弹：左右蛇行的绿色棱晶逼近玩家
                const snakeInt = Math.max(60, Math.round(105 / ix));
                this.snakeT += dt;
                if (this.snakeT >= snakeInt) {
                    this.snakeT = 0;
                    const p = Player.getPos();
                    BulletPatterns.snake(cx, cy + 30, p.x, p.y, 3.3,
                        ph >= 2 ? 4 : 3, { bulletOpts: { life: 300 } })
                        .forEach(b => bullets.push(b));
                }
            }

            // ═══════════════════════════════════════════════════════════════
            //  MODE D — OVERLOAD: extra rapid aimed + wide burst (all-out)
            // ═══════════════════════════════════════════════════════════════
            if (mode === 'overload') {
                this.overloadT += dt;
                if (this.overloadT >= 11) {
                    this.overloadT = 0;
                    const p = Player.getPos();
                    BulletPatterns.aimed(cx, cy, p.x, p.y, 5.4,
                        { count: 3, spread: 0.14 })
                        .forEach(b => bullets.push(b));
                }
            }

            // 受损烟雾与火星（phase 3 残血，每 6 帧节流）
            if (ph >= 3) {
                this.smokeT += dt;
                if (this.smokeT >= 6) {
                    this.smokeT = 0;
                    const vx = Math.random() < 0.5 ? -30 : 30;
                    ParticleSystem.spawn(cx + vx, cy + 10,
                        { count: 2, colors: ['#444', '#333', '#665'],
                          speed: 0.9, life: 32, size: 4.5, drag: 0.99,
                          angle: -Math.PI / 2, spread: 1.0 });
                    if (Math.random() < 0.45)
                        ParticleSystem.spawn(cx + vx, cy + 10,
                            { count: 2, colors: ['#fc6', '#f80'],
                              speed: 3.2, life: 11, size: 2, shape: 'spark', gravity: 0.06 });
                }
            }

            this.checkEntered();
            if (this.y > Renderer.H + 110) this.alive = false;
            return bullets.length > 0 ? bullets : null;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const ph    = this._phase();
            const hue   = this.reactorHue;
            const pulse = 0.5 + Math.sin(this.t * 0.11) * 0.5;

            if (!flash) {
                // ── Engine exhaust plumes ──────────────────────────────────
                [-44, 44].forEach(ox => {
                    const eg = ctx.createRadialGradient(ox, 36, 2, ox, 44, 26);
                    eg.addColorStop(0,   `hsl(${hue},100%,80%)`);
                    eg.addColorStop(0.3, `hsla(${hue},100%,60%,0.55)`);
                    eg.addColorStop(0.7, `hsla(${hue},100%,40%,0.2)`);
                    eg.addColorStop(1,   'rgba(0,0,0,0)');
                    ctx.shadowColor = `hsl(${hue},100%,65%)`; ctx.shadowBlur = 12;
                    ctx.fillStyle   = eg;
                    ctx.beginPath(); ctx.arc(ox, 44, 26, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur  = 0;
                });

                // ── Outer rotating segment ring (enhanced) ─────────────────
                ctx.save();
                ctx.rotate(this.turretAngle * 0.5);
                for (let i = 0; i < 6; i++) {
                    ctx.save();
                    ctx.rotate(i * Math.PI / 3);
                    ctx.shadowColor = `hsl(${hue},90%,65%)`; ctx.shadowBlur = 5;
                    ctx.strokeStyle = `hsla(${hue},90%,65%,0.45)`;
                    ctx.lineWidth   = 2.5;
                    ctx.beginPath(); ctx.arc(0, 0, 58, -0.22, 0.22); ctx.stroke();
                    ctx.shadowBlur  = 0;
                    ctx.restore();
                }
                ctx.restore();

                // ── Side armor flanges ─────────────────────────────────────
                [-38, 38].forEach(fx => {
                    ctx.fillStyle = '#1c1c28';
                    ctx.fillRect(fx < 0 ? fx - 8 : fx, -8, 8, 16);
                    ctx.strokeStyle = `hsla(${hue},60%,55%,0.4)`;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(fx < 0 ? fx - 8 : fx, -8, 8, 16);
                    // Flange highlight stripe
                    ctx.fillStyle = `hsla(${hue},70%,50%,0.3)`;
                    ctx.fillRect(fx < 0 ? fx - 5 : fx + 2, -5, 3, 10);
                });
            }

            // ── Main hull ─────────────────────────────────────────────────
            const hg = ctx.createLinearGradient(0, -42, 0, 42);
            hg.addColorStop(0,   flash ? '#fff' : '#484860');
            hg.addColorStop(0.3, flash ? '#fff' : '#30304a');
            hg.addColorStop(0.7, flash ? '#bbb' : '#1e1e2c');
            hg.addColorStop(1,   flash ? '#aaa' : '#0e0e16');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0,  -42); ctx.lineTo(26, -30); ctx.lineTo(46, -10);
            ctx.lineTo(46,  14); ctx.lineTo(28,  32); ctx.lineTo(10,  42);
            ctx.lineTo(-10, 42); ctx.lineTo(-28, 32); ctx.lineTo(-46, 14);
            ctx.lineTo(-46,-10); ctx.lineTo(-26,-30);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = flash
                ? 'rgba(255,255,255,0.8)'
                : `hsla(${hue},60%,60%,0.45)`;
            ctx.lineWidth = 2; ctx.stroke();

            if (!flash) {
                // ── Hull panel zig-zag cross-section lines ─────────────────
                ctx.strokeStyle = `hsla(${hue},40%,65%,0.25)`;
                ctx.lineWidth   = 1;
                // 3 zig-zag chevron rows
                [[-10, 6], [5, 8], [18, 6]].forEach(([dy, amp]) => {
                    const hw = 40 - Math.abs(dy) * 0.35;
                    ctx.beginPath();
                    ctx.moveTo(-hw, dy);
                    ctx.lineTo(-hw * 0.5, dy - amp);
                    ctx.lineTo(0,         dy);
                    ctx.lineTo(hw * 0.5,  dy - amp);
                    ctx.lineTo(hw,        dy);
                    ctx.stroke();
                });

                // ── Damage vents at phase 3+ ───────────────────────────────
                if (ph >= 2) {
                    ctx.shadowColor = '#ff6020'; ctx.shadowBlur = 6;
                    ctx.strokeStyle = `rgba(255,${ph>=3?160:100},40,${0.5+pulse*0.3})`;
                    ctx.lineWidth = 1.5;
                    [[-30, 10], [30, 10]].forEach(([vx, vy]) => {
                        ctx.beginPath();
                        ctx.moveTo(vx - 7, vy - 3); ctx.lineTo(vx, vy + 4); ctx.lineTo(vx + 7, vy - 3);
                        ctx.stroke();
                        if (ph >= 3) {
                            // Extra vent crack
                            ctx.beginPath();
                            ctx.moveTo(vx - 4, vy - 6); ctx.lineTo(vx + 2, vy + 2);
                            ctx.stroke();
                        }
                    });
                    ctx.shadowBlur = 0;
                }

                // ── 4 rotating turret pods (fully detailed) ────────────────
                [[28, -18], [-28, -18], [38, 10], [-38, 10]].forEach(([tx, ty], i) => {
                    ctx.save();
                    ctx.translate(tx, ty);
                    ctx.rotate(this.turretAngle + i * Math.PI / 2);

                    // Outer housing circle
                    ctx.fillStyle = '#14141e';
                    ctx.shadowColor = `hsl(${hue},80%,60%)`; ctx.shadowBlur = 6;
                    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = `hsla(${hue},80%,60%,0.6)`;
                    ctx.lineWidth   = 1.5; ctx.stroke();
                    ctx.shadowBlur  = 0;

                    // Inner rotation circle
                    ctx.fillStyle = '#1e1e2c';
                    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = `hsla(${hue},60%,50%,0.4)`;
                    ctx.lineWidth   = 1; ctx.stroke();

                    // Barrel with length
                    ctx.fillStyle = `hsl(${hue},75%,45%)`;
                    ctx.fillRect(-2.5, -16, 5, 10);
                    // Barrel detail stripe
                    ctx.fillStyle = `hsla(${hue},80%,70%,0.5)`;
                    ctx.fillRect(-1, -16, 2, 10);

                    // Muzzle glow dot
                    const mug = ctx.createRadialGradient(0, -17, 1, 0, -17, 6);
                    mug.addColorStop(0,   `hsl(${hue},100%,90%)`);
                    mug.addColorStop(0.5, `hsla(${hue},100%,70%,0.5)`);
                    mug.addColorStop(1,   'rgba(0,0,0,0)');
                    ctx.shadowColor = `hsl(${hue},100%,75%)`; ctx.shadowBlur = 8;
                    ctx.fillStyle   = mug;
                    ctx.beginPath(); ctx.arc(0, -17, 6, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle   = '#fff';
                    ctx.beginPath(); ctx.arc(0, -17, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur  = 0;

                    ctx.restore();
                });

                // ── Broadside cannons (improved) ───────────────────────────
                [[-44, 10], [44, 10]].forEach(([bx, by]) => {
                    // Housing box
                    ctx.fillStyle = '#111118';
                    ctx.fillRect(bx - 5, by - 6, 10, 22);
                    ctx.strokeStyle = `hsla(${hue},60%,50%,0.45)`;
                    ctx.lineWidth = 1; ctx.strokeRect(bx - 5, by - 6, 10, 22);

                    // Inner detail
                    ctx.fillStyle = `hsla(${hue},50%,30%,0.5)`;
                    ctx.fillRect(bx - 3, by - 3, 6, 8);

                    // Triple-line barrel
                    ctx.strokeStyle = `hsl(${hue},70%,55%)`;
                    ctx.lineWidth = 1.5;
                    [-2, 0, 2].forEach(lx => {
                        ctx.beginPath(); ctx.moveTo(bx + lx, by + 8); ctx.lineTo(bx + lx, by + 20); ctx.stroke();
                    });

                    // Muzzle glow
                    const cg = ctx.createRadialGradient(bx, by + 20, 1, bx, by + 20, 9);
                    cg.addColorStop(0,   `hsl(${hue},100%,80%)`);
                    cg.addColorStop(0.5, `hsla(${hue},100%,60%,0.45)`);
                    cg.addColorStop(1,   'rgba(0,0,0,0)');
                    ctx.shadowColor = `hsl(${hue},100%,65%)`; ctx.shadowBlur = 8;
                    ctx.fillStyle   = cg;
                    ctx.beginPath(); ctx.arc(bx, by + 20, 9, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur  = 0;
                    ctx.fillStyle   = '#fff';
                    ctx.beginPath(); ctx.arc(bx, by + 20, 2.5, 0, Math.PI * 2); ctx.fill();
                });

                // ── Central reactor with 8 energy spokes ──────────────────
                // Rotating spokes (r=14 to r=24)
                ctx.save();
                ctx.rotate(this.turretAngle * 1.5);
                for (let i = 0; i < 8; i++) {
                    const sa = (i / 8) * Math.PI * 2;
                    ctx.strokeStyle = `hsla(${hue},100%,70%,${0.25 + pulse * 0.2})`;
                    ctx.lineWidth   = 1;
                    ctx.shadowColor = `hsl(${hue},100%,70%)`; ctx.shadowBlur = 4;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(sa)*14, Math.sin(sa)*14 - 6);
                    ctx.lineTo(Math.cos(sa)*24, Math.sin(sa)*24 - 6);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }
                ctx.restore();

                // Reactor base dark circle
                ctx.fillStyle = '#0a0a12';
                ctx.beginPath(); ctx.arc(0, -6, 20, 0, Math.PI * 2); ctx.fill();

                // Reactor radialGradient fill
                const rg = ctx.createRadialGradient(0, -6, 3, 0, -6, 22 + pulse * 8);
                rg.addColorStop(0,    '#fff');
                rg.addColorStop(0.2,  `hsl(${hue},100%,78%)`);
                rg.addColorStop(0.5,  `hsla(${hue},100%,55%,0.5)`);
                rg.addColorStop(1,    'rgba(0,0,0,0)');
                ctx.shadowColor = `hsl(${hue},100%,65%)`; ctx.shadowBlur = 20;
                ctx.fillStyle   = rg;
                ctx.beginPath(); ctx.arc(0, -6, 30 + pulse * 8, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur  = 0;

                // Bright white core
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(0, -6, 8, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = `hsl(${hue},100%,80%)`;
                ctx.globalAlpha = 0.8;
                ctx.beginPath(); ctx.arc(0, -6, 14, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;

                // ── OVERLOAD 蓄力 telegraph：反应堆聚能球从小变大 + 警示圈 ──
                if (this.chargeT > 0) {
                    const prog = Math.min(1, this.chargeT / this.chargeDur);
                    const fastPulse = 0.5 + Math.sin(this.t * 0.55) * 0.5;
                    const cr = 8 + prog * 26;
                    const og = ctx.createRadialGradient(0, -6, 1, 0, -6, cr);
                    og.addColorStop(0,   '#fff');
                    og.addColorStop(0.4, `rgba(255,120,100,${0.7 + fastPulse * 0.3})`);
                    og.addColorStop(0.8, `rgba(255,40,30,${0.35 + prog * 0.35})`);
                    og.addColorStop(1,   'rgba(180,0,0,0)');
                    ctx.fillStyle = og;
                    ctx.beginPath(); ctx.arc(0, -6, cr, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = `rgba(255,200,180,${0.3 + fastPulse * 0.45})`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(0, -6, cr + 8 + (1 - prog) * 30, 0, Math.PI * 2); ctx.stroke();
                }

                // ── Phase pip ring ─────────────────────────────────────────
                for (let i = 0; i < 4; i++) {
                    const a   = (i / 4) * Math.PI * 2 - Math.PI / 2;
                    const lit = i >= ph;
                    ctx.fillStyle = lit
                        ? `hsl(${hue},100%,65%)`
                        : 'rgba(60,60,80,0.4)';
                    if (lit) { ctx.shadowColor = `hsl(${hue},100%,70%)`; ctx.shadowBlur = 6; }
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * 22, -6 + Math.sin(a) * 22, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }

            this.drawHpBar(ctx, 84, 48);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Boss5_Leviathan };
})();

EnemyRegistry.register({ label:'Leviathan', scale:0.20, group:'BOSSES', mk:()=>new Boss5_Leviathan.Boss5_Leviathan() });
