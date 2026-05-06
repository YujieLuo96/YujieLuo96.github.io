var Spectre = (() => {
    class Spectre extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 18, score: 620, type: 'spectre',
                    dropChance: 0.55, dropTable: ['spread_w','homing_w','lightning_w','plasma_w','graviton_w','power','shield'],
                    w: 40, h: 44 });
            this.speed      = 1.6 + Math.random() * 0.4;
            this.holdY      = 80 + Math.random() * 100;
            this.phase      = 'entry';
            this.haltTimer  = 0;
            this.haltMax    = 320 + Math.random() * 80;
            this.driftAngle = Math.random() * Math.PI * 2;
            this.visTimer   = 0;
            this.visMax     = 60 + Math.random() * 30;
            this.visible    = true;
            this.alpha      = 1;
            this.shotTimer  = 0;
            this.shotInt    = 36;
            this.echoes     = [];
            this.echoTimer  = 0;
        }

        update(dt, fc) {
            switch (this.phase) {
                case 'entry':
                    this.y += this.speed * 1.4 * dt;
                    if (this.y >= this.holdY) { this.y = this.holdY; this.phase = 'hunt'; }
                    break;

                case 'hunt': {
                    this.haltTimer += dt;
                    this.driftAngle += 0.018 * dt;

                    this.visTimer += dt;
                    if (this.visible) {
                        this.alpha = Math.min(1, this.alpha + 0.05 * dt);
                        if (this.visTimer >= this.visMax) {
                            this.visible = false; this.visTimer = 0;
                        }
                    } else {
                        this.alpha = Math.max(0.08, this.alpha - 0.04 * dt);
                        if (this.visTimer >= this.visMax * 0.7) {
                            this.visible = true; this.visTimer = 0;
                            const p = Player.getPos();
                            const dx = p.x - this.x, dy = p.y - this.y;
                            const d  = Math.sqrt(dx*dx + dy*dy) || 1;
                            this.x  += (dx / d) * 22;
                            this.y  += (dy / d) * 12;
                        }
                    }

                    this.x = Math.max(this.w/2, Math.min(Renderer.W - this.w/2,
                        this.x + Math.sin(this.driftAngle * 1.3) * 2.4 * dt));
                    this.y = this.holdY + Math.sin(this.driftAngle * 0.7) * 28;

                    this.echoTimer += dt;
                    if (this.echoTimer >= 6 && this.visible && this.alpha > 0.5) {
                        this.echoTimer = 0;
                        this.echoes.push({ x: this.x, y: this.y, alpha: 0.38 });
                    }
                    this.echoes = this.echoes
                        .map(e => ({ x: e.x, y: e.y, alpha: e.alpha - 0.022 * dt }))
                        .filter(e => e.alpha > 0);

                    if (this.visible) {
                        this.shotTimer += dt;
                        if (this.shotTimer >= this.shotInt) {
                            this.shotTimer = 0;
                            const p = Player.getPos();
                            return BulletPatterns.aimed(this.x, this.y + 22, p.x, p.y, 6.0, { count: 3, spread: 0.18 });
                        }
                    }
                    if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                    break;
                }

                case 'exit':
                    this.alpha = Math.max(0, this.alpha - 0.04 * dt);
                    this.y += this.speed * 2.2 * dt;
                    break;
            }
            this.checkEntered();
            if (this.isOffscreen()) this.alive = false;
            return null;
        }

        draw(ctx, dt, fc) {
            for (const e of this.echoes) {
                ctx.save();
                ctx.globalAlpha = e.alpha;
                ctx.translate(e.x, e.y);
                ctx.fillStyle = 'rgba(160,60,255,0.5)';
                ctx.beginPath();
                ctx.moveTo(0,-22); ctx.lineTo(7,-14); ctx.lineTo(16,-4); ctx.lineTo(20,4);
                ctx.lineTo(14,14); ctx.lineTo(7,22);  ctx.lineTo(-7,22); ctx.lineTo(-14,14);
                ctx.lineTo(-20,4); ctx.lineTo(-16,-4);ctx.lineTo(-7,-14);
                ctx.closePath(); ctx.fill();
                ctx.restore();
            }

            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const pulse = 0.5 + Math.sin((fc || 0) * 0.22) * 0.45;

            if (!flash && this.alpha > 0.15) {
                ctx.shadowColor = '#aa40ff'; ctx.shadowBlur = 22 + (1 - this.alpha) * 16;
                const aura = ctx.createRadialGradient(0, 0, 8, 0, 0, 28);
                aura.addColorStop(0,   'rgba(180,80,255,0.0)');
                aura.addColorStop(0.6, `rgba(120,30,220,${(1 - this.alpha) * 0.22})`);
                aura.addColorStop(1,   'rgba(60,0,140,0)');
                ctx.fillStyle = aura;
                ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;

                ctx.shadowColor = '#cc50ff'; ctx.shadowBlur = 14;
                const eg = ctx.createRadialGradient(0, 20, 0, 0, 20, 10);
                eg.addColorStop(0, `rgba(200,80,255,${0.8 + pulse * 0.15})`);
                eg.addColorStop(0.5, 'rgba(100,20,200,0.5)');
                eg.addColorStop(1,   'rgba(40,0,100,0)');
                ctx.fillStyle = eg;
                ctx.beginPath(); ctx.ellipse(0, 20, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }

            const hg = ctx.createLinearGradient(0, -22, 0, 22);
            hg.addColorStop(0,    flash ? '#fff' : '#cc80ff');
            hg.addColorStop(0.3,  flash ? '#fff' : '#7020cc');
            hg.addColorStop(0.65, flash ? '#fff' : '#3a0880');
            hg.addColorStop(1,    flash ? '#fff' : '#140030');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0,-22); ctx.lineTo(7,-14); ctx.lineTo(16,-4); ctx.lineTo(20,4);
            ctx.lineTo(14,14); ctx.lineTo(7,22);  ctx.lineTo(-7,22); ctx.lineTo(-14,14);
            ctx.lineTo(-20,4); ctx.lineTo(-16,-4);ctx.lineTo(-7,-14);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = `rgba(200,100,255,${this.alpha * 0.7})`; ctx.lineWidth = 1.3; ctx.stroke();
                ctx.strokeStyle = `rgba(180,80,255,${0.35 + pulse * 0.3})`; ctx.lineWidth = 0.9;
                ctx.beginPath(); ctx.moveTo(-18,2); ctx.lineTo(-8,-8); ctx.lineTo(0,-11); ctx.lineTo(8,-8); ctx.lineTo(18,2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-13,12); ctx.lineTo(-5,4); ctx.lineTo(5,4); ctx.lineTo(13,12); ctx.stroke();
                ctx.fillStyle = '#0a0010';
                ctx.beginPath(); ctx.ellipse(0,-10,4.5,6,0,0,Math.PI*2); ctx.fill();
                ctx.shadowColor = '#dd60ff'; ctx.shadowBlur = 10;
                const cg = ctx.createRadialGradient(0,-10,1,0,-10,4.5);
                cg.addColorStop(0,'#eeccff');
                cg.addColorStop(0.5,`rgba(180,80,255,${0.7 + pulse * 0.28})`);
                cg.addColorStop(1,'rgba(80,0,180,0.2)');
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.ellipse(0,-10,3.5,5,0,0,Math.PI*2); ctx.fill();
                ctx.fillStyle = 'rgba(240,200,255,0.9)';
                ctx.beginPath(); ctx.ellipse(-1,-11.5,1.4,2.2,0,0,Math.PI*2); ctx.fill();
                ctx.shadowBlur = 0;
                if (!this.visible || this.alpha < 0.75) {
                    const phAlpha = ctx.globalAlpha * (1 - this.alpha) * 0.55;
                    ctx.globalAlpha = Math.max(0, phAlpha);
                    ctx.strokeStyle = '#ff80ff'; ctx.lineWidth = 1.4;
                    for (let i = 0; i < 4; i++) {
                        const a = (i / 4) * Math.PI * 2 + (fc || 0) * 0.04;
                        ctx.beginPath(); ctx.arc(0, 0, 20 + Math.sin(a) * 3, a - 0.4, a + 0.4); ctx.stroke();
                    }
                    ctx.globalAlpha = this.alpha;
                }
            }

            if (this.hp < this.maxHp) this.drawHpBar(ctx, 40, 28);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Spectre };
})();

EnemyRegistry.register({ label:'Spectre', scale:0.68, group:'ELITES', mk:()=>new Spectre.Spectre(0,0) });
