import { describe, it, expect } from 'vitest'
import { sumAttributes, movementTickCost, isViable } from './physics'

describe('sumAttributes', () => {
  it('sums attributes across components', () => {
    const cannon = { inertia: 1, thrust: -5, energy: -5 }
    const engine = { inertia: 2, thrust: 10, energy: 5 }
    expect(sumAttributes([cannon, engine])).toEqual({ inertia: 3, thrust: 5, energy: 0 })
  })

  it('returns zero attributes for an empty build', () => {
    expect(sumAttributes([])).toEqual({ inertia: 0, thrust: 0, energy: 0 })
  })
})

describe('movementTickCost', () => {
  it('returns 1 for a light fast mech', () => {
    expect(movementTickCost(5, 10)).toBe(1)
  })

  it('returns higher cost for a heavy mech', () => {
    expect(movementTickCost(10, 3)).toBe(4)
  })

  it('returns Infinity when thrust is zero', () => {
    expect(movementTickCost(5, 0)).toBe(Infinity)
  })

  it('returns Infinity when thrust is negative (e.g. mid-recoil)', () => {
    expect(movementTickCost(5, -2)).toBe(Infinity)
  })
})

describe('isViable', () => {
  it('accepts a mech with net positive energy', () => {
    expect(isViable({ inertia: 1, thrust: 5, energy: 2 })).toBe(true)
  })

  it('accepts a mech with exactly zero net energy', () => {
    expect(isViable({ inertia: 1, thrust: 5, energy: 0 })).toBe(true)
  })

  it('rejects a mech drawing more energy than it generates', () => {
    expect(isViable({ inertia: 1, thrust: 5, energy: -1 })).toBe(false)
  })
})
