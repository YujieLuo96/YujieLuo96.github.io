import * as cfg from '../config.js';

/**
 * Manages parallel typed arrays describing all agents.
 * Pre-allocated to MAX_AGENTS; `count` marks the live range.
 *
 * angVel (angular velocity) persists across ticks to give agents
 * correlated-random-walk momentum — smooth curves rather than
 * straight lines + occasional snaps.
 */
export class AgentPool {
    constructor(maxAgents = cfg.MAX_AGENTS) {
        this.max      = maxAgents;
        this.count    = 0;
        this.x        = new Float32Array(maxAgents);
        this.y        = new Float32Array(maxAgents);
        this.angle    = new Float32Array(maxAgents);
        this.angVel   = new Float32Array(maxAgents);
        this.attached = new Int32Array(maxAgents);
        this.species  = new Int32Array(maxAgents);
    }

    reset(count, width, height, numSpecies) {
        this.count = count;
        for (let i = 0; i < count; i++) {
            this.x[i]        = Math.random() * width;
            this.y[i]        = Math.random() * height;
            this.angle[i]    = Math.random() * 2 * Math.PI;
            this.angVel[i]   = 0;
            this.attached[i] = -1;
            this.species[i]  = Math.floor(Math.random() * numSpecies);
        }
    }

    filter(mask) {
        let j = 0;
        for (let i = 0; i < this.count; i++) {
            if (mask[i]) {
                this.x[j]        = this.x[i];
                this.y[j]        = this.y[i];
                this.angle[j]    = this.angle[i];
                this.angVel[j]   = this.angVel[i];
                this.attached[j] = this.attached[i];
                this.species[j]  = this.species[i];
                j++;
            }
        }
        this.count = j;
    }

    trimRandom(targetCount) {
        for (let i = 0; i < targetCount; i++) {
            const j = i + Math.floor(Math.random() * (this.count - i));
            if (i !== j) this._swap(i, j);
        }
        this.count = targetCount;
    }

    _swap(i, j) {
        let t;
        t = this.x[i];        this.x[i]        = this.x[j];        this.x[j]        = t;
        t = this.y[i];        this.y[i]        = this.y[j];        this.y[j]        = t;
        t = this.angle[i];    this.angle[i]    = this.angle[j];    this.angle[j]    = t;
        t = this.angVel[i];   this.angVel[i]   = this.angVel[j];   this.angVel[j]   = t;
        t = this.attached[i]; this.attached[i] = this.attached[j]; this.attached[j] = t;
        t = this.species[i];  this.species[i]  = this.species[j];  this.species[j]  = t;
    }

    injectFree(n, width, height, numSpecies) {
        const toAdd = Math.min(n, this.max - this.count);
        for (let k = 0; k < toAdd; k++) {
            const i          = this.count++;
            this.x[i]        = Math.random() * width;
            this.y[i]        = Math.random() * height;
            this.angle[i]    = Math.random() * 2 * Math.PI;
            this.angVel[i]   = 0;
            this.attached[i] = -1;
            this.species[i]  = Math.floor(Math.random() * numSpecies);
        }
    }
}
