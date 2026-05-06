var Fighter = (() => {
    class Fighter extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 3, score: 50, type: 'fighter', dropChance: 0.15,
                    dropTable: ['power','bomb','shield'], w: 36, h: 36 });
            this.speed        = 1.5 + Math.random() * 1.2;
            this.wobbleAmp    = 38 + Math.random() * 30;
            this.wobbleSpd    = 0.02 + Math.random() * 0.012;
            this.wobbleOff    = Math.random() * Math.PI * 2;
            this.baseX        = x;
            this.shootInterval= 65 + Math.random() * 40;
        }
        update(dt, fc) {
            this.y    += this.speed * dt;
            this.baseX += Math.sin(fc * this.wobbleSpd + this.wobbleOff) * 1.8 * dt;
            this.baseX  = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2, this.baseX));
            this.x      = this.baseX;
            this.checkEntered();
            if (this.isOffscreen()) { this.alive = false; return null; }
            if (this.enteredScreen && this.y < Renderer.H - 60) {
                this.shootTimer += dt;
                if (this.shootTimer >= this.shootInterval) {
                    this.shootTimer = 0;
                    const p = Player.getPos();
                    return BulletPatterns.aimed(this.x, this.y + 18, p.x, p.y, 6, { count: 3, spread: 0.42 });
                }
            }
            return null;
        }
        draw(ctx, dt) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);

            if (!flash) {
                // Dual afterburner exhausts
                const flicker = 0.75 + Math.sin(this.shootTimer * 0.7) * 0.25;
                ctx.shadowColor = '#f80'; ctx.shadowBlur = 14;
                [-5, 5].forEach(ox => {
                    const eg = ctx.createRadialGradient(ox, 17, 0, ox, 17, 7 * flicker);
                    eg.addColorStop(0, 'rgba(255,220,80,0.95)');
                    eg.addColorStop(0.5, 'rgba(255,110,15,0.6)');
                    eg.addColorStop(1, 'rgba(200,40,0,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.ellipse(ox, 17, 3, 7 * flicker, 0, 0, Math.PI * 2); ctx.fill();
                });
                ctx.shadowBlur = 0;
            }

            // Wide swept-wing hull
            const hg = ctx.createLinearGradient(0, -18, 0, 18);
            hg.addColorStop(0,    flash ? '#fff' : '#ff8833');
            hg.addColorStop(0.4,  flash ? '#fff' : '#dd5500');
            hg.addColorStop(1,    flash ? '#fff' : '#883300');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(5, -10); ctx.lineTo(16, -4); ctx.lineTo(18, 4);  // right wing
            ctx.lineTo(12, 8);  ctx.lineTo(8, 14);  ctx.lineTo(5, 18);  // right rear
            ctx.lineTo(-5, 18); ctx.lineTo(-8, 14); ctx.lineTo(-12, 8); // rear
            ctx.lineTo(-18, 4); ctx.lineTo(-16, -4); ctx.lineTo(-5, -10); // left wing
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(255,175,100,0.5)'; ctx.lineWidth = 1; ctx.stroke();
                // Wing panel lines
                ctx.strokeStyle = 'rgba(255,140,60,0.4)'; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(-14, 1); ctx.lineTo(-5, -8); ctx.lineTo(0,-10); ctx.lineTo(5,-8); ctx.lineTo(14, 1); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-10, 9); ctx.lineTo(-4, 4); ctx.lineTo(4, 4); ctx.lineTo(10, 9); ctx.stroke();
                // Wing weapon hardpoints
                [-14, 14].forEach(ox => {
                    ctx.fillStyle = '#331100';
                    ctx.beginPath(); ctx.rect(ox - 2, -2, 4, 9); ctx.fill();
                    ctx.fillStyle = '#f64';
                    ctx.beginPath(); ctx.arc(ox, 8, 2, 0, Math.PI * 2); ctx.fill();
                });
                // Cockpit
                const cg = ctx.createRadialGradient(0, -8, 1, 0, -8, 6);
                cg.addColorStop(0, '#ffc080'); cg.addColorStop(1, 'rgba(200,100,20,0.35)');
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.ellipse(0, -8, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,230,180,0.9)';
                ctx.beginPath(); ctx.ellipse(-0.8, -10, 1.5, 3, -0.1, 0, Math.PI * 2); ctx.fill();
                // Engine nozzle rings
                [-5, 5].forEach(ox => {
                    ctx.fillStyle = '#330e00';
                    ctx.beginPath(); ctx.ellipse(ox, 16.5, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#f86'; ctx.lineWidth = 0.8;
                    ctx.beginPath(); ctx.ellipse(ox, 16.5, 3, 1.5, 0, 0, Math.PI * 2); ctx.stroke();
                });
            }
            if (this.hp < this.maxHp) this.drawHpBar(ctx, 30, 22);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }
    return { Fighter };
})();

EnemyRegistry.register({ label:'Fighter', scale:1.10, group:'SOLDIERS', mk:()=>new Fighter.Fighter(0,0) });
