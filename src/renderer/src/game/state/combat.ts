// Combat state — pure TypeScript, no engine dependencies.
// Phaser scenes and React components read from this module; rendering stays in their respective layers.

import { HexCoord, hexDistance } from '../hex/grid'

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
}

export const COMBAT_STATE_CHANGED = 'combat-state-changed'

// Store the last emitted state for subscribers that initialize after emission
let latestState: CombatState | null = null

/** Returns the most recent combat state, or creates initial state if none has been set. */
export function getLatestState(): CombatState {
  if (latestState) return latestState
  return createInitialCombatState()
}

/** Store the latest state when it's emitted (called by Combat scene). */
export function setLatestState(state: CombatState): void {
  latestState = state
}

/** Returns a hardcoded initial state for development. Player at grid centre; three sample entities. */
export function createInitialCombatState(): CombatState {
  return {
    playerPosition: { q: 5, r: 4 },
    entities: [
      { id: 1, type: 'mech',      label: 'M', position: { q: 7, r: 4 } }, // distance 2 → close range
      { id: 2, type: 'mech',      label: 'M', position: { q: 2, r: 2 } }, // distance 5 → far range
      { id: 3, type: 'objective', label: 'O', position: { q: 5, r: 7 } }, // distance 3 → far range (boundary)
    ],
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
