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
        'midboss', 'midboss2', 'boss1', 'boss2', 'boss3', 'boss4', 'boss5', 'boss6', 'boss7', 'boss8'
    ];
    const ENDLESS_BOSS_INTERVAL = 4200;  // 每 ~70 秒一只

    const _BOSS_KINDS = new Set([
        'midboss','midboss2','boss1','boss2','boss3','boss4','boss5','boss6','boss7','boss8'
    ]);
    // 仅大型唯一 Boss 参与全局去重；midboss/midboss2 是各关复用的常规遭遇
    const _MAJOR_BOSS_KINDS = new Set([
        'boss1','boss2','boss3','boss4','boss5','boss6','boss7','boss8'
    ]);

    function _spawnWave(wave) {
        if (!wave) return;
        const major = _MAJOR_BOSS_KINDS.has(wave.kind);
        // 仅大型 Boss(boss1-8) 全局去重（避免火力触发与波次重复刷同一只）；
        // 原本把 midboss/midboss2 也去重，导致后续关卡的中型 Boss 波次被静默跳过（audit bug）
        if (major && _seenBossKinds.has(wave.kind)) return;
        if (_BOSS_KINDS.has(wave.kind)) {
            if (major) _seenBossKinds.add(wave.kind);
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
            'weaver',
            'vanguard',
            'siren',
            'splitter',
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
            siren:       ['line'],
            weaver:      ['arc','grid'],
            splitter:    ['grid','diagonal'],
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

                // 无尽参数化缩放：血量每档 +7%（≤2.2x）、弹速每档 +3%（≤1.5x）→ 后期真正有压力
                EnemyManager.setEndlessScale(
                    Math.min(2.2, 1 + _endlessDiff * 0.07),
                    Math.min(1.5, 1 + _endlessDiff * 0.03)
                );

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
