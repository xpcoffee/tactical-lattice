import { describe, it, expect } from 'vitest'
import { hexDistance, hexNeighbors, isInBounds, hexToPixel, pixelToHex } from './grid'

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
