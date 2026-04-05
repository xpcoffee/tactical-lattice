# Input & App Modes

Global keyboard handling + the app-level mode state live at the top of
`App.tsx`. The Phaser scene does NOT read keyboard input itself; every
action goes through React.

**Locations:**
- `src/renderer/src/App.tsx` — keyboard handler, mode state, state dispatch
- `src/renderer/src/game/state/actionLog.ts` — in-memory action log

## App modes

```ts
type AppMode = 'idle' | 'map'
```

- **idle** — main 3rd-person combat view. Mech panel + Phaser battlefield
  + mini tactical map (top-right) + HUD bar.
- **map** — fullscreen tactical map. Battlefield + mech panel hidden. Keyboard
  still drives the mech; entities and the player dot update live on the map.

Mode is toggled with `M`; `Escape` also closes the map. All movement keys
work in both modes.

## Keybinds

All listed keys support lowercase, uppercase, and arrow-key aliases where
applicable. Modifier detection uses `e.shiftKey` / `e.ctrlKey` (plus `e.key`
case for the shifted letter).

| Input | Action | Ticks | Log tag |
|---|---|---|---|
| `H` / `ArrowLeft` | Rotate CCW (face +1) | 0 | `rotate:ccw` |
| `L` / `ArrowRight` | Rotate CW (face −1) | 0 | `rotate:cw` |
| `K` / `ArrowUp` | Step forward along facing | 1 | `move:forward` |
| `J` / `ArrowDown` | Step backward (opposite facing) | 1 | `move:backward` |
| `Shift`+`H` | Strafe — facing stays, step to `(facing+1)%6` | 1 | `strafe:h-fwd` |
| `Shift`+`L` | Strafe — facing stays, step to `(facing+5)%6` | 1 | `strafe:l-fwd` |
| `Ctrl`+`H` | Strafe — facing stays, step to `(facing+2)%6` | 1 | `strafe:h-back` |
| `Ctrl`+`L` | Strafe — facing stays, step to `(facing+4)%6` | 1 | `strafe:l-back` |
| `M` | Toggle map mode | 0 | not logged (no state change) |
| `Escape` | Close map mode (when open) | 0 | not logged |

Rotation is free (no tick cost, no AI movement). Every translation step costs
1 tick, which runs `advanceWorld` — so NPC AI fires exactly when the player
translates, not when they rotate.

## Dispatch flow

```ts
const state = getLatestState()
let newState = state
// … compute action from key + modifiers, produce newState …
if (newState !== state) {
  setLatestState(newState)
  logAction(action, newState)
  EventBus.emit(COMBAT_STATE_CHANGED, newState)
}
```

- `getLatestState()` returns the cached state (or `createInitialCombatState()`
  on first call).
- `setLatestState(newState)` updates the cache so fresh subscribers see the
  current world.
- `COMBAT_STATE_CHANGED` wakes both the Phaser scene and the Minimap React
  component.

The handler is attached to `document` via `addEventListener('keydown', …)`
in a `useEffect`; modifier-bearing keys have their branches checked before
plain-key branches so `Shift+L` doesn't accidentally trigger the CW rotation.

## Action log

```ts
// src/renderer/src/game/state/actionLog.ts
logAction(action: string, state: CombatState): void
getActionLog(): ActionLogEntry[]
clearActionLog(): void
window.__actionLog  // () => ActionLogEntry[] — test/devtools hook
```

Every committed state change is pushed to a 200-entry ring buffer:

```ts
interface ActionLogEntry {
  step: number          // monotonic counter
  action: string        // e.g. 'move:forward', 'strafe:h-back'
  timestamp: number     // performance.now()
  playerPosition: HexCoord
  facing: number
  entities: Array<{ id, position }>
  pendingActionCount: number
}
```

Exposed on `window.__actionLog` for test/debug inspection. Used by e2e specs
(`e2e/stability.spec.ts`, `e2e/camera.spec.ts`) and can be inspected from
DevTools console.

## Extending

- New keybind: add a branch in the keyboard handler, calling a pure transition
  from `state/combat.ts`. Log it with a descriptive action tag.
- New app mode: add the variant to `AppMode`, wire it into the CSS classes
  on the panel wrappers, and (optionally) gate some keybinds inside the handler.
