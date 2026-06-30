var WeaponManager = (() => {
    const W = {
        NORMAL:'normal', SPREAD:'spread', LASER:'laser',
        HOMING:'homing', PLASMA:'plasma',
        LIGHTNING:'lightning', ICE:'ice', SATELLITE:'satellite',
        GRAVITON:'graviton', SHATTER:'shatter'
    };

    let _special     = null;   // active special weapon (null = normal gun only)
    let _bullets     = [];
    let _normalTimer = 0;
    let _shootSound  = 0;

    function _resetSpecials() {
        SpreadGun.reset(); LaserBeam.reset(); HomingMissile.reset(); PlasmaCannon.reset();
        LightningGun.reset(); IceCrystal.reset(); TwinSatellite.reset(); GravitonOrb.reset();
        ShatterBeam.reset();
    }

    function _refill(type) {
        switch (type) {
            case W.SPREAD:    SpreadGun.refill();     break;
            case W.LASER:     LaserBeam.refill();     break;
            case W.HOMING:    HomingMissile.refill(); break;
            case W.PLASMA:    PlasmaCannon.refill();  break;
            case W.LIGHTNING: LightningGun.refill();  break;
            case W.ICE:       IceCrystal.refill();    break;
            case W.SATELLITE: TwinSatellite.refill(); break;
            case W.GRAVITON:  GravitonOrb.refill();  break;
            case W.SHATTER:   ShatterBeam.refill();  break;
        }
    }

    return {
        W,
        init()  { _special = null; _bullets = []; _normalTimer = 0; _resetSpecials(); },
        reset() { _special = null; _bullets = []; _normalTimer = 0; _resetSpecials(); TwinSatellite.clearSats(); },

        setWeapon(type) {
            const prev = _special;
            _special = (type === W.NORMAL || !type) ? null : type;
            if (prev !== _special) {
                if (prev === W.LASER)     LaserBeam.deactivate();
                if (prev === W.SATELLITE) TwinSatellite.clearSats();
            }
            if (_special) _refill(_special);
        },
        getWeapon() { return _special || W.NORMAL; },

        update(dt, player, enemies, frameCount) {
            const pw = player.powerLevel;

            // ── Normal gun always fires ──────────────────────────────────
            _normalTimer += dt;
            while (_normalTimer >= 6) {
                _normalTimer -= 6;
                const nb = NormalGun.shoot(player);
                if (nb.length) {
                    _bullets.push(...nb);
                    if (_shootSound++ % 2 === 0) AudioManager.playShoot();
                }
            }

            // ── Special weapon (additive on top of normal) ───────────────
            if (_special) {
                switch (_special) {
                    case W.LASER:
                        LaserBeam.activate();
                        LaserBeam.update(dt, pw);
                        if (LaserBeam.isExhausted()) { _special = null; LaserBeam.deactivate(); }
                        else if (frameCount % 4 === 0) AudioManager.playLaser();
                        break;

                    case W.SPREAD: {
                        const nb = SpreadGun.shoot(player, pw);
                        if (nb.length) _bullets.push(...nb);
                        if (SpreadGun.isExhausted()) _special = null;
                        break;
                    }

                    case W.HOMING: {
                        const nb = HomingMissile.shoot(player, enemies, pw);
                        if (nb.length) { _bullets.push(...nb); AudioManager.playMissile(); }
                        if (HomingMissile.isExhausted()) _special = null;
                        break;
                    }

                    case W.PLASMA: {
                        const nb = PlasmaCannon.shoot(player, pw);
                        if (nb.length) { _bullets.push(...nb); AudioManager.playPlasma(); }
                        if (PlasmaCannon.isExhausted()) _special = null;
                        break;
                    }

                    case W.LIGHTNING: {
                        const nb = LightningGun.shoot(player, enemies);
                        if (nb.length) _bullets.push(...nb);
                        if (LightningGun.isExhausted()) _special = null;
                        break;
                    }

                    case W.ICE: {
                        const nb = IceCrystal.shoot(player, pw);
                        if (nb.length) _bullets.push(...nb);
                        if (IceCrystal.isExhausted()) _special = null;
                        break;
                    }

                    case W.SATELLITE: {
                        TwinSatellite.update(dt, player, enemies, pw);
                        const sb = TwinSatellite.collectBullets();
                        if (sb.length) _bullets.push(...sb);
                        if (TwinSatellite.isExhausted()) { _special = null; TwinSatellite.clearSats(); }
                        break;
                    }

                    case W.GRAVITON: {
                        const gb = GravitonOrb.shoot(player, pw);
                        if (gb.length) _bullets.push(...gb);
                        if (GravitonOrb.isExhausted()) _special = null;
                        break;
                    }

                    case W.SHATTER: {
                        const sb = ShatterBeam.shoot(player, pw);
                        if (sb.length) _bullets.push(...sb);
                        if (ShatterBeam.isExhausted()) _special = null;
                        break;
                    }
                }
            } else {
                // Cool down laser when not in use
                LaserBeam.deactivate();
                LaserBeam.update(dt, pw);
            }

            // ── Update all bullets ───────────────────────────────────────
            for (const b of _bullets) {
                if (!b.alive) continue;
                if (b.needsEnemies) b.update(dt, enemies);
                else b.update(dt);
            }
            _bullets = _bullets.filter(b => b.alive);
        },

        // Inject player bullets from external sources (e.g. pattern-based weapons)
        addBullets(arr) { if (arr && arr.length) _bullets.push(...arr); },

        draw(ctx, player, frameCount) {
            if (_special === W.LASER && LaserBeam.isActive()) {
                LaserBeam.draw(ctx, player.x, player.y, frameCount);
            }
            if (_special === W.SATELLITE) {
                TwinSatellite.draw(ctx, frameCount);
            }
            for (const b of _bullets) {
                if (b.alive && b.draw) b.draw(ctx);
            }
        },

        getBullets()    { return _bullets; },
        isLaserActive() { return _special === W.LASER && LaserBeam.isActive(); },

        getAmmoInfo() {
            if (!_special) return { cur: 0, max: 0, type: W.NORMAL };
            switch (_special) {
                case W.SPREAD:    return { cur: SpreadGun.getAmmo(),      max: SpreadGun.getMaxAmmo(),      type: W.SPREAD };
                case W.LASER:     return { cur: LaserBeam.getAmmo(),      max: LaserBeam.getMaxAmmo(),      type: W.LASER,  heat: LaserBeam.getHeat() };
                case W.HOMING:    return { cur: HomingMissile.getAmmo(),  max: HomingMissile.getMaxAmmo(),  type: W.HOMING };
                case W.PLASMA:    return { cur: PlasmaCannon.getAmmo(),   max: PlasmaCannon.getMaxAmmo(),   type: W.PLASMA };
                case W.LIGHTNING: return { cur: LightningGun.getAmmo(),   max: LightningGun.getMaxAmmo(),   type: W.LIGHTNING };
                case W.ICE:       return { cur: IceCrystal.getAmmo(),     max: IceCrystal.getMaxAmmo(),     type: W.ICE };
                case W.SATELLITE: return { cur: TwinSatellite.getAmmo(),  max: TwinSatellite.getMaxAmmo(),  type: W.SATELLITE };
                case W.GRAVITON:  return { cur: GravitonOrb.getAmmo(),   max: GravitonOrb.getMaxAmmo(),   type: W.GRAVITON };
                case W.SHATTER:   return { cur: ShatterBeam.getAmmo(),   max: ShatterBeam.getMaxAmmo(),   type: W.SHATTER };
                default:          return { cur: 0, max: 0, type: W.NORMAL };
            }
        }
    };
})();
