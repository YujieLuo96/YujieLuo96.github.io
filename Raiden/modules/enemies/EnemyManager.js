var EnemyManager = (() => {
    let _enemies = [];
    let _ebullets = [];

    const BOSS_TYPES = new Set(['midboss', 'midboss2', 'boss1', 'boss2', 'boss3', 'boss4', 'boss5', 'boss6', 'boss7']);

    function _make(kind, opts = {}) {
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
            case 'marauder':    return new Marauder.Marauder(x, y);
            case 'spinner':     return new Spinner.Spinner(x, y);
            case 'vanguard':    return new Vanguard.Vanguard(x, y);
            case 'spectre':     return new Spectre.Spectre(x, y);
            case 'devastator':  return new Devastator.Devastator(x, y);
            default: return null;
        }
    }

    return {
        init()  { _enemies = []; _ebullets = []; },
        reset() { _enemies = []; _ebullets = []; },

        spawnKind(kind, count = 1, opts = {}) {
            for (let i = 0; i < count; i++) {
                const e = _make(kind, opts);
                if (e) _enemies.push(e);
            }
        },

        spawnFormation(kind, count, formation, opts = {}) {
            let arr = [];
            switch (kind) {
                case 'scout':
                    switch (formation) {
                        case 'line':   arr = Scout.spawnLine(count); break;
                        case 'V':      arr = Scout.spawnV(count); break;
                        case 'pincer': arr = Scout.spawnPincer(count); break;
                        default:       arr = Scout.spawnLine(count);
                    }
                    break;
                case 'interceptor':
                    if (formation === 'sweep') {
                        arr = Interceptor.spawnSweep(count);
                    } else {
                        arr = Array.from({ length: count }, () => _make(kind, opts)).filter(Boolean);
                    }
                    break;
                case 'drone':
                    if (formation === 'swarm') {
                        const cx = opts.x || Renderer.W / 2;
                        const cy = opts.y || -20;
                        arr = Drone.spawnSwarm(count, cx, cy);
                    } else {
                        arr = Array.from({ length: count }, () => _make(kind, opts)).filter(Boolean);
                    }
                    break;
                default:
                    arr = Array.from({ length: count }, () => _make(kind, opts)).filter(Boolean);
            }
            _enemies.push(...arr);
        },

        update(dt, fc) {
            for (const e of _enemies) {
                if (!e.alive) continue;
                const result = e.update(dt, fc);
                if (result) {
                    if (Array.isArray(result))                _ebullets.push(...result);
                    else if (result instanceof EnemyBullet)  _ebullets.push(result);
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
