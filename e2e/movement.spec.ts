import { test, expect } from '@playwright/test'
import { launchGame } from './launch'

test('move-select mode expands minimap and highlights targets', async () => {
  const game = await launchGame()

  // Idle: all three panels visible
  await expect(game.page.locator('.panel-battlefield')).toBeVisible()
  await expect(game.page.locator('.panel-mech-status')).toBeVisible()
  await expect(game.page.locator('.panel-minimap')).toBeVisible()

  // Press M → enter move-select mode
  await game.page.keyboard.press('m')
  await game.page.waitForTimeout(300)

  // Minimap should have fullscreen class
  await expect(game.page.locator('.panel-minimap--fullscreen')).toBeVisible()

  // Battlefield and mech panel should be hidden
  await expect(game.page.locator('.panel-battlefield')).toHaveClass(/panel--hidden/)
  await expect(game.page.locator('.panel-mech-status')).toHaveClass(/panel--hidden/)

  // Move targets (green highlighted hexes) should exist
  const targets = game.page.locator('svg path[stroke="#4aff4a"]')
  const targetCount = await targets.count()
  // 3-hex radius around player = up to 37 hexes (minus out-of-bounds and occupied)
  expect(targetCount).toBeGreaterThan(20)
  expect(targetCount).toBeLessThanOrEqual(37)

  await game.screenshot('move-select')

  // Click a target hex → should move and return to idle
  await targets.first().click()
  await game.page.waitForTimeout(300)

  // Back to idle: fullscreen class gone, panels visible again
  await expect(game.page.locator('.panel-minimap--fullscreen')).not.toBeVisible()
  await expect(game.page.locator('.panel-battlefield')).not.toHaveClass(/panel--hidden/)

  await game.screenshot('after-move')
  await game.close()
})

test('escape from move-select returns to idle without moving', async () => {
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
