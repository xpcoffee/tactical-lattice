import type { AppScene } from './scenes'

export interface DevFlags {
  startScene: AppScene
  mechId?: string
  mapId?: string
  devMode: boolean
}

const VALID_SCENES: AppScene[] = ['main-menu', 'hangar', 'combat']

export function parseDevFlags(): DevFlags {
  const params = new URLSearchParams(window.location.search)

  const rawScene = params.get('scene')
  const startScene: AppScene =
    rawScene && VALID_SCENES.includes(rawScene as AppScene)
      ? (rawScene as AppScene)
      : 'main-menu'

  return {
    startScene,
    mechId: params.get('mech') ?? undefined,
    mapId: params.get('map') ?? undefined,
    devMode: import.meta.env.DEV || params.has('dev'),
  }
}
