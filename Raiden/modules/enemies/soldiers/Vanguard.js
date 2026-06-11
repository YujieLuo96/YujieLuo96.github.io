var Vanguard = (() => {
    class Vanguard extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 12, score: 240, type: 'vanguard',
                    dropChance: 0.20, dropTable: ['power','bomb','health','shield'], w: 40, h: 36 });
            this.speed      = 0.9 + Math.random() * 0.3;
            this.holdY      = 80 + Math.random() * 100;
            this.phase      = 'entry';
            this.haltTimer  = 0;
            this.haltMax    = 280 + Math.random() * 100;
            this.shotTimer  = 0;
            this.shotInt    = 62;
            this.driftX     = (Math.random() - 0.5) * 1.2;
            this.volleyN    = 0;
            this.smokeTimer = 0;
        }

        update(dt, fc) {
            let out = null;
            switch (this.phase) {
                case 'entry':
                    this.y += this.speed * 1.2 * dt;
                    if (this.y >= this.holdY) { this.y = this.holdY; this.phase = 'hold'; }
                    break;

                case 'hold':
                    this.haltTimer += dt;
                    this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2,
                        this.x + this.driftX * dt));
                    this.shotTimer += dt;
                    if (this.shotTimer >= this.shotInt) {
                        this.shotTimer = 0;
                        this.volleyN++;
                        ParticleSystem.spawn(this.x, this.y + 18, {
                            count: 5, angle: Math.PI / 2, spread: 1.4, speed: 2.2,
                            size: 2, life: 12, colors: ['#cf8', '#8f4'], shape: 'spark'
                        });
                        if (this.volleyN % 3 === 0) {
                            // 间歇穿插：经典三连瞄准弹
                            const p = Player.getPos();
                            out = BulletPatterns.aimed(this.x, this.y + 18, p.x, p.y, 4.5,
                                { count: 3, spread: 0.38 });
                        } else {
                            // 签名技：正面弹墙压制，留缺口给玩家钻
                            const gap = 1 + Math.floor(Math.random() * 4);   // gapIndex 1..4 / 7 发
                            out = BulletPatterns.wall(this.x, this.y + 18, 7, 156, 3.0, gap,
                                { bulletOpts: { color: '#9f5', radius: 4 } });
                        }
                    }
                    if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                    break;

                case 'exit':
                    this.y += this.speed * 2.0 * dt;
                    break;
            }

            if (this.hp < this.maxHp * 0.4) {
                this.smokeTimer += dt;
                if (this.smokeTimer >= 8) {
                    this.smokeTimer = 0;
                    ParticleSystem.spawn(this.x + (Math.random() - 0.5) * 18, this.y - 6, {
                        count: 1, angle: -Math.PI / 2, spread: 0.7, speed: 0.7,
                        size: 3, life: 36, colors: ['#777', '#998', '#555'], drag: 0.985
                    });
                }
            }

            this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2, this.x));
            this.checkEntered();
            if (this.isOffscreen()) this.alive = false;
            return out;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const pulse = 0.5 + Math.sin((fc || 0) * 0.14) * 0.45;

            if (!flash) {
                [-10, 10].forEach(ox => {
                    ctx.shadowColor = '#30ff80'; ctx.shadowBlur = 12;
                    const eg = ctx.createRadialGradient(ox, 17, 0, ox, 17, 9);
                    eg.addColorStop(0, `rgba(80,255,140,${0.8 + pulse * 0.15})`);
                    eg.addColorStop(0.5, 'rgba(20,160,60,0.5)');
                    eg.addColorStop(1,   'rgba(0,60,20,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.ellipse(ox, 17, 5, 9, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0;
                });
            }

            const hg = ctx.createLinearGradient(0, -18, 0, 18);
            hg.addColorStop(0,    flash ? '#fff' : '#c0d050');
            hg.addColorStop(0.35, flash ? '#fff' : '#6a8820');
            hg.addColorStop(0.7,  flash ? '#fff' : '#385510');
            hg.addColorStop(1,    flash ? '#fff' : '#1a2805');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(5, -12); ctx.lineTo(16, -6);
            ctx.lineTo(20, 2);  ctx.lineTo(18, 10);
            ctx.lineTo(12, 18); ctx.lineTo(-12, 18);
            ctx.lineTo(-18, 10);ctx.lineTo(-20, 2);
            ctx.lineTo(-16, -6);ctx.lineTo(-5, -12);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(180,220,60,0.55)'; ctx.lineWidth = 1.3; ctx.stroke();
                ctx.strokeStyle = `rgba(160,200,50,${0.3 + Math.sin((fc||0)*0.12)*0.18})`; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(-18,4); ctx.lineTo(-8,-6); ctx.lineTo(0,-9); ctx.lineTo(8,-6); ctx.lineTo(18,4); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-14,13); ctx.lineTo(-6,6); ctx.lineTo(6,6); ctx.lineTo(14,13); ctx.stroke();
                ctx.fillStyle = '#0a1200';
                ctx.beginPath(); ctx.rect(-5,-7,10,14); ctx.fill();
                ctx.strokeStyle = 'rgba(140,200,40,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(-5,-7,10,14);
                ctx.fillStyle = '#001000';
                ctx.beginPath(); ctx.ellipse(0,-11,4,5.5,0,0,Math.PI*2); ctx.fill();
                const cg = ctx.createRadialGradient(0,-11,1,0,-11,4);
                cg.addColorStop(0,'#aaffaa'); cg.addColorStop(0.5,'#40cc40'); cg.addColorStop(1,'rgba(0,80,0,0.2)');
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.ellipse(0,-11,3,4,0,0,Math.PI*2); ctx.fill();
                ctx.fillStyle = 'rgba(200,255,200,0.85)';
                ctx.beginPath(); ctx.ellipse(-0.7,-12,1.2,2,0,0,Math.PI*2); ctx.fill();
                [-8, 0, 8].forEach((ox, i) => {
                    ctx.fillStyle = '#0a1500';
                    ctx.beginPath(); ctx.rect(ox-2,6,4,10); ctx.fill();
                    const p2 = 0.5 + Math.sin((fc||0)*0.14 + i*1.3)*0.4;
                    ctx.shadowColor = '#60ff80'; ctx.shadowBlur = 6;
                    ctx.fillStyle = `rgba(80,200,100,${0.3 + p2*0.4})`;
                    ctx.beginPath(); ctx.arc(ox,16,2.5,0,Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0;
                });

                // 盾兵身份：机体前方（下侧）的脉动能量盾弧
                ctx.shadowColor = '#6f6'; ctx.shadowBlur = 8;
                ctx.strokeStyle = `rgba(140,255,150,${0.28 + pulse * 0.28})`;
                ctx.lineWidth = 2.4;
                ctx.beginPath(); ctx.arc(0, 2, 21, Math.PI * 0.22, Math.PI * 0.78); ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = `rgba(200,255,200,${0.18 + pulse * 0.2})`;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(0, 2, 24, Math.PI * 0.3, Math.PI * 0.7); ctx.stroke();

                // 弹墙预警：开火前 12 帧在炮口下方画出蓄能横排光点
                if (this.phase === 'hold') {
                    const chg = this.shotTimer - (this.shotInt - 12);
                    if (chg > 0) {
                        const k = chg / 12;
                        ctx.fillStyle = `rgba(220,255,140,${0.25 + k * 0.55})`;
                        for (let i = 0; i < 7; i++) {
                            const bx = -78 + (156 / 6) * i;
                            ctx.beginPath(); ctx.arc(bx, 22, 1.2 + k * 1.8, 0, Math.PI * 2); ctx.fill();
                        }
                        const tg = ctx.createRadialGradient(0, 18, 0, 0, 18, 4 + k * 5);
                        tg.addColorStop(0, `rgba(230,255,180,${0.5 + k * 0.4})`);
                        tg.addColorStop(1, 'rgba(120,220,80,0)');
                        ctx.fillStyle = tg;
                        ctx.beginPath(); ctx.arc(0, 18, 4 + k * 5, 0, Math.PI * 2); ctx.fill();
                    }
                }
            }

            this.drawHpBar(ctx, 40, 26);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Vanguard };
})();

EnemyRegistry.register({ label:'Vanguard', scale:0.80, group:'SOLDIERS', mk:()=>new Vanguard.Vanguard(0,0) });
