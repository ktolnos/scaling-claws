# Scaling Claws — Implementation TODO

This list tracks features and subfeatures from [DESIGN.md](./DESIGN.md) that are not yet implemented or require further polish.

## Phase 8: Space (Milestone 5)
- [ ] **SpaceSystem.ts**: Core logic for space operations.
  - [ ] Launch metrics and costs (Space Rockets I-IV).
  - [ ] Satellite orbital mechanics (Space Systems I).
  - [ ] Lunar base operations (Space Systems II).
  - [ ] Mercury mining and mass driver (Space Systems III).
- [ ] **SpaceEnergyPanel.ts**: New UI panel merging Space and Energy mechanics.
  - [ ] Rocket launch button with satisfies visual feedback.
  - [ ] Satellite constellation tracking.
  - [ ] Lunar project management.
  - [ ] Mercury infrastructure building.
- [ ] **Visual Panels**:
  - [ ] `EarthSurface.ts`: Decorative view of facilities with CSS zoom transitions.
  - [ ] `EarthMoonSpace.ts`: Orbiting satellites and transfer paths using CSS offset-path.

## Phase 9-10: Dyson Swarm & Endgame (Milestone 6)
- [ ] **Dyson Swarm**:
  - [ ] Mercury auto-production of Dyson satellites.
  - [ ] Power capture logic scaling with swarm percentage.
  - [ ] `InnerSolarSystem.ts`: Canvas2D visual panel for the Dyson swarm particle simulation.
- [ ] **Endgame Mechanis**:
  - [ ] Von Neumann Probes research and launch.
  - [ ] Exponential spread logic across the galaxy/universe.
  - [ ] Galaxy pullback visual stage in the Solar System canvas.
- [ ] **End Screen**:
  - [ ] Final stats display (Total time, Total earned, Stars converted).
  - [ ] "Play Again" button (reset state).

## Polish & Quality of Life (Milestone 7)
- [ ] **Save Management**:
  - [ ] Export/Import save string UI (likely in a 'Settings' or 'Footer' area).
- [ ] **Offline Progress**:
  - [ ] Calculate resource accumulation (Funds, Code, Science) since the last tick on load.
- [ ] **Tooltip System**:
  - [ ] Detailed hover tooltips for all resources in TopBar.
  - [ ] Hover explanations for job requirements and research effects.
- [ ] **Flavor Text / Ticker**:
  - [ ] Implement the full library of contextual flavor texts from DESIGN.md (currently only a few placeholders exist).
- [ ] **UI/UX Refinements**:
  - [ ] **Responsive Design**: Audit and fix layout issues on smaller screens/mobile.

## Small Details & Bugs
- [ ] **Performance Audit**: Ensure DOM reconciliation is used in all dynamic lists (Research, Job rows) to prevent flickering and hover-loss.
- [ ] **Visual Polish**: Add micro-animations for building appearances and LED blinks in SVGs.
