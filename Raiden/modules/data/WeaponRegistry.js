var WeaponRegistry = (() => {
    const _defs = [
        { key:'1', col:'#7ef',    label:'NORMAL GUN',      sub:'MAIN CANNON',      desc:'Upgrades to multi-barrel spread, infinite ammo' },
        { key:'2', col:'#4af',    label:'SPREAD GUN',      sub:'SHOTGUN',          desc:'8-shot fan spread, devastating at close range' },
        { key:'3', col:'#4f8',    label:'LASER BEAM',      sub:'PIERCING LASER',   desc:'Continuous piercing beam, halts on overheat' },
        { key:'4', col:'#c4f',    label:'HOMING MISSILE',  sub:'HOMING MISSILES',  desc:'Auto-locks nearest target, 10 shots, high single-target DPS' },
        { key:'5', col:'#f55',    label:'PLASMA CANNON',   sub:'AREA DAMAGE',      desc:'Explosion on impact, area damage, 8 shots' },
        { key:'6', col:'#ff8',    label:'LIGHTNING GUN',   sub:'CHAIN LIGHTNING',  desc:'Arc chain, strikes multiple enemies, 12 shots' },
        { key:'7', col:'#a0f0ff', label:'ICE CRYSTAL',     sub:'FREEZE BARRAGE',   desc:'Scatter barrage, freezes and slows enemies, 10 shots' },
        { key:'8', col:'#ffb830', label:'TWIN SATELLITE',  sub:'ORBIT TURRETS',    desc:'Two orbiting satellites that deal continuous damage' },
        { key:'9', col:'#cc60ff', label:'GRAVITON ORB',    sub:'GRAVITY FIELD',    desc:'Launches an orb that pulls enemies and chain-zaps them, 8 shots' },
        { key:'0', col:'#5fefff', label:'SHATTER BEAM',    sub:'SPLIT BARRAGE',    desc:'Fast sine-wave bolts that shatter into a 3-way spread on impact' },
    ];
    return {
        register(def) { _defs.push(def); },
        getDefs()     { return _defs; }
    };
})();
