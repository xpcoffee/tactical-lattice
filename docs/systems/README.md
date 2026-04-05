# Game Systems

One document per subsystem. Each describes the data shapes, entry points,
file locations, invariants, and how to extend the system.

| System | File | What it covers |
|---|---|---|
| Hex grid | [hex-grid.md](hex-grid.md) | Axial coord system, distance, neighbours, cone, pixel conversion |
| Combat state & ticks | [combat-state.md](combat-state.md) | `CombatState`, pure state transitions, ATB queue, AI follow behaviour |
| Main view | [main-view.md](main-view.md) | Phaser `Combat` scene: perspective camera, grid fade, entity sprites & target boxes, movement/rotation/glide animations |
| Minimap | [minimap.md](minimap.md) | React/SVG tactical map, cone highlights, entity markers |
| Input & modes | [input-and-modes.md](input-and-modes.md) | Keybinds, `idle`/`map` modes, action log |

## Code layout

```
src/renderer/src/
├── App.tsx                 — top-level React component, keyboard handler, mode state
├── ui/                     — React panels: Mech, Minimap, ActionHUD
├── game/
│   ├── constants.ts        — grid size, ranges
│   ├── hex/grid.ts         — hex primitives
│   ├── combat/atb.ts       — tick queue types + resolver
│   ├── mech/ai.ts          — entity AI step decisions
│   └── state/
│       ├── combat.ts       — CombatState + pure transitions
│       └── actionLog.ts    — in-memory debug log
└── phaser/
    ├── PhaserGame.tsx      — Phaser.Game bootstrap inside React
    ├── EventBus.ts         — renderer ↔ Phaser bridge
    └── scenes/Combat.ts    — main 3rd-person perspective view
```

Game logic is fully separated from rendering: everything under `game/` is pure
TypeScript with no Phaser or React dependencies, so it's unit-testable with
vitest.
