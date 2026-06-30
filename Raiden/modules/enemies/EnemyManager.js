var EnemyManager = (() => {
    let _enemies = [];
    let _ebullets = [];
    // 无尽模式额外缩放（叠加在难度之上，随时间爬升 → 后期真正有牙）
    let _endlessHp = 1, _endlessBullet = 1;

    const BOSS_TYPES = new Set(['midboss', 'midboss2', 'boss1', 'boss2', 'boss3', 'boss4', 'boss5', 'boss6', 'boss7', 'boss8']);

    // 难度缩放：敌弹速度（boss/普通弹统一）
    function _scaleBullet(b) {
        const m = ((typeof Difficulty !== 'undefined') ? Difficulty.get().bulletMul : 1) * _endlessBullet;
        if (m !== 1 && b && typeof b.vx === 'number') {
            b.vx *= m; b.vy *= m;
            if (b.maxSpeed) b.maxSpeed *= m;
        }
    }

    // 难度缩放：敌人血量（保留 hp/maxHp 比例 → 不影响 Boss 相位阈值）
    function _make(kind, opts = {}) {
        const e = _makeRaw(kind, opts);
        if (e) {
            const m = ((typeof Difficulty !== 'undefined') ? Difficulty.get().hpMul : 1) * _endlessHp;
            if (m !== 1) { e.hp = Math.max(1, Math.round(e.hp * m)); e.maxHp = e.hp; }
        }
        return e;
    }

    function _makeRaw(kind, opts = {}) {
        const x = opts.x !== undefined ? opts.x : (60 + Math.random() * (Renderer.W - 120));
        const y = opts.y !== undefined ? opts.y : -60;
        switch (kind) {
            case 'scout':       return new Scout.Scout(x, y, opts);
            case 'fighter':     return new Fighter.Fighter(x, y);
            case 'bomber':      return new Bomber.Bomber(x, y);
            case 'elite':       return new Elite.Elite(x, y);
            case 'interceptor': return new Interceptor.Interceptor(x, y, opts);
            case 'gunship':     return new Gunship.Gunship(x, y);
            case 'drone':       return new Drone.Drone(x, y, opts);
            case 'predator':    return new Predator.Predator(x, y);
            case 'carrier':     return new Carrier.Carrier(x, y);
            case 'midboss':     return new MidBoss.MidBoss();
            case 'midboss2':    return new MidBoss2.MidBoss2(Renderer.W / 2, -80);
            case 'boss1':       return new Boss1_Fortress.Boss1();
            case 'boss2':       return new Boss2_Colossus.Boss2();
            case 'boss3':       return new Boss3_Chaos.Boss3();
            case 'boss4':       return new Boss4_Void.Boss4_Void(Renderer.W / 2, -80);
            case 'boss5':       return new Boss5_Leviathan.Boss5_Leviathan();
            case 'boss6':       return new Boss6_NeutronCluster.Boss6_NeutronCluster();
            case 'boss7':       return new Boss7_Sovereign.Boss7_Sovereign();
            case 'boss8':       return new Boss8_Architect.Boss8();
            case 'marauder':    return new Marauder.Marauder(x, y);
            case 'spinner':     return new Spinner.Spinner(x, y);
            case 'vanguard':    return new Vanguard.Vanguard(x, y);
            case 'spectre':     return new Spectre.Spectre(x, y);
            case 'devastator':  return new Devastator.Devastator(x, y);
            case 'siren':       return new Siren.Siren(x, y, opts);
            case 'weaver':      return new Weaver.Weaver(x, y, opts);
            case 'splitter':    return new Splitter.Splitter(x, y, opts);
            case 'splitterling':return new Splitter.Splitterling(x, y, opts);
            default: return null;
        }
    }

    // 通用几何编队坐标生成（适用于任意兵种；返回 {x,y,[vx]} 数组或 null）
    function _formationPositions(formation, count) {
        const W = Renderer.W;
        switch (formation) {
            case 'grid': {
                const cols = Math.max(2, Math.min(count, Math.round(Math.sqrt(count * 1.6))));
                const out  = [];
                const mx   = W * 0.5 - (cols - 1) * 35;
                for (let i = 0; i < count; i++) {
                    const r = Math.floor(i / cols), c = i % cols;
                    out.push({ x: mx + c * 70, y: -40 - r * 54 });
                }
                return out;
            }
            case 'arc': {
                const out = [];
                for (let i = 0; i < count; i++) {
                    const t   = count > 1 ? i / (count - 1) : 0.5;
                    const ang = (t - 0.5) * Math.PI * 0.9;
                    out.push({ x: W * 0.5 + Math.sin(ang) * W * 0.36, y: -40 - Math.cos(ang) * 70 });
                }
                return out;
            }
            case 'diagonal': {
                const out = [], fromLeft = Math.random() < 0.5;
                for (let i = 0; i < count; i++) {
                    out.push({
                        x:  (fromLeft ? 36 : W - 36) + (fromLeft ? 1 : -1) * i * 10,
                        y:  -40 - i * 46,
                        vx: fromLeft ? 1.15 : -1.15
                    });
                }
                return out;
            }
            case 'hourglass': {
                const out = [], h = Math.ceil(count / 2);
                for (let i = 0; i < h; i++) {
                    out.push({ x: 34 + i * 26,      y: -30 - (h - i) * 20, vx: 1.0 });
                    out.push({ x: W - 34 - i * 26,  y: -30 - (h - i) * 20, vx: -1.0 });
                }
                return out.slice(0, count);
            }
        }
        return null;
    }

    return {
        init()  { _enemies = []; _ebullets = []; _endlessHp = 1; _endlessBullet = 1; },
        reset() { _enemies = []; _ebullets = []; _endlessHp = 1; _endlessBullet = 1; },
        setEndlessScale(hp, bullet) { _endlessHp = hp; _endlessBullet = bullet; },

        spawnKind(kind, count = 1, opts = {}) {
            for (let i = 0; i < count; i++) {
                const e = _make(kind, opts);
                if (e) _enemies.push(e);
            }
        },

        spawnFormation(kind, count, formation, opts = {}) {
            let arr = [];
            // 1) 兵种专属编队工厂
            if (kind === 'scout') {
                if      (formation === 'V')      arr = Scout.spawnV(count);
                else if (formation === 'pincer') arr = Scout.spawnPincer(count);
                else                             arr = Scout.spawnLine(count);
            } else if (kind === 'interceptor' && formation === 'sweep') {
                arr = Interceptor.spawnSweep(count);
            } else if (kind === 'drone' && formation === 'swarm') {
                arr = Drone.spawnSwarm(count, opts.x || Renderer.W / 2, opts.y || -20);
            } else if (kind === 'siren' && formation === 'line') {
                arr = Siren.spawnLine(count);
            }
            // 2) 通用几何编队（grid / arc / diagonal / hourglass，任意兵种可用）
            if (!arr.length) {
                const pos = _formationPositions(formation, count);
                if (pos) arr = pos.map(p => _make(kind, p)).filter(Boolean);
            }
            // 3) 兜底：随机散布
            if (!arr.length) {
                arr = Array.from({ length: count }, () => _make(kind, opts)).filter(Boolean);
            }
            _enemies.push(...arr);
        },

        update(dt, fc) {
            for (const e of _enemies) {
                if (!e.alive) continue;
                const result = e.update(dt, fc);
                if (result) {
                    if (Array.isArray(result))               { for (const b of result) _scaleBullet(b); _ebullets.push(...result); }
                    else if (result instanceof EnemyBullet)  { _scaleBullet(result); _ebullets.push(result); }
                }
            }
            _enemies  = _enemies.filter(e => e.alive);
            _ebullets = _ebullets.filter(b => b.alive);

            for (const b of _ebullets) b.update(dt);
        },

        drawEnemies(ctx, dt, fc) {
            for (const e of _enemies) {
                if (e.alive) e.draw(ctx, dt, fc);
            }
        },
        drawEnemyBullets(ctx) {
            for (const b of _ebullets) {
                if (b.alive) b.draw(ctx);
            }
        },

        getEnemies()      { return _enemies; },
        getEnemyBullets() { return _ebullets; },
        clearBullets()    { for (const b of _ebullets) b.alive = false; _ebullets = []; },

        getActiveBoss() {
            return _enemies.find(e => BOSS_TYPES.has(e.type)) || null;
        },
        hasBoss() {
            return _enemies.some(e => BOSS_TYPES.has(e.type));
        },
        isEmpty() { return _enemies.length === 0; },
        clear()   { _enemies = []; _ebullets = []; }
    };
})();
