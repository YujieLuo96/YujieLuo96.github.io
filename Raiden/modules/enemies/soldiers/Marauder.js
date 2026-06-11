var Marauder = (() => {
    class Marauder extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 8, score: 180, type: 'marauder',
                    dropChance: 0.15, dropTable: ['power','bomb','health'], w: 30, h: 34 });
            this.speed      = 2.0 + Math.random() * 0.8;
            this.phase      = 'entry';
            this.phaseTimer = 0;
            this.holdY      = 55 + Math.random() * 80;
            this.diveVX     = 0;
            this.fireCount  = 0;
            this.fireCd     = 0;
            this.smokeTimer = 0;
        }

        update(dt, fc) {
            this.phaseTimer += dt;
            let out = null;
            switch (this.phase) {
                case 'entry':
                    this.y += this.speed * 1.4 * dt;
                    if (this.y >= this.holdY) {
                        this.y = this.holdY;
                        const p = Player.getPos();
                        this.diveVX = (p.x - this.x) * 0.012;
                        this.phaseTimer = 0;
                        this.phase = 'aim';
                    }
                    break;

                case 'aim':
                    this.x += (Player.getPos().x - this.x) * 0.04 * dt;
                    if (this.phaseTimer >= 48) {
                        this.phaseTimer = 0;
                        this.fireCount  = 0;
                        this.fireCd     = 0;
                        this.phase      = 'dive';
                        ParticleSystem.spawn(this.x, this.y + 17, {
                            count: 4, angle: Math.PI / 2, spread: 0.9, speed: 2.4,
                            size: 2, life: 12, colors: ['#ffc060', '#ff7020'], shape: 'spark'
                        });
                    }
                    break;

                case 'dive':
                    this.y  += this.speed * 3.5 * dt;
                    this.x  += this.diveVX * dt;
                    this.fireCd -= dt;
                    // 签名技：交叉弧线弹 —— 每次齐射两发对称弯弧水晶弹，轨迹交叉成 X
                    if (this.fireCd <= 0 && this.fireCount < 2) {
                        this.fireCd = 14;
                        this.fireCount++;
                        const p = Player.getPos();
                        ParticleSystem.spawn(this.x, this.y + 17, {
                            count: 3, angle: Math.PI / 2, spread: 0.8, speed: 2.2,
                            size: 1.8, life: 10, colors: ['#ffd080', '#ff8030'], shape: 'spark'
                        });
                        const base = Math.atan2(p.y - this.y, p.x - this.x);
                        const mk = (turn) => new EnemyBullet(this.x, this.y + 17,
                            Math.cos(base) * 4.6, Math.sin(base) * 4.6,
                            { type: 'shard', color: '#fa4', radius: 4.5, turn, life: 300 });
                        out = [mk(0.02), mk(-0.02)];
                    }
                    break;
            }

            if (this.hp < this.maxHp * 0.4) {
                this.smokeTimer += dt;
                if (this.smokeTimer >= 7) {
                    this.smokeTimer = 0;
                    ParticleSystem.spawn(this.x + (Math.random() - 0.5) * 12, this.y - 6, {
                        count: 1, angle: -Math.PI / 2, spread: 0.7, speed: 0.7,
                        size: 3, life: 34, colors: ['#777', '#999', '#555'], drag: 0.985
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
            // Bank into the dive direction
            if (this.phase === 'dive') {
                ctx.rotate(Math.max(-0.3, Math.min(0.3, this.diveVX * 0.08)));
            }
            const flash = this._applyFlash(ctx, dt);

            if (!flash) {
                const trailN = this.phase === 'dive' ? 5 : 3;
                for (let i = trailN; i >= 1; i--) {
                    const ty = i * (this.phase === 'dive' ? 12 : 7);
                    const tr = Math.max(1, 5 - i * 0.7);
                    ctx.globalAlpha = (1 - i / (trailN + 1)) * (this.phase === 'dive' ? 0.7 : 0.38);
                    ctx.fillStyle   = i <= trailN / 2 ? '#ff6600' : '#ff3300';
                    ctx.beginPath(); ctx.arc(0, ty, tr, 0, Math.PI * 2); ctx.fill();
                }
                ctx.globalAlpha = 1;

                const pulseFl = 0.5 + Math.sin((fc || 0) * 0.35) * 0.45;
                ctx.shadowColor = '#ff7700'; ctx.shadowBlur = 18;
                const eg = ctx.createRadialGradient(0, 16, 0, 0, 16, 11);
                eg.addColorStop(0, `rgba(255,160,0,${0.85 + pulseFl * 0.12})`);
                eg.addColorStop(0.5, 'rgba(220,60,0,0.55)');
                eg.addColorStop(1,   'rgba(140,10,0,0)');
                ctx.fillStyle = eg;
                ctx.beginPath(); ctx.ellipse(0, 16, 6, 11, 0, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }

            const hg = ctx.createLinearGradient(0, -17, 0, 17);
            hg.addColorStop(0,   flash ? '#fff' : '#ff7730');
            hg.addColorStop(0.4, flash ? '#fff' : '#cc2a00');
            hg.addColorStop(1,   flash ? '#fff' : '#551000');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -17);
            ctx.lineTo(5, -10); ctx.lineTo(14, 0);
            ctx.lineTo(10, 8);  ctx.lineTo(7, 17);
            ctx.lineTo(-7, 17); ctx.lineTo(-10, 8);
            ctx.lineTo(-14, 0); ctx.lineTo(-5, -10);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(255,140,40,0.65)'; ctx.lineWidth = 1.2; ctx.stroke();
                ctx.fillStyle = '#1a0500';
                ctx.beginPath(); ctx.ellipse(0, -8, 3.5, 5, 0, 0, Math.PI * 2); ctx.fill();
                const pulse = 0.5 + Math.sin((fc || 0) * 0.28) * 0.4;
                ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 8;
                ctx.fillStyle = `rgba(255,80,0,${0.5 + pulse * 0.38})`;
                ctx.beginPath(); ctx.ellipse(0, -8, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,200,150,0.85)';
                ctx.beginPath(); ctx.ellipse(-0.8, -9, 0.9, 1.4, 0, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'rgba(255,120,30,0.4)'; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(-12,-1); ctx.lineTo(-6,-8); ctx.lineTo(0,-10); ctx.lineTo(6,-8); ctx.lineTo(12,-1); ctx.stroke();

                // Side fins swing with thrust rhythm
                const finSwing = Math.sin((fc || 0) * 0.3) * 1.2;
                [-1, 1].forEach(s => {
                    ctx.fillStyle = '#882000';
                    ctx.beginPath();
                    ctx.moveTo(s * 13, 0);
                    ctx.lineTo(s * (17 + finSwing * s), 5);
                    ctx.lineTo(s * 11, 7);
                    ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = 'rgba(255,120,40,0.45)'; ctx.lineWidth = 0.7; ctx.stroke();
                });

                [-8, 8].forEach(ox => {
                    ctx.fillStyle = '#220500';
                    ctx.beginPath(); ctx.rect(ox - 2, 3, 4, 11); ctx.fill();
                    ctx.shadowColor = '#ff5500'; ctx.shadowBlur = 6;
                    ctx.fillStyle = `rgba(255,100,0,${0.35 + pulse * 0.3})`;
                    ctx.beginPath(); ctx.arc(ox, 14, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0;
                });

                // Telegraph: muzzle charge during the last frames of aim phase
                if (this.phase === 'aim' && this.phaseTimer > 36) {
                    const chg = (this.phaseTimer - 36) / 12;
                    const cr = 2.5 + chg * 5.5;
                    const tg = ctx.createRadialGradient(0, 17, 0, 0, 17, cr);
                    tg.addColorStop(0, `rgba(255,230,160,${0.45 + chg * 0.5})`);
                    tg.addColorStop(0.6, 'rgba(255,140,40,0.4)');
                    tg.addColorStop(1, 'rgba(255,80,0,0)');
                    ctx.fillStyle = tg;
                    ctx.beginPath(); ctx.arc(0, 17, cr, 0, Math.PI * 2); ctx.fill();
                }
            }

            this.drawHpBar(ctx, 30, 22);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Marauder };
})();

EnemyRegistry.register({ label:'Marauder', scale:1.10, group:'SOLDIERS', mk:()=>new Marauder.Marauder(0,0) });
