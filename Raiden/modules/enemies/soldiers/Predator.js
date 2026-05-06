var Predator = (() => {
    class Predator extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 12, score: 400, type: 'predator',
                    dropChance: 0.45, dropTable: ['power', 'bomb', 'health', 'lightning_w', 'ice_w'],
                    w: 32, h: 36 });
            this.speed       = 1.2 + Math.random() * 0.4;
            this.targetY     = 80 + Math.random() * 120;
            this.phase       = 'entry';
            this.cloakTimer  = 0;
            this.cloakMax    = 80 + Math.random() * 40;  // visible duration
            this.hideMax     = 90 + Math.random() * 50;  // cloaked duration
            this.cloaked     = false;
            this.alpha       = 1;
            this.fireTimer   = 0;
            this.fireInterval = 28;
            this.haltTimer   = 0;
            this.haltMax     = 260 + Math.random() * 80;
            this.driftAngle  = Math.random() * Math.PI * 2;
        }

        update(dt, fc) {
            switch (this.phase) {
                case 'entry':
                    this.y += this.speed * 1.5 * dt;
                    if (this.y >= this.targetY) { this.y = this.targetY; this.phase = 'hunt'; }
                    break;

                case 'hunt': {
                    this.haltTimer += dt;
                    this.driftAngle += 0.014 * dt;
                    this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2,
                        this.x + Math.sin(this.driftAngle) * 1.4 * dt));

                    // Cloak cycle
                    this.cloakTimer += dt;
                    if (!this.cloaked) {
                        this.alpha = Math.min(1, this.alpha + 0.04 * dt);
                        if (this.cloakTimer >= this.cloakMax) {
                            this.cloaked = true; this.cloakTimer = 0;
                        }
                        // Fire burst while visible
                        this.fireTimer += dt;
                        if (this.fireTimer >= this.fireInterval) {
                            this.fireTimer = 0;
                            const p = Player.getPos();
                            const shots = BulletPatterns.aimed(this.x, this.y + 18,
                                p.x, p.y, 5.8, { count: 4, spread: 0.28 });
                            if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                            return shots;
                        }
                    } else {
                        this.alpha = Math.max(0.15, this.alpha - 0.05 * dt);
                        if (this.cloakTimer >= this.hideMax) {
                            this.cloaked = false; this.cloakTimer = 0;
                        }
                    }
                    if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                    break;
                }

                case 'exit':
                    this.alpha = Math.max(0, this.alpha - 0.03 * dt);
                    this.y += this.speed * 2.0 * dt;
                    break;
            }
            this.checkEntered();
            if (this.isOffscreen()) this.alive = false;
            return null;
        }

        draw(ctx, dt) {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);

            if (!flash && this.alpha > 0.3) {
                // Stealth exhaust — barely visible blue ion glow
                ctx.shadowColor = '#06f'; ctx.shadowBlur = 10;
                const eg = ctx.createRadialGradient(0, 17, 0, 0, 17, 9);
                eg.addColorStop(0, `rgba(60,140,255,${this.alpha * 0.7})`);
                eg.addColorStop(0.5, `rgba(20,80,200,${this.alpha * 0.35})`);
                eg.addColorStop(1, 'rgba(0,30,120,0)');
                ctx.fillStyle = eg;
                ctx.beginPath(); ctx.ellipse(0, 17, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Angular stealth hull with flat radar-absorbing facets
            const hg = ctx.createLinearGradient(0, -18, 0, 18);
            hg.addColorStop(0,    flash ? '#fff' : '#33ccff');
            hg.addColorStop(0.35, flash ? '#fff' : '#1188bb');
            hg.addColorStop(0.7,  flash ? '#fff' : '#005577');
            hg.addColorStop(1,    flash ? '#fff' : '#002233');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(4, -12); ctx.lineTo(8, -8); ctx.lineTo(14, -2);   // right facets
            ctx.lineTo(16, 4);  ctx.lineTo(12, 12); ctx.lineTo(8, 18);   // right rear
            ctx.lineTo(-8, 18); ctx.lineTo(-12, 12); ctx.lineTo(-16, 4); // rear
            ctx.lineTo(-14, -2);ctx.lineTo(-8, -8);  ctx.lineTo(-4, -12);// left facets
            ctx.closePath(); ctx.fill();

            if (!flash) {
                // Edge glow (brighter when partially cloaked — shimmer effect)
                const edgeA = this.alpha < 0.85 ? (1 - this.alpha) * 0.75 : 0.28;
                ctx.strokeStyle = `rgba(40,185,255,${edgeA})`; ctx.lineWidth = 1.5; ctx.stroke();
                // Facet panel lines
                ctx.strokeStyle = `rgba(30,165,220,${this.alpha * 0.3})`; ctx.lineWidth = 0.7;
                ctx.beginPath(); ctx.moveTo(-12,0); ctx.lineTo(-5,-8); ctx.lineTo(0,-10); ctx.lineTo(5,-8); ctx.lineTo(12,0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-10,8); ctx.lineTo(-4,2); ctx.lineTo(4,2); ctx.lineTo(10,8); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-8,16); ctx.lineTo(-3,12); ctx.lineTo(3,12); ctx.lineTo(8,16); ctx.stroke();
                // Nose sensor array
                ctx.strokeStyle = `rgba(60,205,255,${this.alpha * 0.7})`; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(-3,-16); ctx.lineTo(3,-16); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-1.5,-18); ctx.lineTo(1.5,-18); ctx.stroke();
                // Cockpit — narrow visor slit (red hint when cloaking)
                const vAlpha = this.cloaked ? 0.22 : 0.88;
                ctx.fillStyle = `rgba(${this.cloaked?'80,100':'100,225'},255,${vAlpha * this.alpha})`;
                ctx.beginPath(); ctx.rect(-3.5, -11, 7, 4); ctx.fill();
                ctx.fillStyle = `rgba(210,248,255,${0.75 * this.alpha})`;
                ctx.beginPath(); ctx.rect(-3, -11, 2.5, 2); ctx.fill();
                // Side weapon pods (only visible when uncloaked)
                if (!this.cloaked && this.alpha > 0.65) {
                    [-12, 12].forEach(ox => {
                        ctx.fillStyle = '#001122';
                        ctx.beginPath(); ctx.rect(ox - 2, 4, 4, 10); ctx.fill();
                        ctx.fillStyle = `rgba(0,185,255,${0.38 + Math.sin(this.fireTimer * 0.5) * 0.2})`;
                        ctx.beginPath(); ctx.arc(ox, 14, 2.5, 0, Math.PI * 2); ctx.fill();
                    });
                }
            }
            if (this.hp < this.maxHp) this.drawHpBar(ctx, 36, 24);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Predator };
})();

EnemyRegistry.register({ label:'Predator', scale:1.10, group:'SOLDIERS', mk:()=>new Predator.Predator(0,0) });
