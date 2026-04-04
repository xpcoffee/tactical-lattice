# Game Engine Selection: Phaser 3

**Date:** 2026-04-04  
**Status:** Accepted

---

## Context

Tactical Lattice is an Electron desktop game with two main loops: a mech hangar (build/inventory/tech-tree) and tactical combat missions (time-tick simultaneous resolution, hex grid, pixelated isometric sprites). See `GAMEPLAY.md` for the full design.

Before committing to an engine, we evaluated several options against the following hard requirements:

1. **Testability / CI simulation** — Game logic (ATB tick resolution, hex combat, balance formulas) must be driveable programmatically without a renderer. Automated balance testing needs to run in CI without a GPU or browser.
2. **Electron compatibility** — Must run in an Electron desktop app without significant integration work.
3. **Pixelated isometric rendering** — Must support nearest-neighbour pixel art and isometric sprite layering.
4. **Extensibility** — Adding new component types, enemy types, and mission types must not require touching core engine internals.
5. **UI capability** — Must support a crisp split-panel HUD (mech status, battlefield view, minimap) with animated idle states.

---

## Options Considered

### Phaser 3 + React UI overlay + bitECS
- Largest JS game engine ecosystem (~38k GitHub stars, 50k+ weekly npm downloads)
- Battle-tested Electron deployment — commercial games ship on Steam via Electron wrappers
- `pixelArt: true` config flag + Aseprite spritesheet import; isometric support via community plugin
- Official Phaser 3 + React TypeScript template (released Feb 2024) for HUD panel layout
- Headless renderer (`Phaser.HEADLESS`) available; cleaner CI pattern is to extract all logic into pure TS modules (no Phaser dependency) and test those with Vitest in Node
- bitECS (also used internally by Phaser 4) provides clean component/system separation for extensibility

### Excalibur.js + React UI overlay
- TypeScript-native from the ground up
- Strongest isometric + pixel art out-of-the-box (`IsometricMap`, `IsometricEntitySystem`, native Aseprite plugin)
- Official Electron template maintained by core team
- Pre-v1: breaking changes between minor versions; headless Node execution not yet shipped (in roadmap for v1)
- Smaller ecosystem (~2k stars); fewer community answers and third-party plugins

### PixiJS v8 + React + rot.js
- Production-hardened WebGL renderer, highly customizable
- No headless mode — CI logic tests require headless Chrome with WebGL; not cleanly testable in Node
- No built-in scene management, audio, or input — more architecture work required upfront

### Godot 4 (web export + Electron)
- Excellent pixel art, UI, and CI testing via GdUnit4
- Electron path requires embedding a Godot web export inside Electron (Godot-in-Chromium-in-Electron)
- Logic not testable from Node; requires GdScript or C# rather than TypeScript

### Custom HTML/TypeScript (no engine)
- Best testability and UI flexibility
- Would require building isometric rendering, sprite animation, hex grid, and input handling from scratch — high upfront cost for solved problems

---

## Decision

**Phaser 3**, with the following architectural constraints:

### Architecture

```
┌─────────────────────────────────────────┐
│  Pure TypeScript modules (no engine)    │
│  - ATB tick resolution                  │
│  - Hex grid / pathfinding               │
│  - Combat formulas / balance logic      │
│  - Component stat calculations          │
│  Tested with Vitest in Node — no DOM    │
└───────────────┬─────────────────────────┘
                │ called by
┌───────────────▼─────────────────────────┐
│  Phaser 3 (renderer + input only)       │
│  - Sprite rendering, animation          │
│  - Input events → dispatched to logic   │
├─────────────────────────────────────────┤
│  React DOM overlay                      │
│  - Mech status panel (bottom-left)      │
│  - Minimap (top-right)                  │
└─────────────────────────────────────────┘
```

Phaser is the **renderer only** — it never owns game state or logic. All ATB resolution, hex combat, component physics (inertia/thrust/energy), and balance calculations live in pure TypeScript modules. This separation is what makes headless CI simulation viable.

### Key tooling
- **Phaser 3** (latest stable) — rendering, sprite animation, input
- **bitECS** — component/system model for unit and ability extensibility
- **React** — HUD panel overlay (official Phaser + React TS template as the starting point)
- **Vitest** — tests game logic modules in Node with no DOM dependency

---

## Consequences

- Game logic modules must never import from Phaser. Enforced via ESLint import rules.
- New unit types, weapon types, and mission types are added as ECS component bundles and systems — no changes to rendering or core loop code.
- The Phaser canvas occupies the battlefield view; React renders the flanking panels. Communication between them goes through a shared game state store (e.g. Zustand or a simple event bus).
- Phaser 4 (currently in late beta) uses bitECS internally and may eventually simplify the migration path if we want to upgrade.
