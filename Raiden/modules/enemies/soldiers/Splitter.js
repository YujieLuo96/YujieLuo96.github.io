var Splitter = (() => {
    // ── 母体：稳速下压，偶发瞄准弹；殒命裂解为 3 枚俯冲碎体 ───────────────
    class Splitter extends EnemyBase {
        constructor(x, y, opts = {}) {
            super({ x, y, hp: 9, score: 280, type: 'splitter', dropChance: 0.35,
                    dropTable: ['power', 'bomb', 'spread_w'], w: 30, h: 30 });
            this.vy      = opts.speed || 1.9;
            this.vx      = opts.vx || (Math.random() - 0.5) * 0.6;
            this.shootT  = 70 + Math.random() * 60;
            this.spin    = 0;
            this._split  = false;
            this.crack   = 0;   // 受损裂纹强度（残血变亮）
        }

        // 殒命裂解：生成 3 枚俯冲碎体（仅一次）
        takeDamage(d) {
            const dead = super.takeDamage(d);
            if (dead && !this._split) {
                this._split = true;
                for (let i = 0; i < 3; i++) {
                    const a = Math.PI / 2 + (i - 1) * 0.55;   // 朝下扇形俯冲
                    EnemyManager.spawnKind('splitterling', 1, { x: this.x, y: this.y, angle: a });
                }
                ParticleSystem.spawn(this.x, this.y,
                    { count: 10, colors: ['#ffb070', '#ff7040', '#fff'], speed: 4, life: 18, size: 3, shape: 'spark' });
            }
            return dead;
        }

        update(dt, fc) {
            this.spin += 0.03 * dt;
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2, this.x));
            this.crack = this.hp / this.maxHp < 0.5 ? 1 : 0;

            this.checkEntered();
            if (this.isOffscreen()) { this.alive = false; return null; }

            if (this.enteredScreen && this.y < Renderer.H - 90) {
                this.shootT -= dt;
                if (this.shootT <= 0) {
                    this.shootT = 110 + Math.random() * 60;
                    const p = Player.getPos();
                    return BulletPatterns.aimed(this.x, this.y + 10, p.x, p.y, 4.4,
                        { count: 2, spread: 0.22, bulletOpts: { radius: 4, color: '#ffa050' } });
                }
            }
            return null;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            ctx.rotate(this.spin);

            // ── 多面晶核外壳（菱形分块，暗示可裂解） ─────────────────────
            const bg = ctx.createLinearGradient(0, -15, 0, 15);
            if (flash) { bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#fff'); }
            else { bg.addColorStop(0, '#ffcf8c'); bg.addColorStop(0.5, '#cc7a2e'); bg.addColorStop(1, '#7a3f12'); }
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.moveTo(0, -15); ctx.lineTo(13, -5); ctx.lineTo(10, 11);
            ctx.lineTo(0, 15);  ctx.lineTo(-10, 11); ctx.lineTo(-13, -5);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(255,210,150,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
                // 三段裂分缝（120° 分布）
                ctx.strokeStyle = this.crack ? 'rgba(255,180,80,0.95)' : 'rgba(120,70,30,0.7)';
                ctx.lineWidth = this.crack ? 1.4 : 1;
                if (this.crack) { ctx.shadowColor = '#ffb030'; ctx.shadowBlur = 6; }
                for (let i = 0; i < 3; i++) {
                    const a = i * Math.PI * 2 / 3 - Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
                    ctx.stroke();
                }
                ctx.shadowBlur = 0;
                // 核
                ctx.fillStyle = this.crack ? '#fff0d0' : '#ffd9a0';
                ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    // ── 碎体：高速俯冲、低血、撞击威胁（不开火） ───────────────────────────
    class Splitterling extends EnemyBase {
        constructor(x, y, opts = {}) {
            super({ x, y, hp: 2, score: 60, type: 'splitterling', dropChance: 0.05,
                    dropTable: ['power'], w: 14, h: 14 });
            const a = opts.angle !== undefined ? opts.angle : Math.PI / 2;
            const spd = 3.2 + Math.random() * 1.2;
            this.vx = Math.cos(a) * spd;
            this.vy = Math.sin(a) * spd;
            this.spin = Math.random() * Math.PI * 2;
            this.age = 0;
        }
        update(dt, _fc) {
            this.age += dt;
            this.spin += 0.25 * dt;
            // 略微加速并朝下收束（俯冲感）
            this.vy += 0.04 * dt;
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.checkEntered();
            if (this.isOffscreen()) { this.alive = false; return null; }
            if (this.age % 3 < 1)
                ParticleSystem.spawn(this.x, this.y,
                    { count: 1, colors: ['#ffb070', '#ff7040'], speed: 0.6, life: 10, size: 1.5 });
            return null;
        }
        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.spin);
            const flash = this._applyFlash(ctx, dt);
            ctx.shadowColor = '#ff8030'; ctx.shadowBlur = flash ? 0 : 6;
            ctx.fillStyle = flash ? '#fff' : '#ff9a40';
            ctx.beginPath();
            ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0);
            ctx.closePath(); ctx.fill();
            ctx.shadowBlur = 0;
            if (!flash) {
                ctx.fillStyle = '#ffe0b0';
                ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Splitter, Splitterling };
})();

EnemyRegistry.register({ label:'Splitter', scale:1.30, group:'SOLDIERS', mk:()=>new Splitter.Splitter(0,0) });
