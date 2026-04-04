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

// The 6 direction deltas, indexed 0–5: E, NE, NW, W, SW, SE
export const DIRECTIONS: HexCoord[] = [
  { q:  1, r:  0 },  // 0 E
  { q:  1, r: -1 },  // 1 NE
  { q:  0, r: -1 },  // 2 NW
  { q: -1, r:  0 },  // 3 W
  { q: -1, r:  1 },  // 4 SW
  { q:  0, r:  1 },  // 5 SE
]

/** Returns the neighbor hex in a given facing direction (0–5). */
export function hexInDirection(h: HexCoord, facing: number): HexCoord {
  const d = DIRECTIONS[(facing + 6) % 6]
  return { q: h.q + d.q, r: h.r + d.r }
}

/**
 * Returns all in-bounds hexes within maxRange that fall in the 120° forward arc
 * centred on `facing`. Uses pixel-space dot product: dot ≥ 0.5 (cos 60°).
 */
export function hexesInCone(
  center: HexCoord,
  facing: number,
  maxRange: number,
  cols: number,
  rows: number,
): HexCoord[] {
  const fd = DIRECTIONS[(facing + 6) % 6]
  const fp = hexToPixel(fd, 1)
  const fm = Math.sqrt(fp.x * fp.x + fp.y * fp.y)
  const cp = hexToPixel(center, 1)
  const result: HexCoord[] = []

  for (let q = center.q - maxRange; q <= center.q + maxRange; q++) {
    for (let r = center.r - maxRange; r <= center.r + maxRange; r++) {
      const h: HexCoord = { q, r }
      if (!isInBounds(h, cols, rows)) continue
      const d = hexDistance(center, h)
      if (d < 1 || d > maxRange) continue
      const hp = hexToPixel(h, 1)
      const hx = hp.x - cp.x, hy = hp.y - cp.y
      const hm = Math.sqrt(hx * hx + hy * hy)
      const dot = (fp.x * hx + fp.y * hy) / (fm * hm)
      if (dot >= 0.5 - 1e-9) result.push(h)
    }
  }
  return result
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
