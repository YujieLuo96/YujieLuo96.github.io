/**
 * PixelEngine — 像素块生成与混合核心算法
 *
 * 接口：
 *   window.PixelEngine.BLOCK_RENDER_SIZE          每块渲染像素数
 *   window.PixelEngine.generatePixelDataFromImage  单图像素化
 *   window.PixelEngine.mixPixelData               双图棋盘混合
 */
(function () {
    const BLOCK_RENDER_SIZE = 1;

    /**
     * 将 ImageData 按 n×m 块网格像素化，返回新 ImageData
     * @param {ImageData} imgData   原始图像数据
     * @param {number} srcWidth     原图宽度
     * @param {number} srcHeight    原图高度
     * @param {number} n            水平块数
     * @param {number} m            垂直块数
     * @returns {ImageData}
     */
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

    /**
     * 将两张已像素化的 ImageData 按模式交替混合
     * @param {ImageData} data1
     * @param {ImageData} data2
     * @param {'row'|'col'|'checker'} mode
     * @returns {ImageData}
     */
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

    /**
     * 编译二元函数表达式字符串，返回 (a, b) => number 的函数。
     * 沙箱：仅暴露白名单 Math 函数；用边界值 (0, 255) 预检返回值类型。
     *
     * @param {string} funcStr  如 "a + b"、"abs(a-b)"
     * @returns {Function}
     * @throws {Error} 语法非法或返回非有限数
     */
    function _compileFunc(funcStr) {
        const fn = new Function('a', 'b',
            'var abs=Math.abs,max=Math.max,min=Math.min,floor=Math.floor,' +
            'ceil=Math.ceil,round=Math.round,sqrt=Math.sqrt,pow=Math.pow,' +
            'sin=Math.sin,cos=Math.cos,log=Math.log;' +
            'return (' + funcStr + ');'
        );
        // 用三组边界值检验，避免 log(a+b) 在 (0,0) 时返回 -Infinity 类问题
        for (const [a, b] of [[0, 255], [0, 0], [255, 255]]) {
            const v = fn(a, b);
            if (typeof v !== 'number' || !isFinite(v))
                throw new Error('function must return a finite number');
        }
        return fn;
    }

    /** 安全取模，确保结果在 [0, 255]；非有限值返回 0 */
    function _mod256(v) {
        if (!isFinite(v)) return 0;
        return ((v % 256) + 256) % 256;
    }

    /**
     * 统一函数混合：对两张已像素化的 ImageData，用同一个二元函数 f(a,b)
     * 逐像素、逐通道（R/G/B/A）计算输出。
     *
     * @param {ImageData} data1
     * @param {ImageData} data2
     * @param {string}    funcStr  如 "a + b"
     * @returns {ImageData}
     * @throws {Error} 若 funcStr 语法非法
     */
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

    /**
     * 分通道函数混合：对两张已像素化的 ImageData，为 R/G/B/A 四个通道分别
     * 指定独立的二元函数，各自计算对应通道的输出值。
     *
     * 每个输出通道值 = (f_channel(a, b) mod 256 + 256) mod 256。
     *
     * @param {ImageData} data1
     * @param {ImageData} data2
     * @param {string}    strR   R 通道表达式，如 "abs(a-b)"
     * @param {string}    strG   G 通道表达式
     * @param {string}    strB   B 通道表达式
     * @param {string}    strA   A 通道表达式，如 "255"
     * @returns {ImageData}
     * @throws {Error} 若任一表达式语法非法（错误信息含通道名）
     */
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

    /**
     * 像素平均：对已像素化的 ImageData，将每个像素 (x,y) 替换为
     * 其曼哈顿距离 ≤ d 的所有邻域像素（含自身，超出边界则跳过）
     * 的 RGB 分量均值。Alpha 固定输出 255。
     *
     * 曼哈顿邻域遍历：dy ∈ [-d, d]，dx ∈ [-(d-|dy|), d-|dy|]，
     * 时间复杂度 O(w·h·d²)。d=0 时等价于恒等（无变化）。
     *
     * @param {ImageData} imgData  待处理的像素图像
     * @param {number}    d        曼哈顿半径，整数 ≥ 0
     * @returns {ImageData}        新 ImageData，与输入同尺寸
     */
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

    /**
     * 饱和度调整：在 HSV 空间缩放 S 分量，RGB 转换完全内联，无外部依赖。
     * saturation=0 → 灰度；=1 → 无变化；>1 → 增强饱和。
     *
     * @param {ImageData} imgData
     * @param {number}    saturation  ≥ 0，推荐范围 [0, 2]
     * @returns {ImageData}
     */
    function saturateData(imgData, saturation) {
        const w = imgData.width, h = imgData.height;
        const result = new ImageData(w, h);
        const src = imgData.data, out = result.data;

        for (let i = 0; i < src.length; i += 4) {
            const r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;

            // RGB → HSV
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

            // 缩放 S，上限钳制为 1
            const ss2 = Math.min(1, ss * saturation);

            // HSV → RGB
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

    /**
     * 色调映射：对每个通道独立施加分段幂次 S 曲线。
     *
     * 暗部 (x ≤ 0.5)：上凸曲线，参数 shadows 控制提亮幅度。
     * 亮部 (x  > 0.5)：下凸曲线，参数 highlights 控制压缩幅度。
     * 三端连续：f(0)=0，f(0.5)=0.5，f(1)=1。
     *
     * γ_shadow    = 1 - shadows    × 0.75  ∈ [0.25, 1]
     * γ_highlight = 1 - highlights × 0.75  ∈ [0.25, 1]
     *
     * @param {ImageData} imgData
     * @param {number}    shadows     ∈ [0, 1]，0=无变化，1=最大提亮
     * @param {number}    highlights  ∈ [0, 1]，0=无变化，1=最大压缩
     * @returns {ImageData}
     */
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
                    // 暗部：t ∈ [0,1] → pow(t, γ) → 映射回 [0, 0.5]
                    y = Math.pow(x / 0.5, gShadow) * 0.5;
                } else {
                    // 亮部：t ∈ [0,1] → 1-pow(1-t, γ) → 映射回 [0.5, 1]
                    y = 0.5 + (1 - Math.pow(1 - (x - 0.5) / 0.5, gHighlight)) * 0.5;
                }
                out[i + c] = Math.max(0, Math.min(255, Math.round(y * 255)));
            }
            out[i + 3] = 255;
        }
        return result;
    }

    /**
     * 非锐化掩模（Clarity）：增强局部对比度。
     * 内部复用 pixelAverageData 计算模糊层，再叠加细节层。
     *
     * output[p] = clamp(orig[p] + amount × (orig[p] − blurred[p]), 0, 255)
     *
     * amount=0 → 无变化；=1 → 标准锐化；>1 → 强锐化。
     *
     * @param {ImageData} imgData
     * @param {number}    d       曼哈顿模糊半径，整数 ≥ 1
     * @param {number}    amount  增强强度 ≥ 0
     * @returns {ImageData}
     */
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

    // ════════════════════════════════════════════════════════════════
    // 像素置换：列/行奇偶重排（用于 RSA 加密前预处理）
    //
    //  列重排规则（0-indexed）：
    //    偶列 c  →  左侧第 c/2 列
    //    奇列 c  →  右侧第 floor(c/2) 列（即 W-1-floor(c/2)）
    //
    //  列逆变换：
    //    目标列 d < ceil(W/2)  →  原列 2d
    //    目标列 d ≥ ceil(W/2)  →  原列 2*(W-1-d)+1
    //
    //  行重排/逆变换：同理，W→H，列→行
    // ════════════════════════════════════════════════════════════════

    /**
     * 列重排（前向）：奇偶列分离，偶列堆左、奇列堆右
     * @param   {ImageData} imgData
     * @returns {ImageData}  同尺寸
     */
    function shuffleCols(imgData) {
        const w = imgData.width, h = imgData.height;
        const src = imgData.data;
        const out = new ImageData(w, h);
        const dst = out.data;
        for (let row = 0; row < h; row++) {
            for (let c = 0; c < w; c++) {
                const dc = (c % 2 === 0) ? (c >> 1) : (w - 1 - (c >> 1));
                const si = (row * w + c)  * 4;
                const di = (row * w + dc) * 4;
                dst[di]     = src[si];
                dst[di + 1] = src[si + 1];
                dst[di + 2] = src[si + 2];
                dst[di + 3] = src[si + 3];
            }
        }
        return out;
    }

    /**
     * 列重排（逆向）：还原 shuffleCols
     * @param   {ImageData} imgData
     * @returns {ImageData}  同尺寸
     */
    function unshuffleCols(imgData) {
        const w = imgData.width, h = imgData.height;
        const oddCount = Math.ceil(w / 2);
        const src = imgData.data;
        const out = new ImageData(w, h);
        const dst = out.data;
        for (let row = 0; row < h; row++) {
            for (let d = 0; d < w; d++) {
                const sc = (d < oddCount) ? (d * 2) : (2 * (w - 1 - d) + 1);
                const si = (row * w + d)  * 4;
                const di = (row * w + sc) * 4;
                dst[di]     = src[si];
                dst[di + 1] = src[si + 1];
                dst[di + 2] = src[si + 2];
                dst[di + 3] = src[si + 3];
            }
        }
        return out;
    }

    /**
     * 行重排（前向）：奇偶行分离，偶行堆上、奇行堆下
     * @param   {ImageData} imgData
     * @returns {ImageData}  同尺寸
     */
    function shuffleRows(imgData) {
        const w = imgData.width, h = imgData.height;
        const src = imgData.data;
        const out = new ImageData(w, h);
        const dst = out.data;
        const rowBytes = w * 4;
        for (let r = 0; r < h; r++) {
            const dr = (r % 2 === 0) ? (r >> 1) : (h - 1 - (r >> 1));
            dst.set(src.subarray(r * rowBytes, (r + 1) * rowBytes), dr * rowBytes);
        }
        return out;
    }

    /**
     * 行重排（逆向）：还原 shuffleRows
     * @param   {ImageData} imgData
     * @returns {ImageData}  同尺寸
     */
    function unshuffleRows(imgData) {
        const w = imgData.width, h = imgData.height;
        const oddCount = Math.ceil(h / 2);
        const src = imgData.data;
        const out = new ImageData(w, h);
        const dst = out.data;
        const rowBytes = w * 4;
        for (let d = 0; d < h; d++) {
            const sr = (d < oddCount) ? (d * 2) : (2 * (h - 1 - d) + 1);
            dst.set(src.subarray(d * rowBytes, (d + 1) * rowBytes), sr * rowBytes);
        }
        return out;
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
        shuffleCols,
        unshuffleCols,
        shuffleRows,
        unshuffleRows,
    };
})();
