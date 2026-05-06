var MidBoss = (() => {
    class MidBoss extends EnemyBase {
        constructor() {
            super({ x: Renderer.W / 2, y: -75, hp: 45, score: 800, type: 'midboss',
                    dropChance: 1.0, dropTable: ['power','bomb','health','spread_w','homing_w'], w: 72, h: 65 });
            this.entryY       = 120;
            this.entered      = false;
            this.phase        = 1;
            this.baseX        = Renderer.W / 2;
            this.shootInterval= 32;
            this.moveAngle    = 0;
        }
        update(dt, fc) {
            if (!this.entered) {
                this.y += 1.8 * dt;
                if (this.y >= this.entryY) { this.entered = true; this.y = this.entryY; }
                this.checkEntered();
                return null;
            }
            // Phase switch
            if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
                this.phase = 2;
                this.shootInterval = 20;
            }
            // Movement
            this.moveAngle += 0.012 * dt;
            this.baseX     += Math.sin(fc * 0.018) * 1.4 * dt;
            this.baseX      = Math.max(this.w / 2 + 10, Math.min(Renderer.W - this.w / 2 - 10, this.baseX));
            this.x          = this.baseX;

            this.shootTimer += dt;
            if (this.shootTimer >= this.shootInterval) {
                this.shootTimer = 0;
                return this._shoot(fc);
            }
            return null;
        }
        _shoot(fc) {
            const p = Player.getPos();
            const bullets = [];
            if (this.phase === 1) {
                bullets.push(...BulletPatterns.aimed(this.x, this.y + 32, p.x, p.y, 6, { count: 3, spread: 0.4 }));
                if (fc % 40 < 1)
                    bullets.push(...BulletPatterns.ring(this.x, this.y, 16, 4, fc * 0.04));
            } else {
                bullets.push(...BulletPatterns.aimed(this.x, this.y + 32, p.x, p.y, 7, { count: 5, spread: 0.55 }));
                bullets.push(...BulletPatterns.spiral(this.x, this.y, 4, 5, fc * 0.08));
            }
            return bullets;
        }
        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);

            const pulse = 0.5 + Math.sin(fc * 0.15) * 0.45;
            const ph2   = this.phase === 2;

            if (!flash) {
                // ── Engine exhausts at rear ────────────────────────────────
                [-16, 16].forEach(ox => {
                    const eg = ctx.createRadialGradient(ox, 34, 1, ox, 38, 18);
                    eg.addColorStop(0,   ph2 ? 'rgba(255,180,60,0.95)' : 'rgba(255,120,60,0.95)');
                    eg.addColorStop(0.3, ph2 ? 'rgba(255,100,20,0.5)'  : 'rgba(220,60,20,0.5)');
                    eg.addColorStop(1,   'rgba(0,0,0,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.arc(ox, 38, 18, 0, Math.PI * 2); ctx.fill();
                });
            }

            // ── Main hull ─────────────────────────────────────────────────
            const hg = ctx.createLinearGradient(0, -32, 0, 32);
            if (ph2) {
                hg.addColorStop(0,   '#ff7040');
                hg.addColorStop(0.4, '#cc3010');
                hg.addColorStop(1,   '#7a1000');
            } else {
                hg.addColorStop(0,   '#ff6060');
                hg.addColorStop(0.4, '#cc2020');
                hg.addColorStop(1,   '#660000');
            }
            ctx.fillStyle = flash ? '#fff' : hg;
            ctx.beginPath();
            ctx.moveTo(0,   -32); ctx.lineTo(14, -22); ctx.lineTo(30, -12);
            ctx.lineTo(36,    0); ctx.lineTo(32,  12); ctx.lineTo(26,  22);
            ctx.lineTo(12,   32); ctx.lineTo(-12, 32); ctx.lineTo(-26, 22);
            ctx.lineTo(-32,  12); ctx.lineTo(-36,  0); ctx.lineTo(-30,-12);
            ctx.lineTo(-14, -22);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                // Hull outline glow
                ctx.shadowColor = ph2 ? '#ff6020' : '#ff3030';
                ctx.shadowBlur  = 10;
                ctx.strokeStyle = ph2 ? 'rgba(255,140,60,0.9)' : 'rgba(255,100,100,0.9)';
                ctx.lineWidth   = 2;
                ctx.stroke();
                ctx.shadowBlur  = 0;

                // ── Hull armor panel chevron lines ────────────────────────
                ctx.strokeStyle = ph2 ? 'rgba(255,160,80,0.35)' : 'rgba(255,140,140,0.3)';
                ctx.lineWidth   = 1;
                [[-18, -4, 18], [-22, 8, 22], [-18, 20, 18]].forEach(([lx, ly, rx]) => {
                    ctx.beginPath();
                    ctx.moveTo(lx, ly); ctx.lineTo(0, ly - 6); ctx.lineTo(rx, ly);
                    ctx.stroke();
                });

                // ── Phase 2 energy cracks on hull ─────────────────────────
                if (ph2) {
                    ctx.strokeStyle = 'rgba(255,200,80,0.55)';
                    ctx.lineWidth   = 1;
                    ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 5;
                    ctx.beginPath();
                    ctx.moveTo(-10, -20); ctx.lineTo(-4, -10); ctx.lineTo(-12, -2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(8, 5); ctx.lineTo(16, 14); ctx.lineTo(10, 22);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }

                // ── Energy conduit lines from core to cannons ─────────────
                ctx.strokeStyle = ph2 ? 'rgba(255,160,40,0.45)' : 'rgba(255,80,80,0.4)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 3]);
                ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-20, 10); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo( 20, 10); ctx.stroke();
                ctx.setLineDash([]);

                // ── Twin forward cannons ──────────────────────────────────
                [-20, 20].forEach(ox => {
                    // Housing body
                    ctx.fillStyle = '#2a0000';
                    ctx.fillRect(ox - 5, 8, 10, 22);
                    // Housing highlight stripe
                    ctx.fillStyle = '#550000';
                    ctx.fillRect(ox - 2, 9, 4, 6);
                    // Muzzle port glow
                    const mg = ctx.createRadialGradient(ox, 30, 1, ox, 30, 8);
                    mg.addColorStop(0,   ph2 ? 'rgba(255,180,40,0.95)' : 'rgba(255,80,80,0.95)');
                    mg.addColorStop(0.5, ph2 ? 'rgba(200,80,0,0.5)'    : 'rgba(180,20,20,0.5)');
                    mg.addColorStop(1,   'rgba(0,0,0,0)');
                    ctx.shadowColor = ph2 ? '#ffaa20' : '#ff4040';
                    ctx.shadowBlur  = 8;
                    ctx.fillStyle   = mg;
                    ctx.beginPath(); ctx.arc(ox, 30, 8, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur  = 0;
                    // Dark muzzle dot
                    ctx.fillStyle = ph2 ? '#ff9000' : '#ff3030';
                    ctx.beginPath(); ctx.arc(ox, 30, 3.5, 0, Math.PI * 2); ctx.fill();
                });

                // ── Central pulsing reactor ───────────────────────────────
                const rg = ctx.createRadialGradient(0, -8, 1, 0, -8, 14);
                rg.addColorStop(0,    '#ffffff');
                rg.addColorStop(0.25, ph2 ? `rgba(255,160,40,${0.7 + pulse * 0.3})`
                                           : `rgba(255,80,80,${0.7 + pulse * 0.3})`);
                rg.addColorStop(0.65, ph2 ? 'rgba(180,60,0,0.4)' : 'rgba(140,0,0,0.4)');
                rg.addColorStop(1,    'rgba(0,0,0,0)');
                ctx.shadowColor = ph2 ? '#ff8020' : '#ff2020';
                ctx.shadowBlur  = 16;
                ctx.fillStyle   = '#1a0000';
                ctx.beginPath(); ctx.arc(0, -8, 12, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = rg;
                ctx.beginPath(); ctx.arc(0, -8, 14, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur  = 0;
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(0, -8, 3.5, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.lineWidth   = 2;
                ctx.stroke();
            }

            this.drawHpBar(ctx, 62, -46);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }
    return { MidBoss };
})();

EnemyRegistry.register({ label:'MidBoss', scale:0.50, group:'MID-BOSSES', mk:()=>new MidBoss.MidBoss() });
