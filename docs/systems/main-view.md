# Main View (Combat Scene)

The Phaser scene renders the 3rd-person tactical view: a perspective-projected
hex grid, enemy mech sprites with targeting reticles, and the cone-of-vision
grid fades. Camera movement, rotation, and entity motion are all animated.

**Location:** `src/renderer/src/phaser/scenes/Combat.ts`

## Coordinate pipeline

Every world point goes through `worldToScreen(wx, wy)`:

```
1. angle = (state.facing - 2) · π/3 + animRot.offset
2. awx = wx + animOffset.wx
   awy = wy + animOffset.wy
3. rotate (awx, awy) by angle into camera-relative (rx, ry)
4. eyeDepth = PERSP_CAM_D - ry        (null if ≤ 0 → point is behind camera)
5. scale = PERSP_CAM_D / eyeDepth
6. screenX = horizonX + (playerAnchor.x - horizonX + rx · LATERAL_SCALE) · scale
   screenY = horizonY + (playerAnchor.y - horizonY) · scale
```

- `PERSP_CAM_D = 80` controls convergence speed.
- `LATERAL_SCALE = 3.5` spreads hexes across the full battlefield width.
- `(horizonX, horizonY) = (0.50, 0.40)` of canvas — the vanishing point.
- `(playerAnchor.x, playerAnchor.y) = (0.20, 0.88)` of canvas — where the
  player hex *always* projects, irrespective of move/rotate state.
- Facing `2` (NW in `DIRECTIONS`) is the one that points "up" in screen space
  naturally, hence the `- 2` offset in the angle formula.

The player is always at world origin: all entity positions are computed
relative to `state.playerPosition` before projection, so when the player
moves, the whole world shifts.

## Movement, rotation, and entity animations

### Player camera (`animOffset` + `animRot`)

```ts
private animOffset = { wx: 0, wy: 0 }     // world-space slide
private animRot    = { offset: 0 }        // radians added to facing angle
```

On `COMBAT_STATE_CHANGED` the handler (at the top of `create()`):

- Snapshots each entity's current rendered screen position.
- Swaps `this.state = newState`.
- If player moved: sets `animOffset = +delta` (so the view looks "behind" the
  new position) and tweens it back to `(0, 0)` over `MOVE_DURATION = 280 ms`
  with `Sine.easeInOut`. The whole grid + entities glide forward together.
- If facing changed: sets `animRot.offset` to the **shortest-arc** rotation
  angle and tweens to `0` over `ROTATE_DURATION = 220 ms`. The world rotates
  around the fixed mech.
- Updates hex fade animations (see below) and schedules per-entity screen
  glides (see below).

### Hex cone fade (`hexAnims`)

The visible grid is only the `VIEW_RANGE = 3` cone. As the player moves or
rotates, hexes enter/leave the cone:

- `scheduleConeTransition(oldPlayerPos, oldFacing)` diffs old vs new cones
  and records fade-in/out animations in `hexAnims: Map<hexKey, {alpha, target}>`.
- `advanceHexAlphas(dtSec)` runs every frame (driven by `update()`), stepping
  each alpha toward its target at `HEX_FADE_SPEED = 1 / 0.3` alpha/sec (~300 ms).
- `drawHexGrid` renders the steady cone at full alpha plus any fading hexes at
  their current alpha.

### Entity screen-space glide (`entityScreenTweens`)

When the state changes, every currently-rendered entity gets a **screen-space
lerp** from its captured pre-change position to the live target position:

```ts
entityScreenTweens: Map<id, { fromX, fromY, fromScale, fromDistance, alpha }>
```

- `scheduleEntityGlides` snapshots each entity's pre-state screen pos + scale
  + distance, then schedules an alpha tween 0→1 over `MOVE_DURATION`.
- `entityScreenPos(entity)` returns `lerp(from, liveTarget, alpha)` — the
  *target* is re-computed every frame, so entities settle at the correct
  position even while the camera's `animOffset` is also tweening.
- `paintEntity` interpolates scale (`fromScale → targetScale`) and distance
  (`fromDistance → entity.distance`) using the same alpha.

This single mechanism handles ground↔ground, ground↔companion-strip, and
strip↔ground transitions uniformly.

### `update()` redraw condition

```ts
if (isMoving || isRotating || hexStillAnimating || entitiesStillMoving) {
  drawHexGrid()
  if (… entity-affecting flag …) redrawEntityPositions()
}
```

When all tweens are idle the scene stops redrawing.

## Entity rendering

Persistent per-entity graphics objects are stored in
`entityRenders: Map<id, EntityRender>`:

```ts
interface EntityRender {
  gfx: Graphics                 // sensor/objective markers
  sprite?: Image                // visible mech sprite
  label?: Text                  // sensor-range single letter
  targetBox?: Graphics          // gold reticle around visible mechs
  nameLabel?: Text              // "UNIT-02" tag
  distLabel?: Text              // "4.5 KM" readout
  visibility: 'visible' | 'sensor'
}
```

### Sprite

- Visible mechs render with `enemy-mech` texture (loaded in `Preloader`).
- Origin `(0.5, 1)` — sprite bottom anchored at the projected hex centre.
- **Distance scaling** from `MECH_RATIO_BY_DIST`: 90% of player sprite size
  at distance 0, 10% at 1, 5% at 2, 2.5% at 3 (relative to the 320 px player
  sprite, native 80 px enemy bitmap).
- **Lift**: sprite is raised `SPRITE_LIFT_RATIO = 0.10` of its own height off
  the grid so it reads as standing over the hex.

### Stacking (same-hex entities)

`updateEntityStackInfo` buckets visible entities by hex key. Each bucket is
sorted by id for stable ordering. `entityStackInfo[id]` holds
`{ index, groupSize, onPlayerHex }`.

- **Ground hex, N entities**: each sprite gets a diagonal offset of
  `(i - (n-1)/2) × {STACK_DX, STACK_DY}` px around the hex centre.
- **Companion strip** (entity on player hex, `onPlayerHex = true`): rendered
  in a fixed screen-space row at `(0.55, 0.52)` of canvas, with alternating
  slots `0, +1, -1, +2, -2, …` × `COMPANION_STRIP_STEP = 180` px. Ignores
  world projection — stays attached to the mech through all camera tweens.

### Target box + unit tag + distance

Only drawn for visible mechs NOT on the player hex:
- Gold rectangle sized to the sprite (padded), drawn via `paintTargetBox`.
- `UNIT-XX` tag hovering at box's top-right.
- `X.X KM` distance readout below the name, with 1 decimal (`HEX_KM_PER_STEP = 1.5`).
- Distance is **animated**: during an active glide it's
  `lerp(glide.fromDistance, entity.distance, alpha)`.

Hidden (via `setVisible(false)`) when the entity is on the player hex or
switches to sensor-only.

### Fade-in / fade-out

- When an entity becomes visible/sensor for the first time, `syncEntityVisibility`
  creates all required display objects at `alpha: 0` and tweens them to 1 over
  `ENTITY_FADE_DURATION = 350 ms`.
- When an entity leaves visibility, its objects fade to 0 and are destroyed
  in `onComplete`. If the entity **re-enters** before the fade-out finishes,
  the in-flight tween is killed and the existing render is faded back to 1
  (prevents orphaned-render bugs — see `stability.spec.ts`).

## Subscribing to state

Scene wires its handler in `create()`:

```ts
EventBus.on(COMBAT_STATE_CHANGED, (newState) => { … })
```

The state is always read from `this.state`, which is kept in sync with each
event. `setLatestState` is called once at `create()` so other subscribers
(Minimap) can bootstrap.

## Invariants

- `animOffset`, `animRot.offset` are always `{0, 0}` / `0` when no tween runs.
- `entityRenders.has(id)` iff the entity currently has visible/sensor
  renderables (modulo an in-progress fade-out).
- `leavingEntities` is a proper subset of `entityRenders`'s key set.
- The companion strip is used **only** by visible mech entities with
  `info.onPlayerHex === true`.
- Graphics/Text/Image objects are only destroyed inside onComplete handlers
  or the scene shutdown path.

## Extending

- Adding a new entity type: extend `paintEntity`'s `useSprite` branch (or add
  a new branch), register asset preload in `Preloader`.
- Adding a new camera animation: add a `private animFoo` field, a tween in
  the `COMBAT_STATE_CHANGED` handler, and include its active flag in
  `update()`'s redraw condition.
- Tweaking sizes / screen anchors: all tuning values are the `const`s at the
  top of the file.
