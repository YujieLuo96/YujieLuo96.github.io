var Scout = (() => {
    class Scout extends EnemyBase {
        constructor(x, y, opts = {}) {
            super({ x, y, hp: 1, score: 10, type: 'scout', dropChance: 0.05,
                    dropTable: ['power','health'], w: 24, h: 24 });
            this.vy          = (opts.speed || 3) + Math.random() * 1.5;
            this.vx          = opts.vx || 0;
            this.canShoot    = Math.random() < 0.12;
            this.shootInterval = 130 + Math.random() * 60;
        }
        update(dt, _fc) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2, this.x));
            this.checkEntered();
            if (this.isOffscreen()) { this.alive = false; return null; }
            if (this.canShoot && this.enteredScreen && this.y < Renderer.H - 60) {
                this.shootTimer += dt;
                if (this.shootTimer >= this.shootInterval) {
                    this.shootTimer = 0;
                    const p = Player.getPos();
                    return BulletPatterns.aimed(this.x, this.y + 12, p.x, p.y, 5);
                }
            }
            return null;
        }
        draw(ctx, dt) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);

            if (!flash) {
                // Twin engine exhausts
                const flicker = 0.7 + Math.sin(this.shootTimer * 0.9) * 0.3;
                ctx.shadowColor = '#f64'; ctx.shadowBlur = 10;
                [-3.5, 3.5].forEach(ox => {
                    const eg = ctx.createRadialGradient(ox, 11, 0, ox, 11, 5 * flicker);
                    eg.addColorStop(0, 'rgba(255,230,80,0.95)');
                    eg.addColorStop(0.45, 'rgba(255,100,20,0.6)');
                    eg.addColorStop(1, 'rgba(200,20,0,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.ellipse(ox, 11, 2.5, 5 * flicker, 0, 0, Math.PI * 2); ctx.fill();
                });
                ctx.shadowBlur = 0;
            }

            // Main hull — sleek arrowhead with swept wings
            const hg = ctx.createLinearGradient(0, -12, 0, 12);
            hg.addColorStop(0,    flash ? '#fff' : '#ff5555');
            hg.addColorStop(0.45, flash ? '#fff' : '#cc2020');
            hg.addColorStop(1,    flash ? '#fff' : '#771111');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -12);
            ctx.lineTo(3.5, -7); ctx.lineTo(11, 1); ctx.lineTo(8, 4);    // right wing
            ctx.lineTo(5, 10);   ctx.lineTo(2, 7);  ctx.lineTo(0, 8);    // right tail
            ctx.lineTo(-2, 7);   ctx.lineTo(-5, 10);                       // left tail
            ctx.lineTo(-8, 4);   ctx.lineTo(-11, 1); ctx.lineTo(-3.5, -7); // left wing
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(255,140,140,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
                // Wing sweep line
                ctx.strokeStyle = 'rgba(255,80,80,0.45)'; ctx.lineWidth = 0.7;
                ctx.beginPath(); ctx.moveTo(-9, 2); ctx.lineTo(0, -4); ctx.lineTo(9, 2); ctx.stroke();
                // Cockpit canopy
                ctx.fillStyle = '#ff9999';
                ctx.beginPath(); ctx.ellipse(0, -4, 2.2, 3.5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,220,220,0.85)';
                ctx.beginPath(); ctx.ellipse(-0.5, -5.5, 0.9, 1.8, -0.15, 0, Math.PI * 2); ctx.fill();
                // Engine nozzle rings
                [-3.5, 3.5].forEach(ox => {
                    ctx.fillStyle = '#330000';
                    ctx.beginPath(); ctx.ellipse(ox, 10, 2.2, 1.2, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#ff4422'; ctx.lineWidth = 0.7;
                    ctx.beginPath(); ctx.ellipse(ox, 10, 2.2, 1.2, 0, 0, Math.PI * 2); ctx.stroke();
                });
            }
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    function spawnLine(count, y = -50) {
        const step = Renderer.W / (count + 1);
        return Array.from({ length: count }, (_, i) => new Scout(step * (i + 1), y));
    }
    function spawnV(count, tipX = Renderer.W / 2, tipY = -30) {
        const arr = [new Scout(tipX, tipY)];
        for (let i = 1; i <= Math.floor(count / 2); i++) {
            arr.push(new Scout(tipX - i * 44, tipY + i * 34));
            arr.push(new Scout(tipX + i * 44, tipY + i * 34));
        }
        return arr;
    }
    function spawnPincer(count) {
        const arr = [], h = Math.ceil(count / 2);
        for (let i = 0; i < h; i++) {
            arr.push(new Scout(24 + i * 30, -30 + (h - i) * 18, { vx: 1.4 }));
            arr.push(new Scout(Renderer.W - 24 - i * 30, -30 + (h - i) * 18, { vx: -1.4 }));
        }
        return arr;
    }
    return { Scout, spawnLine, spawnV, spawnPincer };
})();

EnemyRegistry.register({ label:'Scout', scale:1.40, group:'SOLDIERS', mk:()=>new Scout.Scout(0,0) });
