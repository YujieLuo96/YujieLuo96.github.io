# RAIDEN II — Modular Edition · Iteration Log

A 10-version polish pass across playability, content richness, control feel,
graphics, and scene design. Every version keeps the integration harness
(`node _test_harness.js`) green.

---

## v1.0 — Foundation: frame-rate independence & correctness
Goal: make the game feel identical at 30 / 60 / 120 fps and fix verified defects
surfaced by a 6-lens audit (65 findings, 7 confirmed bugs).

- **Player movement is now frame-rate independent.** Acceleration smoothing,
  wing-bank smoothing converted from linear `k*dt` to exponential
  `1 - (1-k)^dt`; relative-drag per-frame cap now scales with `dt`.
  Measured 30↔60 fps travel drift dropped to ~1.2% (was large).
- **Homing Missile / Lightning Gun retargeting** switched from `age % N < 1`
  (a continuous-float modulo that randomly skips its hit window) to explicit
  frame countdown timers — reliable lock-on at any frame rate.
- **Homing Missile banking** smoothing made exponential (frame-rate independent).
- **Boss death secondary explosions** moved off wall-clock `setTimeout` onto the
  frame-driven `ExplosionFX.update` queue — they now freeze correctly during
  pause / stage-clear and are deterministic.
- **Stage-clear popups** now decay on `rawDt` like the intermission timer, so a
  lingering time-slow at stage end no longer desyncs the banner from its text.

## v2.0 — Scoring depth & risk/reward (skill ceiling)
Goal: reward expert play and give long runs forward goals (the audit found the
combat had no skill-expression layer beyond survival).

- **Grazing.** Skimming an enemy bullet (within 32px of the ship core, outside
  the hitbox) now scores, sparks, pulses a ring around the ship, and fills a
  graze meter. Every 45 grazes awards a **bomb** (or 2 500 pts at max bombs).
  A live GRAZE count + charge bar sits bottom-left of the HUD.
- **Bullet-cancel → score.** Bombs and boss/mid-boss deaths convert every live
  enemy bullet into score sparks with a "BULLET CANCEL ×N" callout — a clearing
  breather that pays out, the way arcade shmups do it.
- **Combo tuned.** Decay window 120→165 frames, multiplier cap 5×→6×, and
  milestone callouts ("10/25/50/100… CHAIN!") with a chime.
- **Score-line rewards.** +1 bomb every 80 000 pts, +1 hull every 300 000 pts —
  late-game still has carrots.
- **Sub-target payoff.** Destroying a boss turret/cannon now scores 150 pts.
- New `playGraze` / `playMilestone` SFX.

## v3.0 — Scene depth & atmosphere
Goal: kill the "flat backdrop" feel the audit flagged across all four scenes.

- **`ForegroundParallaxLayer`** — a reusable near-field layer (drawn above the
  background, below the action) that streaks 2 bands of fast, semi-transparent
  debris/embers/wisps past the camera. Per-scene palettes (space/asteroid/solar/
  blackhole/nebula). Driven centrally by `BackgroundManager`, so all scenes —
  present and future — gain depth for free.
- **Transition stingers.** Stage scene-changes now flash a scene-tinted veil and
  fire a `playWarp` audio sweep, giving progression a beat instead of a silent
  cross-fade. `BackgroundManager.register()` added for future scenes.
- **SpaceScene** nebula alpha lowered (0.22→0.15) so clouds sit behind the stars.

## v4.0 — New enemies & formations
Goal: widen the behavior vocabulary (audit: only ~5 archetypes across 14 soldiers).

- **Siren** — hovers, then charges and flooses a *gap-ring* whose safe gap tracks
  your bearing (telegraphed by a reddening radar sweep). Forces constant motion.
- **Weaver** — a manta that undulates while firing 3-wide *sine-wave snake* aimed
  shots — a new "read the wave, find the seam" dodge.
- **Splitter** — fragments into **3 diving shards** (`Splitterling`) on death, so
  killing it creates a fresh threat; rewards positioning the kill.
- **4 new generic formations** usable by any enemy: `grid`, `arc`, `diagonal`,
  `hourglass` (in addition to line/V/pincer/sweep/swarm).
- All three wired into stages 3 & 4, the endless pool, drop tables, and the
  Codex (data cards + animated shot previews).

## v5.0 — New weapon (Shatter Beam) + special-weapon rebalance
Goal: add a missing weapon archetype and fix the "specials run dry too fast"
playability finding.

- **Shatter Beam (weapon 10 / `0`).** Fast sine-wave crystal bolts that, on enemy
  impact, **shatter into a 3-way forward spread** (deferred-spawned so the shards
  fly on to other targets). Excels against clustered formations. Fully wired:
  WeaponManager, item pickup, drop tables (Elite/Spectre/Devastator/Boss3/Boss7),
  WeaponRegistry+Codex card, HUD meta, debug panel.
- **Special-weapon ammo buffed** so they stay useful: Plasma 10→18, Homing 22→36,
  Lightning 22→32, Ice 140→180, Spread 180→220.

## v6.0 — New boss: THE ARCHITECT (arena shaper)
Goal: add the missing "field-control" boss archetype (audit: all bosses were
floating-turret variants).

- **Boss8 Architect** (HP 300). Drops descending **wall-arrays with a single,
  slowly-drifting safe gap** — you thread the seam while dodging aimed bursts.
  Three phases: CONSTRUCT → FORTIFY (double staggered walls + ring) → COLLAPSE
  (gap spits homing flares + spiral arms). Telegraphs the wall line and
  highlights the safe gap in green before each drop.
- Fully registered: EnemyManager, boss-type sets, power-trigger (Lv150), endless
  pool, drops (incl. shatter_w), HP-bar name, Codex card + shot preview.

## v7.0 — Campaign expansion: stages 5-7 + Crystalline Nebula
Goal: the game had bosses 5-8 that were unreachable in normal play; fix that and
add a new scene (audit: only 4 scenes, replay monotony).

- **3 new stages.** Stage 5 NEBULA DEPTHS (new scene), Stage 6 PLASMA FLUX
  (solar), Stage 7 SOVEREIGN'S GATE (black hole) — culminating in Leviathan,
  Neutron Cluster, and the Architect→Crimson Sovereign finale. The campaign is
  now 7 stages (was 4) and uses all five scenes; new enemies feature heavily.
- **Crystalline Nebula scene** — drifting self-rotating faceted crystals (cyan/
  violet/aqua) with glints, branching plasma fissures, twin-hue nebulae, ice
  motes. Registered + parallax preset + transition tint.
- **Boss-dedup bug fixed.** Mid-bosses are now recurring per-stage encounters;
  only the unique major bosses (boss1-8) dedup across a run — previously the
  global set silently swallowed every mid-boss wave after the first.

## v8.0 — Graphics & juice pass
Goal: more "bloom" and impact on canvas2d (audit: no additive blending, flat
explosions, weak bullet-cancel FX, weapon visuals plateau at Lv20).

- **Additive blending.** Particles (`'lighter'`) and explosion shock-rings now
  composite additively — overlapping glows brighten into real bloom on the dark
  field, then cleanly reset to `source-over`.
- **New `ring` particle shape** — an expanding bright ring, used for graze pulses
  and bullet-cancel pops so those events read instantly.
- **Weapon tiers T6 (Lv51+) / T7 (Lv76+)** — heavier muzzle bloom and translucent
  phantom side-wings on the main gun, so power past Lv20 keeps escalating.
- **Cinematic vignette** — a very subtle corner darken that frames the action and
  lifts HUD/bullet contrast at the edges.

## v9.0 — Difficulty system, options & audio variety
Goal: meet players where they are and add settings (audit: no difficulty, no
options, BGM monotony).

- **Difficulty: EASY / NORMAL / HARD**, chosen on the title screen with ◄ ►
  (persisted). Scales enemy HP, enemy-bullet speed, score multiplier, and
  starting lives/bombs (Easy 0.82×HP / 4 lives; Hard 1.28×HP, 1.18× bullets,
  1.45× score, 2 lives). HP scaling preserves boss phase ratios.
- **Screen-shake toggle** (`V`, persisted) for comfort/accessibility.
- **BGM variety** — a second stage track (`stage2`) alternates by stage so the
  loop doesn't wear thin.
- Title screen now surfaces the difficulty selector and the full control map.

## v10.0 — Endless scaling, balance & QA
Goal: give endless real teeth and lock in stability (audit: endless scaled spawn
rate only — no HP/bullet scaling).

- **Endless parametric scaling.** Beyond the static difficulty multiplier, endless
  now ramps enemy HP (+7%/tier, ≤2.2×) and enemy-bullet speed (+3%/tier, ≤1.5×)
  as the run grows, layered cleanly on top of the chosen difficulty.
- **Stability verified.** 5 000-frame invincible stress run with five bosses live
  at once: no exceptions; enemy-bullet count peaked ~230 and player-bullet ~400,
  both well bounded (off-screen culling + filtering hold).
- **Regression suite** (run via Node against the module graph): integration
  harness, frame-rate independence, graze/cancel, new enemies + death-split,
  Shatter split-on-impact, boss phase cycling, 7-stage/scene/dedup, difficulty
  scaling, and endless ramp — all green.

---

### Net result across v1–v10
- Content: 14→17 soldiers, 9→10 weapons, 8→9 bosses, 4→7 stages, 4→5 scenes,
  4→8 formations.
- Systems added: grazing, bullet-cancel scoring, combo milestones, score-line
  rewards, near-field parallax, transition stingers, difficulty modes, options,
  endless scaling, additive bloom.
- Correctness: 7 audit-confirmed bugs fixed + the boss-dedup progression bug;
  the whole game is now frame-rate independent.

---

# Visual Polish Series (scenes + graphics) · vg1–vg10

A second 10-version pass focused purely on **scene design** and **画面/visuals**,
driven by a 5-lens visual audit (55 findings). Verified by a scene-render smoke
test (all 5 scenes + PostFX + explosions, 300 frames each + transition stress)
plus the full functional regression suite — all green.

## vg1.0 — PostFX foundation (`fx/PostFX.js`)
A full-screen post layer drawn above the action, below the HUD: **per-scene color
grade** (soft-light tint that smoothly cross-fades by scene), a **dynamic vignette**
(idle / boss-pulse / low-health red throb), and **chromatic edge fringing**
(red/blue corner split that intensifies near bosses and the black hole). Toggle
with `C`. Consolidated the old static + danger vignettes here.

## vg2.0 — Explosion bloom + dynamic scene lighting
Explosions now cast an **additive light** onto the surroundings (medium/large/boss/
bomb/player-hit), so the whole scene and nearby ships flash-lit in warm light as
things blow up — real "lighting" feel on canvas2d, cleanly reset each frame.

## vg3.0 — SpaceScene overhaul
A **distant lensed spiral galaxy** (twin log-spiral arms + core bloom, additive,
slow rotation/drift) anchors the composition; meteors gained a **burning reentry
aura** (pulsing additive head) so they read as ablative entry, not drifting dots.

## vg4.0 — AsteroidScene belt structure
Asteroids now cluster into weighted **orbital lanes** (upper faster, lower slower)
with faint density bands, so it reads as a structured debris belt; a rare bright
**ice-comet** streaks across with an additive glow tail.

## vg5.0 — SolarScene polish
Doubled the **granulation flicker** so the surface roils, and added two rising
**stellar-wind plasma curtains** (additive, sine-swaying) for a "furnace ejecting
structured plasma" identity.

## vg6.0 — BlackholeScene polish
**Three-color photon-ring dispersion** (stronger red-out / new green mid-band /
stronger blue-in) for extreme-curvature drama, plus **episodic accretion flares**
(magnetic-reconnection mini-flares orbiting the disk) so it feels actively feeding.

## vg7.0 — Crystalline Nebula richness
Crystals gained **per-vertex refraction blooms** (additive, breathing), fissures now
**fork into fractal branches**, and a **resonance lattice** of faint lines links each
crystal to its nearest neighbor — a coherent mineral matrix, not scattered shapes.

## vg8.0 — Parallax depth + scene-aware motion
The near-field layer now moves **per scene**: space sways, solar embers rise, the
black hole **pulls foreground debris toward the well** (via `getBlackhole()`), and
the nebula drifts on curves — so the foreground belongs to its scene.

## vg9.0 — Bullet readability
Added a **dark contrast underlay** to the common enemy-bullet sprite so projectiles
stay legible against the now-busier/brighter scenes and bloom — the cardinal
shmup rule. (Player bullets already velocity-stretch via their cached length.)

## vg10.0 — Cinematic transitions + variety + QA
Stage scene-changes now fire a **hyperspace warp-streak burst** (radial accelerating
lines, additive, peaking mid-fade) on top of the tint flash + audio sting.
SpaceScene randomizes **meteor density per run** for replay variety. Full regression
+ scene-render smoke suite green.

### Net visual result
A reusable PostFX grade/vignette/aberration layer, explosion-driven scene lighting,
five scenes each with a stronger signature and ambient set-pieces, scene-aware
parallax, cinematic warp transitions, and guaranteed bullet readability — all on
plain canvas2d, with bounded particle budgets and the whole suite passing.
