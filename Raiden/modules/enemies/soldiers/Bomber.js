var Bomber = (() => {
    class Bomber extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 8, score: 150, type: 'bomber', dropChance: 0.5,
                    dropTable: ['power','bomb','health','shield'], w: 54, h: 54 });
            this.speed        = 0.8 + Math.random() * 0.6;
            this.wobbleAmp    = 28 + Math.random() * 18;
            this.wobbleSpd    = 0.014 + Math.random() * 0.008;
            this.wobbleOff    = Math.random() * Math.PI * 2;
            this.baseX        = x;
            this.shootInterval= 55 + Math.random() * 28;
            this.rotAngle     = 0;
        }
        update(dt, fc) {
            this.y    += this.speed * dt;
            this.x     = this.baseX + Math.sin(fc * this.wobbleSpd + this.wobbleOff) * this.wobbleAmp;
            this.x     = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2, this.x));
            this.rotAngle += 0.008 * dt;
            this.checkEntered();
            if (this.isOffscreen()) { this.alive = false; return null; }
            if (this.enteredScreen && this.y < Renderer.H - 90) {
                this.shootTimer += dt;
                if (this.shootTimer >= this.shootInterval) {
                    this.shootTimer = 0;
                    const p = Player.getPos();
                    const ang = Math.atan2(p.y - this.y, p.x - this.x);
                    return BulletPatterns.fan(this.x, this.y + 27, 5, 5, ang, Math.PI * 0.55,
                        { bulletOpts: { radius: 5, color: '#f84', type: 'big' } });
                }
            }
            return null;
        }
        draw(ctx, dt) {
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rotAngle * 0.18);
            const flash = this._applyFlash(ctx, dt);

            if (!flash) {
                // Four engine exhausts (heavy bomber)
                const flicker = 0.65 + Math.sin(this.rotAngle * 7) * 0.35;
                ctx.shadowColor = '#c04'; ctx.shadowBlur = 16;
                [[-10, 23], [-3, 25], [3, 25], [10, 23]].forEach(([ox, oy]) => {
                    const eg = ctx.createRadialGradient(ox, oy, 0, ox, oy, 7 * flicker);
                    eg.addColorStop(0, 'rgba(255,170,255,0.95)');
                    eg.addColorStop(0.5, 'rgba(180,20,180,0.6)');
                    eg.addColorStop(1, 'rgba(90,0,100,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.ellipse(ox, oy, 3, 7 * flicker, 0, 0, Math.PI * 2); ctx.fill();
                });
                ctx.shadowBlur = 0;
            }

            // Wide heavy hull
            const hg = ctx.createLinearGradient(0, -27, 0, 27);
            hg.addColorStop(0,    flash ? '#fff' : '#cc44aa');
            hg.addColorStop(0.35, flash ? '#fff' : '#993388');
            hg.addColorStop(0.7,  flash ? '#fff' : '#662266');
            hg.addColorStop(1,    flash ? '#fff' : '#441144');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -27);
            ctx.lineTo(6, -18); ctx.lineTo(22, -10); ctx.lineTo(28, 0);  // right wing
            ctx.lineTo(24, 8);  ctx.lineTo(18, 14);  ctx.lineTo(13, 22); // right rear
            ctx.lineTo(5, 27);  ctx.lineTo(-5, 27);  ctx.lineTo(-13, 22);// bottom
            ctx.lineTo(-18, 14);ctx.lineTo(-24, 8);  ctx.lineTo(-28, 0); // left rear
            ctx.lineTo(-22, -10);ctx.lineTo(-6, -18);                      // left wing
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(220,120,220,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
                // Hull armor panels
                ctx.strokeStyle = 'rgba(200,100,200,0.3)'; ctx.lineWidth = 0.7;
                ctx.beginPath(); ctx.moveTo(-22,-5); ctx.lineTo(-8,-15); ctx.lineTo(0,-18); ctx.lineTo(8,-15); ctx.lineTo(22,-5); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-18, 5); ctx.lineTo(-6, -2); ctx.lineTo(6, -2); ctx.lineTo(18, 5); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-14,16); ctx.lineTo(-4,10); ctx.lineTo(4,10); ctx.lineTo(14,16); ctx.stroke();
                // Side engine nacelles
                [-20, 20].forEach(ox => {
                    ctx.fillStyle = '#220033';
                    ctx.beginPath(); ctx.rect(ox - 4, -3, 8, 12); ctx.fill();
                    ctx.strokeStyle = 'rgba(200,80,200,0.35)'; ctx.lineWidth = 0.7;
                    ctx.strokeRect(ox - 4, -3, 8, 12);
                });
                // Center bomb pod
                ctx.fillStyle = '#1a001a';
                ctx.beginPath(); ctx.rect(-5, 6, 10, 14); ctx.fill();
                ctx.strokeStyle = 'rgba(200,80,200,0.4)'; ctx.lineWidth = 0.8;
                ctx.strokeRect(-5, 6, 10, 14);
                ctx.fillStyle = '#880066';
                ctx.beginPath(); ctx.arc(0, 18, 3.5, 0, Math.PI * 2); ctx.fill();
                // Cockpit dome
                const cdg = ctx.createRadialGradient(0, -13, 1, 0, -13, 8);
                cdg.addColorStop(0, '#eebdee'); cdg.addColorStop(0.5, '#aa55aa'); cdg.addColorStop(1, 'rgba(90,10,90,0.25)');
                ctx.fillStyle = cdg;
                ctx.beginPath(); ctx.arc(0, -13, 8, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,220,255,0.85)';
                ctx.beginPath(); ctx.ellipse(-2, -15, 2.5, 4, -0.2, 0, Math.PI * 2); ctx.fill();
            }
            this.drawHpBar(ctx, 44, 32);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }
    return { Bomber };
})();

EnemyRegistry.register({ label:'Bomber', scale:0.88, group:'SOLDIERS', mk:()=>new Bomber.Bomber(0,0) });
