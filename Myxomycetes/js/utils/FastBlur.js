// Fast approximate Gaussian blur for Float32 single-channel images.
//
// Three successive box blurs approximate a true Gaussian to within a few percent
// (central-limit theorem), and each box blur is evaluated with a running sum, so
// the cost is O(1) per pixel REGARDLESS of radius. A real separable Gaussian costs
// O(radius) per pixel — that difference is what lets the renderer blur and bloom a
// multi-species field every frame at interactive rates.
//
// Box radius is chosen so that 3 passes match the requested sigma: the variance of
// one box of radius r is (r²+r)/3, so three of them sum to r²+r ≈ σ²  ⇒
//   r = round( (−1 + √(1 + 4σ²)) / 2 ),  clamped to ≥ 1.

function radiusForSigma(sigma) {
    return Math.max(1, Math.round((-1 + Math.sqrt(1 + 4 * sigma * sigma)) / 2));
}

function boxH(src, dst, w, h, r) {
    const norm = 1 / (2 * r + 1);
    const wm = w - 1;
    for (let y = 0; y < h; y++) {
        const row = y * w;
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[row + (k < 0 ? 0 : k > wm ? wm : k)];
        for (let x = 0; x < w; x++) {
            dst[row + x] = acc * norm;
            const inX  = x + r + 1; const outX = x - r;
            acc += src[row + (inX  > wm ? wm : inX)]
                 - src[row + (outX < 0 ? 0 : outX)];
        }
    }
}

function boxV(src, dst, w, h, r) {
    const norm = 1 / (2 * r + 1);
    const hm = h - 1;
    for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[(k < 0 ? 0 : k > hm ? hm : k) * w + x];
        for (let y = 0; y < h; y++) {
            dst[y * w + x] = acc * norm;
            const inY  = y + r + 1; const outY = y - r;
            acc += src[(inY  > hm ? hm : inY) * w + x]
                 - src[(outY < 0 ? 0 : outY) * w + x];
        }
    }
}

/**
 * Approximate Gaussian blur. src, tmp, dst are Float32Array(w*h); tmp is scratch.
 * Result lands in dst. src may equal dst (the first pass reads src into tmp).
 * `passes` box iterations (default 3 ≈ Gaussian; 2 is softer/cheaper).
 */
export function fastBlur(src, tmp, dst, w, h, sigma, passes = 3) {
    const r = radiusForSigma(sigma);
    boxH(src, tmp, w, h, r);   // src → tmp
    boxV(tmp, dst, w, h, r);   // tmp → dst
    for (let p = 1; p < passes; p++) {
        boxH(dst, tmp, w, h, r);
        boxV(tmp, dst, w, h, r);
    }
}
