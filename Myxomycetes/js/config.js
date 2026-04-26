// ── Colour palette ────────────────────────────────────────────────────────────
export const SPECIES_COLORS = [
    [1.00, 0.25, 0.25],   // red
    [0.20, 0.75, 1.00],   // cyan-blue
    [0.25, 1.00, 0.35],   // green
    [1.00, 0.55, 0.05],   // orange
    [0.75, 0.20, 1.00],   // purple
    [1.00, 1.00, 0.20],   // yellow
];

// ── Grid dimensions ───────────────────────────────────────────────────────────
export const DEFAULT_SIZE          = 500;
export const DEFAULT_NUM_AGENTS    = 1000;
export const DEFAULT_NUM_NUTRIENTS = 200;
export const DEFAULT_NUM_SPECIES   = 3;
export const MAX_SPECIES           = 6;
export const MAX_AGENTS            = 4000;
export const MIN_AGENTS            = 5;
export const NUTRIENT_INIT_ENERGY  = 1200;

// ── Antibiotic ────────────────────────────────────────────────────────────────
export const ANTIBIOTIC_STRENGTH = 0.08;
export const ANTIBIOTIC_RADIUS   = 60.0;
export const ANTIBIOTIC_LIFETIME = 600;

// ── Global simulation parameters ─────────────────────────────────────────────
export const DEFAULT_GLOBAL_PARAMS = {
    nutrient: {
        activation_range:   5.0,
        max_lifetime:       300,
        consumption_radius: 8,
    },
    sensor: {
        angle:    Math.PI / 3,
        distance: 11,
    },
    movement: {
        max_rotate:      Math.PI / 4,
        inactive_rotate: Math.PI / 8,
    },
    reproduction: {
        attached_prob:    0.06,
        free_prob:        0.005,
        max_branch_angle: Math.PI / 2.2,
    },
    survival: {
        attached_survival:  0.995,
        free_survival:      0.95,
        inactive_survival:  0.88,
    },
    pheromone_decay:     0.91,
    merge_distance:      2.0,
    dominance_radius:    8.0,
    dominance_threshold: 0.6,
};

// ── Per-species parameter template ────────────────────────────────────────────
export const DEFAULT_SPECIES_TEMPLATE = {
    pheromone: {
        attached_deposit: 800,
        free_deposit:      80,
    },
    movement: {
        free_step:     4.4,
        attached_step: 1.4,
    },
    inhibition: 0.55,
};

// ── Slider group definitions ──────────────────────────────────────────────────
export const SLIDER_GROUPS = [
    {
        name: 'SIMULATION',
        items: [
            { key: 'num_species', label: 'Species', hint: 'Number of competing species — resets simulation on change',
              min: 1, max: 6, default: DEFAULT_NUM_SPECIES, fmt: v => String(Math.round(v)), step: 1 },
        ],
    },
    {
        name: 'SENSORS',
        items: [
            { key: 'sensor_distance', label: 'Range', hint: 'Forward sensing distance for pheromone detection (px)',
              min: 1, max: 25, default: DEFAULT_GLOBAL_PARAMS.sensor.distance, fmt: v => v.toFixed(1), step: 0.5 },
            { key: 'sensor_angle', label: 'Angle', hint: 'Half-angle between left/right sensors and forward axis (rad)',
              min: 0.10, max: 1.57, default: DEFAULT_GLOBAL_PARAMS.sensor.angle, fmt: v => v.toFixed(2), step: 0.01 },
        ],
    },
    {
        name: 'MOVEMENT',
        items: [
            { key: 'free_step', label: 'Free Step', hint: 'Distance moved per tick when not attached to a nutrient',
              min: 0.1, max: 8.0, default: DEFAULT_SPECIES_TEMPLATE.movement.free_step, fmt: v => v.toFixed(1), step: 0.1 },
            { key: 'attached_step', label: 'Attached Step', hint: 'Distance moved per tick while attached to a nutrient',
              min: 0.1, max: 3.0, default: DEFAULT_SPECIES_TEMPLATE.movement.attached_step, fmt: v => v.toFixed(1), step: 0.1 },
        ],
    },
    {
        name: 'RENDER',
        items: [
            { key: 'pheromone_decay', label: 'Trail Decay', hint: 'Fraction of pheromone retained each tick — higher = longer trails',
              min: 0.80, max: 0.99, default: DEFAULT_GLOBAL_PARAMS.pheromone_decay, fmt: v => v.toFixed(3), step: 0.001 },
            { key: 'blur_sigma', label: 'Blur', hint: 'Gaussian blur radius for trail rendering — higher = softer glow',
              min: 0.3, max: 3.0, default: 0.8, fmt: v => v.toFixed(1), step: 0.1 },
        ],
    },
];
