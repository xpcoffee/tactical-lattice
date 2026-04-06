import { useState, useEffect } from 'react'
import type { AppScene } from './app/scenes'
import { parseDevFlags } from './app/devFlags'
import type { MechBuild } from './game/mech/components'
import { DEV_DEFAULT_BUILD } from './game/mech/library.dev'
import MainMenu from './scenes/MainMenu'
import Hangar from './scenes/Hangar'
import Combat from './scenes/Combat'

const flags = parseDevFlags()

export default function App() {
  const [scene, setScene] = useState<AppScene>(flags.startScene)
  const [playerBuild, setPlayerBuild] = useState<MechBuild>(DEV_DEFAULT_BUILD)

  useEffect(() => {
    window.api.loadBuilds().then(builds => {
      if (builds.length > 0) setPlayerBuild(builds[builds.length - 1])
    })
  }, [])

  function handleLaunch(build: MechBuild) {
    setPlayerBuild(build)
    setScene('combat')
  }

  return (
    <div className="app-layout">
      {scene === 'main-menu' && (
        <MainMenu devMode={flags.devMode} onNavigate={setScene} />
      )}
      {scene === 'hangar' && (
        <Hangar devMode={flags.devMode} onLaunch={handleLaunch} onNavigate={setScene} />
      )}
      {scene === 'combat' && (
        <Combat playerBuild={playerBuild} onNavigate={setScene} />
      )}
    </div>
  )
}
