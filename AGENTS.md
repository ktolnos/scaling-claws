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
│   ├── TopBar.ts            # Legacy resource header (currently hidden)
│   ├── WorkspaceLayout.ts   # 3-column workspace layout (left resources / center visual / right tabs)
│   ├── PanelManager.ts      # Tab/static-region panel manager
│   ├── panels/              # One file per game panel
│   ├── components/          # Reusable: Button, ProgressBar, BulkBuyGroup, etc.
│   └── visuals/             # 3 decorative visual panels
├── assets/sprites/          # SVG files (imported with ?raw)
├── assets/sprites.ts        # Barrel file for all SVG imports
└── styles/                  # theme.css, panels.css, visuals.css, dev-overlay.css
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
Full game spec is in `/DESIGN.md` (661 lines). Covers all 10 game phases, UI layouts, balance tables, visual panel specs, and implementation notes.

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
