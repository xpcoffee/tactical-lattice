import { describe, it, expect } from 'vitest'
import {
  createInitialCombatState,
  getEntitiesWithDistance,
  getMoveTargets,
  movePlayer,
  Entity,
  CombatState,
} from './combat'
import { queueAction } from '../combat/atb'

describe('createInitialCombatState', () => {
  it('returns a valid structure', () => {
    const state = createInitialCombatState()
    expect(state.playerPosition).toEqual({ q: 7, r: 4 })
    expect(state.entities.length).toBeGreaterThan(0)
    expect(state.pendingActions).toEqual([])
    for (const e of state.entities) {
      expect(typeof e.id).toBe('number')
      expect(typeof e.label).toBe('string')
      expect(e.label.length).toBe(1)
      expect(e.position).toHaveProperty('q')
      expect(e.position).toHaveProperty('r')
    }
  })
})

describe('getEntitiesWithDistance', () => {
  const player = { q: 0, r: 0 }

  it('returns distance 0 for entity at player position', () => {
    const state: CombatState = {
      playerPosition: player,
      entities: [{ id: 1, type: 'mech', label: 'M', position: { q: 0, r: 0 } }],
      pendingActions: [],
    }
    const [result] = getEntitiesWithDistance(state)
    expect(result.distance).toBe(0)
  })

  it('computes correct distance for a known position', () => {
    const state: CombatState = {
      playerPosition: player,
      entities: [{ id: 1, type: 'mech', label: 'M', position: { q: 3, r: 0 } }],
      pendingActions: [],
    }
    const [result] = getEntitiesWithDistance(state)
    expect(result.distance).toBe(3)
  })

  it('all distances are non-negative', () => {
    const state = createInitialCombatState()
    for (const r of getEntitiesWithDistance(state)) {
      expect(r.distance).toBeGreaterThanOrEqual(0)
    }
  })

  it('preserves entity fields', () => {
    const entity: Entity = { id: 42, type: 'objective', label: 'O', position: { q: 1, r: 1 } }
    const state: CombatState = { playerPosition: player, entities: [entity], pendingActions: [] }
    const [result] = getEntitiesWithDistance(state)
    expect(result.id).toBe(42)
    expect(result.type).toBe('objective')
    expect(result.label).toBe('O')
  })
})

describe('getMoveTargets', () => {
  const COLS = 20
  const ROWS = 20
  const center = { q: 10, r: 10 }

  it('returns empty array when range is 0', () => {
    expect(getMoveTargets(center, [], 0, COLS, ROWS)).toEqual([])
  })

  it('returns 6 hexes for range 1 in an open field', () => {
    const result = getMoveTargets(center, [], 1, COLS, ROWS)
    expect(result).toHaveLength(6)
  })

  it('excludes the player hex itself', () => {
    const result = getMoveTargets(center, [], 3, COLS, ROWS)
    expect(result.find(h => h.q === center.q && h.r === center.r)).toBeUndefined()
  })

  it('excludes out-of-bounds hexes when player is near the edge', () => {
    const edge = { q: 0, r: 0 }
    const result = getMoveTargets(edge, [], 3, COLS, ROWS)
    for (const h of result) {
      expect(h.q).toBeGreaterThanOrEqual(0)
      expect(h.r).toBeGreaterThanOrEqual(0)
    }
  })

  it('excludes hexes occupied by entities', () => {
    const occupied: Entity = { id: 1, type: 'mech', label: 'M', position: { q: 10, r: 11 } }
    const result = getMoveTargets(center, [occupied], 1, COLS, ROWS)
    expect(result.find(h => h.q === 10 && h.r === 11)).toBeUndefined()
    expect(result).toHaveLength(5)
  })

  it('returns at most 37 hexes for range 3', () => {
    const result = getMoveTargets(center, [], 3, COLS, ROWS)
    expect(result.length).toBeLessThanOrEqual(37)
    expect(result.length).toBeGreaterThan(0)
  })

  it('all returned hexes are within the specified range', () => {
    const result = getMoveTargets(center, [], 3, COLS, ROWS)
    for (const h of result) {
      const dist = Math.max(
        Math.abs(h.q - center.q),
        Math.abs(h.q + h.r - center.q - center.r),
        Math.abs(h.r - center.r),
      ) // hex distance via cube coords
      expect(dist).toBeLessThanOrEqual(3)
    }
  })
})

describe('movePlayer', () => {
  const baseState: CombatState = {
    playerPosition: { q: 7, r: 4 },
    entities: [],
    pendingActions: [],
  }

  it('returns new state with updated player position', () => {
    const result = movePlayer(baseState, { q: 8, r: 4 })
    expect(result.playerPosition).toEqual({ q: 8, r: 4 })
  })

  it('does not mutate the input state', () => {
    const original = { ...baseState, playerPosition: { q: 7, r: 4 } }
    movePlayer(original, { q: 9, r: 4 })
    expect(original.playerPosition).toEqual({ q: 7, r: 4 })
  })

  it('preserves entities', () => {
    const entity: Entity = { id: 1, type: 'mech', label: 'M', position: { q: 0, r: 0 } }
    const state: CombatState = { ...baseState, entities: [entity] }
    const result = movePlayer(state, { q: 8, r: 4 })
    expect(result.entities).toEqual([entity])
  })

  it('advances and drops completed pending actions', () => {
    const action = queueAction({ unitId: 99, type: 'move' }) // ticksRemaining = 1
    const state: CombatState = { ...baseState, pendingActions: [action] }
    // Move 1 hex costs 1 tick — action should complete and be dropped
    const result = movePlayer(state, { q: 8, r: 4 })
    expect(result.pendingActions).toHaveLength(0)
  })

  it('retains pending actions that survive the tick advance', () => {
    const action = queueAction({ unitId: 99, type: 'fire-heavy' }) // ticksRemaining = 3
    const state: CombatState = { ...baseState, pendingActions: [action] }
    // Move 1 hex costs 1 tick — fire-heavy has 3 remaining, so 2 remain after
    const result = movePlayer(state, { q: 8, r: 4 })
    expect(result.pendingActions).toHaveLength(1)
    expect(result.pendingActions[0].ticksRemaining).toBe(2)
  })
})
