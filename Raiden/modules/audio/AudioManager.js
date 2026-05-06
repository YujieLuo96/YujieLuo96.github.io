var AudioManager = (() => {
    let _ctx = null;
    let _muted = false;

    function _ac() {
        if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
        return _ctx;
    }

    function _beep(freq, type, dur, vol, delay = 0) {
        if (_muted) return;
        try {
            const ac  = _ac();
            const osc = ac.createOscillator();
            const gain= ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
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
            src.connect(filt); filt.connect(gain); gain.connect(ac.destination);
            gain.gain.setValueAtTime(vol || 0.2, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
            src.start(); src.stop(ac.currentTime + dur);
        } catch (e) { /* ignore */ }
    }

    return {
        init() {
            // Unlock AudioContext on first user interaction
            const unlock = () => { try { _ac().resume(); } catch(e){} };
            document.addEventListener('keydown', unlock, { once: true });
            document.addEventListener('touchstart', unlock, { once: true });
            document.addEventListener('mousedown', unlock, { once: true });
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
        setMuted(v)      { _muted = v; }
    };
})();
