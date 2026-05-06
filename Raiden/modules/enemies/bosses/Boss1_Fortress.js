var Boss1_Fortress = (() => {
    class Turret {
        constructor(ox, oy) {
            this.ox = ox; this.oy = oy;
            this.hp = 22; this.maxHp = 22;
            this.alive = true;
            this.shootTimer = Math.random() * 50;
            this.flashTimer = 0;
        }
        takeDamage(d) { this.hp -= d; this.flashTimer = 5; if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; } return false; }
        getBounds(bx, by) { return { x: bx + this.ox - 12, y: by + this.oy - 12, w: 24, h: 24 }; }
    }

    class Boss1 extends EnemyBase {
        constructor() {
            super({ x: Renderer.W / 2, y: -100, hp: 120, score: 3000, type: 'boss1',
                    dropChance: 1.0,
                    dropTable: ['power','bomb','health','shield','spread_w','homing_w','laser_w','plasma_w'],
                    w: 120, h: 90 });
            this.entryY   = 110;
            this.entered  = false;
            this.phase    = 1;
            this.baseX    = Renderer.W / 2;
            this.turrets  = [
                new Turret(-44, -20), new Turret(44, -20),
                new Turret(-44, 20),  new Turret(44, 20)
            ];
            this.shootInterval = 28;
            this.rotAngle  = 0;
        }
        get aliveTurrets() { return this.turrets.filter(t => t.alive); }

        update(dt, fc) {
            if (!this.entered) {
                this.y += 1.4 * dt;
                if (this.y >= this.entryY) { this.entered = true; this.y = this.entryY; }
                this.checkEntered();
                return null;
            }
            // Phase transitions
            const ratio = this.hp / this.maxHp;
            if (ratio <= 0.66 && this.phase < 2) { this.phase = 2; this.shootInterval = 22; }
            if (ratio <= 0.33 && this.phase < 3) { this.phase = 3; this.shootInterval = 16; }

            this.rotAngle += 0.008 * dt;
            this.baseX    += Math.sin(fc * 0.016) * 1.3 * dt;
            this.baseX     = Math.max(this.w / 2 + 8, Math.min(Renderer.W - this.w / 2 - 8, this.baseX));
            this.x         = this.baseX;

            const bullets = [];
            this.shootTimer += dt;
            if (this.shootTimer >= this.shootInterval) {
                this.shootTimer = 0;
                bullets.push(...this._shoot(fc));
            }
            // Turret fire
            for (const t of this.turrets) {
                if (!t.alive) continue;
                t.flashTimer = Math.max(0, t.flashTimer - dt);
                t.shootTimer += dt;
                if (t.shootTimer >= 50 + this.phase * 10) {
                    t.shootTimer = 0;
                    const wx = this.x + t.ox, wy = this.y + t.oy;
                    const p  = Player.getPos();
                    bullets.push(...BulletPatterns.aimed(wx, wy, p.x, p.y, 5.5, { count: 2, spread: 0.25 }));
                }
            }
            return bullets.length ? bullets : null;
        }
        _shoot(fc) {
            const bullets = [];
            if (this.phase >= 1)
                bullets.push(...BulletPatterns.ring(this.x, this.y, 14, 4.5, fc * 0.03));
            if (this.phase >= 2) {
                const p = Player.getPos();
                bullets.push(...BulletPatterns.aimed(this.x, this.y + 45, p.x, p.y, 6, { count: 3, spread: 0.35 }));
            }
            if (this.phase >= 3) {
                bullets.push(...BulletPatterns.spiral(this.x, this.y, 6, 5.5, fc * 0.09));
            }
            return bullets;
        }
        // Also expose turret hit detection
        getTurrets() { return this.turrets; }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);

            const pulse    = 0.5 + Math.sin(fc * 0.15) * 0.45;
            const ph       = this.phase;
            const phCol    = ph === 3 ? '#ff5030' : ph === 2 ? '#ffcc40' : '#60a0ff';
            const phGlow   = ph === 3 ? '#ff4020' : ph === 2 ? '#ffaa00' : '#4080ff';
            const phDark   = ph === 3 ? '#400000' : ph === 2 ? '#3a2800' : '#001040';

            if (!flash) {
                // ── Outer rotating arc ring ────────────────────────────────
                ctx.save();
                ctx.rotate(this.rotAngle);
                ctx.shadowColor = phGlow; ctx.shadowBlur = 6;
                ctx.strokeStyle = `rgba(${ph===3?'255,80,40':ph===2?'255,180,30':'80,140,255'},0.55)`;
                ctx.lineWidth   = 3;
                for (let i = 0; i < 8; i++) {
                    ctx.save();
                    ctx.rotate(i * Math.PI / 4);
                    ctx.beginPath(); ctx.arc(0, 0, 68, -0.25, 0.25); ctx.stroke();
                    ctx.restore();
                }
                ctx.shadowBlur = 0;
                ctx.restore();

                // ── 3 bottom engine exhausts ───────────────────────────────
                [-24, 0, 24].forEach(ox => {
                    const eg = ctx.createRadialGradient(ox, 46, 1, ox, 52, 16);
                    eg.addColorStop(0,   `hsla(${ph===3?20:ph===2?40:220},100%,75%,0.9)`);
                    eg.addColorStop(0.4, `hsla(${ph===3?20:ph===2?40:220},100%,55%,0.4)`);
                    eg.addColorStop(1,   'rgba(0,0,0,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.arc(ox, 52, 16, 0, Math.PI * 2); ctx.fill();
                });
            }

            // ── Main hull ─────────────────────────────────────────────────
            const hg = ctx.createLinearGradient(0, -45, 0, 48);
            if (ph === 3) {
                hg.addColorStop(0,   '#664040'); hg.addColorStop(0.4, '#441818');
                hg.addColorStop(1,   '#220808');
            } else if (ph === 2) {
                hg.addColorStop(0,   '#665030'); hg.addColorStop(0.4, '#443010');
                hg.addColorStop(1,   '#221400');
            } else {
                hg.addColorStop(0,   '#384466'); hg.addColorStop(0.4, '#1e2844');
                hg.addColorStop(1,   '#0c1222');
            }
            ctx.fillStyle = flash ? '#fff' : hg;
            ctx.beginPath();
            ctx.moveTo(0,  -45); ctx.lineTo(22, -32); ctx.lineTo(52, -10);
            ctx.lineTo(56,  10); ctx.lineTo(46,  36); ctx.lineTo(24,  46);
            ctx.lineTo(-24, 46); ctx.lineTo(-46, 36); ctx.lineTo(-56, 10);
            ctx.lineTo(-56,-10); ctx.lineTo(-22,-32);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.shadowColor = phGlow; ctx.shadowBlur = 10;
                ctx.strokeStyle = ph===3 ? 'rgba(255,100,80,0.9)' : ph===2 ? 'rgba(255,190,40,0.85)' : 'rgba(100,150,255,0.85)';
                ctx.lineWidth   = 2.5; ctx.stroke();
                ctx.shadowBlur  = 0;

                // ── Hull armor chevron panel lines ─────────────────────────
                ctx.strokeStyle = ph===3 ? 'rgba(255,120,80,0.3)' : ph===2 ? 'rgba(255,180,40,0.25)' : 'rgba(100,160,255,0.25)';
                ctx.lineWidth = 1;
                [[-26,-8,26], [-32,6,32], [-28,22,28]].forEach(([lx,ly,rx]) => {
                    ctx.beginPath();
                    ctx.moveTo(lx, ly); ctx.lineTo(0, ly-8); ctx.lineTo(rx, ly);
                    ctx.stroke();
                });

                // ── Phase 3 energy cracks ──────────────────────────────────
                if (ph === 3) {
                    ctx.shadowColor = '#ffaa30'; ctx.shadowBlur = 6;
                    ctx.strokeStyle = 'rgba(255,200,60,0.6)'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(-18,-30); ctx.lineTo(-8,-18); ctx.lineTo(-20,-8); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(14,10); ctx.lineTo(24,22); ctx.lineTo(16,34); ctx.stroke();
                    ctx.shadowBlur = 0;
                }

                // ── Turrets ────────────────────────────────────────────────
                for (const t of this.turrets) {
                    const blink = t.flashTimer > 0 && Math.floor(t.flashTimer * 20) % 2 === 0;
                    // Target glow angle (toward center-bottom)
                    const tAngle = Math.atan2(40 - t.oy, 0 - t.ox);

                    ctx.save(); ctx.translate(t.ox, t.oy);

                    if (blink) {
                        ctx.fillStyle = '#fff';
                        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
                    } else if (t.alive) {
                        // Base ring
                        ctx.fillStyle = phDark;
                        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = phCol;
                        ctx.lineWidth = 1.5; ctx.shadowColor = phGlow; ctx.shadowBlur = 6;
                        ctx.stroke(); ctx.shadowBlur = 0;

                        // Inner body
                        ctx.fillStyle = '#1a1a2c';
                        ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();

                        // Barrel pointing toward player approach direction
                        ctx.save();
                        ctx.rotate(tAngle + Math.PI / 2);
                        ctx.fillStyle = '#334';
                        ctx.fillRect(-2, -12, 4, 7);
                        ctx.restore();

                        // Pulsing sensor dot
                        ctx.fillStyle = `rgba(${ph===3?'255,80,40':ph===2?'255,180,40':'80,180,255'},${0.5 + pulse * 0.45})`;
                        ctx.shadowColor = phGlow; ctx.shadowBlur = 8;
                        ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
                        ctx.shadowBlur = 0;
                    } else {
                        // Dead turret — scorched
                        ctx.fillStyle = '#221010';
                        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = 'rgba(80,40,40,0.5)';
                        ctx.lineWidth = 1.5; ctx.stroke();
                        ctx.fillStyle = '#333';
                        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.restore();
                }

                // ── Central reactor ────────────────────────────────────────
                const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, 24 + pulse * 6);
                rg.addColorStop(0,    '#ffffff');
                rg.addColorStop(0.2,  `${phCol}`);
                rg.addColorStop(0.55, ph===3 ? 'rgba(180,40,20,0.45)' : ph===2 ? 'rgba(160,100,0,0.45)' : 'rgba(20,60,180,0.45)');
                rg.addColorStop(1,    'rgba(0,0,0,0)');
                ctx.fillStyle = '#111';
                ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
                ctx.shadowColor = phGlow; ctx.shadowBlur = 20;
                ctx.fillStyle   = rg;
                ctx.beginPath(); ctx.arc(0, 0, 24 + pulse * 6, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur  = 0;
                ctx.fillStyle   = '#fff';
                ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.fill();
            }

            this.drawHpBar(ctx, 96, -60);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }
    return { Boss1 };
})();

EnemyRegistry.register({ label:'Fortress', scale:0.22, group:'BOSSES', mk:()=>new Boss1_Fortress.Boss1() });
