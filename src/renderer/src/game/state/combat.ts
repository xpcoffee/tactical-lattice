// Combat state — pure TypeScript, no engine dependencies.
// Phaser scenes and React components read from this module; rendering stays in their respective layers.

import { HexCoord, hexDistance, isInBounds, hexInDirection, hexesInCone } from '../hex/grid'
import { PendingAction, advanceTicks } from '../combat/atb'

export type EntityType = 'mech' | 'objective'

export interface Entity {
  id: number
  type: EntityType
  label: string   // single character shown in far-range targetbox
  position: HexCoord
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
      { id: 1, type: 'mech',      label: 'M', position: { q: 9,  r: 4 } }, // distance 2 → close range
      { id: 2, type: 'mech',      label: 'M', position: { q: 3,  r: 2 } }, // distance ~6 → far range
      { id: 3, type: 'objective', label: 'O', position: { q: 7,  r: 9 } }, // distance 5 → far range
      { id: 4, type: 'mech',      label: 'E', position: { q: 12, r: 6 } }, // distance ~7 → far range
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

/** Returns all valid move targets within `range` hexes of the player — in-bounds and unoccupied. */
export function getMoveTargets(
  playerPos: HexCoord,
  entities: Entity[],
  range: number,
  cols: number,
  rows: number,
): HexCoord[] {
  const occupied = new Set(entities.map(e => `${e.position.q}-${e.position.r}`))
  const targets: HexCoord[] = []

  for (let q = playerPos.q - range; q <= playerPos.q + range; q++) {
    for (let r = playerPos.r - range; r <= playerPos.r + range; r++) {
      const h: HexCoord = { q, r }
      const dist = hexDistance(playerPos, h)
      if (dist > 0 && dist <= range && isInBounds(h, cols, rows) && !occupied.has(`${q}-${r}`)) {
        targets.push(h)
      }
    }
  }

  return targets
}

/** Moves the player to `target`, advancing entity pending actions by the movement tick cost. Pure. */
export function movePlayer(state: CombatState, target: HexCoord): CombatState {
  const ticks = hexDistance(state.playerPosition, target)
  const { remaining } = advanceTicks(state.pendingActions, ticks)
  return {
    ...state,
    playerPosition: target,
    pendingActions: remaining,
  }
}

/** Rotates the mech facing CW or CCW by one direction step. No tick cost. Pure. */
export function rotateFacing(state: CombatState, dir: 'cw' | 'ccw'): CombatState {
  const delta = dir === 'cw' ? -1 : 1
  return { ...state, facing: ((state.facing + delta) + 6) % 6 }
}

/**
 * Moves the mech one hex forward (facing direction) or backward (opposite).
 * Costs 1 tick. Returns unchanged state if blocked by boundary or entity. Pure.
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
  const occupied = new Set(state.entities.map(e => `${e.position.q}-${e.position.r}`))
  if (occupied.has(`${target.q}-${target.r}`)) return state
  const { remaining } = advanceTicks(state.pendingActions, 1)
  return { ...state, playerPosition: target, pendingActions: remaining }
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
    const inCone = coneSet.has(`${e.position.q}-${e.position.r}`)
    return {
      ...e,
      distance,
      isVisible: inCone && distance <= viewRange,
      isSensor:  inCone && distance > viewRange && distance <= sensorRange,
    }
  })
}
