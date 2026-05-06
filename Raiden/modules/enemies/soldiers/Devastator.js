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
            this.shotInt      = 60;
            this.missileTimer = 0;
            this.missileInt   = 110;
            this.armAngle     = 0;
            this.phaseStage   = 1;
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

                    this.x = Math.max(this.w/2, Math.min(Renderer.W - this.w/2,
                        this.x + Math.sin(this.t * 0.012) * 1.6 * dt));
                    this.y = this.holdY + Math.sin(this.t * 0.008) * 20;

                    if (this.phaseStage === 1 && this.hp <= this.maxHp * 0.55) {
                        this.phaseStage = 2;
                        this.shotInt    = 40;
                        this.missileInt = 75;
                    }

                    const bullets = [];

                    this.shotTimer += dt;
                    if (this.shotTimer >= this.shotInt) {
                        this.shotTimer = 0;
                        const p = Player.getPos();
                        const cnt = this.phaseStage === 2 ? 4 : 3;
                        const s = BulletPatterns.aimed(this.x, this.y + 22, p.x, p.y, 5.0, { count: cnt, spread: 0.25 });
                        if (s) s.forEach(b => bullets.push(b));
                    }

                    this.missileTimer += dt;
                    if (this.missileTimer >= this.missileInt) {
                        this.missileTimer = 0;
                        const p = Player.getPos();
                        const cnt = this.phaseStage === 2 ? 3 : 2;
                        for (let i = 0; i < cnt; i++) {
                            const off = (i - (cnt - 1) / 2) * 0.22;
                            const s = BulletPatterns.aimed(this.x, this.y + 20,
                                p.x + Math.sin(off) * 55, p.y, 4.5, { count: 1, spread: 0 });
                            if (s) s.forEach(b => bullets.push(b));
                        }
                    }

                    if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                    if (bullets.length > 0) return bullets;
                    break;
                }

                case 'exit':
                    this.y += this.speed * 2.0 * dt;
                    break;
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

            if (!flash) {
                for (let i = 0; i < 2; i++) {
                    ctx.save();
                    ctx.rotate(this.armAngle + i * Math.PI);
                    ctx.shadowColor = acol; ctx.shadowBlur = 8;
                    ctx.strokeStyle = acol; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-22); ctx.stroke();
                    ctx.shadowBlur = 0;
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

                [-13, 13].forEach(ox => {
                    ctx.shadowColor = '#ff5500'; ctx.shadowBlur = 12;
                    const eg = ctx.createRadialGradient(ox,21,0,ox,21,9);
                    eg.addColorStop(0,'rgba(255,120,0,0.9)');
                    eg.addColorStop(0.5,'rgba(200,50,0,0.5)');
                    eg.addColorStop(1,'rgba(100,10,0,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.ellipse(ox,21,5,9,0,0,Math.PI*2); ctx.fill();
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
                ctx.shadowColor = acol; ctx.shadowBlur = 14;
                ctx.fillStyle = '#0a0000';
                ctx.beginPath(); ctx.arc(0,5,10,0,Math.PI*2); ctx.fill();
                const rg = ctx.createRadialGradient(0,5,1,0,5,10);
                rg.addColorStop(0,'#ffffff');
                rg.addColorStop(0.25,hp2?'#ffaa40':'#ff6030');
                rg.addColorStop(0.6,`rgba(${hp2?'200,80,0':'180,30,0'},${0.55+pulse*0.35})`);
                rg.addColorStop(1,'rgba(0,0,0,0)');
                ctx.fillStyle = rg;
                ctx.beginPath(); ctx.arc(0,5,10,0,Math.PI*2); ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(0,5,3.5,0,Math.PI*2); ctx.fill();
                ctx.shadowBlur = 0;
            }

            this.drawHpBar(ctx, 48, 30);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Devastator };
})();

EnemyRegistry.register({ label:'Devastator', scale:0.56, group:'ELITES', mk:()=>new Devastator.Devastator(0,0) });
