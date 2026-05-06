var Renderer = (() => {
    let _W = 768, _H = 800;
    let _canvas, _ctx;
    const _callbacks = [];

    function _fit() {
        const vw = window.visualViewport ? window.visualViewport.width  : window.innerWidth;
        const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const s  = Math.min(vw / _W, vh / _H);
        _canvas.style.width  = (_W * s) + 'px';
        _canvas.style.height = (_H * s) + 'px';
        _canvas.width  = _W;
        _canvas.height = _H;
    }

    return {
        get W() { return _W; },
        get H() { return _H; },

        init(el) {
            _canvas = el;
            _ctx    = el.getContext('2d');
            _fit();
            window.addEventListener('resize', _fit);
            window.addEventListener('orientationchange', () => setTimeout(_fit, 300));
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', _fit);
                window.visualViewport.addEventListener('scroll', _fit);
            }
            if (!_ctx.roundRect) {
                CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
                    this.beginPath();
                    this.moveTo(x + r, y);
                    this.lineTo(x + w - r, y);    this.quadraticCurveTo(x + w, y,     x + w, y + r);
                    this.lineTo(x + w, y + h - r); this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                    this.lineTo(x + r, y + h);     this.quadraticCurveTo(x,     y + h, x,     y + h - r);
                    this.lineTo(x, y + r);          this.quadraticCurveTo(x,     y,     x + r, y);
                    this.closePath();
                };
            }
        },

        // Set logical game width (360–1200); height stays 800
        setWidth(w) {
            _W = Math.max(360, Math.min(1200, Math.round(w)));
            if (_canvas) _fit();
            _callbacks.forEach(fn => fn(_W, _H));
            // Notify via EventBus if available
            if (typeof EventBus !== 'undefined') EventBus.emit('renderer:resize', { W: _W, H: _H });
        },

        onResize(fn) { _callbacks.push(fn); },

        getCtx()    { return _ctx; },
        getCanvas() { return _canvas; },
        clear()     { _ctx.clearRect(0, 0, _W, _H); }
    };
})();
