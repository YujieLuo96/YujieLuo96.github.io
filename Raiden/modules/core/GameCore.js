var GameCore = (() => {
    const STATE = { MENU:'menu', PLAYING:'playing', PAUSED:'paused', GAMEOVER:'gameover', INTERMISSION:'intermission' };

    // Boss summoned when player first reaches this power level
    const POWER_BOSS_TRIGGERS = [
        { power:  8,  kind: 'midboss'  },
        { power: 15,  kind: 'midboss2' },
        { power: 22,  kind: 'boss1'    },
        { power: 32,  kind: 'boss2'    },
        { power: 45,  kind: 'boss3'    },
        { power: 60,  kind: 'boss4'    },
        { power: 78,  kind: 'boss5'    },
        { power: 100, kind: 'boss6'    },
        { power: 128, kind: 'boss7'    },
    ];
    const POWER_BOSS_NAMES = {
        midboss: 'CRUISER', midboss2: 'COMMAND INTERCEPTOR',
        boss1: 'FORTRESS',  boss2: 'COLOSSUS',   boss3: 'CHAOS',
        boss4: 'THE VOID',  boss5: 'LEVIATHAN',  boss6: 'NEUTRON CLUSTER',
        boss7: 'CRIMSON SOVEREIGN'
    };

    let _state          = STATE.MENU;
    let _prevTime       = 0;
    let _dt             = 1;
    let _fc             = 0;

    let _score          = 0;
    let _highScore      = parseInt(localStorage.getItem('raidenHS') || '0', 10);
    let _lives          = 3;
    let _bombs          = 2;
    let _combo          = 0;
    let _comboTimer     = 0;
    let _comboMult      = 1;
    let _scoreMult      = 1;
    let _scoreMultTimer = 0;
    let _timeSlowActive = false;
    let _timeSlowTimer  = 0;
    let _debugMode          = false;
    let _bhDamageTimer      = 0;
    let _weaponFlash        = null;
    let _scoreNextMilestone = 10000;
    let _shakeAmt = 0;
    let _shakeDur = 0;
    let _shakeX   = 0;
    let _shakeY   = 0;

    // ── 单局战绩统计 ────────────────────────────────────────────────────
    let _kills     = 0;
    let _maxCombo  = 0;
    let _runFrames = 0;

    // ── 打击感：顿帧 + 受击红闪 ─────────────────────────────────────────
    let _hitStop  = 0;    // 大型击杀瞬间世界冻结帧数（渲染照常）
    let _dmgFlash = 0;    // 受击全屏红闪计时
    const DMG_FLASH_FRAMES = 14;

    // ── 过关结算横幅（INTERMISSION 状态） ───────────────────────────────
    const INTERMISSION_FRAMES = 230;
    let _imTimer = 0;
    let _imData  = null;   // { stageIdx, nextName, allClear, kills, timeSec }

    const _popups = [];

    // ── Helpers ─────────────────────────────────────────────────────────
    function _addScore(pts) {
        if (_state !== STATE.PLAYING) return 0;
        const earned = Math.round(pts * _comboMult * _scoreMult);
        _score += earned;
        if (_score > _highScore) {
            _highScore = _score;
            localStorage.setItem('raidenHS', _highScore);
        }
        while (_score >= _scoreNextMilestone) {
            _addPopup(Renderer.W / 2, Renderer.H / 2 - 50,
                `✦ ${(_scoreNextMilestone / 1000) | 0}K POINTS!`, '#ffe080');
            _scoreNextMilestone *= 2;
        }
        return earned;
    }

    function _addPopup(x, y, text, color) {
        _popups.push({ x, y, vy: -1.2, life: 70, maxLife: 70, text, color: color || '#ff8' });
    }

    function _shake(amt, dur) {
        if (amt > _shakeAmt) _shakeAmt = amt;
        if (dur > _shakeDur) _shakeDur = dur;
    }

    function _loseLife() {
        _lives--;
        if (_lives === 1) {
            _addPopup(Renderer.W / 2, Renderer.H / 2 - 30, '⚠ DANGER! LOW HEALTH!', '#ff4444');
        }
        _shake(10, 22);
        _dmgFlash = DMG_FLASH_FRAMES;
        AudioManager.playPlayerHit();
        ExplosionFX.playerHit(Player.x, Player.y);
        // 标准 STG 惯例：死亡瞬间清空全屏敌弹，避免复活即被残留弹幕秒杀
        EnemyManager.clearBullets();
        if (_lives <= 0) {
            _setState(STATE.GAMEOVER);
            AudioManager.playGameOver();
            AudioManager.stopBgm();
            _saveBestRun();
        } else {
            Player.restoreInvincibility();
        }
    }

    // ── 最佳战绩持久化（按分数判优） ────────────────────────────────────
    function _loadBestRun() {
        try { return JSON.parse(localStorage.getItem('raidenBest')) || null; }
        catch { return null; }
    }
    function _saveBestRun() {
        const best = _loadBestRun();
        if (best && _score <= (best.score || 0)) return;
        try {
            localStorage.setItem('raidenBest', JSON.stringify({
                score: _score, kills: _kills, combo: _maxCombo,
                timeSec: Math.floor(_runFrames / 60),
                stage: StageManager.getStageName(),
            }));
        } catch { /* ignore */ }
    }

    // Boss 出场统一警告：横幅 + 震屏 + 音效（供火力触发、关卡波次、无尽模式共用）
    function _bossWarning(kind) {
        _addPopup(Renderer.W / 2, Renderer.H / 3,
            `⚠ ${POWER_BOSS_NAMES[kind] || 'BOSS'}  INCOMING!`, '#ff3333');
        _shake(12, 30);
        AudioManager.playBossAppear();
    }

    function _isBossType(type) {
        return type === 'boss1' || type === 'boss2' || type === 'boss3' || type === 'boss4' ||
               type === 'boss5' || type === 'boss6' || type === 'boss7';
    }

    function _handleEnemyKill(enemy) {
        const base   = enemy.score || 0;
        _combo++;
        _kills++;
        if (_combo > _maxCombo) _maxCombo = _combo;
        _comboTimer  = 120;
        _comboMult   = Math.min(5, 1 + Math.floor(_combo / 8) * 0.5);
        const earned = _addScore(base);
        _addPopup(enemy.x, enemy.y - 20, `+${earned}`);

        if (_isBossType(enemy.type)) {
            ExplosionFX.boss(enemy.x, enemy.y);
            AudioManager.playBossDie();
            _hitStop = Math.max(_hitStop, 6);   // Boss 击杀顿帧
        } else if (enemy.type === 'midboss' || enemy.type === 'midboss2') {
            ExplosionFX.largeEnemy(enemy.x, enemy.y);
            AudioManager.playExplosion('large');
            _hitStop = Math.max(_hitStop, 3);
        } else if (enemy.type === 'bomber' || enemy.type === 'elite' ||
                   enemy.type === 'gunship' || enemy.type === 'predator' || enemy.type === 'carrier') {
            ExplosionFX.mediumEnemy(enemy.x, enemy.y);
            AudioManager.playExplosion('medium');
        } else {
            ExplosionFX.smallEnemy(enemy.x, enemy.y);
            AudioManager.playExplosion('small');
        }

        RewardManager.tryDrop(enemy);
    }

    function _doCollisions() {
        const enemies  = EnemyManager.getEnemies();
        const ebullets = EnemyManager.getEnemyBullets();
        const pbullets = WeaponManager.getBullets();
        const items    = RewardManager.getItems();
        const laserOn  = WeaponManager.isLaserActive();
        const px       = Player.x;
        const pb       = Player.getBounds();

        // ── Player bullets & laser vs enemies ──────────────────────────
        for (let ei = 0; ei < enemies.length; ei++) {
            const e = enemies[ei];
            if (!e.alive) continue;
            const eb = e.getBounds();

            if (laserOn && Math.abs(px - (eb.x + eb.w / 2)) < 20) {
                const dmg = LaserBeam.getDmgPerFrame() * _dt;
                if (e.takeDamage(dmg)) { _handleEnemyKill(e); continue; }
                ExplosionFX.bulletHit(eb.x + eb.w / 2, eb.y + eb.h);
            }

            for (let bi = 0; bi < pbullets.length; bi++) {
                const b = pbullets[bi];
                if (!b.alive) continue;
                const bb = b.getBounds();
                if (b.type === 'plasma') {
                    // 等离子弹：命中后触发爆炸（而非直接销毁），爆炸期间对范围内
                    // 每个敌人结算一次 AOE 伤害（hitSet 防止 14 帧爆炸窗口重复扣血）
                    if (!Collision.rectsOverlap(bb, eb)) continue;
                    if (!b.hitSet) b.hitSet = new Set();
                    if (b.hitSet.has(e)) continue;
                    if (!b.exploding) {
                        b.explode();
                        AudioManager.playExplosion(1);
                        _shake(5, 12);
                    }
                    b.hitSet.add(e);
                    if (e.takeDamage(b.damage)) { _handleEnemyKill(e); break; }
                    continue;
                }
                if (!Collision.rectsOverlap(bb, eb)) continue;
                const killed = e.takeDamage(b.damage);
                ExplosionFX.bulletHit(b.x, b.y);
                if (!b.piercing) b.alive = false;
                if (killed) { _handleEnemyKill(e); break; }
            }

            // Boss1 turrets
            if (e.type === 'boss1' && typeof e.getTurrets === 'function') {
                const turrets = e.getTurrets();
                for (const t of turrets) {
                    if (t.hp <= 0) continue;
                    const tb = t.getBounds(e.x, e.y);
                    if (laserOn && Math.abs(px - (tb.x + tb.w / 2)) < 16) {
                        t.hp -= LaserBeam.getDmgPerFrame() * _dt;
                        if (t.hp <= 0) ExplosionFX.mediumEnemy(e.x + t.ox, e.y + t.oy);
                    }
                    for (const b of pbullets) {
                        if (!b.alive) continue;
                        if (Collision.rectsOverlap(b.getBounds(), tb)) {
                            t.hp -= b.damage;
                            if (!b.piercing) b.alive = false;
                            if (t.hp <= 0) ExplosionFX.mediumEnemy(e.x + t.ox, e.y + t.oy);
                        }
                    }
                }
            }

            // Boss2 cannons
            if (e.type === 'boss2' && typeof e.getCannons === 'function') {
                const cannons = e.getCannons();
                for (const c of cannons) {
                    if (c.hp <= 0) continue;
                    const cb = c.getBounds(e.x, e.y);
                    if (laserOn && Math.abs(px - (cb.x + cb.w / 2)) < 16) {
                        c.hp -= LaserBeam.getDmgPerFrame() * _dt;
                        if (c.hp <= 0) ExplosionFX.mediumEnemy(e.x + c.ox, e.y + c.oy);
                    }
                    for (const b of pbullets) {
                        if (!b.alive) continue;
                        if (Collision.rectsOverlap(b.getBounds(), cb)) {
                            c.hp -= b.damage;
                            if (!b.piercing) b.alive = false;
                            if (c.hp <= 0) ExplosionFX.mediumEnemy(e.x + c.ox, e.y + c.oy);
                        }
                    }
                }
            }
        }

        // ── Graviton orbs: pull force + periodic lightning strikes ─────
        for (const b of pbullets) {
            if (!b.alive || b.type !== 'graviton') continue;
            b.lightningTimer -= _dt;
            const isStrike = b.lightningTimer <= 0;
            if (isStrike) b.lightningTimer = b.strikeInterval;

            for (const e of enemies) {
                if (!e.alive) continue;
                const dx   = b.x - e.x;
                const dy   = b.y - e.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Gravity pull toward orb center
                if (dist < b.pullRadius && dist > 1) {
                    const force = 3.0 * (1 - dist / b.pullRadius) * _dt;
                    e.x += (dx / dist) * force;
                    e.y += (dy / dist) * force;
                }

                // Lightning strike damage
                if (isStrike && dist < b.strikeRadius) {
                    const killed = e.takeDamage(b.strikeDmg);
                    b.addArcTarget(e.x, e.y);
                    ParticleSystem.spawn(e.x, e.y,
                        { count: 6, colors: ['#cc40ff','#9010ee','#fff'], speed: 3, life: 14 });
                    ExplosionFX.bulletHit(e.x, e.y);
                    if (killed) _handleEnemyKill(e);
                }
            }
        }

        // ── Enemy bullets vs player ────────────────────────────────────
        if (!_debugMode && Player.invincibleTimer <= 0) {
            for (let i = 0; i < ebullets.length; i++) {
                const b = ebullets[i];
                if (!b.alive) continue;
                if (Collision.circleRect(b.x, b.y, b.radius, pb)) {
                    b.alive = false;
                    if (Player.hasShield()) {
                        Player.breakShield();
                        AudioManager.playShieldBreak();
                        ExplosionFX.shieldBreak(Player.x, Player.y);
                    } else {
                        if (Player.takeDamage()) _loseLife();
                    }
                }
            }
        }

        // ── Enemy body vs player ───────────────────────────────────────
        if (!_debugMode && Player.invincibleTimer <= 0) {
            for (const e of enemies) {
                if (!e.alive || !e.enteredScreen) continue;
                if (Collision.rectsOverlap(pb, e.getBounds())) {
                    if (Player.takeDamage()) _loseLife();
                    break;
                }
            }
        }

        // ── Items vs player ────────────────────────────────────────────
        const pcx = pb.x + pb.w / 2;
        const pcy = pb.y + pb.h / 2;
        for (const it of items) {
            if (it.alive && Collision.circleRect(pcx, pcy, 22, it.getBounds())) {
                it.collect();
            }
        }
    }

    // ── Item events ──────────────────────────────────────────────────────
    function _bindItemEvents() {
        EventBus.on('item:power',      () => {
            Player.addPower(1);
            AudioManager.playCollect();
            _addPopup(Player.x, Player.y - 34, `▲ PWR LV.${Player.powerLevel}`, '#9f8');
        });
        EventBus.on('item:bomb',       () => { _bombs = Math.min(5, _bombs + 1); AudioManager.playCollect(); });
        EventBus.on('item:health',     () => { _lives = Math.min(5, _lives + 1); AudioManager.playCollect(); });
        EventBus.on('item:shield',     () => { Player.activateShield(600); AudioManager.playCollect(); });
        EventBus.on('item:timeslow',   () => { _timeSlowActive = true; _timeSlowTimer = 480; AudioManager.playCollect(); });
        EventBus.on('item:multiplier', () => { _scoreMult = 2; _scoreMultTimer = 600; AudioManager.playCollect(); });
        EventBus.on('item:megabomb',   () => { _useBomb(true); });
        EventBus.on('item:spread_w',    () => { WeaponManager.setWeapon('spread');    AudioManager.playWeaponGet(); _weaponFlash = { type:'spread',    label:'SPREAD GUN',      timer:120 }; });
        EventBus.on('item:laser_w',     () => { WeaponManager.setWeapon('laser');     AudioManager.playWeaponGet(); _weaponFlash = { type:'laser',     label:'LASER BEAM',      timer:120 }; });
        EventBus.on('item:homing_w',    () => { WeaponManager.setWeapon('homing');    AudioManager.playWeaponGet(); _weaponFlash = { type:'homing',    label:'HOMING MISSILE',  timer:120 }; });
        EventBus.on('item:plasma_w',    () => { WeaponManager.setWeapon('plasma');    AudioManager.playWeaponGet(); _weaponFlash = { type:'plasma',    label:'PLASMA CANNON',   timer:120 }; });
        EventBus.on('item:lightning_w', () => { WeaponManager.setWeapon('lightning'); AudioManager.playWeaponGet(); _weaponFlash = { type:'lightning', label:'LIGHTNING GUN',   timer:120 }; });
        EventBus.on('item:ice_w',       () => { WeaponManager.setWeapon('ice');       AudioManager.playWeaponGet(); _weaponFlash = { type:'ice',       label:'ICE CRYSTAL',     timer:120 }; });
        EventBus.on('item:satellite_w', () => { WeaponManager.setWeapon('satellite'); AudioManager.playWeaponGet(); _weaponFlash = { type:'satellite', label:'TWIN SATELLITE',  timer:120 }; });
        EventBus.on('item:graviton_w',  () => { WeaponManager.setWeapon('graviton');  AudioManager.playWeaponGet(); _weaponFlash = { type:'graviton',  label:'GRAVITON ORB',    timer:120 }; });
    }

    function _bindInputEvents() {
        EventBus.on('input:keydown', (key) => {
            // 图鉴优先拦截：打开状态下其余按键（含 Space/P）不应触发游戏操作
            if (key === 'm' || key === 'M') { Codex.toggle(); return; }
            if (Codex.isOpen()) { Codex.handleKey(key); return; }

            if (key === ' ' || key === 'Space') {
                if (_state === STATE.PLAYING)  _useBomb(false);
                else if (_state === STATE.MENU || _state === STATE.GAMEOVER) _startGame();
                else if (_state === STATE.PAUSED) _setState(STATE.PLAYING);
            }
            if (key === 'p' || key === 'P' || key === 'Escape') {
                if (_state === STATE.PLAYING)  _setState(STATE.PAUSED);
                else if (_state === STATE.PAUSED) _setState(STATE.PLAYING);
            }
            if (key === 't' || key === 'T') { _debugMode = !_debugMode; }
            if (key === 'n' || key === 'N') {
                const m = AudioManager.toggleMuted();
                _addPopup(Renderer.W / 2, Renderer.H / 2, m ? '◈ SOUND OFF' : '◈ SOUND ON', '#8ff');
            }

            // ── Debug-mode controls ─────────────────────────────────────
            if (_debugMode) {
                if (key === '[') Player.setPower(Math.max(1, Player.powerLevel - 1));
                if (key === ']') Player.setPower(Player.powerLevel + 1);
                if (key === '{') Player.setPower(Math.max(1, Player.powerLevel - 10));
                if (key === '}') Player.setPower(Player.powerLevel + 10);
                if (key === '1') WeaponManager.setWeapon('normal');
                if (key === '2') WeaponManager.setWeapon('spread');
                if (key === '3') WeaponManager.setWeapon('laser');
                if (key === '4') WeaponManager.setWeapon('homing');
                if (key === '5') WeaponManager.setWeapon('plasma');
                if (key === '6') WeaponManager.setWeapon('lightning');
                if (key === '7') WeaponManager.setWeapon('ice');
                if (key === '8') WeaponManager.setWeapon('satellite');
                if (key === '9') WeaponManager.setWeapon('graviton');
                if (key === 'l' || key === 'L') EnemyManager.spawnKind('boss5', 1);
                if (key === 'k' || key === 'K') EnemyManager.spawnKind('boss6', 1);
                if (key === 'j' || key === 'J') EnemyManager.spawnKind('boss7', 1);
                if (key === 'h' || key === 'H') { EnemyManager.spawnKind('spectre', 1); EnemyManager.spawnKind('devastator', 1); }
                if (key === 'g' || key === 'G') { EnemyManager.spawnKind('marauder', 2); EnemyManager.spawnKind('spinner', 2); EnemyManager.spawnKind('vanguard', 1); }
            }
        });
        EventBus.on('input:tap', () => {
            if (_state === STATE.MENU || _state === STATE.GAMEOVER) _startGame();
        });
    }

    function _useBomb(free) {
        if (!free && _bombs <= 0) return;
        if (!free) _bombs--;
        const enemies  = EnemyManager.getEnemies();
        const ebullets = EnemyManager.getEnemyBullets();
        for (const b of ebullets) b.alive = false;
        for (const e of enemies) {
            if (e.alive) {
                // 中型 Boss 同样受钳制伤害，避免一颗炸弹直接秒杀 45/60 HP 的 midboss
                const capped = _isBossType(e.type) || e.type === 'midboss' || e.type === 'midboss2';
                const killed = e.takeDamage(capped ? 20 : e.maxHp);
                if (killed) _handleEnemyKill(e);
            }
        }
        ExplosionFX.bomb(Player.x, Player.y);   // 冲击波从机体位置扩散
        _shake(14, 30);
        AudioManager.playBomb();
    }

    // ── State machine ────────────────────────────────────────────────────
    function _setState(s) { _state = s; }

    function _startGame() {
        _score          = 0;
        _lives          = PlayerConfig.initialLives;
        _bombs          = PlayerConfig.initialBombs;
        _combo          = 0;
        _comboTimer     = 0;
        _comboMult      = 1;
        _scoreMult      = 1;
        _scoreMultTimer = 0;
        _timeSlowActive     = false;
        _timeSlowTimer      = 0;
        _bhDamageTimer      = 0;
        _weaponFlash        = null;
        _scoreNextMilestone = 10000;
        _popups.length      = 0;
        _kills              = 0;
        _maxCombo           = 0;
        _runFrames          = 0;
        _imTimer            = 0;
        _imData             = null;
        _hitStop            = 0;
        _dmgFlash           = 0;
        Player.reset();
        WeaponManager.reset();
        EnemyManager.reset();
        RewardManager.reset();
        ParticleSystem.clear();
        ExplosionFX.clear();
        StageManager.init();            // 清空 Boss 已见集合（火力触发去重也依赖它）
        _startStage(0);
        _setState(STATE.PLAYING);
        AudioManager.startBgm('stage');
    }

    function _startStage(idx) {
        StageManager.startStage(idx);
        EnemyManager.reset();
        const scene = (StageData[idx] && StageData[idx].scene) ? StageData[idx].scene : 'space';
        BackgroundManager.switchTo(scene);
    }

    function _startEndless() {
        StageManager.startEndless();
        EnemyManager.reset();
        BackgroundManager.switchTo('blackhole');
    }

    function _doEnvironment(dt) {
        const bh = BackgroundManager.getBlackhole();
        if (!bh) return;
        const { x: bhx, y: bhy, pullRadius, damageRadius } = bh;
        const enemies = EnemyManager.getEnemies();

        // Pull & damage enemies
        for (const e of enemies) {
            if (!e.alive) continue;
            const dx   = bhx - e.x, dy = bhy - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < pullRadius && dist > 1) {
                const force = 0.6 * (1 - dist / pullRadius) * dt;
                e.x += (dx / dist) * force;
                e.y += (dy / dist) * force;
            }
            if (dist < damageRadius) {
                const dmg = _isBossType(e.type) ? 1.2 * dt : e.maxHp;
                if (e.takeDamage(dmg)) _handleEnemyKill(e);
            }
        }

        // Pull player
        const pdx   = bhx - Player.x, pdy = bhy - Player.y;
        const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pdist < pullRadius && pdist > 1) {
            const force = 0.28 * (1 - pdist / pullRadius) * dt;
            Player.nudge((pdx / pdist) * force, (pdy / pdist) * force);
        }

        // Damage player within event horizon
        if (!_debugMode) {
            _bhDamageTimer -= dt;
            if (_bhDamageTimer <= 0 && pdist < damageRadius) {
                _bhDamageTimer = 110;
                if (Player.takeDamage()) _loseLife();
            }
        }
    }

    // ── Main loop ────────────────────────────────────────────────────────
    function _update(rawDt) {
        const slowFactor = _timeSlowActive ? 0.38 : 1;
        _dt = rawDt * slowFactor;

        if (_timeSlowActive) {
            _timeSlowTimer -= rawDt;
            if (_timeSlowTimer <= 0) _timeSlowActive = false;
        }
        if (_scoreMult > 1) {
            _scoreMultTimer -= rawDt;
            if (_scoreMultTimer <= 0) _scoreMult = 1;
        }

        // 受击红闪衰减（不受暂停/顿帧影响，始终自然消退）
        if (_dmgFlash > 0) _dmgFlash -= rawDt;

        // Screen shake
        if (_shakeDur > 0) {
            _shakeDur -= rawDt;
            const mag = _shakeAmt * (_shakeDur / 22);
            _shakeX = (Math.random() * 2 - 1) * mag;
            _shakeY = (Math.random() * 2 - 1) * mag;
        } else {
            _shakeX = _shakeY = _shakeAmt = 0;
        }

        BackgroundManager.update(rawDt);

        if (Codex.isOpen()) { Codex.update(rawDt); return; }

        // ── 过关结算横幅：战场静默推进，倒计时结束后切入下一关/无尽 ────
        if (_state === STATE.INTERMISSION) {
            _fc++;
            Player.update(_dt, _fc);
            WeaponManager.update(_dt, Player, EnemyManager.getEnemies(), _fc);
            RewardManager.update(_dt, _fc);
            ParticleSystem.update(_dt);
            ExplosionFX.update(_dt);
            for (let i = _popups.length - 1; i >= 0; i--) {
                const p = _popups[i];
                p.y += p.vy; p.life -= _dt;
                if (p.life <= 0) _popups.splice(i, 1);
            }
            _imTimer -= rawDt;
            if (_imTimer <= 0) {
                if (_imData && _imData.allClear) _startEndless();
                else _startStage(_imData ? _imData.stageIdx + 1 : 0);
                _imData = null;
                _setState(STATE.PLAYING);
            }
            return;
        }

        if (_state !== STATE.PLAYING) return;

        _fc++;
        _runFrames += rawDt;

        // BGM 情绪跟随战况：有 Boss 时切换为紧张曲目
        AudioManager.setBgmMood(EnemyManager.hasBoss() ? 'boss' : 'stage');

        // 顿帧：大型击杀瞬间世界冻结数帧（渲染继续），强化打击感
        if (_hitStop > 0) { _hitStop -= rawDt; return; }

        if (_comboTimer > 0) {
            _comboTimer -= _dt;
            if (_comboTimer <= 0) { _combo = 0; _comboMult = 1; }
        }

        for (let i = _popups.length - 1; i >= 0; i--) {
            const p = _popups[i];
            p.y += p.vy;
            p.life -= _dt;
            if (p.life <= 0) _popups.splice(i, 1);
        }

        Player.update(_dt, _fc);

        // Power-level boss triggers — one boss at a time, each kind only once per run.
        // 去重统一走 StageManager 的集合：关卡波次已出过的 Boss 不会因火力达标再刷一次
        if (!EnemyManager.hasBoss()) {
            const pw = Player.powerLevel;
            for (const tb of POWER_BOSS_TRIGGERS) {
                if (pw >= tb.power && !StageManager.isBossSeen(tb.kind)) {
                    StageManager.markBossTriggered(tb.kind);
                    EnemyManager.spawnKind(tb.kind, 1);
                    _bossWarning(tb.kind);
                    break;
                }
            }
        }

        _doEnvironment(_dt);
        if (_weaponFlash && _weaponFlash.timer > 0) _weaponFlash.timer -= _dt;
        StageManager.update(_dt, _fc);
        WeaponManager.update(_dt, Player, EnemyManager.getEnemies(), _fc);
        EnemyManager.update(_dt, _fc);
        RewardManager.update(_dt, _fc);
        ParticleSystem.update(_dt);
        ExplosionFX.update(_dt);

        _doCollisions();

        // Stage completion → 进入结算横幅（INTERMISSION），数秒后自动切换
        if (!StageManager.isEndless() && StageManager.isComplete()) {
            const si       = StageManager.getStageIdx();
            const allClear = si + 1 >= StageManager.getTotalStages();
            _imData = {
                stageIdx: si,
                allClear,
                nextName: allClear ? 'ENDLESS MODE'
                                   : (StageData[si + 1] ? StageData[si + 1].name : ''),
                kills:    _kills,
                timeSec:  Math.floor(_runFrames / 60),
            };
            _imTimer = INTERMISSION_FRAMES;
            AudioManager.playStageClear();
            _setState(STATE.INTERMISSION);
        }
    }

    function _draw(ctx) {
        Renderer.clear();

        ctx.save();
        if (_shakeX || _shakeY) ctx.translate(_shakeX, _shakeY);

        BackgroundManager.draw(ctx);
        RewardManager.draw(ctx, _fc);
        EnemyManager.drawEnemyBullets(ctx);
        WeaponManager.draw(ctx, Player, _fc);
        EnemyManager.drawEnemies(ctx, _dt, _fc);

        if (_state === STATE.PLAYING || _state === STATE.INTERMISSION) {
            Player.draw(ctx, _fc);
        }

        ParticleSystem.draw(ctx);
        ExplosionFX.draw(ctx);

        // Score popups
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        for (const p of _popups) {
            ctx.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.4));
            ctx.font        = 'bold 13px "Courier New",monospace';
            ctx.fillStyle   = p.color;
            ctx.fillText(p.text, p.x, p.y);
        }
        ctx.globalAlpha = 1;

        ctx.restore();

        // ── Debug panel (no shake, always on top) ───────────────────────
        if (_debugMode) {
            const pw  = Player.powerLevel;
            const cur = WeaponManager.getWeapon();
            const px  = Renderer.W - 148, py = 56;

            // Panel background
            ctx.fillStyle   = 'rgba(0,10,0,0.82)';
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth   = 1;
            ctx.beginPath(); ctx.roundRect(px - 6, py - 6, 148, 249, 4); ctx.fill(); ctx.stroke();

            ctx.font         = 'bold 10px "Courier New",monospace';
            ctx.textBaseline = 'top';
            ctx.textAlign    = 'left';

            // Title
            ctx.fillStyle = '#0f0';
            ctx.fillText('▶ TEST MODE  [T]', px, py);

            // Power level row
            ctx.fillStyle = '#aaa';
            ctx.fillText('PWR LEVEL:', px, py + 16);
            ctx.fillStyle = '#ff8';
            ctx.font = 'bold 13px "Courier New",monospace';
            ctx.fillText(`${pw}`, px + 74, py + 14);
            ctx.font = 'bold 10px "Courier New",monospace';
            ctx.fillStyle = '#666';
            ctx.fillText('[  ] ±1   {  } ±10', px, py + 30);

            // Spectrum color bar (Lv 21-100)
            const barW = 136, barH = 7;
            const barX = px, barY = py + 44;
            for (let i = 0; i < barW; i++) {
                const t   = i / barW;
                ctx.fillStyle = `hsl(${Math.round(t * 270)},100%,62%)`;
                ctx.fillRect(barX + i, barY, 1, barH);
            }
            // Cursor on bar
            const clampedPw = Math.max(21, Math.min(100, pw));
            const cursorT   = (clampedPw - 21) / 79;
            const cursorX   = barX + Math.round(cursorT * barW);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cursorX, barY - 2); ctx.lineTo(cursorX, barY + barH + 2); ctx.stroke();
            // Labels
            ctx.fillStyle = '#555'; ctx.font = '9px "Courier New",monospace';
            ctx.fillText('21', barX, barY + barH + 2);
            ctx.textAlign = 'right';
            ctx.fillText('100', barX + barW, barY + barH + 2);
            ctx.textAlign = 'left';
            ctx.font = 'bold 10px "Courier New",monospace';

            // Weapon selector
            ctx.fillStyle = '#aaa';
            ctx.fillText('WEAPON:', px, py + 68);
            const WEAPONS = [
                ['1', 'NORMAL',    'normal',    '#7ef'],
                ['2', 'SPREAD',    'spread',    '#4af'],
                ['3', 'LASER',     'laser',     '#4f8'],
                ['4', 'HOMING',    'homing',    '#c4f'],
                ['5', 'PLASMA',    'plasma',    '#f55'],
                ['6', 'LIGHTNING', 'lightning', '#fff8a0'],
                ['7', 'ICE',       'ice',       '#a0f0ff'],
                ['8', 'SATELLITE', 'satellite', '#ffb830'],
                ['9', 'GRAVITON',  'graviton',  '#cc60ff'],
            ];
            WEAPONS.forEach(([k, label, type, col], i) => {
                const active = cur === type;
                const wy = py + 82 + i * 17;
                if (active) {
                    ctx.fillStyle = 'rgba(255,255,100,0.15)';
                    ctx.fillRect(px - 2, wy - 1, 140, 15);
                }
                ctx.fillStyle = '#555';
                ctx.fillText(`[${k}]`, px, wy);
                ctx.fillStyle = active ? col : '#888';
                ctx.fillText(label, px + 26, wy);
                if (active) {
                    ctx.fillStyle = '#ff8';
                    ctx.fillText('◀', px + 130, wy);
                }
            });
        }

        // HUD + overlays (no shake)
        const _bh  = BackgroundManager.getBlackhole();
        const _bhW = (() => {
            if (!_bh || _state !== STATE.PLAYING) return null;
            const dx = _bh.x - Player.x, dy = _bh.y - Player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist >= _bh.pullRadius) return null;
            return { angle: Math.atan2(dy, dx), intensity: 1 - dist / _bh.pullRadius };
        })();
        const gd = {
            score: _score, highScore: _highScore,
            lives: _lives, bombs: _bombs,
            combo: _combo, comboMult: _comboMult,
            comboTimer: _comboTimer, comboMax: 120,
            scoreMultiplier: _scoreMult, multiplierTimer: _scoreMultTimer,
            timeSlowActive: _timeSlowActive, timeSlowTimer: _timeSlowTimer,
            ammoInfo: WeaponManager.getAmmoInfo(),
            frameCount: _fc,
            shieldTimer: Player.getShieldTimer(),
            powerLevel: Player.powerLevel,
            stageName: StageManager.getStageName(),
            weaponFlash: _weaponFlash,
            bhWarning: _bhW,
            stageProgress: StageManager.getProgress(),
            muted: AudioManager.isMuted(),
            dmgFlash: Math.max(0, _dmgFlash / DMG_FLASH_FRAMES)
        };
        UIRenderer.draw(ctx, gd);
        Codex.draw(ctx);

        if (_state === STATE.MENU)     UIRenderer.drawMenu(ctx, _fc, _loadBestRun());
        if (_state === STATE.PAUSED)   UIRenderer.drawPause(ctx);
        if (_state === STATE.INTERMISSION && _imData) {
            UIRenderer.drawStageClear(ctx, _imData, _fc, _imTimer / INTERMISSION_FRAMES);
        }
        if (_state === STATE.GAMEOVER) {
            UIRenderer.drawGameOver(ctx, _score, _highScore, {
                kills: _kills, combo: _maxCombo,
                timeSec: Math.floor(_runFrames / 60),
                stage: StageManager.getStageName(),
            });
        }
    }

    function _loop(ts) {
        const rawDt = Math.min((ts - _prevTime) / (1000 / 60), 3);
        _prevTime = ts;
        _update(rawDt);
        _draw(Renderer.getCtx());
        requestAnimationFrame(_loop);
    }

    // ── Public API ───────────────────────────────────────────────────────
    return {
        init(cfg) {
            Renderer.init(cfg.canvas);
            InputManager.init(cfg.canvas);
            AudioManager.init();           // 原版漏掉了：AudioContext 解锁监听从未挂载
            BackgroundManager.init();
            ParticleSystem.init();
            WeaponManager.init();
            EnemyManager.init();
            RewardManager.init();
            StageManager.init();
            _bindItemEvents();
            _bindInputEvents();
            cfg.canvas.addEventListener('wheel', e => {
                if (Codex.isOpen()) { Codex.scroll(e.deltaY * 0.5); e.preventDefault(); }
            }, { passive: false });
        },

        start() {
            BackgroundManager.switchTo('space');
            requestAnimationFrame((ts) => { _prevTime = ts; requestAnimationFrame(_loop); });
        },

        getDt()         { return _dt; },
        getFrameCount() { return _fc; },
        getState()      { return _state; },
        addScore(pts)   { return _addScore(pts); },
        addLife()       { _lives = Math.min(5, _lives + 1); },
        addBomb()       { _bombs = Math.min(5, _bombs + 1); },
        useBomb()       { _useBomb(false); },
        activateTimeSlow(frames)       { _timeSlowActive = true; _timeSlowTimer = frames || 480; },
        activateMultiplier(m, frames)  { _scoreMult = m || 2; _scoreMultTimer = frames || 600; },
        shake(amt, dur) { _shake(amt, dur); },
        addPopup(x, y, text, color) { _addPopup(x, y, text, color); },
        bossWarning(kind) { _bossWarning(kind); }
    };
})();
