import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  importPng: (id: string, view: 'front' | 'rear') =>
    ipcRenderer.invoke('storage:import-png', id, view),
  copySprite: (id: string, from: 'front' | 'rear', to: 'front' | 'rear') =>
    ipcRenderer.invoke('storage:copy-sprite', id, from, to),
  saveComponentDef: (def: unknown) =>
    ipcRenderer.invoke('storage:save-component-def', def),
  loadComponentDefs: () =>
    ipcRenderer.invoke('storage:load-component-defs'),
  deleteComponentDef: (id: string) =>
    ipcRenderer.invoke('storage:delete-component-def', id),
  saveBuild: (build: unknown) =>
    ipcRenderer.invoke('storage:save-build', build),
  loadBuilds: () =>
    ipcRenderer.invoke('storage:load-builds'),
  deleteBuild: (id: string) =>
    ipcRenderer.invoke('storage:delete-build', id),
})
