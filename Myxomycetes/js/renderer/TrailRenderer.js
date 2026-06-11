import { fastBlur } from '../utils/FastBlur.js';

const MIN_PEAK = 1e-9;

const BLOOM_RATIO    = 3.5;
const BLOOM_STRENGTH = 0.66;   // wider, brighter halo around the veins
const OVEREXPOSURE   = 1.30;
const EXPOSURE       = 1.16;
const GAMMA          = 0.70;
const HOTCORE        = 0.92;   // how strongly bright vein cores bleed to white-hot

// Shuttle streaming: real plasmodium pulses with rhythmic protoplasmic flow.
// A gentle brightness modulation whose phase depends on local intensity makes
// waves appear to propagate outward along veins from the bright cores, giving
// the network a living, breathing pulse rather than a static glow.
const PULSE_AMP   = 0.10;   // ±10% brightness
const PULSE_FREQ  = 7.0;    // spatial frequency over the normalised intensity
const PULSE_SPEED = 2.2;    // radians/second — sets the streaming rhythm

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
        this._workB  = new Float32Array(sz2);   // blur scratch
        this._workC  = new Float32Array(sz2);   // bloom buffer (full-res, wide blur)
        this._compR  = new Float32Array(sz2);
        this._compG  = new Float32Array(sz2);
        this._compB  = new Float32Array(sz2);
        this._imageData = new ImageData(size, size);
    }

    render(trailMap, speciesColors, blurSigma, time = 0) {
        const { size, numSpecies } = this;
        const sz2 = size * size;
        const wa  = this._workA;
        const wb  = this._workB;
        const wc  = this._workC;
        const cR  = this._compR, cG = this._compG, cB = this._compB;

        cR.fill(0); cG.fill(0); cB.fill(0);

        const bloomSigma = blurSigma * BLOOM_RATIO;

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

            // Crisp main blur (single box pass keeps the fine veins sharp).
            fastBlur(wa, wb, wa, size, size, blurSigma, 1);

            // Rich full-resolution bloom: a wide, smooth glow around bright veins.
            // fastBlur is constant-time in radius, so a full-res wide blur is cheap.
            wc.set(wa);
            fastBlur(wc, wb, wc, size, size, bloomSigma, 3);

            let peak = 0;
            for (let i = 0; i < sz2; i++) {
                const v = wa[i] + BLOOM_STRENGTH * wc[i];
                wa[i] = v;
                if (v > peak) peak = v;
            }
            if (peak < MIN_PEAK) continue;
            const scale = OVEREXPOSURE / peak;

            const [r, g, b] = speciesColors[s];
            for (let i = 0; i < sz2; i++) {
                const v  = wa[i] * scale;
                const vc = v < 1.0 ? v : 1.0;
                // White-hot core: bright vein centres (vc→1) bleed toward white,
                // leaving the saturated species colour in the surrounding glow —
                // the luminous, energetic look of a bioluminescent network.
                const w  = vc * vc * vc * HOTCORE;
                let sr = vc * r + w * (1 - r); if (sr > 1) sr = 1;
                let sg = vc * g + w * (1 - g); if (sg > 1) sg = 1;
                let sb = vc * b + w * (1 - b); if (sb > 1) sb = 1;
                cR[i] = 1 - (1 - cR[i]) * (1 - sr);
                cG[i] = 1 - (1 - cG[i]) * (1 - sg);
                cB[i] = 1 - (1 - cB[i]) * (1 - sb);
            }
        }

        // Final pass: shuttle-streaming pulse + exposure + gamma via LUT → RGBA.
        const pixels = this._imageData.data;
        const phase  = time * PULSE_SPEED;
        for (let i = 0; i < sz2; i++) {
            const r0 = cR[i], g0 = cG[i], b0 = cB[i];
            const lum = r0 * 0.30 + g0 * 0.59 + b0 * 0.11;
            // Pulse phase rises with local luminance, so the wave sweeps outward
            // along the intensity gradient as `phase` advances. The black background
            // (lum≈0) has a ≈1 pulse factor regardless, so skip its sin entirely.
            let puls = EXPOSURE;
            if (lum > 0.004) puls = (1 + PULSE_AMP * lum * Math.sin(lum * PULSE_FREQ - phase)) * EXPOSURE;
            const rv = r0 * puls, gv = g0 * puls, bv = b0 * puls;
            pixels[i * 4]     = _gammaLut[(rv < 1 ? rv < 0 ? 0 : rv : 1) * LUT_SIZE | 0];
            pixels[i * 4 + 1] = _gammaLut[(gv < 1 ? gv < 0 ? 0 : gv : 1) * LUT_SIZE | 0];
            pixels[i * 4 + 2] = _gammaLut[(bv < 1 ? bv < 0 ? 0 : bv : 1) * LUT_SIZE | 0];
            pixels[i * 4 + 3] = 255;
        }

        return this._imageData;
    }
}
