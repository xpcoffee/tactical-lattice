import { app, BrowserWindow } from 'electron'
import { join } from 'path'

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

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
