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
npm run build    # TypeScript check + production bundle
npm run preview  # Preview production build
```

## Implementation Milestones

### Milestone 0: Scaffolding ✅
Deleted starter files, created directory structure, moved SVGs, configured Vite, created CLAUDE.md, index.html, sprite barrel file, CSS files.

### Milestone 1: Playable Phase 1–2 ✅
Core game loop, GameState, JobSystem, ComputeSystem, SaveManager. UI: TopBar, PanelManager, JobsPanel, AgentsPanel, DatacenterInterior (laptop + mic-mini stages), Ticker. Player can earn money, buy subs, nudge stuck agents, buy Mic-minis.

### Milestone 2: GPU Transition + Energy ✅
"Go Self-Hosted" button, GPU purchasing, DeepKick model upgrades, datacenter buying, engineer hiring. EnergySystem with grid/gas/nuclear/solar. ComputePanel, EnergyPanel. DatacenterInterior stages 3-5 (rack → datacenter → fullroom).

### Milestone 3: Training & Code ✅
TrainingSystem (fine-tune sequence, Aries models, training allocation, data purchasing). Software devs (human + AI), AI researchers. Code + Science resources. TrainingPanel with model display, progress bars, staff hiring. TopBar shows Code/Science when unlocked.

### Milestone 4: Research + Supply Chain 🔧 (IN PROGRESS)

**Done so far:**
- GameState extended: `completedResearch[]`, `synthDataUnlocked`, `synthDataRate`, `synthDataAllocPflops`, `algoEfficiencyBonus`, `gpuFlopsBonus`, `lithoMachines`, `waferFabs`, `siliconMines`, `robotFactories`, `robots`, `gpuProductionPerMin`, `waferBatches`, `subSellingUnlocked`, `subscriberCount`, `subscriberPrice`, `subscriberDemand`, `subscriberAwareness`, `subscriberReservedPflops`, `subscriberIncomePerMin`, `aiCoderCount`, milestones `supplyChainUnlocked` + `subSellingUnlocked`
- BalanceConfig extended: `ResearchId` type + `ResearchIds` const, `ResearchConfig` interface, full research tree (25 entries), AI Coder job type ($2K/120s/Intel 15), supply chain costs (litho, wafer, fab, mine, robot factory, robot), subscription selling config (price, PFLOPS/sub, ads, growth rate), synth data config
- All compiles clean with `npx tsc --noEmit`

**Remaining tasks:**

1. **Create `ResearchSystem.ts`** (`src/game/systems/`)
   - `tickResearch(state, dt)`: compute research bonuses from `completedResearch` (algo efficiency multiplier, GPU FLOPS bonus, solar bonus, synth data rate)
   - `purchaseResearch(state, id)`: spend Science, check prereqs, add to `completedResearch[]`, trigger milestone flags (e.g., `supplyChainUnlocked` on chipFab1)
   - Synth data tick: if `synthDataUnlocked`, allocate PFLOPS from freeCompute → produce TB/min, add to `trainingData`

2. **Create `SupplySystem.ts`** (`src/game/systems/`)
   - `tickSupply(state, dt)`: auto-produce GPUs from fabs (fabs × fabOutputPerMin × chipFab bonus), auto-produce robots from factories, consume wafer batches
   - Actions: `buyLithoMachine(state)`, `buyWaferBatch(state, amount)`, `buildFab(state)`, `buildSiliconMine(state)`, `buildRobotFactory(state)`, `buyRobot(state, amount)`
   - GPU auto-production should increase `state.gpuCount` (capped by capacity)

3. **Extend `ComputeSystem.ts`** for subscription selling
   - In `tickGpuEra()`: if `subSellingUnlocked`, compute `subscriberDemand` from awareness + price, grow `subscriberCount` toward demand, compute `subscriberReservedPflops` and `subscriberIncomePerMin`, add subscriber income to funds, subtract reserved PFLOPS from `freeCompute`
   - Actions: `setSubscriberPrice(state, price)`, `buyAds(state)`
   - Check sub selling unlock: Intel ≥ 8 + Code ≥ 200
   - Engineer requirements: add fab/mine/factory engineers to existing calc

4. **Extend `TrainingSystem.ts`**
   - Apply `algoEfficiencyBonus` to training progress (multiply pflopsHrs by bonus)
   - Apply `gpuFlopsBonus` to totalPflops computation (done in ComputeSystem)

5. **Create `SupplyPanel.ts`** (`src/ui/panels/`)
   - Shows when `milestones.supplyChainUnlocked` is true
   - Sections: GPU Production (litho machines, wafer buying, GPU output rate), Wafer Fabs, Silicon Mines, Robotics (robot factories, robot count, robot selling)

6. **Extend `TrainingPanel.ts`** with RESEARCH section
   - When `milestones.researchUnlocked`, show research section below training
   - List available research (prereqs met, not completed), show cost in Science
   - Show completed research list
   - Change header to "TRAINING & RESEARCH" when research is unlocked
   - Add synth data toggle/display when synthData1 is completed

7. **Extend `ComputePanel.ts`** with subscription selling section
   - When `subSellingUnlocked`: show subscriber count, price slider, demand, ad buying, reserved PFLOPS, subscriber income/min

8. **Wire into GameLoop** — add `tickResearch()` and `tickSupply()` calls
9. **Wire into main.ts** — register SupplyPanel when `supplyChainUnlocked`, handle mid-game unlocks
10. **Type check + build verification**

### Milestone 5: Space 🔲
SpaceSystem, SpaceEnergyPanel (merged Space+Energy). Rockets, satellites, lunar base, Mercury operations. EarthMoonSpace visual, EarthSurface visual.

### Milestone 6: Dyson Swarm + Endgame 🔲
Mercury satellite production, Dyson power, Von Neumann exponential spread. InnerSolarSystem canvas visual. EndScreen with stats and Play Again.

### Milestone 7: Polish 🔲
Save export/import UI, offline progress, full flavor text library, hover tooltips, responsive CSS, animation polish, performance optimization. Target <200KB gzipped.
