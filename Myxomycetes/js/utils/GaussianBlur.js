// Separable Gaussian blur for Float32 single-channel images.
// Kernel coefficients are cached by sigma so repeated calls are cheap.

const _cache = new Map();

function _kernel(sigma) {
    if (_cache.has(sigma)) return _cache.get(sigma);
    const radius = Math.ceil(3 * sigma);
    const size   = 2 * radius + 1;
    const k      = new Float32Array(size);
    let   sum    = 0;
    for (let i = 0; i < size; i++) {
        const x = i - radius;
        k[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
        sum += k[i];
    }
    for (let i = 0; i < size; i++) k[i] /= sum;
    const entry = { k, radius, size };
    _cache.set(sigma, entry);
    return entry;
}

/**
 * Two-pass separable Gaussian blur.
 * src, tmp, dst must be Float32Array of length width*height.
 * tmp is a scratch buffer; dst receives the result.
 * Boundary: clamp-to-edge.
 */
export function gaussianBlur(src, tmp, dst, width, height, sigma) {
    const { k, radius, size } = _kernel(sigma);

    // ── Horizontal pass: src → tmp ────────────────────────────────────────────
    for (let y = 0; y < height; y++) {
        const row = y * width;
        // Left border
        for (let x = 0; x < radius; x++) {
            let val = 0;
            for (let ki = 0; ki < size; ki++) {
                val += src[row + Math.max(0, x + ki - radius)] * k[ki];
            }
            tmp[row + x] = val;
        }
        // Inner (no clamping needed)
        const xEnd = width - radius;
        for (let x = radius; x < xEnd; x++) {
            let val = 0;
            const base = row + x - radius;
            for (let ki = 0; ki < size; ki++) val += src[base + ki] * k[ki];
            tmp[row + x] = val;
        }
        // Right border
        for (let x = Math.max(xEnd, radius); x < width; x++) {
            let val = 0;
            for (let ki = 0; ki < size; ki++) {
                val += src[row + Math.min(width - 1, x + ki - radius)] * k[ki];
            }
            tmp[row + x] = val;
        }
    }

    // ── Vertical pass: tmp → dst ──────────────────────────────────────────────
    for (let x = 0; x < width; x++) {
        // Top border
        for (let y = 0; y < radius; y++) {
            let val = 0;
            for (let ki = 0; ki < size; ki++) {
                val += tmp[Math.max(0, y + ki - radius) * width + x] * k[ki];
            }
            dst[y * width + x] = val;
        }
        // Inner
        const yEnd = height - radius;
        for (let y = radius; y < yEnd; y++) {
            let val = 0;
            const base = (y - radius) * width + x;
            for (let ki = 0; ki < size; ki++) val += tmp[base + ki * width] * k[ki];
            dst[y * width + x] = val;
        }
        // Bottom border
        for (let y = Math.max(yEnd, radius); y < height; y++) {
            let val = 0;
            for (let ki = 0; ki < size; ki++) {
                val += tmp[Math.min(height - 1, y + ki - radius) * width + x] * k[ki];
            }
            dst[y * width + x] = val;
        }
    }
}
