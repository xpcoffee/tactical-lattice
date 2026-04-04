import { forwardRef, useLayoutEffect, useRef } from 'react'
import Phaser from 'phaser'
import { Boot } from './scenes/Boot'
import { Preloader } from './scenes/Preloader'
import { Combat } from './scenes/Combat'
import { EventBus } from './EventBus'

export interface IRefPhaserGame {
  game: Phaser.Game | null
  scene: Phaser.Scene | null
}

interface Props {
  onSceneReady?: (scene: Phaser.Scene) => void
}

const PhaserGame = forwardRef<IRefPhaserGame, Props>(function PhaserGame(
  { onSceneReady },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  useLayoutEffect(() => {
    if (gameRef.current || !containerRef.current) return

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: '100%',
      height: '100%',
      pixelArt: true,
      backgroundColor: '#12121f',
      scene: [Boot, Preloader, Combat],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    })

    if (ref && typeof ref === 'object') {
      ref.current = { game: gameRef.current, scene: null }
    }

    EventBus.on('scene-ready', (scene: Phaser.Scene) => {
      if (ref && typeof ref === 'object' && ref.current) {
        ref.current.scene = scene
      }
      onSceneReady?.(scene)
    })

    return () => {
      EventBus.removeAllListeners()
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
})

export default PhaserGame
