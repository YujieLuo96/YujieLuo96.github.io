var StageManager = (() => {
    let _stageIdx   = 0;
    let _waves      = [];
    let _waveIdx    = 0;
    let _timer      = 0;
    let _allSpawned = false;
    let _endless    = false;
    let _endlessDiff= 1;
    let _endlessTimer = 0;
    let _endlessBossTimer = 0;   // 无尽模式周期性 Boss 计时
    let _seenBossKinds = new Set();

    // 无尽模式 Boss 池：难度越高解锁越强的 Boss，可重复出场
    const _ENDLESS_BOSS_POOL = [
        'midboss', 'midboss2', 'boss1', 'boss2', 'boss3', 'boss4', 'boss5', 'boss6', 'boss7'
    ];
    const ENDLESS_BOSS_INTERVAL = 4200;  // 每 ~70 秒一只

    const _BOSS_KINDS = new Set([
        'midboss','midboss2','boss1','boss2','boss3','boss4','boss5','boss6','boss7'
    ]);

    function _spawnWave(wave) {
        if (!wave) return;
        // Skip if this boss type was already triggered (by power or an earlier wave)
        if (_BOSS_KINDS.has(wave.kind) && _seenBossKinds.has(wave.kind)) return;
        if (_BOSS_KINDS.has(wave.kind)) {
            _seenBossKinds.add(wave.kind);
            // 关卡波次出场的 Boss 同样需要警告横幅与音效（原先只有火力触发的有）
            if (typeof GameCore !== 'undefined' && GameCore.bossWarning) GameCore.bossWarning(wave.kind);
        }
        if (wave.formation) {
            EnemyManager.spawnFormation(wave.kind, wave.count || 1, wave.formation);
        } else {
            EnemyManager.spawnKind(wave.kind, wave.count || 1);
        }
    }

    function _endlessWave(diff) {
        const types = [
            'scout','scout','scout',
            'fighter','fighter',
            'bomber',
            'interceptor','interceptor',
            'drone','drone',
            'gunship',
            'elite',
            'predator',
            'carrier',
            'marauder',
            'spinner',
            'vanguard',
            'spectre',
            'devastator',
        ];
        const pool = types.slice(0, Math.min(types.length, 3 + diff));
        const kind  = pool[Math.floor(Math.random() * pool.length)];
        const count = 1 + Math.floor(Math.random() * (1 + Math.floor(diff / 2)));

        const formationMap = {
            scout:       ['line','V','pincer'],
            interceptor: ['sweep'],
            drone:       ['swarm'],
        };
        const fms = formationMap[kind];
        if (fms) {
            const fm = fms[Math.floor(Math.random() * fms.length)];
            EnemyManager.spawnFormation(kind, count, fm);
        } else {
            EnemyManager.spawnKind(kind, count);
        }
    }

    return {
        init() {
            _stageIdx = 0; _waves = []; _waveIdx = 0; _timer = 0;
            _allSpawned = false; _endless = false; _seenBossKinds = new Set();
        },

        startStage(idx) {
            _stageIdx      = idx;
            _waves         = StageData[idx] ? StageData[idx].waves : [];
            _waveIdx       = 0;
            _timer         = 0;
            _allSpawned    = false;
            _endless       = false;
        },

        startEndless() {
            _endless      = true;
            _endlessDiff  = 1;
            _endlessTimer = 0;
            _timer        = 0;
            _endlessBossTimer = 2400;   // 提前预热，首只 Boss 约 30 秒后登场
            _waveIdx      = 0;
            _allSpawned   = false;
        },

        markBossTriggered(kind) { _seenBossKinds.add(kind); },
        isBossSeen(kind)        { return _seenBossKinds.has(kind); },

        // 关卡推进进度 0..1（按最后一波的时间点计），无尽模式返回 null
        getProgress() {
            if (_endless || !_waves.length) return null;
            const last = _waves[_waves.length - 1].at;
            return last > 0 ? Math.min(1, _timer / last) : null;
        },

        update(dt, fc) {
            _timer += dt;

            if (_endless) {
                _endlessTimer += dt;
                const interval = Math.max(40, 180 - _endlessDiff * 8);
                if (_endlessTimer >= interval) {
                    _endlessTimer = 0;
                    _endlessWave(_endlessDiff);
                }
                _endlessDiff = 1 + Math.floor(_timer / 1800);

                // 周期性 Boss：难度逐步解锁更强的池，可重复（不受 _seenBossKinds 限制）
                _endlessBossTimer += dt;
                if (_endlessBossTimer >= ENDLESS_BOSS_INTERVAL && !EnemyManager.hasBoss()) {
                    _endlessBossTimer = 0;
                    const poolMax = Math.min(_ENDLESS_BOSS_POOL.length, 2 + _endlessDiff);
                    const kind = _ENDLESS_BOSS_POOL[Math.floor(Math.random() * poolMax)];
                    EnemyManager.spawnKind(kind, 1);
                    if (typeof GameCore !== 'undefined' && GameCore.bossWarning) GameCore.bossWarning(kind);
                }
                return;
            }

            while (_waveIdx < _waves.length && _timer >= _waves[_waveIdx].at) {
                _spawnWave(_waves[_waveIdx]);
                _waveIdx++;
            }
            if (_waveIdx >= _waves.length) _allSpawned = true;
        },

        isComplete()    { return _allSpawned && EnemyManager.isEmpty(); },
        isEndless()     { return _endless; },
        getStageIdx()   { return _stageIdx; },
        getStageName()  { return StageData[_stageIdx] ? StageData[_stageIdx].name : 'ENDLESS'; },
        getTotalStages(){ return StageData.length; }
    };
})();
