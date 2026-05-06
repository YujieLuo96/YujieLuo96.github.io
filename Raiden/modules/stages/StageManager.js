var StageManager = (() => {
    let _stageIdx   = 0;
    let _waves      = [];
    let _waveIdx    = 0;
    let _timer      = 0;
    let _allSpawned = false;
    let _endless    = false;
    let _endlessDiff= 1;
    let _endlessTimer = 0;
    let _seenBossKinds = new Set();

    const _BOSS_KINDS = new Set([
        'midboss','midboss2','boss1','boss2','boss3','boss4','boss5','boss6','boss7'
    ]);

    function _spawnWave(wave) {
        if (!wave) return;
        // Skip if this boss type was already triggered (by power or an earlier wave)
        if (_BOSS_KINDS.has(wave.kind) && _seenBossKinds.has(wave.kind)) return;
        if (_BOSS_KINDS.has(wave.kind)) _seenBossKinds.add(wave.kind);
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
            _waveIdx      = 0;
            _allSpawned   = false;
        },

        markBossTriggered(kind) { _seenBossKinds.add(kind); },

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
