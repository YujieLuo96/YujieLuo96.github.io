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
            this.shotTimer  = 0;
            this.shotInt    = 55;
            this.driftX     = (Math.random() - 0.5) * 1.6;
        }

        update(dt, fc) {
            this.spinAngle += this.spinRate * dt;

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
                    this.shotTimer += dt;
                    if (this.shotTimer >= this.shotInt) {
                        this.shotTimer = 0;
                        return BulletPatterns.ring(this.x, this.y, 8, 3.8, this.spinAngle);
                    }
                    if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                    break;

                case 'exit':
                    this.y += this.speed * 2.2 * dt;
                    break;
            }
            this.checkEntered();
            if (this.isOffscreen()) this.alive = false;
            return null;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const pulse = 0.5 + Math.sin((fc || 0) * 0.18) * 0.45;

            if (!flash) {
                ctx.save();
                ctx.rotate(this.spinAngle);
                ctx.shadowColor = '#00ffee'; ctx.shadowBlur = 14;
                ctx.strokeStyle = `rgba(0,240,220,${0.55 + pulse * 0.35})`;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    ctx.strokeStyle = `rgba(0,200,240,${0.28 + pulse * 0.22})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14); ctx.stroke();
                }
                ctx.shadowBlur = 0;
                ctx.restore();
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

                ctx.shadowColor = '#00eeff'; ctx.shadowBlur = 14;
                const cg = ctx.createRadialGradient(0, 0, 1, 0, 0, 5);
                cg.addColorStop(0, '#ffffff');
                cg.addColorStop(0.4, `rgba(0,240,255,${0.8 + pulse * 0.18})`);
                cg.addColorStop(1,   'rgba(0,160,200,0)');
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
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
