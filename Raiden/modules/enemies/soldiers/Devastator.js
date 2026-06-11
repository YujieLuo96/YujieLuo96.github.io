var Devastator = (() => {
    class Devastator extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 28, score: 750, type: 'devastator',
                    dropChance: 0.60, dropTable: ['homing_w','plasma_w','laser_w','spread_w','power','bomb','shield'],
                    w: 48, h: 44 });
            this.speed        = 0.75 + Math.random() * 0.3;
            this.holdY        = 90 + Math.random() * 90;
            this.phase        = 'entry';
            this.t            = 0;
            this.haltTimer    = 0;
            this.haltMax      = 380 + Math.random() * 100;
            this.shotTimer    = 0;
            this.shotInt      = 66;
            this.armAngle     = 0;
            this.phaseStage   = 1;
            // 签名技：蓄力 bloom 大花 + 少量追踪彗星
            this.bloomTimer   = 0;
            this.bloomInt     = 230;
            this.chargeMax    = 26;
            this.charging     = 0;
            this.smokeTimer   = 0;
        }

        update(dt, fc) {
            this.armAngle += 0.015 * dt;

            switch (this.phase) {
                case 'entry':
                    this.y += this.speed * 1.3 * dt;
                    if (this.y >= this.holdY) { this.y = this.holdY; this.phase = 'fight'; }
                    break;

                case 'fight': {
                    this.haltTimer += dt;
                    this.t += dt;

                    // 蓄力时机体稳住，方便玩家读招
                    const mv = this.charging > 0 ? 0.25 : 1;
                    this.x = Math.max(this.w/2, Math.min(Renderer.W - this.w/2,
                        this.x + Math.sin(this.t * 0.012) * 1.6 * mv * dt));
                    this.y = this.holdY + Math.sin(this.t * 0.008) * 20;

                    if (this.phaseStage === 1 && this.hp <= this.maxHp * 0.55) {
                        this.phaseStage = 2;
                        this.shotInt    = 46;
                        this.bloomInt   = 170;
                    }

                    const bullets = [];

                    // 常规瞄准散射（蓄力期间停火）
                    if (this.charging <= 0) {
                        this.shotTimer += dt;
                        if (this.shotTimer >= this.shotInt) {
                            this.shotTimer = 0;
                            const p = Player.getPos();
                            const cnt = this.phaseStage === 2 ? 4 : 3;
                            ParticleSystem.spawn(this.x, this.y + 22, {
                                count: 4, angle: Math.PI / 2, spread: 1.0, speed: 2.4,
                                size: 2, life: 12, colors: ['#fc8', '#f84'], shape: 'spark'
                            });
                            const s = BulletPatterns.aimed(this.x, this.y + 22, p.x, p.y, 5.0, { count: cnt, spread: 0.25 });
                            if (s) s.forEach(b => bullets.push(b));
                        }
                    }

                    // 蓄力 → 绽放大花 + 追踪彗星
                    this.bloomTimer += dt;
                    if (this.charging > 0) {
                        this.charging -= dt;
                        if (this.charging <= 0) {
                            this.charging = 0;
                            ParticleSystem.spawn(this.x, this.y + 5, {
                                count: 6, speed: 3, size: 2.5, life: 16,
                                colors: ['#fc8', '#f84', '#fff'], shape: 'spark'
                            });
                            const n = this.phaseStage === 2 ? 10 : 8;
                            BulletPatterns.bloom(this.x, this.y + 5, n, Math.random() * Math.PI * 2,
                                { speed: 0.9, bulletOpts: {
                                    color: this.phaseStage === 2 ? '#fa6' : '#f64',
                                    radius: 4, maxSpeed: 4.2, life: 420 } })
                                .forEach(b => bullets.push(b));
                            const p = Player.getPos();
                            const fl = this.phaseStage === 2 ? 2 : 1;
                            for (let i = 0; i < fl; i++) {
                                BulletPatterns.homingFlare(this.x + (i === 0 ? -14 : 14), this.y + 12,
                                    p.x, p.y, 3.0, { bulletOpts: { homing: 100, life: 360 } })
                                    .forEach(b => bullets.push(b));
                            }
                        }
                    } else if (this.bloomTimer >= this.bloomInt) {
                        this.bloomTimer = 0;
                        this.charging = this.chargeMax;
                    }

                    if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                    if (bullets.length > 0) {
                        this.checkEntered();
                        if (this.isOffscreen()) this.alive = false;
                        return bullets;
                    }
                    break;
                }

                case 'exit':
                    this.y += this.speed * 2.0 * dt;
                    break;
            }

            if (this.hp < this.maxHp * 0.4) {
                this.smokeTimer += dt;
                if (this.smokeTimer >= 7) {
                    this.smokeTimer = 0;
                    ParticleSystem.spawn(this.x + (Math.random() - 0.5) * 24, this.y - 8, {
                        count: 2, angle: -Math.PI / 2, spread: 0.7, speed: 0.7,
                        size: 3.4, life: 38, colors: ['#777', '#999', '#544'], drag: 0.985
                    });
                }
            }

            this.x = Math.max(this.w/2, Math.min(Renderer.W - this.w/2, this.x));
            this.checkEntered();
            if (this.isOffscreen()) this.alive = false;
            return null;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const hp2  = this.phaseStage === 2;
            const pulse = 0.5 + Math.sin(this.t * 0.13) * 0.45;
            const acol  = hp2 ? '#ff9940' : '#ff4420';
            const chg   = this.charging > 0 ? 1 - this.charging / this.chargeMax : 0;

            if (!flash) {
                for (let i = 0; i < 2; i++) {
                    ctx.save();
                    ctx.rotate(this.armAngle + i * Math.PI);
                    ctx.strokeStyle = acol; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-22); ctx.stroke();
                    const jg = ctx.createRadialGradient(0,-22,1,0,-22,6);
                    jg.addColorStop(0, hp2 ? '#ffd080' : '#ff7040'); jg.addColorStop(1,'rgba(0,0,0,0)');
                    ctx.fillStyle = jg;
                    ctx.beginPath(); ctx.arc(0,-22,6,0,Math.PI*2); ctx.fill();
                    ctx.fillStyle = hp2 ? '#442200' : '#330800';
                    ctx.beginPath();
                    ctx.moveTo(-6,-22); ctx.lineTo(6,-22); ctx.lineTo(8,-30); ctx.lineTo(6,-38);
                    ctx.lineTo(-6,-38); ctx.lineTo(-8,-30); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = acol; ctx.lineWidth = 1; ctx.stroke();
                    ctx.fillStyle = '#110000';
                    ctx.beginPath(); ctx.rect(-2,-40,4,14); ctx.fill();
                    ctx.shadowColor = acol; ctx.shadowBlur = 10;
                    ctx.fillStyle = `rgba(255,${hp2?160:80},20,${0.5 + pulse * 0.4})`;
                    ctx.beginPath(); ctx.arc(0,-41,3.5,0,Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.restore();
                }

                [-13, 13].forEach((ox, i) => {
                    const efl = 1 + Math.sin(this.t * 0.5 + i * 2.1) * 0.16;
                    ctx.shadowColor = '#ff5500'; ctx.shadowBlur = 12;
                    const eg = ctx.createRadialGradient(ox,21,0,ox,21,9*efl);
                    eg.addColorStop(0,'rgba(255,120,0,0.9)');
                    eg.addColorStop(0.5,'rgba(200,50,0,0.5)');
                    eg.addColorStop(1,'rgba(100,10,0,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.ellipse(ox,21,5,9*efl,0,0,Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0;
                });
            }

            const hg = ctx.createLinearGradient(0,-22,0,22);
            hg.addColorStop(0,    flash ? '#fff' : (hp2 ? '#ee7730' : '#cc3010'));
            hg.addColorStop(0.35, flash ? '#fff' : (hp2 ? '#882200' : '#6a1000'));
            hg.addColorStop(0.7,  flash ? '#fff' : '#330800');
            hg.addColorStop(1,    flash ? '#fff' : '#1a0200');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0,-22);
            ctx.lineTo(6,-16); ctx.lineTo(18,-8);
            ctx.lineTo(24,0);  ctx.lineTo(20,10);
            ctx.lineTo(14,22); ctx.lineTo(-14,22);
            ctx.lineTo(-20,10);ctx.lineTo(-24,0);
            ctx.lineTo(-18,-8);ctx.lineTo(-6,-16);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = `rgba(${hp2?'255,160,60':'255,80,20'},${0.6 + pulse*0.25})`; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.strokeStyle = `rgba(${hp2?'200,120,40':'200,60,10'},0.3)`; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(-22,3); ctx.lineTo(-10,-8); ctx.lineTo(0,-12); ctx.lineTo(10,-8); ctx.lineTo(22,3); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-18,14); ctx.lineTo(-8,5); ctx.lineTo(8,5); ctx.lineTo(18,14); ctx.stroke();
                ctx.fillStyle = '#0a0000';
                ctx.beginPath(); ctx.rect(-6,-14,12,16); ctx.fill();
                ctx.strokeStyle = `rgba(${hp2?'220,140,60':'220,80,30'},0.5)`; ctx.lineWidth = 1; ctx.strokeRect(-6,-14,12,16);
                ctx.fillStyle = '#150000';
                ctx.beginPath(); ctx.ellipse(0,-13,5,7,0,0,Math.PI*2); ctx.fill();
                const cg = ctx.createRadialGradient(0,-13,1,0,-13,5);
                cg.addColorStop(0,'#ffccaa');
                cg.addColorStop(0.5,`rgba(${hp2?'255,160,60':'255,80,20'},${0.7 + pulse*0.25})`);
                cg.addColorStop(1,'rgba(100,20,0,0.2)');
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.ellipse(0,-13,4,5.5,0,0,Math.PI*2); ctx.fill();
                ctx.fillStyle = 'rgba(255,220,180,0.85)';
                ctx.beginPath(); ctx.ellipse(-1.2,-14.5,1.5,2.5,0,0,Math.PI*2); ctx.fill();

                // 核心反应堆 —— 蓄力时膨胀、增亮并伴随旋转聚能弧
                const coreR = 10 + chg * 5;
                ctx.shadowColor = acol; ctx.shadowBlur = 14 + chg * 8;
                ctx.fillStyle = '#0a0000';
                ctx.beginPath(); ctx.arc(0,5,coreR,0,Math.PI*2); ctx.fill();
                const rg = ctx.createRadialGradient(0,5,1,0,5,coreR);
                rg.addColorStop(0,'#ffffff');
                rg.addColorStop(0.25,hp2?'#ffaa40':'#ff6030');
                rg.addColorStop(0.6,`rgba(${hp2?'200,80,0':'180,30,0'},${0.55+pulse*0.35+chg*0.3})`);
                rg.addColorStop(1,'rgba(0,0,0,0)');
                ctx.fillStyle = rg;
                ctx.beginPath(); ctx.arc(0,5,coreR,0,Math.PI*2); ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(0,5,3.5 + chg * 2,0,Math.PI*2); ctx.fill();
                ctx.shadowBlur = 0;

                if (chg > 0) {
                    // 蓄力预警弧：三段弧线向核心收束
                    ctx.strokeStyle = `rgba(255,200,120,${0.3 + chg * 0.6})`;
                    ctx.lineWidth = 2;
                    const rr = 24 - chg * 9;
                    for (let i = 0; i < 3; i++) {
                        const a = (i / 3) * Math.PI * 2 + this.t * 0.2;
                        ctx.beginPath(); ctx.arc(0, 5, rr, a, a + 1.1); ctx.stroke();
                    }
                }
            }

            this.drawHpBar(ctx, 48, 30);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Devastator };
})();

EnemyRegistry.register({ label:'Devastator', scale:0.56, group:'ELITES', mk:()=>new Devastator.Devastator(0,0) });
