import { describe, it, expect } from 'vitest'
import { hexDistance, hexNeighbors, isInBounds, hexToPixel, pixelToHex, hexesInCone, hexInDirection, DIRECTIONS } from './grid'

describe('hexDistance', () => {
  it('returns 0 for the same hex', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0)
  })

  it('returns 1 for directly adjacent hexes', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1)
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 1 })).toBe(1)
    expect(hexDistance({ q: 0, r: 0 }, { q: -1, r: 1 })).toBe(1)
  })

  it('returns correct distance for non-adjacent hexes', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3)
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 2 })).toBe(4)
  })

  it('is symmetric', () => {
    const a = { q: 2, r: -1 }
    const b = { q: -1, r: 3 }
    expect(hexDistance(a, b)).toBe(hexDistance(b, a))
  })
})

describe('hexNeighbors', () => {
  it('returns exactly 6 neighbors', () => {
    expect(hexNeighbors({ q: 0, r: 0 })).toHaveLength(6)
  })

  it('all neighbors are exactly distance 1 from the origin', () => {
    const neighbors = hexNeighbors({ q: 0, r: 0 })
    neighbors.forEach(n => expect(hexDistance({ q: 0, r: 0 }, n)).toBe(1))
  })

  it('returns no duplicates', () => {
    const neighbors = hexNeighbors({ q: 0, r: 0 })
    const keys = neighbors.map(n => `${n.q},${n.r}`)
    expect(new Set(keys).size).toBe(6)
  })
})

describe('isInBounds', () => {
  it('accepts coordinates within the grid', () => {
    expect(isInBounds({ q: 0, r: 0 }, 10, 10)).toBe(true)
    expect(isInBounds({ q: 9, r: 9 }, 10, 10)).toBe(true)
    expect(isInBounds({ q: 5, r: 5 }, 10, 10)).toBe(true)
  })

  it('rejects coordinates outside the grid', () => {
    expect(isInBounds({ q: 10, r: 0 }, 10, 10)).toBe(false)
    expect(isInBounds({ q: 0, r: 10 }, 10, 10)).toBe(false)
    expect(isInBounds({ q: -1, r: 0 }, 10, 10)).toBe(false)
    expect(isInBounds({ q: 0, r: -1 }, 10, 10)).toBe(false)
  })
})

describe('hexInDirection', () => {
  it('returns the correct neighbor for each direction', () => {
    const origin = { q: 5, r: 5 }
    for (let i = 0; i < 6; i++) {
      const neighbor = hexInDirection(origin, i)
      expect(hexDistance(origin, neighbor)).toBe(1)
      expect(neighbor).toEqual({ q: origin.q + DIRECTIONS[i].q, r: origin.r + DIRECTIONS[i].r })
    }
  })

  it('wraps direction index correctly', () => {
    expect(hexInDirection({ q: 0, r: 0 }, 6)).toEqual(hexInDirection({ q: 0, r: 0 }, 0))
    expect(hexInDirection({ q: 0, r: 0 }, -1)).toEqual(hexInDirection({ q: 0, r: 0 }, 5))
  })
})

describe('hexesInCone', () => {
  const COLS = 20, ROWS = 20
  const center = { q: 10, r: 10 }

  it('facing East (0), range 1: exactly 3 hexes — E, NE, SE', () => {
    const cone = hexesInCone(center, 0, 1, COLS, ROWS)
    expect(cone).toHaveLength(3)
    expect(cone).toContainEqual({ q: 11, r: 10 })  // E
    expect(cone).toContainEqual({ q: 11, r:  9 })  // NE
    expect(cone).toContainEqual({ q: 10, r: 11 })  // SE
  })

  it('facing West (3), range 1: exactly 3 hexes — W, SW, NW', () => {
    const cone = hexesInCone(center, 3, 1, COLS, ROWS)
    expect(cone).toHaveLength(3)
    expect(cone).toContainEqual({ q:  9, r: 10 })  // W
    expect(cone).toContainEqual({ q:  9, r: 11 })  // SW
    expect(cone).toContainEqual({ q: 10, r:  9 })  // NW
  })

  it('direct neighbor opposite to facing is NOT in cone', () => {
    // Facing East — West neighbor should not appear
    const cone = hexesInCone(center, 0, 2, COLS, ROWS)
    expect(cone).not.toContainEqual({ q: 9, r: 10 })
  })

  it('range 2 returns more than 3 hexes', () => {
    const cone = hexesInCone(center, 0, 2, COLS, ROWS)
    expect(cone.length).toBeGreaterThan(3)
  })

  it('range 0 returns empty', () => {
    expect(hexesInCone(center, 0, 0, COLS, ROWS)).toHaveLength(0)
  })

  it('clips out-of-bounds hexes when player is near an edge', () => {
    const edge = { q: 0, r: 0 }
    // Facing West (3) — cone would include negative q hexes, all out of bounds
    const cone = hexesInCone(edge, 3, 3, COLS, ROWS)
    for (const h of cone) {
      expect(h.q).toBeGreaterThanOrEqual(0)
      expect(h.r).toBeGreaterThanOrEqual(0)
    }
  })

  it('all returned hexes are within maxRange', () => {
    const cone = hexesInCone(center, 0, 5, COLS, ROWS)
    for (const h of cone) {
      expect(hexDistance(center, h)).toBeLessThanOrEqual(5)
      expect(hexDistance(center, h)).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('hexToPixel / pixelToHex round-trip', () => {
  it('converts origin hex to pixel origin', () => {
    const { x, y } = hexToPixel({ q: 0, r: 0 }, 32)
    expect(x).toBe(0)
    expect(y).toBe(0)
  })

  it('round-trips a hex coord through pixel and back', () => {
    const original = { q: 3, r: 2 }
    const { x, y } = hexToPixel(original, 32)
    const result = pixelToHex(x, y, 32)
    expect(result).toEqual(original)
  })
})
