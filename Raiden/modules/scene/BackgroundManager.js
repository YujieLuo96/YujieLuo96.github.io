var BackgroundManager = (() => {
    const SCENES = {};
    let _cur  = null;
    let _next = null;
    let _curName  = '';
    let _nextName = '';
    let _fadeT  = 0;
    const FADE  = 50;
    let _transFlash = 0;            // 切场闪光计时
    let _transCol   = '255,255,255';

    // 各场景切入时的闪光底色
    const FLASH_COL = {
        space:'150,200,255', asteroid:'205,185,140', solar:'255,180,80',
        blackhole:'180,120,255', nebula:'120,240,220'
    };

    function _setFg(name) {
        if (typeof ForegroundParallaxLayer !== 'undefined') ForegroundParallaxLayer.setScene(name);
    }

    return {
        init() {
            SCENES['space']     = SpaceScene;
            SCENES['asteroid']  = AsteroidScene;
            SCENES['solar']     = SolarScene;
            SCENES['blackhole'] = BlackholeScene;
            SCENES['nebula']    = CrystallineNebulaScene;
            EventBus.on('renderer:resize', () => { if (_cur) _cur.init(); _setFg(_curName); });
        },

        // 允许后续版本注册新场景（如 nebula）
        register(name, scene) { SCENES[name] = scene; },

        switchTo(name) {
            const scene = SCENES[name];
            if (!scene) return;
            if (!_cur) {
                _cur = scene; _curName = name;
                _cur.init();
                _setFg(name);
                return;
            }
            if (_cur === scene) return;
            _next  = scene; _nextName = name;
            _next.init();
            _fadeT = 0;
            // 切场短闪 + 音效 stinger，让关卡推进有仪式感
            _transFlash = 18;
            _transCol   = FLASH_COL[name] || '255,255,255';
            if (typeof AudioManager !== 'undefined' && AudioManager.playWarp) AudioManager.playWarp();
        },

        update(dt) {
            if (_transFlash > 0) _transFlash -= dt;
            if (_cur) _cur.update(dt);
            if (_next) {
                _next.update(dt);
                _fadeT += dt;
                if (_fadeT >= FADE) {
                    _cur  = _next;  _curName  = _nextName;
                    _next = null;   _nextName = '';
                    _fadeT = 0;
                    _setFg(_curName);
                }
            }
            if (typeof ForegroundParallaxLayer !== 'undefined') ForegroundParallaxLayer.update(dt);
        },

        draw(ctx) {
            if (!_next) {
                if (_cur) _cur.draw(ctx);
            } else {
                const alpha = _fadeT / FADE;
                ctx.globalAlpha = 1 - alpha;
                if (_cur) _cur.draw(ctx);
                ctx.globalAlpha = alpha;
                _next.draw(ctx);
                ctx.globalAlpha = 1;
            }
            // 近景视差层：背景之上、战斗实体之下，统一为所有场景补足纵深
            if (typeof ForegroundParallaxLayer !== 'undefined') ForegroundParallaxLayer.draw(ctx);
            // 切场闪光 veil（淡出）
            if (_transFlash > 0) {
                const a = (_transFlash / 18) * 0.22;
                ctx.fillStyle = `rgba(${_transCol},${a.toFixed(3)})`;
                ctx.fillRect(0, 0, Renderer.W, Renderer.H);
            }
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
