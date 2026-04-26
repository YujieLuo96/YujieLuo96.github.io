const MAX_POOL = 2000;

/**
 * Data container for all nutrients. Does not import config — the caller
 * (Simulation) supplies initial energy and other policy values so that
 * NutrientPool remains a pure data structure with no external dependencies.
 */
export class NutrientPool {
    constructor() {
        this.max      = MAX_POOL;
        this.count    = 0;
        this.nextId   = 0;
        this.x        = new Float32Array(MAX_POOL);
        this.y        = new Float32Array(MAX_POOL);
        this.lifetime = new Int32Array(MAX_POOL);
        this.energy   = new Int32Array(MAX_POOL);
        this.id       = new Int32Array(MAX_POOL);
        this.active   = new Uint8Array(MAX_POOL);
    }

    reset(count, width, height, initEnergy) {
        this.count  = count;
        this.nextId = count;
        for (let i = 0; i < count; i++) {
            this.x[i]        = Math.random() * width;
            this.y[i]        = Math.random() * height;
            this.lifetime[i] = 0;
            this.energy[i]   = initEnergy;
            this.id[i]       = i;
            this.active[i]   = 0;
        }
    }

    add(x, y, initEnergy) {
        if (this.count >= this.max) return;
        const i          = this.count++;
        this.x[i]        = x;
        this.y[i]        = y;
        this.lifetime[i] = 0;
        this.energy[i]   = initEnergy;
        this.id[i]       = this.nextId++;
        this.active[i]   = 1;
    }

    step(maxLifetime) {
        for (let i = 0; i < this.count; i++) {
            if (this.active[i]) this.lifetime[i]++;
        }

        const expiredIds = [];
        let j = 0;
        for (let i = 0; i < this.count; i++) {
            const expired = this.active[i] &&
                (this.lifetime[i] > maxLifetime || this.energy[i] <= 0);
            if (expired) {
                expiredIds.push(this.id[i]);
            } else {
                if (i !== j) {
                    this.x[j]        = this.x[i];
                    this.y[j]        = this.y[i];
                    this.lifetime[j] = this.lifetime[i];
                    this.energy[j]   = this.energy[i];
                    this.id[j]       = this.id[i];
                    this.active[j]   = this.active[i];
                }
                j++;
            }
        }
        this.count = j;
        return expiredIds;
    }

    respawn(count, width, height, initEnergy) {
        const n    = Math.min(count, this.max);
        this.count = n;
        for (let i = 0; i < n; i++) {
            this.x[i]        = Math.random() * width;
            this.y[i]        = Math.random() * height;
            this.lifetime[i] = 0;
            this.energy[i]   = initEnergy;
            this.id[i]       = this.nextId++;
            this.active[i]   = 0;
        }
    }
}
