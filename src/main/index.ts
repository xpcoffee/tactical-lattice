import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import {
  ensureUserDirs,
  importPng,
  copySprite,
  saveComponentDef,
  loadComponentDefs,
  deleteComponentDef,
  saveBuild,
  loadBuilds,
  deleteBuild,
} from './storage'

// Suppress Chromium ERROR-level log noise (D-Bus unavailable in WSL2 / minimal Linux envs).
// Level 3 = FATAL only; keeps our own console output intact.
app.commandLine.appendSwitch('log-level', '3')
app.commandLine.appendSwitch('disable-features', 'MediaSessionService,HardwareMediaKeyHandling')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
    autoHideMenuBar: true,
    title: 'Tactical Lattice',
  })

  const query: Record<string, string> = {}
  if (process.env['GAME_START_SCENE']) query.scene = process.env['GAME_START_SCENE']
  if (process.env['GAME_MECH_ID']) query.mech = process.env['GAME_MECH_ID']
  if (process.env['GAME_MAP_ID']) query.map = process.env['GAME_MAP_ID']

  if (process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    win.loadURL(url.toString())
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }
}

// ─── IPC handlers ───────────────────────────────────────────────────

ipcMain.handle('storage:import-png', async (_e, id: string, view: 'front' | 'rear') => {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showOpenDialog(win!, {
    title: `Import ${view} sprite`,
    filters: [{ name: 'PNG Images', extensions: ['png'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return importPng(result.filePaths[0], id, view)
})

ipcMain.handle('storage:copy-sprite', (_e, id: string, from: 'front' | 'rear', to: 'front' | 'rear') => copySprite(id, from, to))
ipcMain.handle('storage:save-component-def', (_e, def) => saveComponentDef(def))
ipcMain.handle('storage:load-component-defs', () => loadComponentDefs())
ipcMain.handle('storage:delete-component-def', (_e, id: string) => deleteComponentDef(id))

ipcMain.handle('storage:save-build', (_e, build) => saveBuild(build))
ipcMain.handle('storage:load-builds', () => loadBuilds())
ipcMain.handle('storage:delete-build', (_e, id: string) => deleteBuild(id))

// ─── App lifecycle ──────────────────────────────────────────────────

// Allow the renderer to load repo data files (sprites) via a custom protocol.
// This avoids file:// origin issues when the renderer is served over http in dev.
protocol.registerSchemesAsPrivileged([
  { scheme: 'repodata', privileges: { bypassCSP: true, supportFetchAPI: true } },
])

app.whenReady().then(async () => {
  protocol.handle('repodata', (request) => {
    const filePath = join(process.cwd(), 'data', decodeURIComponent(new URL(request.url).pathname))
    return net.fetch(pathToFileURL(filePath).toString())
  })
  await ensureUserDirs()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
