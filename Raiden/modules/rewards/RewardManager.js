var RewardManager = (() => {
    let _items = [];

    const DROP_TABLES = {
        scout:       { chance: 0.05, table: ['power'] },
        fighter:     { chance: 0.15, table: ['power','bomb','health'] },
        bomber:      { chance: 0.50, table: ['power','bomb','health','shield','timeslow','ice_w'] },
        elite:       { chance: 0.45, table: ['spread_w','homing_w','laser_w','plasma_w','lightning_w','ice_w','graviton_w','power','shield','multiplier'] },
        interceptor: { chance: 0.10, table: ['power','health'] },
        gunship:     { chance: 0.25, table: ['power','bomb','health','spread_w'] },
        drone:       { chance: 0.04, table: ['power'] },
        predator:    { chance: 0.45, table: ['power','health','lightning_w','ice_w','shield'] },
        carrier:     { chance: 0.60, table: ['power','bomb','health','shield','satellite_w','multiplier'] },
        midboss:     { chance: 1.00, count: 5, table: ['power','bomb','health','shield','spread_w','homing_w','satellite_w'] },
        midboss2:    { chance: 1.00, count: 5, table: ['power','bomb','health','shield','lightning_w','ice_w','satellite_w','multiplier'] },
        boss:        { chance: 1.00, count: 8, table: ['power','bomb','health','shield','spread_w','homing_w','laser_w','plasma_w','lightning_w','ice_w','satellite_w','graviton_w','multiplier','megabomb'] },
        marauder:    { chance: 0.15, table: ['power','bomb','health'] },
        spinner:     { chance: 0.10, table: ['power','health'] },
        vanguard:    { chance: 0.20, table: ['power','bomb','health','shield'] },
        spectre:     { chance: 0.55, table: ['spread_w','homing_w','lightning_w','plasma_w','graviton_w','power','shield'] },
        devastator:  { chance: 0.60, table: ['homing_w','plasma_w','laser_w','spread_w','power','bomb','shield'] }
    };

    function _makeItem(kind, x, y) {
        switch (kind) {
            case 'power':      return new PowerItem.PowerItem(x, y);
            case 'bomb':       return new BombItem.BombItem(x, y);
            case 'health':     return new HealthItem.HealthItem(x, y);
            case 'shield':     return new ShieldItem.ShieldItem(x, y);
            case 'timeslow':   return new TimeSlowItem.TimeSlowItem(x, y);
            case 'multiplier': return new MultiplierItem.MultiplierItem(x, y);
            case 'megabomb':   return new MegaBombItem.MegaBombItem(x, y);
            case 'spread_w':    return new WeaponItem.WeaponItem(x, y, 'spread_w');
            case 'homing_w':    return new WeaponItem.WeaponItem(x, y, 'homing_w');
            case 'laser_w':     return new WeaponItem.WeaponItem(x, y, 'laser_w');
            case 'plasma_w':    return new WeaponItem.WeaponItem(x, y, 'plasma_w');
            case 'lightning_w': return new WeaponItem.WeaponItem(x, y, 'lightning_w');
            case 'ice_w':       return new WeaponItem.WeaponItem(x, y, 'ice_w');
            case 'satellite_w': return new WeaponItem.WeaponItem(x, y, 'satellite_w');
            case 'graviton_w':  return new WeaponItem.WeaponItem(x, y, 'graviton_w');
            default: return null;
        }
    }

    return {
        init()  { _items = []; },
        reset() { _items = []; },

        tryDrop(enemy) {
            const bossFinalTypes = new Set(['boss1','boss2','boss3','boss4','boss5','boss6','boss7']);
            const dropKey = bossFinalTypes.has(enemy.type) ? 'boss' : enemy.type;
            const cfg = DROP_TABLES[dropKey] || DROP_TABLES['fighter'];
            const tbl = enemy.dropTable || cfg.table;

            // Bosses and midbosses: guaranteed circular burst drop
            if (cfg.count) {
                const count = cfg.count;
                for (let i = 0; i < count; i++) {
                    const k  = tbl[Math.floor(Math.random() * tbl.length)];
                    const ei = _makeItem(k, enemy.x, enemy.y);
                    if (!ei) continue;
                    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
                    const spd   = 2.6 + Math.random() * 1.8;
                    ei.vx = Math.cos(angle) * spd;
                    ei.vy = Math.sin(angle) * spd - 1.5;
                    _items.push(ei);
                }
                return;
            }

            // Regular enemies: single chance-based drop
            if (Math.random() > cfg.chance) return;
            const kind = tbl[Math.floor(Math.random() * tbl.length)];
            const item = _makeItem(kind, enemy.x + (Math.random() - 0.5) * 20, enemy.y);
            if (item) _items.push(item);
        },

        spawnAt(kind, x, y) {
            const item = _makeItem(kind, x, y);
            if (item) _items.push(item);
        },

        update(dt, fc) {
            for (const it of _items) it.update(dt);
            _items = _items.filter(it => it.alive);
        },
        draw(ctx, fc) {
            for (const it of _items) {
                if (it.alive) it.draw(ctx, fc);
            }
        },

        getItems() { return _items; }
    };
})();
