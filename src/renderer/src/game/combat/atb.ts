// Time-tick simultaneous resolution system.
//
// All units act simultaneously. Each action has a tick cost. When the player
// issues an action, the world advances by that action's tick count — enemy
// actions execute across those ticks — then pauses for the next decision.

export type ActionType = 'move' | 'fire-light' | 'fire-heavy' | 'drone-ability'

export const TICK_COSTS: Record<ActionType, number> = {
  'move': 1,
  'fire-light': 1,
  'fire-heavy': 3,
  'drone-ability': 1,
}

export interface Action {
  unitId: number
  type: ActionType
  payload?: unknown
}

export interface PendingAction extends Action {
  ticksRemaining: number
}

export function queueAction(action: Action): PendingAction {
  return { ...action, ticksRemaining: TICK_COSTS[action.type] }
}

/**
 * Advance all pending actions by `ticks`.
 * Returns actions that completed (ticksRemaining <= 0) and those still pending.
 */
export function advanceTicks(
  pending: PendingAction[],
  ticks: number
): { completed: PendingAction[]; remaining: PendingAction[] } {
  const updated = pending.map(a => ({ ...a, ticksRemaining: a.ticksRemaining - ticks }))
  return {
    completed: updated.filter(a => a.ticksRemaining <= 0),
    remaining: updated.filter(a => a.ticksRemaining > 0),
  }
}
