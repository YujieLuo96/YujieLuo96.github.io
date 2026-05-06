var BackgroundManager = (() => {
    const SCENES = {};
    let _cur  = null;
    let _next = null;
    let _fadeT  = 0;
    const FADE  = 50;

    return {
        init() {
            SCENES['space']     = SpaceScene;
            SCENES['asteroid']  = AsteroidScene;
            SCENES['solar']     = SolarScene;
            SCENES['blackhole'] = BlackholeScene;
            EventBus.on('renderer:resize', () => { if (_cur) _cur.init(); });
        },

        switchTo(name) {
            const scene = SCENES[name];
            if (!scene) return;
            if (!_cur) {
                _cur = scene;
                _cur.init();
                return;
            }
            if (_cur === scene) return;
            _next  = scene;
            _next.init();
            _fadeT = 0;
        },

        update(dt) {
            if (_cur) _cur.update(dt);
            if (_next) {
                _next.update(dt);
                _fadeT += dt;
                if (_fadeT >= FADE) {
                    _cur  = _next;
                    _next = null;
                    _fadeT = 0;
                }
            }
        },

        draw(ctx) {
            if (!_next) {
                if (_cur) _cur.draw(ctx);
                return;
            }
            const alpha = _fadeT / FADE;
            ctx.globalAlpha = 1 - alpha;
            if (_cur) _cur.draw(ctx);
            ctx.globalAlpha = alpha;
            _next.draw(ctx);
            ctx.globalAlpha = 1;
        },

        getCurrentName() {
            return Object.keys(SCENES).find(k => SCENES[k] === _cur) || '';
        },

        getBlackhole() {
            if (_cur && typeof _cur.getBlackhole === 'function') return _cur.getBlackhole();
            return null;
        }
    };
})();
