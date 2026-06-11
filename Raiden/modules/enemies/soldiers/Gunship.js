var Gunship = (() => {
    class Gunship extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 6, score: 130, type: 'gunship',
                    dropChance: 0.22, dropTable: ['power', 'bomb', 'health'], w: 46, h: 40 });
            this.speed        = 1.0 + Math.random() * 0.5;
            this.targetY      = 110 + Math.random() * 130;
            this.phase        = 'entry';
            this.haltTimer    = 0;
            this.haltMax      = 110 + Math.random() * 60;
            this.burstCount   = 0;
            this.burstMax     = 3;
            this.burstTimer   = 0;
            this.burstPause   = false;
            this.pauseTimer   = 0;
            this.driftAngle   = Math.random() * Math.PI * 2;
        }

        update(dt, fc) {
            // 低血量冒烟（节流：每 7 帧一次）
            if (this.hp / this.maxHp < 0.4 && ((fc | 0) % 7) === 0) {
                ParticleSystem.spawn(this.x + (Math.random() - 0.5) * 20, this.y, {
                    count: 1, angle: -Math.PI / 2, spread: 0.6, speed: 0.7,
                    size: 3, life: 30, drag: 0.99, colors: ['#778', '#99a', '#556'],
                });
            }

            switch (this.phase) {
                case 'entry':
                    this.y += this.speed * 1.6 * dt;
                    if (this.y >= this.targetY) { this.y = this.targetY; this.phase = 'halt'; }
                    break;

                case 'halt':
                    this.driftAngle += 0.016 * dt;
                    this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2,
                        this.x + Math.sin(this.driftAngle) * 1.1 * dt));
                    this.haltTimer += dt;

                    if (!this.burstPause) {
                        this.burstTimer += dt;
                        if (this.burstTimer >= 12) {
                            this.burstTimer = 0;
                            this.burstCount++;
                            const p = Player.getPos();
                            const aimAng = Math.atan2(p.y - this.y, p.x - this.x);
                            let shots;
                            if (this.burstCount >= this.burstMax) {
                                // 第三轮：双发直瞄 + 朝玩家方向留缺口的压制环
                                shots = BulletPatterns.aimed(this.x, this.y + 20,
                                    p.x, p.y, 5.5, { count: 2, spread: 0.22 });
                                shots.push(...BulletPatterns.ringGap(this.x, this.y, 10, 2.7,
                                    Math.random() * 0.6, aimAng, 0.55,
                                    { bulletOpts: { radius: 4, color: '#3de' } }));
                                this.burstCount = 0;
                                this.burstPause = true;
                                this.pauseTimer = 68;
                            } else {
                                shots = BulletPatterns.aimed(this.x, this.y + 20,
                                    p.x, p.y, 5.5, { count: 3, spread: 0.32 });
                            }
                            ParticleSystem.spawn(this.x, this.y + 20, {
                                count: 4, angle: aimAng, spread: 0.6, speed: 3.5,
                                size: 2, life: 12, shape: 'spark',
                                colors: ['#9ef', '#4cf', '#fff'],
                            });
                            if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                            return shots;
                        }
                    } else {
                        this.pauseTimer -= dt;
                        if (this.pauseTimer <= 0) this.burstPause = false;
                    }
                    if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                    break;

                case 'exit':
                    this.y += this.speed * 1.8 * dt;
                    break;
            }
            this.checkEntered();
            if (this.isOffscreen()) { this.alive = false; }
            return null;
        }

        draw(ctx, dt, fc) {
            const f = fc || 0;
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const inBurst = this.phase === 'halt' && !this.burstPause;
            const firing  = inBurst && this.burstTimer < 4;
            // 开火预警：burstTimer 逼近 12 帧阈值时炮口蓄力渐亮
            const chargeK = inBurst ? Math.min(1, this.burstTimer / 12) : 0;
            // 第三轮（缺口环）前核心剧烈脉冲预警
            const preRing = inBurst && this.burstCount === this.burstMax - 1;

            if (!flash) {
                // Three engine exhausts
                ctx.shadowColor = '#4ca'; ctx.shadowBlur = 12;
                const eFlick = 0.85 + Math.sin(f * 0.4) * 0.15;
                [-12, 0, 12].forEach(ox => {
                    const eg = ctx.createRadialGradient(ox, 19, 0, ox, 19, 6 * eFlick);
                    eg.addColorStop(0, 'rgba(80,230,180,0.9)');
                    eg.addColorStop(0.5, 'rgba(20,160,120,0.5)');
                    eg.addColorStop(1, 'rgba(0,80,80,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.ellipse(ox, 19, 3, 6 * eFlick, 0, 0, Math.PI * 2); ctx.fill();
                });
                ctx.shadowBlur = 0;
            }

            // Wide armored hull
            const hg = ctx.createLinearGradient(0, -20, 0, 20);
            hg.addColorStop(0,   flash ? '#fff' : '#55aaaa');
            hg.addColorStop(0.4, flash ? '#fff' : '#337788');
            hg.addColorStop(1,   flash ? '#fff' : '#1a4455');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -20); ctx.lineTo(8, -16);  ctx.lineTo(20, -10);
            ctx.lineTo(24, 0);  ctx.lineTo(20, 10);  ctx.lineTo(14, 18);
            ctx.lineTo(6, 22);  ctx.lineTo(-6, 22);  ctx.lineTo(-14, 18);
            ctx.lineTo(-20, 10);ctx.lineTo(-24, 0);  ctx.lineTo(-20, -10);
            ctx.lineTo(-8, -16);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(100,210,210,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
                // Armor panel lines
                ctx.strokeStyle = 'rgba(70,185,185,0.32)'; ctx.lineWidth = 0.7;
                ctx.beginPath(); ctx.moveTo(-20,-4); ctx.lineTo(-8,-12); ctx.lineTo(8,-12); ctx.lineTo(20,-4); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-16,6); ctx.lineTo(-5,1); ctx.lineTo(5,1); ctx.lineTo(16,6); ctx.stroke();
                // Side armor flanges + 翼灯交替闪烁
                const blink = Math.sin(f * 0.16);
                [-20, 20].forEach((ox, i) => {
                    ctx.fillStyle = '#1a3344';
                    ctx.beginPath(); ctx.rect(ox - 5, -7, 10, 12); ctx.fill();
                    ctx.strokeStyle = 'rgba(80,185,185,0.35)'; ctx.lineWidth = 0.6;
                    ctx.strokeRect(ox - 5, -7, 10, 12);
                    ctx.fillStyle = `rgba(120,255,220,${(i === 0 ? blink : -blink) > 0 ? 0.9 : 0.18})`;
                    ctx.beginPath(); ctx.arc(ox, -9.5, 1.2, 0, Math.PI * 2); ctx.fill();
                });
                // Twin gun barrels — 蓄力渐亮 → 开火爆闪
                const burstGlow = firing ? 0.9 : 0.2 + chargeK * 0.55;
                [-10, 10].forEach(ox => {
                    ctx.fillStyle = '#0d2233';
                    ctx.beginPath(); ctx.rect(ox - 3, 6, 6, 14); ctx.fill();
                    ctx.strokeStyle = 'rgba(60,180,180,0.35)'; ctx.lineWidth = 0.5;
                    ctx.beginPath(); ctx.moveTo(ox, 8); ctx.lineTo(ox, 19); ctx.stroke();
                    ctx.shadowColor = '#4cf'; ctx.shadowBlur = firing ? 16 : 4 + chargeK * 8;
                    ctx.fillStyle = `rgba(60,210,255,${burstGlow})`;
                    ctx.beginPath(); ctx.arc(ox, 20, 3.5 + chargeK * 1.2, 0, Math.PI * 2); ctx.fill();
                    if (firing) {
                        ctx.globalAlpha = 0.5;
                        ctx.fillStyle = '#9ef';
                        ctx.beginPath(); ctx.arc(ox, 20, 7, 0, Math.PI * 2); ctx.fill();
                        ctx.globalAlpha = 1;
                    }
                    ctx.shadowBlur = 0;
                });
                // Power core（第三轮缺口环前急促脉冲预警）
                const pulse = preRing
                    ? 0.55 + Math.sin(f * 0.55) * 0.45
                    : 0.5 + Math.sin(f * 0.18) * 0.4;
                ctx.shadowColor = '#2ef'; ctx.shadowBlur = preRing ? 14 : 10;
                const pcg = ctx.createRadialGradient(0, -5, 1, 0, -5, preRing ? 10 : 8);
                pcg.addColorStop(0, `rgba(160,240,255,${0.65 + pulse * 0.28})`);
                pcg.addColorStop(0.55, 'rgba(40,165,200,0.45)');
                pcg.addColorStop(1, 'rgba(0,80,140,0.18)');
                ctx.fillStyle = pcg;
                ctx.beginPath(); ctx.arc(0, -5, preRing ? 10 : 8, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                // 顶部旋转雷达天线
                ctx.save(); ctx.translate(0, -16); ctx.rotate(f * 0.06);
                ctx.strokeStyle = 'rgba(140,230,230,0.6)'; ctx.lineWidth = 0.9;
                ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke();
                ctx.fillStyle = 'rgba(200,255,255,0.85)';
                ctx.beginPath(); ctx.arc(5, 0, 1.1, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                // Cockpit
                ctx.fillStyle = 'rgba(80,205,225,0.8)';
                ctx.beginPath(); ctx.ellipse(0, -8, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(200,248,255,0.85)';
                ctx.beginPath(); ctx.ellipse(-0.8, -9.5, 1.5, 2.5, -0.1, 0, Math.PI * 2); ctx.fill();
            }
            if (this.hp < this.maxHp) this.drawHpBar(ctx, 40, 26);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Gunship };
})();

EnemyRegistry.register({ label:'Gunship', scale:0.62, group:'SOLDIERS', mk:()=>new Gunship.Gunship(0,0) });
