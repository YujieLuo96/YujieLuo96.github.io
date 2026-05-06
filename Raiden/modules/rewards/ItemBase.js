var ItemBase = (() => {
    const MAGNET_R   = 115;   // px — items accelerate toward player within this radius
    const MAX_SPEED  = 9;
    const GRAVITY    = 0.10;
    const TERMINAL_V = 2.4;

    class ItemBase {
        constructor(x, y, opts = {}) {
            this.x      = x;
            this.y      = y;
            this.kind   = opts.kind  || 'unknown';
            this.label  = opts.label || '?';
            this.color  = opts.color || '#fff';
            this.w      = 26; this.h = 26;
            this.alive  = true;
            this.bobOff = Math.random() * Math.PI * 2;
            this.pulse  = 0;
            // Physics
            this.vx     = (Math.random() - 0.5) * 2.2;
            this.vy     = -2.2 - Math.random() * 1.6;
            // Spawn pop animation
            this._age   = 0;
            this._scale = 0;
            // Parse glow RGB from opts string for clean rendering
            const m = (opts.glow || 'rgba(255,255,255,0.4)')
                .match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            this._gr = m ? [+m[1], +m[2], +m[3]] : [255, 255, 255];
        }

        update(dt) {
            // Spawn scale animation: pop from 0→1 in ~8 frames
            this._age  += dt;
            this._scale = this._age < 8 ? this._age / 8 : 1;

            // Gravity
            this.vy = Math.min(this.vy + GRAVITY * dt, TERMINAL_V);
            // Horizontal drag
            this.vx *= Math.pow(0.978, dt);

            // Magnet: accelerate toward player when nearby
            try {
                const p = Player.getPos();
                const dx = p.x - this.x, dy = p.y - this.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < MAGNET_R * MAGNET_R && d2 > 1) {
                    const d = Math.sqrt(d2);
                    const pull = ((MAGNET_R - d) / MAGNET_R) * 5.8;
                    this.vx += (dx / d) * pull * dt;
                    this.vy += (dy / d) * pull * dt;
                }
            } catch (_e) {}

            // Cap speed
            const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (spd > MAX_SPEED) {
                this.vx = (this.vx / spd) * MAX_SPEED;
                this.vy = (this.vy / spd) * MAX_SPEED;
            }

            this.x     += this.vx * dt;
            this.y     += this.vy * dt;
            this.pulse += 0.07 * dt;

            const W = Renderer.W, H = Renderer.H;
            if (this.y > H + 50 || this.x < -60 || this.x > W + 60) this.alive = false;
        }

        collect() {
            this.alive = false;
            EventBus.emit('item:' + this.kind, this);
            const [r, g, b] = this._gr;
            ParticleSystem.spawn(this.x, this.y, {
                count: 16,
                colors: [`rgb(${r},${g},${b})`, '#fff', `rgb(${r},${g},${b})`],
                speed: 4.5, life: 26, size: 3.5
            });
        }

        getBounds() {
            return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
        }

        // Subclasses override this to draw a custom icon.
        // ctx is already translated to (0,0) and scaled; draw within ±11px.
        _drawIcon(ctx, fc) {
            ctx.fillStyle    = '#fff';
            ctx.font         = 'bold 12px "Courier New",monospace';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.label, 0, 0);
        }

        draw(ctx, fc) {
            if (this._scale < 0.05) return;
            const bob = Math.sin(fc * 0.06 + this.bobOff) * 3.5;
            const dy  = this.y + bob;
            const pls = 0.52 + Math.sin(this.pulse) * 0.40;
            const sc  = this._scale;
            const [r, g, b] = this._gr;

            ctx.save();
            ctx.translate(this.x, dy);
            ctx.scale(sc, sc);

            // Outer glow (two-stop, pulsing)
            const gg = ctx.createRadialGradient(0, 0, 4, 0, 0, 24);
            gg.addColorStop(0,   `rgba(${r},${g},${b},${(pls * 0.55).toFixed(2)})`);
            gg.addColorStop(0.5, `rgba(${r},${g},${b},${(pls * 0.18).toFixed(2)})`);
            gg.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = gg;
            ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();

            // Box
            ctx.fillStyle   = this.color;
            ctx.strokeStyle = 'rgba(255,255,255,0.88)';
            ctx.lineWidth   = 1.8;
            ctx.beginPath(); ctx.roundRect(-13, -13, 26, 26, 6);
            ctx.fill(); ctx.stroke();

            // Icon
            this._drawIcon(ctx, fc);

            ctx.restore();
        }
    }
    return ItemBase;
})();
