var Drone = (() => {
    class Drone extends EnemyBase {
        constructor(x, y, opts = {}) {
            super({ x, y, hp: 1, score: 30, type: 'drone',
                    dropChance: 0.04, dropTable: ['power'], w: 14, h: 14 });
            this.targetX  = opts.targetX !== undefined ? opts.targetX : x;
            this.speed    = 2.2 + Math.random() * 1.2;
            this.vy       = 1.4 + Math.random() * 0.8;
            this.spinAngle = Math.random() * Math.PI * 2;
            this.spinRate  = 0.07 + Math.random() * 0.04;
            this.hue       = 290 + Math.random() * 50; // purple-pink
        }

        update(dt) {
            // Drift laterally toward targetX, descend
            const dx = this.targetX - this.x;
            this.x += Math.sign(dx) * Math.min(Math.abs(dx), this.speed * 0.6 * dt);
            this.y += this.vy * dt;
            this.spinAngle += this.spinRate * dt;
            this.checkEntered();
            if (this.isOffscreen()) this.alive = false;
            return null;
        }

        draw(ctx, dt) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.spinAngle);
            const flash = this._applyFlash(ctx, dt);

            if (!flash) {
                // Core energy glow
                ctx.shadowColor = `hsl(${this.hue},100%,70%)`; ctx.shadowBlur = 10;
                const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 4);
                cg.addColorStop(0, `hsla(${this.hue+20},100%,92%,0.9)`);
                cg.addColorStop(0.6, `hsla(${this.hue},100%,60%,0.5)`);
                cg.addColorStop(1, `hsla(${this.hue},90%,40%,0)`);
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Hexagonal hull (6 sides)
            const hg = ctx.createLinearGradient(0, -7, 0, 7);
            hg.addColorStop(0, flash ? '#fff' : `hsl(${this.hue},95%,68%)`);
            hg.addColorStop(1, flash ? '#fff' : `hsl(${this.hue+30},90%,36%)`);
            ctx.fillStyle = hg;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
                i === 0 ? ctx.moveTo(Math.cos(a)*7, Math.sin(a)*7)
                        : ctx.lineTo(Math.cos(a)*7, Math.sin(a)*7);
            }
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = `hsla(${this.hue-20},100%,80%,0.55)`;
                ctx.lineWidth = 0.8; ctx.stroke();
                // Circuit cross-lines
                ctx.strokeStyle = `hsla(${this.hue+20},100%,78%,0.38)`;
                ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-2.5, 4.3); ctx.lineTo(2.5, -4.3); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(2.5, 4.3); ctx.lineTo(-2.5, -4.3); ctx.stroke();
                // Thruster micro-dots at alternating corners
                [0, 2, 4].forEach(i => {
                    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
                    ctx.fillStyle = `hsla(${this.hue-10},100%,88%,0.75)`;
                    ctx.beginPath(); ctx.arc(Math.cos(a)*6.5, Math.sin(a)*6.5, 1.2, 0, Math.PI*2); ctx.fill();
                });
                // Center dot
                ctx.fillStyle = `hsla(${this.hue+20},100%,94%,0.9)`;
                ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    function spawnSwarm(count, cx, cy) {
        const arr = [];
        const spread = 60;
        for (let i = 0; i < count; i++) {
            const ox = (Math.random() - 0.5) * spread;
            const oy = (Math.random() - 0.5) * spread * 0.4;
            const tx = Math.max(20, Math.min(Renderer.W - 20,
                cx + (Math.random() - 0.5) * spread * 0.5));
            arr.push(new Drone(cx + ox, -14 + oy, { targetX: tx }));
        }
        return arr;
    }

    return { Drone, spawnSwarm };
})();

EnemyRegistry.register({ label:'Drone', scale:1.50, group:'SOLDIERS', mk:()=>new Drone.Drone(0,0) });
