// ──────────────────────────────────────────────────────────────────────────
//  Difficulty — 难度档（EASY / NORMAL / HARD）
//  统一缩放：敌人血量、敌弹速度、得分倍率、初始命数/炸弹。菜单 ◄►/D 切换，持久化。
// ──────────────────────────────────────────────────────────────────────────
var Difficulty = (() => {
    const ORDER = ['easy', 'normal', 'hard'];
    const PRESETS = {
        easy:   { label: 'EASY',   hpMul: 0.82, bulletMul: 0.84, scoreMul: 0.80, lives: 4, bombs: 3, col: '#6fe89a' },
        normal: { label: 'NORMAL', hpMul: 1.00, bulletMul: 1.00, scoreMul: 1.00, lives: 3, bombs: 2, col: '#7cc8ff' },
        hard:   { label: 'HARD',   hpMul: 1.28, bulletMul: 1.18, scoreMul: 1.45, lives: 2, bombs: 2, col: '#ff7a7a' },
    };

    let _cur = 'normal';
    try { const s = localStorage.getItem('raidenDiff'); if (s && PRESETS[s]) _cur = s; } catch (e) {}

    function _save() { try { localStorage.setItem('raidenDiff', _cur); } catch (e) {} }

    return {
        get()    { return PRESETS[_cur]; },
        getKey() { return _cur; },
        set(k)   { if (PRESETS[k]) { _cur = k; _save(); } },
        cycle(dir) {
            const i = ORDER.indexOf(_cur);
            _cur = ORDER[(i + (dir || 1) + ORDER.length) % ORDER.length];
            _save();
            return _cur;
        },
        order()  { return ORDER.slice(); },
        preset(k){ return PRESETS[k]; },
    };
})();
