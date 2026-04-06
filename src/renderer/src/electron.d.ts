import type { ComponentDef } from './game/mech/components'
import type { MechBuild } from './game/mech/components'

interface ImportPngResult {
  relativePath: string
  absolutePath: string
}

interface ElectronAPI {
  importPng(id: string, view: 'front' | 'rear'): Promise<ImportPngResult | null>
  copySprite(id: string, from: 'front' | 'rear', to: 'front' | 'rear'): Promise<ImportPngResult | null>
  saveComponentDef(def: ComponentDef): Promise<void>
  loadComponentDefs(): Promise<ComponentDef[]>
  deleteComponentDef(id: string): Promise<void>
  saveBuild(build: MechBuild): Promise<void>
  loadBuilds(): Promise<MechBuild[]>
  deleteBuild(id: string): Promise<void>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
