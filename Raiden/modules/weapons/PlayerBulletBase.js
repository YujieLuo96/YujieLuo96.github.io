var PlayerBulletBase = (() => {
    class PlayerBulletBase {
        constructor(x, y, opts = {}) {
            this.x        = x; this.y = y;
            this.alive    = true;
            this.damage   = opts.damage   || 1;
            this.piercing = opts.piercing || false;
        }
        getBounds() { return { x: this.x - 3, y: this.y - 8, w: 6, h: 16 }; }
        isOffscreen() {
            return this.y < -40  || this.y > Renderer.H + 40 ||
                   this.x < -40  || this.x > Renderer.W + 40;
        }
    }
    return PlayerBulletBase;
})();

// Generic player bullet usable with BulletPatterns.FACTORY.player()
// Renders as a colored velocity-oriented bolt — suitable for ring/spiral/fan patterns.
var GenericPlayerBullet = (() => {
    class GenericPlayerBullet extends PlayerBulletBase {
        constructor(x, y, vx, vy, opts = {}) {
            super(x, y, { damage: opts.damage || 1.5, piercing: opts.piercing || false });
            this.vx    = vx;
            this.vy    = vy;
            this.color = opts.color || '#7ef';
            this.core  = opts.core  || '#fff';
            this.r     = opts.r || opts.radius || 4;
        }
        update(dt) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            if (this.isOffscreen()) this.alive = false;
        }
        draw(ctx) {
            const ang = Math.atan2(this.vy, this.vx);
            const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            const len = this.r * 2.4 + spd * 0.45;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(ang + Math.PI / 2);
            ctx.shadowColor = this.color; ctx.shadowBlur = 7;
            const g = ctx.createLinearGradient(0, -len * 0.5, 0, len * 0.5);
            g.addColorStop(0,   'rgba(0,0,0,0)');
            g.addColorStop(0.3, this.color);
            g.addColorStop(0.5, this.core);
            g.addColorStop(0.7, this.color);
            g.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(0, 0, this.r * 0.44, len * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        }
        getBounds() { return { x: this.x - this.r * 0.5, y: this.y - 10, w: this.r, h: 20 }; }
    }
    return GenericPlayerBullet;
})();
