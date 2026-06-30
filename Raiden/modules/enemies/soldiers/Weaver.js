var Weaver = (() => {
    class Weaver extends EnemyBase {
        constructor(x, y, opts = {}) {
            super({ x, y, hp: 6, score: 190, type: 'weaver', dropChance: 0.18,
                    dropTable: ['power', 'health', 'ice_w'], w: 28, h: 22 });
            this.baseX     = x;
            this.vy        = (opts.speed || 2.4) + Math.random() * 0.6;
            this.weaveAmp  = 60 + Math.random() * 40;
            this.weaveFreq = 0.025 + Math.random() * 0.012;
            this.phase     = Math.random() * Math.PI * 2;
            this.t         = 0;
            this.shootT    = 40 + Math.random() * 50;
            this.canShoot  = Math.random() < 0.7;
            this.bank      = 0;
            this.flap      = Math.random() * Math.PI * 2;
        }

        update(dt, _fc) {
            this.t += dt;
            this.flap += 0.22 * dt;
            const prevX = this.x;
            this.x = this.baseX + Math.sin(this.t * this.weaveFreq + this.phase) * this.weaveAmp;
            this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2, this.x));
            this.y += this.vy * dt;
            // 机体侧倾随横向速度
            const vx = (this.x - prevX) / Math.max(0.001, dt);
            this.bank += (Math.max(-1, Math.min(1, vx / 3)) - this.bank) * Math.min(1, 0.2 * dt);

            this.checkEntered();
            if (this.isOffscreen()) { this.alive = false; return null; }

            if (this.canShoot && this.enteredScreen && this.y < Renderer.H - 80) {
                this.shootT -= dt;
                if (this.shootT <= 0) {
                    this.shootT = 95 + Math.random() * 50;
                    const p = Player.getPos();
                    // 蛇形瞄准弹：并排 3 发正弦逼近，逼出"看波形找缝"的躲法
                    return BulletPatterns.snake(this.x, this.y + 8, p.x, p.y, 3.2, 3,
                        { bulletOpts: { type: 'shard', radius: 4, color: '#5ad7c0', waveAmp: 30, waveFreq: 0.16 } });
                }
            }
            return null;
        }

        draw(ctx, dt, fc) {
            const f = fc || 0;
            ctx.save(); ctx.translate(this.x, this.y);
            ctx.rotate(Math.max(-0.3, Math.min(0.3, this.bank)) * 0.5);
            const flash = this._applyFlash(ctx, dt);
            const wing = 1 + Math.sin(this.flap) * 0.18;   // 振翅

            if (!flash) {
                // 尾迹微光
                ctx.shadowColor = '#3fd8c0'; ctx.shadowBlur = 8;
            }

            // ── Manta 翼体 ───────────────────────────────────────────────
            const bg = ctx.createLinearGradient(0, -8, 0, 12);
            if (flash) { bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#fff'); }
            else { bg.addColorStop(0, '#7ff0dd'); bg.addColorStop(0.5, '#22b0a0'); bg.addColorStop(1, '#0d5f58'); }
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.quadraticCurveTo(14 * wing, -4, 16 * wing, 6);   // 右翼
            ctx.quadraticCurveTo(8, 4, 0, 10);
            ctx.quadraticCurveTo(-8, 4, -16 * wing, 6);          // 左翼
            ctx.quadraticCurveTo(-14 * wing, -4, 0, -10);
            ctx.closePath(); ctx.fill();
            ctx.shadowBlur = 0;

            if (!flash) {
                ctx.strokeStyle = 'rgba(160,255,240,0.55)'; ctx.lineWidth = 1; ctx.stroke();
                // 翼脊纹
                ctx.strokeStyle = 'rgba(120,240,220,0.4)'; ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(-12 * wing, 2); ctx.lineTo(0, -6); ctx.lineTo(12 * wing, 2);
                ctx.stroke();
                // 核心
                ctx.fillStyle = '#bafff0';
                ctx.beginPath(); ctx.ellipse(0, -2, 2.4, 4, 0, 0, Math.PI * 2); ctx.fill();
                // 双尾须
                ctx.strokeStyle = 'rgba(90,215,192,0.6)'; ctx.lineWidth = 1;
                const tw = Math.sin(this.flap * 1.4) * 3;
                ctx.beginPath();
                ctx.moveTo(-3, 9); ctx.quadraticCurveTo(-4 + tw, 15, -2 + tw, 19);
                ctx.moveTo(3, 9);  ctx.quadraticCurveTo(4 + tw, 15, 2 + tw, 19);
                ctx.stroke();
                // 翼尖灯
                const blink = Math.sin(f * 0.2) > 0;
                ctx.fillStyle = blink ? 'rgba(180,255,240,0.9)' : 'rgba(180,255,240,0.25)';
                ctx.beginPath(); ctx.arc(-15 * wing, 6, 1.1, 0, Math.PI * 2);
                ctx.arc(15 * wing, 6, 1.1, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Weaver };
})();

EnemyRegistry.register({ label:'Weaver', scale:1.45, group:'SOLDIERS', mk:()=>new Weaver.Weaver(0,0) });
