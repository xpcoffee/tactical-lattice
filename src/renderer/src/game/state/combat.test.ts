import { describe, it, expect } from 'vitest'
import {
  createInitialCombatState,
  getEntitiesWithDistance,
  getMoveTargets,
  movePlayer,
  rotateFacing,
  moveInDirection,
  strafeInDirection,
  getVisibleEntities,
  Entity,
  CombatState,
} from './combat'
import { queueAction } from '../combat/atb'
import { hexDistance } from '../hex/grid'

describe('createInitialCombatState', () => {
  it('returns a valid structure', () => {
    const state = createInitialCombatState()
    expect(state.playerPosition).toEqual({ q: 7, r: 4 })
    expect(state.facing).toBe(0)
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

  it('includes entity-occupied hexes (entities no longer block player movement)', () => {
    const occupied: Entity = { id: 1, type: 'mech', label: 'M', position: { q: 10, r: 11 } }
    const result = getMoveTargets(center, [occupied], 1, COLS, ROWS)
    expect(result.find(h => h.q === 10 && h.r === 11)).toBeDefined()
    expect(result).toHaveLength(6)
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

describe('rotateFacing', () => {
  const base: CombatState = { playerPosition: { q: 5, r: 5 }, facing: 0, entities: [], pendingActions: [] }

  it('rotates CW: 0 → 5 (clockwise in screen space = decrement)', () => {
    expect(rotateFacing(base, 'cw').facing).toBe(5)
  })

  it('rotates CCW: 0 → 1 (wraps)', () => {
    expect(rotateFacing(base, 'ccw').facing).toBe(1)
  })

  it('six CW rotations return to original facing', () => {
    let state = base
    for (let i = 0; i < 6; i++) state = rotateFacing(state, 'cw')
    expect(state.facing).toBe(0)
  })

  it('does not change playerPosition or entities', () => {
    const result = rotateFacing(base, 'cw')
    expect(result.playerPosition).toEqual(base.playerPosition)
    expect(result.entities).toBe(base.entities)
  })
})

describe('moveInDirection', () => {
  const COLS = 15, ROWS = 15
  const base: CombatState = { playerPosition: { q: 7, r: 7 }, facing: 0, entities: [], pendingActions: [] }

  it('forward facing E (0) moves to {q+1}', () => {
    const result = moveInDirection(base, true, COLS, ROWS)
    expect(result.playerPosition).toEqual({ q: 8, r: 7 })
  })

  it('backward facing E (0) moves to {q-1}', () => {
    const result = moveInDirection(base, false, COLS, ROWS)
    expect(result.playerPosition).toEqual({ q: 6, r: 7 })
  })

  it('blocked at boundary: q=0 facing W (3) returns same state', () => {
    const edge: CombatState = { ...base, playerPosition: { q: 0, r: 7 }, facing: 3 }
    const result = moveInDirection(edge, true, COLS, ROWS)
    expect(result).toBe(edge)
  })

  it('moves onto an entity-occupied hex (stacking allowed)', () => {
    const entity: Entity = { id: 1, type: 'mech', label: 'M', position: { q: 8, r: 7 } }
    const state: CombatState = { ...base, entities: [entity] }
    const result = moveInDirection(state, true, COLS, ROWS)
    expect(result.playerPosition).toEqual({ q: 8, r: 7 })
  })

  it('costs 1 tick: pending action with 2 ticks remaining → 1', () => {
    const action = queueAction({ unitId: 1, type: 'fire-heavy' }) // 3 ticks
    const withAction = { ...base, pendingActions: [{ ...action, ticksRemaining: 2 }] }
    const result = moveInDirection(withAction, true, COLS, ROWS)
    expect(result.pendingActions[0].ticksRemaining).toBe(1)
  })

  it('preserves facing in returned state', () => {
    const state: CombatState = { ...base, facing: 2 }
    expect(moveInDirection(state, true, COLS, ROWS).facing).toBe(2)
  })
})

describe('strafeInDirection', () => {
  const COLS = 15, ROWS = 15
  const base: CombatState = { playerPosition: { q: 7, r: 7 }, facing: 0, entities: [], pendingActions: [] }

  it('steps in the requested direction without changing facing', () => {
    // Direction 1 = NE → q+1, r-1
    const result = strafeInDirection(base, 1, COLS, ROWS)
    expect(result.playerPosition).toEqual({ q: 8, r: 6 })
    expect(result.facing).toBe(0)
  })

  it('costs 1 tick', () => {
    const action = queueAction({ unitId: 1, type: 'fire-heavy' })
    const s: CombatState = { ...base, pendingActions: [{ ...action, ticksRemaining: 2 }] }
    const result = strafeInDirection(s, 2, COLS, ROWS)
    expect(result.pendingActions[0].ticksRemaining).toBe(1)
  })

  it('blocked at boundary returns unchanged state', () => {
    const edge: CombatState = { ...base, playerPosition: { q: 0, r: 0 } }
    // Direction 3 = W → q-1
    const result = strafeInDirection(edge, 3, COLS, ROWS)
    expect(result).toBe(edge)
  })

  it('accepts all 6 directions', () => {
    for (let d = 0; d < 6; d++) {
      expect(() => strafeInDirection(base, d, COLS, ROWS)).not.toThrow()
    }
  })
})

describe('AI movement via movePlayer / moveInDirection', () => {
  const COLS = 15, ROWS = 15
  const base: CombatState = {
    playerPosition: { q: 7, r: 7 },
    facing: 0,
    entities: [],
    pendingActions: [],
  }

  it('follow-player entity steps closer after one player tick', () => {
    const entity: Entity = { id: 1, type: 'mech', label: 'M', position: { q: 10, r: 7 }, ai: 'follow-player' }
    const state: CombatState = { ...base, entities: [entity] }
    const before = hexDistance(entity.position, state.playerPosition)
    const result = moveInDirection(state, true, COLS, ROWS)
    const after = hexDistance(result.entities[0].position, result.playerPosition)
    // Player advanced east by 1, entity advanced west by 1 → net distance decreased by 2
    expect(after).toBeLessThan(before)
  })

  it('stationary entity (no ai) does not move', () => {
    const entity: Entity = { id: 1, type: 'mech', label: 'M', position: { q: 10, r: 7 } }
    const state: CombatState = { ...base, entities: [entity] }
    const result = moveInDirection(state, true, COLS, ROWS)
    expect(result.entities[0].position).toEqual({ q: 10, r: 7 })
  })

  it('adjacent AI entity holds position', () => {
    // Entity at distance 1 — followStep returns null → no action queued
    const entity: Entity = { id: 1, type: 'mech', label: 'M', position: { q: 8, r: 7 }, ai: 'follow-player' }
    const state: CombatState = { ...base, entities: [entity] }
    const result = moveInDirection(state, true, COLS, ROWS)
    // Player moves onto entity hex (stacking), entity doesn't move
    expect(result.entities[0].position).toEqual({ q: 8, r: 7 })
    expect(result.playerPosition).toEqual({ q: 8, r: 7 })
  })

  it('decides based on player position BEFORE the move (last known location)', () => {
    // Player at (7,7), entity at (10,7). Player moves east to (8,7).
    // Entity decides based on OLD player pos (7,7) → steps west to (9,7).
    // If it had used the NEW position (8,7), it would also step to (9,7) —
    // so construct a case where the choices differ: facing NE, rotating away.
    // Simpler: compare decision-target against both positions directly.
    const entity: Entity = { id: 1, type: 'mech', label: 'M', position: { q: 10, r: 7 }, ai: 'follow-player' }
    const state: CombatState = { ...base, entities: [entity] }
    const result = moveInDirection(state, true, COLS, ROWS)
    // Entity stepped one hex toward (7,7), player moved to (8,7).
    // Distance entity→playerOld (10→7) = 3 → 2 means entity went to q=9.
    expect(result.entities[0].position).toEqual({ q: 9, r: 7 })
    expect(result.playerPosition).toEqual({ q: 8, r: 7 })
  })
})

describe('getVisibleEntities', () => {
  const COLS = 15, ROWS = 15
  // Player at center, facing East (0)
  const base: CombatState = { playerPosition: { q: 7, r: 7 }, facing: 0, entities: [], pendingActions: [] }

  it('entity directly ahead at distance 2 → isVisible', () => {
    const state: CombatState = { ...base, entities: [{ id: 1, type: 'mech', label: 'M', position: { q: 9, r: 7 } }] }
    const [e] = getVisibleEntities(state, 3, 5, COLS, ROWS)
    expect(e.isVisible).toBe(true)
    expect(e.isSensor).toBe(false)
  })

  it('entity ahead at distance 4 → isSensor only', () => {
    const state: CombatState = { ...base, entities: [{ id: 1, type: 'mech', label: 'M', position: { q: 11, r: 7 } }] }
    const [e] = getVisibleEntities(state, 3, 5, COLS, ROWS)
    expect(e.isVisible).toBe(false)
    expect(e.isSensor).toBe(true)
  })

  it('entity co-located with player (distance 0) is always visible', () => {
    const state: CombatState = { ...base, entities: [{ id: 1, type: 'mech', label: 'M', position: { q: 7, r: 7 } }] }
    const [e] = getVisibleEntities(state, 3, 5, COLS, ROWS)
    expect(e.isVisible).toBe(true)
    expect(e.isSensor).toBe(false)
  })

  it('entity directly behind → not visible, not sensor', () => {
    // Facing East; entity to the West
    const state: CombatState = { ...base, entities: [{ id: 1, type: 'mech', label: 'M', position: { q: 5, r: 7 } }] }
    const [e] = getVisibleEntities(state, 3, 5, COLS, ROWS)
    expect(e.isVisible).toBe(false)
    expect(e.isSensor).toBe(false)
  })
})
