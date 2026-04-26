function toHex(color) {
    const [r, g, b] = color;
    return '#' + [r, g, b].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

export class Stats {
    constructor(container, numSpecies, speciesColors) {
        this._el = document.createElement('div');
        this._el.className = 'stats';
        container.appendChild(this._el);
        this._build(numSpecies, speciesColors);
    }

    _build(numSpecies, speciesColors) {
        this._el.innerHTML = '';

        // Header
        const hdr = document.createElement('div');
        hdr.className = 'stats-header';
        hdr.innerHTML = '<span class="stats-header-icon">◈</span>TELEMETRY';
        this._el.appendChild(hdr);

        // Body
        const body = document.createElement('div');
        body.className = 'stats-body';
        this._el.appendChild(body);

        // General counters with distinct color coding
        this._agentEl  = this._makeRow(body, 'AGENTS',         'stats-value');
        this._nutEl    = this._makeRow(body, 'ACTIVE NUTRIENTS', 'stats-value--cyan');
        this._energyEl = this._makeRow(body, 'TOTAL ENERGY',   'stats-value--amber');

        // Separator
        const sep = document.createElement('div');
        sep.className = 'stats-sep';
        body.appendChild(sep);

        // Species distribution label
        const spLbl = document.createElement('div');
        spLbl.className = 'stats-sp-label';
        spLbl.textContent = 'SPECIES DISTRIBUTION';
        body.appendChild(spLbl);

        // Per-species population bars
        this._spRows = [];
        for (let i = 0; i < numSpecies; i++) {
            const hex = toHex(speciesColors[i]);

            const row = document.createElement('div');
            row.className = 'stats-sp-row';

            const dot = document.createElement('span');
            dot.className   = 'stats-sp-dot';
            dot.textContent = '●';
            dot.style.color = hex;

            const name = document.createElement('span');
            name.className   = 'stats-sp-name';
            name.textContent = `SP-${String(i + 1).padStart(2, '0')}`;

            const pct = document.createElement('span');
            pct.className   = 'stats-sp-pct';
            pct.textContent = '—';
            pct.style.color = hex;

            const barBg = document.createElement('div');
            barBg.className = 'stats-sp-bar-bg';
            const fill = document.createElement('div');
            fill.className       = 'stats-sp-bar-fill';
            fill.style.background = hex;
            fill.style.boxShadow  = `0 0 6px ${hex}88`;
            fill.style.width      = '0%';
            barBg.appendChild(fill);

            row.appendChild(dot);
            row.appendChild(name);
            row.appendChild(pct);
            row.appendChild(barBg);
            body.appendChild(row);
            this._spRows.push({ pct, fill });
        }
    }

    _makeRow(container, label, valueClass = 'stats-value') {
        const row = document.createElement('div');
        row.className = 'stats-row';

        const lbl = document.createElement('span');
        lbl.className   = 'stats-label';
        lbl.textContent = label;

        const val = document.createElement('span');
        val.className   = `stats-value ${valueClass}`;
        val.textContent = '—';

        row.appendChild(lbl);
        row.appendChild(val);
        container.appendChild(row);
        return val;
    }

    update(state) {
        this._agentEl.textContent  = state.agentCount;
        this._nutEl.textContent    = state.activeNutrientCount;
        this._energyEl.textContent = state.totalEnergy;

        const total  = state.agentCount;
        const counts = state.speciesCounts;
        for (let i = 0; i < this._spRows.length; i++) {
            const { pct, fill } = this._spRows[i];
            const p = (total > 0 && counts) ? (counts[i] ?? 0) / total * 100 : 0;
            pct.textContent  = `${p.toFixed(1)}%`;
            fill.style.width = `${p}%`;
        }
    }

    rebuild(numSpecies, speciesColors) {
        this._build(numSpecies, speciesColors);
    }
}
