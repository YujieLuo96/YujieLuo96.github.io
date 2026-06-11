var Boss2_Colossus = (() => {
    class Cannon {
        constructor(side) {
            this.side = side; // 'left' | 'right'
            this.hp = 38; this.maxHp = 38;
            this.oy = 0;
            this.alive = true;
            this.shootTimer = 0;
            this.flashTimer = 0;
        }
        get ox() { return this.side === 'left' ? -52 : 52; }
        takeDamage(d) {
            this.hp -= d; this.flashTimer = 5;
            if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; }
            return false;
        }
        getBounds(bx, by) { return { x: bx + this.ox - 14, y: by - 14, w: 28, h: 30 }; }
    }

    class Boss2 extends EnemyBase {
        constructor() {
            super({ x: Renderer.W / 2, y: -110, hp: 160, score: 5000, type: 'boss2',
                    dropChance: 1.0,
                    dropTable: ['power','bomb','health','shield','spread_w','homing_w','laser_w','plasma_w'],
                    w: 130, h: 95 });
            this.entryY   = 115;
            this.entered  = false;
            this.phase    = 1;
            this.baseX    = Renderer.W / 2;
            this.cannons  = [new Cannon('left'), new Cannon('right')];
            this.mainTimer= 0;
            this.mainInterval = 25;
            this.legAngle = 0;
            this.specialTimer = 60;   // 重锤轮环大招计时
            this.charge       = 0;    // >0 = 蓄力剩余帧
            this.chargeMax    = 40;
            this.stumpTimer   = 0;    // 狂暴期残口彗星计时
        }
        getCannons() { return this.cannons; }

        update(dt, fc) {
            if (!this.entered) {
                this.y += 1.2 * dt;
                if (this.y >= this.entryY) { this.entered = true; this.y = this.entryY; }
                this.checkEntered();
                return null;
            }
            const ratio = this.hp / this.maxHp;
            if (ratio <= 0.6 && this.phase < 2) {
                this.phase = 2; this.mainInterval = 18;
                ExplosionFX.mediumEnemy(this.x - 40, this.y, '#4f6');
                ExplosionFX.mediumEnemy(this.x + 40, this.y - 10, '#8fa');
            }
            if (ratio <= 0.3 && this.phase < 3) {
                this.phase = 3; this.mainInterval = 12;
                ExplosionFX.mediumEnemy(this.x - 26, this.y + 16, '#f60');
                ExplosionFX.mediumEnemy(this.x + 26, this.y - 14, '#f80');
                ExplosionFX.mediumEnemy(this.x, this.y - 30, '#fc4');
            }
            const enraged = this.phase >= 3;

            this.legAngle += (enraged ? 0.022 : 0.015) * dt;
            if (this.charge <= 0) this.baseX += Math.sin(fc * 0.014) * 1.5 * dt;
            this.baseX = Math.max(this.w / 2 + 5, Math.min(Renderer.W - this.w / 2 - 5, this.baseX));
            this.x     = this.baseX;

            // 残血受损烟雾 + 火星（节流）
            if (ratio <= 0.3) {
                if (fc % 6 < 1)
                    ParticleSystem.spawn(this.x - 24 + Math.random() * 48, this.y - 12,
                        { count: 1, colors: ['#666', '#888', '#a64'], speed: 0.5, life: 46, size: 4, gravity: -0.02 });
                if (fc % 14 < 1)
                    ParticleSystem.spawn(this.x + (Math.random() - 0.5) * 70, this.y + 20,
                        { count: 2, colors: ['#fc6', '#f82'], speed: 2.4, life: 12, size: 2, shape: 'spark' });
            }

            const bullets = [];

            // ── 重锤大招：蓄力 40 帧 → 重型 big 弹双层缺口轮环 ───────────
            if (this.charge > 0) {
                this.charge -= dt;
                if (fc % 5 < 1)
                    ParticleSystem.spawn(this.x, this.y,
                        { count: 2, colors: enraged ? ['#fa6', '#f44', '#fff'] : ['#8f8', '#4f6', '#fff'],
                          speed: 0.6, life: 15, size: 2.5, scatter: 28 });
                if (this.charge <= 0) {
                    const p = Player.getPos();
                    const gapA = Math.atan2(p.y - this.y, p.x - this.x);   // 缺口朝玩家，给活路
                    const o = { bulletOpts: { type: 'big', radius: 6, color: enraged ? '#f55' : '#5f6' } };
                    if (this.phase === 1) {
                        bullets.push(...BulletPatterns.ringGap(this.x, this.y, 16, 2.8, fc * 0.02, gapA, 0.5, o));
                    } else {   // 大开大合：内慢外快双层同缺口
                        bullets.push(...BulletPatterns.ringGap(this.x, this.y, 18, 2.5, fc * 0.02, gapA, 0.5, o));
                        bullets.push(...BulletPatterns.ringGap(this.x, this.y, 18, 3.4, fc * 0.02 + 0.17, gapA, 0.5, o));
                    }
                    this.mainTimer = -45;   // 爆发后呼吸间隙
                }
                return bullets.length ? bullets : null;   // 蓄力期间主炮静默
            }
            this.specialTimer += dt;
            if (this.specialTimer >= (enraged ? 130 : this.phase === 2 ? 160 : 200)) {
                this.specialTimer = 0;
                this.charge = this.chargeMax;
                return null;
            }

            // Main body fire
            this.mainTimer += dt;
            if (this.mainTimer >= this.mainInterval) {
                this.mainTimer = 0;
                const p = Player.getPos();
                bullets.push(...BulletPatterns.aimed(this.x, this.y + 48, p.x, p.y, 5.0, { count: 3 + this.phase, spread: 0.5 }));
                if (this.phase >= 3)
                    bullets.push(...BulletPatterns.spiral(this.x, this.y, 5, 4.8, fc * 0.1));
            }
            // Cannon fire —— 重型 big 炮弹
            for (const c of this.cannons) {
                if (!c.alive) continue;
                c.flashTimer = Math.max(0, c.flashTimer - dt);
                c.shootTimer += dt;
                const interval = 50 - this.phase * 8;
                if (c.shootTimer >= interval) {
                    c.shootTimer = 0;
                    const cx = this.x + c.ox, cy = this.y;
                    const p  = Player.getPos();
                    bullets.push(...BulletPatterns.aimed(cx, cy + 14, p.x, p.y, 4.4,
                        { count: 2, spread: 0.22, bulletOpts: { type: 'big', radius: 5, color: enraged ? '#f86' : '#6f8' } }));
                    // Cross-fire: also fire perpendicular
                    if (this.phase >= 2)
                        bullets.push(new EnemyBullet(cx, cy, c.side === 'left' ? 4.6 : -4.6, 2.2));
                }
            }
            // 狂暴：被毁炮座残口喷出限时追踪彗星（橙）
            if (enraged) {
                const dead = this.cannons.filter(c => !c.alive);
                if (dead.length) {
                    this.stumpTimer += dt;
                    if (this.stumpTimer >= 110) {
                        this.stumpTimer = 0;
                        const p = Player.getPos();
                        for (const c of dead)
                            bullets.push(...BulletPatterns.homingFlare(this.x + c.ox, this.y + 6, p.x, p.y, 3.0,
                                { bulletOpts: { homing: 90 } }));
                    }
                }
            }
            return bullets.length ? bullets : null;
        }
        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);

            const ph    = this.phase;
            const pulse = 0.5 + Math.sin(fc * 0.18) * 0.45;
            const isRed = ph >= 3;
            const phCol  = isRed ? '#ff5030' : '#40e060';
            const phGlow = isRed ? '#ff3010' : '#20cc40';

            if (!flash) {
                // ── 4 Mechanical legs ──────────────────────────────────────
                // Each leg: upper segment (rect), joint circle, lower segment (rect)
                for (let i = 0; i < 4; i++) {
                    const la  = this.legAngle + (i / 4) * Math.PI * 2;
                    const wave = Math.sin(this.legAngle * 4 + i * Math.PI / 2) * 8;
                    const lx  = Math.cos(la) * 52;
                    const ly  = Math.sin(la) * 22 + 28;

                    ctx.save();
                    ctx.translate(lx, ly);

                    // Upper leg segment
                    ctx.fillStyle = '#2a3030';
                    ctx.fillRect(-5, -14 + wave * 0.3, 10, 14);
                    ctx.strokeStyle = isRed ? 'rgba(200,60,40,0.5)' : 'rgba(60,160,80,0.5)';
                    ctx.lineWidth = 1; ctx.strokeRect(-5, -14 + wave * 0.3, 10, 14);

                    // Joint circle
                    ctx.fillStyle = '#1a2020';
                    ctx.beginPath(); ctx.arc(0, wave * 0.3, 5, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = isRed ? 'rgba(255,80,50,0.6)' : 'rgba(60,200,80,0.6)';
                    ctx.lineWidth = 1.5; ctx.stroke();

                    // Lower leg segment
                    ctx.fillStyle = '#222828';
                    ctx.fillRect(-4, wave * 0.3, 8, 13);
                    ctx.restore();
                }

                // ── Phase 3 red energy vents ───────────────────────────────
                if (isRed) {
                    ctx.shadowColor = '#ff4020'; ctx.shadowBlur = 8;
                    ctx.strokeStyle = 'rgba(255,160,60,0.65)'; ctx.lineWidth = 1.5;
                    [[-30,10],[30,10]].forEach(([vx,vy]) => {
                        ctx.beginPath();
                        ctx.moveTo(vx - 6, vy - 4); ctx.lineTo(vx, vy + 2); ctx.lineTo(vx + 6, vy - 4);
                        ctx.stroke();
                    });
                    ctx.shadowBlur = 0;
                }
            }

            // ── Main hull ─────────────────────────────────────────────────
            const hg = ctx.createLinearGradient(0, -47, 0, 50);
            if (isRed) {
                hg.addColorStop(0,   '#664030'); hg.addColorStop(0.45, '#3a1410');
                hg.addColorStop(1,   '#1c0808');
            } else {
                hg.addColorStop(0,   '#2a4a36'); hg.addColorStop(0.45, '#182e20');
                hg.addColorStop(1,   '#0c1a10');
            }
            ctx.fillStyle = flash ? '#fff' : hg;
            ctx.beginPath();
            ctx.moveTo(0,  -47); ctx.lineTo(24, -30); ctx.lineTo(56, -10);
            ctx.lineTo(62,  15); ctx.lineTo(48,  40); ctx.lineTo(24,  48);
            ctx.lineTo(-24, 48); ctx.lineTo(-48, 40); ctx.lineTo(-62, 15);
            ctx.lineTo(-62,-10); ctx.lineTo(-24,-30);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.shadowColor = phGlow; ctx.shadowBlur = 10;
                ctx.strokeStyle = isRed ? 'rgba(255,100,80,0.9)' : 'rgba(100,200,120,0.8)';
                ctx.lineWidth   = 2.5; ctx.stroke();
                ctx.shadowBlur  = 0;

                // ── Hull armor lines + structural ribs ─────────────────────
                ctx.strokeStyle = isRed ? 'rgba(255,100,60,0.28)' : 'rgba(60,200,100,0.22)';
                ctx.lineWidth   = 1;
                [[-28,-14,28], [-36,2,36], [-32,18,32]].forEach(([lx,ly,rx]) => {
                    ctx.beginPath();
                    ctx.moveTo(lx, ly); ctx.lineTo(0, ly-7); ctx.lineTo(rx, ly);
                    ctx.stroke();
                });
                // Vertical rib lines
                ctx.strokeStyle = isRed ? 'rgba(255,80,40,0.18)' : 'rgba(40,180,80,0.18)';
                [-18, 0, 18].forEach(vx => {
                    ctx.beginPath(); ctx.moveTo(vx, -20); ctx.lineTo(vx, 36); ctx.stroke();
                });

                // ── Cannon housings ────────────────────────────────────────
                for (const c of this.cannons) {
                    const blink = c.flashTimer > 0 && Math.floor(c.flashTimer * 20) % 2 === 0;
                    ctx.save(); ctx.translate(c.ox, 0);

                    if (blink) {
                        ctx.fillStyle = '#fff';
                        ctx.beginPath(); ctx.roundRect(-14, -16, 28, 34, 5); ctx.fill();
                    } else if (c.alive) {
                        // Outer housing
                        const cg = ctx.createLinearGradient(0, -16, 0, 18);
                        cg.addColorStop(0,  isRed ? '#3a1810' : '#1a2830');
                        cg.addColorStop(1,  isRed ? '#1a0808' : '#0c1820');
                        ctx.fillStyle = cg;
                        ctx.beginPath(); ctx.roundRect(-14, -16, 28, 34, 5); ctx.fill();
                        ctx.strokeStyle = isRed ? 'rgba(255,80,50,0.6)' : 'rgba(60,180,100,0.55)';
                        ctx.lineWidth = 1.5; ctx.stroke();

                        // Inner mechanism circle
                        ctx.fillStyle = isRed ? '#280a08' : '#0a1818';
                        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = isRed ? 'rgba(200,60,40,0.7)' : 'rgba(40,180,80,0.7)';
                        ctx.lineWidth = 1.5; ctx.stroke();

                        // Muzzle port glow
                        const mg = ctx.createRadialGradient(0, 14, 1, 0, 14, 10);
                        mg.addColorStop(0,   isRed ? 'rgba(255,120,40,0.9)' : 'rgba(80,255,120,0.9)');
                        mg.addColorStop(0.5, isRed ? 'rgba(200,60,0,0.4)'   : 'rgba(20,160,60,0.4)');
                        mg.addColorStop(1,   'rgba(0,0,0,0)');
                        ctx.shadowColor = phGlow; ctx.shadowBlur = 10;
                        ctx.fillStyle   = mg;
                        ctx.beginPath(); ctx.arc(0, 14, 10, 0, Math.PI * 2); ctx.fill();
                        ctx.shadowBlur  = 0;
                        // Muzzle bright dot
                        ctx.fillStyle = isRed ? '#ff8040' : '#40ff80';
                        ctx.beginPath(); ctx.arc(0, 14, 3.5, 0, Math.PI * 2); ctx.fill();
                    } else {
                        // Dead cannon
                        ctx.fillStyle = '#181010';
                        ctx.beginPath(); ctx.roundRect(-14, -16, 28, 34, 5); ctx.fill();
                        ctx.strokeStyle = 'rgba(60,30,30,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
                        // 狂暴期残口余烬 —— 预示追踪彗星喷射位
                        if (ph >= 3) {
                            ctx.fillStyle = `rgba(255,140,60,${0.35 + pulse * 0.45})`;
                            ctx.beginPath(); ctx.arc(0, 12, 4, 0, Math.PI * 2); ctx.fill();
                        }
                    }
                    ctx.restore();
                }

                // ── Central mechanical core ────────────────────────────────
                // Outer gear-like ring (dashed circle)
                ctx.strokeStyle = isRed ? 'rgba(255,80,50,0.55)' : 'rgba(80,220,100,0.55)';
                ctx.lineWidth = 2; ctx.setLineDash([4,3]);
                ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);

                // Gear teeth (8 short lines radiating out)
                ctx.strokeStyle = isRed ? 'rgba(255,100,60,0.45)' : 'rgba(80,200,100,0.45)';
                ctx.lineWidth = 2;
                for (let i = 0; i < 8; i++) {
                    const ga = (i / 8) * Math.PI * 2 + this.legAngle;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(ga)*20, Math.sin(ga)*20);
                    ctx.lineTo(Math.cos(ga)*26, Math.sin(ga)*26);
                    ctx.stroke();
                }

                // Inner dark base
                ctx.fillStyle = '#0d0d0d';
                ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();

                // Glowing energy core
                const cg = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
                cg.addColorStop(0,    '#ffffff');
                cg.addColorStop(0.3,  isRed ? `rgba(255,100,50,${0.7+pulse*0.3})` : `rgba(80,220,100,${0.7+pulse*0.3})`);
                cg.addColorStop(0.7,  isRed ? 'rgba(180,40,20,0.5)' : 'rgba(20,140,50,0.5)');
                cg.addColorStop(1,    'rgba(0,0,0,0)');
                ctx.shadowColor = phGlow; ctx.shadowBlur = 18;
                ctx.fillStyle   = cg;
                ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur  = 0;
                ctx.fillStyle   = '#fff';
                ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
            }

            // ── 重锤蓄力 telegraph：核心聚能球由小变大、颜色脉动 ──────────
            if (!flash && this.charge > 0) {
                const prog = 1 - this.charge / this.chargeMax;
                const cr = 4 + prog * 17 + Math.sin((fc || 0) * 0.5) * 2;
                const og = ctx.createRadialGradient(0, 0, 0, 0, 0, cr);
                og.addColorStop(0,   '#fff');
                og.addColorStop(0.4, isRed ? 'rgba(255,120,60,0.95)' : 'rgba(120,255,150,0.95)');
                og.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = og;
                ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI * 2); ctx.fill();
            }

            this.drawHpBar(ctx, 110, -62);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }
    return { Boss2 };
})();

EnemyRegistry.register({ label:'Colossus', scale:0.22, group:'BOSSES', mk:()=>new Boss2_Colossus.Boss2() });
