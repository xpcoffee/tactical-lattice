// Combat state — pure TypeScript, no engine dependencies.
// Phaser scenes and React components read from this module; rendering stays in their respective layers.

import { HexCoord, hexDistance, isInBounds, hexInDirection, hexesInCone } from '../hex/grid'
import { PendingAction, advanceTicks, queueAction, MoveActionPayload } from '../combat/atb'
import { AiBehavior, followStep } from '../mech/ai'
import { GRID_COLS, GRID_ROWS } from '../constants'

export type EntityType = 'mech' | 'objective'

export interface Entity {
  id: number
  type: EntityType
  label: string   // single character shown in far-range targetbox
  position: HexCoord
  ai?: AiBehavior   // undefined = stationary
}

export interface CombatState {
  playerPosition: HexCoord
  facing: number               // 0–5, index into DIRECTIONS (E, NE, NW, W, SW, SE)
  entities: Entity[]
  pendingActions: PendingAction[]  // ATB queue for all non-player units
}

export const COMBAT_STATE_CHANGED = 'combat-state-changed'

// Store the last emitted state for subscribers that initialize after emission
let latestState: CombatState | null = null

/** Returns the most recent combat state, or creates initial state if none has been set. */
export function getLatestState(): CombatState {
  if (latestState) return latestState
  return createInitialCombatState()
}

/** Store the latest state when it's emitted (called by Combat scene or App). */
export function setLatestState(state: CombatState): void {
  latestState = state
}

/** Returns a hardcoded initial state for development. Player at grid centre; four sample entities. */
export function createInitialCombatState(): CombatState {
  return {
    playerPosition: { q: 7, r: 4 },
    facing: 0,
    entities: [
      { id: 1, type: 'mech',      label: 'M', position: { q: 9,  r: 4 }, ai: 'follow-player' },
      { id: 2, type: 'mech',      label: 'M', position: { q: 3,  r: 2 }, ai: 'follow-player' },
      { id: 3, type: 'objective', label: 'O', position: { q: 7,  r: 9 } },
      { id: 4, type: 'mech',      label: 'E', position: { q: 12, r: 6 }, ai: 'follow-player' },
    ],
    pendingActions: [],
  }
}

/** Attaches the hex distance from each entity to the player onto each entity record. */
export function getEntitiesWithDistance(
  state: CombatState,
): Array<Entity & { distance: number }> {
  return state.entities.map(e => ({
    ...e,
    distance: hexDistance(e.position, state.playerPosition),
  }))
}

/** Returns all valid move targets within `range` hexes of the player — in-bounds. */
export function getMoveTargets(
  playerPos: HexCoord,
  _entities: Entity[],
  range: number,
  cols: number,
  rows: number,
): HexCoord[] {
  const targets: HexCoord[] = []
  for (let q = playerPos.q - range; q <= playerPos.q + range; q++) {
    for (let r = playerPos.r - range; r <= playerPos.r + range; r++) {
      const h: HexCoord = { q, r }
      const dist = hexDistance(playerPos, h)
      if (dist > 0 && dist <= range && isInBounds(h, cols, rows)) {
        targets.push(h)
      }
    }
  }
  return targets
}

/** Moves the player to `target`, advancing the world by the movement tick cost. Pure. */
export function movePlayer(state: CombatState, target: HexCoord): CombatState {
  const ticks = hexDistance(state.playerPosition, target)
  // AI decisions use the PRE-move player position (last known location).
  const advanced = advanceWorld(state, ticks)
  return { ...advanced, playerPosition: target }
}

/** Rotates the mech facing CW or CCW by one direction step. No tick cost. Pure. */
export function rotateFacing(state: CombatState, dir: 'cw' | 'ccw'): CombatState {
  const delta = dir === 'cw' ? -1 : 1
  return { ...state, facing: ((state.facing + delta) + 6) % 6 }
}

/**
 * Moves the mech one hex forward (facing direction) or backward (opposite).
 * Costs 1 tick. Returns unchanged state if blocked by boundary. Pure.
 * Entities no longer block the player — multiple units may share a hex.
 */
export function moveInDirection(
  state: CombatState,
  forward: boolean,
  cols: number,
  rows: number,
): CombatState {
  const dir = forward ? state.facing : (state.facing + 3) % 6
  const target = hexInDirection(state.playerPosition, dir)
  if (!isInBounds(target, cols, rows)) return state
  // AI decisions use the PRE-move player position (last known location).
  const advanced = advanceWorld(state, 1)
  return { ...advanced, playerPosition: target }
}

/**
 * Advances the world by `ticks`: queues AI decisions for entities that lack a
 * pending action (locking in the player's position *at decision time*), then
 * advances all pending actions and applies any that complete.
 */
export function advanceWorld(state: CombatState, ticks: number): CombatState {
  const queued: PendingAction[] = [...state.pendingActions]
  const queuedIds = new Set(queued.map(a => a.unitId))

  for (const e of state.entities) {
    if (!e.ai || queuedIds.has(e.id)) continue
    const target = decideTarget(e, state)
    if (!target) continue
    queued.push(queueAction({
      unitId: e.id,
      type: 'move',
      payload: { target } satisfies MoveActionPayload,
    }))
  }

  const { completed, remaining } = advanceTicks(queued, ticks)
  const entities = applyCompletedActions(state.entities, completed)
  return { ...state, entities, pendingActions: remaining }
}

/** Picks the next-step hex for an AI entity based on current state. Pure. */
function decideTarget(entity: Entity, state: CombatState): HexCoord | null {
  switch (entity.ai) {
    case 'follow-player':
      return followStep(entity.position, state.playerPosition, GRID_COLS, GRID_ROWS)
    default:
      return null
  }
}

/** Returns a new entities array with positions updated for each completed move action. */
function applyCompletedActions(entities: Entity[], completed: PendingAction[]): Entity[] {
  if (!completed.length) return entities
  const moves = new Map<number, HexCoord>()
  for (const a of completed) {
    if (a.type !== 'move') continue
    const payload = a.payload as MoveActionPayload | undefined
    if (payload?.target) moves.set(a.unitId, payload.target)
  }
  if (!moves.size) return entities
  return entities.map(e => moves.has(e.id) ? { ...e, position: moves.get(e.id)! } : e)
}

export interface VisibleEntity extends Entity {
  distance: number
  isVisible: boolean  // in cone and distance ≤ viewRange
  isSensor: boolean   // in cone and viewRange < distance ≤ sensorRange
}

/** Classifies all entities by visibility: full view, sensor-only, or not visible. */
export function getVisibleEntities(
  state: CombatState,
  viewRange: number,
  sensorRange: number,
  cols: number,
  rows: number,
): VisibleEntity[] {
  const cone = hexesInCone(state.playerPosition, state.facing, sensorRange, cols, rows)
  const coneSet = new Set(cone.map(h => `${h.q}-${h.r}`))
  return state.entities.map(e => {
    const distance = hexDistance(e.position, state.playerPosition)
    // Co-located entities are always visible (they're standing on the player's hex).
    if (distance === 0) {
      return { ...e, distance, isVisible: true, isSensor: false }
    }
    const inCone = coneSet.has(`${e.position.q}-${e.position.r}`)
    return {
      ...e,
      distance,
      isVisible: inCone && distance <= viewRange,
      isSensor:  inCone && distance > viewRange && distance <= sensorRange,
    }
  })
}
