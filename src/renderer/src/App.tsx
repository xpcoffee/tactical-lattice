import { useRef, useState, useEffect, useCallback } from 'react'
import PhaserGame, { type IRefPhaserGame } from './phaser/PhaserGame'
import { EventBus } from './phaser/EventBus'
import { movePlayer, getLatestState, setLatestState, COMBAT_STATE_CHANGED } from './game/state/combat'
import { type HexCoord } from './game/hex/grid'
import Mech from './ui/Mech'
import Minimap from './ui/Minimap'
import ActionHUD from './ui/ActionHUD'

export default function App() {
  const phaserRef = useRef<IRefPhaserGame>(null)
  const [mode, setMode] = useState<'idle' | 'move-select'>('idle')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'm' || e.key === 'M') && mode === 'idle') setMode('move-select')
      if (e.key === 'Escape' && mode === 'move-select') setMode('idle')
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [mode])

  const handleMoveConfirm = useCallback((target: HexCoord) => {
    const newState = movePlayer(getLatestState(), target)
    setLatestState(newState)
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
