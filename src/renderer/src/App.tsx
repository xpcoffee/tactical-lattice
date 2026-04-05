import { useRef, useState, useEffect } from 'react'
import PhaserGame, { type IRefPhaserGame } from './phaser/PhaserGame'
import { EventBus } from './phaser/EventBus'
import { rotateFacing, moveInDirection, getLatestState, setLatestState, COMBAT_STATE_CHANGED } from './game/state/combat'
import { logAction } from './game/state/actionLog'
import { GRID_COLS, GRID_ROWS } from './game/constants'
import Mech from './ui/Mech'
import Minimap from './ui/Minimap'
import ActionHUD from './ui/ActionHUD'

export type AppMode = 'idle' | 'map'

export default function App() {
  const phaserRef = useRef<IRefPhaserGame>(null)
  const [mode, setMode] = useState<AppMode>('idle')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        setMode(prev => prev === 'map' ? 'idle' : 'map')
        return
      }
      if (e.key === 'Escape' && mode === 'map') { setMode('idle'); return }

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

  return (
    <div className="app-layout">
      <div className={`panel-mech-status${mode === 'map' ? ' panel--hidden' : ''}`}>
        <Mech />
      </div>
      <div className={`panel-battlefield${mode === 'map' ? ' panel--hidden' : ''}`}>
        <PhaserGame ref={phaserRef} />
      </div>
      <div className={`panel-minimap${mode === 'map' ? ' panel-minimap--fullscreen' : ''}`}>
        <Minimap mode={mode} />
      </div>
      <ActionHUD mode={mode} onMapToggle={() => setMode(prev => prev === 'map' ? 'idle' : 'map')} />
    </div>
  )
}
