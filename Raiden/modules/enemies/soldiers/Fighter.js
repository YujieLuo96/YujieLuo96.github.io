var Fighter = (() => {
    function muzzle(x, y, ang) {
        ParticleSystem.spawn(x, y, {
            count: 4, angle: ang, spread: 0.8, speed: 3.4,
            size: 2.2, life: 12, shape: 'spark',
            colors: ['#ffcc66', '#ff8833', '#ffffff'],
        });
    }

    class Fighter extends EnemyBase {
        constructor(x, y) {
            super({ x, y, hp: 3, score: 50, type: 'fighter', dropChance: 0.15,
                    dropTable: ['power','bomb','shield'], w: 36, h: 36 });
            this.speed        = 1.5 + Math.random() * 1.2;
            this.wobbleAmp    = 38 + Math.random() * 30;
            this.wobbleSpd    = 0.02 + Math.random() * 0.012;
            this.wobbleOff    = Math.random() * Math.PI * 2;
            this.baseX        = x;
            this.shootInterval= 100 + Math.random() * 35;
            // 交错双发齐射 + 收尾 shard 的序列状态
            this.volleyStep   = -1;   // -1 待机 / 1 等右翼齐射 / 2 等收尾 shard
            this.volleyTimer  = 0;
        }
        update(dt, fc) {
            this.y    += this.speed * dt;
            this.baseX += Math.sin(fc * this.wobbleSpd + this.wobbleOff) * 1.8 * dt;
            this.baseX  = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2, this.baseX));
            this.x      = this.baseX;
            this.checkEntered();
            if (this.isOffscreen()) { this.alive = false; return null; }

            // 低血量冒烟（节流：每 8 帧一次）
            if (this.hp / this.maxHp < 0.4 && ((fc | 0) % 8) === 0) {
                ParticleSystem.spawn(this.x + (Math.random() - 0.5) * 12, this.y + 2, {
                    count: 1, angle: -Math.PI / 2, spread: 0.5, speed: 0.7,
                    size: 3, life: 30, drag: 0.99, colors: ['#777', '#999', '#555'],
                });
            }

            if (this.enteredScreen && this.y < Renderer.H - 60) {
                if (this.volleyStep >= 0) {
                    // 齐射序列：左翼双发(0帧) → 右翼双发(9帧) → 中轴蛇行 shard 收尾(18帧)
                    this.volleyTimer += dt;
                    const p = Player.getPos();
                    if (this.volleyStep === 1 && this.volleyTimer >= 9) {
                        this.volleyStep = 2;
                        muzzle(this.x + 11, this.y + 12, Math.atan2(p.y - this.y, p.x - this.x));
                        return BulletPatterns.aimed(this.x + 11, this.y + 12, p.x, p.y, 4.8,
                            { count: 2, spread: 0.16 });
                    }
                    if (this.volleyStep === 2 && this.volleyTimer >= 18) {
                        this.volleyStep = -1;
                        muzzle(this.x, this.y + 18, Math.atan2(p.y - this.y, p.x - this.x));
                        return BulletPatterns.aimed(this.x, this.y + 18, p.x, p.y, 4.0,
                            { bulletOpts: { type: 'shard', radius: 4.5, color: '#fb6',
                                            waveAmp: 16, waveFreq: 0.12, life: 300 } });
                    }
                } else {
                    this.shootTimer += dt;
                    if (this.shootTimer >= this.shootInterval) {
                        this.shootTimer = 0;
                        this.volleyStep = 1; this.volleyTimer = 0;
                        const p = Player.getPos();
                        muzzle(this.x - 11, this.y + 12, Math.atan2(p.y - this.y, p.x - this.x));
                        return BulletPatterns.aimed(this.x - 11, this.y + 12, p.x, p.y, 4.8,
                            { count: 2, spread: 0.16 });
                    }
                }
            }
            return null;
        }
        draw(ctx, dt, fc) {
            const f = fc || 0;
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);

            if (!flash) {
                // Dual afterburner exhausts
                const flicker = 0.75 + Math.sin(f * 0.5 + this.wobbleOff) * 0.25;
                ctx.shadowColor = '#f80'; ctx.shadowBlur = 14;
                [-5, 5].forEach(ox => {
                    const eg = ctx.createRadialGradient(ox, 17, 0, ox, 17, 7 * flicker);
                    eg.addColorStop(0, 'rgba(255,220,80,0.95)');
                    eg.addColorStop(0.5, 'rgba(255,110,15,0.6)');
                    eg.addColorStop(1, 'rgba(200,40,0,0)');
                    ctx.fillStyle = eg;
                    ctx.beginPath(); ctx.ellipse(ox, 17, 3, 7 * flicker, 0, 0, Math.PI * 2); ctx.fill();
                });
                ctx.shadowBlur = 0;
            }

            // Wide swept-wing hull
            const hg = ctx.createLinearGradient(0, -18, 0, 18);
            hg.addColorStop(0,    flash ? '#fff' : '#ff8833');
            hg.addColorStop(0.4,  flash ? '#fff' : '#dd5500');
            hg.addColorStop(1,    flash ? '#fff' : '#883300');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(5, -10); ctx.lineTo(16, -4); ctx.lineTo(18, 4);  // right wing
            ctx.lineTo(12, 8);  ctx.lineTo(8, 14);  ctx.lineTo(5, 18);  // right rear
            ctx.lineTo(-5, 18); ctx.lineTo(-8, 14); ctx.lineTo(-12, 8); // rear
            ctx.lineTo(-18, 4); ctx.lineTo(-16, -4); ctx.lineTo(-5, -10); // left wing
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(255,175,100,0.5)'; ctx.lineWidth = 1; ctx.stroke();
                // Wing panel lines
                ctx.strokeStyle = 'rgba(255,140,60,0.4)'; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(-14, 1); ctx.lineTo(-5, -8); ctx.lineTo(0,-10); ctx.lineTo(5,-8); ctx.lineTo(14, 1); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-10, 9); ctx.lineTo(-4, 4); ctx.lineTo(4, 4); ctx.lineTo(10, 9); ctx.stroke();
                // Wing weapon hardpoints + 翼尖航灯交替闪烁
                const blink = Math.sin(f * 0.18);
                [-14, 14].forEach((ox, i) => {
                    ctx.fillStyle = '#331100';
                    ctx.beginPath(); ctx.rect(ox - 2, -2, 4, 9); ctx.fill();
                    ctx.fillStyle = '#f64';
                    ctx.beginPath(); ctx.arc(ox, 8, 2, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = `rgba(255,230,140,${(i === 0 ? blink : -blink) > 0 ? 0.9 : 0.15})`;
                    ctx.beginPath(); ctx.arc(ox + (i === 0 ? -2.6 : 2.6), 1.5, 1.1, 0, Math.PI * 2); ctx.fill();
                });
                // Cockpit（脉动微光）
                const cPulse = 0.85 + Math.sin(f * 0.12) * 0.15;
                const cg = ctx.createRadialGradient(0, -8, 1, 0, -8, 6);
                cg.addColorStop(0, `rgba(255,192,128,${cPulse})`); cg.addColorStop(1, 'rgba(200,100,20,0.35)');
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.ellipse(0, -8, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,230,180,0.9)';
                ctx.beginPath(); ctx.ellipse(-0.8, -10, 1.5, 3, -0.1, 0, Math.PI * 2); ctx.fill();
                // Engine nozzle rings
                [-5, 5].forEach(ox => {
                    ctx.fillStyle = '#330e00';
                    ctx.beginPath(); ctx.ellipse(ox, 16.5, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#f86'; ctx.lineWidth = 0.8;
                    ctx.beginPath(); ctx.ellipse(ox, 16.5, 3, 1.5, 0, 0, Math.PI * 2); ctx.stroke();
                });
            }

            // 开火预警：翼下挂点蓄力光（阈值前 12 帧渐亮；齐射序列中保持）
            if (!flash && (this.volleyStep >= 0 || this.shootTimer > this.shootInterval - 12)) {
                const k = this.volleyStep >= 0 ? 1
                    : Math.min(1, (this.shootTimer - (this.shootInterval - 12)) / 12);
                ctx.shadowColor = '#fc6'; ctx.shadowBlur = 7;
                [-11, 11].forEach(ox => {
                    const gg = ctx.createRadialGradient(ox, 11, 0, ox, 11, 3 + k * 3.5);
                    gg.addColorStop(0, `rgba(255,238,180,${0.4 + k * 0.5})`);
                    gg.addColorStop(1, 'rgba(255,130,40,0)');
                    ctx.fillStyle = gg;
                    ctx.beginPath(); ctx.arc(ox, 11, 3 + k * 3.5, 0, Math.PI * 2); ctx.fill();
                });
                ctx.shadowBlur = 0;
            }
            if (this.hp < this.maxHp) this.drawHpBar(ctx, 30, 22);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }
    return { Fighter };
})();

EnemyRegistry.register({ label:'Fighter', scale:1.10, group:'SOLDIERS', mk:()=>new Fighter.Fighter(0,0) });
