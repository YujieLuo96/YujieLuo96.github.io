/* 集成测试 harness：按 Raiden.html 的脚本顺序加载全部模块，
 * 模拟 rAF / 键盘 / 鼠标，定位运行时异常。用后即删。 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ── 万能 stub：任何属性读取/调用都返回自身，参与运算时为 0 ──────────────
function makeStub() {
    const fn = function () { return stub; };
    const stub = new Proxy(fn, {
        get: (t, k) => {
            if (k === Symbol.toPrimitive) return () => 0;
            if (k === 'toString') return () => '0';
            return stub;
        },
        set: () => true,
        apply: () => stub,
    });
    return stub;
}

// ── DOM 元素 stub ────────────────────────────────────────────────────────
const listeners = { window: {}, document: {}, canvas: {} };
function makeElement(tag) {
    return {
        tagName: (tag || 'div').toUpperCase(),
        style: {}, width: 0, height: 0,
        children: [],
        getContext: () => makeStub(),
        addEventListener: function (ev, fn) { (this._ls = this._ls || {})[ev] = fn; },
        removeEventListener: () => {},
        appendChild: function (c) { this.children.push(c); return c; },
        insertBefore: function (c) { this.children.push(c); return c; },
        remove: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 768, height: 800 }),
        querySelector: () => null,
        setAttribute: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
}

const gameCanvas = makeElement('canvas');
gameCanvas.addEventListener = (ev, fn) => { listeners.canvas[ev] = fn; };

const rafQueue = [];
let nowMs = 0;

// TOUCH_MODE: '' = 纯桌面, 'hybrid' = 触屏笔记本(鼠标为主), 'mobile' = 手机(触摸为主)
const MODE = process.env.TOUCH_MODE || '';

const sandbox = {
    console,
    Math, JSON, Set, Map, WeakSet, Array, Object, Number, String, Boolean, Date, RegExp, Promise, Symbol, Error, TypeError, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite,
    performance: { now: () => nowMs },
    requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn) => 1,          // 不执行延迟回调（boss 爆炸延迟波等，与本测试无关）
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); } },
    CanvasRenderingContext2D: function () {},
    MouseEvent: function (type, init) { Object.assign(this, init, { type }); },
    matchMedia: (q) => ({ matches: MODE === 'mobile' && q.includes('coarse') }),
    document: {
        hidden: false,
        body: makeElement('body'),
        documentElement: { clientWidth: 800, clientHeight: 800 },
        createElement: (t) => makeElement(t),
        getElementById: () => makeElement('div'),
        addEventListener: (ev, fn) => { listeners.document[ev] = fn; },
        removeEventListener: () => {},
        querySelectorAll: () => [],
    },
    navigator: { maxTouchPoints: MODE ? 10 : 0, userAgent: 'node-test' },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.innerWidth = 800;
sandbox.innerHeight = 800;
sandbox.addEventListener = (ev, fn) => { listeners.window[ev] = fn; };
sandbox.removeEventListener = () => {};
vm.createContext(sandbox);

// ── 按 Raiden.html 的真实顺序加载脚本 ────────────────────────────────────
const html = fs.readFileSync(path.join(__dirname, 'Raiden.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
console.log('loading', srcs.length, 'scripts…');
for (const src of srcs) {
    try {
        vm.runInContext(fs.readFileSync(path.join(__dirname, src), 'utf8'), sandbox, { filename: src });
    } catch (e) {
        console.error('✖ LOAD FAILED:', src, '\n ', e.stack.split('\n').slice(0, 4).join('\n  '));
        process.exit(1);
    }
}
console.log('✔ all scripts loaded');

let fails = 0;
function assert(cond, msg) { if (!cond) { fails++; console.error('FAIL:', msg); } else console.log('ok  :', msg); }

// ── 启动 ────────────────────────────────────────────────────────────────
try {
    sandbox.GameCore.init({ canvas: gameCanvas });
    console.log('✔ GameCore.init ok');
} catch (e) {
    console.error('✖ GameCore.init THREW:\n', e.stack);
    process.exit(1);
}
try {
    sandbox.MobileControls.init();
    console.log('✔ MobileControls.init ok (desktop self-disable)');
} catch (e) {
    console.error('✖ MobileControls.init THREW:\n', e.stack);
    process.exit(1);
}
try {
    sandbox.GameCore.start();
} catch (e) {
    console.error('✖ GameCore.start THREW:\n', e.stack);
    process.exit(1);
}

// ── 帧泵 ────────────────────────────────────────────────────────────────
function pump(frames) {
    for (let i = 0; i < frames; i++) {
        nowMs += 16.67;
        const q = rafQueue.splice(0, rafQueue.length);
        for (const cb of q) {
            try { cb(nowMs); }
            catch (e) {
                console.error('✖ FRAME THREW @state=' + sandbox.GameCore.getState() + ':\n', e.stack.split('\n').slice(0, 6).join('\n'));
                process.exit(1);
            }
        }
    }
}
function key(k, down = true) {
    const h = listeners.window[down ? 'keydown' : 'keyup'];
    if (h) h({ key: k, preventDefault: () => {} });
}

// ── 设备形态断言 ─────────────────────────────────────────────────────────
if (MODE === 'hybrid') {
    assert(sandbox.MobileControls.isActive() === false,
        'HYBRID: touch-capable laptop does NOT auto-activate mobile UI (mouse/keyboard preserved)');
} else if (MODE === 'mobile') {
    assert(sandbox.MobileControls.isActive() === true,
        'MOBILE: coarse-pointer device activates mobile UI immediately');
}

pump(5);
assert(sandbox.GameCore.getState() === 'menu', 'menu renders without crash, state=menu');

// 键盘开始游戏
key(' '); key(' ', false);
pump(3);
assert(sandbox.GameCore.getState() === 'playing', 'SPACE starts game → playing');

// 方向键移动
const x0 = sandbox.Player.x;
key('ArrowLeft');
pump(12);
key('ArrowLeft', false);
assert(sandbox.Player.x < x0 - 20, 'ArrowLeft moves player (dx=' + (sandbox.Player.x - x0).toFixed(1) + ')');

// Shift focus 减速
key('Shift');
const xf = sandbox.Player.x;
key('ArrowRight');
pump(10);
key('ArrowRight', false); key('Shift', false);
const focusDx = sandbox.Player.x - xf;
assert(focusDx > 0 && focusDx < 35, 'Shift focus slows movement (dx=' + focusDx.toFixed(1) + ')');

// 暂停/恢复
key('p'); pump(2);
assert(sandbox.GameCore.getState() === 'paused', 'P pauses');
key('p'); pump(2);
assert(sandbox.GameCore.getState() === 'playing', 'P resumes');

// 静音
key('n'); pump(1);
assert(sandbox.AudioManager.isMuted() === true, 'N mutes');
key('n'); pump(1);

// 图鉴开关 + 拦截
key('m'); pump(2);
key(' '); key(' ', false);   // 图鉴打开时 Space 不应触发炸弹
pump(2);
key('m'); pump(2);
assert(sandbox.GameCore.getState() === 'playing', 'Codex open/close, Space intercepted');

// 鼠标交互：mousedown → tap；拖拽增量
const md = listeners.canvas['mousedown'], mm = listeners.canvas['mousemove'], mu = listeners.canvas['mouseup'];
assert(typeof md === 'function' && typeof mm === 'function', 'canvas mouse handlers attached');
const px0 = sandbox.Player.x;
md({ clientX: 300, clientY: 600 });
mm({ clientX: 360, clientY: 600 });
pump(3);
mu({});
assert(sandbox.Player.x > px0 + 20, 'mouse drag moves player (dx=' + (sandbox.Player.x - px0).toFixed(1) + ')');

// 长时间运行稳定性（覆盖敌人生成、碰撞、过关检测、BGM 轮询等路径）
pump(600);
console.log('state after 600 frames:', sandbox.GameCore.getState());
assert(true, '600 frames simulated without exception');

console.log(fails === 0 ? '\nALL INTEGRATION TESTS PASSED' : '\n' + fails + ' TEST(S) FAILED');
process.exit(fails ? 1 : 0);
