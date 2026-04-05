# Combat State & Tick Resolution

All game logic lives here as pure functions. Rendering subscribes to state
changes via the `EventBus` — no Phaser/React code imports from this module.

**Locations:**
- `src/renderer/src/game/state/combat.ts` — state + transitions
- `src/renderer/src/game/combat/atb.ts` — tick queue
- `src/renderer/src/game/mech/ai.ts` — AI step decisions

## State shape

```ts
interface CombatState {
  playerPosition: HexCoord
  facing: number                 // 0..5 index into DIRECTIONS
  entities: Entity[]
  pendingActions: PendingAction[] // ATB queue for NPC actions
}

interface Entity {
  id: number
  type: 'mech' | 'objective'
  label: string                  // single-char marker for sensor range
  position: HexCoord
  ai?: AiBehavior                // undefined = stationary
}

type AiBehavior = 'follow-player'  // room for 'patrol', 'attached', …
```

The latest state is cached via `setLatestState` / `getLatestState` so subscribers
that mount after the first emit can still bootstrap.

## Pure state transitions

All transitions are pure and return a new `CombatState`. App.tsx's keyboard
handler calls them and emits `COMBAT_STATE_CHANGED` with the result.

| Function | Tick cost | What it does |
|---|---|---|
| `rotateFacing(state, 'cw' \| 'ccw')` | 0 | Rotates player ±60°. **Free** (no AI tick). |
| `moveInDirection(state, forward, cols, rows)` | 1 | Steps 1 hex along facing (forward) or opposite (backward). |
| `strafeInDirection(state, dir, cols, rows)` | 1 | Steps 1 hex in an arbitrary direction, facing unchanged. |
| `movePlayer(state, target)` | `hexDistance` | Teleport-style move (currently unused after map-mode refactor). |

Each paid-tick transition funnels through `advanceWorld(state, ticks)` before
applying the new player position. Rotation is free so the player can turn to
scout without NPCs acting.

## `advanceWorld` (the tick resolver)

```
advanceWorld(state, ticks):
  1. For each entity with `ai` that has no pending action in state.pendingActions,
     call decideTarget(entity, state) — this uses state.playerPosition AT THIS
     MOMENT, i.e. the player's pre-move position ("last known location").
     Queue a 'move' PendingAction with the decided hex baked into payload.target.
  2. advanceTicks(queued, ticks) — decrement every pending action by `ticks`,
     partition into { completed, remaining }.
  3. applyCompletedActions(entities, completed) — apply each completed action
     to the entity list.
  4. Return { ...state, entities, pendingActions: remaining }.
```

**Critical ordering** inside callers: `advanceWorld` is invoked *before* the new
player position is assigned, so AI decisions observe the OLD player hex.
Example (`moveInDirection`):

```ts
const advanced = advanceWorld(state, 1)
return { ...advanced, playerPosition: target }
```

This implements the "enemies can't read the player's next move" rule. Future
behaviours (`'attached'`) can override this by computing their move inside
`applyCompletedActions` using current state rather than the baked target.

## ATB queue (`combat/atb.ts`)

```ts
type ActionType = 'move' | 'fire-light' | 'fire-heavy' | 'drone-ability'
const TICK_COSTS: Record<ActionType, number> = { move: 1, 'fire-light': 1, 'fire-heavy': 3, 'drone-ability': 1 }

interface PendingAction extends Action { ticksRemaining: number }
interface MoveActionPayload { target: HexCoord }
```

- `queueAction(a: Action)` → `PendingAction` with `ticksRemaining = TICK_COSTS[a.type]`.
- `advanceTicks(pending, ticks)` decrements all and splits into completed/remaining.

Actions currently only reach the queue via AI; player actions resolve inline.
Multi-tick NPC actions (e.g. heavy fire) are supported by the queue but not
yet produced by any behaviour.

## AI step decisions (`mech/ai.ts`)

```ts
followStep(from, target, cols, rows): HexCoord | null
```

Greedy one-step: pick the neighbour of `from` that strictly reduces
`hexDistance` to `target`. Returns `null` when already adjacent/co-located or
no neighbour improves — the caller then skips queuing an action for that
entity this tick. This keeps the queue from growing stale.

`decideTarget(entity, state)` dispatches on `entity.ai`:
- `'follow-player'` → `followStep(entity.position, state.playerPosition, …)`
- default / unknown → `null` (stationary).

## Visibility classification

```ts
getVisibleEntities(state, viewRange, sensorRange, cols, rows): VisibleEntity[]
```

For each entity, returns `{ ...entity, distance, isVisible, isSensor }`:
- `distance === 0` → always `isVisible = true` (co-located with player).
- otherwise `isVisible` iff `inCone && distance ≤ viewRange`.
- otherwise `isSensor` iff `inCone && viewRange < distance ≤ sensorRange`.

Cone membership is checked via `hexesInCone` (see [hex-grid.md](hex-grid.md)).

## Entities may share a hex

Player movement no longer blocks on entity-occupied hexes. `getMoveTargets`
likewise ignores entity occupation. Rendering handles stacking (see
[main-view.md](main-view.md)).

## Extending

- New AI behaviour: add a variant to `AiBehavior`, extend `decideTarget`.
- New action type: add to `ActionType` + `TICK_COSTS`, teach
  `applyCompletedActions` how to apply it.
- New player action: add a pure transition in `combat.ts` that calls
  `advanceWorld` with the tick cost, then App.tsx dispatches it.
