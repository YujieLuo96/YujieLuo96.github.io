// ──────────────────────────────────────────────────────────────────────────
//  Boss8 — THE ARCHITECT
//  竞技场塑形者：周期性投下"弹墙阵"（留一道缓慢横移的缺口），逼玩家在墙缝间穿行；
//  墙间隙穿插瞄准爆发与环弹。三相递进：CONSTRUCT → FORTIFY → COLLAPSE。
//  填补"机关/场地操控型 Boss"空缺（此前皆为浮空炮台变体）。
// ──────────────────────────────────────────────────────────────────────────
var Boss8_Architect = (() => {
    const WALL_COL = { bulletOpts: { type: 'big', radius: 5, color: '#7fe0ff' } };

    class Boss8 extends EnemyBase {
        constructor() {
            super({ x: Renderer.W / 2, y: -110, hp: 300, score: 13000, type: 'boss8',
                    dropChance: 1.0,
                    dropTable: ['power','bomb','health','shield','homing_w','laser_w','plasma_w','shatter_w','megabomb'],
                    w: 128, h: 92 });
            this.entryY    = 116;
            this.entered   = false;
            this.phase     = 1;
            this.baseX     = Renderer.W / 2;
            this.modeLabel = 'CONSTRUCT';
            this.reactorHue= 195;

            this.wallTimer = 90;
            this.charge    = 0;
            this.chargeMax = 40;
            this.gapPos    = 0.5;       // 缺口归一化位置 0..1（每阵横移）
            this.gapDir    = 1;

            this.burstTimer= 0;
            this.armPulse  = 0;
            this.coreSpin  = 0;
        }

        _setPhase(p) {
            this.phase = p;
            if (p === 2) { this.modeLabel = 'FORTIFY';  this.reactorHue = 45;  }
            if (p === 3) { this.modeLabel = 'COLLAPSE'; this.reactorHue = 0;   }
            ExplosionFX.largeEnemy(this.x, this.y, p === 3 ? '#ff5030' : '#ffcc40');
        }

        update(dt, fc) {
            this.armPulse += 0.08 * dt;
            this.coreSpin += 0.02 * dt;

            if (!this.entered) {
                this.y += 1.4 * dt;
                if (this.y >= this.entryY) { this.entered = true; this.y = this.entryY; }
                this.checkEntered();
                return null;
            }

            const ratio = this.hp / this.maxHp;
            if (ratio <= 0.66 && this.phase < 2) this._setPhase(2);
            if (ratio <= 0.33 && this.phase < 3) this._setPhase(3);

            // 缓慢横移
            this.baseX += Math.sin(fc * 0.014) * 1.1 * dt;
            this.baseX  = Math.max(this.w / 2 + 10, Math.min(Renderer.W - this.w / 2 - 10, this.baseX));
            this.x      = this.baseX;

            // 缺口横移（持续漂移，越后期越快）
            this.gapPos += this.gapDir * (0.004 + this.phase * 0.0016) * dt;
            if (this.gapPos > 0.86) { this.gapPos = 0.86; this.gapDir = -1; }
            if (this.gapPos < 0.14) { this.gapPos = 0.14; this.gapDir = 1; }

            const bullets = [];

            // ── 弹墙阵：蓄力 telegraph → 投墙（缺口由 gapPos 决定） ─────────
            if (this.charge > 0) {
                this.charge -= dt;
                if (fc % 4 < 1)
                    ParticleSystem.spawn(this.x, this.y + 6,
                        { count: 2, colors: ['#9fe8ff', '#3bf', '#fff'], speed: 0.6, life: 14, size: 2.4, scatter: 36 });
                if (this.charge <= 0) {
                    const W = Renderer.W;
                    const count = Math.max(10, Math.min(20, Math.floor(W / 56)));
                    const gapIdx = Math.max(1, Math.min(count - 3, Math.round(this.gapPos * (count - 1))));
                    const spd = this.phase >= 3 ? 2.9 : 2.5;
                    bullets.push(...BulletPatterns.wall(W / 2, this.y - 28, count, W * 0.94, spd, gapIdx, WALL_COL));
                    if (this.phase >= 2) {   // 第二层错位墙（缺口偏移）
                        const gap2 = Math.max(1, Math.min(count - 3, gapIdx + (this.gapDir > 0 ? 3 : -3)));
                        bullets.push(...BulletPatterns.wall(W / 2, this.y - 56, count, W * 0.94, spd - 0.3, gap2, WALL_COL));
                    }
                    if (this.phase >= 3) {   // COLLAPSE：缺口两侧追踪火焰封口
                        const gx = W * 0.03 + (W * 0.94) * (gapIdx / (count - 1)) + W * 0.03;
                        const p  = Player.getPos();
                        bullets.push(...BulletPatterns.homingFlare(gx - 24, this.y - 20, p.x, p.y, 2.8));
                        bullets.push(...BulletPatterns.homingFlare(gx + 24, this.y - 20, p.x, p.y, 2.8));
                    }
                    this.wallTimer = 0;
                }
                return bullets.length ? bullets : null;
            }

            this.wallTimer += dt;
            const wallInt = this.phase >= 3 ? 150 : this.phase === 2 ? 190 : 240;
            if (this.wallTimer >= wallInt) { this.charge = this.chargeMax; return null; }

            // ── 墙间隙火力：瞄准爆发 (+P2 环弹 / +P3 旋臂) ───────────────
            this.burstTimer += dt;
            const burstInt = this.phase >= 3 ? 40 : this.phase === 2 ? 52 : 66;
            if (this.burstTimer >= burstInt) {
                this.burstTimer = 0;
                const p = Player.getPos();
                bullets.push(...BulletPatterns.aimed(this.x, this.y + 30, p.x, p.y, 4.6,
                    { count: this.phase >= 2 ? 4 : 3, spread: 0.42 }));
                if (this.phase >= 2)
                    bullets.push(...BulletPatterns.ring(this.x, this.y, 12, 3.2, fc * 0.02,
                        { bulletOpts: { color: '#7fd0ff' } }));
                if (this.phase >= 3)
                    bullets.push(...BulletPatterns.spiralArms(this.x, this.y, 4, fc * 0.07, 3.0,
                        { bulletOpts: { color: '#ff8060' } }));
            }
            return bullets.length ? bullets : null;
        }

        draw(ctx, dt, fc) {
            ctx.save(); ctx.translate(this.x, this.y);
            const flash = this._applyFlash(ctx, dt);
            const ph    = this.phase;
            const hue   = this.reactorHue;
            const glow  = `hsl(${hue},100%,55%)`;
            const pulse = 0.5 + Math.sin(fc * 0.12) * 0.5;

            // ── 4 articulated arms（朝四角伸展的桁架，蓄力时发光） ────────
            if (!flash) {
                const armLen = 46 + (this.charge > 0 ? (1 - this.charge / this.chargeMax) * 14 : 0);
                ctx.strokeStyle = `hsla(${hue},100%,65%,${0.5 + (this.charge > 0 ? 0.4 : 0)})`;
                ctx.lineWidth = 3;
                ctx.shadowColor = glow; ctx.shadowBlur = this.charge > 0 ? 12 : 5;
                for (let i = 0; i < 4; i++) {
                    const a = Math.PI / 4 + i * Math.PI / 2 + Math.sin(this.armPulse + i) * 0.06;
                    const ex = Math.cos(a) * armLen, ey = Math.sin(a) * armLen * 0.7;
                    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 12); ctx.lineTo(ex, ey); ctx.stroke();
                    // 末端节点
                    ctx.fillStyle = glow;
                    ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, Math.PI * 2); ctx.fill();
                }
                ctx.shadowBlur = 0;
            }

            // ── 主体：分块装甲六角壳 ─────────────────────────────────────
            const bg = ctx.createLinearGradient(0, -42, 0, 44);
            if (flash) { bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#fff'); }
            else if (ph === 3) { bg.addColorStop(0, '#5a2828'); bg.addColorStop(0.5, '#3a1414'); bg.addColorStop(1, '#1c0808'); }
            else if (ph === 2) { bg.addColorStop(0, '#5a4a22'); bg.addColorStop(0.5, '#3a2e10'); bg.addColorStop(1, '#1c1604'); }
            else               { bg.addColorStop(0, '#244a5a'); bg.addColorStop(0.5, '#13303c'); bg.addColorStop(1, '#06141c'); }
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.moveTo(0, -44); ctx.lineTo(34, -28); ctx.lineTo(58, 0);
            ctx.lineTo(40, 32);  ctx.lineTo(0, 44);  ctx.lineTo(-40, 32);
            ctx.lineTo(-58, 0);  ctx.lineTo(-34, -28);
            ctx.closePath(); ctx.fill();

            if (!flash) {
                ctx.strokeStyle = `hsla(${hue},100%,62%,0.85)`; ctx.lineWidth = 2;
                ctx.shadowColor = glow; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
                // 建造桁架格纹
                ctx.strokeStyle = `hsla(${hue},80%,55%,0.28)`; ctx.lineWidth = 1;
                for (const ly of [-18, 0, 18]) {
                    ctx.beginPath(); ctx.moveTo(-46, ly); ctx.lineTo(0, ly - 8); ctx.lineTo(46, ly); ctx.stroke();
                }
                // 残血裂纹（COLLAPSE）
                if (ph === 3) {
                    ctx.shadowColor = '#ffb030'; ctx.shadowBlur = 6;
                    ctx.strokeStyle = 'rgba(255,200,60,0.6)'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(-22, -30); ctx.lineTo(-10, -16); ctx.lineTo(-24, -4); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(18, 12); ctx.lineTo(28, 26); ctx.lineTo(18, 38); ctx.stroke();
                    ctx.shadowBlur = 0;
                }
            }

            // ── 中央建造反应堆 ───────────────────────────────────────────
            if (!flash) {
                ctx.save();
                ctx.rotate(this.coreSpin);
                ctx.strokeStyle = `hsla(${hue},100%,70%,0.6)`; ctx.lineWidth = 2;
                for (let i = 0; i < 3; i++) {
                    ctx.save(); ctx.rotate(i * Math.PI / 3);
                    ctx.beginPath(); ctx.rect(-14, -14, 28, 28); ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();
            }
            const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, 18 + pulse * 6);
            rg.addColorStop(0, '#fff');
            rg.addColorStop(0.3, glow);
            rg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
            ctx.shadowColor = glow; ctx.shadowBlur = 18;
            ctx.fillStyle = rg;
            ctx.beginPath(); ctx.arc(0, 0, 18 + pulse * 6, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();

            // ── 弹墙蓄力 telegraph：横向警示虚线 + 缺口标记 ─────────────
            if (!flash && this.charge > 0) {
                const prog = 1 - this.charge / this.chargeMax;
                ctx.globalAlpha = 0.2 + prog * 0.5;
                ctx.strokeStyle = '#7fe0ff'; ctx.lineWidth = 2;
                ctx.setLineDash([10, 8]);
                ctx.beginPath(); ctx.moveTo(-Renderer.W, -28); ctx.lineTo(Renderer.W, -28); ctx.stroke();
                ctx.setLineDash([]);
                // 缺口高亮（绿色安全区）
                const gx = -this.x + Renderer.W * (0.03 + 0.94 * this.gapPos);
                ctx.fillStyle = `rgba(80,255,160,${0.3 + prog * 0.4})`;
                ctx.fillRect(gx - 28, -32, 56, 8);
                ctx.globalAlpha = 1;
            }

            this.drawHpBar(ctx, 104, -62);
            ctx.restore(); ctx.globalAlpha = 1;
        }
    }

    return { Boss8 };
})();

EnemyRegistry.register({ label:'Architect', scale:0.20, group:'BOSSES', mk:()=>new Boss8_Architect.Boss8() });
