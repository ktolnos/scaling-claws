# Scaling Claws — Project Conventions

## Overview
Incremental game: scale AI from a free subscription to a Dyson sphere. DOM + TypeScript, zero runtime deps, Vite build.

## Project Structure
```
scaling-claws/src/
├── game/                    # Pure logic, no DOM
│   ├── GameState.ts         # Single serializable state object
│   ├── GameLoop.ts          # 100ms tick, calls all systems
│   ├── BalanceConfig.ts     # All numeric constants
│   ├── SaveManager.ts       # localStorage + export/import
│   ├── utils.ts             # formatNumber, formatMoney, etc.
│   └── systems/             # Each system: tickX(state, dt) → mutates state
├── ui/                      # DOM rendering, reads GameState
│   ├── TopBar.ts            # Resource display header
│   ├── PanelManager.ts      # 5-slot panel layout manager
│   ├── panels/              # One file per game panel
│   ├── components/          # Reusable: Button, ProgressBar, BulkBuyGroup, etc.
│   └── visuals/             # 4 decorative visual panels
├── assets/sprites/          # SVG files (imported with ?raw)
├── assets/sprites.ts        # Barrel file for all SVG imports
└── styles/                  # theme.css, panels.css, visuals.css
```

## Architecture Rules
- **GameState** is the single source of truth. All game systems mutate it in place.
- **Game logic** (src/game/) is completely decoupled from rendering (src/ui/).
- **GameLoop** ticks at 100ms. UI reads state on a 500ms setInterval.
- **No runtime dependencies.** Zero node_modules in production.
- **Resource Scaling (BigInt):** All primary resources (funds, code, science, labor, counts) use `bigint` scaled by `SCALE` (1,000,000n). This supports 6 decimal places of precision while avoiding floating point errors.
  - Use `toBigInt(number)` for conversion, `fromBigInt(bigint)` for UI/floats.
  - Use `mulB(a, b)` and `divB(a, b)` for math between two scaled values.
  - Use `scaleB(a, number)` to scale a BigInt by a raw multiplier.
  - Use `scaleBigInt(literal_n)` for constants in `BalanceConfig.ts`.
  - Tick math: `resource += mulB(ratePerMin, toBigInt(dtMs)) / 60000n`.

## UI Panel Rules — No DOM Rebuild in `update()`
The UI refreshes every 500ms. Destroying and recreating DOM nodes inside `update()` kills CSS `:hover` / `:focus` state, causing buttons to flicker when the user interacts with them.

**DO:**
- Create all DOM elements once in `build()`. Store refs (e.g. `private fooBtn!: HTMLButtonElement`).
- In `update()`, mutate existing nodes: set `.textContent`, `.disabled`, `.style.display`, `.innerHTML` on leaf text elements only.
- For dynamic lists (research, bulk-buy tiers), use a **reconcile** pattern: keep a `Map<id, refs>`, add new rows, remove stale rows, update existing rows in place.
- For bulk-buy button groups where the tier amounts change, guard rebuilds with a `lastTiers` key — only call `innerHTML = ''` when tiers actually change, then update `.disabled` in place each tick.

**DON'T:**
- `section.innerHTML = ''` followed by `createElement` + `appendChild` inside `update()`.
- `appendChild(existingNode)` to reorder every tick (moves the node, resets hover).
- `cloneNode` + `replaceWith` on buttons every tick (use it sparingly, only when the click handler's *identity* truly changes, e.g. switching from fine-tune to Aries training).

## TypeScript Gotchas (tsconfig strict settings)
- `verbatimModuleSyntax: true` → use `import type { X }` for type-only imports
- `erasableSyntaxOnly: true` → NO `enum` keyword. Use `as const` objects + type unions instead.
- `noUnusedLocals` / `noUnusedParameters` → prefix unused params with `_`
- `strict: true` → all the usual strict checks apply

## SVG Notes
- All SVGs are drafts and may be revised during implementation
- Imported via Vite `?raw` (returns string), injected via `innerHTML`
- When multiple SVGs are inlined in the same page, watch for `<defs>` ID collisions — namespace IDs if needed
- SVGs already contain `<animate>` elements for LEDs, cursors, etc.

## Design Doc
Full game spec is in `/DESIGN.md` (938 lines). Covers all 10 game phases, UI layouts, balance tables, visual panel specs, and implementation notes.

## Build & Run
```bash
cd scaling-claws
npm run dev      # Vite dev server with HMR
npm run build    # TypeScript check + production bundle (use `source ~/.bashrc && cd ~/scaling-claws/scaling-claws/ && npx vite build` if typecheck missing)
npm run preview  # Preview production build
```

### Running From PowerShell Into WSL
If you are in Windows PowerShell and need Linux/WSL tooling (Node, npm, etc.), route commands through `wsl.exe`:

```powershell
wsl.exe bash -lc "cd /home/eop/scaling-claws/scaling-claws && npm run build"
```

Quick environment check from PowerShell:

```powershell
wsl.exe bash -lc "node -v && npm -v"
```

## Implementation Milestones

### Milestone 0: Scaffolding ✅
Deleted starter files, created directory structure, moved SVGs, configured Vite, created CLAUDE.md, index.html, sprite barrel file, CSS files.

### Milestone 1: Playable Phase 1–2 ✅
Core game loop, GameState, JobSystem, ComputeSystem, SaveManager. UI: TopBar, PanelManager, JobsPanel, AgentsPanel, DatacenterInterior (laptop + mic-mini stages), Ticker. Player can earn money, hire agents (one-time cost), nudge stuck agents, buy Mic-minis.

### Milestone 2: GPU Transition + Energy ✅
"Go Self-Hosted" button, GPU purchasing, DeepKick model upgrades, datacenter buying, engineer hiring. EnergySystem with grid/gas/nuclear/solar. ComputePanel, EnergyPanel. DatacenterInterior stages 3-5 (rack → datacenter → fullroom).

### Milestone 3: Training & Code ✅
TrainingSystem (fine-tune sequence, Aries models, training allocation, data purchasing). Software devs (human + AI), AI researchers. Code + Science resources. TrainingPanel with model display, progress bars, staff hiring. TopBar shows Code/Science when unlocked.

### Milestone: Job System & UI Refactor ✅
Refactored job assignments to be manual. Replaced recurring per-agent subscriptions with **One-Time Upfront Payments** (managed in AgentsPanel). Implemented **upfront cost** for both hiring agents and tier upgrades. Redesigned **JobsPanel** with horizontal layout, mini 2x4 agent progress grids, Engineers now are a regular job with hiring rules (Robotics II).

### Milestone 4: Research + Supply Chain ✅
- ResearchSystem: `tickResearch()` computes bonuses (algo efficiency, GPU FLOPS, synth data), `purchaseResearch()` with prereq checks, `getAvailableResearch()`, `setSynthDataAllocation()`
- SupplySystem: `tickSupply()` auto-produces GPUs from fabs/litho + robots from factories, actions for buying litho/wafer/fabs/mines/factories/robots
- ComputeSystem extended: `gpuFlopsBonus` applied to PFLOPS calc, subscription selling (demand/growth/churn/income/reserved PFLOPS), supply chain engineer requirements, `setSubscriberPrice()`, `buyAds()`
- TrainingSystem: `algoEfficiencyBonus` applied to fine-tune + Aries training progress
- SupplyPanel: GPU Production (litho, wafers, output rate), Facilities (fabs, mines), Robotics (factories, robot count)
- TrainingPanel: Research section with available/completed research, synth data controls
- ComputePanel: Subscription selling section (subscribers, price, demand, ads, reserved PFLOPS)
- GameLoop: tickResearch + tickSupply wired in correct order
- main.ts: SupplyPanel registered on `supplyChainUnlocked` milestone (save-load + mid-game)

Manager job added: agents assigned to 'manager' auto-nudge stuck agents (6 nudges/min each, never get stuck). Unlocks at 3+ agents. Manager² removed.

### Milestone 5: Space ✅
- SpaceSystem: `tickSpace()` with orbital power, lunar mass driver auto-satellites, mercury mining. Actions: buildRocket, launchSatellite, buildLunarBase, sendRobotsToMoon, sendGPUsToMoon, buyLunarSolarPanel, buildMercuryBase, sendRobotsToMercury
- Separate energy grids: Earth (unchanged), Moon (lunarGPUs draw from lunarSolarPanels), Orbital (self-sufficient, display only). `totalEnergyMW` for TopBar
- SpaceEnergyPanel: merged Space+Energy UI replacing EnergyPanel on spaceRockets1 research. Earth Energy + Space + Lunar + Mercury sections with progressive unlock
- EnergySystem extended: lunar power grid (demand/supply/throttle), orbital power, total energy computation
- ResearchSystem: launch cost bonus from spaceRockets2, space flavor texts
- TopBar: total energy display with hover breakdown (Earth/Lunar/Orbital)
- EarthSurface visual: DOM/SVG buildings with CSS zoom transitions
- EarthMoonSpace visual: DOM/CSS satellite orbits, Moon, lunar base dots, mass driver streaks
- `formatMW()` extracted to shared utils

### Milestone: BigInt Refactor ✅
Full conversion of all numerical resources and counts to scaled `bigint`. Removed manual scaling literals and synchronized system math across Compute, Supply, Space, and Job systems. Updated `formatNumber` to handle BigInts by default.

### Milestone 6: Dyson Swarm + Endgame 🔲
Mercury satellite production, Dyson power, Von Neumann exponential spread. InnerSolarSystem canvas visual. EndScreen with stats and Play Again.

### Milestone 7: Polish 🔲
Save export/import UI, offline progress, full flavor text library, hover tooltips, responsive CSS, animation polish, performance optimization. Target <200KB gzipped.
