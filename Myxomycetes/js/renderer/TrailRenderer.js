import { fastBlur } from '../utils/FastBlur.js';

const MIN_PEAK = 1e-9;

const BLOOM_RATIO    = 3.5;
const BLOOM_STRENGTH = 0.55;
const OVEREXPOSURE   = 1.25;
const EXPOSURE       = 1.15;
const GAMMA          = 0.72;

// ── Tone-map LUT ──────────────────────────────────────────────────────────────
// The trail field is tone-mapped by log1p(raw^0.55) to compress its huge dynamic
// range (deposits reach thousands; faint trails are fractional). Evaluating two
// transcendentals per pixel per species is the renderer's hottest path, so it is
// replaced by a lookup. The table is indexed in the SQRT domain — idx ∝ √raw —
// which packs most of its resolution into the low end where the eye is most
// sensitive, so a 2048-entry table is visually lossless. Lookup cost: one sqrt.
const TONE_MAX = 32000;   // covers observed field peaks; values above clamp to white
const TONE_N   = 2048;
const _toneLut = (() => {
    const lut = new Float32Array(TONE_N + 1);
    for (let j = 0; j <= TONE_N; j++) {
        const t   = j / TONE_N;
        const raw = t * t * TONE_MAX;
        lut[j] = Math.log1p(Math.pow(raw, 0.55));
    }
    return lut;
})();
const TONE_C = TONE_N / Math.sqrt(TONE_MAX);   // idx = √raw · TONE_C

// Gamma look-up table: avoids Math.pow per pixel in the final composite pass.
const LUT_SIZE = 1024;
const _gammaLut = (() => {
    const lut = new Uint8Array(LUT_SIZE + 1);
    for (let i = 0; i <= LUT_SIZE; i++) {
        lut[i] = Math.pow(i / LUT_SIZE, GAMMA) * 255 + 0.5 | 0;
    }
    return lut;
})();

export class TrailRenderer {
    constructor(size, numSpecies) {
        this.size       = size;
        this.numSpecies = numSpecies;
        const sz2 = size * size;

        this._workA  = new Float32Array(sz2);   // per-species tone-mapped + blurred signal
        this._workB  = new Float32Array(sz2);   // blur scratch (full res)
        this._compR  = new Float32Array(sz2);
        this._compG  = new Float32Array(sz2);
        this._compB  = new Float32Array(sz2);
        this._imageData = new ImageData(size, size);

        // Half-resolution buffers for the bloom pass. Bloom is a wide, low-frequency
        // blur, so computing it at half resolution (¼ the pixels, half the kernel
        // radius) is visually identical but ~4× cheaper than a full-res wide blur.
        this._hw      = (size + 1) >> 1;
        this._hh      = (size + 1) >> 1;
        this._half    = new Float32Array(this._hw * this._hh);
        this._halfTmp = new Float32Array(this._hw * this._hh);
    }

    render(trailMap, speciesColors, blurSigma) {
        const { size, numSpecies } = this;
        const sz2 = size * size;
        const wa  = this._workA;
        const wb  = this._workB;
        const cR  = this._compR, cG = this._compG, cB = this._compB;
        const hw  = this._hw, hh = this._hh, maxIdx = size - 1;

        cR.fill(0); cG.fill(0); cB.fill(0);

        const bloomSigma = blurSigma * BLOOM_RATIO * 0.5;   // halved: applied at half res

        for (let s = 0; s < numSpecies; s++) {
            const offset = s * sz2;

            // Tone-map via LUT; track peak raw to skip extinct/empty species cheaply.
            let rawMax = 0;
            for (let i = 0; i < sz2; i++) {
                const raw = trailMap[offset + i];
                if (raw > rawMax) rawMax = raw;
                let idx = (Math.sqrt(raw) * TONE_C) | 0;
                if (idx > TONE_N) idx = TONE_N;
                wa[i] = _toneLut[idx];
            }
            if (rawMax < 1e-6) continue;

            // Main soft blur (full res, in place). The simulation field is already
            // spatially diffused, so a single box pass — plus the wide bloom below —
            // gives a smooth glow without a second full-res pass.
            fastBlur(wa, wb, wa, size, size, blurSigma, 1);

            // ── Bloom at half resolution ──────────────────────────────────────
            // Downsample wa (2×2 box) → blur wide → bilinear upsample-add into wa.
            const half = this._half, halfTmp = this._halfTmp;
            for (let hy = 0; hy < hh; hy++) {
                const y0 = hy * 2, y1 = y0 + 1 < size ? y0 + 1 : maxIdx;
                const r0 = y0 * size, r1 = y1 * size, hr = hy * hw;
                for (let hx = 0; hx < hw; hx++) {
                    const x0 = hx * 2, x1 = x0 + 1 < size ? x0 + 1 : maxIdx;
                    half[hr + hx] = (wa[r0 + x0] + wa[r0 + x1] + wa[r1 + x0] + wa[r1 + x1]) * 0.25;
                }
            }
            fastBlur(half, halfTmp, half, hw, hh, bloomSigma);

            // Upsample-add the bloom by nearest-neighbour block replication. The
            // half buffer is already heavily blurred (low-frequency), so block
            // replication is visually indistinguishable from bilinear here and
            // avoids the per-pixel interpolation cost. Also tracks the peak used
            // to normalise this species' contribution.
            let peak = 0;
            for (let y = 0; y < size; y++) {
                const hr = (y >> 1) * hw, row = y * size;
                for (let x = 0; x < size; x++) {
                    const i = row + x;
                    const v = wa[i] + BLOOM_STRENGTH * half[hr + (x >> 1)];
                    wa[i] = v;
                    if (v > peak) peak = v;
                }
            }
            if (peak < MIN_PEAK) continue;
            const scale = OVEREXPOSURE / peak;

            const [r, g, b] = speciesColors[s];
            for (let i = 0; i < sz2; i++) {
                const v = wa[i] * scale;
                const vc = v < 1.0 ? v : 1.0;
                cR[i] = 1 - (1 - cR[i]) * (1 - vc * r);
                cG[i] = 1 - (1 - cG[i]) * (1 - vc * g);
                cB[i] = 1 - (1 - cB[i]) * (1 - vc * b);
            }
        }

        // Final pass: exposure + gamma via LUT → RGBA
        const pixels = this._imageData.data;
        for (let i = 0; i < sz2; i++) {
            const rv = cR[i] * EXPOSURE, gv = cG[i] * EXPOSURE, bv = cB[i] * EXPOSURE;
            pixels[i * 4]     = _gammaLut[(rv < 1 ? rv : 1) * LUT_SIZE | 0];
            pixels[i * 4 + 1] = _gammaLut[(gv < 1 ? gv : 1) * LUT_SIZE | 0];
            pixels[i * 4 + 2] = _gammaLut[(bv < 1 ? bv : 1) * LUT_SIZE | 0];
            pixels[i * 4 + 3] = 255;
        }

        return this._imageData;
    }
}
