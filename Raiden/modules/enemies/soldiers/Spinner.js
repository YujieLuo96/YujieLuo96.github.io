var Spinner = (() => {
    class Spinner extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 5, score: 130, type: 'spinner',
                    dropChance: 0.10, dropTable: ['power','health'], w: 28, h: 28 });
            this.speed      = 0.8 + Math.random() * 0.5;
            this.spinAngle  = Math.random() * Math.PI * 2;
            this.spinRate   = 0.06 + Math.random() * 0.04;
            this.phase      = 'entry';
            this.holdY      = 100 + Math.random() * 120;
            this.haltTimer  = 0;
            this.haltMax    = 220 + Math.random() * 80;
            this.driftX     = (Math.random() - 0.5) * 1.6;
            // 签名技：spiralArms 风车弹幕（volley 制）
            this.cycleTimer = 0;
            this.cycleInt   = 80;
            this.volleyT    = 0;     // >0 = 正在喷吐旋臂
            this.fireGap    = 0;
            this.armRot     = 0;
            this.smokeTimer = 0;
        }

        update(dt, fc) {
            this.spinAngle += this.spinRate * dt;
            let out = null;

            switch (this.phase) {
                case 'entry':
                    this.y += this.speed * 1.5 * dt;
                    if (this.y >= this.holdY) { this.y = this.holdY; this.phase = 'spin'; }
                    break;

                case 'spin':
                    this.haltTimer += dt;
                    this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2,
                        this.x + this.driftX * dt));
                    this.y += Math.sin(this.haltTimer * 0.02) * 0.4 * dt;

                    if (this.volleyT > 0) {
                        // 喷吐期：自旋加速并与弹幕旋臂同步
                        this.volleyT -= dt;
                        this.spinAngle += this.spinRate * 2.5 * dt;
                        this.armRot += 0.11 * dt;
                        this.fireGap -= dt;
                        if (this.fireGap <= 0) {
                            this.fireGap += 6;
                            out = BulletPatterns.spiralArms(this.x, this.y, 3, this.armRot, 3.4,
                                { bulletOpts: { type: 'shard', color: '#0fe', radius: 4, life: 330 } });
                        }
                    } else {
                        this.cycleTimer += dt;
                        if (this.cycleTimer >= this.cycleInt) {
                            this.cycleTimer = 0;
                            this.volleyT = 36;
                            this.fireGap = 0;
                            this.armRot = this.spinAngle;
                            ParticleSystem.spawn(this.x, this.y, {
                                count: 6, speed: 2.2, size: 1.8, life: 12,
                                colors: ['#aff', '#0fe', '#fff'], shape: 'spark'
                            });
                        }
                    }

                    if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                    break;

                case 'exit':
                    this.y += this.speed * 2.2 * dt;
                    break;
            }

            if (this.hp < this.maxHp * 0.4) {
                this.smokeTimer += dt;
                if (this.smokeTimer >= 8) {
                    this.smokeTimer = 0;
                    ParticleSystem.spawn(this.x + (Math.random() - 0.5) * 12, this.y - 4, {
                        count: 1, angle: -Math.PI / 2, spread: 0.7, speed: 0.6,
                        size: 2.8, life: 32, colors: ['#778', '#99a', '#556'], drag: 0.985
                    });
                }
            }

            this.checkEntered();
            if (this.isOffscreen()) this.alive = false;
            return out;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const pulse = 0.5 + Math.sin((fc || 0) * 0.18) * 0.45;
            const volleyBoost = this.volleyT > 0 ? 0.3 : 0;
            const charging = this.phase === 'spin' && this.volleyT <= 0 &&
                             this.cycleTimer > this.cycleInt - 12;

            if (!flash) {
                ctx.save();
                ctx.rotate(this.spinAngle);
                ctx.shadowColor = '#00ffee'; ctx.shadowBlur = 14;
                ctx.strokeStyle = `rgba(0,240,220,${0.55 + pulse * 0.35 + volleyBoost})`;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    ctx.strokeStyle = `rgba(0,200,240,${0.28 + pulse * 0.22 + volleyBoost})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14); ctx.stroke();
                }
                ctx.shadowBlur = 0;
                ctx.restore();

                // 反向旋转的三片风车刃（与 spiralArms 三臂呼应）
                ctx.save();
                ctx.rotate(this.volleyT > 0 ? this.armRot : -this.spinAngle * 0.7);
                ctx.strokeStyle = `rgba(120,255,245,${0.35 + pulse * 0.25 + volleyBoost})`;
                ctx.lineWidth = 2.2;
                for (let i = 0; i < 3; i++) {
                    const a = (i / 3) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, 19, a, a + 0.85);
                    ctx.stroke();
                }
                ctx.restore();

                // 蓄力预警：volley 前 12 帧扩张的青色警戒环
                if (charging) {
                    const chg = (this.cycleTimer - (this.cycleInt - 12)) / 12;
                    ctx.strokeStyle = `rgba(160,255,250,${0.25 + chg * 0.6})`;
                    ctx.lineWidth = 1.5 + chg * 1.5;
                    ctx.beginPath(); ctx.arc(0, 0, 16 + chg * 8, 0, Math.PI * 2); ctx.stroke();
                }
            }

            const bg = ctx.createRadialGradient(0, 0, 2, 0, 0, 14);
            bg.addColorStop(0,    flash ? '#fff' : '#e0ffff');
            bg.addColorStop(0.4,  flash ? '#fff' : '#20c0d8');
            bg.addColorStop(0.75, flash ? '#fff' : '#005580');
            bg.addColorStop(1,    flash ? '#fff' : '#001830');
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();

            if (!flash) {
                ctx.save();
                ctx.rotate(-this.spinAngle * 1.8);
                ctx.strokeStyle = 'rgba(100,255,240,0.45)'; ctx.lineWidth = 1.2;
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2;
                    ctx.beginPath(); ctx.arc(Math.cos(a) * 7, Math.sin(a) * 7, 1.2, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = `rgba(100,255,240,${0.3 + pulse * 0.2})`;
                    ctx.beginPath(); ctx.arc(Math.cos(a) * 7, Math.sin(a) * 7, 1.2, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();

                // 核心：volley / 蓄力时增亮
                ctx.shadowColor = '#00eeff'; ctx.shadowBlur = 14;
                const coreA = 0.8 + pulse * 0.18 + volleyBoost + (charging ? 0.2 : 0);
                const cg = ctx.createRadialGradient(0, 0, 1, 0, 0, 5 + volleyBoost * 6);
                cg.addColorStop(0, '#ffffff');
                cg.addColorStop(0.4, `rgba(0,240,255,${Math.min(1, coreA)})`);
                cg.addColorStop(1,   'rgba(0,160,200,0)');
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.arc(0, 0, 5 + volleyBoost * 6, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(-0.8, -1, 1.5, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }

            this.drawHpBar(ctx, 28, 18);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Spinner };
})();

EnemyRegistry.register({ label:'Spinner', scale:1.20, group:'SOLDIERS', mk:()=>new Spinner.Spinner(0,0) });
