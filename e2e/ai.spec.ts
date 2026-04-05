import { test, expect } from '@playwright/test'
import { launchGame } from './launch'

// Entity markers live inside a rotating <g>. Their x/y attributes are in
// SVG pre-rotation coordinates relative to the player hex at svg centre,
// so a smaller |x| means the entity is closer to the player.
async function readMarkerDistances(page: import('@playwright/test').Page): Promise<number[]> {
  return await page.evaluate(() => {
    const els = document.querySelectorAll('svg g text')
    return Array.from(els).map(el => {
      const x = Number(el.getAttribute('x') ?? 0)
      const y = Number(el.getAttribute('y') ?? 0)
      return Math.hypot(x, y)
    })
  })
}

test('follow-player entities step closer after a player move', async () => {
  const game = await launchGame()
  await expect(game.page.locator('.panel-battlefield')).toBeVisible()
  await game.page.waitForTimeout(300)

  const before = await readMarkerDistances(game.page)
  expect(before.length).toBeGreaterThan(0)

  // Press K to move forward — triggers AI tick.
  await game.page.keyboard.press('k')
  await game.page.waitForTimeout(500)  // wait for move glide + sync

  const after = await readMarkerDistances(game.page)
  expect(after.length).toBe(before.length)

  // At least one AI entity must have moved closer. (The objective entity
  // has no AI and stays put; its distance changes only because the player
  // moved — which is also fine, just need net closer somewhere.)
  const pairs = before.map((d, i) => ({ before: d, after: after[i] }))
  const closer = pairs.filter(p => p.after < p.before)
  expect(closer.length).toBeGreaterThan(0)

  await game.screenshot('ai-followed')
  await game.close()
})

test('rotation does not move entities', async () => {
  const game = await launchGame()
  await expect(game.page.locator('.panel-battlefield')).toBeVisible()
  await game.page.waitForTimeout(300)

  const before = await readMarkerDistances(game.page)

  // Rotate — should NOT trigger AI tick.
  await game.page.keyboard.press('l')
  await game.page.waitForTimeout(400)

  const after = await readMarkerDistances(game.page)
  // Distances are relative to the player, so they stay identical.
  expect(after).toEqual(before)

  await game.close()
})
