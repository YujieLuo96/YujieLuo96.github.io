var AudioManager = (() => {
    let _ctx = null;
    let _muted = false;
    let _master = null;   // 总线：静音/总音量统一控制
    let _sfxBus = null;
    let _bgmBus = null;

    function _ac() {
        if (!_ctx) {
            _ctx = new (window.AudioContext || window.webkitAudioContext)();
            _master = _ctx.createGain(); _master.gain.value = 1;    _master.connect(_ctx.destination);
            _sfxBus = _ctx.createGain(); _sfxBus.gain.value = 1;    _sfxBus.connect(_master);
            _bgmBus = _ctx.createGain(); _bgmBus.gain.value = 0.55; _bgmBus.connect(_master);
        }
        return _ctx;
    }

    function _beep(freq, type, dur, vol, delay = 0) {
        if (_muted) return;
        try {
            const ac  = _ac();
            const osc = ac.createOscillator();
            const gain= ac.createGain();
            osc.connect(gain); gain.connect(_sfxBus);
            osc.type = type || 'square';
            osc.frequency.setValueAtTime(freq, ac.currentTime + delay);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ac.currentTime + delay + dur);
            gain.gain.setValueAtTime(vol || 0.08, ac.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + dur);
            osc.start(ac.currentTime + delay);
            osc.stop(ac.currentTime + delay + dur);
        } catch (e) { /* ignore */ }
    }

    function _noise(dur, vol, freq) {
        if (_muted) return;
        try {
            const ac   = _ac();
            const rate = ac.sampleRate;
            const buf  = ac.createBuffer(1, Math.floor(rate * dur), rate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
            const src  = ac.createBufferSource();
            src.buffer = buf;
            const gain = ac.createGain();
            const filt = ac.createBiquadFilter();
            filt.type = 'bandpass';
            filt.frequency.value = freq || 200;
            filt.Q.value = 0.5;
            src.connect(filt); filt.connect(gain); gain.connect(_sfxBus);
            gain.gain.setValueAtTime(vol || 0.2, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
            src.start(); src.stop(ac.currentTime + dur);
        } catch (e) { /* ignore */ }
    }

    // ════════════════════════════════════════════════════════════════════
    //  程序化 BGM：16 步音序器（前瞻调度），三种情绪
    //  音高 = 半音离 A2(110Hz) 的偏移；null = 休止
    // ════════════════════════════════════════════════════════════════════
    const _SONGS = {
        // 菜单：缓慢的小调铺底
        menu: {
            bpm: 72, root: 0,
            bass: [0, null, null, null, 7, null, null, null, 3, null, null, null, 5, null, 7, null],
            bassType: 'triangle', bassVol: 0.10, bassLen: 1.6,
            lead: [12, null, null, null, null, null, 15, null, null, null, 19, null, null, 15, null, null],
            leadType: 'sine', leadVol: 0.05, leadLen: 1.4,
            hat: false,
        },
        // 关卡：A 小调驱动型琶音
        stage: {
            bpm: 116, root: 0,
            bass: [0, 0, 12, 0, 3, 3, 15, 3, 5, 5, 17, 5, 3, 3, 10, 7],
            bassType: 'triangle', bassVol: 0.13, bassLen: 0.9,
            lead: [null, 12, null, 15, null, 19, null, 15, null, 12, null, 17, null, 15, null, 10],
            leadType: 'square', leadVol: 0.028, leadLen: 0.5,
            hat: true,
        },
        // Boss：D 根音 + 减五度的紧张推进
        boss: {
            bpm: 148, root: 5,
            bass: [0, 0, 6, 0, 0, 8, 6, 0, 0, 0, 6, 0, 10, 8, 6, 1],
            bassType: 'sawtooth', bassVol: 0.10, bassLen: 0.85,
            lead: [12, null, 18, null, 12, null, 20, 18, 12, null, 18, null, 24, null, 20, 18],
            leadType: 'square', leadVol: 0.030, leadLen: 0.45,
            hat: true,
        },
    };

    let _bgmOn = false;
    let _mood = 'stage';
    let _nextNoteTime = 0;
    let _step = 0;
    let _schedTimer = null;

    function _freq(root, n) { return 110 * Math.pow(2, (root + n) / 12); }

    function _bgmNote(freq, type, dur, vol, when) {
        const ac  = _ac();
        const osc = ac.createOscillator();
        const g   = ac.createGain();
        osc.connect(g); g.connect(_bgmBus);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, when);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(vol, when + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        osc.start(when);
        osc.stop(when + dur + 0.02);
    }

    function _bgmHat(when) {
        const ac  = _ac();
        const len = 0.04;
        const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate);
        const d   = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = ac.createBufferSource(); src.buffer = buf;
        const f   = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
        const g   = ac.createGain(); g.gain.value = 0.05;
        src.connect(f); f.connect(g); g.connect(_bgmBus);
        src.start(when);
    }

    function _schedule() {
        if (!_bgmOn || _muted || document.hidden) return;
        try {
            const ac   = _ac();
            const song = _SONGS[_mood] || _SONGS.stage;
            const stepDur = 60 / song.bpm / 2;     // 八分音符一步
            // 落后太多（标签页切回等）则跳到当前时间
            if (_nextNoteTime < ac.currentTime - 0.25) _nextNoteTime = ac.currentTime + 0.05;
            while (_nextNoteTime < ac.currentTime + 0.14) {
                const i = _step % 16;
                const b = song.bass[i];
                if (b !== null && b !== undefined) {
                    _bgmNote(_freq(song.root, b) / 2, song.bassType, stepDur * song.bassLen, song.bassVol, _nextNoteTime);
                }
                const l = song.lead[i];
                if (l !== null && l !== undefined) {
                    _bgmNote(_freq(song.root, l), song.leadType, stepDur * song.leadLen, song.leadVol, _nextNoteTime);
                }
                if (song.hat && (i % 2 === 0)) _bgmHat(_nextNoteTime);
                _nextNoteTime += stepDur;
                _step++;
            }
        } catch (e) { /* ignore */ }
    }

    return {
        init() {
            // 首次用户交互时解锁 AudioContext
            const unlock = () => { try { _ac().resume(); } catch(e){} };
            document.addEventListener('keydown', unlock, { once: true });
            document.addEventListener('touchstart', unlock, { once: true });
            document.addEventListener('mousedown', unlock, { once: true });
        },

        // ── BGM 控制 ─────────────────────────────────────────────────────
        startBgm(mood) {
            try {
                _mood  = mood || 'stage';
                _bgmOn = true;
                _step  = 0;
                _nextNoteTime = _ac().currentTime + 0.06;
                if (!_schedTimer) _schedTimer = setInterval(_schedule, 40);
            } catch (e) { /* ignore */ }
        },
        stopBgm() {
            _bgmOn = false;
            if (_schedTimer) { clearInterval(_schedTimer); _schedTimer = null; }
        },
        setBgmMood(mood) {
            if (!_SONGS[mood] || mood === _mood) return;
            _mood = mood;
            _step = 0;   // 换情绪从小节头开始
        },

        playShoot()      { _beep(880, 'square', 0.06, 0.05); },
        playLaser()      { _beep(1200, 'sawtooth', 0.04, 0.03); },
        playMissile()    { _beep(600, 'sawtooth', 0.12, 0.06); _beep(400, 'square', 0.08, 0.03, 0.05); },
        playPlasma()     { _beep(200, 'sine', 0.18, 0.1); _beep(120, 'sawtooth', 0.12, 0.05, 0.06); },
        playHit()        { _noise(0.07, 0.1, 400); },
        playExplosion(size) {
            const f = [300, 180, 100][size] || 300;
            _noise(0.15 + size * 0.1, 0.18 + size * 0.06, f);
            _beep(f * 0.5, 'sawtooth', 0.12 + size * 0.06, 0.07);
        },
        playPlayerHit()  { _noise(0.3, 0.25, 150); _beep(150, 'sawtooth', 0.25, 0.1); },
        playShieldBreak(){ _beep(600, 'sine', 0.15, 0.1); _beep(300, 'sine', 0.2, 0.08, 0.08); },
        playCollect()    { _beep(880, 'sine', 0.06, 0.08); _beep(1200, 'sine', 0.06, 0.08, 0.06); },
        playWeaponGet()  { [0,1,2].forEach(i => _beep(440 * Math.pow(1.25, i), 'sine', 0.1, 0.1, i * 0.09)); },
        playBomb()       { _noise(0.6, 0.3, 100); _beep(80, 'sawtooth', 0.5, 0.15); },
        playBossAppear() { [0,1,2,3].forEach(i => _beep(80 * Math.pow(1.2, i), 'sawtooth', 0.4, 0.12, i * 0.18)); },
        playBossDie()    {
            [0,1,2,3,4].forEach(i => {
                _noise(0.3, 0.2, 150 - i * 20, i * 0.15);
                _beep(200 + i * 30, 'sawtooth', 0.3, 0.1, i * 0.15);
            });
        },
        playGameOver()   { [0,1,2].forEach(i => _beep(440 / Math.pow(1.4, i), 'sawtooth', 0.3, 0.12, i * 0.28)); },
        playStageClear() { [0,1,2,3].forEach(i => _beep(440 * Math.pow(1.25, i), 'sine', 0.15, 0.1, i * 0.12)); },

        setMuted(v)      { _muted = v; if (_master) _master.gain.value = v ? 0 : 1; },
        isMuted()        { return _muted; },
        toggleMuted()    { this.setMuted(!_muted); return _muted; }
    };
})();
