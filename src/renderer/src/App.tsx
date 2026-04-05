import { useRef, useState, useEffect, useCallback } from 'react'
import PhaserGame, { type IRefPhaserGame } from './phaser/PhaserGame'
import { EventBus } from './phaser/EventBus'
import { movePlayer, rotateFacing, moveInDirection, getLatestState, setLatestState, COMBAT_STATE_CHANGED } from './game/state/combat'
import { logAction } from './game/state/actionLog'
import { type HexCoord } from './game/hex/grid'
import { GRID_COLS, GRID_ROWS } from './game/constants'
import Mech from './ui/Mech'
import Minimap from './ui/Minimap'
import ActionHUD from './ui/ActionHUD'

export default function App() {
  const phaserRef = useRef<IRefPhaserGame>(null)
  const [mode, setMode] = useState<'idle' | 'move-select'>('idle')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'm' || e.key === 'M') && mode === 'idle') { setMode('move-select'); return }
      if (e.key === 'Escape' && mode === 'move-select') { setMode('idle'); return }
      if (mode !== 'idle') return

      const state = getLatestState()
      let newState = state

      let action = ''
      if      (e.key === 'h' || e.key === 'H' || e.key === 'ArrowLeft')  { newState = rotateFacing(state, 'ccw');                            action = 'rotate:ccw' }
      else if (e.key === 'l' || e.key === 'L' || e.key === 'ArrowRight') { newState = rotateFacing(state, 'cw');                             action = 'rotate:cw' }
      else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp')    { newState = moveInDirection(state, true, GRID_COLS, GRID_ROWS);   action = 'move:forward' }
      else if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown')  { newState = moveInDirection(state, false, GRID_COLS, GRID_ROWS);  action = 'move:backward' }
      else return

      e.preventDefault()
      if (newState !== state) {
        setLatestState(newState)
        logAction(action, newState)
        EventBus.emit(COMBAT_STATE_CHANGED, newState)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [mode])

  const handleMoveConfirm = useCallback((target: HexCoord) => {
    const newState = movePlayer(getLatestState(), target)
    setLatestState(newState)
    logAction(`move-select:${target.q},${target.r}`, newState)
    EventBus.emit(COMBAT_STATE_CHANGED, newState)
    setMode('idle')
  }, [])

  return (
    <div className="app-layout">
      <div className={`panel-mech-status${mode === 'move-select' ? ' panel--hidden' : ''}`}>
        <Mech />
      </div>
      <div className={`panel-battlefield${mode === 'move-select' ? ' panel--hidden' : ''}`}>
        <PhaserGame ref={phaserRef} />
      </div>
      <div className={`panel-minimap${mode === 'move-select' ? ' panel-minimap--fullscreen' : ''}`}>
        <Minimap mode={mode} onMoveConfirm={handleMoveConfirm} />
      </div>
      <ActionHUD mode={mode} onMovePress={() => setMode('move-select')} />
    </div>
  )
}
