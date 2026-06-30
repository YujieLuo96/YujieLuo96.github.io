var Siren = (() => {
    // 锁定后炮口聚能光晕
    function chargeGlow(ctx, k) {
        const r = 4 + k * 9;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(255,255,255,${0.5 + k * 0.4})`);
        g.addColorStop(0.5, `rgba(255,90,140,${0.4 + k * 0.4})`);
        g.addColorStop(1, 'rgba(255,40,90,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }

    class Siren extends EnemyBase {
        constructor(x, y, opts = {}) {
            super({ x, y, hp: 11, score: 340, type: 'siren', dropChance: 0.5,
                    dropTable: ['shield', 'power', 'multiplier'], w: 32, h: 30 });
            this.vy        = opts.speed || 1.7;
            this.hoverY    = Renderer.H * (0.18 + Math.random() * 0.16);
            this.phase     = 'descend';            // descend → hover → leave
            this.hoverT    = 0;
            this.hoverMax  = 280 + Math.random() * 140;
            this.strafe    = Math.random() * Math.PI * 2;
            this.strafeSpd = 0.011 + Math.random() * 0.010;
            this.lockT     = 70 + Math.random() * 60;
            this.charge    = 0;                    // >0：蓄力（telegraph）
            this.chargeMax = 34;
            this.sweep     = Math.random() * Math.PI * 2;
            this.gapA      = 0;
        }

        update(dt, fc) {
            // 雷达扫描：蓄力时转速翻倍（预警）
            this.sweep += (this.charge > 0 ? 0.22 : 0.07) * dt;

            if (this.phase === 'descend') {
                this.y += this.vy * dt;
                if (this.y >= this.hoverY) this.phase = 'hover';
            } else if (this.phase === 'hover') {
                this.strafe += this.strafeSpd * dt;
                this.x += Math.sin(this.strafe) * 0.95 * dt;
                this.x  = Math.max(this.w / 2, Math.min(Renderer.W - this.w / 2, this.x));
                this.hoverT += dt;
                if (this.hoverT >= this.hoverMax) this.phase = 'leave';
            } else {
                this.y += (this.vy + 1.3) * dt;
            }

            this.checkEntered();
            if (this.isOffscreen()) { this.alive = false; return null; }

            // 蓄力中：吐预警粒子，蓄满后打一圈"留缝环"（缺口朝玩家，逼走位）
            if (this.charge > 0) {
                this.charge -= dt;
                if (fc % 4 < 1)
                    ParticleSystem.spawn(this.x, this.y,
                        { count: 1, colors: ['#ff5577', '#ffd0e0', '#fff'], speed: 0.6, life: 12, size: 2, scatter: 20 });
                if (this.charge <= 0) {
                    const bw = { bulletOpts: { type: 'big', radius: 4, color: '#ff5f8f' } };
                    return BulletPatterns.ringGap(this.x, this.y, 16, 3.0, this.sweep * 0.2, this.gapA, 0.52, bw);
                }
                return null;
            }

            if (this.phase === 'hover') {
                this.lockT -= dt;
                if (this.lockT <= 0) {
                    this.lockT = 150 + Math.random() * 60;
                    this.charge = this.chargeMax;
                    const p = Player.getPos();
                    this.gapA = Math.atan2(p.y - this.y, p.x - this.x);   // 缺口锁向玩家当前方位
                }
            }
            return null;
        }

        draw(ctx, dt, fc) {
            const f = fc || 0;
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const k = this.charge > 0 ? 1 - this.charge / this.chargeMax : 0;

            // ── 雷达扫描扇（蓄力时变红加亮） ─────────────────────────────
            if (!flash) {
                ctx.save();
                ctx.rotate(this.sweep);
                const sweepCol = this.charge > 0 ? 'rgba(255,90,130,' : 'rgba(120,220,255,';
                ctx.fillStyle = sweepCol + (0.10 + k * 0.18) + ')';
                ctx.beginPath(); ctx.moveTo(0, 0);
                ctx.arc(0, 0, 22, 0, 0.7); ctx.closePath(); ctx.fill();
                ctx.restore();
            }

            // ── 六边形船体 ───────────────────────────────────────────────
            const hg = ctx.createLinearGradient(0, -16, 0, 16);
            if (flash) { hg.addColorStop(0, '#fff'); hg.addColorStop(1, '#fff'); }
            else { hg.addColorStop(0, '#7fd0e8'); hg.addColorStop(0.5, '#2a7da8'); hg.addColorStop(1, '#16415e'); }
            ctx.fillStyle = hg;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = Math.PI / 6 + i * Math.PI / 3;
                const r = 15;
                const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.82;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = 'rgba(150,230,255,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
                // 内圈环
                ctx.strokeStyle = 'rgba(120,210,255,0.4)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
                // 三根天线
                ctx.strokeStyle = 'rgba(160,235,255,0.5)'; ctx.lineWidth = 1;
                for (const aa of [-1, 0, 1]) {
                    ctx.beginPath();
                    ctx.moveTo(aa * 6, -10); ctx.lineTo(aa * 9, -18);
                    ctx.stroke();
                    ctx.fillStyle = (Math.floor(f / 14) % 2) ? '#bff' : '#7cf';
                    ctx.beginPath(); ctx.arc(aa * 9, -18, 1.2, 0, Math.PI * 2); ctx.fill();
                }
            }

            // ── 中央眼：常态青、锁定/蓄力时转红并聚能 ────────────────────
            const eyeCol = this.charge > 0 ? `rgba(255,${Math.round(80 - k * 60)},120,1)` : 'rgba(120,230,255,1)';
            ctx.shadowColor = this.charge > 0 ? '#ff3366' : '#40c0ff';
            ctx.shadowBlur  = 8 + k * 10;
            ctx.fillStyle   = eyeCol;
            ctx.beginPath(); ctx.arc(0, 0, 4.5 + k * 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath(); ctx.arc(-1, -1, 1.6, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;

            if (this.charge > 0 && !flash) chargeGlow(ctx, k);

            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    // 横排登场（自带轻微错位）
    function spawnLine(count, y = -40) {
        const step = Renderer.W / (count + 1);
        return Array.from({ length: count }, (_, i) =>
            new Siren(step * (i + 1), y - (i % 2) * 26));
    }

    return { Siren, spawnLine };
})();

EnemyRegistry.register({ label:'Siren', scale:1.30, group:'SOLDIERS', mk:()=>new Siren.Siren(0,0) });
