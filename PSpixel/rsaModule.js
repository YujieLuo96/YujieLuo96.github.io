(function () {
    'use strict';

    function isPrime(n) {
        n = parseInt(n);
        if (n < 2)       return false;
        if (n === 2)     return true;
        if (n % 2 === 0) return false;
        for (let i = 3; i * i <= n; i += 2)
            if (n % i === 0) return false;
        return true;
    }

    function gcd(a, b) {
        a = BigInt(a); b = BigInt(b);
        while (b !== 0n) [a, b] = [b, a % b];
        return a;
    }

    function modPow(base, exp, mod) {
        base = BigInt(base); exp = BigInt(exp); mod = BigInt(mod);
        if (mod === 1n) return 0n;
        let result = 1n;
        base %= mod;
        while (exp > 0n) {
            if (exp & 1n) result = result * base % mod;
            exp >>= 1n;
            base = base * base % mod;
        }
        return result;
    }

    function modInverse(e, phi) {
        e = BigInt(e); phi = BigInt(phi);
        let [old_r, r] = [e, phi];
        let [old_s, s] = [1n, 0n];
        while (r !== 0n) {
            const q = old_r / r;
            [old_r, r] = [r, old_r - q * r];
            [old_s, s] = [s, old_s - q * s];
        }
        if (old_r !== 1n) return null;
        return ((old_s % phi) + phi) % phi;
    }

    function generateRandomPrime(min, max) {
        min = parseInt(min); max = parseInt(max);
        if (min > max) return null;
        for (let i = 0; i < 300; i++) {
            let n = Math.floor(Math.random() * (max - min + 1)) + min;
            if (n % 2 === 0) n = (n > min) ? n - 1 : n + 1;
            if (n >= min && n <= max && isPrime(n)) return n;
        }
        for (let n = min; n <= max; n++)
            if (isPrime(n)) return n;
        return null;
    }

    function buildParams(p, q, e) {
        p = parseInt(p); q = parseInt(q); e = parseInt(e);
        if (isNaN(p) || !isPrime(p))   return { valid: false, error: `p = ${p} is not prime` };
        if (isNaN(q) || !isPrime(q))   return { valid: false, error: `q = ${q} is not prime` };
        if (p === q)                    return { valid: false, error: 'p and q must be different' };
        const n   = p * q;
        if (n <= 255)                   return { valid: false, error: `n = p×q = ${n}, must be > 255` };
        if (n > 65535)                  return { valid: false, error: `n = p×q = ${n}, must be ≤ 65535 (16-bit storage limit)` };
        const phi = (p - 1) * (q - 1);
        if (isNaN(e) || e < 2)          return { valid: false, error: 'e must be ≥ 2' };
        if (gcd(e, phi) !== 1n)         return { valid: false, error: `gcd(e, φ(n)) ≠ 1, please choose a different e` };
        const dBig = modInverse(e, phi);
        if (dBig === null)              return { valid: false, error: 'Cannot compute private key d' };
        return { valid: true, p, q, n, phi, e, d: Number(dBig) };
    }

    function autoGenerateParams() {
        for (let attempt = 0; attempt < 500; attempt++) {
            const p = generateRandomPrime(17, 251);
            const q = generateRandomPrime(17, 251);
            if (!p || !q || p === q) continue;
            const n = p * q;
            if (n <= 255 || n > 65535) continue;
            const phi = (p - 1) * (q - 1);
            let e = 3;
            while (e < phi) { if (gcd(e, phi) === 1n) break; e += 2; }
            if (e >= phi) continue;
            const dBig = modInverse(e, phi);
            if (dBig === null) continue;
            return { valid: true, p, q, n, phi, e, d: Number(dBig) };
        }
        return null;
    }

    function exportKeyFile(mode, layers) {
        const payload = {
            app:     'PSPixel',
            version: '2.0',
            mode,
            layers:  layers.map(({ n, d }) => ({ n, d }))
        };
        const blob = new Blob(
            [JSON.stringify(payload, null, 2)],
            { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = `pixelkey_${Date.now()}.pspkey`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function parseKeyFile(file) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.app !== 'PSPixel')
                        return resolve({ valid: false, error: 'Not a valid PSPixel key file' });
                    if (!Array.isArray(data.layers) || data.layers.length === 0)
                        return resolve({ valid: false, error: 'Key file missing layers field' });
                    for (let i = 0; i < data.layers.length; i++) {
                        const l = data.layers[i];
                        if (l.n === undefined || l.d === undefined)
                            return resolve({ valid: false, error: `Layer ${i + 1} missing n or d` });
                    }
                    resolve({ valid: true, mode: data.mode || 'single', layers: data.layers });
                } catch {
                    resolve({ valid: false, error: 'Key file JSON parse failed' });
                }
            };
            reader.onerror = () => resolve({ valid: false, error: 'File read failed' });
            reader.readAsText(file);
        });
    }

    function duoMix(imgData) {
        const w   = imgData.width, h = imgData.height;
        const src = imgData.data;
        const out = new ImageData(w, h);
        const dst = out.data;
        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                const i = (row * w + col) * 4;
                if ((col + row) % 2 === 0) {
                    dst[i]     = 255 - src[i];
                    dst[i + 1] = 255 - src[i + 1];
                    dst[i + 2] = 255 - src[i + 2];
                } else {
                    dst[i]     = src[i];
                    dst[i + 1] = src[i + 1];
                    dst[i + 2] = src[i + 2];
                }
                dst[i + 3] = src[i + 3];
            }
        }
        return out;
    }

    function _toCanvas(imgData) {
        const c = document.createElement('canvas');
        c.width  = imgData.width;
        c.height = imgData.height;
        c.getContext('2d').putImageData(imgData, 0, 0);
        return c;
    }

    function _fromCanvas(canvas) {
        return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    }

    function _packH(origW, origH, encPixels) {
        const outW = origW * 2;
        const out  = new ImageData(outW, origH);
        const d    = out.data;
        for (let i = 0; i < encPixels.length; i++) {
            const { rHi, gHi, bHi, rLo, gLo, bLo, alpha, aFixed } = encPixels[i];
            const col = i % origW;
            const row = Math.floor(i / origW);
            const iA  = (row * outW + col * 2) * 4;
            d[iA]     = rHi; d[iA + 1] = gHi; d[iA + 2] = bHi; d[iA + 3] = aFixed;
            const iB  = iA + 4;
            d[iB]     = rLo; d[iB + 1] = gLo; d[iB + 2] = bLo; d[iB + 3] = alpha;
        }
        return out;
    }

    function _unpackH(imgData) {
        const encW = imgData.width, encH = imgData.height;
        if (encW % 2 !== 0)
            return { valid: false, error: 'Horizontal decrypt failed: image width must be even' };
        const origW = encW / 2, origH = encH;
        const d     = imgData.data;
        const encPixels = new Array(origW * origH);
        for (let row = 0; row < origH; row++) {
            for (let col = 0; col < origW; col++) {
                const iA = (row * encW + col * 2) * 4;
                const iB = iA + 4;
                encPixels[row * origW + col] = {
                    rHi: d[iA],     gHi: d[iA + 1], bHi: d[iA + 2],
                    rLo: d[iB],     gLo: d[iB + 1], bLo: d[iB + 2],
                    alpha: d[iB + 3]
                };
            }
        }
        return { valid: true, origW, origH, encPixels };
    }

    function _packV(origW, origH, encPixels) {
        const outH = origH * 2;
        const out  = new ImageData(origW, outH);
        const d    = out.data;
        for (let i = 0; i < encPixels.length; i++) {
            const { rHi, gHi, bHi, rLo, gLo, bLo, alpha, aFixed } = encPixels[i];
            const col = i % origW;
            const row = Math.floor(i / origW);
            const iA  = (row * 2 * origW + col) * 4;
            d[iA]     = rHi; d[iA + 1] = gHi; d[iA + 2] = bHi; d[iA + 3] = aFixed;
            const iB  = ((row * 2 + 1) * origW + col) * 4;
            d[iB]     = rLo; d[iB + 1] = gLo; d[iB + 2] = bLo; d[iB + 3] = alpha;
        }
        return out;
    }

    function _unpackV(imgData) {
        const encW = imgData.width, encH = imgData.height;
        if (encH % 2 !== 0)
            return { valid: false, error: 'Vertical decrypt failed: image height must be even' };
        const origW = encW, origH = encH / 2;
        const d     = imgData.data;
        const encPixels = new Array(origW * origH);
        for (let row = 0; row < origH; row++) {
            for (let col = 0; col < origW; col++) {
                const iA = (row * 2 * encW + col) * 4;
                const iB = ((row * 2 + 1) * encW + col) * 4;
                encPixels[row * origW + col] = {
                    rHi: d[iA],     gHi: d[iA + 1], bHi: d[iA + 2],
                    rLo: d[iB],     gLo: d[iB + 1], bLo: d[iB + 2],
                    alpha: d[iB + 3]
                };
            }
        }
        return { valid: true, origW, origH, encPixels };
    }

    const CHUNK = 1500;

    function _encryptPixelsAsync(imgData, layersBig, onProgress) {
        return new Promise(resolve => {
            const w = imgData.width, h = imgData.height;
            const total = w * h, l = layersBig.length;
            const encPixels = new Array(total);
            let i = 0;
            (function step() {
                const end = Math.min(i + CHUNK, total);
                for (; i < end; i++) {
                    const col = i % w, row = Math.floor(i / w);
                    const { n, e } = layersBig[(col + row) % l];
                    const base = i * 4;
                    const r  = imgData.data[base];
                    const g  = imgData.data[base + 1];
                    const b  = imgData.data[base + 2];
                    const a  = imgData.data[base + 3];
                    const rE = Number(modPow(r, e, n));
                    const gE = Number(modPow(g, e, n));
                    const bE = Number(modPow(b, e, n));
                    encPixels[i] = {
                        rHi: rE >> 8,   gHi: gE >> 8,   bHi: bE >> 8,
                        rLo: rE & 0xFF, gLo: gE & 0xFF, bLo: bE & 0xFF,
                        alpha: a,
                        aFixed: 255
                    };
                }
                onProgress(Math.floor(i / total * 100));
                if (i < total) setTimeout(step, 0);
                else           resolve(encPixels);
            })();
        });
    }

    function _decryptPixelsAsync(encPixels, origW, origH, layersBig, onProgress) {
        return new Promise(resolve => {
            const total  = origW * origH, l = layersBig.length;
            const output = new ImageData(origW, origH);
            let i = 0;
            (function step() {
                const end = Math.min(i + CHUNK, total);
                for (; i < end; i++) {
                    const col = i % origW, row = Math.floor(i / origW);
                    const { n, d } = layersBig[(col + row) % l];
                    const ep  = encPixels[i];
                    const rE  = (ep.rHi << 8) | ep.rLo;
                    const gE  = (ep.gHi << 8) | ep.gLo;
                    const bE  = (ep.bHi << 8) | ep.bLo;
                    const dst = i * 4;
                    output.data[dst]     = Number(modPow(rE, d, n));
                    output.data[dst + 1] = Number(modPow(gE, d, n));
                    output.data[dst + 2] = Number(modPow(bE, d, n));
                    output.data[dst + 3] = ep.alpha;
                }
                onProgress(Math.floor(i / total * 100));
                if (i < total) setTimeout(step, 0);
                else           resolve(output);
            })();
        });
    }

    async function encrypt(imgData, layers, onProgress) {
        const layersBig = layers.map(({ n, e }) => ({ n: BigInt(n), e: BigInt(e) }));
        const origW = imgData.width, origH = imgData.height;

        const ep1   = await _encryptPixelsAsync(
            imgData, layersBig,
            p => onProgress(Math.floor(p / 3))
        );
        const pack1 = _packH(origW, origH, ep1);

        const mix1  = duoMix(pack1);

        const ep2   = await _encryptPixelsAsync(
            mix1, layersBig,
            p => onProgress(33 + Math.floor(p * 2 / 3))
        );
        const pack2 = _packV(mix1.width, mix1.height, ep2);

        const mix2  = duoMix(pack2);

        onProgress(100);
        return _toCanvas(mix2);
    }

    async function decrypt(encCanvas, layers, onProgress) {
        const encImgData = _fromCanvas(encCanvas);

        if (encImgData.width % 2 !== 0 || encImgData.height % 2 !== 0) return null;

        const layersBig = layers.map(({ n, d }) => ({ n: BigInt(n), d: BigInt(d) }));

        const unmix2 = duoMix(encImgData);

        const uV = _unpackV(unmix2);
        if (!uV.valid) return null;
        const decV = await _decryptPixelsAsync(
            uV.encPixels, uV.origW, uV.origH, layersBig,
            p => onProgress(Math.floor(p * 2 / 3))
        );

        const unmix1 = duoMix(decV);

        const uH = _unpackH(unmix1);
        if (!uH.valid) return null;
        const decH = await _decryptPixelsAsync(
            uH.encPixels, uH.origW, uH.origH, layersBig,
            p => onProgress(67 + Math.floor(p / 3))
        );

        onProgress(100);
        return decH;
    }

    window.RSAModule = {
        isPrime,
        gcd,
        modPow,
        modInverse,
        generateRandomPrime,
        buildParams,
        autoGenerateParams,
        exportKeyFile,
        parseKeyFile,
        duoMix,
        encrypt,
        decrypt
    };
})();
