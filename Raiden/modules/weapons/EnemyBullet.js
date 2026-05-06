var EnemyBullet = (() => {
    class EnemyBullet {
        constructor(x, y, vx, vy, opts = {}) {
            this.x      = x; this.y = y;
            this.vx     = vx; this.vy = vy;
            this.radius = opts.radius || 4;
            this.color  = opts.color  || '#f44';
            this.type   = opts.type   || 'normal'; // 'normal' | 'big' | 'laser'
            this.alive  = true;
            this.damage = opts.damage || 1;
        }
        update(dt) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            if (this.y > Renderer.H + 30 || this.y < -40 ||
                this.x < -40  || this.x > Renderer.W + 40)
                this.alive = false;
        }
        draw(ctx) {
            const r = this.radius;
            if (this.type === 'big') {
                const g = ctx.createRadialGradient(this.x, this.y, 1, this.x, this.y, r * 2.8);
                g.addColorStop(0,   '#fdd');
                g.addColorStop(0.35, this.color);
                g.addColorStop(1,   'rgba(200,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(this.x, this.y, r * 2.8, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(this.x, this.y, r * 0.5, 0, Math.PI * 2); ctx.fill();
            } else if (this.type === 'laser') {
                const ang = Math.atan2(this.vy, this.vx);
                ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang + Math.PI / 2);
                const hl = 46;
                ctx.shadowColor = '#0ef'; ctx.shadowBlur = 16;
                const og = ctx.createLinearGradient(-r * 1.8, 0, r * 1.8, 0);
                og.addColorStop(0,   'rgba(0,220,255,0)');
                og.addColorStop(0.3, 'rgba(0,200,255,0.38)');
                og.addColorStop(0.5, 'rgba(160,240,255,0.55)');
                og.addColorStop(0.7, 'rgba(0,200,255,0.38)');
                og.addColorStop(1,   'rgba(0,220,255,0)');
                ctx.fillStyle = og;
                ctx.fillRect(-r * 1.8, -hl, r * 3.6, hl * 2);
                ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
                ctx.fillStyle = 'rgba(220,250,255,0.92)';
                ctx.fillRect(-r * 0.3, -hl * 0.95, r * 0.6, hl * 1.9);
                ctx.shadowBlur = 0;
                ctx.restore();
            } else if (this.type === 'neutron_pulse') {
                const ang = Math.atan2(this.vy, this.vx);
                ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang + Math.PI / 2);
                const hl = 42;
                ctx.shadowColor = '#80f'; ctx.shadowBlur = 24;
                // purple corona
                const pg = ctx.createLinearGradient(-r * 2.4, 0, r * 2.4, 0);
                pg.addColorStop(0,    'rgba(50,0,100,0)');
                pg.addColorStop(0.22, 'rgba(110,0,200,0.50)');
                pg.addColorStop(0.5,  'rgba(160,20,240,0.68)');
                pg.addColorStop(0.78, 'rgba(110,0,200,0.50)');
                pg.addColorStop(1,    'rgba(50,0,100,0)');
                ctx.fillStyle = pg;
                ctx.fillRect(-r * 2.4, -hl, r * 4.8, hl * 2);
                // dark core
                ctx.fillStyle = 'rgba(5,0,22,0.90)';
                ctx.fillRect(-r * 0.55, -hl * 0.92, r * 1.1, hl * 1.84);
                // crackling lightning arcs (randomised each frame → flickering)
                for (let k = 0; k < 4; k++) {
                    const side = (k % 2 === 0 ? 1 : -1) * (r * 1.1 + Math.random() * r * 0.9);
                    ctx.lineWidth   = 0.45 + Math.random() * 0.65;
                    ctx.strokeStyle = `rgba(188,80,255,${0.40 + Math.random() * 0.45})`;
                    ctx.beginPath();
                    const sy = -hl * 0.82;
                    ctx.moveTo(side + (Math.random() - 0.5) * r * 0.8, sy);
                    const steps = 4 + Math.floor(Math.random() * 3);
                    for (let s = 1; s <= steps; s++) {
                        ctx.lineTo(side + (Math.random() - 0.5) * r * 2.0,
                                   sy + (hl * 1.64 / steps) * s);
                    }
                    ctx.stroke();
                }
                // bright center filament
                ctx.strokeStyle = 'rgba(230,170,255,0.82)';
                ctx.lineWidth = 0.7;
                ctx.beginPath(); ctx.moveTo(0, -hl * 0.90); ctx.lineTo(0, hl * 0.90); ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.restore();
            } else if (this.type === 'neutron_orb') {
                ctx.shadowColor = '#90f'; ctx.shadowBlur = 22;
                const nr = r * 2.5;
                const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, nr);
                g.addColorStop(0,    'rgba(255,255,255,0.96)');
                g.addColorStop(0.20, 'rgba(210,130,255,0.88)');
                g.addColorStop(0.45, 'rgba(100,0,210,0.60)');
                g.addColorStop(0.70, 'rgba(28,0,90,0.28)');
                g.addColorStop(1,    'rgba(0,0,30,0)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(this.x, this.y, nr, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = 'rgba(255,230,255,0.95)';
                ctx.beginPath(); ctx.arc(this.x, this.y, r * 0.4, 0, Math.PI * 2); ctx.fill();
            } else {
                // Oriented normal bullet
                const ang = Math.atan2(this.vy, this.vx);
                ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang + Math.PI / 2);
                const len = r * 2.6;
                const g = ctx.createLinearGradient(0, -len, 0, len);
                g.addColorStop(0,    'rgba(255,100,100,0)');
                g.addColorStop(0.25, this.color);
                g.addColorStop(0.5,  '#fcc');
                g.addColorStop(0.75, this.color);
                g.addColorStop(1,    'rgba(255,100,100,0)');
                ctx.fillStyle = g;
                ctx.fillRect(-r * 0.75, -len, r * 1.5, len * 2);
                ctx.fillStyle = '#fee';
                ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
        }
        getBounds() {
            return { x: this.x - this.radius, y: this.y - this.radius,
                     w: this.radius * 2,      h: this.radius * 2 };
        }
    }
    return EnemyBullet;
})();
