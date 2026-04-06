import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'

export interface GameHandle {
  app: ElectronApplication
  page: Page
  screenshot: (name: string) => Promise<void>
  close: () => Promise<void>
}

/**
 * Launch the built Electron app and return handles for interaction and validation.
 * Requires `npm run build` to have been run first.
 */
export interface LaunchOptions {
  /** Override the starting scene (defaults to 'combat' for test compat). */
  scene?: string
}

export async function launchGame(opts: LaunchOptions = {}): Promise<GameHandle> {
  const mainPath = path.join(__dirname, '../out/main/index.js')

  // Chromium requires --no-sandbox inside Docker/containers that lack user namespaces
  const args = process.env['CI']
    ? ['--no-sandbox', mainPath]
    : [mainPath]

  const app = await electron.launch({
    args,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      GAME_START_SCENE: opts.scene ?? 'combat',
    },
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // Ensure the window is focused so keyboard events are delivered. On
  // Electron/Playwright the first keypress is sometimes dropped if the
  // window just came up — clicking the body guarantees focus lands.
  await page.locator('body').click()

  return {
    app,
    page,
    screenshot: (name: string) =>
      page.screenshot({ path: path.join(__dirname, `screenshots/${name}.png`) }).then(() => {}),
    close: () => app.close(),
  }
}
