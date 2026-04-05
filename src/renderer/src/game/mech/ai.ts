// Entity AI behaviours. Pure functions — no engine or state dependencies.

import { HexCoord, hexDistance, hexNeighbors, isInBounds } from '../hex/grid'

export type AiBehavior = 'follow-player'  // room for 'attached', 'patrol', etc.

/**
 * Greedy one-step decision: pick the neighbor that minimises distance to target.
 * Returns null if already adjacent/co-located or no neighbor improves the distance.
 */
export function followStep(
  from: HexCoord,
  target: HexCoord,
  cols: number,
  rows: number,
): HexCoord | null {
  const currentDist = hexDistance(from, target)
  if (currentDist <= 1) return null

  let best: HexCoord | null = null
  let bestDist = currentDist
  for (const n of hexNeighbors(from)) {
    if (!isInBounds(n, cols, rows)) continue
    const d = hexDistance(n, target)
    if (d < bestDist) { bestDist = d; best = n }
  }
  return best
}
