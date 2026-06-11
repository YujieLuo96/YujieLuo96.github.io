var Boss3_Chaos = (() => {
    class Boss3 extends EnemyBase {
        constructor() {
            super({ x: Renderer.W / 2, y: -110, hp: 220, score: 10000, type: 'boss3',
                    dropChance: 1.0,
                    dropTable: ['power','bomb','health','shield','spread_w','homing_w','laser_w','plasma_w'],
                    w: 110, h: 95 });
            this.entryY       = 120;
            this.entered      = false;
            this.phase        = 1;
            this.targetX      = Renderer.W / 2;
            this.targetY      = 120;
            this.teleportCool = 0;
            this.summonTimer  = 0;
            this.shootTimer   = 0;
            this.shootInterval= 22;
            this.rotAngle     = 0;
            this.tentacleAng  = 0;
            this.windmill     = 0;    // >0 = 风车持续剩余帧（传送落点展开）
            this.windRot      = 0;
            this.windDir      = 1;    // 每次传送反转旋向
            this.windEmit     = 0;
            this.charge       = 0;    // >0 = 花开大招蓄力剩余帧
            this.chargeMax    = 36;
            this.specialTimer = 0;
        }
        update(dt, fc) {
            if (!this.entered) {
                this.y += 1.3 * dt;
                if (this.y >= this.entryY) { this.entered = true; this.y = this.entryY; }
                this.checkEntered();
                return null;
            }
            const ratio = this.hp / this.maxHp;
            if (ratio <= 0.6 && this.phase < 2) {
                this.phase = 2; this.shootInterval = 16;
                this.teleportCool = 60;
                ExplosionFX.mediumEnemy(this.x - 24, this.y, '#f4f');
                ExplosionFX.mediumEnemy(this.x + 24, this.y - 10, '#a4f');
            }
            if (ratio <= 0.3 && this.phase < 3) {
                this.phase = 3; this.shootInterval = 11;
                ExplosionFX.mediumEnemy(this.x - 20, this.y + 12, '#f43');
                ExplosionFX.mediumEnemy(this.x + 20, this.y - 12, '#f4f');
            }
            if (ratio <= 0.1 && this.phase < 4) {
                this.phase = 4; this.shootInterval = 12;   // 单发更重，节奏放给风车/花弹叠层
                ExplosionFX.mediumEnemy(this.x - 26, this.y, '#fc0');
                ExplosionFX.mediumEnemy(this.x + 26, this.y, '#fc0');
                ExplosionFX.mediumEnemy(this.x, this.y - 20, '#fff');
            }

            this.rotAngle    += 0.02 * dt;
            this.tentacleAng += (this.phase >= 4 ? 0.045 : 0.03) * dt;

            // 残血能量泄漏：紫色余烬 + 火星（节流）
            if (ratio <= 0.3) {
                if (fc % 7 < 1)
                    ParticleSystem.spawn(this.x + (Math.random() - 0.5) * 40, this.y + (Math.random() - 0.5) * 30,
                        { count: 1, colors: ['#a4f', '#64f', '#856'], speed: 0.6, life: 36, size: 3, gravity: -0.015 });
                if (fc % 15 < 1)
                    ParticleSystem.spawn(this.x, this.y,
                        { count: 2, colors: ['#fc8', '#f6f'], speed: 2.6, life: 12, size: 2, shape: 'spark' });
            }

            // Teleport (phase 2+) —— 落点展开双向反转风车（蓄力中不闪现）
            if (this.phase >= 2 && this.charge <= 0) {
                this.teleportCool -= dt;
                if (this.teleportCool <= 0) {
                    this.targetX = 60 + Math.random() * (Renderer.W - 120);
                    this.targetY = 80 + Math.random() * 140;
                    // Teleport flash effect
                    ParticleSystem.spawn(this.x, this.y, { count: 20, colors: ['#a4f','#64f','#fff'], speed: 5, life: 20 });
                    this.x = this.targetX; this.y = this.targetY;
                    ParticleSystem.spawn(this.x, this.y, { count: 20, colors: ['#a4f','#64f','#fff'], speed: 5, life: 20 });
                    this.windmill = 55 + this.phase * 8;
                    this.windDir *= -1;                          // 双向反转
                    this.windEmit = 0;
                    this.teleportCool = this.windmill + 55 - this.phase * 5;
                    this.shootTimer = -(this.windmill + 35);     // 风车期间普攻静默 + 收尾呼吸
                }
            } else if (this.phase < 2) {
                // Phase 1: gentle sway
                const dx = this.targetX - this.x, dy = this.targetY - this.y;
                const d  = Math.sqrt(dx * dx + dy * dy) + 0.01;
                this.x  += (dx / d) * Math.min(d, 1.5) * dt;
                this.y  += (dy / d) * Math.min(d, 1.5) * dt;
                this.targetX = Renderer.W / 2 + Math.sin(fc * 0.015) * Math.min(160, Renderer.W * 0.4 - 60);
                this.targetY = 120 + Math.sin(fc * 0.01) * 40;
            }

            const bullets = [];

            // ── 双向反转风车：青/品红水晶弹流（持续流 → 自带节奏）─────────
            if (this.windmill > 0) {
                this.windmill -= dt;
                this.windRot  += 0.10 * this.windDir * dt;
                this.windEmit += dt;
                if (this.windEmit >= 6) {
                    this.windEmit = 0;
                    const arms = this.phase >= 4 ? 4 : 3;
                    bullets.push(...BulletPatterns.spiralArms(this.x, this.y, arms, this.windRot, 3.0,
                        { bulletOpts: { type: 'shard', radius: 4, color: '#3ef', life: 300 } }));
                    bullets.push(...BulletPatterns.spiralArms(this.x, this.y, arms, -this.windRot + 0.5, 3.0,
                        { bulletOpts: { type: 'shard', radius: 4, color: '#f4f', life: 300 } }));
                }
            }

            // ── 花开大招（phase 3+）：蓄力 36 帧 → 双层 bloom 星弹 ────────
            if (this.phase >= 3) {
                if (this.charge > 0) {
                    this.charge -= dt;
                    if (fc % 5 < 1)
                        ParticleSystem.spawn(this.x, this.y,
                            { count: 2, colors: ['#f6c', '#fff', '#f4f'], speed: 0.6, life: 14, size: 2.3, scatter: 26 });
                    if (this.charge <= 0) {
                        bullets.push(...BulletPatterns.bloom(this.x, this.y, 18, Math.random() * Math.PI));
                        bullets.push(...BulletPatterns.bloom(this.x, this.y, 12, Math.random() * Math.PI,
                            { speed: 1.3, bulletOpts: { color: '#fc6', accel: 0.055, maxSpeed: 5.2 } }));
                        this.shootTimer = Math.min(this.shootTimer, -40);   // 爆发后呼吸间隙
                    }
                    return bullets.length ? bullets : null;   // 蓄力期间停普攻
                }
                this.specialTimer += dt;
                if (this.specialTimer >= (this.phase >= 4 ? 120 : 155) && this.windmill <= 0) {
                    this.specialTimer = 0;
                    this.charge = this.chargeMax;
                }
            }

            this.shootTimer += dt;
            if (this.shootTimer >= this.shootInterval) {
                this.shootTimer = 0;
                bullets.push(...this._shoot(fc));
            }

            // Summon scouts (phase 2+)
            if (this.phase >= 2) {
                this.summonTimer += dt;
                const summonRate = this.phase === 4 ? 55 : 90;
                if (this.summonTimer >= summonRate) {
                    this.summonTimer = 0;
                    EnemyManager.spawnKind('scout', 1);
                    if (this.phase >= 3) EnemyManager.spawnKind('scout', 1);
                }
            }
            return bullets.length ? bullets : null;
        }
        _shoot(fc) {
            const p = Player.getPos();
            const bullets = [];
            switch (this.phase) {
                case 1:
                    bullets.push(...BulletPatterns.aimed(this.x, this.y + 48, p.x, p.y, 5.0, { count: 3, spread: 0.45 }));
                    if (fc % 35 < 1) bullets.push(...BulletPatterns.ring(this.x, this.y, 16, 4.5, fc * 0.04));
                    break;
                case 2:
                    bullets.push(...BulletPatterns.ring(this.x, this.y, 18, 5.2, fc * 0.05));
                    bullets.push(...BulletPatterns.aimed(this.x, this.y, p.x, p.y, 5.0, { count: 3, spread: 0.4 }));
                    break;
                case 3:
                    bullets.push(...BulletPatterns.ring(this.x, this.y, 20, 5.2, fc * 0.06));
                    bullets.push(...BulletPatterns.aimed(this.x, this.y, p.x, p.y, 5.4, { count: 5, spread: 0.6 }));
                    break;
                case 4: {
                    // 狂暴：大环留缺口（缺口朝玩家，给活路）+ 重瞄准扇
                    const gapA = Math.atan2(p.y - this.y, p.x - this.x);
                    bullets.push(...BulletPatterns.ringGap(this.x, this.y, 24, 5.5, fc * 0.07, gapA, 0.5));
                    bullets.push(...BulletPatterns.aimed(this.x, this.y, p.x, p.y, 5.5, { count: 6, spread: 0.7 }));
                    break;
                }
            }
            return bullets;
        }
        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);

            const ph    = this.phase;
            const pulse = 0.5 + Math.sin(fc * 0.15) * 0.45;
            const phaseColors = [
                ['#9922ff','#4400aa','rgba(160,40,255,0.8)'],
                ['#ff44ff','#880088','rgba(255,80,255,0.8)'],
                ['#ff3030','#880000','rgba(255,80,60,0.8)'],
                ['#ffcc00','#664400','rgba(255,200,40,0.8)']
            ];
            const [c1, c2, cEdge] = phaseColors[ph - 1] || phaseColors[0];

            if (!flash) {
                // ── Phase 4 outer aura glow ring ──────────────────────────
                if (ph === 4) {
                    const aura = ctx.createRadialGradient(0, 0, 44, 0, 0, 72);
                    aura.addColorStop(0,   `rgba(255,200,40,${0.15 + pulse * 0.18})`);
                    aura.addColorStop(1,   'rgba(0,0,0,0)');
                    ctx.fillStyle = aura;
                    ctx.beginPath(); ctx.arc(0, 0, 72, 0, Math.PI * 2); ctx.fill();
                }

                // ── 8 plasma-arc tentacles ─────────────────────────────────
                for (let i = 0; i < 8; i++) {
                    const a     = (Math.PI * 2 / 8) * i + this.tentacleAng;
                    const tl    = 40 + Math.sin(fc * 0.05 + i * 1.3) * 12;
                    const cpA   = a + 0.4;
                    const cpx   = Math.cos(cpA) * tl * 0.55;
                    const cpy   = Math.sin(cpA) * tl * 0.55;
                    const tx    = Math.cos(a) * tl;
                    const ty    = Math.sin(a) * tl;

                    // Outer thick dim arc
                    ctx.shadowColor = c1; ctx.shadowBlur = 3;
                    ctx.strokeStyle = `rgba(${ph===4?'120,80,0':ph===3?'120,20,20':ph===2?'120,20,120':'60,10,120'},0.4)`;
                    ctx.lineWidth   = 7;
                    ctx.beginPath(); ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(cpx, cpy, tx, ty); ctx.stroke();

                    // Medium main arc
                    ctx.strokeStyle = c2.replace('#','').length === 6
                        ? c1 : c1;
                    ctx.strokeStyle = ph===4?'rgba(200,140,20,0.75)':ph===3?'rgba(200,40,40,0.75)':ph===2?'rgba(200,60,200,0.75)':'rgba(120,40,220,0.75)';
                    ctx.lineWidth   = 3.5;
                    ctx.beginPath(); ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(cpx, cpy, tx, ty); ctx.stroke();

                    // Thin bright inner arc
                    ctx.strokeStyle = ph===4?'rgba(255,230,80,0.9)':ph===3?'rgba(255,100,80,0.9)':ph===2?'rgba(255,120,255,0.9)':'rgba(180,80,255,0.9)';
                    ctx.lineWidth   = 1.5;
                    ctx.shadowColor = c1; ctx.shadowBlur = 8;
                    ctx.beginPath(); ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(cpx, cpy, tx, ty); ctx.stroke();
                    ctx.shadowBlur  = 0;

                    // Tentacle tip — outer dim halo
                    ctx.globalAlpha = 0.35;
                    ctx.fillStyle   = c1;
                    ctx.beginPath(); ctx.arc(tx, ty, 10, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1;
                    // Inner bright tip
                    const tg = ctx.createRadialGradient(tx, ty, 1, tx, ty, 6);
                    tg.addColorStop(0,   '#fff');
                    tg.addColorStop(0.4, c1);
                    tg.addColorStop(1,   'rgba(0,0,0,0)');
                    ctx.shadowColor = c1; ctx.shadowBlur = 10;
                    ctx.fillStyle   = tg;
                    ctx.beginPath(); ctx.arc(tx, ty, 6, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur  = 0;
                }

                // ── Rotating inner radial geometry ─────────────────────────
                ctx.save();
                ctx.rotate(this.rotAngle);
                ctx.strokeStyle = ph===4?'rgba(255,200,40,0.35)':ph===3?'rgba(255,60,40,0.3)':ph===2?'rgba(255,80,255,0.3)':'rgba(160,60,255,0.35)';
                ctx.lineWidth = 1;
                for (let i = 0; i < 8; i++) {
                    const ra = (i / 8) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(ra) * 24, Math.sin(ra) * 24);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // ── Star-shaped body (8 points) ────────────────────────────────
            const bg = ctx.createRadialGradient(0, 0, 6, 0, 0, 50);
            bg.addColorStop(0,   flash ? '#fff' : c1);
            bg.addColorStop(0.45, flash ? '#fff' : c2);
            bg.addColorStop(1,   flash ? '#aaa' : 'rgba(0,0,0,0)');
            ctx.fillStyle = bg;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a  = (Math.PI * 2 / 8) * i + this.rotAngle;
                const ri = i % 2 === 0 ? 48 : 28;
                if (i === 0) ctx.moveTo(Math.cos(a) * ri, Math.sin(a) * ri);
                else         ctx.lineTo(Math.cos(a) * ri, Math.sin(a) * ri);
            }
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.shadowColor = c1; ctx.shadowBlur = 12;
                ctx.strokeStyle = cEdge;
                ctx.lineWidth   = 2.5; ctx.stroke();
                ctx.shadowBlur  = 0;

                // ── Outer glow ring around body ────────────────────────────
                ctx.globalAlpha = 0.25 + pulse * 0.2;
                ctx.strokeStyle = c1;
                ctx.lineWidth   = 4;
                ctx.shadowColor = c1; ctx.shadowBlur = 14;
                ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI * 2); ctx.stroke();
                ctx.shadowBlur  = 0; ctx.globalAlpha = 1;

                // ── Eye — multi-layer ──────────────────────────────────────
                // Outer iris ring
                ctx.strokeStyle = ph===4?'rgba(200,150,0,0.7)':ph===3?'rgba(200,40,40,0.7)':ph===2?'rgba(200,40,200,0.7)':'rgba(140,40,220,0.7)';
                ctx.lineWidth   = 2;
                ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();

                // Inner fill
                const eyeCol = ph===4?`rgba(255,200,0,${0.6+pulse*0.35})`:ph===3?`rgba(255,60,40,${0.6+pulse*0.35})`:ph===2?`rgba(240,60,240,${0.6+pulse*0.35})`:`rgba(180,40,255,${0.6+pulse*0.35})`;
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
                ctx.shadowColor = c1; ctx.shadowBlur = 10;
                ctx.fillStyle   = eyeCol;
                ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur  = 0;

                // Pupil slit (vertical rect)
                ctx.fillStyle = '#000';
                ctx.fillRect(-2, -12, 4, 24);

                // Specular highlight (top-left)
                ctx.globalAlpha = 0.65;
                ctx.fillStyle   = '#fff';
                ctx.beginPath(); ctx.ellipse(-5, -6, 3.5, 2, -0.5, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
            }

            // ── 花开大招蓄力 telegraph：瞳孔聚能光球由小变大、粉色脉动 ────
            if (!flash && this.charge > 0) {
                const prog = 1 - this.charge / this.chargeMax;
                const cr = 4 + prog * 15 + Math.sin((fc || 0) * 0.55) * 2;
                const og = ctx.createRadialGradient(0, 0, 0, 0, 0, cr);
                og.addColorStop(0,    '#fff');
                og.addColorStop(0.45, 'rgba(255,120,220,0.95)');
                og.addColorStop(1,    'rgba(255,60,200,0)');
                ctx.fillStyle = og;
                ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI * 2); ctx.fill();
            }

            this.drawHpBar(ctx, 100, -62);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }
    return { Boss3 };
})();

EnemyRegistry.register({ label:'Chaos', scale:0.22, group:'BOSSES', mk:()=>new Boss3_Chaos.Boss3() });
