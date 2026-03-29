(function () {
    const BLOCK_RENDER_SIZE = 1;

    function generatePixelDataFromImage(imgData, srcWidth, srcHeight, n, m) {
        const outWidth = n * BLOCK_RENDER_SIZE;
        const outHeight = m * BLOCK_RENDER_SIZE;
        const outputData = new ImageData(outWidth, outHeight);
        const stepX = srcWidth / n;
        const stepY = srcHeight / m;

        for (let by = 0; by < m; by++) {
            for (let bx = 0; bx < n; bx++) {
                let startX = Math.floor(bx * stepX);
                let endX   = Math.floor((bx + 1) * stepX);
                let startY = Math.floor(by * stepY);
                let endY   = Math.floor((by + 1) * stepY);
                if (endX <= startX) endX = startX + 1;
                if (endY <= startY) endY = startY + 1;
                startX = Math.min(Math.max(startX, 0), srcWidth - 1);
                endX   = Math.min(Math.max(endX, startX + 1), srcWidth);
                startY = Math.min(Math.max(startY, 0), srcHeight - 1);
                endY   = Math.min(Math.max(endY, startY + 1), srcHeight);

                let rSum = 0, gSum = 0, bSum = 0, pixelCount = 0;
                for (let py = startY; py < endY; py++) {
                    for (let px = startX; px < endX; px++) {
                        const idx = (py * srcWidth + px) * 4;
                        rSum += imgData.data[idx];
                        gSum += imgData.data[idx + 1];
                        bSum += imgData.data[idx + 2];
                        pixelCount++;
                    }
                }
                const avgR = Math.floor(rSum / pixelCount);
                const avgG = Math.floor(gSum / pixelCount);
                const avgB = Math.floor(bSum / pixelCount);

                const destIdx = (by * outWidth + bx) * 4;
                outputData.data[destIdx]     = avgR;
                outputData.data[destIdx + 1] = avgG;
                outputData.data[destIdx + 2] = avgB;
                outputData.data[destIdx + 3] = 255;
            }
        }
        return outputData;
    }

    function mixPixelData(data1, data2, mode) {
        const w = data1.width, h = data1.height;
        const n = w / BLOCK_RENDER_SIZE, m = h / BLOCK_RENDER_SIZE;
        const result = new ImageData(w, h);

        for (let by = 0; by < m; by++) {
            for (let bx = 0; bx < n; bx++) {
                let useFirst;
                if (mode === 'row')         useFirst = (by % 2 === 0);
                else if (mode === 'col')    useFirst = (bx % 2 === 0);
                else                        useFirst = ((bx + by) % 2 === 0);

                const srcData = useFirst ? data1 : data2;
                const idx = (by * w + bx) * 4;
                result.data[idx]     = srcData.data[idx];
                result.data[idx + 1] = srcData.data[idx + 1];
                result.data[idx + 2] = srcData.data[idx + 2];
                result.data[idx + 3] = 255;
            }
        }
        return result;
    }

    function _compileFunc(funcStr) {
        const fn = new Function('a', 'b',
            'var abs=Math.abs,max=Math.max,min=Math.min,floor=Math.floor,' +
            'ceil=Math.ceil,round=Math.round,sqrt=Math.sqrt,pow=Math.pow,' +
            'sin=Math.sin,cos=Math.cos,log=Math.log;' +
            'return (' + funcStr + ');'
        );
        for (const [a, b] of [[0, 255], [0, 0], [255, 255]]) {
            const v = fn(a, b);
            if (typeof v !== 'number' || !isFinite(v))
                throw new Error('function must return a finite number');
        }
        return fn;
    }

    function _mod256(v) {
        if (!isFinite(v)) return 0;
        return ((v % 256) + 256) % 256;
    }

    function funcMixPixelData(data1, data2, funcStr) {
        let fn;
        try {
            fn = _compileFunc(funcStr);
        } catch (e) {
            throw new Error('FUNC PARSE ERROR: ' + e.message);
        }

        const w = data1.width, h = data1.height;
        const result = new ImageData(w, h);
        const d1 = data1.data, d2 = data2.data, out = result.data;

        for (let i = 0; i < d1.length; i += 4) {
            out[i]     = _mod256(fn(d1[i],     d2[i]));
            out[i + 1] = _mod256(fn(d1[i + 1], d2[i + 1]));
            out[i + 2] = _mod256(fn(d1[i + 2], d2[i + 2]));
            out[i + 3] = 255;
        }
        return result;
    }

    function funcMixPixelDataChannels(data1, data2, strR, strG, strB, strA) {
        const labels = ['R', 'G', 'B', 'A'];
        const strs   = [strR, strG, strB, strA];
        const fns    = [];
        for (let c = 0; c < 4; c++) {
            try {
                fns.push(_compileFunc(strs[c]));
            } catch (e) {
                throw new Error(`FUNC PARSE ERROR [${labels[c]}]: ${e.message}`);
            }
        }
        const [fnR, fnG, fnB, fnA] = fns;

        const w = data1.width, h = data1.height;
        const result = new ImageData(w, h);
        const d1 = data1.data, d2 = data2.data, out = result.data;

        for (let i = 0; i < d1.length; i += 4) {
            out[i]     = _mod256(fnR(d1[i],     d2[i]));
            out[i + 1] = _mod256(fnG(d1[i + 1], d2[i + 1]));
            out[i + 2] = _mod256(fnB(d1[i + 2], d2[i + 2]));
            out[i + 3] = _mod256(fnA(d1[i + 3], d2[i + 3]));
        }
        return result;
    }

    function pixelAverageData(imgData, d) {
        const w = imgData.width, h = imgData.height;
        const src = imgData.data;
        const result = new ImageData(w, h);
        const out = result.data;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let rSum = 0, gSum = 0, bSum = 0, count = 0;
                for (let dy = -d; dy <= d; dy++) {
                    const ny = y + dy;
                    if (ny < 0 || ny >= h) continue;
                    const dxMax = d - Math.abs(dy);
                    for (let dx = -dxMax; dx <= dxMax; dx++) {
                        const nx = x + dx;
                        if (nx < 0 || nx >= w) continue;
                        const idx = (ny * w + nx) * 4;
                        rSum += src[idx];
                        gSum += src[idx + 1];
                        bSum += src[idx + 2];
                        count++;
                    }
                }
                const destIdx = (y * w + x) * 4;
                out[destIdx]     = Math.floor(rSum / count);
                out[destIdx + 1] = Math.floor(gSum / count);
                out[destIdx + 2] = Math.floor(bSum / count);
                out[destIdx + 3] = 255;
            }
        }
        return result;
    }

    function saturateData(imgData, saturation) {
        const w = imgData.width, h = imgData.height;
        const result = new ImageData(w, h);
        const src = imgData.data, out = result.data;

        for (let i = 0; i < src.length; i += 4) {
            const r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;

            const mx = Math.max(r, g, b), mn = Math.min(r, g, b), delta = mx - mn;
            const vv = mx;
            const ss = mx === 0 ? 0 : delta / mx;
            let hh = 0;
            if (delta > 0) {
                if      (mx === r) hh = (g - b) / delta + (g < b ? 6 : 0);
                else if (mx === g) hh = (b - r) / delta + 2;
                else               hh = (r - g) / delta + 4;
                hh /= 6;
            }

            const ss2 = Math.min(1, ss * saturation);

            const sector = Math.floor(hh * 6);
            const ff = hh * 6 - sector;
            const p = vv * (1 - ss2);
            const q = vv * (1 - ff * ss2);
            const t = vv * (1 - (1 - ff) * ss2);
            let nr, ng, nb;
            switch (sector % 6) {
                case 0: nr = vv; ng = t;  nb = p;  break;
                case 1: nr = q;  ng = vv; nb = p;  break;
                case 2: nr = p;  ng = vv; nb = t;  break;
                case 3: nr = p;  ng = q;  nb = vv; break;
                case 4: nr = t;  ng = p;  nb = vv; break;
                default: nr = vv; ng = p; nb = q;  break;
            }
            out[i]     = Math.round(nr * 255);
            out[i + 1] = Math.round(ng * 255);
            out[i + 2] = Math.round(nb * 255);
            out[i + 3] = 255;
        }
        return result;
    }

    function toneMapData(imgData, shadows, highlights) {
        const gShadow    = 1 - shadows    * 0.75;
        const gHighlight = 1 - highlights * 0.75;

        const w = imgData.width, h = imgData.height;
        const result = new ImageData(w, h);
        const src = imgData.data, out = result.data;

        for (let i = 0; i < src.length; i += 4) {
            for (let c = 0; c < 3; c++) {
                const x = src[i + c] / 255;
                let y;
                if (x <= 0.5) {
                    y = Math.pow(x / 0.5, gShadow) * 0.5;
                } else {
                    y = 0.5 + (1 - Math.pow(1 - (x - 0.5) / 0.5, gHighlight)) * 0.5;
                }
                out[i + c] = Math.max(0, Math.min(255, Math.round(y * 255)));
            }
            out[i + 3] = 255;
        }
        return result;
    }

    function unsharpMaskData(imgData, d, amount) {
        const blurred = pixelAverageData(imgData, Math.max(1, d));
        const w = imgData.width, h = imgData.height;
        const result = new ImageData(w, h);
        const src = imgData.data, blur = blurred.data, out = result.data;

        for (let i = 0; i < src.length; i += 4) {
            for (let c = 0; c < 3; c++) {
                const v = src[i + c] + amount * (src[i + c] - blur[i + c]);
                out[i + c] = Math.max(0, Math.min(255, Math.round(v)));
            }
            out[i + 3] = 255;
        }
        return result;
    }

    window.PixelEngine = {
        BLOCK_RENDER_SIZE,
        generatePixelDataFromImage,
        mixPixelData,
        funcMixPixelData,
        funcMixPixelDataChannels,
        pixelAverageData,
        saturateData,
        toneMapData,
        unsharpMaskData,
    };
})();
