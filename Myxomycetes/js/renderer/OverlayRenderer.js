export class OverlayRenderer {
    /**
     * Draw nutrients, antibiotics, and a subtle vignette onto ctx.
     * putImageData has already written the trail background before this is called.
     */
    render(ctx, state, renderInfo) {
        const { nutrients, antibiotics } = state;
        const { size, antibioticLifetime, nutrientInitEnergy } = renderInfo;

        // ── Antibiotics ────────────────────────────────────────────────────────
        for (let a = 0; a < antibiotics.count; a++) {
            const x    = antibiotics.x[a];
            const y    = antibiotics.y[a];
            const r    = antibiotics.radius[a];
            const fade = antibiotics.lifetime[a] / antibioticLifetime;

            // Outer ring
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0,255,160,${0.4 * fade})`;
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            // Inner fill
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0,200,120,${0.06 * fade})`;
            ctx.fill();

            // Centre dot
            ctx.beginPath();
            ctx.arc(x, y, 3 * fade, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0,255,160,${0.7 * fade})`;
            ctx.fill();
        }

        // ── Nutrients ──────────────────────────────────────────────────────────
        for (let k = 0; k < nutrients.count; k++) {
            const x      = nutrients.x[k];
            const y      = nutrients.y[k];
            const energy = nutrients.energy[k];

            if (nutrients.active[k]) {
                const eRatio = Math.max(energy / nutrientInitEnergy, 0);
                const coreR  = 1.5 + 2.0 * Math.pow(eRatio, 0.4);
                const haloR  = coreR * 4.0;

                // Halo — orange-yellow, fades as energy drops
                ctx.beginPath();
                ctx.arc(x, y, haloR, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,190,30,${0.09 * eRatio})`;
                ctx.fill();

                // Mid glow ring
                ctx.beginPath();
                ctx.arc(x, y, coreR * 1.8, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,215,60,${0.18 * eRatio})`;
                ctx.fill();

                // Bright core
                ctx.beginPath();
                ctx.arc(x, y, coreR, 0, Math.PI * 2);
                ctx.fillStyle = eRatio > 0.3 ? '#ffe46a' : '#cc9030';
                ctx.fill();

                // Specular highlight
                ctx.beginPath();
                ctx.arc(x - coreR * 0.35, y - coreR * 0.35, coreR * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${0.75 * eRatio})`;
                ctx.fill();
            } else {
                // Inactive: very dim, almost invisible until discovered
                ctx.beginPath();
                ctx.arc(x, y, 1.8, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(90,65,15,0.45)';
                ctx.fill();
            }
        }

        // ── Vignette ───────────────────────────────────────────────────────────
        // Cached: gradient geometry is constant between resets, so recreate only
        // when the canvas size changes rather than every frame.
        if (!this._vigGrad || this._vigSize !== size) {
            const cx  = size * 0.5;
            const rad = size * 0.70;
            const g   = ctx.createRadialGradient(cx, cx, rad * 0.5, cx, cx, size * 0.75);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(0,0,0,0.40)');
            this._vigGrad = g;
            this._vigSize = size;
        }
        ctx.fillStyle = this._vigGrad;
        ctx.fillRect(0, 0, size, size);
    }
}
