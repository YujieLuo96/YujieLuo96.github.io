import * as cfg            from './config.js';
import { Simulation }      from './simulation/Simulation.js';
import { TrailRenderer }   from './renderer/TrailRenderer.js';
import { OverlayRenderer } from './renderer/OverlayRenderer.js';
import { Panel }           from './ui/Panel.js';
import { Stats }           from './ui/Stats.js';

const MAX_SIM_SIZE  = 900;
const MIN_SIM_SIZE  = 400;
const RESIZE_THRESH = 80;

export class App {
    constructor(rootEl) {
        this._root          = rootEl;
        this._running       = false;
        this._blurSigma     = 0.8;
        this._mode          = 'nutrient';
        this._lastFrameTime = 0;
        this._fps           = 0;

        this._buildDOM();
        this._initSim();
        this._bindEvents();
        this._bindResize();
    }

    // ── DOM ───────────────────────────────────────────────────────────────────

    _buildDOM() {
        this._root.className = 'app';

        this._canvasWrap = document.createElement('div');
        this._canvasWrap.className = 'canvas-wrap';

        // Canvas + corner-bracket frame
        const frame = document.createElement('div');
        frame.className = 'canvas-frame';

        this._canvas = document.createElement('canvas');
        this._canvas.className = 'sim-canvas';

        const cnrTr = document.createElement('span');
        cnrTr.className = 'cnr cnr-tr';
        const cnrBl = document.createElement('span');
        cnrBl.className = 'cnr cnr-bl';

        frame.appendChild(this._canvas);
        frame.appendChild(cnrTr);
        frame.appendChild(cnrBl);
        this._canvasWrap.appendChild(frame);

        this._sidebar = document.createElement('div');
        this._sidebar.className = 'sidebar';

        // ── Sidebar header ──────────────────────────────────────────────────
        const hdr = document.createElement('div');
        hdr.className = 'hdr';
        hdr.innerHTML = `
            <div class="hdr-title">PHYSARUM LAB</div>
            <div class="hdr-sub">MULTI-SPECIES SIMULATION ENGINE</div>
            <div class="hdr-status">
                <span class="hdr-dot"></span>
                <div class="hdr-meta">
                    <span class="hdr-state">INITIALIZED</span>
                    <span class="hdr-fps">— FPS</span>
                </div>
            </div>
        `;
        this._hdrDot   = hdr.querySelector('.hdr-dot');
        this._hdrState = hdr.querySelector('.hdr-state');
        this._hdrFps   = hdr.querySelector('.hdr-fps');
        this._sidebar.appendChild(hdr);

        // Stats panel sits directly under the header, above everything else
        this._statsSlot = document.createElement('div');
        this._sidebar.appendChild(this._statsSlot);

        // ── Sidebar body (buttons, panel) ───────────────────────────────────
        this._sidebarBody = document.createElement('div');
        this._sidebarBody.className = 'sidebar-body';

        const btnRow = document.createElement('div');
        btnRow.className = 'btn-row';

        this._btnRun   = this._btn('▶ RUN',      () => this._toggleRun());
        this._btnReset = this._btn('↺ RESET',   () => this._doReset());
        this._btnClear = this._btn('✕ CLEAR',   () => this._sim.clear());
        this._btnMode  = this._btn('🖱 NUTRIENT', () => this._toggleMode());

        this._btnRun.classList.add('btn--primary');

        btnRow.appendChild(this._btnRun);
        btnRow.appendChild(this._btnReset);
        btnRow.appendChild(this._btnClear);
        btnRow.appendChild(this._btnMode);
        this._sidebarBody.appendChild(btnRow);
        this._sidebar.appendChild(this._sidebarBody);

        this._root.appendChild(this._canvasWrap);
        this._root.appendChild(this._sidebar);
    }

    _btn(text, onClick) {
        const b = document.createElement('button');
        b.className   = 'btn';
        b.textContent = text;
        b.addEventListener('click', onClick);
        return b;
    }

    // ── Responsive size ───────────────────────────────────────────────────────

    _computeSimSize() {
        const w = this._canvasWrap.offsetWidth  || (window.innerWidth  - 290);
        const h = this._canvasWrap.offsetHeight || window.innerHeight;
        const available = Math.min(w, h);
        return Math.min(MAX_SIM_SIZE,
               Math.max(MIN_SIM_SIZE,
               Math.round(available / 100) * 100));
    }

    _countForSize(sz) {
        const k  = sz / cfg.DEFAULT_SIZE;
        const nA = Math.min(Math.round(cfg.DEFAULT_NUM_AGENTS    * k * k), cfg.MAX_AGENTS);
        const nN = Math.min(Math.round(cfg.DEFAULT_NUM_NUTRIENTS * k),     800);
        return { nA, nN };
    }

    // ── Simulation + renderers ────────────────────────────────────────────────

    _initSim() {
        const sz         = this._computeSimSize();
        const { nA, nN } = this._countForSize(sz);

        this._canvas.width = this._canvas.height = sz;

        this._sim     = new Simulation(nA, nN, cfg.DEFAULT_NUM_SPECIES, sz);
        this._trail   = new TrailRenderer(sz, cfg.DEFAULT_NUM_SPECIES);
        this._overlay = new OverlayRenderer();
        this._ctx     = this._canvas.getContext('2d');

        const info = this._sim.getRenderInfo();

        this._stats = new Stats(this._statsSlot, info.numSpecies, info.speciesColors);

        this._panel = new Panel(this._sidebarBody, cfg.SLIDER_GROUPS, (key, value) => {
            if (key === 'num_species') {
                const { nA: a, nN: n } = this._countForSize(info.size);
                this._sim.reset(a, n, Math.round(value), info.size);
                this._rebuildAfterReset();
            } else if (key === 'blur_sigma') {
                this._blurSigma = value;
            } else {
                this._sim.setParam(key, value);
            }
        });
    }

    _rebuildAfterReset() {
        const info = this._sim.getRenderInfo();
        this._trail = new TrailRenderer(info.size, info.numSpecies);
        this._canvas.width = this._canvas.height = info.size;
        this._stats.rebuild(info.numSpecies, info.speciesColors);
    }

    // ── Events ────────────────────────────────────────────────────────────────

    _bindEvents() {
        this._canvas.addEventListener('click', e => {
            const rect   = this._canvas.getBoundingClientRect();
            const scaleX = this._canvas.width  / rect.width;
            const scaleY = this._canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top)  * scaleY;
            if (this._mode === 'nutrient') this._sim.addNutrient(x, y);
            else                           this._sim.addAntibiotic(x, y);
        });

        document.addEventListener('keydown', e => {
            if (e.key === ' ') { e.preventDefault(); this._toggleRun(); }
            if (e.key === 'r' || e.key === 'R') this._doReset();
        });
    }

    _bindResize() {
        let timer = null;
        const obs = new ResizeObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const newSz = this._computeSimSize();
                const curSz = this._sim.getRenderInfo().size;
                if (Math.abs(newSz - curSz) >= RESIZE_THRESH) {
                    this._reinitForSize(newSz);
                }
            }, 350);
        });
        obs.observe(this._canvasWrap);
    }

    _reinitForSize(sz) {
        const { nA, nN }     = this._countForSize(sz);
        const { numSpecies } = this._sim.getRenderInfo();
        this._sim.reset(nA, nN, numSpecies, sz);
        this._rebuildAfterReset();
        this._render();
    }

    _toggleRun() {
        this._running = !this._running;
        this._btnRun.textContent = this._running ? '⏸ PAUSE' : '▶ RUN';
        this._hdrDot.classList.toggle('hdr-dot--run', this._running);
        this._hdrState.textContent = this._running ? 'RUNNING' : 'PAUSED';
        if (this._running) this._tick();
    }

    _doReset() {
        const info       = this._sim.getRenderInfo();
        const { nA, nN } = this._countForSize(info.size);
        this._sim.reset(nA, nN, info.numSpecies, info.size);
        this._rebuildAfterReset();
        this._render();
    }

    _toggleMode() {
        this._mode = this._mode === 'nutrient' ? 'antibiotic' : 'nutrient';
        this._btnMode.textContent = this._mode === 'nutrient' ? '🖱 NUTRIENT' : '🖱 ANTIBIOTIC';
    }

    // ── Animation loop ────────────────────────────────────────────────────────

    _tick() {
        if (!this._running) return;
        this._sim.step();
        this._render();
        requestAnimationFrame(() => this._tick());
    }

    _render() {
        // Exponential-moving-average FPS counter
        const now = performance.now();
        if (this._lastFrameTime > 0) {
            const dt = now - this._lastFrameTime;
            this._fps = this._fps > 0
                ? this._fps * 0.88 + (1000 / dt) * 0.12
                : 1000 / dt;
            this._hdrFps.textContent = `${this._fps.toFixed(1)} FPS`;
        }
        this._lastFrameTime = now;

        const state = this._sim.getState();
        const info  = this._sim.getRenderInfo();

        const k               = info.size / cfg.DEFAULT_SIZE;
        const scaledBlurSigma = Math.min(this._blurSigma * Math.sqrt(k), 2.0);

        const imgData = this._trail.render(state.trailMap, info.speciesColors, scaledBlurSigma);
        this._ctx.putImageData(imgData, 0, 0);
        this._overlay.render(this._ctx, state, info);
        this._stats.update(state);
    }

    // ── Entry point ───────────────────────────────────────────────────────────

    start() {
        this._running = true;
        this._btnRun.textContent = '⏸ PAUSE';
        this._hdrDot.classList.add('hdr-dot--run');
        this._hdrState.textContent = 'RUNNING';
        this._render();
        this._tick();
    }
}
