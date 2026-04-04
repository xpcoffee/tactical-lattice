import { describe, it, expect } from 'vitest'
import { queueAction, advanceTicks, TICK_COSTS } from './atb'

describe('queueAction', () => {
  it('sets ticksRemaining to the action tick cost', () => {
    const action = queueAction({ unitId: 1, type: 'fire-heavy' })
    expect(action.ticksRemaining).toBe(TICK_COSTS['fire-heavy'])
  })

  it('preserves unitId and type', () => {
    const action = queueAction({ unitId: 42, type: 'move' })
    expect(action.unitId).toBe(42)
    expect(action.type).toBe('move')
  })
})

describe('advanceTicks', () => {
  it('completes an action when its tick cost is fully consumed', () => {
    const pending = [queueAction({ unitId: 1, type: 'move' })] // costs 1
    const { completed, remaining } = advanceTicks(pending, 1)
    expect(completed).toHaveLength(1)
    expect(remaining).toHaveLength(0)
  })

  it('keeps an action pending when ticks remain', () => {
    const pending = [queueAction({ unitId: 1, type: 'fire-heavy' })] // costs 3
    const { completed, remaining } = advanceTicks(pending, 1)
    expect(completed).toHaveLength(0)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].ticksRemaining).toBe(2)
  })

  it('correctly splits completed and remaining in a mixed queue', () => {
    const pending = [
      queueAction({ unitId: 1, type: 'move' }),       // costs 1 — completes
      queueAction({ unitId: 2, type: 'fire-heavy' }),  // costs 3 — still pending
    ]
    const { completed, remaining } = advanceTicks(pending, 1)
    expect(completed).toHaveLength(1)
    expect(completed[0].unitId).toBe(1)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].unitId).toBe(2)
  })

  it('completes a heavy action after enough ticks', () => {
    let pending = [queueAction({ unitId: 1, type: 'fire-heavy' })]
    const r1 = advanceTicks(pending, 1)
    const r2 = advanceTicks(r1.remaining, 1)
    const r3 = advanceTicks(r2.remaining, 1)
    expect(r3.completed).toHaveLength(1)
    expect(r3.remaining).toHaveLength(0)
  })
})
