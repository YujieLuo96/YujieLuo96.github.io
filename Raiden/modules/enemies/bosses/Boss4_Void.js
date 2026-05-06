var Boss4_Void = (() => {
    const PHASES = [
        { ratio: 1.0, name: 'ring' },
        { ratio: 0.8, name: 'spiral' },
        { ratio: 0.6, name: 'dash' },
        { ratio: 0.35, name: 'summon' },
        { ratio: 0.15, name: 'enrage' },
    ];

    class Boss4_Void extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 280, score: 15000, type: 'boss4',
                    dropChance: 1.0, dropTable: ['bomb', 'health', 'shield', 'satellite_w', 'ice_w'],
                    w: 70, h: 64 });
            this.entryY      = 140;
            this.entry       = true;
            this.phase       = 'ring';
            this.phaseIdx    = 0;
            this.t           = 0;
            this.segAngle    = 0;
            this.nodeAngle   = 0;

            this.ringTimer   = 0;  this.ringInt   = 50;
            this.spiralTimer = 0;  this.spiralAngle = 0;
            this.dashTimer   = 0;  this.dashInt   = 80;
            this.dashing     = false; this.dashVx = 0; this.dashVy = 0; this.dashFrames = 0;
            this.summonTimer = 0;  this.summonInt = 140;
            this.aimedTimer  = 0;  this.aimedInt  = 18;
            this.enrageRingTimer = 0; this.enrageRingInt = 20;

            this.baseX = x;
        }

        _checkPhase() {
            const ratio = this.hp / this.maxHp;
            for (let i = PHASES.length - 1; i >= 0; i--) {
                if (ratio <= PHASES[i].ratio) {
                    if (this.phase !== PHASES[i].name) {
                        this.phase = PHASES[i].name;
                        this.phaseIdx = i;
                        this.ringTimer = this.spiralTimer = this.dashTimer =
                        this.summonTimer = this.aimedTimer = this.enrageRingTimer = 0;
                    }
                    return;
                }
            }
        }

        update(dt, fc) {
            if (this.entry) {
                this.y += 1.0 * dt;
                if (this.y >= this.entryY) { this.y = this.entryY; this.entry = false; this.baseX = this.x; }
                this.checkEntered();
                return null;
            }

            this._checkPhase();
            this.t += dt;
            this.segAngle  += 0.012 * dt;
            this.nodeAngle += 0.028 * dt;

            const bullets = [];
            const cx = this.x, cy = this.y;

            switch (this.phase) {
                case 'ring': {
                    this.x = this.baseX + Math.sin(this.t * 0.012) * 80;
                    this.ringTimer += dt;
                    if (this.ringTimer >= this.ringInt) {
                        this.ringTimer = 0;
                        BulletPatterns.ring(cx, cy, 10, 3.0).forEach(b => bullets.push(b));
                    }
                    break;
                }

                case 'spiral': {
                    this.x = this.baseX + Math.sin(this.t * 0.015) * 100;
                    this.ringTimer += dt;
                    if (this.ringTimer >= 55) {
                        this.ringTimer = 0;
                        BulletPatterns.ring(cx, cy, 12, 3.2).forEach(b => bullets.push(b));
                    }
                    this.spiralTimer += dt;
                    if (this.spiralTimer >= 8) {
                        this.spiralTimer = 0;
                        this.spiralAngle += 0.28;
                        BulletPatterns.spiral(cx, cy, 3, 4.0, this.spiralAngle).forEach(b => bullets.push(b));
                    }
                    this.aimedTimer += dt;
                    if (this.aimedTimer >= this.aimedInt) {
                        this.aimedTimer = 0;
                        const p = Player.getPos();
                        BulletPatterns.aimed(cx, cy + 32, p.x, p.y, 5.0, { count: 2, spread: 0.18 }).forEach(b => bullets.push(b));
                    }
                    break;
                }

                case 'dash': {
                    if (this.dashing) {
                        this.x += this.dashVx * dt;
                        this.y += this.dashVy * dt;
                        this.dashFrames -= dt;
                        if (this.dashFrames <= 0) {
                            this.dashing = false;
                            this.y = this.entryY;
                            BulletPatterns.ring(this.x, this.y, 16, 3.5).forEach(b => bullets.push(b));
                        }
                    } else {
                        this.x = this.baseX + Math.sin(this.t * 0.02) * 90;
                        this.dashTimer += dt;
                        if (this.dashTimer >= this.dashInt) {
                            this.dashTimer = 0;
                            const p = Player.getPos();
                            const dx = p.x - this.x, dy = p.y - this.y;
                            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                            this.dashVx = (dx / dist) * 5.5;
                            this.dashVy = (dy / dist) * 5.5;
                            this.dashFrames = 28;
                            this.dashing = true;
                        }
                        this.spiralTimer += dt;
                        if (this.spiralTimer >= 10) {
                            this.spiralTimer = 0;
                            this.spiralAngle += 0.22;
                            BulletPatterns.spiral(cx, cy, 4, 3.8, this.spiralAngle).forEach(b => bullets.push(b));
                        }
                    }
                    break;
                }

                case 'summon': {
                    this.x = this.baseX + Math.sin(this.t * 0.018) * 70;
                    this.summonTimer += dt;
                    if (this.summonTimer >= this.summonInt) {
                        this.summonTimer = 0;
                        EnemyManager.spawnKind('drone', 4, { x: this.x, y: this.y });
                        EnemyManager.spawnKind('interceptor', 2, { fromLeft: Math.random() < 0.5 });
                    }
                    this.aimedTimer += dt;
                    if (this.aimedTimer >= 16) {
                        this.aimedTimer = 0;
                        const p = Player.getPos();
                        BulletPatterns.aimed(cx, cy + 32, p.x, p.y, 5.5, { count: 3, spread: 0.22 }).forEach(b => bullets.push(b));
                    }
                    this.ringTimer += dt;
                    if (this.ringTimer >= 45) {
                        this.ringTimer = 0;
                        BulletPatterns.ring(cx, cy, 14, 3.3).forEach(b => bullets.push(b));
                    }
                    break;
                }

                case 'enrage': {
                    this.x = this.baseX + Math.sin(this.t * 0.03) * 120;
                    this.y = this.entryY + Math.sin(this.t * 0.06) * 40;
                    this.enrageRingTimer += dt;
                    if (this.enrageRingTimer >= this.enrageRingInt) {
                        this.enrageRingTimer = 0;
                        BulletPatterns.ring(cx, cy, 18, 4.0).forEach(b => bullets.push(b));
                    }
                    this.spiralTimer += dt;
                    if (this.spiralTimer >= 5) {
                        this.spiralTimer = 0;
                        this.spiralAngle += 0.35;
                        BulletPatterns.spiral(cx, cy, 5, 5.0, this.spiralAngle).forEach(b => bullets.push(b));
                    }
                    this.aimedTimer += dt;
                    if (this.aimedTimer >= 10) {
                        this.aimedTimer = 0;
                        const p = Player.getPos();
                        BulletPatterns.aimed(cx, cy + 32, p.x, p.y, 6.0, { count: 4, spread: 0.25 }).forEach(b => bullets.push(b));
                    }
                    break;
                }
            }

            this.checkEntered();
            if (this.y > Renderer.H + 100) this.alive = false;
            return bullets.length > 0 ? bullets : null;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);

            const phaseColors = ['#8822cc', '#00aaff', '#ff5500', '#aaaaff', '#ffffff'];
            const pCol  = phaseColors[this.phaseIdx] || '#8822cc';
            const pulse = 0.5 + Math.sin(this.t * 0.14) * 0.45;

            if (!flash) {
                // ── Slow outer nebula halo ─────────────────────────────────
                const nebula = ctx.createRadialGradient(0, 0, 36, 0, 0, 80);
                nebula.addColorStop(0,   `rgba(${this.phaseIdx===1?'0,120,200':this.phaseIdx===2?'180,60,0':this.phaseIdx===3?'100,100,180':'100,20,160'},${0.08 + pulse * 0.06})`);
                nebula.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = nebula;
                ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2); ctx.fill();

                // ── Outer rotating ring segments with glow ─────────────────
                ctx.save();
                ctx.rotate(this.segAngle);
                for (let i = 0; i < 8; i++) {
                    ctx.save();
                    ctx.rotate(i * Math.PI / 4);
                    ctx.shadowColor = pCol; ctx.shadowBlur = 8;
                    ctx.strokeStyle = pCol; ctx.lineWidth = 3;
                    ctx.globalAlpha = 0.65;
                    ctx.beginPath(); ctx.arc(0, 0, 42, -0.28, 0.28); ctx.stroke();
                    ctx.shadowBlur  = 0;
                    ctx.restore();
                }
                ctx.restore();
                ctx.globalAlpha = 1;

                // ── 4 Energy nodes with layered design ─────────────────────
                ctx.save();
                ctx.rotate(-this.nodeAngle);
                for (let i = 0; i < 4; i++) {
                    const na = i * Math.PI / 2;
                    const nx = Math.cos(na) * 32;
                    const ny = Math.sin(na) * 32;

                    ctx.save();
                    ctx.rotate(na);

                    // Faint connecting line to center
                    ctx.strokeStyle = `rgba(${this.phaseIdx===1?'0,160,220':this.phaseIdx===2?'200,80,0':this.phaseIdx===3?'160,160,200':'120,30,180'},0.25)`;
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(32, 0); ctx.stroke();

                    // Outer dim halo
                    ctx.globalAlpha = 0.25;
                    const og = ctx.createRadialGradient(32, 0, 4, 32, 0, 14);
                    og.addColorStop(0, pCol); og.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = og;
                    ctx.beginPath(); ctx.arc(32, 0, 14, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1;

                    // Main orb with radialGradient
                    const mg = ctx.createRadialGradient(32, 0, 1, 32, 0, 7);
                    mg.addColorStop(0,   '#fff');
                    mg.addColorStop(0.4, pCol);
                    mg.addColorStop(1,   'rgba(0,0,0,0.7)');
                    ctx.shadowColor = pCol; ctx.shadowBlur = 10;
                    ctx.fillStyle   = mg;
                    ctx.beginPath(); ctx.arc(32, 0, 7, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur  = 0;

                    // Bright core dot
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(32, 0, 3, 0, Math.PI * 2); ctx.fill();

                    ctx.restore();
                }
                ctx.restore();
                ctx.globalAlpha = 1;
            }

            // ── Star-shaped body ───────────────────────────────────────────
            const sg = ctx.createRadialGradient(0, 0, 3, 0, 0, 30);
            sg.addColorStop(0,   '#fff');
            sg.addColorStop(0.3, flash ? '#fff' : pCol);
            sg.addColorStop(0.7, flash ? '#aaa' : `rgba(${this.phaseIdx===1?'0,60,120':this.phaseIdx===2?'100,30,0':this.phaseIdx===3?'60,60,100':'50,10,80'},0.9)`);
            sg.addColorStop(1,   flash ? '#888' : '#080808');
            ctx.fillStyle = sg;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
                const r = i % 2 === 0 ? 28 : 14;
                i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                        : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.shadowColor = pCol; ctx.shadowBlur = 8;
                ctx.strokeStyle = pCol; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.shadowBlur  = 0;

                // ── 4 diagonal inner lines from center (length=20) ─────────
                ctx.strokeStyle = `rgba(${this.phaseIdx===1?'0,160,220':this.phaseIdx===2?'200,80,0':this.phaseIdx===3?'160,160,200':'120,30,180'},0.45)`;
                ctx.lineWidth   = 1;
                for (let i = 0; i < 4; i++) {
                    const da = Math.PI / 4 + i * Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(-Math.cos(da)*20, -Math.sin(da)*20);
                    ctx.lineTo( Math.cos(da)*20,  Math.sin(da)*20);
                    ctx.stroke();
                }

                // ── Pulsing void center (dark circle on top) ───────────────
                ctx.fillStyle = `rgba(${this.phaseIdx===1?'0,20,40':this.phaseIdx===2?'30,8,0':this.phaseIdx===3?'20,20,40':'15,5,25'},0.88)`;
                ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();

                // Inner pCol overlay
                ctx.fillStyle = pCol;
                ctx.globalAlpha = 0.55 + pulse * 0.2;
                ctx.shadowColor = pCol; ctx.shadowBlur = 12;
                ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur  = 0; ctx.globalAlpha = 1;
                ctx.fillStyle   = '#fff';
                ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
            }

            this.drawHpBar(ctx, 68, 40);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Boss4_Void };
})();

EnemyRegistry.register({ label:'The Void', scale:0.22, group:'BOSSES', mk:()=>new Boss4_Void.Boss4_Void(0,0) });
