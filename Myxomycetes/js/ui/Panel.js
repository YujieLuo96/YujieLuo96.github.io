export class Panel {
    constructor(container, sliderGroups, onParamChange) {
        this._groups   = sliderGroups;
        this._onChange = onParamChange;
        this._el       = document.createElement('div');
        this._el.className = 'panel';
        container.appendChild(this._el);
        this._build();
    }

    _build() {
        for (const group of this._groups) {
            const groupEl = document.createElement('div');
            groupEl.className = 'panel-group';

            const title = document.createElement('div');
            title.className   = 'panel-group-title';
            title.textContent = group.name;
            groupEl.appendChild(title);

            // Wrapper for the slider rows (provides inset padding)
            const rows = document.createElement('div');
            rows.className = 'panel-rows';

            for (const item of group.items) {
                const row = document.createElement('div');
                row.className = 'panel-row';

                const label       = document.createElement('span');
                label.className   = 'panel-label';
                label.textContent = item.label;
                label.title       = item.hint;

                const valEl       = document.createElement('span');
                valEl.className   = 'panel-value';
                valEl.textContent = item.fmt(item.default);

                const input = document.createElement('input');
                input.type  = 'range';
                input.min   = item.min;
                input.max   = item.max;
                input.step  = item.step;
                input.value = item.default;

                // Keep --val in sync so the CSS filled-track gradient works
                const syncVal = () => {
                    const pct = (input.value - item.min) / (item.max - item.min) * 100;
                    input.style.setProperty('--val', `${pct}%`);
                };
                syncVal(); // initialise on build

                input.addEventListener('input', () => {
                    const v = parseFloat(input.value);
                    valEl.textContent = item.fmt(v);
                    syncVal();
                    this._onChange(item.key, v);
                });

                row.appendChild(label);
                row.appendChild(valEl);
                row.appendChild(input);
                rows.appendChild(row);
            }

            groupEl.appendChild(rows);
            this._el.appendChild(groupEl);
        }
    }
}
