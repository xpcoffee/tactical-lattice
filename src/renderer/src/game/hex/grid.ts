// Hex grid utilities using axial coordinates (q, r).
// No engine dependencies — fully testable in Node.
//
// Axial system: q is the column axis, r is the row axis.
// The third implicit axis s = -q - r.

export interface HexCoord {
  q: number
  r: number
}

/** Hex distance between two axial coordinates. */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  return (
    Math.abs(a.q - b.q) +
    Math.abs(a.q + a.r - b.q - b.r) +
    Math.abs(a.r - b.r)
  ) / 2
}

/** The six neighboring hexes of a given hex. */
export function hexNeighbors(h: HexCoord): HexCoord[] {
  return [
    { q: h.q + 1, r: h.r },
    { q: h.q + 1, r: h.r - 1 },
    { q: h.q,     r: h.r - 1 },
    { q: h.q - 1, r: h.r },
    { q: h.q - 1, r: h.r + 1 },
    { q: h.q,     r: h.r + 1 },
  ]
}

/** Check if a hex is within a rectangular grid of given width and height (in hex units). */
export function isInBounds(h: HexCoord, cols: number, rows: number): boolean {
  return h.q >= 0 && h.q < cols && h.r >= 0 && h.r < rows
}

/** Convert axial hex coordinates to flat-top pixel center. */
export function hexToPixel(h: HexCoord, hexSize: number): { x: number; y: number } {
  return {
    x: hexSize * (3 / 2) * h.q,
    y: hexSize * (Math.sqrt(3) / 2 * h.q + Math.sqrt(3) * h.r),
  }
}

/** Convert pixel coordinates back to the nearest hex (flat-top). */
export function pixelToHex(x: number, y: number, hexSize: number): HexCoord {
  const q = (2 / 3 * x) / hexSize
  const r = (-1 / 3 * x + (Math.sqrt(3) / 3) * y) / hexSize
  return hexRound(q, r)
}

function hexRound(q: number, r: number): HexCoord {
  const s = -q - r
  let rq = Math.round(q)
  let rr = Math.round(r)
  const rs = Math.round(s)
  const qDiff = Math.abs(rq - q)
  const rDiff = Math.abs(rr - r)
  const sDiff = Math.abs(rs - s)
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs
  } else if (rDiff > sDiff) {
    rr = -rq - rs
  }
  return { q: rq, r: rr }
}
