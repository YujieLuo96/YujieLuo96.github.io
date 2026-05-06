var MobileControls = (() => {
    let _active    = false;
    let _joyBase   = null;
    let _joyTouch  = null;
    let _joyOrigin = null;
    let _joyVx = 0, _joyVy = 0;

    const DEAD   = 8;
    const RMAX   = 52;
    const KNOB_R = 20;

    function _isTouch() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    function _drawJoy(kx, ky) {
        const ctx = _joyBase.getContext('2d');
        const w = _joyBase.width, h = _joyBase.height;
        const cx = w / 2, cy = h / 2;
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle   = 'rgba(0,60,120,0.28)';
        ctx.strokeStyle = 'rgba(80,160,255,0.42)';
        ctx.lineWidth   = 2;
        ctx.beginPath(); ctx.arc(cx, cy, RMAX, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        ctx.strokeStyle = 'rgba(80,160,255,0.22)';
        ctx.lineWidth   = 1.2;
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * (RMAX - 10), cy + Math.sin(a) * (RMAX - 10));
            ctx.lineTo(cx + Math.cos(a) * RMAX,        cy + Math.sin(a) * RMAX);
            ctx.stroke();
        }

        const dx = kx - cx, dy = ky - cy;
        const dist  = Math.sqrt(dx * dx + dy * dy);
        const clamp = Math.min(dist, RMAX - KNOB_R - 2);
        const angle = Math.atan2(dy, dx);
        const kcx   = dist > 0 ? cx + Math.cos(angle) * clamp : cx;
        const kcy   = dist > 0 ? cy + Math.sin(angle) * clamp : cy;

        const g = ctx.createRadialGradient(
            kcx - KNOB_R * 0.3, kcy - KNOB_R * 0.3, 2,
            kcx, kcy, KNOB_R
        );
        g.addColorStop(0, 'rgba(160,225,255,0.95)');
        g.addColorStop(1, 'rgba(0,100,210,0.72)');
        ctx.fillStyle   = g;
        ctx.shadowColor = '#4af';
        ctx.shadowBlur  = 10;
        ctx.beginPath(); ctx.arc(kcx, kcy, KNOB_R, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = 'rgba(100,200,255,0.85)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.arc(kcx, kcy, KNOB_R, 0, Math.PI * 2); ctx.stroke();
    }

    function _onStart(e) {
        e.preventDefault();
        if (_joyTouch) return;
        const t    = e.changedTouches[0];
        const rect = e.currentTarget.getBoundingClientRect();
        const tx   = t.clientX - rect.left, ty = t.clientY - rect.top;

        _joyTouch  = { id: t.identifier };
        _joyOrigin = { x: tx, y: ty };
        _joyVx = 0; _joyVy = 0;

        _joyBase.style.left    = tx + 'px';
        _joyBase.style.top     = ty + 'px';
        _joyBase.style.display = 'block';
        _drawJoy(_joyBase.width / 2, _joyBase.height / 2);

        // Wake title / game-over screen (no-op during active play)
        EventBus.emit('input:tap', { x: 0, y: 0 });
    }

    function _onMove(e) {
        e.preventDefault();
        if (!_joyTouch) return;
        for (const t of e.changedTouches) {
            if (t.identifier !== _joyTouch.id) continue;
            const rect = e.currentTarget.getBoundingClientRect();
            const tx   = t.clientX - rect.left, ty = t.clientY - rect.top;
            const dx   = tx - _joyOrigin.x, dy = ty - _joyOrigin.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < DEAD) { _joyVx = 0; _joyVy = 0; }
            else {
                const nd = Math.min(dist, RMAX) / RMAX;
                _joyVx   = (dx / dist) * nd;
                _joyVy   = (dy / dist) * nd;
            }
            const half = _joyBase.width / 2;
            _drawJoy(half + dx, half + dy);
            break;
        }
    }

    function _onEnd(e) {
        e.preventDefault();
        if (!_joyTouch) return;
        for (const t of e.changedTouches) {
            if (t.identifier !== _joyTouch.id) continue;
            _joyTouch = null; _joyOrigin = null;
            _joyVx = 0; _joyVy = 0;
            _joyBase.style.display = 'none';
            break;
        }
    }

    function _build() {
        const D = (RMAX + 16) * 2;
        _joyBase = document.createElement('canvas');
        _joyBase.width  = D;
        _joyBase.height = D;
        _joyBase.style.cssText = 'position:absolute;display:none;pointer-events:none;transform:translate(-50%,-50%);opacity:0.38;';

        const zone = document.createElement('div');
        zone.style.cssText = 'position:absolute;left:0;top:0;width:62%;height:100%;pointer-events:auto;';
        zone.appendChild(_joyBase);
        zone.addEventListener('touchstart',  _onStart, { passive: false });
        zone.addEventListener('touchmove',   _onMove,  { passive: false });
        zone.addEventListener('touchend',    _onEnd,   { passive: false });
        zone.addEventListener('touchcancel', _onEnd,   { passive: false });

        const bombBtn = document.createElement('div');
        bombBtn.textContent = 'BOMB';
        bombBtn.style.cssText = [
            'position:absolute',
            'bottom:calc(80px + env(safe-area-inset-bottom, 0px))',
            'right:20px',
            'width:64px;height:64px;border-radius:50%',
            'background:rgba(255,70,0,0.12);border:2px solid rgba(255,140,0,0.35)',
            'color:#ff8;font-family:\'Courier New\',monospace;font-size:10px;font-weight:bold',
            'display:flex;align-items:center;justify-content:center',
            'pointer-events:auto;user-select:none;-webkit-user-select:none',
            'transition:background 0.08s',
        ].join(';');
        bombBtn.addEventListener('touchstart', e => {
            e.preventDefault(); e.stopPropagation();
            EventBus.emit('input:keydown', ' ');
            bombBtn.style.background = 'rgba(255,130,0,0.42)';
        }, { passive: false });
        bombBtn.addEventListener('touchend', () => {
            bombBtn.style.background = 'rgba(255,70,0,0.12)';
        });

        const pauseBtn = document.createElement('div');
        pauseBtn.textContent = '▐▐';
        pauseBtn.style.cssText = [
            'position:absolute',
            'top:calc(14px + env(safe-area-inset-top, 0px))',
            'right:14px',
            'width:44px;height:44px;border-radius:8px',
            'background:rgba(0,30,60,0.25);border:1px solid rgba(80,160,255,0.28)',
            'color:#4af;font-size:14px',
            'display:flex;align-items:center;justify-content:center',
            'pointer-events:auto;user-select:none;-webkit-user-select:none',
        ].join(';');
        pauseBtn.addEventListener('touchstart', e => {
            e.preventDefault(); e.stopPropagation();
            EventBus.emit('input:keydown', 'p');
        }, { passive: false });

        const ov = document.createElement('div');
        ov.id = 'mc-overlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:20;pointer-events:none;';
        ov.appendChild(zone);
        ov.appendChild(bombBtn);
        ov.appendChild(pauseBtn);
        document.body.appendChild(ov);
    }

    function _fit() {
        if (typeof Renderer === 'undefined') return;
        const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        Renderer.setWidth(Math.min(vw, 768));
        const ctrl = document.getElementById('width-ctrl');
        if (ctrl) ctrl.style.display = 'none';
    }

    return {
        init() {
            if (!_isTouch()) return;
            _active = true;
            _fit();
            _build();
            window.addEventListener('resize', _fit);
        },
        isActive()  { return _active; },
        getJoyDir() { return { vx: _joyVx, vy: _joyVy }; }
    };
})();
