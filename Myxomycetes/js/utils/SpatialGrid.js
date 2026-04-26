/**
 * Uniform-grid spatial hash using a CSR (Compressed Sparse Row) layout.
 *
 * All storage is in typed arrays — no JS array allocations during rebuild or
 * query. The CSR layout keeps agent indices for each cell contiguous in memory,
 * which is cache-friendly during the nested-cell iteration in queryPairs.
 *
 * Rebuild is three passes over the agent list:
 *   1. Count agents per cell   → _counts
 *   2. Exclusive prefix-sum    → _offsets (cell start positions in _data)
 *   3. Scatter agent indices   → _data
 */
export class SpatialGrid {
    /**
     * @param {number} maxPoints  Upper bound on agents (= cfg.MAX_AGENTS).
     *                            Sizes the flat _data array.
     */
    constructor(width, height, cellSize, maxPoints = 10000) {
        this.cellSize = cellSize;
        this.cols     = Math.ceil(width  / cellSize) + 1;
        this.rows     = Math.ceil(height / cellSize) + 1;
        const nCells  = this.cols * this.rows;
        this._counts  = new Int32Array(nCells);
        this._offsets = new Int32Array(nCells + 1);
        this._data    = new Int32Array(maxPoints);
        this._pairsArr      = [];
        this._candidatesArr = [];
    }

    rebuild(xs, ys, count) {
        const counts  = this._counts;
        const offsets = this._offsets;
        const cs      = this.cellSize;
        const cols    = this.cols;
        const rows    = this.rows;
        const nCells  = cols * rows;

        // Pass 1: per-cell agent counts
        counts.fill(0);
        for (let i = 0; i < count; i++) {
            const cx = Math.floor(xs[i] / cs);
            const cy = Math.floor(ys[i] / cs);
            if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
                counts[cy * cols + cx]++;
            }
        }

        // Pass 2: exclusive prefix sum → cell start offsets
        offsets[0] = 0;
        for (let c = 0; c < nCells; c++) offsets[c + 1] = offsets[c] + counts[c];

        // Pass 3: scatter indices into data (reuse counts as write cursors)
        counts.fill(0);
        for (let i = 0; i < count; i++) {
            const cx = Math.floor(xs[i] / cs);
            const cy = Math.floor(ys[i] / cs);
            if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
                const ci = cy * cols + cx;
                this._data[offsets[ci] + counts[ci]++] = i;
            }
        }
    }

    queryPairs(xs, ys, count, r) {
        const result  = this._pairsArr;
        result.length = 0;
        const r2      = r * r;
        const cs      = this.cellSize;
        const cols    = this.cols, rows = this.rows;
        const offsets = this._offsets;
        const data    = this._data;

        for (let i = 0; i < count; i++) {
            const xi    = xs[i], yi = ys[i];
            const minCx = Math.max(0, Math.floor((xi - r) / cs));
            const maxCx = Math.min(cols - 1, Math.floor((xi + r) / cs));
            const minCy = Math.max(0, Math.floor((yi - r) / cs));
            const maxCy = Math.min(rows - 1, Math.floor((yi + r) / cs));

            for (let cy = minCy; cy <= maxCy; cy++) {
                for (let cx = minCx; cx <= maxCx; cx++) {
                    const ci    = cy * cols + cx;
                    const start = offsets[ci];
                    const end   = offsets[ci + 1];
                    for (let k = start; k < end; k++) {
                        const j = data[k];
                        if (j <= i) continue;
                        const dx = xs[j] - xi, dy = ys[j] - yi;
                        if (dx * dx + dy * dy <= r2) result.push(i, j);
                    }
                }
            }
        }
        return result;
    }

    queryCandidates(x, y, r) {
        const result  = this._candidatesArr;
        result.length = 0;
        const cs      = this.cellSize;
        const cols    = this.cols, rows = this.rows;
        const offsets = this._offsets;
        const data    = this._data;
        const minCx   = Math.max(0, Math.floor((x - r) / cs));
        const maxCx   = Math.min(cols - 1, Math.floor((x + r) / cs));
        const minCy   = Math.max(0, Math.floor((y - r) / cs));
        const maxCy   = Math.min(rows - 1, Math.floor((y + r) / cs));
        for (let cy = minCy; cy <= maxCy; cy++) {
            for (let cx = minCx; cx <= maxCx; cx++) {
                const ci    = cy * cols + cx;
                const start = offsets[ci];
                const end   = offsets[ci + 1];
                for (let k = start; k < end; k++) result.push(data[k]);
            }
        }
        return result;
    }
}
