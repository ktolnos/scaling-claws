Initial request:
```md
Let's brainstorm the visuals for this game.

I want to 
1. show the scale of things
2. give the player something interesting to look at
while the game should stay mostly realistic economy-wise

For 1. we will probably need to use canvas or some JS graphics library with GPU acceleration to display a lot of animated gpus, buildings, people, satellites, rockets, etc.
2. is harder: pure repeating patterns (like sattelites in orbit) are not that interesting, we need to come up with something interacting or at least have two loops with different timescales to make repetition less obvious.

Some ideas of what to show:
- For the first stage show a laptop (close), the screen occupies most of the panel, on the screen we can show simulated output of all AI jobs (tmux-style terminal with windows for each job, text appearing and progress bars, different styles for different jobs. Progress bar progress can be taken from the sampled job progress)
mic-mini PCs apperar next to the laptop, after Go Self-hosted behind the laptop GPU rack appears. Each rack holds 80 GPUs (4U rack with 10 slots, 8 GPU each), they appear and are populated with GPUs as player buys more. Racks are displayed in a way to cover the window width, then behind each other with scale to form a fake perspective going to infinity. We can replace images with lower-resolution (and no detailed slots) for the further rows. Or maybe it would be easier to use 3d if it is needed anyway. If both displaying text and graphics using the same library is undesirable, we can make laptop a separate thing and racks separate thing.
- After the first datacenter we add a second visual panel (above the first one) that shows earth surface with forest and mountains in the background. The datacenters, powerplants, and other buildings also occupy the window width, then scale to infinity. Maybe we can add some moving fans to datacenters and smoke/steam particles to the powerplants. We might want to leave some space in front (so not build too densly at first) to fit some powerplants and rockets in the first rows later on (rockets launching should be the most interesting to look at). Maybe we can also add people walking around to show the number of workers hired, but I am afraid for performance.
- After first launch we add a view of the earth from space. Maybe it is slowly covered in industrial buildings (painted grey/solar pane blue over green, with rocket flares launching) as player builds more, although I it seems that current values shouldn;t be visible from space. and shows satellites following different orbits (SSO actually forms a rather pretty pattern)
- After first launch to the moon, we add a moon surface, similar to the Earth one. Here the stars of the show would be mass drivers, so some space needs to be left to fit them relatively close to the camera. 
- Same for Mercury, although there I would like to somehow show progress in mining it out and I also want to show the dyson swarm, so maybe the camera is pretty far away or it gets further with progress
- I am not sure how to show the rockets travelling between locations. We could just show launches and arrivals (I want to see rockets landing on the moon surface). It would be cool to see them travelling too, but it would involve showing Earth, Moon, and Mercury on the same panel, which is not really doable with realistic scales and distances.

The target is to run easily on a laptop with integrated graphics wothout quality levels. Keep in mind that certain things can be extremely numerous (e.g. GPU satellites should be able to capture ~20TW of solar). We can scale up to millions, so we need some smart strategy in how to show them. We could change them to be bigger if needed. Figure out how much of each thing we can render both screen-space wise and CPU-wise.

Please think of a plan for how to both make these ideas more visually interesting / less repeatable and how to implement something like that without big hardware requirements: which library/api to use, which corners to cut, feel free suggest not showing some things if they are too hard. I am fine with using libraries if needed. I can make some 3d objects or simple 2d sprites, but I would like to keep the number of assets reasonable. Don't worry about matching the existing implementation of the visuals or style, it is draft and doesn't look too pretty.

Write the plan below.
```
The plan after multiple iterations of edits:

# Visual Plan

## 1) Core Approach

Build visuals as a hybrid:
- **Hero layer (small count, close camera):** DOM/SVG (good readability, easy styling).
- **Mass layer (large count, far camera):** single `<canvas>` with Canvas2D batching and sprite atlases.

Why this choice:
- Keeps implementation cost lower than custom WebGL engine.
- Runs well on integrated GPUs if we cap visible actors and use level-of-detail (LOD).
- Fits project constraints (no heavy runtime dependencies needed).

If later needed, keep an upgrade path to WebGL2 instancing for only the mass layer.

## 2) Runtime/Rendering Architecture

Add a dedicated visual animation loop:
- `requestAnimationFrame` at display rate.
- Sim step at fixed 30 Hz internally (accumulator), render every frame.
- Game state sampling remains read-only from `GameState`.

New modules:
- `src/ui/visuals/VisualDirector.ts`: persistent scene orchestration (all unlocked scenes remain mounted; layout shrinks older panels as new ones appear).
- `src/ui/visuals/VisualClock.ts`: fixed-step animation timer.
- `src/ui/visuals/lod.ts`: count-to-visual mapping helpers.
- `src/ui/visuals/seededRng.ts`: deterministic variation from a save seed.

Scene interface:

```ts
interface VisualScene {
  build(root: HTMLElement): void;
  sample(state: GameState): void;    // state -> targets
  simulate(dtMs: number): void;      // animate toward targets
  render(): void;                    // DOM/CSS/canvas updates
  setVisible(v: boolean): void;
}
```

Renderer split (detailed baseline):
- `DOM/SVG` is for static structure and crisp hero assets that benefit from CSS/HTML layout.
- `Canvas2D` is for repeated/high-count motion layers, particles, trails, and density fields.
- Per scene, treat DOM/SVG as "foreground shell" and canvas as "animated mass layer."

## 3) Anti-Repetition Strategy

Use 3 concurrent loops in every scene:
- **Micro loop (1-6s):** fans, LEDs, terminal cursors, small traffic.
- **Meso loop (20-90s):** launches, maintenance carts, plume events, orbit plane drift.
- **Macro loop (3-10 min):** lighting/weather shift, camera drift, density gradients.

Rules:
- Never sync loop periods (use coprime-ish durations, seeded jitter).
- Use deterministic RNG so motion is stable per save but still varied.
- Trigger extra events from real game spikes (new factory, new launch capability, big purchase).

## 4) Scale Handling / LOD (Millions Without Drawing Millions)

Keep strict engine-side render caps, then route overflow into density/coverage channels:
- **Near field:** direct objects (1:1 where practical).
- **Far field:** continuous density fields (coverage, color mix, light intensity, traffic rate).

This keeps "more = visibly more" even after object-sprite limits are hit.

Represent very large counts with combined channels:
- Land/space coverage expansion
- Green-to-industrial color ratio shifts
- Motion throughput (launches, traffic streaks, orbital crossings) frequency
- Emissive intensity and ribbon thickness

Internal perf caps (engine-side only, not quantity display caps):
- Datacenter interior moving actors: <= 120
- Earth surface animated actors: <= 180
- Orbital live sprites: <= 240
- Rockets live at once: <= 12

When caps are reached, additional quantity continues to increase density/coverage/throughput signals.

## 5) Scene Plan

### A) Datacenter Interior (Laptop -> Mic Mini -> Racks)

Composition:
- `DOM/SVG`: laptop shell (sitting at the bottom of the screen), mic-mini units, front-row rack shells.
- `Canvas2D`: laptop-screen terminal text/progress animation, far rack rows, LED wave overlays, depth haze.
- Perspective is done as lane-based scale slices (no 3D camera).

Interesting motion:
- Terminal wall: job panes per each AI job, each with independent cadence and style.
- Job lines pull from sampled progress buckets (not raw spam).
- Rack LEDs are wave patterns, not random flicker.
- Occasional human-scale service cart crossing front lane (meso loop).

Scale mapping:
- `micMiniCount`: render directly; count stays small enough to not optimize.
- GPUs/racks: front row detailed, back rows become low-detail silhouettes.
- "Infinity" effect via repeating perspective slices with parallax scroll.

### B) Earth Surface (Datacenters + Power + Industry + Launches)

Composition:
- 2.5D parallax: sky, distant mountains, industrial belt, foreground apron.
- Keep visible spacing between early buildings; fill those gaps progressively as industry grows.
- `DOM/SVG`: skyline silhouettes, close hero buildings, fixed terrain layers.
- `Canvas2D`: smoke/steam particles, launch plumes/streaks, traffic and tiny far-human dots.

Interesting motion:
- Cooling fan rotations with phase offsets.
- Heat shimmer + smoke/steam particles only near active plants.
- Cargo/worker abstraction: light trails and tiny vehicles.
- Humans only in far shots as tiny pixel-scale rectangles (no close-up human animation).
- Launch loop: prep lights -> ignition plume -> ascent streak -> cooldown haze.

Scale mapping:
- Near field uses explicit buildings with growing density between structures over time.
- Far field uses skyline bands and surface color-mix shifts (forest green -> industrial toned rectangles) to show expansion.
- Per-type utilization drives animation intensity (fans/smoke), while total counts drive how far industrialization spreads into distance (colored proportional to types)

### C) Near-Earth Space (Satellites + Earth Industrialization + Moon Access)

Composition:
- Earth disk + at most 3-5 orbit shells (LEO/SSO/high orbit abstractions).
- Moon appears when unlocked, with inset surface highlights.
- `DOM/SVG`: Earth/Moon base disks and static overlays.
- `Canvas2D`: orbit ribbons, moving satellite dots/trails, launch/arrival streak events, emissive pulses.

Interesting motion:
- Shells precess at different rates; satellites move in both directions depending on shell.
- Launch/arrival streak events link Earth<->orbit and orbit<->Moon (not full trajectories).
- Earth night-side emissive growth indicates industrial expansion over time.

Scale mapping:
- Small counts: individual satellites.
- Mid counts: dots + short trails.
- High counts: continuous orbital ribbons + brightness + occasional glints.

### D) Moon Surface

Composition:
- Similar grammar to Earth surface but lower atmosphere effects.
- Reserve close foreground for mass drivers.
- `DOM/SVG`: terrain plate + mass-driver structure shells.
- `Canvas2D`: charge glows, slug streaks, dust plumes, tiny traffic indicators.

Interesting motion:
- Mass driver charge/discharge cycle (visible capacitor glow + slug streak).
- Dust plumes on landings/arrivals.
- Base lights in patterns tied to power/load.

### E) Mercury + Dyson Swarm

Composition:
- Sun-backed composition with Mercury in front of/near the solar disk and slight camera drift.
- Dyson swarm is always rendered as rotating orbit bands on inner orbits (no individual satellites).
- `DOM/SVG`: sun disk and Mercury base shape.
- `Canvas2D`: band rotation, transit darkening/brightening, glare and space-side glints.

Interesting motion:
- Mercury uses a single consume mask that progresses continuously until near-total excavation.
- Swarm bands darken when crossing the sun and brighten against open space.
- Slow scene rotation/parallax to reveal orbit layering and prevent repetitive loops.

Scale mapping:
- Swarm count increases band thickness, number of active band layers, transit density, and brightness.
- Mercury excavation percent directly controls remaining visible planetary mass.

## 6) Explicit Corners to Cut (Recommended)

Do not attempt:
- Fully realistic interplanetary travel visualization at true scale.
- Rendering individual workers at large counts.
- Full 3D free camera or physically correct orbital mechanics.

Instead:
- Show departures and arrivals with event streaks.
- Use symbolic transit indicators between bodies.
- Keep camera on curated compositions per scene.
- Keep human activity abstract except distant tiny silhouettes on surface scenes.

## 7) Performance Budget and Guardrails

Targets on integrated laptop graphics:
- 30+ FPS sustained in late game.
- Animation update + render CPU <= 6 ms average/frame.
- Heap growth flat during idle (no per-frame allocations in hot paths).

Rules:
- Object pools for particles/streaks.
- Prebuild gradients/patterns and reuse.
- No DOM creation/removal in per-frame loops.
- Reconcile lists only when bucket/count changes.
- Canvas redraw regions if possible; full redraw acceptable if still within budget.

Instrumentation:
- Dev overlay: fps, frame ms, active sprites, pooled vs allocated objects.
- Add stress mode to simulate endgame counts quickly.

## 8) Asset Plan (Keep It Small)

Minimum reusable sprites:
- laptop shell, rack face (detailed + far LOD), generic industrial module
- gas/nuclear/solar variants
- rocket (small + launch plume sheet)
- satellite icon (2 variants), mass-driver muzzle flash
- moon base module, single mercury consume mask

Target: ~15-20 base SVG assets total, recolored/tinted in code for variants.

## 9) Implementation Phases

Phase 1 (datacenter):
- Laptop screen simulation + rack perspective canvas + LOD mapping.

Phase 2 (earth surface):
- Parallax belt, distance-based density/color-mix system, launch event pipeline.

Phase 3 (space + moon):
- Orbit shell renderer, satellite LOD transitions, moon/mass-driver events.

Phase 4 (mercury + dyson):
- Single-mask Mercury consumption + sun-transit swarm bands + final balancing.

## 10) Success Criteria

- Visuals remain readable from early game to endgame.
- Repetition is masked by multi-timescale loops and event-driven spikes.
- Late-game counts feel massive without rendering massive object counts.
- Runs smoothly on integrated graphics without quality settings.
