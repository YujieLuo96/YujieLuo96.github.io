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
                    }
                    if (this.rageTimer > 0) {
                        this.rageTimer -= dt;
                        this.flashTimer = 2;
                    }

                    const cx = this.x, cy = this.y;
                    const bullets = [];

                    this.shotTimer += dt;
                    if (this.shotTimer >= this.shotInt) {
                        this.shotTimer = 0;
                        const p = Player.getPos();
                        const cnt = this.phaseStage === 2 ? 3 : 2;
                        const s = BulletPatterns.aimed(cx, cy + 36, p.x, p.y, 5.2, { count: cnt, spread: 0.22 });
                        if (s) s.forEach(b => bullets.push(b));
                    }

                    this.burstTimer += dt;
                    if (this.burstTimer >= this.burstInt) {
                        this.burstTimer = 0;
                        const cnt = this.phaseStage === 2 ? 14 : 10;
                        const r = BulletPatterns.ring(cx, cy, cnt, 3.5, this.podAngle);
                        if (r) r.forEach(b => bullets.push(b));
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

                    if (this.phaseStage === 2) {
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
                            }
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
            const hp2   = this.phaseStage === 2;
            const pulse  = 0.5 + Math.sin(this.t * 0.11) * 0.45;
            const pulse2 = 0.5 + Math.sin(this.t * 0.19 + 1.3) * 0.45;
            const acol  = hp2 ? '#ffaa40' : '#ff3010';
            const acBrt = hp2 ? '#ffd080' : '#ff7040';

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
                ctx.strokeStyle = `rgba(${hp2?'255,160,60':'255,80,30'},${0.45 + pulse*0.3})`;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2); ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.restore();

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
