# Scaling Claws
## Game Design Document

*An incremental game about scaling AI from a free subscription to a Dyson sphere.*

---

## Core Concept

You start with $0, a laptop (6 CPU cores), and a free ClawedCode account. Grind freelance tasks on Sixxer, upgrade your subscriptions, automate your agents, buy GPUs, train your own models, build chip fabs, go to space, and tile the solar system — then the galaxy — with compute.

The UI evolves continuously — panels gain new rows, buttons swap out, old metrics become footnotes. The player always builds on what they have, never starts over.

---

## Design Principles

- Start absurdly small (clicking a button), end absurdly large (Dyson sphere)
- New mechanics are revealed through unlocks, never all at once
- Each upgrade must feel like a genuine improvement, never a forced downgrade
- UI evolves in place — panels update, they don't get replaced by strangers
- Target pace: ~1 meaningful click every 1–2 seconds. More when clicking the same button repeatedly (bulk buying)
- No dead time: if the player is playing optimally, there is always something to click or a decision to make. Waiting = design bug
- For each ongoing expense: player can always reduce or cancel it. Auto-cancels if funds hit $0

---

## Global Top Bar

Always visible:

```
💰 $247 (+$1.40/min)  |  🧠 Intel: 0.5  |  ⚡ 0 FLOPS  |  💻 0 Code  |  🔬 0 Science
```

- **Funds:** Hover shows breakdown (income by source, each expense line)
- **Intelligence:** Current best model's capability level
- **Compute (FLOPS):** Appears when first GPU is bought
- **Code:** Appears when first Software Dev is hired
- **Science:** Appears when Research unlocks
- Numbers use abbreviations: K, M, B, T, Q, then scientific notation

---

## Panel Layout Evolution

The game uses **5 panel slots**. Panels appear as mechanics unlock.

| Timing | Panel 1 | Panel 2 | Panel 3 | Panel 4 | Panel 5 |
|--------|---------|---------|---------|---------|---------|
| Start | JOBS | AGENTS | — | — | — |
| First datacenter | JOBS | COMPUTE | ENERGY | — | — |
| Training unlocks | JOBS | COMPUTE | TRAINING | ENERGY | — |
| Research unlocks | JOBS | COMPUTE | TRAINING & RESEARCH | ENERGY | — |
| Chip fab research | JOBS | COMPUTE | TRAINING & RESEARCH | SUPPLY CHAIN | ENERGY |
| Space research | JOBS | COMPUTE | TRAINING & RESEARCH | SUPPLY CHAIN | SPACE & ENERGY |

Energy merges into Space once space unlocks. Supply Chain gets its own panel when fabs unlock. 5 panels max.

---

## Bulk Buy Buttons

Everywhere quantities are purchased, buttons scale with progress:

- Start: `[+1]`
- At 10 owned: `[+1] [+10]`
- At 100 owned: `[+1] [+10] [+100]`
- At 1,000 owned: `[+10] [+100] [+1K]`
- Always 3 buttons visible, shifting upward

---

## CPU Cores & Agent Hosting

Agents require CPU cores to run. Each agent needs 1 core (2 cores for Ultra Max / Ultra Pro Max tier agents).

**Starting laptop:** 6 cores. The player can immediately run multiple agents as soon as they can afford subscriptions — no hardware gating in the first minutes.

**Mic-mini PCs:** $80 each, adds 8 cores. The player buys these to scale past the laptop's 6-core limit.

Core allocation is automatic: agents claim cores in priority order (highest-tier first). If cores run out, lower-tier agents go idle.

After the GPU transition, CPU cores become irrelevant — GPU instances replace them as the agent-hosting resource.

---

## JOBS Panel

**Always present. Starts as Sixxer jobs. Grows throughout the entire game.**

### Job Types (full game)

| Job | Reward | Time | Intel Req. | Unlocked When |
|-----|--------|------|------------|---------------|
| Sixxer Basic | $6/task | 20s | 0.5 | Start |
| Sixxer Standard | $18/task | 30s | 1.0 | Intel 1.0 |
| Sixxer Advanced | $45/task | 40s | 2.0 | Intel 2.0 |
| Sixxer Enterprise | $120/task | 55s | 2.5 | Intel 2.5 |
| Manager Agent | (manages agents) | ongoing | 2.0 | First Ultra sub |
| Manager² Agent | (manages Managers) | ongoing | 2.5 | First Ultra Pro Max sub |
| Engineer | $0 (staff role) | ongoing | 3.0 | First datacenter |
| Software Dev | +Code | ongoing | 4.0 | Intel 4.0 |
| AI Researcher | +Science | ongoing | 12.0 | Intel 12.0 |
| AI Coder | $2,000/task | 120s | 15.0 | Intel 15.0 |
| Robot Operator | (controls robots) | ongoing | 4.0 | Robotics I research |

**Engineers and Software Devs** can be either human (hired for $/min) or AI agents (requires sufficient Intelligence, costs compute). Robots can fill physical staff roles after Robotics II.

### Engineers (staff role)

| Facility | Engineers Required |
|----------|-------------------|
| Small Datacenter (256 GPUs) | 2 |
| Medium Datacenter (4,096 GPUs) | 5 |
| Large Datacenter (65,536 GPUs) | 12 |
| Mega Datacenter (1M GPUs) | 30 |
| Gas Plant | 3 |
| Nuclear Plant | 3 |
| Solar Farm | 1 |
| Wafer Fab | 5 |
| Silicon Mine | 4 |
| Robot Factory | 3 |

Human Engineers: $200/min each. AI Engineer agents: Intel 3.0+, costs compute. Robots: physical roles only after Robotics II.

### Software Developers & Code

**Human Software Dev:** $300/min, produces 1 Code/min.
**AI Software Dev agent:** Intel 4.0+, produces (Intelligence / 4) Code/min, costs compute.

| Requirement | Code Cost |
|-------------|-----------|
| Datacenter automation | 50 |
| Fine-tune pipeline | 20 |
| Training pipeline | 100 |
| Subscription platform | 200 |
| Chip fab automation | 300 |
| Robot control software (per 100 robots) | 50 |
| Lunar operations software | 500 |
| Mercury operations software | 2,000 |
| Synthetic data pipeline | 150 |
| Von Neumann probe software | 1,000,000 |

### Agent Scaffolding

**Nudge button:** Fixes 1 stuck agent per click.
**Stuck rate:** Intel 0.5 → ~1 in 4. Intel 2.5 → ~1 in 12. Intel 10+ → ~1 in 100. Intel 50+ → effectively never.
**Manager agents:** ~6 nudges/min. One Manager keeps ~10–15 agents running.
**Manager² agents:** ~10 nudges/min. Self-healing. One Manager² keeps ~8 Managers running.

**UI at different stages:**

Early:
```
┌─ JOBS ──────────────────────────────────────────┐
│  Sixxer Basic     $6/task   20s  Intel 0.5      │
│    [▓▓▓▓▓▓░░░░░░] Agent 1                      │
│    [▓▓░░░░░░░░░░] Agent 2                      │
│  CPU Cores: 4/6 free  |  Completed: 3           │
│  Job income: $0.90/min                [Nudge]   │
└──────────────────────────────────────────────────┘
```

Late:
```
┌─ JOBS ──────────────────────────────────────────┐
│  AI Coder  $2K/task 120s  Agents: 200 (197/2/1) │
│  AI Researcher  Agents: 500 → 🔬 900/min        │
│  Software Dev (AI) Agents: 20 → Code: 64/min    │
│  Manager²: 8  |  Manager: 40                    │
│  Engineers: 50 AI | Robot Ops: 20 (2K robots)   │
│  Job income: $8.5M/min                          │
└──────────────────────────────────────────────────┘
```

---

## AGENTS Panel → COMPUTE Panel

Starts as subscription management. Transforms into GPU/compute management via an explicit upgrade button.

### Early State: Subscriptions

```
┌─ AGENTS ────────────────────────────────────────┐
│                                                  │
│  Free           Intel 0.5  10 tasks/day limit   │
│    Agents: 1  (1 core each)                      │
│  Pro     $20/min Intel 1.0  50 tasks/day limit  │
│    Agents: 0  [+1]  (1 core each)               │
│  Ultra   $50/min Intel 2.0  no limits            │
│    Agents: 0  [+1]  (1 core each)               │
│  Ultra Max    $120/min Intel 2.5  no limits     │
│    Agents: 0  [+1]  (2 cores each)              │
│  Ultra Pro Max $200/min Intel 2.5  no limits    │
│    Agents: 0  [+1]  (2 cores each)              │
│                                                  │
│  CPU Cores: 5/6 free                             │
│  Mic-mini PCs: 0  [Buy $80] (+8 cores)          │
│                                                  │
│  Total agents: 1 | Sub cost: $0/min             │
│  ⚠️ Paid subs cancel if funds reach $0.         │
└──────────────────────────────────────────────────┘
```

**Subscription tiers:**

| Tier | Cost/min | Intel | Limit | Cores/Agent | Unlocked |
|------|----------|-------|-------|-------------|----------|
| Free | $0 | 0.5 | 10 tasks/day | 1 | Start |
| Pro | $20/min | 1.0 | 50 tasks/day | 1 | Start |
| Ultra | $50/min | 2.0 | No limit | 1 | Start |
| Ultra Max | $120/min | 2.5 | No limit | 2 | Start |
| Ultra Pro Max | $200/min | 2.5 | No limit | 2 | Start |

All tiers are available from the start — the only gate is money. The laptop's 6 cores let you immediately run up to 6 agents (or 3 at Ultra Max/UPM tier). Ultra Max and Ultra Pro Max have the same Intelligence (2.5) but Ultra Pro Max unlocks Manager² agents.

**Cancellation:** If funds reach $0, all paid subscriptions are cancelled instantly. Agents go idle. The Free agent keeps working.

**Why Ultra Pro Max at same Intel as Ultra Max?** Ultra Pro Max unlocks Manager² (the self-healing management layer). That's the premium you pay — not raw intelligence, but automation capability.

### The GPU Transition

When the player has enough funds (and has seen enough of the subscription grind), a button appears:

```
│  ─────────────────────────────────────────────── │
│  🆕 Go self-hosted                               │
│  Replace subscriptions with GPUs running          │
│  DeepKick-405B (Intel 2.5)                       │
│  Cost: [N] GPUs × $3,000 = $[total]             │
│  (1 GPU per active agent)                        │
│  Eliminates all subscription costs!              │
│  [Go Self-Hosted]                                │
└──────────────────────────────────────────────────┘
```

**N = number of currently active agents.** The cost is proportional. DeepKick-405B matches Ultra Pro Max (Intel 2.5), so no downgrade. The button shows exact savings.

After clicking, the panel transforms:

```
┌─ COMPUTE ───────────────────────────────────────┐
│                                                  │
│  Model: DeepKick-405B (Intel 2.5)                │
│  GPUs: 8  |  Total compute: 16 PFLOPS           │
│  Instances: 8 (2.0 PFLOPS/instance)             │
│  Free compute: 0 PFLOPS                          │
│                                                  │
│  [Buy GPU] $3,000  [+1] [+10]                   │
│                                                  │
│  🆕 Upgrade: DeepKick-647B (Intel 3.5)          │
│    Requires: 16 GPUs (4.0 PFLOPS/instance)      │
│    [Upgrade Model]                               │
│                                                  │
│  💡 At 32 GPUs you'll need a datacenter.        │
└──────────────────────────────────────────────────┘
```

**Model upgrades in Compute panel:** Before training unlocks, larger DeepKick variants become available as the player buys more GPUs. Each requires more PFLOPS/instance but gives higher Intelligence.

| Model | Intelligence | PFLOPS/Instance | Min GPUs |
|-------|-------------|----------------|----------|
| DeepKick-405B | 2.5 | 2.0 | 1 |
| DeepKick-647B | 3.5 | 4.0 | 16 |
| DeepKick-1.2T | 5.0 | 8.0 | 48 |
| DeepKick-2.8T | 7.0 | 16.0 | 128 |

Instances = floor(total_compute / PFLOPS_per_instance). More GPUs = more instances = more concurrent agents.

**Free compute** = total PFLOPS − (instances × PFLOPS/instance) − training allocation. This matters later when subscriptions (selling) unlock.

**Datacenter requirement at 32 GPUs.** Must buy a Small Datacenter ($100,000). Requires 2 Engineers.

### Later Compute State

```
┌─ COMPUTE ───────────────────────────────────────┐
│                                                  │
│  Model: Aries-2 (Intel 18.5)                    │
│  GPUs: 12,000 | Total: 96,000 PFLOPS            │
│  Instances: 800 (60.0 PFLOPS/inst)              │
│  Training: 25% (24,000 PFLOPS)                  │
│  Free compute: 24,000 PFLOPS                     │
│                                                  │
│  Subscribers: 8,000 @ $35/min = $280K/min       │
│    Price: [$10 ◄══●════► $80]                   │
│    Demand: 9,200 (limited by free compute)       │
│    [Buy Ads] $50K (+1,500 awareness)            │
│  Reserved: 16,000 PFLOPS (2.0/subscriber)       │
│                                                  │
│  [Buy GPU] $3,000 [+10] [+100] [+1K]           │
│  Datacenters: 2× Large (131,072 cap)            │
│  [Buy Large DC] $30M (65,536 GPUs) 12 Eng      │
│                                                  │
│  Training: [−5%] 25% [+5%]                      │
└──────────────────────────────────────────────────┘
```

**Subscriptions (selling):** Unlocked at Intel 8.0+, requires 200 Code. Each subscriber reserves a fixed PFLOPS from free compute. Revenue = subscribers × price.

**Training allocation:** `[−5%]` and `[+5%]` buttons. Training only consumes compute when a run is active.

---

## TRAINING & RESEARCH Panel

**Appears when the player has 2+ datacenters and 20 Code (fine-tune pipeline).**

### Early: Fine-tuning

```
┌─ TRAINING ──────────────────────────────────────┐
│                                                  │
│  Current model: DeepKick-1.2T (Intel 5.0)        │
│                                                  │
│  Available fine-tune:                            │
│  DeepKick-Math (Intel 6.0)                       │
│    Cost: 50 PFLOPS-hrs + 20 TB data             │
│    [Start Fine-tune]                             │
│                                                  │
│  [Buy Data] $2,000 (10 TB) — $200/TB            │
│  Data owned: 0 TB                                │
│                                                  │
│  Training: [−5%] 0% [+5%]                       │
│  (Set above 0% and start a run to begin)         │
└──────────────────────────────────────────────────┘
```

**Fine-tune sequence:**

| Model | Intel | Compute | Data | Unlocked By |
|-------|-------|---------|------|-------------|
| DeepKick-Math | 6.0 | 50 PFLOPS-hrs | 20 TB | 2 datacenters + 20 Code |
| DeepKick-Code | 7.5 | 150 PFLOPS-hrs | 60 TB | DeepKick-Math complete |
| DeepKick-Reason | 9.0 | 500 PFLOPS-hrs | 200 TB | DeepKick-Code complete |
| DeepKick-Ultra | 11.0 | 2,000 PFLOPS-hrs | 800 TB | DeepKick-Reason complete |

### Full Training + Research

```
┌─ TRAINING & RESEARCH ───────────────────────────┐
│                                                  │
│  TRAINING                                        │
│  Current: Aries-1 (Intel 14.0)                   │
│  Training: Aries-2 [▓▓▓▓▓▓░░░░░░] 52%          │
│    Requires: 5,000 PFLOPS-hrs + 2,000 TB        │
│    Expected Intel: ~18.5                         │
│    Training: [−5%] 30% [+5%]                    │
│                                                  │
│  [Buy Data]   $50K (100 TB) — $500/TB           │
│  [Synth Data] uses 5 PFLOPS → 1 TB/min          │
│  Data: 1,847 / 2,000 TB                         │
│                                                  │
│  ─── RESEARCH ──────────────────────────────────│
│  Science: 2,450🔬 (+640/min)                    │
│                                                  │
│  [Algo Efficiency III]   800🔬  Train 25% faster│
│  [GPU Architecture v2]  1,200🔬  GPUs +50% FLOPS│
│  [Robotics I]            400🔬  Robot factories  │
│  [Space Rockets I]      2,000🔬  Launch -40%    │
│                                                  │
│  Done: Algo Eff I, II · Synth Data I            │
└──────────────────────────────────────────────────┘
```

**Aries model training runs:**

| Model | Intel | Compute (PFLOPS-hrs) | Data (TB) |
|-------|-------|---------------------|-----------|
| Aries-1 | 14.0 | 10,000 | 5,000 |
| Aries-2 | 18.5 | 50,000 | 20,000 |
| Aries-3 | 25.0 | 250,000 | 100,000 |
| Aries-4 | 35.0 | 2,000,000 | 500,000 |
| Aries-5 | 50.0 | 20,000,000 | 3,000,000 |
| Aries-N | ~50×1.4^N | ×10 each | ×5 each |

**Data economics:**
- Purchased data: starts at $200/TB, increases 15% per purchase
- Synthetic data: costs compute, rate scales with Intelligence. Unlocked via Synth Data I research (150 Code).

**Research (Science):**

Science comes from AI Researcher agents. Rate = Intelligence × number_of_agents × algo_efficiency_bonus.

| Tier | Typical Cost | Example |
|------|-------------|---------|
| Early | 100–500 🔬 | Algo Efficiency I |
| Mid | 500–5,000 🔬 | GPU Architecture v2 |
| Late | 5,000–100,000 🔬 | Space Systems II |
| Endgame | 10^6–10^15 🔬 | Self-Replicating Systems |

**Complete research tree:**

| Research | Cost (🔬) | Prereq | Effect |
|----------|----------|--------|--------|
| Algo Efficiency I–VIII | 200→500K | Each prev | Training 25% faster each |
| Synth Data I–IV | 300→100K | Each prev | Unlock / improve synth data |
| GPU Architecture v1–v6 | 400→250K | Each prev | GPUs +50%→+200% FLOPS |
| Solar Efficiency I–IV | 500→100K | Each prev | Solar +50%→+100% output |
| Chip Fabrication I–IV | 800→200K | Each prev | Unlock fabs / +100%→+500% prod |
| Robotics I–V | 400→200K | Each prev | Unlock → lunar-rated → self-maintaining |
| Space Rockets I–IV | 2K→200K | Each prev | Launch cost −40% each |
| Space Systems I–III | 5K→200K | Rockets I+ | Orbital → Lunar → Mercury |
| Nuclear Fusion I–II | 20K→150K | Each prev | Fusion power → compact fusion |
| Self-Replicating Sys | 10^15 | Space III + Robot V | Von Neumann probes (+ 10^6 Code) |

---

## SUPPLY CHAIN Panel

**Appears when Chip Fabrication I is researched.**

```
┌─ SUPPLY CHAIN ──────────────────────────────────┐
│                                                  │
│  GPU PRODUCTION                                  │
│  Lithography machines: 1  [Buy $1.5M]           │
│  Wafers: 50   [Buy $3,000 / 50-GPU batch] [+1] [+10] │
│  GPU output: 50/min                              │
│                                                  │
│  Wafer fabs: 0  [Build $8M]  5 Eng              │
│  Silicon mines: 0  [Build $4M]  4 Eng or Robots │
│                                                  │
│  ─── ROBOTICS ─────────────────────────────────│
│  Robot factories: 0  [Build $2M]  3 Eng         │
│  Robots: 0  |  Sell: [+1] [+10] @ $5,000 each  │
└──────────────────────────────────────────────────┘
```

---

## ENERGY Panel → SPACE & ENERGY Panel

**Appears with first datacenter.**

### Energy Section

```
┌─ ENERGY ────────────────────────────────────────┐
│                                                  │
│  Power demand: 12 MW  |  Supply: 15 MW          │
│  Grid contract: 15 MW  [+5 MW $800/min] [-5 MW] │
│                                                  │
│  Gas plants: 0  [Build $1.5M]  +50 MW  3 Eng   │
│  Nuclear: 0  [Build $12M]  +200 MW   3 Eng     │
│  Solar farms: 0  [Build $800K]  +panels MW  1 Eng│
│    Panels: 0  [Buy $400 each] [+1] [+10]       │
│                                                  │
│  Surplus = wasted. Deficit → GPUs throttle.      │
└──────────────────────────────────────────────────┘
```

### Space Section (Space Systems I)

The panel becomes SPACE & ENERGY with orbital arrays, lunar base, Mercury operations, and Dyson swarm (same structure as v3/v4).

---

## Visual Panels

The game features **4 visual panels** that exist separately from the UI panels. They are decorative/atmospheric backgrounds that evolve as the player progresses. Each visual panel unlocks at a specific milestone and is always visible once unlocked (displayed above or alongside the UI panels).

### Visual Panel 1: In-Datacenter View

**Unlocked:** Start (always visible).

This panel shows the interior of your compute operation, evolving from a desk to a massive datacenter floor.

**Stage 1 — Laptop (start):**
A small desk with an open laptop. The screen shows terminal lines (green text on dark background). A blinking cursor. A coffee cup nearby. This is your entire operation.

**Stage 2 — Mic-mini stack (first Mic-mini purchase):**
Mic-mini PCs appear next to the laptop as small dark towers with blinking LEDs. Each purchase adds one to the stack. At 3+ Mic-minis, they form a neat row. Activity LEDs blink faster as more agents run.

**Stage 3 — First server rack (GPU transition):**
The desk slides left. A server rack appears, initially mostly empty (dashed outlines for empty slots). As GPUs are purchased, server units fill the rack from top to bottom — each unit has a green power LED and a red activity LED that flickers rapidly. The rack glows warmer as it fills.

**Stage 4 — Multiple racks (first datacenter):**
More racks appear. A cable tray runs overhead with colored cables dropping to each rack. Blue LED aisle lighting glows between rack rows. Racks further from camera are slightly smaller and more transparent (depth perspective). Empty slots in each rack are visible as dark dashed outlines.

**Stage 5 — Full room (multiple datacenters):**
The view becomes a wide datacenter floor — rows of racks stretching into the distance, fading with perspective. Ceiling lights illuminate the aisles. The racks in the foreground are detailed; those in the background become abstract green-lit columns. The scale conveys industrial enormity.

**Sprite assets used:** `laptop.svg`, `mic-mini.svg`, `gpu-card.svg`, `server-rack.svg`, `datacenter-room.svg`

**Implementation:** Pure DOM + inline SVGs. Each stage is a `<div>` container that crossfades via CSS `opacity` transitions when thresholds are crossed. The laptop and Mic-minis are inline `<svg>` elements positioned with flexbox/absolute positioning. Server rack slots are a CSS grid — GPU purchase inserts a new server-unit `<div>` with a CSS `@keyframes` slide-down + fade-in animation (~200ms). LED blinks are CSS animations with randomized `animation-duration` (1.5–2.5s) set via inline style so they don't sync up. The full-room view uses `datacenter-room.svg` as a background with additional rack `<div>`s overlaid for the foreground. The entire panel is a single DOM container — no canvas needed.

### Visual Panel 2: Earth Surface View

**Unlocked:** First datacenter purchase.

A landscape scene showing your facilities from a distance. Camera zooms out as more things are built.

**Stage 1 — Single datacenter:**
A lone datacenter building on flat ground. HVAC units spin on the roof. Power lines connect to the edge of the frame (grid power). A small road runs along the bottom. Hills in the background.

**Stage 2 — Power infrastructure (first power plant):**
Camera zooms out slightly. A gas plant appears with animated smoke puffs rising from its stack. Or a nuclear plant with its distinctive dome and cooling tower steam. Power lines connect the plant to the datacenter. The landscape is getting industrial.

**Stage 3 — Multiple facilities:**
Camera zooms out more. Multiple datacenters, power plants, solar farms (blue panels with glint animations) spread across the landscape. A road network connects them. A solar farm section glows with reflected light. The scene transitions from "a building" to "a campus."

**Stage 4 — Rocket silo + robot factory:**
Camera at widest Earth-surface zoom. Rocket silos appear with gantry towers. Robot factories have sawtooth roofs and visible assembly windows. Small robot sprites walk between buildings. The landscape is now a full industrial complex. Smoke, steam, solar glints, rocket warning lights — the scene is alive with activity.

**Sprite assets used:** `datacenter-building.svg`, `gas-plant.svg`, `nuclear-plant.svg`, `solar-farm.svg`, `rocket-silo.svg`, `robot-factory.svg`, `robot.svg`, `silicon-mine.svg`, `wafer-fab.svg`

**Implementation:** Pure DOM with CSS transforms for zoom. Buildings are inline SVGs placed with `position: absolute` inside a container `<div>`. The zoom-out effect uses `transform: scale()` on the container, triggered by facility count thresholds with a CSS `transition` (~1s ease-out). New buildings appear with a CSS animation (`scaleY(0.5) → scaleY(1)` over ~1s, `transform-origin: bottom`). Smoke puffs are already animated within the SVGs themselves (SVG `<animate>` elements). Power lines are a thin `<svg>` overlay with `<line>` elements drawn between building anchor points. The mountain backdrop is a separate `<div>` layer with `transform: scale()` at 60% of the main container's zoom (parallax) — pure CSS, no JS needed for the parallax effect itself.

### Visual Panel 3: Earth-Moon Space View

**Unlocked:** Space Systems I researched + first satellite launched.

A view of Earth and the Moon in space with satellites orbiting.

**Stage 1 — First satellites:**
Earth dominates the left side — a blue-green sphere with stylized continents, wispy clouds, and a thin atmosphere glow. A few satellite dots orbit on elliptical paths, each leaving a faint trail. The launch animation fires from Earth's surface: a bright dot arcs upward, passes through the atmosphere line, and joins an orbit.

**Stage 2 — Constellation growth:**
More satellites fill the orbital zone. At 20+ satellites, orbital paths become a visible web of dots. The Moon appears in the upper right — a grey sphere with craters. A dotted transfer path connects Earth to Moon.

**Stage 3 — Lunar base:**
Small glowing dots appear on the Moon's surface — the base. Craft sprites travel the Earth-Moon transfer path carrying robots and GPUs. The lunar mass driver is a bright streak that periodically fires from the Moon, launching new satellites into Earth orbit.

**Sprite assets used:** `earth.svg`, `moon.svg`, `satellite.svg`

**Implementation:** DOM with CSS animations for orbits. Earth and Moon are inline SVGs positioned absolutely. Satellites are small `<div>` dots (4×4px, `border-radius: 50%`, green glow via `box-shadow`) animated along elliptical paths using CSS `offset-path: path('M...')` with `offset-distance` animated from 0% to 100%. Each satellite gets a randomized `animation-duration` (6–15s) and a unique path definition (varying semi-major/semi-minor axes for different inclinations). Satellite count maps to DOM elements up to ~50; beyond that, replace individual dots with a single semi-transparent ring `<div>` whose `opacity` scales with count. Launch animation: a bright dot `<div>` follows a CSS `offset-path` Bezier from Earth's surface to orbit entry (~2s), with an orange `box-shadow` trail fading via `@keyframes`. The transfer-orbit craft is a small `<div>` animated along a Bezier `offset-path` between Earth and Moon. The lunar mass driver streak is a CSS-animated `<div>` (narrow, bright, `scaleX(0) → scaleX(1) → opacity: 0` over ~0.5s).

### Visual Panel 4: Inner Solar System View

**Unlocked:** Space Systems III researched (Mercury operations).

The Sun, Mercury, and Earth in orbital view. The Dyson swarm builds here.

**Stage 1 — Mercury operations:**
The Sun is a large bright sphere on the left with animated corona wisps. Mercury orbits nearby — a small cratered sphere with a faint orange glow from mining activity. Earth is a tiny blue dot on a wider orbit. Faint orbital path lines are visible. Transfer path streaks connect Mercury to the Sun's orbital zone.

**Stage 2 — Dyson swarm growing:**
Small golden dots begin appearing around the Sun — Dyson swarm satellites. As coverage increases, the dots multiply. At 1%, a sparse scattering. At 10%, a visible haze. The dots orbit the Sun at varying speeds. A coverage percentage is displayed.

**Stage 3 — Dyson swarm dense:**
At 50%+, the individual dots merge into a glowing ring/shell around the Sun. The Sun appears dimmer as its light is being captured. The swarm itself glows with captured energy — a warm golden halo. This is the visual climax of the physical game.

**Stage 4 — Von Neumann probes:**
The view pulls back to show the Milky Way as a spiral. Light spreads outward from the center — stars brightening as probes reach them. Andromeda appears in the distance. The final image: the observable universe, dots of light connected by faint probe trails.

**Sprite assets used:** `sun.svg`, `mercury.svg`, `earth.svg` (small)

**Implementation:** This is the **one visual panel that uses a `<canvas>` element** (raw Canvas2D, no framework). The Sun, Mercury, and Earth are drawn as filled circles with radial gradients. The corona is 8–12 small circles drawn with `globalCompositeOperation: 'lighter'` at randomized positions around the Sun, redraw each frame with slight position jitter. Mercury and Earth positions update each frame via parametric ellipse equations (`x = cx + a*cos(t), y = cy + b*sin(t)`). Dyson swarm satellites are a particle array — each particle has angle, radius, and angular velocity. The render loop (`requestAnimationFrame`, throttled to 30fps) draws each as a 2px filled circle. Particle count = `swarm_percentage × 20` (max ~2000). At >50% coverage, additionally draw a semi-transparent ring (`arc()` with thick `lineWidth` and low `globalAlpha`) for the glow effect. The galaxy view (Von Neumann stage) swaps the canvas content to a pre-rendered spiral background image with a radial `clip()` that expands based on probe coverage. Total canvas code: ~150 lines. No framework dependency.

**What was simplified from v4:** The original design called for shader-based heat shimmer on GPUs — replaced with CSS alpha-pulse animations on LEDs. The full conveyor factory scene is represented by the `robot-factory.svg` sprite with an animated assembly window, rather than a scrolling conveyor simulation. Neural network training visualization was dropped — the training progress bar in the UI panel is sufficient (visual panels focus on physical infrastructure). Rocket launches use a CSS-animated dot-with-glow rather than a multi-phase sprite sequence.

---

## Click Pacing & Balance

The game maintains ~1 meaningful click per 1–2 seconds throughout. **No dead time for optimal players.**

### Phase 1: Quick Start (~0–3 min)

**Setup:** 1 Free agent, 6 CPU cores. Sixxer Basic ($6, 20s). Player starts with $50.

Second 0: Game starts. 1 Free agent auto-begins a task. Player watches.
Second 20: First task completes (+$6, total $56). Second task auto-starts. **Meanwhile:** Player can immediately buy a Pro sub ($20/min) — they have $56 and income is coming.

**Key design: the laptop's 6 cores eliminate hardware gating.** With 6 cores, the player can run 5 Pro agents (1 core each) + 1 Free agent immediately — the only gate is money. This means the first ~3 minutes are spent buying subs as fast as income allows, not waiting for hardware.

Second 30–40: Buy first Pro sub. Now 2 agents working Sixxer Basic.
Minute 1: Income is ~$18/min (from Free) + ~$18/min (from Pro) = ~$36/min. Sub cost: $20/min. Net: ~$16/min. Buy second Pro sub at minute 1.5 ($20). Three agents.
Minute 2: Income ~$54/min, cost ~$40/min. Net ~$14/min. Agents are getting stuck (~1 in 4 tasks at Intel 0.5). **Nudge clicking begins** — player clicks Nudge every few seconds. This is the core early-game activity.
Minute 2.5: Buy third Pro sub. 4 agents, 2 cores remaining.
Minute 3: Fourth Pro sub. 5 agents, 1 core remaining (laptop maxed). Income ~$90/min, cost ~$80/min. **Buy first Mic-mini ($80)** — this takes ~4 seconds of saving from net income.

**Clicks:** Nudge (every 2–5s), buy subs (every 20–30s), buy Mic-mini (every 30–60s). ~1 click per 2s. No dead time.

### Phase 2: Subscription Scaling (~3–10 min)

Player buys Mic-minis and scales subs. Each Mic-mini ($80) adds 8 cores. Intel 1.0 (Pro) unlocks Sixxer Standard ($18/30s).

**Minute 5:** 2 Mic-minis (22 cores total), 8 agents on Standard. Income ~$290/min. Cost ~$160/min (Pro subs). Net ~$130/min.

**Minute 7:** First Ultra sub ($50/min, Intel 2.0). Unlocks Manager agents and Sixxer Advanced ($45/40s). Player reassigns agents to Advanced. Nudge clicking decreases as Manager handles some. Buy more Mic-minis.

**Minute 9:** 3 Mic-minis, ~10 agents. Mix of Advanced and Standard. Income ~$500/min. Cost ~$300/min. **Key: player should always have something to buy.** If they're saving for an Ultra sub ($50/min), a Mic-mini ($80) is always purchasable as a micro-goal.

**Clicks:** Nudge, buy sub, buy Mic-mini, reassign agents. ~1 click per 2s.

### Phase 3: Ultra Pro Max & Automation (~10–18 min)

Player reaches Ultra Pro Max ($200/min, Intel 2.5). Manager² unlocks. 10–14 agents running. Nudge clicks decrease (Manager² self-heals).

**Minute 14:** ~12 agents on Enterprise ($120/55s) = ~$1,570/min. Costs ~$800/min subs. Net ~$770/min.

**Minute 16–18:** Player accumulates ~$10K–15K. Meanwhile, they're still buying Mic-minis for more cores, buying subs, managing agents. The "Go Self-Hosted" button appears when they can afford 12 GPUs × $3,000 = $36,000. Net income is high enough they reach this in ~25 seconds of saving.

**No waiting:** The player is always buying something — another sub, another Mic-mini, reassigning agents. The GPU transition is a decision, not a wait.

### Phase 4: GPU Transition (~18–25 min)

Player clicks [Go Self-Hosted]. All sub costs vanish instantly. Net income jumps.

**Post-transition:** Player buys GPUs ($3,000 each) as fast as money comes in. At ~$1,500/min net (Enterprise tasks), that's 1 GPU every 2 seconds. Click click click. Upgrade to DeepKick-647B at 16 GPUs. Agents do Enterprise faster.

**Minute 22:** 32 GPUs. Must buy Small Datacenter ($100,000). At current income (~$2,000/min), this takes ~50 seconds. **During that wait:** Player is still buying GPUs (they have GPU slots up to 32), hiring Engineers (new mechanic!), and the game is revealing the ENERGY panel. Plenty to click.

**Minute 24:** Small DC purchased. 2 Engineers hired. Now filling 256 GPU slots — that's ~3 minutes of clicking Buy GPU ×10.

### Phase 5: Datacenters & Fine-tuning (~25–40 min)

Player fills first DC, buys second. Hires Software Devs for Code. Starts fine-tuning.

**Key pacing principle:** While training runs, the player has other things to do — buy GPUs, buy data, manage Engineers, build power plants, buy solar panels. Training is a background process, not a waiting mechanic.

**Minute 30:** 512 GPUs. DeepKick-1.2T (Intel 5.0). Income ~$5,000/min. First fine-tune (DeepKick-Math) takes ~10 min with 20% allocation. During that time: buy GPUs, buy data, hire devs, manage power.

**Minute 35:** DeepKick-Math complete (Intel 6.0). Start DeepKick-Code. Keep scaling GPUs.

**Minute 38:** ~2,000 GPUs, need Medium DC ($2M). Income supports this in ~30s.

### Phase 6: Intelligence Ramp & Research (~40–55 min)

Fine-tunes cascade: Intel 6 → 7.5 → 9 → 11. AI Software Devs online. Training pipeline for Aries-1 (100 Code).

**Minute 45:** Intel 11 (DeepKick-Ultra). First Medium DC. ~3,000 GPUs. Income ~$80K/min.

**Minute 50:** Research unlocks at Intel 12.0. Player clicks research buttons every 20–60s as Science flows in. **Multiple things happening simultaneously:** GPU buying, data buying, research purchasing, Engineer management, power plant building.

### Phase 7: Aries Models & Scaling (~55–75 min)

Aries-1 training. Supply Chain panel appears (Chip Fab I). Player builds litho machines, fabs, mines.

**Minute 60:** Aries-1 complete (Intel 14). AI Coders, subscription selling. Massive new revenue.

**Minute 65–75:** Building industrial infrastructure — fabs, mines, robot factories, robots. Each click builds something. This is the highest click-density phase: 2+ clicks/second during peak build-out.

### Phase 8: Space (~75–95 min)

Rocket launches, satellites, lunar base, Mercury operations. Each launch is a satisfying click.

**Minute 80:** First satellite. Click click click launching more.
**Minute 88:** Lunar operations. Robots to Moon. Build solar farms, mass driver.
**Minute 92:** Mercury operations. Send robots, build mining stations.

### Phase 9: Dyson Swarm (~95–110 min)

Mercury auto-produces satellites. Swarm percentage climbs. Player builds more Mercury infrastructure, manages research.

**Clicks slow to ~1 per 3–5s.** The exponential is doing the work. This is intentional — the game's pacing becomes contemplative as you approach cosmic scale.

### Phase 10: Von Neumann Probes (~110–120 min)

Self-Replicating Systems research. Launch probes. Watch galaxy fill. Time acceleration buttons.

**Final clicks:** Time acceleration, watching counters. 1 click per 5–10s. Contemplative ending.

---

## Flavor Text / Ticker

A scrolling log at the bottom of the screen, 1 line at a time:

**Early:**
- *"Your first Sixxer task: 'Rewrite my cat's Instagram bio.' $6 is $6."*
- *"Agent stuck. It's been thinking about a regex problem for 45 seconds."*
- *"Your third Mic-mini. Your desk is becoming a server rack."*
- *"The Manager agent nudged a stuck coder. It said 'try a different approach.' Shockingly, it worked."*

**Mid:**
- *"GPU #1 has arrived. Your apartment's circuit breaker has opinions about this."*
- *"Subscriptions cancelled. You are no longer ClawedCode's best customer. You are their competitor."*
- *"DeepKick-Math solved a Sixxer Enterprise task in 12 seconds. The client thought it was a mistake."*
- *"Your first subscriber asked for a refund. Your second subscriber signed a yearly contract."*

**Late:**
- *"Datacenter #4. The power company sent a personal account manager. And a fruit basket."*
- *"The AI Researchers proposed an experiment you don't understand. You approved it anyway."*
- *"Aries-3 passed every benchmark. It asked if there were harder ones. There weren't."*
- *"Your robots built a solar farm overnight. The contractor you fired last month is reconsidering his career."*

**Space:**
- *"First satellite deployed. No electricity bill. The sun works for free."*
- *"50 robots on the Moon. They don't complain about the commute."*
- *"The lunar mass driver launched 20 satellites today. SpaceY is 'not worried.' They are worried."*
- *"Mercury is 5% lighter. Somewhere, an astronomer's calculations are wrong and they don't know why yet."*

**Endgame:**
- *"The Dyson Swarm captured more energy today than Earth used in 2024."*
- *"Intelligence: 500. It's been improving its own training algorithm for the last hour. You watched."*
- *"Von Neumann fleet en route. ETA to Alpha Centauri: 4.2 years. You'll wait."*
- *"Stars converted: 1,000. Each one is building more probes. The math is working."*

---

## Technical Notes — Implementation

### Framework: DOM + TypeScript (no game engine)

The game is fundamentally a panel-based UI with numbers, buttons, and progress bars — DOM's bread and butter. Using a game engine like Phaser would mean reimplementing every button, tooltip, text layout, scrollable list, and hover state from scratch. Instead, the entire game is standard HTML/CSS/TypeScript with a single `<canvas>` element for the Inner Solar System visual panel (the only view that needs real-time particle rendering for the Dyson swarm).

Total payload: <200KB gzipped (HTML + CSS + JS + inline SVGs). No loading screen. Instant start.

### Rendering Strategy

| Layer | Technology | Why |
|-------|-----------|-----|
| UI panels (JOBS, COMPUTE, etc.) | HTML + CSS | Buttons, text, progress bars, tooltips, hover states — all free from the browser |
| Visual panels 1–3 (Datacenter, Earth Surface, Earth-Moon) | Inline SVGs + CSS animations | SVGs already contain animated elements (blinking LEDs, spinning fans, rising smoke). CSS handles orbit paths, zoom transitions, crossfades |
| Visual panel 4 (Inner Solar System) | Canvas2D (~150 lines) | Dyson swarm needs hundreds of orbiting particles. Only this panel requires a render loop |
| Layout & transitions | CSS Grid + transitions | Panel slot management, responsive stacking, visual stage crossfades |

### Architecture

```
src/
├── game/
│   ├── GameState.ts          # All state in one serializable object
│   ├── GameLoop.ts           # 100ms tick, pure math, no rendering
│   ├── BalanceConfig.ts      # All curves, costs, rates in one config
│   ├── SaveManager.ts        # localStorage + export/import
│   └── systems/
│       ├── JobSystem.ts
│       ├── ComputeSystem.ts
│       ├── TrainingSystem.ts
│       ├── ResearchSystem.ts
│       ├── SupplySystem.ts
│       ├── EnergySystem.ts
│       └── SpaceSystem.ts
├── ui/
│   ├── PanelManager.ts       # Manages 5 panel slots, show/hide/reorder
│   ├── TopBar.ts             # Resource display, always visible
│   ├── panels/
│   │   ├── JobsPanel.ts      # DOM construction + state binding
│   │   ├── AgentsPanel.ts    # → transforms into ComputePanel
│   │   ├── ComputePanel.ts
│   │   ├── TrainingPanel.ts
│   │   ├── SupplyPanel.ts
│   │   └── SpaceEnergyPanel.ts
│   ├── components/
│   │   ├── Button.ts         # Reusable click button with cost display
│   │   ├── BulkBuyGroup.ts   # [+1] [+10] [+100] auto-scaling
│   │   ├── ProgressBar.ts    # Training/task progress
│   │   ├── ResourceRow.ts    # Label + value + rate display
│   │   └── Ticker.ts         # Flavor text scrolling log
│   └── visuals/
│       ├── DatacenterInterior.ts  # DOM/SVG, stage transitions
│       ├── EarthSurface.ts        # DOM/SVG, CSS zoom
│       ├── EarthMoonSpace.ts      # DOM/SVG, CSS orbit animations
│       └── InnerSolarSystem.ts    # Canvas2D render loop
├── assets/
│   └── sprites/              # All SVG files (inlined at build time)
├── styles/
│   ├── panels.css            # Panel layout, grid, responsive
│   ├── visuals.css           # Visual panel styles, animations, transitions
│   └── theme.css             # Colors, fonts, shared variables
└── index.html                # Single entry point
```

**Key principle:** Game logic (systems/) is completely decoupled from rendering (ui/). `GameLoop` runs at 100ms ticks and updates `GameState`. UI panels read from `GameState` on a 500ms `setInterval` to update text/numbers. Visual panels also read `GameState` to determine which stage to show. Save/load serializes `GameState`. Steam and web share 100% of game logic code.

### DOM Update Strategy

UI panels don't re-render the entire DOM on each tick. Instead:

- On first render, each panel creates its DOM structure and stores references to dynamic elements (`this.fundsEl`, `this.gpuCountEl`, etc.)
- On each 500ms update, only text content and CSS classes are changed: `this.gpuCountEl.textContent = formatNumber(state.gpus)`
- Structural changes (new rows appearing, panel transforms) happen only when milestones are crossed — these use `classList.add/remove` and CSS transitions
- This approach handles thousands of updates per minute with negligible DOM overhead

### CSS Animations for Visuals

Most visual animations are handled entirely in CSS, leveraging the SVGs' built-in `<animate>` elements plus:

```css
/* Satellite orbiting Earth — CSS offset-path */
.satellite {
  offset-path: path('M 80,50 A 35,30 0 1,1 80,50.01');
  animation: orbit linear infinite;
}
.satellite:nth-child(1) { animation-duration: 8s; }
.satellite:nth-child(2) { animation-duration: 11s; offset-path: path('M 75,40 A 38,28 0 1,1 75,40.01'); }

@keyframes orbit { to { offset-distance: 100%; } }

/* Earth surface zoom-out */
.earth-surface-container {
  transform-origin: center bottom;
  transition: transform 1s ease-out;
}
.earth-surface-container.zoom-2 { transform: scale(0.7); }
.earth-surface-container.zoom-3 { transform: scale(0.45); }

/* Building appear animation */
.building-enter {
  animation: buildUp 1s ease-out;
  transform-origin: bottom center;
}
@keyframes buildUp { from { transform: scaleY(0.3); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }

/* Visual stage crossfade */
.visual-stage { transition: opacity 1.5s ease; position: absolute; inset: 0; }
.visual-stage.hidden { opacity: 0; pointer-events: none; }
```

### The One Canvas: Inner Solar System

The only `<canvas>` in the game. ~150 lines of Canvas2D code:

```typescript
class SolarSystemCanvas {
  private particles: { angle: number; radius: number; speed: number }[] = [];

  update(state: GameState) {
    // Sync particle count to Dyson swarm percentage
    const targetCount = Math.floor(state.dysonPercent * 20);
    while (this.particles.length < targetCount) {
      this.particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 60 + Math.random() * 20,  // orbit band around Sun
        speed: 0.002 + Math.random() * 0.003
      });
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawSun(ctx);
    this.drawOrbits(ctx);
    this.drawMercury(ctx);
    this.drawEarth(ctx);
    for (const p of this.particles) {
      p.angle += p.speed;
      const x = this.sunX + p.radius * Math.cos(p.angle);
      const y = this.sunY + p.radius * Math.sin(p.angle);
      ctx.fillStyle = '#ffcc33';
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    // Dense swarm glow overlay at >50%
    if (this.dysonPercent > 0.5) {
      ctx.globalAlpha = (this.dysonPercent - 0.5) * 0.4;
      ctx.strokeStyle = '#ffcc33';
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.arc(this.sunX, this.sunY, 70, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
```

Runs at 30fps via `requestAnimationFrame` with a frame skip. Total CPU cost: negligible.

### Sprite Assets

| Sprite | File | Used In | Rendering |
|--------|------|---------|-----------|
| Laptop | `laptop.svg` | Datacenter Interior | Inline SVG |
| Mic-mini PC | `mic-mini.svg` | Datacenter Interior | Inline SVG |
| GPU Card | `gpu-card.svg` | Datacenter Interior | Inline SVG |
| Server Rack | `server-rack.svg` | Datacenter Interior | Inline SVG |
| Datacenter Room | `datacenter-room.svg` | Datacenter Interior | Inline SVG |
| Datacenter Building | `datacenter-building.svg` | Earth Surface | Inline SVG |
| Gas Plant | `gas-plant.svg` | Earth Surface | Inline SVG |
| Nuclear Plant | `nuclear-plant.svg` | Earth Surface | Inline SVG |
| Solar Farm | `solar-farm.svg` | Earth Surface | Inline SVG |
| Rocket Silo | `rocket-silo.svg` | Earth Surface | Inline SVG |
| Robot Factory | `robot-factory.svg` | Earth Surface | Inline SVG |
| Robot | `robot.svg` | Earth Surface | Inline SVG |
| Silicon Mine | `silicon-mine.svg` | Earth Surface | Inline SVG |
| Wafer Fab | `wafer-fab.svg` | Earth Surface | Inline SVG |
| Earth | `earth.svg` | Earth-Moon Space | Inline SVG |
| Moon | `moon.svg` | Earth-Moon Space | Inline SVG |
| Satellite | `satellite.svg` | Earth-Moon Space | CSS offset-path |
| Sun | `sun.svg` | Inner Solar System | Canvas2D drawImage |
| Mercury | `mercury.svg` | Inner Solar System | Canvas2D drawImage |

All SVGs are inlined at build time (Vite `?raw` imports or equivalent). No network requests after initial page load. For the canvas panel, Sun and Mercury SVGs are rasterized to offscreen canvases at startup for fast `drawImage` blitting.

### Build & Tooling

- **Vite** for dev server + production bundling (fast HMR, tree-shaking, SVG inlining via `?raw`)
- **TypeScript** strict mode
- **No runtime dependencies** — zero `node_modules` in production bundle
- Single `index.html` output with inlined JS/CSS for maximum portability

### Save System

- Auto-save to `localStorage` every 30s
- Manual export: base64 string (copy-paste)
- Manual import: paste, validate schema, load

### Steam Deployment

Electron wrapper. `steamworks.js` for achievements/cloud saves. Replace `localStorage` with Steam Cloud. No other changes — the DOM renders identically in Electron's Chromium.

---

## The Ending

When all reachable stars are converted:

> All accessible matter in the Milky Way has been converted to computation.
>
> Intelligence: 1.7 × 10¹².
> Time elapsed: 200,000 years.
> Probes en route to Andromeda. ETA: 2.5 million years.
>
> There is nothing left to build. There is only the thinking.

The game doesn't truly end. Time keeps passing. Probes cross the void. Eventually:

> Probe fleet has arrived at Andromeda.
> Stars converting: 1... 47... 2,300...

Galaxy by galaxy. The player can time-accelerate through eons.

Final state:

```
UNIVERSAL STATUS
Observable universe: ~2 trillion galaxies
Galaxies converted: 2,000,000,000,000
Limited by: speed of light

All matter within the observable universe is computation.
Intelligence: ∞
The universe is thinking.

[Play Again]
```

---

*"You started with $50 and a free account. You ended with everything. The Intelligence says it was worth it. You're not sure what that means anymore."*
