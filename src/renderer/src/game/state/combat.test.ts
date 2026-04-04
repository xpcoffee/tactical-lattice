import { describe, it, expect } from 'vitest'
import { createInitialCombatState, getEntitiesWithDistance, Entity, CombatState } from './combat'

describe('createInitialCombatState', () => {
  it('returns a valid structure', () => {
    const state = createInitialCombatState()
    expect(state.playerPosition).toEqual({ q: 5, r: 4 })
    expect(state.entities.length).toBeGreaterThan(0)
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
    }
    const [result] = getEntitiesWithDistance(state)
    expect(result.distance).toBe(0)
  })

  it('computes correct distance for a known position', () => {
    const state: CombatState = {
      playerPosition: player,
      entities: [{ id: 1, type: 'mech', label: 'M', position: { q: 3, r: 0 } }],
    }
    const [result] = getEntitiesWithDistance(state)
    expect(result.distance).toBe(3)
  })

  it('all distances are non-negative', () => {
    const state = createInitialCombatState()
    const results = getEntitiesWithDistance(state)
    for (const r of results) {
      expect(r.distance).toBeGreaterThanOrEqual(0)
    }
  })

  it('preserves entity fields', () => {
    const entity: Entity = { id: 42, type: 'objective', label: 'O', position: { q: 1, r: 1 } }
    const state: CombatState = { playerPosition: player, entities: [entity] }
    const [result] = getEntitiesWithDistance(state)
    expect(result.id).toBe(42)
    expect(result.type).toBe('objective')
    expect(result.label).toBe('O')
  })
})
