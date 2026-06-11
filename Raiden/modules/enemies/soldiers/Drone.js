var Drone = (() => {
    const ARM_FRAMES = 16;   // 自爆冲撞蓄力帧数（telegraph 窗口）

    class Drone extends EnemyBase {
        constructor(x, y, opts = {}) {
            super({ x, y, hp: 1, score: 30, type: 'drone',
                    dropChance: 0.04, dropTable: ['power'], w: 14, h: 14 });
            this.targetX  = opts.targetX !== undefined ? opts.targetX : x;
            this.speed    = 2.2 + Math.random() * 1.2;
            this.vy       = 1.4 + Math.random() * 0.8;
            this.spinAngle = Math.random() * Math.PI * 2;
            this.spinRate  = 0.07 + Math.random() * 0.04;
            this.hue       = 290 + Math.random() * 50; // purple-pink
            // 自爆冲撞状态机：drift → arm(蓄力预警) → dash(锁定方向冲撞)
            this.state    = 'drift';
            this.armTimer = 0;
            this.dashVx   = 0;
            this.dashVy   = 0;
        }

        update(dt, fc) {
            if (this.state === 'drift') {
                // Drift laterally toward targetX, descend
                const dx = this.targetX - this.x;
                this.x += Math.sign(dx) * Math.min(Math.abs(dx), this.speed * 0.6 * dt);
                this.y += this.vy * dt;
                this.spinAngle += this.spinRate * dt;
                // 接近玩家 → 进入蓄力
                if (this.enteredScreen) {
                    const p = Player.getPos();
                    const pdx = p.x - this.x, pdy = p.y - this.y;
                    if (pdy > 0 && pdy < 170 && Math.abs(pdx) < 90) {
                        this.state = 'arm';
                        this.armTimer = ARM_FRAMES;
                    }
                }
            } else if (this.state === 'arm') {
                // 蓄力：悬停减速、急速自旋，核心转红预警
                this.armTimer -= dt;
                this.y += this.vy * 0.35 * dt;
                this.spinAngle += this.spinRate * 3 * dt;
                if (this.armTimer <= 0) {
                    const p = Player.getPos();
                    const a = Math.atan2(p.y - this.y, p.x - this.x);
                    const spd = 4.3;   // 一次性锁定方向，可预判可躲
                    this.dashVx = Math.cos(a) * spd;
                    this.dashVy = Math.sin(a) * spd;
                    this.state = 'dash';
                    ParticleSystem.spawn(this.x, this.y, {
                        count: 4, angle: a, spread: 0.9, speed: 2.6,
                        size: 1.8, life: 12, shape: 'spark',
                        colors: ['#f66', '#fb4', '#fff'],
                    });
                }
            } else {
                // 冲撞：直线突进 + 节流尾迹
                this.x += this.dashVx * dt;
                this.y += this.dashVy * dt;
                this.spinAngle += this.spinRate * 4 * dt;
                if (((fc | 0) % 5) === 0) {
                    ParticleSystem.spawn(this.x, this.y, {
                        count: 1, speed: 0.5, scatter: 4, size: 1.8, life: 14,
                        colors: ['#f75', `hsl(${this.hue},100%,72%)`],
                    });
                }
            }
            this.checkEntered();
            if (this.isOffscreen()) this.alive = false;
            return null;
        }

        draw(ctx, dt, fc) {
            const f = fc || 0;
            ctx.save();
            ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const arming  = this.state === 'arm';
            const dashing = this.state === 'dash';
            const armK    = arming ? 1 - Math.max(0, this.armTimer) / ARM_FRAMES : 0;
            // 蓄力/冲撞时色相向红色偏移（预警可读性）
            const hue = arming ? this.hue + (10 - this.hue) * armK
                      : dashing ? 10 : this.hue;

            if (!flash && dashing) {
                // 冲撞尾焰（速度反方向拉长）
                ctx.save();
                ctx.rotate(Math.atan2(this.dashVy, this.dashVx) + Math.PI / 2);
                const tg = ctx.createLinearGradient(0, 2, 0, 18);
                tg.addColorStop(0, `hsla(${hue},100%,70%,0.75)`);
                tg.addColorStop(1, 'hsla(25,100%,50%,0)');
                ctx.fillStyle = tg;
                ctx.beginPath(); ctx.ellipse(0, 10, 3, 9, 0, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }

            ctx.rotate(this.spinAngle);

            if (!flash) {
                // Core energy glow（蓄力/冲撞时增亮放大）
                const coreR = 4 + armK * 3 + (dashing ? 2 : 0);
                ctx.shadowColor = `hsl(${hue},100%,70%)`; ctx.shadowBlur = 10 + armK * 6;
                const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
                cg.addColorStop(0, `hsla(${hue+20},100%,92%,0.9)`);
                cg.addColorStop(0.6, `hsla(${hue},100%,60%,0.5)`);
                cg.addColorStop(1, `hsla(${hue},90%,40%,0)`);
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Hexagonal hull (6 sides)
            const hg = ctx.createLinearGradient(0, -7, 0, 7);
            hg.addColorStop(0, flash ? '#fff' : `hsl(${hue},95%,68%)`);
            hg.addColorStop(1, flash ? '#fff' : `hsl(${hue+30},90%,36%)`);
            ctx.fillStyle = hg;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
                i === 0 ? ctx.moveTo(Math.cos(a)*7, Math.sin(a)*7)
                        : ctx.lineTo(Math.cos(a)*7, Math.sin(a)*7);
            }
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = `hsla(${hue-20},100%,80%,0.55)`;
                ctx.lineWidth = 0.8; ctx.stroke();
                // Circuit cross-lines
                ctx.strokeStyle = `hsla(${hue+20},100%,78%,0.38)`;
                ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-2.5, 4.3); ctx.lineTo(2.5, -4.3); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(2.5, 4.3); ctx.lineTo(-2.5, -4.3); ctx.stroke();
                // Thruster micro-dots at alternating corners
                [0, 2, 4].forEach(i => {
                    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
                    ctx.fillStyle = `hsla(${hue-10},100%,88%,0.75)`;
                    ctx.beginPath(); ctx.arc(Math.cos(a)*6.5, Math.sin(a)*6.5, 1.2, 0, Math.PI*2); ctx.fill();
                });
                // Center dot（待机时缓慢脉动）
                const pulse = 0.75 + Math.sin(f * 0.2) * 0.2;
                ctx.fillStyle = `hsla(${hue+20},100%,94%,${pulse})`;
                ctx.beginPath(); ctx.arc(0, 0, 1.8 + armK * 0.8, 0, Math.PI * 2); ctx.fill();
                // 蓄力预警：向外扩张的红色警告环
                if (arming) {
                    ctx.strokeStyle = `hsla(10,100%,65%,${0.75 - armK * 0.4})`;
                    ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.arc(0, 0, 4 + armK * 9, 0, Math.PI * 2); ctx.stroke();
                }
            }
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    function spawnSwarm(count, cx, cy) {
        const arr = [];
        const spread = 60;
        for (let i = 0; i < count; i++) {
            const ox = (Math.random() - 0.5) * spread;
            const oy = (Math.random() - 0.5) * spread * 0.4;
            const tx = Math.max(20, Math.min(Renderer.W - 20,
                cx + (Math.random() - 0.5) * spread * 0.5));
            arr.push(new Drone(cx + ox, -14 + oy, { targetX: tx }));
        }
        return arr;
    }

    return { Drone, spawnSwarm };
})();

EnemyRegistry.register({ label:'Drone', scale:1.50, group:'SOLDIERS', mk:()=>new Drone.Drone(0,0) });
