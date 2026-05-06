var Interceptor = (() => {
    class Interceptor extends EnemyBase {
        constructor(x, y, opts = {}) {
            super({ x, y, hp: 2, score: 80, type: 'interceptor',
                    dropChance: 0.06, dropTable: ['power', 'health'], w: 22, h: 22 });
            this.fromLeft = opts.fromLeft !== undefined ? opts.fromLeft : Math.random() < 0.5;
            this.speed    = 3.8 + Math.random() * 1.2;
            this.vx       = this.fromLeft ? this.speed : -this.speed;
            this.vy       = 1.0 + Math.random() * 0.8;
            this.fired    = false;
            this.angle    = Math.atan2(this.vy, this.vx);
        }

        update(dt, fc) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.checkEntered();
            // Fire once when crossing the center band
            if (!this.fired && this.enteredScreen &&
                this.x > Renderer.W * 0.22 && this.x < Renderer.W * 0.78) {
                this.fired = true;
                const p = Player.getPos();
                return BulletPatterns.aimed(this.x, this.y + 10, p.x, p.y, 6,
                    { count: 2, spread: 0.22 });
            }
            if (this.isOffscreen()) this.alive = false;
            return null;
        }

        draw(ctx, dt) {
            ctx.save(); ctx.translate(this.x, this.y);
            ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
            const flash = this._applyFlash(ctx, dt);

            if (!flash) {
                // Engine flare (points backwards — top in local space after rotate)
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                ctx.shadowColor = '#f40'; ctx.shadowBlur = 14;
                const eg = ctx.createRadialGradient(0, 13, 0, 0, 13, 10);
                eg.addColorStop(0, 'rgba(255,200,60,0.95)');
                eg.addColorStop(0.45, 'rgba(255,70,10,0.6)');
                eg.addColorStop(1, 'rgba(200,10,0,0)');
                ctx.fillStyle = eg;
                ctx.beginPath(); ctx.ellipse(0, 13, 4 + speed * 0.1, 10, 0, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Sharp delta hull — aggressive sweep
            const hg = ctx.createLinearGradient(0, -11, 0, 11);
            hg.addColorStop(0,   flash ? '#fff' : '#ff6633');
            hg.addColorStop(0.5, flash ? '#fff' : '#cc3300');
            hg.addColorStop(1,   flash ? '#fff' : '#882200');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -11);
            ctx.lineTo(3, -5);   ctx.lineTo(9, 1);       // right delta
            ctx.lineTo(6, 4);    ctx.lineTo(3.5, 10);    // right tail fin
            ctx.lineTo(0.5, 7);  ctx.lineTo(0, 8);
            ctx.lineTo(-0.5, 7); ctx.lineTo(-3.5, 10);   // left tail fin
            ctx.lineTo(-6, 4);   ctx.lineTo(-9, 1);       // left delta
            ctx.lineTo(-3, -5);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(255,155,90,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
                // Delta sweep lines
                ctx.strokeStyle = 'rgba(255,120,50,0.4)'; ctx.lineWidth = 0.6;
                ctx.beginPath(); ctx.moveTo(-7, 2); ctx.lineTo(0, -5); ctx.lineTo(7, 2); ctx.stroke();
                // Sensor spike at nose tip
                ctx.strokeStyle = 'rgba(255,180,100,0.8)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, -15); ctx.stroke();
                ctx.fillStyle = '#ff8844';
                ctx.beginPath(); ctx.arc(0, -15, 1.5, 0, Math.PI * 2); ctx.fill();
                // Cockpit visor slit
                ctx.fillStyle = 'rgba(255,180,100,0.9)';
                ctx.beginPath(); ctx.ellipse(0, -4, 1.8, 3, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,240,200,0.8)';
                ctx.beginPath(); ctx.ellipse(-0.3, -5, 0.7, 1.5, 0, 0, Math.PI * 2); ctx.fill();
                // Nozzle ring
                ctx.fillStyle = '#331100';
                ctx.beginPath(); ctx.ellipse(0, 12, 3.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#ff5522'; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.ellipse(0, 12, 3.5, 1.8, 0, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    // Alternating sides, staggered heights
    function spawnSweep(count) {
        const arr = [];
        for (let i = 0; i < count; i++) {
            const fromLeft = i % 2 === 0;
            arr.push(new Interceptor(
                fromLeft ? -30 : Renderer.W + 30,
                70 + (i / Math.max(1, count - 1)) * 160,
                { fromLeft }
            ));
        }
        return arr;
    }

    return { Interceptor, spawnSweep };
})();

EnemyRegistry.register({ label:'Interceptor', scale:1.15, group:'SOLDIERS', mk:()=>new Interceptor.Interceptor(0,0) });
