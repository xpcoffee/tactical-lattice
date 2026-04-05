import { test, expect } from '@playwright/test'
import { launchGame } from './launch'

test('M toggles fullscreen tactical map', async () => {
  const game = await launchGame()

  // Idle: all three panels visible
  await expect(game.page.locator('.panel-battlefield')).toBeVisible()
  await expect(game.page.locator('.panel-mech-status')).toBeVisible()
  await expect(game.page.locator('.panel-minimap')).toBeVisible()

  // Press M → enter map mode
  await game.page.keyboard.press('m')
  await game.page.waitForTimeout(300)
  await expect(game.page.locator('.panel-minimap--fullscreen')).toBeVisible()

  // Battlefield and mech panel hidden
  await expect(game.page.locator('.panel-battlefield')).toHaveClass(/panel--hidden/)
  await expect(game.page.locator('.panel-mech-status')).toHaveClass(/panel--hidden/)

  await game.screenshot('map-open')

  // Press M again → toggle back to idle
  await game.page.keyboard.press('m')
  await game.page.waitForTimeout(300)
  await expect(game.page.locator('.panel-minimap--fullscreen')).not.toBeVisible()
  await expect(game.page.locator('.panel-battlefield')).not.toHaveClass(/panel--hidden/)

  await game.close()
})

test('Escape also closes map mode', async () => {
  const game = await launchGame()

  await expect(game.page.locator('.panel-battlefield')).toBeVisible()
  await game.page.keyboard.press('m')
  await game.page.waitForTimeout(300)
  await expect(game.page.locator('.panel-minimap--fullscreen')).toBeVisible()

  await game.page.keyboard.press('Escape')
  await game.page.waitForTimeout(300)
  await expect(game.page.locator('.panel-minimap--fullscreen')).not.toBeVisible()
  await expect(game.page.locator('.panel-battlefield')).not.toHaveClass(/panel--hidden/)

  await game.close()
})

test('movement keys work inside map mode', async () => {
  const game = await launchGame()
  await expect(game.page.locator('.panel-battlefield')).toBeVisible()

  await game.page.keyboard.press('m')
  await game.page.waitForTimeout(200)
  await expect(game.page.locator('.panel-minimap--fullscreen')).toBeVisible()

  // Read an entity marker position on the (fullscreen) minimap
  const readMarker = () => game.page.evaluate(() =>
    Array.from(document.querySelectorAll('svg g text'))
      .map(el => `${el.getAttribute('x')},${el.getAttribute('y')}`)
      .join('|'),
  )
  const before = await readMarker()
  await game.page.keyboard.press('k')
  await game.page.waitForTimeout(400)
  const after = await readMarker()
  expect(after).not.toBe(before)

  // Still in map mode.
  await expect(game.page.locator('.panel-minimap--fullscreen')).toBeVisible()
  await game.close()
})
