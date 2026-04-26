import * as cfg from '../config.js';
import { AgentPool }      from './AgentPool.js';
import { NutrientPool }   from './NutrientPool.js';
import { AntibioticPool } from './AntibioticPool.js';
import { SpatialGrid }    from '../utils/SpatialGrid.js';

const TAU = 2 * Math.PI;

// Correlated random walk: agents accumulate angular velocity (MOMENTUM)
// and wander randomly when no chemical gradient is present (WANDER).
// With free_step=4.4px and these constants, open-space paths curve with
// radius ~30-50px — visually organic without disrupting trail-following.
const WANDER   = 0.35;   // max random angle added per step (radians, ~±20°)
const MOMENTUM = 0.45;   // fraction of previous angVel retained each step

function buildParams(numSpecies, size = cfg.DEFAULT_SIZE) {
    const k  = size / cfg.DEFAULT_SIZE;
    const gp = JSON.parse(JSON.stringify(cfg.DEFAULT_GLOBAL_PARAMS));
    gp.sensor.distance              *= k;
    gp.nutrient.activation_range   *= k;
    gp.nutrient.consumption_radius *= k;
    gp.merge_distance               *= k;
    gp.dominance_radius             *= k;

    const species = [];
    for (let i = 0; i < numSpecies; i++) {
        const sp      = JSON.parse(JSON.stringify(cfg.DEFAULT_SPECIES_TEMPLATE));
        sp.color      = cfg.SPECIES_COLORS[i % cfg.SPECIES_COLORS.length];
        sp.inhibition = 0.5 + i * 0.05;
        sp.movement.free_step     *= k;
        sp.movement.attached_step *= k;
        species.push(sp);
    }
    return { global: gp, species };
}

export class Simulation {
    constructor(
        numAgents    = cfg.DEFAULT_NUM_AGENTS,
        numNutrients = cfg.DEFAULT_NUM_NUTRIENTS,
        numSpecies   = cfg.DEFAULT_NUM_SPECIES,
        size         = cfg.DEFAULT_SIZE,
    ) {
        this._initAgents    = numAgents;
        this._initNutrients = numNutrients;
        this._initSpecies   = numSpecies;
        this._initSize      = size;

        this._agents = new AgentPool();
        this._nuts   = new NutrientPool();
        this._abs    = new AntibioticPool();
        this._grid   = null;

        this._params = buildParams(numSpecies, size);
        this._resetState(numAgents, numNutrients, numSpecies, size);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    step() {
        const decay = this._params.global.pheromone_decay;
        for (let i = 0; i < this._trailMap.length; i++) this._trailMap[i] *= decay;
        this._updateAgents();
        this._applyAntibiotics();
        this._updateNutrients();
        this._abs.step();
    }

    getState() {
        const n  = this._agents.count;
        const sc = this._speciesCounts;
        sc.fill(0);
        for (let i = 0; i < n; i++) sc[this._agents.species[i]]++;

        let activeNutrientCount = 0, totalEnergy = 0;
        for (let k = 0; k < this._nuts.count; k++) {
            if (this._nuts.active[k]) { activeNutrientCount++; totalEnergy += this._nuts.energy[k]; }
        }

        const c = this._stateCache;
        c.agentCount          = n;
        c.activeNutrientCount = activeNutrientCount;
        c.totalEnergy         = totalEnergy;
        return c;
    }

    getRenderInfo() {
        return this._renderInfoCache;
    }

    addNutrient(x, y) { this._nuts.add(x, y, cfg.NUTRIENT_INIT_ENERGY); }

    addAntibiotic(x, y) {
        const scale = this._size / cfg.DEFAULT_SIZE;
        this._abs.add(x, y, cfg.ANTIBIOTIC_RADIUS * scale, cfg.ANTIBIOTIC_STRENGTH, cfg.ANTIBIOTIC_LIFETIME);
    }

    setParam(key, value) {
        const gp = this._params.global;
        const k  = this._size / cfg.DEFAULT_SIZE;
        switch (key) {
            case 'sensor_distance': gp.sensor.distance = value * k; break;
            case 'sensor_angle':    gp.sensor.angle    = value;     break;
            case 'free_step':
                for (const sp of this._params.species) sp.movement.free_step = value * k;
                this._rebuildSpeciesCache();
                break;
            case 'attached_step':
                for (const sp of this._params.species) sp.movement.attached_step = value * k;
                this._rebuildSpeciesCache();
                break;
            case 'pheromone_decay': gp.pheromone_decay = value; break;
        }
    }

    reset(numAgents, numNutrients, numSpecies, size) {
        const nA = numAgents    ?? this._initAgents;
        const nN = numNutrients ?? this._initNutrients;
        const nS = numSpecies   ?? this._initSpecies;
        const sz = size         ?? this._initSize;
        this._initAgents    = nA;
        this._initNutrients = nN;
        this._initSpecies   = nS;
        this._initSize      = sz;
        this._params = buildParams(nS, sz);
        this._resetState(nA, nN, nS, sz);
    }

    clear() {
        this._trailMap.fill(0);
        this._agents.count = 0;
        this._nuts.count   = 0;
        this._abs.count    = 0;
    }

    // ── Private: init ─────────────────────────────────────────────────────────

    _resetState(nAgents, nNuts, nSpecies, size) {
        this._size       = size;
        this._numSpecies = nSpecies;
        this._size2      = size * size;
        this._trailMap   = new Float32Array(nSpecies * size * size);

        this._agents.reset(nAgents, size, size, nSpecies);
        this._nuts.reset(nNuts, size, size, cfg.NUTRIENT_INIT_ENERGY);
        this._abs.count = 0;

        const domR  = this._params.global.dominance_radius;
        this._grid  = new SpatialGrid(size, size, Math.max(domR * 2, 16), cfg.MAX_AGENTS);

        const max = cfg.MAX_AGENTS;
        this._svBuf    = new Float32Array(max * 3);
        this._newX     = new Float32Array(max);
        this._newY     = new Float32Array(max);
        this._newAngle = new Float32Array(max);

        // Per-tick reusable buffers — allocated once, never during the loop
        this._speciesCounts = new Int32Array(nSpecies);
        this._maskBuf       = new Uint8Array(max);
        this._sameBuf       = new Int32Array(max);
        this._totalBuf      = new Int32Array(max);
        this._killProbBuf   = new Float32Array(max);
        this._aNutX         = new Float32Array(2000);  // NutrientPool.MAX_POOL
        this._aNutY         = new Float32Array(2000);
        this._offX          = new Float32Array(max);
        this._offY          = new Float32Array(max);
        this._offAng        = new Float32Array(max);
        this._offAtt        = new Int32Array(max);
        this._offSp         = new Int32Array(max);

        this._rebuildSpeciesCache();

        // Cached return objects — updated in place each tick, never reallocated
        this._stateCache = {
            trailMap:            this._trailMap,
            nutrients:           this._nuts,
            antibiotics:         this._abs,
            agentCount:          0,
            activeNutrientCount: 0,
            totalEnergy:         0,
            speciesCounts:       this._speciesCounts,
        };
        this._renderInfoCache = {
            size,
            numSpecies:        nSpecies,
            speciesColors:     this._speciesColors,
            antibioticLifetime: cfg.ANTIBIOTIC_LIFETIME,
            nutrientInitEnergy: cfg.NUTRIENT_INIT_ENERGY,
        };
    }

    _rebuildSpeciesCache() {
        const sp = this._params.species;
        this._spInhib       = sp.map(p => p.inhibition);
        this._spFreeDep     = new Float32Array(sp.map(p => p.pheromone.free_deposit));
        this._spAttDep      = new Float32Array(sp.map(p => p.pheromone.attached_deposit));
        this._spFreeS       = sp.map(p => p.movement.free_step);
        this._spAttS        = sp.map(p => p.movement.attached_step);
        this._speciesColors = sp.map(p => p.color);
        if (this._renderInfoCache) this._renderInfoCache.speciesColors = this._speciesColors;
    }

    // ── Private: sensor computation ───────────────────────────────────────────

    _computeSensorValues() {
        const pool   = this._agents;
        const n      = pool.count;
        const gp     = this._params.global;
        const sa     = gp.sensor.angle * 1.2;
        const sd     = gp.sensor.distance;
        const size   = this._size;
        const sz2    = this._size2;
        const tm     = this._trailMap;
        const ns     = this._numSpecies;
        const maxIdx = size - 1;
        const sv     = this._svBuf;

        // Collect active nutrient positions into pre-allocated typed arrays
        const aNutX = this._aNutX, aNutY = this._aNutY;
        let nActive = 0;
        for (let k = 0; k < this._nuts.count; k++) {
            if (this._nuts.active[k]) {
                aNutX[nActive] = this._nuts.x[k];
                aNutY[nActive] = this._nuts.y[k];
                nActive++;
            }
        }

        // Pre-compute cos/sin of sensor half-angle once per tick (sa is constant).
        // Per-agent we then need only 2 trig calls (cos+sin of heading) and derive
        // all 3 sensor directions via rotation matrix — down from 6 trig calls.
        const cosSa = Math.cos(sa), sinSa = Math.sin(sa);

        for (let i = 0; i < n; i++) {
            const px     = pool.x[i], py = pool.y[i];
            const sp     = pool.species[i];
            const inh    = this._spInhib[sp];
            const isFree = pool.attached[i] === -1;

            // 2 trig calls for this agent's heading
            const cA = Math.cos(pool.angle[i]), sA = Math.sin(pool.angle[i]);
            // Rotate ±sa via: cos(a±b) = cA·cosSa ∓ sA·sinSa
            const c0 = cA * cosSa + sA * sinSa, s0 = sA * cosSa - cA * sinSa; // ang − sa
            const c2 = cA * cosSa - sA * sinSa, s2 = sA * cosSa + cA * sinSa; // ang + sa

            for (let d = 0; d < 3; d++) {
                const cosA = d === 1 ? cA : d === 0 ? c0 : c2;
                const sinA = d === 1 ? sA : d === 0 ? s0 : s2;
                const sxF  = px + sd * cosA;
                const syF  = py + sd * sinA;
                const sx   = Math.min(Math.max(sxF | 0, 0), maxIdx);
                const sy   = Math.min(Math.max(syF | 0, 0), maxIdx);
                const base = sy * size + sx;

                let own = tm[sp * sz2 + base];
                let tot = 0;
                for (let s = 0; s < ns; s++) tot += tm[s * sz2 + base];

                let val = own - (tot - own) * inh;

                if (isFree && nActive > 0) {
                    let minD2 = Infinity;
                    for (let k = 0; k < nActive; k++) {
                        const dx = aNutX[k] - sxF, dy = aNutY[k] - syF;
                        const d2 = dx * dx + dy * dy;
                        if (d2 < minD2) minD2 = d2;
                    }
                    val += Math.max(50 - Math.sqrt(minD2), 0);
                }

                sv[i * 3 + d] = val;
            }
        }
    }

    // ── Private: per-tick agent update ────────────────────────────────────────

    _updateAgents() {
        const pool   = this._agents;
        let n        = pool.count;
        if (n === 0) return;

        const gp     = this._params.global;
        const size   = this._size;
        const sz2    = this._size2;
        const tm     = this._trailMap;
        const maxIdx = size - 1;

        let hasActive = false;
        for (let k = 0; k < this._nuts.count; k++) {
            if (this._nuts.active[k]) { hasActive = true; break; }
        }

        this._computeSensorValues();
        const sv = this._svBuf;

        const maxRot = hasActive ? gp.movement.max_rotate : gp.movement.inactive_rotate;
        const sz     = maxIdx;

        for (let i = 0; i < n; i++) {
            const L = sv[i * 3], F = sv[i * 3 + 1], R = sv[i * 3 + 2];
            let rotDir = 0;
            if      ((L - R) >  0.1 * F) rotDir =  1;
            else if ((R - L) >  0.1 * F) rotDir = -1;

            // Signal strength gates how much random wander is applied:
            // strong gradient → agent follows it precisely;
            // empty space (sigPeak≈0) → agent meanders freely.
            const sigPeak    = Math.max(L, F, R, 0);
            const wanderScale = 1 - (sigPeak / (sigPeak + 30)) * 0.85;
            const noise      = (Math.random() - 0.5) * 2 * WANDER * wanderScale;

            // Blend chemotactic target with wander noise via angular momentum.
            pool.angVel[i] = pool.angVel[i] * MOMENTUM + (rotDir * maxRot + noise) * (1 - MOMENTUM);
            let na = (pool.angle[i] + pool.angVel[i] + TAU * 2) % TAU;

            const svPos = Math.max(L, F, R, 0);
            const mult  = Math.min(Math.max(1 + svPos / (svPos + 200) * 1.5, 0.5), 2.5);
            const step  = pool.attached[i] !== -1
                ? this._spAttS[pool.species[i]]
                : this._spFreeS[pool.species[i]] * mult;

            let nx = pool.x[i] + step * Math.cos(na);
            let ny = pool.y[i] + step * Math.sin(na);

            if (nx > sz) { nx = 2 * sz - nx; na = Math.PI - na; }
            if (nx < 0)  { nx = -nx;          na = Math.PI - na; }
            if (ny > sz) { ny = 2 * sz - ny;  na = -na; }
            if (ny < 0)  { ny = -ny;           na = -na; }

            this._newX[i]     = Math.min(Math.max(nx, 0), sz);
            this._newY[i]     = Math.min(Math.max(ny, 0), sz);
            this._newAngle[i] = ((na % TAU) + TAU) % TAU;
        }

        // ── Nutrient contact (free agents only) ───────────────────────────────
        const actRange  = gp.nutrient.activation_range;
        const actRange2 = actRange * actRange;
        let newlyActivated = false;

        for (let i = 0; i < n; i++) {
            if (pool.attached[i] !== -1) continue;
            const px = this._newX[i], py = this._newY[i];
            let bestD2 = actRange2, bestK = -1;
            for (let k = 0; k < this._nuts.count; k++) {
                const dx = this._nuts.x[k] - px, dy = this._nuts.y[k] - py;
                const d2 = dx * dx + dy * dy;
                if (d2 < bestD2) { bestD2 = d2; bestK = k; }
            }
            if (bestK !== -1) {
                pool.attached[i] = this._nuts.id[bestK];
                if (!this._nuts.active[bestK]) {
                    this._nuts.active[bestK]   = 1;
                    this._nuts.lifetime[bestK] = 0;
                    newlyActivated = true;
                }
            }
        }
        void newlyActivated;

        // ── Pheromone deposit ──────────────────────────────────────────────────
        for (let i = 0; i < n; i++) {
            const cx  = Math.min(Math.max(this._newX[i] | 0, 0), maxIdx);
            const cy  = Math.min(Math.max(this._newY[i] | 0, 0), maxIdx);
            const dep = pool.attached[i] !== -1
                ? this._spAttDep[pool.species[i]]
                : this._spFreeDep[pool.species[i]];
            tm[pool.species[i] * sz2 + cy * size + cx] += dep;
        }

        // ── Reproduction (write into pre-allocated typed arrays) ──────────────
        const repProbAtt   = gp.reproduction.attached_prob;
        const repProbFree  = gp.reproduction.free_prob;
        const maxBranchAng = gp.reproduction.max_branch_angle;

        let offCount = 0;
        for (let i = 0; i < n; i++) {
            const isAtt = pool.attached[i] !== -1;
            if (Math.random() < (isAtt ? repProbAtt : repProbFree)) {
                const bAng = this._newAngle[i] + (Math.random() * 2 - 1) * maxBranchAng;
                this._offX[offCount]   = this._newX[i];
                this._offY[offCount]   = this._newY[i];
                this._offAng[offCount] = ((bAng % TAU) + TAU) % TAU;
                this._offAtt[offCount] = isAtt && Math.random() < 0.8 ? pool.attached[i] : -1;
                this._offSp[offCount]  = pool.species[i];
                offCount++;
            }
        }

        // ── Commit movement ────────────────────────────────────────────────────
        for (let i = 0; i < n; i++) {
            pool.x[i]     = this._newX[i];
            pool.y[i]     = this._newY[i];
            pool.angle[i] = this._newAngle[i];
        }

        // ── Append offspring ───────────────────────────────────────────────────
        for (let o = 0; o < offCount; o++) {
            if (pool.count >= pool.max) break;
            const i          = pool.count++;
            pool.x[i]        = this._offX[o];
            pool.y[i]        = this._offY[o];
            pool.angle[i]    = this._offAng[o];
            pool.angVel[i]   = 0;
            pool.attached[i] = this._offAtt[o];
            pool.species[i]  = this._offSp[o];
        }

        if (pool.count > cfg.MAX_AGENTS) pool.trimRandom(cfg.MAX_AGENTS);
        n = pool.count;

        // ── Grid rebuilt once here; reused by energy consumption + competition.
        //    merge rebuilds its own copy (pool.filter in competition changes layout).
        this._grid.rebuild(pool.x, pool.y, n);
        this._consumeEnergyWithGrid(gp.nutrient.consumption_radius);
        this._applyCompetition(/* skipRebuild= */ true);
        n = pool.count;

        this._applySurvival(hasActive);
        n = pool.count;

        if (n < cfg.MIN_AGENTS) {
            pool.injectFree(cfg.MIN_AGENTS - n, size, size, this._numSpecies);
            n = pool.count;
        }

        this._mergeAgents();
    }

    // ── Energy consumption via spatial grid ───────────────────────────────────
    // Replaces the O(N_nuts × N_agents) brute force in NutrientPool.consumeEnergy.

    _consumeEnergyWithGrid(r) {
        const nuts = this._nuts;
        const r2   = r * r;
        const ax   = this._agents.x;
        const ay   = this._agents.y;
        for (let k = 0; k < nuts.count; k++) {
            if (!nuts.active[k]) continue;
            const nx    = nuts.x[k], ny = nuts.y[k];
            const cands = this._grid.queryCandidates(nx, ny, r);
            let cnt = 0;
            for (let ci = 0; ci < cands.length; ci++) {
                const i = cands[ci];
                const dx = ax[i] - nx, dy = ay[i] - ny;
                if (dx * dx + dy * dy <= r2) cnt++;
            }
            nuts.energy[k] -= cnt;
        }
    }

    _applyCompetition(skipRebuild = false) {
        const pool = this._agents;
        const n    = pool.count;
        if (n < 2) return;

        const gp = this._params.global;
        if (!skipRebuild) this._grid.rebuild(pool.x, pool.y, n);
        const pairs = this._grid.queryPairs(pool.x, pool.y, n, gp.dominance_radius);
        if (pairs.length === 0) return;

        const same  = this._sameBuf;
        const total = this._totalBuf;
        same.fill(1, 0, n);
        total.fill(1, 0, n);

        for (let p = 0; p < pairs.length; p += 2) {
            const i = pairs[p], j = pairs[p + 1];
            total[i]++; total[j]++;
            if (pool.species[i] === pool.species[j]) { same[i]++; same[j]++; }
        }

        const thresh = gp.dominance_threshold;
        const mask   = this._maskBuf;
        for (let i = 0; i < n; i++) mask[i] = (same[i] / total[i]) >= thresh ? 1 : 0;
        pool.filter(mask);
    }

    _applySurvival(hasActive) {
        const pool  = this._agents;
        const n     = pool.count;
        const surv  = this._params.global.survival;
        const attS  = surv.attached_survival;
        const freeS = hasActive ? surv.free_survival : surv.inactive_survival;

        const mask = this._maskBuf;
        for (let i = 0; i < n; i++) {
            mask[i] = Math.random() < (pool.attached[i] !== -1 ? attS : freeS) ? 1 : 0;
        }
        pool.filter(mask);
    }

    _mergeAgents() {
        const pool = this._agents;
        const n    = pool.count;
        if (n < 2) return;

        const gp = this._params.global;
        this._grid.rebuild(pool.x, pool.y, n);
        const pairs = this._grid.queryPairs(pool.x, pool.y, n, gp.merge_distance);

        for (let p = 0; p < pairs.length; p += 2) {
            const i = pairs[p], j = pairs[p + 1];
            if (pool.species[i] !== pool.species[j]) continue;
            const ai = pool.attached[i], aj = pool.attached[j];
            if (ai === aj) continue;
            if      (ai === -1 && aj !== -1) pool.attached[i] = aj;
            else if (ai !== -1 && aj === -1) pool.attached[j] = ai;
            else if (ai !== -1 && aj !== -1) {
                if (Math.random() < 0.5) pool.attached[j] = ai;
                else                     pool.attached[i] = aj;
            }
        }
    }

    _applyAntibiotics() {
        const pool = this._agents;
        const n    = pool.count;
        const abs  = this._abs;
        if (abs.count === 0 || n === 0) return;

        const killProb = this._killProbBuf;
        killProb.fill(0, 0, n);

        for (let a = 0; a < abs.count; a++) {
            const ax = abs.x[a], ay = abs.y[a];
            const ar = abs.radius[a], as_ = abs.strength[a];
            for (let i = 0; i < n; i++) {
                const dx   = pool.x[i] - ax, dy = pool.y[i] - ay;
                const dist = Math.sqrt(dx * dx + dy * dy);
                killProb[i] = Math.min(killProb[i] + as_ * Math.max(1 - dist / ar, 0), 0.95);
            }
        }

        const mask = this._maskBuf;
        for (let i = 0; i < n; i++) mask[i] = Math.random() >= killProb[i] ? 1 : 0;
        pool.filter(mask);
    }

    _updateNutrients() {
        const gp   = this._params.global;
        const pool = this._agents;

        const expiredIds = this._nuts.step(gp.nutrient.max_lifetime);
        if (expiredIds.length > 0) {
            const expSet = new Set(expiredIds);
            for (let i = 0; i < pool.count; i++) {
                if (expSet.has(pool.attached[i])) pool.attached[i] = -1;
            }
        }

        if (this._nuts.count === 0) {
            this._nuts.respawn(this._initNutrients, this._size, this._size, cfg.NUTRIENT_INIT_ENERGY);
        }
    }
}
