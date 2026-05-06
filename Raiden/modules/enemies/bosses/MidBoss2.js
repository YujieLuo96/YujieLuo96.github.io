var MidBoss2 = (() => {
    class MidBoss2 extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 60, score: 1200, type: 'midboss2',
                    dropChance: 1.0, dropTable: ['bomb', 'health', 'shield', 'satellite_w'],
                    w: 52, h: 48 });
            this.phase      = 'entry';
            this.entryY     = 160;
            this.t          = 0;
            this.armAngle   = 0;
            this.shotTimer  = 0;
            this.shotInt    = 22;
            this.burstTimer = 0;
            this.burstInt   = 55;
            this.phaseStage = 1;
            this.summonTimer = 0;
            this.summonInt  = 180;
        }

        update(dt, fc) {
            switch (this.phase) {
                case 'entry':
                    this.y += 1.4 * dt;
                    if (this.y >= this.entryY) { this.y = this.entryY; this.phase = 'fight'; }
                    break;

                case 'fight': {
                    this.t += dt;
                    this.armAngle += 0.022 * dt;

                    // Figure-8 movement
                    this.x = Renderer.W / 2 + Math.sin(this.t * 0.018) * 130;
                    this.y = this.entryY + Math.sin(this.t * 0.036) * 45;

                    if (this.phaseStage === 1 && this.hp <= this.maxHp * 0.5) {
                        this.phaseStage = 2;
                        this.shotInt  = 14;
                        this.burstInt = 38;
                        this.summonInt = 120;
                    }

                    const bullets = [];

                    this.shotTimer += dt;
                    if (this.shotTimer >= this.shotInt) {
                        this.shotTimer = 0;
                        const p = Player.getPos();
                        const cnt = this.phaseStage === 2 ? 3 : 2;
                        const shots = BulletPatterns.aimed(this.x, this.y + 24, p.x, p.y, 5.2, { count: cnt, spread: 0.2 });
                        if (shots) shots.forEach(s => bullets.push(s));
                    }

                    this.burstTimer += dt;
                    if (this.burstTimer >= this.burstInt) {
                        this.burstTimer = 0;
                        const cnt = this.phaseStage === 2 ? 12 : 8;
                        const ring = BulletPatterns.ring(this.x, this.y, cnt, 3.0);
                        if (ring) ring.forEach(s => bullets.push(s));
                    }

                    if (this.phaseStage === 2) {
                        this.summonTimer += dt;
                        if (this.summonTimer >= this.summonInt) {
                            this.summonTimer = 0;
                            EnemyManager.spawnKind('interceptor', 2, { fromLeft: true });
                            EnemyManager.spawnKind('interceptor', 2, { fromLeft: false });
                        }
                    }

                    if (bullets.length > 0) return bullets;
                    break;
                }
            }
            this.checkEntered();
            if (this.y > Renderer.H + 80) this.alive = false;
            return null;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const hp2   = this.phaseStage === 2;
            const pulse = 0.5 + Math.sin(this.t * 0.12) * 0.45;
            const ac    = hp2 ? '#f84' : '#48f';
            const acBright = hp2 ? '#ffaa40' : '#80ccff';
            const acDim    = hp2 ? 'rgba(220,100,20,0.35)' : 'rgba(40,120,240,0.35)';

            if (!flash) {
                // ── 4 rotating arms — each with TWO segments ──────────────
                for (let i = 0; i < 4; i++) {
                    ctx.save();
                    ctx.rotate(this.armAngle + i * Math.PI / 2);

                    // Thick inner segment (0 → -24)
                    ctx.shadowColor = acBright; ctx.shadowBlur = 8;
                    ctx.strokeStyle = ac; ctx.lineWidth = 4;
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -24); ctx.stroke();
                    ctx.shadowBlur = 0;

                    // Joint node at -24
                    const jg = ctx.createRadialGradient(0, -24, 1, 0, -24, 6);
                    jg.addColorStop(0, acBright);
                    jg.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = jg;
                    ctx.beginPath(); ctx.arc(0, -24, 6, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = acBright;
                    ctx.beginPath(); ctx.arc(0, -24, 2.5, 0, Math.PI * 2); ctx.fill();

                    // Thin outer segment (-24 → -38)
                    ctx.shadowColor = acBright; ctx.shadowBlur = 5;
                    ctx.strokeStyle = acBright; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, -38); ctx.stroke();
                    ctx.shadowBlur = 0;

                    // Tip glow node at -38
                    const tg = ctx.createRadialGradient(0, -38, 1, 0, -38, 8);
                    tg.addColorStop(0,   acBright);
                    tg.addColorStop(0.4, acDim.replace('0.35', String(0.4 + pulse * 0.4)));
                    tg.addColorStop(1,   'rgba(0,0,0,0)');
                    ctx.shadowColor = acBright; ctx.shadowBlur = 12;
                    ctx.fillStyle   = tg;
                    ctx.beginPath(); ctx.arc(0, -38, 8, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(0, -38, 3, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0;

                    ctx.restore();
                }

                // ── Spinning inner dashed ring ─────────────────────────────
                ctx.save();
                ctx.rotate(-this.armAngle * 2.5);
                ctx.strokeStyle = hp2 ? 'rgba(255,160,60,0.55)' : 'rgba(80,160,255,0.55)';
                ctx.lineWidth   = 1.5;
                ctx.setLineDash([5, 4]);
                ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }

            // ── Hexagonal hull (r=24) ──────────────────────────────────────
            const hg = ctx.createLinearGradient(0, -24, 0, 24);
            if (hp2) {
                hg.addColorStop(0,   '#cc5020');
                hg.addColorStop(0.5, '#8a2800');
                hg.addColorStop(1,   '#3a1000');
            } else {
                hg.addColorStop(0,   '#2060cc');
                hg.addColorStop(0.5, '#0a3080');
                hg.addColorStop(1,   '#051838');
            }
            ctx.fillStyle = flash ? '#fff' : hg;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i - Math.PI / 2;
                const px = Math.cos(a) * 24, py = Math.sin(a) * 24;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.shadowColor = acBright; ctx.shadowBlur = 8;
                ctx.strokeStyle = hp2 ? 'rgba(255,140,60,0.85)' : 'rgba(80,180,255,0.85)';
                ctx.lineWidth   = 2;
                ctx.stroke();
                ctx.shadowBlur  = 0;

                // ── 6 radial panel lines from center to hex edges ─────────
                ctx.strokeStyle = hp2 ? 'rgba(255,120,40,0.3)' : 'rgba(60,140,255,0.3)';
                ctx.lineWidth   = 1;
                for (let i = 0; i < 6; i++) {
                    const a = (Math.PI / 3) * i - Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 24, Math.sin(a) * 24);
                    ctx.stroke();
                }

                // ── Central reactor: outer glow ring ──────────────────────
                ctx.strokeStyle = hp2 ? `rgba(255,120,40,${0.3 + pulse * 0.4})` : `rgba(60,140,255,${0.3 + pulse * 0.4})`;
                ctx.lineWidth   = 2;
                ctx.shadowColor = acBright; ctx.shadowBlur = 10;
                ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
                ctx.shadowBlur  = 0;

                // Reactor fill
                const cg = ctx.createRadialGradient(0, 0, 1, 0, 0, 9);
                cg.addColorStop(0,   '#ffffff');
                cg.addColorStop(0.3, hp2 ? `rgba(255,160,60,${0.7 + pulse * 0.3})` : `rgba(80,180,255,${0.7 + pulse * 0.3})`);
                cg.addColorStop(0.7, hp2 ? 'rgba(180,60,0,0.5)' : 'rgba(20,80,200,0.5)');
                cg.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = '#0a0a1a';
                ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
                ctx.shadowColor = acBright; ctx.shadowBlur = 14;
                ctx.fillStyle   = cg;
                ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur  = 0;
                ctx.fillStyle   = '#fff';
                ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
            }

            this.drawHpBar(ctx, 56, 34);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { MidBoss2 };
})();

EnemyRegistry.register({ label:'MidBoss II', scale:0.50, group:'MID-BOSSES', mk:()=>new MidBoss2.MidBoss2(0,0) });
