(function () {
    let bgCanvas  = null;
    let bgCtx     = null;
    let rainDrops = [];
    let _rafId    = null;
    let _resizeFn = null;

    function init(canvas) {
        if (_resizeFn) window.removeEventListener('resize', _resizeFn);
        bgCanvas  = canvas;
        bgCtx     = canvas.getContext('2d');
        _resizeFn = _reset;
        window.addEventListener('resize', _resizeFn);
        _reset();
    }

    function _reset() {
        bgCanvas.width  = window.innerWidth;
        bgCanvas.height = window.innerHeight;
        rainDrops = [];
        const dropCount = Math.floor(bgCanvas.width / 35) + 15;
        for (let i = 0; i < dropCount; i++) {
            rainDrops.push({
                x:      Math.random() * bgCanvas.width,
                y:      Math.random() * bgCanvas.height,
                speed:  1 + Math.random() * 3,
                length: 15 + Math.random() * 40,
                alpha:  0.08 + Math.random() * 0.12
            });
        }
    }

    function _draw() {
        if (!bgCtx) return;
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgCtx.fillStyle = '#010001';
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

        const step = 40;
        bgCtx.lineWidth   = 0.4;
        bgCtx.strokeStyle = 'rgba(0, 242, 255, 0.06)';
        bgCtx.beginPath();
        for (let x = 0; x < bgCanvas.width; x += step) {
            bgCtx.moveTo(x, 0);
            bgCtx.lineTo(x, bgCanvas.height);
        }
        for (let y = 0; y < bgCanvas.height; y += step) {
            bgCtx.moveTo(0, y);
            bgCtx.lineTo(bgCanvas.width, y);
        }
        bgCtx.stroke();

        rainDrops.forEach(d => {
            d.y += d.speed;
            if (d.y - d.length > bgCanvas.height) {
                d.y = -d.length;
                d.x = Math.random() * bgCanvas.width;
            }
            const grad = bgCtx.createLinearGradient(d.x, d.y - d.length, d.x, d.y);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, `rgba(0, 242, 255, ${d.alpha})`);
            bgCtx.strokeStyle = grad;
            bgCtx.lineWidth = 1.2;
            bgCtx.beginPath();
            bgCtx.moveTo(d.x, d.y - d.length);
            bgCtx.lineTo(d.x, d.y);
            bgCtx.stroke();
        });

        const t = Date.now() / 1800;
        const glitchX = bgCanvas.width * 0.3 + Math.sin(t) * 15;
        bgCtx.fillStyle = 'rgba(255, 45, 158, 0.02)';
        bgCtx.fillRect(glitchX, 0, 8, bgCanvas.height);
        bgCtx.fillStyle = 'rgba(0, 242, 255, 0.02)';
        bgCtx.fillRect(glitchX - 40, bgCanvas.height * 0.6, 25, bgCanvas.height * 0.2);

        _rafId = requestAnimationFrame(_draw);
    }

    function start() {
        if (_rafId !== null) return;
        _draw();
    }

    function stop() {
        if (_rafId !== null) {
            cancelAnimationFrame(_rafId);
            _rafId = null;
        }
    }

    window.CyberBackground = { init, start, stop };
})();
