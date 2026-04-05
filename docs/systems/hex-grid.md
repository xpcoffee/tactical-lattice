# Hex Grid

Axial-coordinate flat-top hex primitives used by every other system. Pure
TypeScript, no engine dependencies.

**Location:** `src/renderer/src/game/hex/grid.ts`

## Coordinates

```ts
interface HexCoord { q: number; r: number }
```

Axial `(q, r)` with implicit third axis `s = -q - r`. Grid bounds are
rectangular (`GRID_COLS × GRID_ROWS` from `src/renderer/src/game/constants.ts`,
currently `15 × 15`).

## Directions

```ts
DIRECTIONS: HexCoord[] = [
  { q:  1, r:  0 },  // 0 E
  { q:  1, r: -1 },  // 1 NE
  { q:  0, r: -1 },  // 2 NW
  { q: -1, r:  0 },  // 3 W
  { q: -1, r:  1 },  // 4 SW
  { q:  0, r:  1 },  // 5 SE
]
```

Direction indices 0–5 double as the player's **facing**. Rotating CCW adds 1,
rotating CW subtracts 1 (both mod 6).

## Primitives

| Function | Signature | Notes |
|---|---|---|
| `hexDistance(a, b)` | `(HexCoord, HexCoord) → number` | Cube-distance formula. |
| `hexNeighbors(h)` | `HexCoord → HexCoord[]` | Six adjacent hexes, ordered by `DIRECTIONS`. |
| `hexInDirection(h, facing)` | `(HexCoord, number) → HexCoord` | One step along `DIRECTIONS[facing % 6]`. |
| `isInBounds(h, cols, rows)` | `(HexCoord, number, number) → boolean` | Rectangular grid check. |
| `hexToPixel(h, hexSize)` | `(HexCoord, number) → {x, y}` | Flat-top projection. Used everywhere world-space positioning is needed. |
| `pixelToHex(x, y, hexSize)` | `(number, number, number) → HexCoord` | Round-trip with cube rounding. |
| `hexesInCone(center, facing, maxRange, cols, rows)` | See below | 120° forward arc within range. |

## `hexesInCone`

Returns all in-bounds hexes at distance `1..maxRange` that lie within the 120°
forward arc of `facing`, centred on `center`. The arc check uses a pixel-space
dot product against the facing direction vector, with threshold `cos 60° = 0.5`.

Used by:
- `Combat.ts` to draw the view cone (`VIEW_RANGE = 3`).
- `state/combat.ts::getVisibleEntities` to classify entities as visible vs sensor.
- `Minimap.tsx` to shade visual/sensor cones on the tactical map.

## Invariants

- All coordinates are integers.
- `hexToPixel` is deterministic and reversible via `pixelToHex`.
- `hexesInCone` excludes `center` (distance `< 1` is filtered out).

## Extending

To add a new coord helper (e.g. pathfinding), keep it pure (no Phaser/React)
so unit tests in `grid.test.ts` and `combat.test.ts` stay fast.
