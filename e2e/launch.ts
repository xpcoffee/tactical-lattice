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
export async function launchGame(): Promise<GameHandle> {
  const app = await electron.launch({
    args: [path.join(__dirname, '../out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test' },
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  return {
    app,
    page,
    screenshot: (name: string) =>
      page.screenshot({ path: path.join(__dirname, `screenshots/${name}.png`) }).then(() => {}),
    close: () => app.close(),
  }
}
