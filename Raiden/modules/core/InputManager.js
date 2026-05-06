var InputManager = (() => {
    const _keys = {};
    let _cv, _mx = 240, _my = 660, _mdown = false, _tact = false, _useTouch = false;

    function _scale(e, isTouch) {
        const r  = _cv.getBoundingClientRect();
        const sx = Renderer.W / r.width, sy = Renderer.H / r.height;
        const s  = isTouch ? e.touches[0] : e;
        return { x: (s.clientX - r.left) * sx, y: (s.clientY - r.top) * sy };
    }

    return {
        init(cv) {
            _cv = cv;
            window.addEventListener('keydown', e => {
                _keys[e.key] = true;
                if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key))
                    e.preventDefault();
                EventBus.emit('input:keydown', e.key);
            });
            window.addEventListener('keyup', e => { _keys[e.key] = false; });

            cv.addEventListener('mousedown', e => {
                const p = _scale(e, false);
                _mdown = true; _mx = p.x; _my = p.y;
                EventBus.emit('input:tap', p);
            });
            cv.addEventListener('mousemove', e => {
                if (!_mdown) return;
                const p = _scale(e, false); _mx = p.x; _my = p.y; _useTouch = true;
            });
            cv.addEventListener('mouseup',    () => _mdown = false);
            cv.addEventListener('mouseleave', () => _mdown = false);

            cv.addEventListener('touchstart', e => {
                e.preventDefault();
                _tact = true; _useTouch = true; _mdown = true;
                const p = _scale(e, true); _mx = p.x; _my = p.y;
                EventBus.emit('input:tap', p);
            }, { passive: false });
            cv.addEventListener('touchmove', e => {
                e.preventDefault();
                if (!_tact) return;
                const p = _scale(e, true); _mx = p.x; _my = p.y;
            }, { passive: false });
            cv.addEventListener('touchend', e => {
                e.preventDefault(); _tact = false; _mdown = false;
            }, { passive: false });
            cv.addEventListener('touchcancel', () => { _tact = false; _mdown = false; });
        },
        isDown(k)    { return !!_keys[k]; },
        getMoveDir() {
            let vx = 0, vy = 0;
            if (_keys['ArrowLeft']  || _keys['a'] || _keys['A']) vx = -1;
            if (_keys['ArrowRight'] || _keys['d'] || _keys['D']) vx =  1;
            if (_keys['ArrowUp']    || _keys['w'] || _keys['W']) vy = -1;
            if (_keys['ArrowDown']  || _keys['s'] || _keys['S']) vy =  1;
            if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
            return { vx, vy };
        },
        getPointer()  { return { x: _mx, y: _my, down: _mdown || _tact }; },
        useTouch()    { return _useTouch; },
        reset() {
            Object.keys(_keys).forEach(k => (_keys[k] = false));
            _mdown = false; _tact = false;
        }
    };
})();
