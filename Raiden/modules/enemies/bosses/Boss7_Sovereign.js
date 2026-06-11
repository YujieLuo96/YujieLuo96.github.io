var Boss7_Sovereign = (() => {
    class Boss7_Sovereign extends EnemyBase {
        constructor() {
            super({ x: Renderer.W / 2, y: -100, hp: 320, score: 10000,
                    type: 'boss7', dropChance: 1.0,
                    dropTable: ['power','bomb','health','shield','spread_w','homing_w','laser_w','plasma_w','lightning_w','ice_w','graviton_w','multiplier','megabomb'],
                    w: 80, h: 72 });
            this.phase       = 'entry';
            this.entryY      = 140;
            this.t           = 0;
            this.armAngle    = 0;
            this.podAngle    = 0;
            this.shotTimer   = 0;
            this.shotInt     = 28;
            this.burstTimer  = 0;
            this.burstInt    = 72;
            this.summonTimer = 0;
            this.summonInt   = 240;
            this.beamTimer   = 0;
            this.beamInt     = 200;
            this.beamPhase   = 'idle';
            this.beamAngle   = 0;
            this.beamFireCd  = 0;
            this.phaseStage  = 1;
            this.rageTimer   = 0;

            // 新增：弹墙 / 缺口环交替 / 残血(stage3)组合技 / 蓄力 telegraph
            this.wallT      = 0;       // 弹墙计时（stage 1–2）
            this.ringAlt    = false;   // 满环 / 缺口环 交替
            this.spiralRot  = 0;       // stage3 旋臂角
            this.spiralDir  = 1;       // 旋臂方向（定期反转）
            this.spiralT    = 0;       // 旋臂发射节拍
            this.flipT      = 0;       // 反转计时
            this.restT      = 0;       // 反转/爆发后的呼吸间隙
            this.flareT     = 0;       // 限量追踪彗星计时（≤3 同屏）
            this.gapRingT   = 0;       // 缺口环活路计时
            this.chargeT    = 0;       // stage3 进场蓄力（0=未蓄力）
            this.chargeDur  = 40;
            this.chargeP    = 0;       // 蓄力粒子节流
            this.smokeT     = 0;       // 受损烟雾节流
        }

        update(dt, fc) {
            switch (this.phase) {
                case 'entry':
                    this.y += 1.2 * dt;
                    if (this.y >= this.entryY) { this.y = this.entryY; this.phase = 'fight'; }
                    break;

                case 'fight': {
                    this.t += dt;
                    this.armAngle += 0.012 * dt;
                    this.podAngle += 0.022 * dt;

                    this.x = Renderer.W / 2 + Math.sin(this.t * 0.014) * 160;
                    this.y = this.entryY + Math.sin(this.t * 0.028) * 50;

                    if (this.phaseStage === 1 && this.hp <= this.maxHp * 0.45) {
                        this.phaseStage = 2;
                        this.rageTimer  = 50;
                        this.shotInt    = 18;
                        this.burstInt   = 48;
                        this.summonInt  = 160;
                        ExplosionFX.mediumEnemy(this.x, this.y, '#ffaa40');
                    }
                    // ── Stage 3（hp<30%）：君主狂暴化，进场先蓄力 40 帧 ──────
                    if (this.phaseStage === 2 && this.hp <= this.maxHp * 0.30) {
                        this.phaseStage = 3;
                        this.rageTimer  = 50;
                        this.shotInt    = 30;   // 自机狙放慢，让位给旋臂组合技
                        this.summonInt  = 200;
                        this.chargeT    = 0.01;
                        ExplosionFX.largeEnemy(this.x, this.y, '#ffd040');
                    }
                    if (this.rageTimer > 0) {
                        this.rageTimer -= dt;
                        this.flashTimer = 2;
                    }

                    const cx = this.x, cy = this.y;
                    const bullets = [];
                    const st3 = this.phaseStage >= 3;

                    // ── Stage 3 进场蓄力 telegraph：停火聚能 → 缺口环爆发 ────
                    if (this.chargeT > 0) {
                        this.chargeT += dt;
                        this.chargeP += dt;
                        if (this.chargeP >= 5) {
                            this.chargeP = 0;
                            ParticleSystem.spawn(cx, cy + 8,
                                { count: 4, colors: ['#ffe080', '#fff', '#ffa020'],
                                  speed: 2.6, life: 13, size: 2.5, shape: 'spark', scatter: 50 });
                        }
                        if (this.chargeT >= this.chargeDur) {
                            this.chargeT = 0;
                            this.restT   = 40;        // 爆发后呼吸间隙
                            const p  = Player.getPos();
                            const ga = Math.atan2(p.y - cy, p.x - cx);
                            BulletPatterns.ringGap(cx, cy, 26, 3.5, this.podAngle, ga, 0.46,
                                { bulletOpts: { color: '#ffd060' } })
                                .forEach(b => bullets.push(b));
                        }
                        this.checkEntered();
                        return bullets.length > 0 ? bullets : null;
                    }

                    this.shotTimer += dt;
                    if (this.shotTimer >= this.shotInt && this.restT <= 0) {
                        this.shotTimer = 0;
                        const p = Player.getPos();
                        const cnt = this.phaseStage >= 2 ? 3 : 2;
                        const s = BulletPatterns.aimed(cx, cy + 36, p.x, p.y, 5.2,
                            { count: cnt, spread: 0.22,
                              bulletOpts: st3 ? { color: '#ffd060' } : undefined });
                        if (s) s.forEach(b => bullets.push(b));
                    }

                    if (!st3) {
                        this.burstTimer += dt;
                        if (this.burstTimer >= this.burstInt) {
                            this.burstTimer = 0;
                            this.ringAlt = !this.ringAlt;
                            const cnt = this.phaseStage === 2 ? 14 : 10;
                            if (this.ringAlt) {
                                // 缺口环：朝玩家方向留活路
                                const p  = Player.getPos();
                                const ga = Math.atan2(p.y - cy, p.x - cx);
                                const r = BulletPatterns.ringGap(cx, cy, cnt + 4, 3.5,
                                    this.podAngle, ga, 0.48,
                                    { bulletOpts: { color: '#f86' } });
                                if (r) r.forEach(b => bullets.push(b));
                            } else {
                                const r = BulletPatterns.ring(cx, cy, cnt, 3.5, this.podAngle);
                                if (r) r.forEach(b => bullets.push(b));
                            }
                        }
                        // 横向弹墙：慢速下压，留 2 格空位（stage 1–2）
                        this.wallT += dt;
                        if (this.wallT >= (this.phaseStage === 2 ? 150 : 190)) {
                            this.wallT = 0;
                            const cnt = 11 + (this.phaseStage === 2 ? 2 : 0);
                            BulletPatterns.wall(Renderer.W / 2, cy + 20, cnt,
                                Renderer.W * 0.8, 2.4,
                                1 + Math.floor(Math.random() * (cnt - 3)),
                                { bulletOpts: { color: '#ff8050' } })
                                .forEach(b => bullets.push(b));
                        }
                    } else {
                        // ══ Stage 3 组合技：旋臂风车(定期反转) + 限量追踪彗星 + 缺口环 ══
                        if (this.restT > 0) {
                            this.restT -= dt;
                        } else if (this.beamPhase === 'idle') {
                            this.spiralT += dt;
                            if (this.spiralT >= 8) {
                                this.spiralT = 0;
                                this.spiralRot += 0.15 * this.spiralDir;
                                BulletPatterns.spiralArms(cx, cy, 4, this.spiralRot, 3.5,
                                    { bulletOpts: { type: 'star', radius: 3.8, color: '#fc4',
                                                    spin: 0.2, life: 300 } })
                                    .forEach(b => bullets.push(b));
                            }
                            this.flipT += dt;
                            if (this.flipT >= 130) {
                                // 旋臂反转 + 34 帧停顿（呼吸间隙 & 读盘窗口）
                                this.flipT = 0;
                                this.spiralDir = -this.spiralDir;
                                this.restT = 34;
                            }
                        }
                        // 限量追踪彗星：每 115 帧 1 发（life 330 → 同屏 ≤3）
                        this.flareT += dt;
                        if (this.flareT >= 115) {
                            this.flareT = 0;
                            const p = Player.getPos();
                            BulletPatterns.homingFlare(cx, cy + 30, p.x, p.y, 3.0,
                                { bulletOpts: { homing: 110, life: 330 } })
                                .forEach(b => bullets.push(b));
                        }
                        // 缺口环活路：狂暴中仍必留缺口
                        this.gapRingT += dt;
                        if (this.gapRingT >= 105) {
                            this.gapRingT = 0;
                            const p  = Player.getPos();
                            const ga = Math.atan2(p.y - cy, p.x - cx);
                            BulletPatterns.ringGap(cx, cy, 20, 3.3, this.podAngle, ga, 0.46,
                                { bulletOpts: { color: '#ffd060' } })
                                .forEach(b => bullets.push(b));
                        }
                    }

                    this.summonTimer += dt;
                    if (this.summonTimer >= this.summonInt) {
                        this.summonTimer = 0;
                        if (this.phaseStage === 2) {
                            EnemyManager.spawnKind('devastator', 1);
                            EnemyManager.spawnKind('marauder', 2);
                        } else {
                            EnemyManager.spawnKind('marauder', 3);
                        }
                    }

                    if (this.phaseStage >= 2) {
                        this.beamTimer += dt;
                        if (this.beamPhase === 'idle' && this.beamTimer >= this.beamInt) {
                            this.beamTimer = 0;
                            this.beamPhase = 'aim';
                            const p = Player.getPos();
                            this.beamAngle = Math.atan2(p.y - cy, p.x - cx);
                        } else if (this.beamPhase === 'aim' && this.beamTimer >= 55) {
                            this.beamTimer    = 0;
                            this.beamPhase    = 'fire';
                            this.beamFireCd   = 0;
                        } else if (this.beamPhase === 'fire') {
                            this.beamFireCd -= dt;
                            if (this.beamFireCd <= 0) {
                                this.beamFireCd = 5;
                                for (let i = 0; i < 4; i++) {
                                    const ba = this.beamAngle + i * Math.PI / 2;
                                    const bc = Math.cos(ba), bs = Math.sin(ba);
                                    const s = BulletPatterns.laserBeam(
                                        cx + bc * 22, cy + bs * 22,
                                        cx + bc * 400, cy + bs * 400, 20, 1);
                                    if (s) s.forEach(b => bullets.push(b));
                                }
                            }
                            if (this.beamTimer >= 80) {
                                this.beamTimer = 0; this.beamPhase = 'idle';
                                if (st3) this.restT = Math.max(this.restT, 32); // 大招后呼吸
                            }
                        }
                    }

                    // 受损烟雾与火星（hp<45%，每 6 帧节流；stage3 火星更密）
                    if (this.hp < this.maxHp * 0.45) {
                        this.smokeT += dt;
                        if (this.smokeT >= 6) {
                            this.smokeT = 0;
                            const ox = (Math.random() - 0.5) * 56;
                            const oy = (Math.random() - 0.5) * 36;
                            ParticleSystem.spawn(cx + ox, cy + oy,
                                { count: 2, colors: ['#432', '#321', '#543'],
                                  speed: 0.9, life: 30, size: 4.5, drag: 0.99,
                                  angle: -Math.PI / 2, spread: 1.1 });
                            if (Math.random() < (st3 ? 0.7 : 0.4))
                                ParticleSystem.spawn(cx + ox, cy + oy,
                                    { count: 2, colors: ['#fc6', '#f80', '#fff'],
                                      speed: 3.2, life: 10, size: 2,
                                      shape: 'spark', gravity: 0.05 });
                        }
                    }

                    if (bullets.length > 0) return bullets;
                    break;
                }
            }
            this.checkEntered();
            if (this.y > Renderer.H + 120) this.alive = false;
            return null;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const hp2   = this.phaseStage >= 2;
            const hp3   = this.phaseStage >= 3;
            const pulse  = 0.5 + Math.sin(this.t * 0.11) * 0.45;
            const pulse2 = 0.5 + Math.sin(this.t * 0.19 + 1.3) * 0.45;
            const acol  = hp3 ? '#ffd040' : hp2 ? '#ffaa40' : '#ff3010';
            const acBrt = hp3 ? '#fff0a0' : hp2 ? '#ffd080' : '#ff7040';

            if (!flash) {
                for (let i = 0; i < 4; i++) {
                    ctx.save();
                    ctx.rotate(this.armAngle + i * Math.PI / 2);

                    ctx.shadowColor = acol; ctx.shadowBlur = 9;
                    ctx.strokeStyle = acol; ctx.lineWidth = hp2 ? 4 : 3;
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.stroke();
                    ctx.shadowBlur = 0;

                    const jg = ctx.createRadialGradient(0,-28,1,0,-28,7);
                    jg.addColorStop(0, acBrt); jg.addColorStop(1,'rgba(0,0,0,0)');
                    ctx.fillStyle = jg;
                    ctx.beginPath(); ctx.arc(0,-28,7,0,Math.PI*2); ctx.fill();
                    ctx.fillStyle = acBrt;
                    ctx.beginPath(); ctx.arc(0,-28,3,0,Math.PI*2); ctx.fill();

                    ctx.fillStyle = hp2 ? '#551800' : '#330800';
                    ctx.beginPath();
                    ctx.moveTo(-7,-34); ctx.lineTo(7,-34);
                    ctx.lineTo(9,-42);  ctx.lineTo(7,-50);
                    ctx.lineTo(-7,-50); ctx.lineTo(-9,-42);
                    ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = acol; ctx.lineWidth = 1.2; ctx.stroke();

                    ctx.fillStyle = '#150000';
                    ctx.beginPath(); ctx.rect(-2.5,-52,5,14); ctx.fill();
                    ctx.shadowColor = acBrt; ctx.shadowBlur = 12;
                    ctx.fillStyle = `rgba(255,${hp2?180:80},20,${0.55 + pulse*0.4})`;
                    ctx.beginPath(); ctx.arc(0,-53,4,0,Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0;

                    ctx.restore();
                }

                ctx.save();
                ctx.rotate(-this.armAngle * 3);
                ctx.shadowColor = acol; ctx.shadowBlur = 8;
                ctx.strokeStyle = `rgba(${hp3?'255,220,80':hp2?'255,160,60':'255,80,30'},${0.45 + pulse*0.3})`;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2); ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.restore();

                // ── Stage 3 君主金冠光环：反向旋转的双层虚线环 ─────────────
                if (hp3) {
                    ctx.save();
                    ctx.rotate(this.armAngle * 2);
                    ctx.strokeStyle = `rgba(255,215,80,${0.30 + pulse2 * 0.25})`;
                    ctx.lineWidth = 1.6;
                    ctx.setLineDash([10, 8]);
                    ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.stroke();
                    ctx.setLineDash([4, 10]);
                    ctx.strokeStyle = `rgba(255,240,160,${0.22 + pulse * 0.2})`;
                    ctx.beginPath(); ctx.arc(0, 0, 52, 0, Math.PI * 2); ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.restore();
                }

                // ── Stage 3 蓄力 telegraph：聚能光球从小变大 + 收缩警示圈 ──
                if (this.chargeT > 0) {
                    const prog = Math.min(1, this.chargeT / this.chargeDur);
                    const fastPulse = 0.5 + Math.sin(this.t * 0.55) * 0.5;
                    const cr = 8 + prog * 26;
                    const og = ctx.createRadialGradient(0, 8, 1, 0, 8, cr);
                    og.addColorStop(0,   '#fff');
                    og.addColorStop(0.4, `rgba(255,225,120,${0.7 + fastPulse * 0.3})`);
                    og.addColorStop(0.8, `rgba(255,160,20,${0.35 + prog * 0.35})`);
                    og.addColorStop(1,   'rgba(200,80,0,0)');
                    ctx.fillStyle = og;
                    ctx.beginPath(); ctx.arc(0, 8, cr, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = `rgba(255,240,180,${0.3 + fastPulse * 0.45})`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(0, 8, cr + 8 + (1 - prog) * 32, 0, Math.PI * 2); ctx.stroke();
                }

                if (this.beamPhase === 'aim') {
                    const blink = 0.22 + Math.sin((fc||0) * 0.3) * 0.16;
                    for (let i = 0; i < 4; i++) {
                        const ba = this.beamAngle + i * Math.PI / 2;
                        ctx.save();
                        ctx.rotate(ba);
                        ctx.globalAlpha = blink;
                        ctx.strokeStyle = hp2 ? '#ff9040' : '#ff4020';
                        ctx.lineWidth = 2;
                        ctx.setLineDash([8, 7]);
                        ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(0, 500); ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.globalAlpha = 1;
                        ctx.restore();
                    }
                }

                if (this.beamPhase === 'fire') {
                    const tf = Math.min(1, (80 - this.beamTimer) / 20);
                    for (let i = 0; i < 4; i++) {
                        const ba = this.beamAngle + i * Math.PI / 2;
                        ctx.save();
                        ctx.rotate(ba);
                        ctx.shadowColor = acBrt; ctx.shadowBlur = 28;
                        ctx.strokeStyle = `rgba(${hp2?'220,120,20':'200,50,10'},${0.35 * tf})`;
                        ctx.lineWidth = 28 * tf;
                        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 500); ctx.stroke();
                        ctx.strokeStyle = `rgba(255,${hp2?200:120},60,${0.8 * tf})`;
                        ctx.lineWidth = 7 * tf;
                        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 500); ctx.stroke();
                        ctx.shadowBlur = 0;
                        ctx.restore();
                    }
                }

                [-24, 24].forEach(ox => {
                    ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 14;
                    const eg = ctx.createRadialGradient(ox,36,0,ox,36,13);
                    eg.addColorStop(0,`rgba(255,140,0,${0.85 + pulse2*0.12})`);
                    eg.addColorStop(0.5,'rgba(200,50,0,0.5)');
                    eg.addColorStop(1,'rgba(100,10,0,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.ellipse(ox,36,8,13,0,0,Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0;
                });
            }

            const hg = ctx.createLinearGradient(0,-36,0,36);
            hg.addColorStop(0,    flash ? '#fff' : (hp2 ? '#dd6030' : '#bb2000'));
            hg.addColorStop(0.3,  flash ? '#fff' : (hp2 ? '#993320' : '#771000'));
            hg.addColorStop(0.65, flash ? '#fff' : '#440800');
            hg.addColorStop(1,    flash ? '#fff' : '#1e0200');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0,-36);
            ctx.lineTo(8,-28); ctx.lineTo(22,-18); ctx.lineTo(36,-6);
            ctx.lineTo(40,8);  ctx.lineTo(34,22);  ctx.lineTo(26,36);
            ctx.lineTo(-26,36);ctx.lineTo(-34,22); ctx.lineTo(-40,8);
            ctx.lineTo(-36,-6);ctx.lineTo(-22,-18);ctx.lineTo(-8,-28);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.shadowColor = acol; ctx.shadowBlur = hp2 ? 16 : 10;
                ctx.strokeStyle = `rgba(${hp2?'255,160,60':'255,70,20'},${0.65 + pulse*0.28})`;
                ctx.lineWidth = 2;
                ctx.stroke(); ctx.shadowBlur = 0;

                ctx.strokeStyle = `rgba(${hp2?'200,100,30':'180,50,10'},0.32)`; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(-36,0); ctx.lineTo(-18,-16); ctx.lineTo(0,-20); ctx.lineTo(18,-16); ctx.lineTo(36,0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-28,22); ctx.lineTo(-12,8); ctx.lineTo(12,8); ctx.lineTo(28,22); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-20,32); ctx.lineTo(-8,24); ctx.lineTo(8,24); ctx.lineTo(20,32); ctx.stroke();

                ctx.fillStyle = '#0c0000';
                ctx.beginPath(); ctx.rect(-10,-22,20,22); ctx.fill();
                ctx.strokeStyle = `rgba(${hp2?'220,140,60':'200,80,30'},0.5)`; ctx.lineWidth = 1.2; ctx.strokeRect(-10,-22,20,22);

                ctx.fillStyle = '#100000';
                ctx.beginPath(); ctx.ellipse(0,-18,7,9,0,0,Math.PI*2); ctx.fill();
                const cg = ctx.createRadialGradient(0,-18,1,0,-18,7);
                cg.addColorStop(0,'#ffddcc');
                cg.addColorStop(0.4,`rgba(${hp2?'255,160,60':'255,80,30'},${0.7 + pulse*0.28})`);
                cg.addColorStop(1,'rgba(120,20,0,0.2)');
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.ellipse(0,-18,5.5,7.5,0,0,Math.PI*2); ctx.fill();
                ctx.fillStyle = 'rgba(255,220,200,0.88)';
                ctx.beginPath(); ctx.ellipse(-2,-20,2,3.2,0,0,Math.PI*2); ctx.fill();

                ctx.fillStyle = '#0a0000';
                ctx.beginPath(); ctx.arc(0,8,12,0,Math.PI*2); ctx.fill();
                const rg = ctx.createRadialGradient(0,8,1,0,8,12);
                rg.addColorStop(0,'#ffffff');
                rg.addColorStop(0.2, acBrt);
                rg.addColorStop(0.5,`rgba(${hp2?'255,120,0':'220,40,0'},${0.6 + pulse*0.36})`);
                rg.addColorStop(1,'rgba(0,0,0,0)');
                ctx.shadowColor = acBrt; ctx.shadowBlur = 20 + (hp2 ? 10 : 0);
                ctx.fillStyle = rg;
                ctx.beginPath(); ctx.arc(0,8,12,0,Math.PI*2); ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(0,8,4.5,0,Math.PI*2); ctx.fill();
                ctx.shadowBlur = 0;

                [-22, 22].forEach(ox => {
                    ctx.fillStyle = '#110000';
                    ctx.beginPath(); ctx.rect(ox-2,12,4,16); ctx.fill();
                    ctx.shadowColor = acol; ctx.shadowBlur = 8;
                    ctx.fillStyle = `rgba(${hp2?'255,140,0':'255,60,0'},${0.45 + pulse*0.4})`;
                    ctx.beginPath(); ctx.arc(ox,28,4,0,Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0;
                });
            }

            this.drawHpBar(ctx, 88, 46);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Boss7_Sovereign };
})();

EnemyRegistry.register({ label:'Sovereign', scale:0.20, group:'BOSSES', mk:()=>new Boss7_Sovereign.Boss7_Sovereign() });
