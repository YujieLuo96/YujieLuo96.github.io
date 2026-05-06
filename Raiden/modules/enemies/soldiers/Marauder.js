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
        }

        update(dt, fc) {
            this.phaseTimer += dt;
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
                    }
                    break;

                case 'dive':
                    this.y  += this.speed * 3.5 * dt;
                    this.x  += this.diveVX * dt;
                    this.fireCd -= dt;
                    if (this.fireCd <= 0 && this.fireCount < 3) {
                        this.fireCd = 10;
                        this.fireCount++;
                        const p = Player.getPos();
                        return BulletPatterns.aimed(this.x, this.y + 17, p.x, p.y, 6.2, { count: 1, spread: 0 });
                    }
                    break;
            }
            this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2, this.x));
            this.checkEntered();
            if (this.isOffscreen()) this.alive = false;
            return null;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
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
                [-8, 8].forEach(ox => {
                    ctx.fillStyle = '#220500';
                    ctx.beginPath(); ctx.rect(ox - 2, 3, 4, 11); ctx.fill();
                    ctx.shadowColor = '#ff5500'; ctx.shadowBlur = 6;
                    ctx.fillStyle = `rgba(255,100,0,${0.35 + pulse * 0.3})`;
                    ctx.beginPath(); ctx.arc(ox, 14, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0;
                });
            }

            this.drawHpBar(ctx, 30, 22);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Marauder };
})();

EnemyRegistry.register({ label:'Marauder', scale:1.10, group:'SOLDIERS', mk:()=>new Marauder.Marauder(0,0) });
