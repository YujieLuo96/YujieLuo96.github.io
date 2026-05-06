var EnemyBase = (() => {
    class EnemyBase {
        constructor(opts = {}) {
            this.x            = opts.x !== undefined ? opts.x : Renderer.W / 2;
            this.y            = opts.y !== undefined ? opts.y : -60;
            this.hp           = opts.hp   || 1;
            this.maxHp        = this.hp;
            this.score        = opts.score || 10;
            this.type         = opts.type  || 'enemy';
            this.alive        = true;
            this.flashTimer   = 0;
            this.shootTimer   = Math.random() * 60;
            this.enteredScreen= false;
            this.dropChance   = opts.dropChance || 0.06;
            this.dropTable    = opts.dropTable  || ['power','bomb','health','shield'];
            this.w            = opts.w || 30;
            this.h            = opts.h || 30;
        }

        takeDamage(dmg) {
            this.hp -= dmg;
            this.flashTimer = 5;
            if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; }
            return false;
        }

        getBounds() {
            const isBig = this.type === 'boss1' || this.type === 'boss2' ||
                          this.type === 'boss3' || this.type === 'midboss';
            const s = isBig ? 0.82 : 0.72;
            return {
                x: this.x - (this.w / 2) * s,
                y: this.y - (this.h / 2) * s,
                w: this.w * s,
                h: this.h * s
            };
        }

        checkEntered() {
            if (!this.enteredScreen && this.y > 0) this.enteredScreen = true;
        }

        isOffscreen() {
            return this.y > Renderer.H + 100 || this.y < -200 ||
                   this.x < -150 || this.x > Renderer.W + 150;
        }

        _applyFlash(ctx, dt) {
            this.flashTimer = Math.max(0, this.flashTimer - dt);
            return this.flashTimer > 0 && Math.floor(this.flashTimer * 20) % 2 === 0;
        }

        // Called inside ctx.translate(this.x, this.y) — use relative origin (0, yOff)
        drawHpBar(ctx, barW, yOff) {
            const ratio = Math.max(0, this.hp / this.maxHp);
            const bx = -barW / 2, by = yOff;
            ctx.fillStyle = '#222';
            ctx.fillRect(bx, by, barW, 5);
            const g = ctx.createLinearGradient(bx, 0, bx + barW, 0);
            g.addColorStop(0, '#f00'); g.addColorStop(0.5, '#ff0'); g.addColorStop(1, '#0f0');
            ctx.fillStyle = g;
            ctx.fillRect(bx, by, barW * ratio, 5);
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(bx, by, barW, 5);
        }
    }
    return EnemyBase;
})();
