# Minimap (Tactical Map)

Top-down player-centric map rendered via React + SVG. Always visible as a
top-right HUD, expanded to full-screen when the player enters **map mode**
(press `M`).

**Location:** `src/renderer/src/ui/Minimap.tsx`

## Layout

- Player sits at the SVG centre `(svgSize/2, svgSize/2)`.
- `svgSize = (SENSOR_RANGE + 1) · MINI_HEX_SIZE · 4` (enough for a radius of
  `SENSOR_RANGE = 5` hexes around the player, plus padding).
- `MINI_HEX_SIZE = 12` px.
- Only hexes within `hexDistance ≤ SENSOR_RANGE` of the player are rendered.

## Rotation — cone always points up

A `<g transform="rotate(rotateDeg, cx, cy)">` wraps the world content. The
rotation angle is chosen so the player's current `facing` direction ends up
pointing straight up in SVG space:

```ts
facingRotation(facing) =
  -90 - atan2(hexToPixel(DIRECTIONS[facing]).y, hexToPixel(DIRECTIONS[facing]).x)
```

The player dot and up-indicator arrow sit **outside** the rotating group, so
they stay fixed at the centre pointing up. The world rotates beneath the
player as they turn.

## Cone highlights

Two cone sets are computed from `hexesInCone` (see [hex-grid.md](hex-grid.md)):

- **Visual cone** (`VIEW_RANGE = 3`) → blue fill `rgba(74,122,255,0.18)`.
- **Sensor cone** (`SENSOR_RANGE = 5`, outside visual) → dim blue `rgba(42,74,106,0.12)`.
- Everything else → unfilled.

## Entity markers

Entities render as red `<text>X</text>` elements inside the rotating group,
positioned via `hexToPixel(rel, MINI_HEX_SIZE)` (relative to player).
Same-hex entities are bucketed and offset diagonally (`idx × 3` px X,
`idx × 2` px Y) so stacks don't overlap.

## Fullscreen (map mode)

When the parent `App` passes `mode === 'map'`:
- Minimap expands to 100vw / 100vh (via `.panel-minimap--fullscreen` CSS class
  applied on the wrapper in `App.tsx`).
- Header changes to "TACTICAL MAP — HJKL/ARROWS TO MOVE · [M] TO CLOSE".
- Movement keys still drive the mech (App.tsx's keyboard handler is always
  active); the map just rotates/repositions as state updates.
- The battlefield and mech panels are hidden via `.panel--hidden`.

The map is purely informational — it does not accept clicks for movement.

## Subscribing to state

```ts
const [combatState, setCombatState] = useState(() => getLatestState())
useEffect(() => {
  const handler = (s: CombatState) => setCombatState(s)
  EventBus.on(COMBAT_STATE_CHANGED, handler)
  return () => EventBus.off(COMBAT_STATE_CHANGED, handler)
}, [])
```

Rendering is driven entirely by `combatState`, so React re-renders on every
state change. There are no animations in the minimap — it snaps to the new
position immediately.

## Extending

- New overlay (e.g. fog of war): add a `<g>` layer inside the rotating group
  after the hexes.
- Entity type differentiation (mech vs objective) can be done via
  `entity.type` inside the marker loop.
