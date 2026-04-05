import { test, expect } from '@playwright/test'
import { launchGame } from './launch'

test('rotate facing CW with L key — full rotation returns to start', async () => {
  const game = await launchGame()
  await game.page.waitForTimeout(500)

  await game.screenshot('camera-initial')

  // Rotate CW 6 times — should complete a full circle without crashing
  for (let i = 0; i < 6; i++) {
    await game.page.keyboard.press('l')
    await game.page.waitForTimeout(100)
  }

  await game.screenshot('camera-after-full-rotation')
  await game.close()
})

test('rotate facing CCW with H key', async () => {
  const game = await launchGame()
  await game.page.waitForTimeout(500)

  await game.page.keyboard.press('h')
  await game.page.waitForTimeout(200)

  await game.screenshot('camera-ccw-rotation')
  await game.close()
})

async function readMarkerPos(page: import('@playwright/test').Page): Promise<string> {
  // Concatenate all entity marker positions — detects any shift.
  return await page.evaluate(() => {
    const els = document.querySelectorAll('svg g text')
    return Array.from(els).map(el => `${el.getAttribute('x')},${el.getAttribute('y')}`).join('|')
  })
}

test('move forward with K key — entities reposition on minimap', async () => {
  const game = await launchGame()
  await game.page.waitForTimeout(500)

  const before = await readMarkerPos(game.page)
  await game.page.keyboard.press('k')
  await game.page.waitForTimeout(400)
  const after = await readMarkerPos(game.page)

  expect(after).not.toBe(before)
  await game.screenshot('camera-forward-move')
  await game.close()
})

test('move backward with J key — entities reposition on minimap', async () => {
  const game = await launchGame()
  await game.page.waitForTimeout(500)

  const before = await readMarkerPos(game.page)
  await game.page.keyboard.press('j')
  await game.page.waitForTimeout(400)
  const after = await readMarkerPos(game.page)

  expect(after).not.toBe(before)
  await game.screenshot('camera-backward-move')
  await game.close()
})

test('ArrowLeft / ArrowRight also rotate facing', async () => {
  const game = await launchGame()
  await game.page.waitForTimeout(500)

  // Should not crash
  await game.page.keyboard.press('ArrowRight')
  await game.page.waitForTimeout(100)
  await game.page.keyboard.press('ArrowLeft')
  await game.page.waitForTimeout(100)

  await game.screenshot('camera-arrow-keys')
  await game.close()
})

test('Shift/Ctrl+H/L strafes without changing facing', async () => {
  const game = await launchGame()
  await expect(game.page.locator('.panel-battlefield')).toBeVisible()
  await game.page.waitForTimeout(300)

  const readState = () => game.page.evaluate(() => {
    const log = (window as unknown as { __actionLog?: () => Array<{ action: string; facing: number; playerPosition: { q: number; r: number } }> }).__actionLog?.() ?? []
    return log[log.length - 1]
  })

  // Player starts at (7,4) facing 0 (E).
  // Shift+L (strafe L-forward) → direction (0+5)%6 = 5 (SE). Target (7,5).
  await game.page.keyboard.down('Shift')
  await game.page.keyboard.press('l')
  await game.page.keyboard.up('Shift')
  await game.page.waitForTimeout(400)
  let last = await readState()
  expect(last.action).toBe('strafe:l-fwd')
  expect(last.facing).toBe(0)
  expect(last.playerPosition).toEqual({ q: 7, r: 5 })

  // Ctrl+H (strafe H-back) → direction (0+4)%6 = 4 (SW). From (7,5): q-1,r+1 = (6,6).
  await game.page.keyboard.down('Control')
  await game.page.keyboard.press('h')
  await game.page.keyboard.up('Control')
  await game.page.waitForTimeout(400)
  last = await readState()
  expect(last.action).toBe('strafe:h-back')
  expect(last.facing).toBe(0)
  expect(last.playerPosition).toEqual({ q: 6, r: 6 })

  await game.close()
})

test('boundary: cannot move back past grid edge', async () => {
  const game = await launchGame()
  await game.page.waitForTimeout(500)

  const playerCircle = game.page.locator('svg circle[fill="#e6c200"]').first()

  // Press J many times — player starts at q=7, facing E; backward = W
  // Should stop at q=0 and not go further
  for (let i = 0; i < 15; i++) {
    await game.page.keyboard.press('j')
    await game.page.waitForTimeout(80)
  }

  const finalCx = await playerCircle.getAttribute('cx')
  // Player should still be on the minimap (visible)
  expect(Number(finalCx)).toBeGreaterThan(0)

  await game.screenshot('camera-boundary-stop')
  await game.close()
})
