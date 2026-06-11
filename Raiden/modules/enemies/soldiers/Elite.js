var Elite = (() => {
    const BEHAVIORS = ['zigzag', 'dive', 'circle', 'shield'];

    class Elite extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 6, score: 200, type: 'elite', dropChance: 0.45,
                    dropTable: ['spread_w','homing_w','laser_w','plasma_w','power','shield'], w: 42, h: 42 });
            this.behavior     = BEHAVIORS[Math.floor(Math.random() * BEHAVIORS.length)];
            this.speed        = 1.8;
            this.baseX        = x;
            this.shootInterval= 48;
            this.phase        = 0;
            this.phaseTimer   = 0;
            this.shieldHp     = this.behavior === 'shield' ? 3 : 0;
            // 签名组合技：3 连瞄准速射 + 间歇 ringGap 缺口环
            this.burstLeft    = 0;
            this.burstCd      = 0;
            this.ringTimer    = Math.random() * 60;
            this.ringInt      = 160;
            this.smokeTimer   = 0;
        }
        update(dt, fc) {
            this.phaseTimer += dt;
            switch (this.behavior) {
                case 'zigzag':
                    this.y += this.speed * 0.85 * dt;
                    this.x += Math.sin(fc * 0.045) * 3.2 * dt;
                    break;
                case 'dive':
                    if (this.phaseTimer < 110) {
                        this.y += this.speed * 0.5 * dt;
                    } else {
                        const p  = Player.getPos();
                        const dx = p.x - this.x, dy = p.y - this.y;
                        const d  = Math.sqrt(dx * dx + dy * dy) || 1;
                        this.x  += (dx / d) * this.speed * 2.2 * dt;
                        this.y  += (dy / d) * this.speed * 2.2 * dt;
                    }
                    break;
                case 'circle':
                    if (this.phase === 0 && this.y > 140) this.phase = 1;
                    if (this.phase === 0) { this.y += this.speed * dt; }
                    else {
                        this.x += Math.cos(fc * 0.028) * 2.8 * dt;
                        this.y += Math.sin(fc * 0.018) * 1.6 * dt;
                    }
                    break;
                case 'shield':
                    this.y += this.speed * 0.65 * dt;
                    this.x += Math.sin(fc * 0.03) * 2.2 * dt;
                    break;
            }
            this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2, this.x));
            this.checkEntered();
            if (this.isOffscreen()) { this.alive = false; return null; }

            if (this.hp < this.maxHp * 0.4) {
                this.smokeTimer += dt;
                if (this.smokeTimer >= 8) {
                    this.smokeTimer = 0;
                    ParticleSystem.spawn(this.x + (Math.random() - 0.5) * 18, this.y - 6, {
                        count: 1, angle: -Math.PI / 2, spread: 0.7, speed: 0.7,
                        size: 3, life: 34, colors: ['#778', '#99a', '#556'], drag: 0.985
                    });
                }
            }

            if (this.enteredScreen && this.y < Renderer.H - 60) {
                const out = [];

                // 3 连瞄准速射（每 7 帧一发）
                if (this.burstLeft > 0) {
                    this.burstCd -= dt;
                    if (this.burstCd <= 0) {
                        this.burstCd += 7;
                        this.burstLeft--;
                        const p = Player.getPos();
                        ParticleSystem.spawn(this.x, this.y + 17, {
                            count: 3, angle: Math.PI / 2, spread: 0.8, speed: 2.2,
                            size: 1.8, life: 10, colors: ['#aef', '#4cf'], shape: 'spark'
                        });
                        BulletPatterns.aimed(this.x, this.y + 17, p.x, p.y, 5.2, { count: 1 })
                            .forEach(b => out.push(b));
                    }
                }
                this.shootTimer += dt;
                if (this.shootTimer >= this.shootInterval) {
                    this.shootTimer = 0;
                    this.burstLeft  = 3;
                    this.burstCd    = 0;
                }

                // 间歇缺口环：缺口大致朝玩家附近，留逃生通道
                this.ringTimer += dt;
                if (this.ringTimer >= this.ringInt) {
                    this.ringTimer = 0;
                    const p = Player.getPos();
                    const gapA = Math.atan2(p.y - this.y, p.x - this.x)
                               + (Math.random() - 0.5) * 1.2;
                    ParticleSystem.spawn(this.x, this.y, {
                        count: 6, speed: 2.6, size: 2, life: 14,
                        colors: ['#8ef', '#fff', '#4cf'], shape: 'spark'
                    });
                    BulletPatterns.ringGap(this.x, this.y, 10, 3.2,
                        Math.random() * 0.6, gapA, 0.5,
                        { bulletOpts: { color: '#4df', radius: 4, life: 360 } })
                        .forEach(b => out.push(b));
                }

                if (out.length > 0) return out;
            }
            return null;
        }
        takeDamage(dmg) {
            if (this.shieldHp > 0) {
                this.shieldHp -= dmg;
                ExplosionFX.shieldBreak(this.x, this.y);
                this.flashTimer = 3;
                if (this.shieldHp <= 0) this.shieldHp = 0;
                return false;
            }
            return super.takeDamage(dmg);
        }
        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);

            // Animated hexagonal energy shield
            if (this.shieldHp > 0) {
                ctx.save();
                ctx.rotate((fc || 0) * 0.022);
                ctx.shadowColor = '#4af'; ctx.shadowBlur = 18;
                ctx.strokeStyle = `rgba(80,200,255,${0.38 + Math.sin((fc||0) * 0.14) * 0.18})`;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
                    const r = 28 + Math.sin((fc||0) * 0.11 + i * 1.1) * 2;
                    i === 0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r)
                            : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
                }
                ctx.closePath(); ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.restore();
            }

            const flash = this._applyFlash(ctx, dt);

            if (!flash) {
                // Engine exhaust (flicker)
                const efl = 1 + Math.sin((fc || 0) * 0.45) * 0.18;
                ctx.shadowColor = '#2af'; ctx.shadowBlur = 12;
                const eg = ctx.createRadialGradient(0, 19, 0, 0, 19, 10 * efl);
                eg.addColorStop(0, 'rgba(100,210,255,0.9)');
                eg.addColorStop(0.5, 'rgba(20,130,220,0.5)');
                eg.addColorStop(1, 'rgba(0,60,180,0)');
                ctx.fillStyle = eg;
                ctx.beginPath(); ctx.ellipse(0, 19, 7, 10 * efl, 0, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Angular elite hull
            const hg = ctx.createLinearGradient(0, -21, 0, 21);
            hg.addColorStop(0,   flash ? '#fff' : '#55eeff');
            hg.addColorStop(0.4, flash ? '#fff' : '#2299cc');
            hg.addColorStop(1,   flash ? '#fff' : '#114466');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -21);
            ctx.lineTo(6, -14); ctx.lineTo(13, -8); ctx.lineTo(21, -2);  // right wing
            ctx.lineTo(18, 6);  ctx.lineTo(12, 14); ctx.lineTo(6, 21);   // right rear
            ctx.lineTo(-6, 21); ctx.lineTo(-12, 14);ctx.lineTo(-18, 6);  // rear
            ctx.lineTo(-21, -2);ctx.lineTo(-13, -8); ctx.lineTo(-6, -14);// left wing
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(100,230,255,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
                // Energy conduits (animated pulse)
                const conduit = 0.45 + Math.sin((fc||0) * 0.22 + 1) * 0.38;
                ctx.strokeStyle = `rgba(0,220,255,${conduit * 0.65})`; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(-17,0); ctx.lineTo(-6,-7); ctx.lineTo(6,-7); ctx.lineTo(17,0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-13,10); ctx.lineTo(-4,4); ctx.lineTo(4,4); ctx.lineTo(13,10); ctx.stroke();

                // Wingtip energy blades (pulsing)
                [-1, 1].forEach(s => {
                    ctx.fillStyle = `rgba(80,230,255,${0.3 + conduit * 0.4})`;
                    ctx.beginPath();
                    ctx.moveTo(s * 21, -2);
                    ctx.lineTo(s * (26 + conduit * 2), 2);
                    ctx.lineTo(s * 18, 5);
                    ctx.closePath(); ctx.fill();
                });

                // Central weapon barrel + telegraph (burst 前 10 帧聚能)
                ctx.fillStyle = '#001122';
                ctx.beginPath(); ctx.rect(-2.5, 4, 5, 13); ctx.fill();
                const chgB = Math.max(0, this.shootTimer - (this.shootInterval - 10)) / 10;
                const barrelA = 0.4 + conduit * 0.45 + chgB * 0.5;
                ctx.shadowColor = '#0af'; ctx.shadowBlur = 10;
                ctx.fillStyle = `rgba(0,190,255,${Math.min(1, barrelA)})`;
                ctx.beginPath(); ctx.arc(0, 17, 3.5 + chgB * 3, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;

                // ringGap 预警：发射前 12 帧扩张的环形轮廓
                const chgR = Math.max(0, this.ringTimer - (this.ringInt - 12)) / 12;
                if (chgR > 0) {
                    ctx.strokeStyle = `rgba(120,235,255,${0.2 + chgR * 0.6})`;
                    ctx.lineWidth = 1.2 + chgR * 1.6;
                    ctx.beginPath(); ctx.arc(0, 0, 24 + chgR * 10, 0, Math.PI * 2); ctx.stroke();
                }

                // Cockpit lens
                const cg = ctx.createRadialGradient(0, -10, 1, 0, -10, 6);
                cg.addColorStop(0, '#aaffff'); cg.addColorStop(0.5, '#2299cc'); cg.addColorStop(1, 'rgba(0,80,140,0.25)');
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.ellipse(0, -10, 4, 5.5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(200,248,255,0.9)';
                ctx.beginPath(); ctx.ellipse(-1, -11.5, 1.5, 2.5, -0.1, 0, Math.PI * 2); ctx.fill();
                // Side vents
                [-16, 16].forEach(ox => {
                    ctx.fillStyle = 'rgba(0,140,200,0.35)';
                    ctx.beginPath(); ctx.rect(ox - 2, -3, 4, 7); ctx.fill();
                });
            }
            this.drawHpBar(ctx, 38, 25);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }
    return { Elite };
})();

EnemyRegistry.register({ label:'Elite', scale:0.72, group:'ELITES', mk:()=>new Elite.Elite(0,0) });
