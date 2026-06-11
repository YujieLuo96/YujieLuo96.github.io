var Carrier = (() => {
    class Carrier extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 18, score: 600, type: 'carrier',
                    dropChance: 0.55, dropTable: ['power', 'bomb', 'health', 'shield', 'satellite_w'],
                    w: 58, h: 48 });
            this.speed       = 0.7 + Math.random() * 0.3;
            this.targetY     = 100 + Math.random() * 80;
            this.phase       = 'entry';
            this.haltTimer   = 0;
            this.haltMax     = 320 + Math.random() * 120;
            this.driftAngle  = Math.random() * Math.PI * 2;
            this.launchTimer = 0;
            this.launchInt   = 100;
            this.shotTimer   = 0;
            this.shotInt     = 38;
            this.bayGlow     = 0;
            this.smokeTimer  = 0;
        }

        update(dt, fc) {
            const out = [];
            switch (this.phase) {
                case 'entry':
                    this.y += this.speed * 1.3 * dt;
                    if (this.y >= this.targetY) { this.y = this.targetY; this.phase = 'hover'; }
                    break;

                case 'hover': {
                    this.haltTimer += dt;
                    this.driftAngle += 0.01 * dt;
                    this.x = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2,
                        this.x + Math.sin(this.driftAngle) * 0.9 * dt));
                    if (this.bayGlow > 0) this.bayGlow -= dt;

                    // Fan shot (with muzzle flash)
                    this.shotTimer += dt;
                    if (this.shotTimer >= this.shotInt) {
                        this.shotTimer = 0;
                        ParticleSystem.spawn(this.x, this.y + 24, {
                            count: 5, angle: Math.PI / 2, spread: 1.0, speed: 2.4,
                            size: 2, life: 12, colors: ['#ffd080', '#ff9040'], shape: 'spark'
                        });
                        BulletPatterns.fan(this.x, this.y + 24, 5, 3.2, Math.PI / 2, 0.9)
                            .forEach(b => out.push(b));
                    }

                    // Launch drones + slow bloom escort ring (签名技：放飞警戒弹)
                    this.launchTimer += dt;
                    if (this.launchTimer >= this.launchInt) {
                        this.launchTimer = 0;
                        this.bayGlow = 18;
                        EnemyManager.spawnKind('drone', 3, { x: this.x, y: this.y + 28 });
                        ParticleSystem.spawn(this.x, this.y + 28, {
                            count: 6, angle: Math.PI / 2, spread: 1.6, speed: 1.8,
                            size: 2.2, life: 16, colors: ['#8f8', '#4f4'], shape: 'spark'
                        });
                        BulletPatterns.bloom(this.x, this.y + 28, 6, Math.random() * Math.PI * 2,
                            { speed: 0.8, bulletOpts: { color: '#6f6', radius: 4, maxSpeed: 3.4, life: 420 } })
                            .forEach(b => out.push(b));
                    }

                    if (this.haltTimer >= this.haltMax) this.phase = 'exit';
                    break;
                }

                case 'exit':
                    this.y += this.speed * 1.6 * dt;
                    break;
            }

            // Low-hp smoke (throttled)
            if (this.hp < this.maxHp * 0.4) {
                this.smokeTimer += dt;
                if (this.smokeTimer >= 8) {
                    this.smokeTimer = 0;
                    ParticleSystem.spawn(this.x + (Math.random() - 0.5) * 30, this.y - 8, {
                        count: 2, angle: -Math.PI / 2, spread: 0.7, speed: 0.7,
                        size: 3.4, life: 38, colors: ['#777', '#999', '#555'], drag: 0.985
                    });
                }
            }

            this.checkEntered();
            if (this.isOffscreen()) this.alive = false;
            return out.length ? out : null;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const f = fc || 0;

            if (!flash) {
                // Four engine exhausts (flickering)
                ctx.shadowColor = '#f84'; ctx.shadowBlur = 14;
                [[-18, 21], [-6, 24], [6, 24], [18, 21]].forEach(([ox, oy], i) => {
                    const fl = 1 + Math.sin(f * 0.5 + i * 1.7) * 0.18;
                    const eg = ctx.createRadialGradient(ox, oy, 0, ox, oy, 7 * fl);
                    eg.addColorStop(0, 'rgba(255,160,60,0.95)');
                    eg.addColorStop(0.5, 'rgba(220,80,20,0.55)');
                    eg.addColorStop(1, 'rgba(140,30,0,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.ellipse(ox, oy, 3, 7 * fl, 0, 0, Math.PI * 2); ctx.fill();
                });
                ctx.shadowBlur = 0;
            }

            // Main carrier hull — wide and imposing
            const hg = ctx.createLinearGradient(0, -24, 0, 24);
            hg.addColorStop(0,    flash ? '#fff' : '#aa9966');
            hg.addColorStop(0.35, flash ? '#fff' : '#887744');
            hg.addColorStop(0.7,  flash ? '#fff' : '#665533');
            hg.addColorStop(1,    flash ? '#fff' : '#4a3c22');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -24); ctx.lineTo(10, -18); ctx.lineTo(24, -10);
            ctx.lineTo(30, 0);  ctx.lineTo(26, 10);  ctx.lineTo(18, 18);
            ctx.lineTo(10, 24); ctx.lineTo(-10, 24); ctx.lineTo(-18, 18);
            ctx.lineTo(-26, 10);ctx.lineTo(-30, 0);  ctx.lineTo(-24, -10);
            ctx.lineTo(-10, -18);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(210,180,110,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
                // Hull armor plating
                ctx.strokeStyle = 'rgba(180,155,90,0.3)'; ctx.lineWidth = 0.7;
                ctx.beginPath(); ctx.moveTo(-26,-4); ctx.lineTo(-12,-14); ctx.lineTo(0,-16); ctx.lineTo(12,-14); ctx.lineTo(26,-4); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-22,6); ctx.lineTo(-8,0); ctx.lineTo(8,0); ctx.lineTo(22,6); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-18,16); ctx.lineTo(-6,11); ctx.lineTo(6,11); ctx.lineTo(18,16); ctx.stroke();

                // Side engine nacelles
                [-24, 24].forEach(ox => {
                    ctx.fillStyle = '#2a1e0a';
                    ctx.beginPath(); ctx.rect(ox - 6, -4, 12, 16); ctx.fill();
                    ctx.strokeStyle = 'rgba(160,125,60,0.38)'; ctx.lineWidth = 0.7;
                    ctx.strokeRect(ox - 6, -4, 12, 16);
                    ctx.fillStyle = 'rgba(200,100,20,0.45)';
                    ctx.beginPath(); ctx.rect(ox - 5, 8, 10, 3); ctx.fill();
                });

                // Blinking wing nav lights (port red / starboard green)
                const blink = Math.sin(f * 0.12);
                ctx.fillStyle = `rgba(255,60,60,${blink > 0 ? 0.85 : 0.18})`;
                ctx.beginPath(); ctx.arc(-29, 0, 1.6, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = `rgba(60,255,90,${blink <= 0 ? 0.85 : 0.18})`;
                ctx.beginPath(); ctx.arc(29, 0, 1.6, 0, Math.PI * 2); ctx.fill();

                // Drone bay (center bottom — animated)
                const bayAlpha = this.bayGlow > 0 ? Math.min(1, this.bayGlow / 10) : 0.18;
                ctx.fillStyle = `rgba(80,225,80,${bayAlpha * 0.5})`;
                ctx.fillRect(-18, 10, 36, 10);
                ctx.strokeStyle = `rgba(60,200,60,${bayAlpha + 0.15})`; ctx.lineWidth = 1;
                ctx.strokeRect(-18, 10, 36, 10);
                // Bay door dividers
                ctx.strokeStyle = `rgba(100,220,100,${bayAlpha + 0.1})`; ctx.lineWidth = 0.6;
                [-9, 0, 9].forEach(ox => { ctx.beginPath(); ctx.moveTo(ox, 10); ctx.lineTo(ox, 20); ctx.stroke(); });
                if (this.bayGlow > 8) {
                    ctx.shadowColor = '#4f4'; ctx.shadowBlur = 14;
                    ctx.fillStyle = `rgba(100,255,100,${(this.bayGlow - 8) / 10})`;
                    ctx.beginPath(); ctx.arc(0, 15, 7, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0;
                }

                // Fan-cannon telegraph: charge glow at the muzzle before firing
                if (this.phase === 'hover') {
                    const chg = this.shotTimer - (this.shotInt - 12);
                    if (chg > 0) {
                        const cr = 3 + (chg / 12) * 6;
                        const tg = ctx.createRadialGradient(0, 24, 0, 0, 24, cr);
                        tg.addColorStop(0, `rgba(255,220,140,${0.5 + (chg / 12) * 0.45})`);
                        tg.addColorStop(0.6, 'rgba(255,140,40,0.4)');
                        tg.addColorStop(1, 'rgba(255,90,0,0)');
                        ctx.fillStyle = tg;
                        ctx.beginPath(); ctx.arc(0, 24, cr, 0, Math.PI * 2); ctx.fill();
                    }
                }

                // Defense turrets (aim toward player)
                const p = this.phase === 'hover' ? Player.getPos() : { x: this.x, y: this.y + 200 };
                [-20, 20].forEach(ox => {
                    ctx.fillStyle = '#3a2e14';
                    ctx.beginPath(); ctx.arc(ox, -2, 4.5, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#6a5830';
                    ctx.beginPath(); ctx.arc(ox, -2, 2.8, 0, Math.PI * 2); ctx.fill();
                    ctx.save(); ctx.translate(ox, -2);
                    ctx.rotate(Math.atan2(p.y - this.y, p.x - (this.x + ox)));
                    ctx.fillStyle = '#221a06';
                    ctx.beginPath(); ctx.rect(-1.2, 0, 2.4, 7); ctx.fill();
                    ctx.restore();
                });

                // Bridge tower
                ctx.fillStyle = '#7a6840';
                ctx.beginPath(); ctx.rect(-8, -20, 16, 10); ctx.fill();
                ctx.strokeStyle = 'rgba(200,180,110,0.4)'; ctx.lineWidth = 0.8;
                ctx.strokeRect(-8, -20, 16, 10);
                // Bridge windows
                [[-5,-17],[-1,-17],[3,-17],[-5,-13],[-1,-13],[3,-13]].forEach(([wx,wy]) => {
                    ctx.fillStyle = 'rgba(255,245,180,0.8)';
                    ctx.fillRect(wx, wy, 2, 2);
                });
                // Rotating radar bar on the sensor mast
                ctx.strokeStyle = 'rgba(220,200,130,0.6)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(0,-24); ctx.lineTo(0,-28); ctx.stroke();
                ctx.save();
                ctx.translate(0, -28); ctx.rotate(f * 0.07);
                ctx.strokeStyle = 'rgba(230,215,150,0.75)'; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke();
                ctx.restore();
                ctx.shadowColor = '#ffe080'; ctx.shadowBlur = 6;
                ctx.fillStyle = `rgba(255,238,136,${0.55 + Math.sin(f * 0.2) * 0.4})`;
                ctx.beginPath(); ctx.arc(0, -28, 1.8, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }
            if (this.hp < this.maxHp) this.drawHpBar(ctx, 52, 30);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Carrier };
})();

EnemyRegistry.register({ label:'Carrier', scale:0.44, group:'SOLDIERS', mk:()=>new Carrier.Carrier(0,0) });
