import { gaussianBlur } from '../utils/GaussianBlur.js';

const MIN_PEAK = 1e-9;

const BLOOM_RATIO    = 3.5;
const BLOOM_STRENGTH = 0.55;
const OVEREXPOSURE   = 1.25;
const EXPOSURE       = 1.15;
const GAMMA          = 0.72;

// Gamma look-up table: avoids Math.pow per pixel in the final composite pass.
// 1024 steps gives < 0.13 intensity unit of quantization error (imperceptible).
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
        this._workA  = new Float32Array(sz2);
        this._workB  = new Float32Array(sz2);
        this._workC  = new Float32Array(sz2);
        this._compR  = new Float32Array(sz2);
        this._compG  = new Float32Array(sz2);
        this._compB  = new Float32Array(sz2);
        this._imageData = new ImageData(size, size);
    }

    render(trailMap, speciesColors, blurSigma) {
        const { size, numSpecies } = this;
        const sz2  = size * size;
        const wa   = this._workA;
        const wb   = this._workB;
        const wc   = this._workC;
        const cR   = this._compR, cG = this._compG, cB = this._compB;

        cR.fill(0); cG.fill(0); cB.fill(0);

        const bloomSigma = blurSigma * BLOOM_RATIO;

        for (let s = 0; s < numSpecies; s++) {
            const offset = s * sz2;

            let maxRaw = 0;
            for (let i = 0; i < sz2; i++) {
                if (trailMap[offset + i] > maxRaw) maxRaw = trailMap[offset + i];
            }
            if (maxRaw < 1e-6) continue;

            for (let i = 0; i < sz2; i++) {
                wa[i] = Math.log1p(Math.pow(trailMap[offset + i], 0.55));
            }

            gaussianBlur(wa, wb, wa, size, size, blurSigma);

            wc.set(wa);   // native memcpy — faster than element-wise loop
            gaussianBlur(wc, wb, wc, size, size, bloomSigma);

            let peak = 0;
            for (let i = 0; i < sz2; i++) {
                wa[i] += BLOOM_STRENGTH * wc[i];
                if (wa[i] > peak) peak = wa[i];
            }
            if (peak < MIN_PEAK) continue;
            const scale = OVEREXPOSURE / peak;

            const [r, g, b] = speciesColors[s];
            for (let i = 0; i < sz2; i++) {
                const v = Math.min(wa[i] * scale, 1.0);
                cR[i] = 1 - (1 - cR[i]) * (1 - v * r);
                cG[i] = 1 - (1 - cG[i]) * (1 - v * g);
                cB[i] = 1 - (1 - cB[i]) * (1 - v * b);
            }
        }

        // Final pass: exposure + gamma via LUT → RGBA
        const pixels = this._imageData.data;
        for (let i = 0; i < sz2; i++) {
            const rv = Math.min(cR[i] * EXPOSURE, 1.0);
            const gv = Math.min(cG[i] * EXPOSURE, 1.0);
            const bv = Math.min(cB[i] * EXPOSURE, 1.0);
            pixels[i * 4]     = _gammaLut[rv * LUT_SIZE | 0];
            pixels[i * 4 + 1] = _gammaLut[gv * LUT_SIZE | 0];
            pixels[i * 4 + 2] = _gammaLut[bv * LUT_SIZE | 0];
            pixels[i * 4 + 3] = 255;
        }

        return this._imageData;
    }
}
