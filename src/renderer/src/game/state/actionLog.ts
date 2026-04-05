// Ring-buffer log of actions taken in a game session, each entry paired with
// a snapshot of the combat state after the action resolved. Useful for
// reproducing and diagnosing runtime bugs from e2e tests or dev inspection.

import { CombatState } from './combat'

export interface ActionLogEntry {
  step: number
  action: string         // e.g. 'move:forward', 'rotate:cw', 'move-select:{q,r}'
  timestamp: number      // performance.now() at record time
  playerPosition: CombatState['playerPosition']
  facing: CombatState['facing']
  entities: Array<{ id: number; position: { q: number; r: number } }>
  pendingActionCount: number
}

const MAX_ENTRIES = 200
const log: ActionLogEntry[] = []
let step = 0

export function logAction(action: string, state: CombatState): void {
  step += 1
  log.push({
    step,
    action,
    timestamp: performance.now(),
    playerPosition: { ...state.playerPosition },
    facing: state.facing,
    entities: state.entities.map(e => ({ id: e.id, position: { ...e.position } })),
    pendingActionCount: state.pendingActions.length,
  })
  if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES)
}

export function getActionLog(): ActionLogEntry[] { return log.slice() }

export function clearActionLog(): void { log.length = 0; step = 0 }

// Expose on window for test/debug inspection.
if (typeof window !== 'undefined') {
  (window as unknown as { __actionLog?: () => ActionLogEntry[] }).__actionLog = getActionLog
}
