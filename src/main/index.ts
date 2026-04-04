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
    minWidth: 1280,
    minHeight: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
    autoHideMenuBar: true,
    title: 'Tactical Lattice',
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
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
