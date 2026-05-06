var Gunship = (() => {
    class Gunship extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 6, score: 130, type: 'gunship',
                    dropChance: 0.22, dropTable: ['power', 'bomb', 'health'], w: 46, h: 40 });
            this.speed        = 1.0 + Math.random() * 0.5;
            this.targetY      = 110 + Math.random() * 130;
            this.phase        = 'entry';
            this.haltTimer    = 0;
            this.haltMax      = 110 + Math.random() * 60;
            this.burstCount   = 0;
            this.burstMax     = 3;
            this.burstTimer   = 0;
            this.burstPause   = false;
            this.pauseTimer   = 0;
            this.driftAngle   = Math.random() * Math.PI * 2;
        }

        update(dt, fc) {
            switch (this.phase) {
                case 'entry':
                    this.y += this.speed * 1.6 * dt;
                    if (this.y >= this.targetY) { this.y = this.targetY; this.phase = 'halt'; }
                    break;

                case 'halt':
                    this.driftAngle += 0.016 * dt;
                    this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2,
                        this.x + Math.sin(this.driftAngle) * 1.1 * dt));
                    this.haltTimer += dt;

                    if (!this.burstPause) {
                        this.burstTimer += dt;
                        if (this.burstTimer >= 12) {
                            this.burstTimer = 0;
                            this.burstCount++;
                            const p = Player.getPos();
                            const shots = BulletPatterns.aimed(this.x, this.y + 20,
                                p.x, p.y, 5.5, { count: 3, spread: 0.32 });
                            if (this.burstCount >= this.burstMax) {
                                this.burstCount = 0;
                                this.burstPause = true;
                                this.pauseTimer = 38;
                            }
                            if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                            return shots;
                        }
                    } else {
                        this.pauseTimer -= dt;
                        if (this.pauseTimer <= 0) this.burstPause = false;
                    }
                    if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                    break;

                case 'exit':
                    this.y += this.speed * 1.8 * dt;
                    break;
            }
            this.checkEntered();
            if (this.isOffscreen()) { this.alive = false; }
            return null;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const firing = this.phase === 'halt' && !this.burstPause && this.burstTimer < 4;

            if (!flash) {
                // Three engine exhausts
                ctx.shadowColor = '#4ca'; ctx.shadowBlur = 12;
                [-12, 0, 12].forEach(ox => {
                    const eg = ctx.createRadialGradient(ox, 19, 0, ox, 19, 6);
                    eg.addColorStop(0, 'rgba(80,230,180,0.9)');
                    eg.addColorStop(0.5, 'rgba(20,160,120,0.5)');
                    eg.addColorStop(1, 'rgba(0,80,80,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.ellipse(ox, 19, 3, 6, 0, 0, Math.PI * 2); ctx.fill();
                });
                ctx.shadowBlur = 0;
            }

            // Wide armored hull
            const hg = ctx.createLinearGradient(0, -20, 0, 20);
            hg.addColorStop(0,   flash ? '#fff' : '#55aaaa');
            hg.addColorStop(0.4, flash ? '#fff' : '#337788');
            hg.addColorStop(1,   flash ? '#fff' : '#1a4455');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -20); ctx.lineTo(8, -16);  ctx.lineTo(20, -10);
            ctx.lineTo(24, 0);  ctx.lineTo(20, 10);  ctx.lineTo(14, 18);
            ctx.lineTo(6, 22);  ctx.lineTo(-6, 22);  ctx.lineTo(-14, 18);
            ctx.lineTo(-20, 10);ctx.lineTo(-24, 0);  ctx.lineTo(-20, -10);
            ctx.lineTo(-8, -16);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(100,210,210,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
                // Armor panel lines
                ctx.strokeStyle = 'rgba(70,185,185,0.32)'; ctx.lineWidth = 0.7;
                ctx.beginPath(); ctx.moveTo(-20,-4); ctx.lineTo(-8,-12); ctx.lineTo(8,-12); ctx.lineTo(20,-4); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-16,6); ctx.lineTo(-5,1); ctx.lineTo(5,1); ctx.lineTo(16,6); ctx.stroke();
                // Side armor flanges
                [-20, 20].forEach(ox => {
                    ctx.fillStyle = '#1a3344';
                    ctx.beginPath(); ctx.rect(ox - 5, -7, 10, 12); ctx.fill();
                    ctx.strokeStyle = 'rgba(80,185,185,0.35)'; ctx.lineWidth = 0.6;
                    ctx.strokeRect(ox - 5, -7, 10, 12);
                });
                // Twin gun barrels
                const burstGlow = firing ? 0.9 : 0.25;
                [-10, 10].forEach(ox => {
                    ctx.fillStyle = '#0d2233';
                    ctx.beginPath(); ctx.rect(ox - 3, 6, 6, 14); ctx.fill();
                    ctx.strokeStyle = 'rgba(60,180,180,0.35)'; ctx.lineWidth = 0.5;
                    ctx.beginPath(); ctx.moveTo(ox, 8); ctx.lineTo(ox, 19); ctx.stroke();
                    ctx.shadowColor = '#4cf'; ctx.shadowBlur = firing ? 16 : 4;
                    ctx.fillStyle = `rgba(60,210,255,${burstGlow})`;
                    ctx.beginPath(); ctx.arc(ox, 20, 3.5, 0, Math.PI * 2); ctx.fill();
                    if (firing) {
                        ctx.globalAlpha = 0.5;
                        ctx.fillStyle = '#9ef';
                        ctx.beginPath(); ctx.arc(ox, 20, 7, 0, Math.PI * 2); ctx.fill();
                        ctx.globalAlpha = 1;
                    }
                    ctx.shadowBlur = 0;
                });
                // Power core
                const pulse = 0.5 + Math.sin((fc || 0) * 0.18) * 0.4;
                ctx.shadowColor = '#2ef'; ctx.shadowBlur = 10;
                const pcg = ctx.createRadialGradient(0, -5, 1, 0, -5, 8);
                pcg.addColorStop(0, `rgba(160,240,255,${0.65 + pulse * 0.28})`);
                pcg.addColorStop(0.55, 'rgba(40,165,200,0.45)');
                pcg.addColorStop(1, 'rgba(0,80,140,0.18)');
                ctx.fillStyle = pcg;
                ctx.beginPath(); ctx.arc(0, -5, 8, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                // Cockpit
                ctx.fillStyle = 'rgba(80,205,225,0.8)';
                ctx.beginPath(); ctx.ellipse(0, -8, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(200,248,255,0.85)';
                ctx.beginPath(); ctx.ellipse(-0.8, -9.5, 1.5, 2.5, -0.1, 0, Math.PI * 2); ctx.fill();
            }
            if (this.hp < this.maxHp) this.drawHpBar(ctx, 40, 26);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Gunship };
})();

EnemyRegistry.register({ label:'Gunship', scale:0.62, group:'SOLDIERS', mk:()=>new Gunship.Gunship(0,0) });
