(function () {
    'use strict';

    let subMode    = 'encrypt';
    let rsaMode    = 'single';
    let layerCount = 1;
    let layerParams = [null];

    let origImgData       = null;
    let origW             = 0;
    let origH             = 0;
    let encResultCanvas   = null;
    let uploadedEncCanvas = null;
    let decImgData        = null;
    let decLayers         = null;
    let busy              = false;

    const rsaModeBtn    = document.getElementById('rsaModeBtn');
    const singleModeBtn = document.getElementById('singleModeBtn');
    const mixModeBtn    = document.getElementById('mixModeBtn');

    const rsaPanel         = document.getElementById('rsaPanel');
    const singlePanel      = document.getElementById('singlePanel');
    const mixPanel         = document.getElementById('mixPanel');
    const sharedFilterCard = document.getElementById('sharedFilterCard');
    const sharedExportCard = document.getElementById('sharedExportCard');

    const mainPreviewCard = document.getElementById('mainPreviewCard');
    const mainResultCard  = document.getElementById('mainResultCard');
    const rsaPreviewCard  = document.getElementById('rsaPreviewCard');
    const rsaResultCard   = document.getElementById('rsaResultCard');

    const rsaEncryptModeBtn = document.getElementById('rsaEncryptModeBtn');
    const rsaDecryptModeBtn = document.getElementById('rsaDecryptModeBtn');
    const rsaEncSubPanel    = document.getElementById('rsaEncSubPanel');
    const rsaDecSubPanel    = document.getElementById('rsaDecSubPanel');

    const rsaSingleRSABtn    = document.getElementById('rsaSingleRSABtn');
    const rsaMultiRSABtn     = document.getElementById('rsaMultiRSABtn');
    const rsaLayerCountRow   = document.getElementById('rsaLayerCountRow');
    const rsaLayerCountInput = document.getElementById('rsaLayerCountInput');
    const rsaLayersContainer = document.getElementById('rsaLayersContainer');
    const rsaAutoAllBtn      = document.getElementById('rsaAutoAllBtn');

    const rsaDropZone  = document.getElementById('rsaDropZone');
    const rsaFileInput = document.getElementById('rsaFileInput');
    const rsaFileInfo  = document.getElementById('rsaFileInfo');
    const rsaUploadLabel = document.getElementById('rsaUploadLabel');
    const rsaDropText    = document.getElementById('rsaDropText');

    const rsaKeyDropZone  = document.getElementById('rsaKeyDropZone');
    const rsaKeyFileInput = document.getElementById('rsaKeyFileInput');
    const rsaKeyFileInfo  = document.getElementById('rsaKeyFileInfo');
    const rsaKeyInfoBox   = document.getElementById('rsaKeyInfoBox');

    const rsaProgressWrap = document.getElementById('rsaProgressWrap');
    const rsaProgressFill = document.getElementById('rsaProgressFill');
    const rsaProgressPct  = document.getElementById('rsaProgressPct');
    const rsaProgressMsg  = document.getElementById('rsaProgressMsg');

    const rsaEncryptAction = document.getElementById('rsaEncryptAction');
    const rsaDecryptAction = document.getElementById('rsaDecryptAction');

    const rsaSaveEncBtn = document.getElementById('rsaSaveEncBtn');
    const rsaSaveKeyBtn = document.getElementById('rsaSaveKeyBtn');
    const rsaSaveDecBtn = document.getElementById('rsaSaveDecBtn');

    const rsaPreviewCanvas = document.getElementById('rsaPreviewCanvas');
    const rsaResultCanvas  = document.getElementById('rsaResultCanvas');
    const rsaPreviewStatus = document.getElementById('rsaPreviewStatus');
    const rsaResultStatus  = document.getElementById('rsaResultStatus');
    const rsaPreviewTitle  = document.getElementById('rsaPreviewTitle');
    const rsaResultTitle   = document.getElementById('rsaResultTitle');

    function toast(msg) {
        const el = document.createElement('div');
        el.innerText = msg;
        Object.assign(el.style, {
            position: 'fixed', bottom: '20px', left: '20px',
            backgroundColor: '#ff2d9e30', padding: '6px 14px',
            border: '1px solid var(--pink)', zIndex: 9999,
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '0.8rem', color: '#ff2d9e'
        });
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1800);
    }

    function setProgress(pct, msg) {
        rsaProgressWrap.style.display = '';
        rsaProgressFill.style.width   = pct + '%';
        rsaProgressPct.textContent    = pct + '%';
        if (msg !== undefined) rsaProgressMsg.textContent = msg;
    }

    function setupDropZone(zone, input, onFile) {
        zone.addEventListener('click',    ()  => input.click());
        zone.addEventListener('dragover', e   => { e.preventDefault(); zone.classList.add('active'); });
        zone.addEventListener('dragleave', ()  => zone.classList.remove('active'));
        zone.addEventListener('drop',     e   => {
            e.preventDefault(); zone.classList.remove('active');
            if (e.dataTransfer.files.length) onFile(e.dataTransfer.files[0]);
        });
        input.addEventListener('change',  e   => { if (e.target.files.length) onFile(e.target.files[0]); });
    }

    function drawPreview(canvas, img, maxW) {
        let pw = img.width || img.naturalWidth, ph = img.height || img.naturalHeight;
        if (pw > maxW) { ph = Math.round((maxW / pw) * ph); pw = maxW; }
        canvas.width  = pw;
        canvas.height = ph;
        const ctx = canvas.getContext('2d');
        if (img instanceof ImageData) {
            const tmp = document.createElement('canvas');
            tmp.width = img.width; tmp.height = img.height;
            tmp.getContext('2d').putImageData(img, 0, 0);
            ctx.drawImage(tmp, 0, 0, pw, ph);
        } else {
            ctx.drawImage(img, 0, 0, pw, ph);
        }
    }

    function enterRSAMode() {
        singlePanel.classList.remove('active');
        mixPanel.classList.remove('active');
        sharedFilterCard.style.display = 'none';
        sharedExportCard.style.display = 'none';
        rsaPanel.classList.add('active');
        singleModeBtn.classList.remove('active');
        mixModeBtn.classList.remove('active');
        rsaModeBtn.classList.add('active');
        mainPreviewCard.style.display = 'none';
        mainResultCard.style.display  = 'none';
        rsaPreviewCard.style.display  = '';
        rsaResultCard.style.display   = '';
    }

    function leaveRSAMode() {
        rsaPanel.classList.remove('active');
        sharedFilterCard.style.display = '';
        sharedExportCard.style.display = '';
        mainPreviewCard.style.display  = '';
        mainResultCard.style.display   = '';
        rsaPreviewCard.style.display   = 'none';
        rsaResultCard.style.display    = 'none';
        rsaModeBtn.classList.remove('active');
    }

    function setSubMode(mode) {
        subMode = mode;
        const isEnc = mode === 'encrypt';

        rsaEncryptModeBtn.classList.toggle('active', isEnc);
        rsaDecryptModeBtn.classList.toggle('active', !isEnc);
        rsaEncSubPanel.style.display    = isEnc ? '' : 'none';
        rsaDecSubPanel.style.display    = isEnc ? 'none' : '';
        rsaEncryptAction.style.display  = isEnc ? '' : 'none';
        rsaDecryptAction.style.display  = isEnc ? 'none' : '';

        rsaUploadLabel.textContent = isEnc ? '🎴 UPLOAD IMAGE' : '🎴 UPLOAD ENCRYPTED PNG';
        rsaDropText.textContent    = isEnc ? 'DRAG & DROP IMAGE' : 'DRAG & DROP ENCRYPTED PNG';
        rsaFileInput.accept        = isEnc
            ? 'image/jpeg,image/png,image/webp,image/bmp'
            : 'image/png';

        rsaPreviewTitle.textContent = isEnc ? '🎴 SOURCE IMAGE'      : '🔐 ENCRYPTED IMAGE';
        rsaResultTitle.textContent  = isEnc ? '🔐 ENCRYPTED RESULT'  : '🔓 DECRYPTED RESULT';

        rsaPreviewStatus.textContent      = 'NO DATA';
        rsaResultStatus.textContent       = 'AWAITING';
        rsaProgressWrap.style.display     = 'none';
        rsaSaveEncBtn.style.display       = 'none';
        rsaSaveKeyBtn.style.display       = 'none';
        rsaSaveDecBtn.style.display       = 'none';
    }

    function setRSAMode(mode) {
        rsaMode = mode;
        const isMulti = mode === 'multi';
        rsaSingleRSABtn.classList.toggle('active', !isMulti);
        rsaMultiRSABtn.classList.toggle('active',   isMulti);
        rsaLayerCountRow.style.display = isMulti ? '' : 'none';
        setLayerCount(isMulti ? (parseInt(rsaLayerCountInput.value) || 2) : 1);
    }

    function setLayerCount(n) {
        n = Math.max(1, Math.min(8, parseInt(n) || 1));
        layerCount = n;
        while (layerParams.length < n) layerParams.push(null);
        layerParams.length = n;
        buildLayerUI(n);
    }

    function buildLayerUI(count) {
        rsaLayersContainer.innerHTML = '';
        for (let idx = 0; idx < count; idx++) {
            const label  = count === 1 ? '🔐 RSA PARAMETERS' : `🔐 LAYER ${idx + 1}`;
            const p0     = layerParams[idx];
            const card   = document.createElement('div');
            card.className       = 'card rsa-layer-card';
            card.dataset.layerIdx = String(idx);
            card.innerHTML = `
                <div class="rsa-layer-header">
                    <div class="card-label" style="margin-bottom:0;">${label}</div>
                    <button class="neon-btn rsa-layer-auto">⚙ AUTO</button>
                </div>
                <div class="rsa-param-grid">
                    <div class="rsa-param-row">
                        <span class="rsa-param-label">Prime p</span>
                        <input type="number" class="rsa-param-input rsa-p"
                               min="2" max="9999" value="${p0 ? p0.p : ''}" placeholder="e.g. 17">
                        <button class="rsa-icon-btn rsa-rand-p" title="Generate random p">🎲</button>
                    </div>
                    <div class="rsa-param-row">
                        <span class="rsa-param-label">Prime q</span>
                        <input type="number" class="rsa-param-input rsa-q"
                               min="2" max="9999" value="${p0 ? p0.q : ''}" placeholder="e.g. 19">
                        <button class="rsa-icon-btn rsa-rand-q" title="Generate random q">🎲</button>
                    </div>
                    <div class="rsa-param-row">
                        <span class="rsa-param-label">n = p×q</span>
                        <input type="text" class="rsa-param-input rsa-n" readonly
                               value="${p0 ? p0.n : ''}" placeholder="auto">
                    </div>
                    <div class="rsa-param-row">
                        <span class="rsa-param-label">φ(n)</span>
                        <input type="text" class="rsa-param-input rsa-phi" readonly
                               value="${p0 ? p0.phi : ''}" placeholder="auto">
                    </div>
                    <div class="rsa-param-row">
                        <span class="rsa-param-label">Pubkey e</span>
                        <input type="number" class="rsa-param-input rsa-e"
                               min="2" value="${p0 ? p0.e : ''}" placeholder="e.g. 5">
                        <button class="rsa-icon-btn rsa-auto-e" title="Auto suggest e">⚡</button>
                    </div>
                    <div class="rsa-param-row">
                        <span class="rsa-param-label">Privkey d</span>
                        <input type="text" class="rsa-param-input rsa-privkey" readonly
                               value="${p0 ? p0.d : ''}" placeholder="auto">
                    </div>
                </div>
                <div class="rsa-param-status ${p0 ? (p0.valid ? 'valid' : 'invalid') : ''}">
                    ${p0 ? (p0.valid ? '✔ PARAMS VALID' : '✘ ' + (p0.error || '')) : ''}
                </div>`;
            rsaLayersContainer.appendChild(card);
            _bindLayerCard(card, idx);
        }
    }

    function _bindLayerCard(card, idx) {
        const pInput  = card.querySelector('.rsa-p');
        const qInput  = card.querySelector('.rsa-q');
        const eInput  = card.querySelector('.rsa-e');
        const nDisp   = card.querySelector('.rsa-n');
        const phiDisp = card.querySelector('.rsa-phi');
        const dDisp   = card.querySelector('.rsa-privkey');
        const status  = card.querySelector('.rsa-param-status');

        function tryBuild() {
            const p = pInput.value, q = qInput.value, e = eInput.value;
            if (!p || !q || !e) {
                nDisp.value = phiDisp.value = dDisp.value = '';
                status.textContent = '';
                status.className   = 'rsa-param-status';
                layerParams[idx]   = null;
                return;
            }
            const res = RSAModule.buildParams(p, q, e);
            layerParams[idx] = res;
            if (res.valid) {
                nDisp.value        = res.n;
                phiDisp.value      = res.phi;
                dDisp.value        = res.d;
                status.textContent = '✔ PARAMS VALID';
                status.className   = 'rsa-param-status valid';
            } else {
                nDisp.value = phiDisp.value = dDisp.value = '';
                status.textContent = '✘ ' + res.error;
                status.className   = 'rsa-param-status invalid';
            }
        }

        pInput.addEventListener('input', tryBuild);
        qInput.addEventListener('input', tryBuild);
        eInput.addEventListener('input', tryBuild);

        card.querySelector('.rsa-rand-p').addEventListener('click', () => {
            const p = RSAModule.generateRandomPrime(17, 251);
            if (p) { pInput.value = p; tryBuild(); }
        });

        card.querySelector('.rsa-rand-q').addEventListener('click', () => {
            const q = RSAModule.generateRandomPrime(17, 251);
            if (q) { qInput.value = q; tryBuild(); }
        });

        card.querySelector('.rsa-auto-e').addEventListener('click', () => {
            const p = parseInt(pInput.value), q = parseInt(qInput.value);
            if (!RSAModule.isPrime(p) || !RSAModule.isPrime(q) || p === q) {
                toast('Please enter valid p and q first');
                return;
            }
            const phi = (p - 1) * (q - 1);
            let e = 3;
            while (e < phi) {
                if (RSAModule.gcd(e, phi) === 1n) break;
                e += 2;
            }
            eInput.value = e;
            tryBuild();
        });

        card.querySelector('.rsa-layer-auto').addEventListener('click', () => {
            const res = RSAModule.autoGenerateParams();
            if (!res) { toast('Auto generation failed, please retry'); return; }
            pInput.value       = res.p;
            qInput.value       = res.q;
            eInput.value       = res.e;
            nDisp.value        = res.n;
            phiDisp.value      = res.phi;
            dDisp.value        = res.d;
            layerParams[idx]   = res;
            status.textContent = '✔ PARAMS VALID';
            status.className   = 'rsa-param-status valid';
        });
    }

    function loadImageFile(file) {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                if (subMode === 'encrypt') {
                    origW = img.width; origH = img.height;
                    const tmp = document.createElement('canvas');
                    tmp.width = origW; tmp.height = origH;
                    const tmpCtx = tmp.getContext('2d');
                    tmpCtx.drawImage(img, 0, 0);
                    origImgData = tmpCtx.getImageData(0, 0, origW, origH);
                    drawPreview(rsaPreviewCanvas, img, 480);
                    rsaFileInfo.innerHTML        = `✅ ${file.name} | ${origW}×${origH}`;
                    rsaPreviewStatus.textContent = `${origW}×${origH}`;
                } else {
                    const encCvs = document.createElement('canvas');
                    encCvs.width  = img.width;
                    encCvs.height = img.height;
                    encCvs.getContext('2d').drawImage(img, 0, 0);
                    uploadedEncCanvas = encCvs;
                    drawPreview(rsaPreviewCanvas, img, 480);
                    rsaFileInfo.innerHTML        = `✅ ${file.name} | ${img.width}×${img.height}`;
                    rsaPreviewStatus.textContent = `${img.width}×${img.height} (ENC)`;
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function loadKeyFile(file) {
        RSAModule.parseKeyFile(file).then(res => {
            if (!res.valid) {
                rsaKeyFileInfo.textContent  = '✘ ' + res.error;
                rsaKeyFileInfo.style.color  = 'var(--pink)';
                decLayers                   = null;
                rsaKeyInfoBox.style.display = 'none';
                return;
            }
            decLayers = res.layers;
            rsaKeyFileInfo.innerHTML   = `✅ ${file.name} | mode: ${res.mode} | ${res.layers.length} layer(s)`;
            rsaKeyFileInfo.style.color = '';
            let html = `<span class="kv-green">MODE:</span> ${res.mode}<br>`;
            res.layers.forEach((l, i) => {
                const tag = res.layers.length > 1 ? `LAYER ${i + 1}  ` : '';
                html += `<span class="kv">${tag}n:</span> ${l.n}&nbsp;&nbsp;`
                      + `<span class="kv-pink">d:</span> ${l.d}<br>`;
            });
            rsaKeyInfoBox.innerHTML     = html;
            rsaKeyInfoBox.style.display = '';
        });
    }

    function doEncrypt() {
        if (busy) return;
        if (!origImgData) { toast('Please upload an image first'); return; }
        for (let i = 0; i < layerCount; i++) {
            if (!layerParams[i] || !layerParams[i].valid) {
                toast(layerCount > 1 ? `Layer ${i + 1} params invalid, please check` : 'Params invalid, please check');
                return;
            }
        }
        busy = true;
        rsaEncryptAction.disabled = true;
        rsaSaveEncBtn.style.display = rsaSaveKeyBtn.style.display = rsaSaveDecBtn.style.display = 'none';
        setProgress(0, 'ENCRYPTING...');
        rsaResultStatus.textContent = '⚡ ENCRYPTING...';

        const layers = layerParams.map(p => ({ n: p.n, e: p.e }));
        RSAModule.encrypt(origImgData, layers, pct => setProgress(pct, 'ENCRYPTING...'))
            .then(canvas => {
                encResultCanvas = canvas;
                drawPreview(rsaResultCanvas, canvas, 480);
                rsaResultStatus.textContent   = `ENCRYPTED | ${canvas.width}×${canvas.height}`;
                setProgress(100, 'DONE ✓');
                rsaSaveEncBtn.style.display   = '';
                rsaSaveKeyBtn.style.display   = '';
                busy = false;
                rsaEncryptAction.disabled = false;
            })
            .catch(err => {
                toast('Encryption failed: ' + (err && err.message ? err.message : err));
                rsaResultStatus.textContent = 'ERROR';
                setProgress(0, 'ERROR');
                busy = false;
                rsaEncryptAction.disabled = false;
            });
    }

    function doDecrypt() {
        if (busy) return;
        if (!uploadedEncCanvas) { toast('Please upload encrypted image (PNG) first'); return; }
        if (!decLayers)          { toast('Please upload key file (.pspkey) first'); return; }
        busy = true;
        rsaDecryptAction.disabled = true;
        rsaSaveEncBtn.style.display = rsaSaveKeyBtn.style.display = rsaSaveDecBtn.style.display = 'none';
        setProgress(0, 'DECRYPTING...');
        rsaResultStatus.textContent = '⚡ DECRYPTING...';

        RSAModule.decrypt(uploadedEncCanvas, decLayers, pct => setProgress(pct, 'DECRYPTING...'))
            .then(imgData => {
                if (!imgData) {
                    toast('Decryption failed: incorrect format or key mismatch');
                    rsaResultStatus.textContent = 'ERROR';
                    setProgress(0, 'ERROR');
                    busy = false;
                    rsaDecryptAction.disabled = false;
                    return;
                }
                decImgData = imgData;
                rsaResultCanvas.width  = imgData.width;
                rsaResultCanvas.height = imgData.height;
                rsaResultCanvas.getContext('2d').putImageData(imgData, 0, 0);
                rsaResultStatus.textContent = `DECRYPTED | ${imgData.width}×${imgData.height}`;
                setProgress(100, 'DONE ✓');
                rsaSaveDecBtn.style.display = '';
                busy = false;
                rsaDecryptAction.disabled = false;
            })
            .catch(err => {
                toast('Decryption failed: ' + (err && err.message ? err.message : err));
                rsaResultStatus.textContent = 'ERROR';
                setProgress(0, 'ERROR');
                busy = false;
                rsaDecryptAction.disabled = false;
            });
    }

    function saveEncryptedPNG() {
        if (!encResultCanvas) { toast('No encrypted image available'); return; }
        const link = document.createElement('a');
        link.download = `encrypted_${Date.now()}.png`;
        link.href     = encResultCanvas.toDataURL('image/png');
        link.click();
    }

    function saveKeyFile() {
        const valid = layerParams.filter(p => p && p.valid);
        if (valid.length !== layerCount) { toast('Parameters incomplete'); return; }
        RSAModule.exportKeyFile(rsaMode, valid.map(p => ({ n: p.n, d: p.d })));
    }

    function saveDecryptedPNG() {
        if (!decImgData) { toast('No decrypted image available'); return; }
        const tmp = document.createElement('canvas');
        tmp.width  = decImgData.width;
        tmp.height = decImgData.height;
        tmp.getContext('2d').putImageData(decImgData, 0, 0);
        const link = document.createElement('a');
        link.download = `decrypted_${Date.now()}.png`;
        link.href     = tmp.toDataURL('image/png');
        link.click();
    }

    function bindEvents() {
        rsaModeBtn.addEventListener('click',    enterRSAMode);
        singleModeBtn.addEventListener('click', leaveRSAMode);
        mixModeBtn.addEventListener('click',    leaveRSAMode);

        rsaEncryptModeBtn.addEventListener('click', () => setSubMode('encrypt'));
        rsaDecryptModeBtn.addEventListener('click', () => setSubMode('decrypt'));

        rsaSingleRSABtn.addEventListener('click', () => setRSAMode('single'));
        rsaMultiRSABtn.addEventListener('click',  () => setRSAMode('multi'));

        rsaLayerCountInput.addEventListener('change', e => setLayerCount(e.target.value));

        rsaAutoAllBtn.addEventListener('click', () => {
            for (let i = 0; i < layerCount; i++) {
                const res = RSAModule.autoGenerateParams();
                if (!res) { toast('Auto generation failed, please retry'); return; }
                layerParams[i] = res;
            }
            buildLayerUI(layerCount);
        });

        setupDropZone(rsaDropZone, rsaFileInput, loadImageFile);
        setupDropZone(rsaKeyDropZone, rsaKeyFileInput, loadKeyFile);

        rsaEncryptAction.addEventListener('click', doEncrypt);
        rsaDecryptAction.addEventListener('click', doDecrypt);

        rsaSaveEncBtn.addEventListener('click', saveEncryptedPNG);
        rsaSaveKeyBtn.addEventListener('click', saveKeyFile);
        rsaSaveDecBtn.addEventListener('click', saveDecryptedPNG);
    }

    function init() {
        rsaPreviewCard.style.display  = 'none';
        rsaResultCard.style.display   = 'none';
        rsaProgressWrap.style.display = 'none';
        rsaSaveEncBtn.style.display   = 'none';
        rsaSaveKeyBtn.style.display   = 'none';
        rsaSaveDecBtn.style.display   = 'none';
        rsaKeyInfoBox.style.display   = 'none';

        buildLayerUI(1);
        bindEvents();
        setSubMode('encrypt');
        setRSAMode('single');
    }

    init();
})();
