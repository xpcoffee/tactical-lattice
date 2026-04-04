import { test, expect } from '@playwright/test'
import { launchGame } from './launch'

test('initial layout renders all three panels', async () => {
  const game = await launchGame()

  await expect(game.page.locator('.panel-battlefield')).toBeVisible()
  await expect(game.page.locator('.panel-mech-status')).toBeVisible()
  await expect(game.page.locator('.panel-minimap')).toBeVisible()

  await game.screenshot('initial')
  await game.close()
})
