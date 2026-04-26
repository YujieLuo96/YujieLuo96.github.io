const MAX_POOL = 200;

export class AntibioticPool {
    constructor() {
        this.max      = MAX_POOL;
        this.count    = 0;
        this.x        = new Float32Array(MAX_POOL);
        this.y        = new Float32Array(MAX_POOL);
        this.radius   = new Float32Array(MAX_POOL);
        this.strength = new Float32Array(MAX_POOL);
        this.lifetime = new Int32Array(MAX_POOL);
    }

    add(x, y, radius, strength, lifetime) {
        if (this.count >= this.max) return;
        const i           = this.count++;
        this.x[i]         = x;
        this.y[i]         = y;
        this.radius[i]    = radius;
        this.strength[i]  = strength;
        this.lifetime[i]  = lifetime;
    }

    /** Decrement lifetimes and compact expired entries. */
    step() {
        let j = 0;
        for (let i = 0; i < this.count; i++) {
            this.lifetime[i]--;
            if (this.lifetime[i] > 0) {
                if (i !== j) {
                    this.x[j]        = this.x[i];
                    this.y[j]        = this.y[i];
                    this.radius[j]   = this.radius[i];
                    this.strength[j] = this.strength[i];
                    this.lifetime[j] = this.lifetime[i];
                }
                j++;
            }
        }
        this.count = j;
    }
}
