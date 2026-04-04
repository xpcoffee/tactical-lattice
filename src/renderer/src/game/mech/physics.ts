// Pure physics attribute calculations for mech components.
// No engine dependencies — fully testable in Node.

export interface PhysicsAttributes {
  /** Constant weight. Accumulates across all installed components. Higher = slower movement. */
  inertia: number
  /** Movement power. Can be modified per tick (e.g. weapon recoil applies for 1 tick). */
  thrust: number
  /** Energy generation (+) or consumption (−). Net across all components must be >= 0 to operate. */
  energy: number
}

export function sumAttributes(components: PhysicsAttributes[]): PhysicsAttributes {
  return components.reduce(
    (acc, c) => ({
      inertia: acc.inertia + c.inertia,
      thrust: acc.thrust + c.thrust,
      energy: acc.energy + c.energy,
    }),
    { inertia: 0, thrust: 0, energy: 0 }
  )
}

/** Number of time ticks required to move 1 hex, given total inertia and available thrust. */
export function movementTickCost(inertia: number, thrust: number): number {
  if (thrust <= 0) return Infinity
  return Math.max(1, Math.ceil(inertia / thrust))
}

/** A mech configuration is only operable if net energy >= 0. */
export function isViable(attrs: PhysicsAttributes): boolean {
  return attrs.energy >= 0
}
