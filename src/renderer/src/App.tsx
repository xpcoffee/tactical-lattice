import { useRef } from 'react'
import PhaserGame, { type IRefPhaserGame } from './phaser/PhaserGame'
import MechStatus from './ui/MechStatus'
import Minimap from './ui/Minimap'

export default function App() {
  const phaserRef = useRef<IRefPhaserGame>(null)

  return (
    <div className="app-layout">
      <div className="panel-mech-status">
        <MechStatus />
      </div>
      <div className="panel-battlefield">
        <PhaserGame ref={phaserRef} />
      </div>
      <div className="panel-minimap">
        <Minimap />
      </div>
    </div>
  )
}
