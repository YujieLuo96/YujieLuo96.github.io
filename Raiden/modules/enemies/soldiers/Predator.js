var Predator = (() => {
    class Predator extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 12, score: 400, type: 'predator',
                    dropChance: 0.45, dropTable: ['power', 'bomb', 'health', 'lightning_w', 'ice_w'],
                    w: 32, h: 36 });
            this.speed       = 1.2 + Math.random() * 0.4;
            this.targetY     = 80 + Math.random() * 120;
            this.phase       = 'entry';
            this.cloakTimer  = 0;
            this.cloakMax    = 80 + Math.random() * 40;  // visible duration
            this.hideMax     = 90 + Math.random() * 50;  // cloaked duration
            this.cloaked     = false;
            this.alpha       = 1;
            this.fireTimer   = 0;
            this.fireInterval = 30;
            this.haltTimer   = 0;
            this.haltMax     = 260 + Math.random() * 80;
            this.driftAngle  = Math.random() * Math.PI * 2;
            this.volleyIdx   = 0;   // 蛇形弹 / 直瞄 交替
        }

        update(dt, fc) {
            // 低血量冒烟（节流：每 8 帧一次，隐身太深时不暴露位置）
            if (this.hp / this.maxHp < 0.4 && ((fc | 0) % 8) === 0 && this.alpha > 0.4) {
                ParticleSystem.spawn(this.x + (Math.random() - 0.5) * 14, this.y, {
                    count: 1, angle: -Math.PI / 2, spread: 0.6, speed: 0.7,
                    size: 3, life: 28, drag: 0.99, colors: ['#678', '#89a', '#556'],
                });
            }

            switch (this.phase) {
                case 'entry':
                    this.y += this.speed * 1.5 * dt;
                    if (this.y >= this.targetY) { this.y = this.targetY; this.phase = 'hunt'; }
                    break;

                case 'hunt': {
                    this.haltTimer += dt;
                    this.driftAngle += 0.014 * dt;
                    this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2,
                        this.x + Math.sin(this.driftAngle) * 1.4 * dt));

                    // Cloak cycle
                    this.cloakTimer += dt;
                    if (!this.cloaked) {
                        this.alpha = Math.min(1, this.alpha + 0.04 * dt);
                        if (this.cloakTimer >= this.cloakMax) {
                            this.cloaked = true; this.cloakTimer = 0;
                        }
                        // Fire while visible：蛇形水晶弹与直瞄散射交替
                        this.fireTimer += dt;
                        if (this.fireTimer >= this.fireInterval) {
                            this.fireTimer = 0;
                            this.volleyIdx++;
                            const p = Player.getPos();
                            let shots;
                            if (this.volleyIdx % 2 === 1) {
                                // 标志性攻击：3 发蛇形逼近的冰蓝水晶弹
                                shots = BulletPatterns.snake(this.x, this.y + 18,
                                    p.x, p.y, 3.6, 3,
                                    { bulletOpts: { color: '#3df', life: 320 } });
                            } else {
                                shots = BulletPatterns.aimed(this.x, this.y + 18,
                                    p.x, p.y, 5.2, { count: 4, spread: 0.28 });
                            }
                            ParticleSystem.spawn(this.x, this.y + 18, {
                                count: 4, angle: Math.atan2(p.y - this.y, p.x - this.x),
                                spread: 0.7, speed: 3.2, size: 2, life: 12,
                                shape: 'spark', colors: ['#6ef', '#3af', '#fff'],
                            });
                            if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                            return shots;
                        }
                    } else {
                        this.alpha = Math.max(0.15, this.alpha - 0.05 * dt);
                        if (this.cloakTimer >= this.hideMax) {
                            // 解除隐身瞬间的伏击：一发限时追踪的冰蓝彗星
                            this.cloaked = false; this.cloakTimer = 0;
                            this.fireTimer = 0;
                            const p = Player.getPos();
                            ParticleSystem.spawn(this.x, this.y, {
                                count: 5, speed: 1.6, scatter: 22, size: 2,
                                life: 18, colors: ['#3df', '#9ef'],
                            });
                            if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                            return BulletPatterns.homingFlare(this.x, this.y + 16,
                                p.x, p.y, 3.0,
                                { bulletOpts: { color: '#3af', homing: 95, life: 320 } });
                        }
                    }
                    if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                    break;
                }

                case 'exit':
                    this.alpha = Math.max(0, this.alpha - 0.03 * dt);
                    this.y += this.speed * 2.0 * dt;
                    break;
            }
            this.checkEntered();
            if (this.isOffscreen()) this.alive = false;
            return null;
        }

        draw(ctx, dt, fc) {
            const f = fc || 0;
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            // 开火预警蓄力进度（可见时阈值前 10 帧）
            const chargeK = (!this.cloaked && this.phase === 'hunt')
                ? Math.max(0, Math.min(1, (this.fireTimer - (this.fireInterval - 10)) / 10)) : 0;

            if (!flash && this.alpha > 0.3) {
                // Stealth exhaust — barely visible blue ion glow
                const flick = 0.85 + Math.sin(f * 0.35) * 0.15;
                ctx.shadowColor = '#06f'; ctx.shadowBlur = 10;
                const eg = ctx.createRadialGradient(0, 17, 0, 0, 17, 9 * flick);
                eg.addColorStop(0, `rgba(60,140,255,${this.alpha * 0.7})`);
                eg.addColorStop(0.5, `rgba(20,80,200,${this.alpha * 0.35})`);
                eg.addColorStop(1, 'rgba(0,30,120,0)');
                ctx.fillStyle = eg;
                ctx.beginPath(); ctx.ellipse(0, 17, 7, 9 * flick, 0, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Angular stealth hull with flat radar-absorbing facets
            const hg = ctx.createLinearGradient(0, -18, 0, 18);
            hg.addColorStop(0,    flash ? '#fff' : '#33ccff');
            hg.addColorStop(0.35, flash ? '#fff' : '#1188bb');
            hg.addColorStop(0.7,  flash ? '#fff' : '#005577');
            hg.addColorStop(1,    flash ? '#fff' : '#002233');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(4, -12); ctx.lineTo(8, -8); ctx.lineTo(14, -2);   // right facets
            ctx.lineTo(16, 4);  ctx.lineTo(12, 12); ctx.lineTo(8, 18);   // right rear
            ctx.lineTo(-8, 18); ctx.lineTo(-12, 12); ctx.lineTo(-16, 4); // rear
            ctx.lineTo(-14, -2);ctx.lineTo(-8, -8);  ctx.lineTo(-4, -12);// left facets
            ctx.closePath(); ctx.fill();

            if (!flash) {
                // Edge glow (brighter when partially cloaked — shimmer effect)
                const edgeA = this.alpha < 0.85 ? (1 - this.alpha) * 0.75 : 0.28;
                ctx.strokeStyle = `rgba(40,185,255,${edgeA})`; ctx.lineWidth = 1.5; ctx.stroke();
                // 隐身相位扫描线：半透明状态下横向波纹
                if (this.alpha < 0.85) {
                    ctx.strokeStyle = `rgba(80,220,255,${(1 - this.alpha) * 0.4})`;
                    ctx.lineWidth = 0.6;
                    const sy = -14 + ((f * 0.8) % 30);
                    ctx.beginPath(); ctx.moveTo(-13, sy); ctx.lineTo(13, sy); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(-13, sy - 10); ctx.lineTo(13, sy - 10); ctx.stroke();
                }
                // Facet panel lines
                ctx.strokeStyle = `rgba(30,165,220,${this.alpha * 0.3})`; ctx.lineWidth = 0.7;
                ctx.beginPath(); ctx.moveTo(-12,0); ctx.lineTo(-5,-8); ctx.lineTo(0,-10); ctx.lineTo(5,-8); ctx.lineTo(12,0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-10,8); ctx.lineTo(-4,2); ctx.lineTo(4,2); ctx.lineTo(10,8); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-8,16); ctx.lineTo(-3,12); ctx.lineTo(3,12); ctx.stroke();
                // Nose sensor array（频闪）
                const nb = 0.5 + Math.sin(f * 0.28) * 0.35;
                ctx.strokeStyle = `rgba(60,205,255,${this.alpha * nb})`; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(-3,-16); ctx.lineTo(3,-16); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-1.5,-18); ctx.lineTo(1.5,-18); ctx.stroke();
                // Cockpit — narrow visor slit (red hint when cloaking)
                const vAlpha = this.cloaked ? 0.22 : 0.88;
                ctx.fillStyle = `rgba(${this.cloaked?'80,100':'100,225'},255,${vAlpha * this.alpha})`;
                ctx.beginPath(); ctx.rect(-3.5, -11, 7, 4); ctx.fill();
                ctx.fillStyle = `rgba(210,248,255,${0.75 * this.alpha})`;
                ctx.beginPath(); ctx.rect(-3, -11, 2.5, 2); ctx.fill();
                // Side weapon pods（蓄力时渐亮放大 — 开火预警）
                if (!this.cloaked && this.alpha > 0.65) {
                    [-12, 12].forEach(ox => {
                        ctx.fillStyle = '#001122';
                        ctx.beginPath(); ctx.rect(ox - 2, 4, 4, 10); ctx.fill();
                        ctx.fillStyle = `rgba(0,185,255,${0.3 + chargeK * 0.6})`;
                        ctx.beginPath(); ctx.arc(ox, 14, 2.5 + chargeK * 1.6, 0, Math.PI * 2); ctx.fill();
                    });
                    // 中央炮口聚能光晕
                    if (chargeK > 0) {
                        ctx.shadowColor = '#3df'; ctx.shadowBlur = 6 + chargeK * 6;
                        const gg = ctx.createRadialGradient(0, 16, 0, 0, 16, 3 + chargeK * 4);
                        gg.addColorStop(0, `rgba(190,245,255,${0.4 + chargeK * 0.5})`);
                        gg.addColorStop(1, 'rgba(0,150,255,0)');
                        ctx.fillStyle = gg;
                        ctx.beginPath(); ctx.arc(0, 16, 3 + chargeK * 4, 0, Math.PI * 2); ctx.fill();
                        ctx.shadowBlur = 0;
                    }
                }
            }
            if (this.hp < this.maxHp) this.drawHpBar(ctx, 36, 24);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Predator };
})();

EnemyRegistry.register({ label:'Predator', scale:1.10, group:'SOLDIERS', mk:()=>new Predator.Predator(0,0) });
