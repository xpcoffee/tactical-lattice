// Combat state — pure TypeScript, no engine dependencies.
// Phaser scenes and React components read from this module; rendering stays in their respective layers.

import { HexCoord, hexDistance, isInBounds } from '../hex/grid'
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
    playerPosition: target,
    entities: state.entities,
    pendingActions: remaining,
  }
}
