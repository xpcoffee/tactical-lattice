import { test, expect } from '@playwright/test'
import { launchGame } from './launch'

// Screenshots a slice of the grid area and hashes the bytes — works with the
// WebGL Phaser canvas where getImageData on a 2D context would read black.
async function canvasHash(page: import('@playwright/test').Page): Promise<string> {
  const buf = await page.screenshot({ clip: { x: 200, y: 300, width: 900, height: 250 } })
  let a = 0, b = 0
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) | 0
    b = (b * 33 + buf[i]) | 0
  }
  return `${a.toString(16)}_${b.toString(16)}`
}

// Regression for the main-view-freezes-after-many-moves bug: rapid keypresses
// caused entity fade-in/out tweens to race. When an entity re-entered the
// cone while its fade-out tween was still running, the fade-out's onComplete
// would later destroy the freshly-created replacement render, orphaning the
// entity and throwing "Cannot read properties of undefined (reading 'gfx')" —
// after which syncEntityVisibility silently bailed on every subsequent call.
test('main view keeps redrawing across 60 rapid actions', async () => {
  const game = await launchGame()
  const errors: string[] = []
  game.page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  game.page.on('pageerror', e => errors.push(String(e)))

  await game.page.waitForTimeout(500)

  const samples: string[] = [await canvasHash(game.page)]
  const pattern = ['k', 'l', 'k', 'j', 'h', 'k', 'k', 'h', 'j', 'l']
  for (let step = 1; step <= 60; step++) {
    await game.page.keyboard.press(pattern[step % pattern.length])
    await game.page.waitForTimeout(150)  // shorter than tween durations → rapid-fire
    samples.push(await canvasHash(game.page))
  }

  // Dump the in-game action log on failure for debugging.
  if (errors.length) {
    const log = await game.page.evaluate(() =>
      (window as unknown as { __actionLog?: () => unknown[] }).__actionLog?.() ?? []
    )
    console.log('[actionLog]', JSON.stringify(log, null, 2))
  }

  expect(errors).toEqual([])

  const unique = new Set(samples).size
  expect(unique, `only ${unique}/${samples.length} unique frames — view likely froze`).toBeGreaterThan(30)

  // No long stuck runs (≥8 consecutive identical samples = ≥1.2 s frozen).
  let runStart = 0
  let maxRun = 1
  let worstKey = ''
  for (let i = 1; i < samples.length; i++) {
    if (samples[i] !== samples[i - 1]) {
      if (i - runStart > maxRun) { maxRun = i - runStart; worstKey = `${runStart}→${i-1}` }
      runStart = i
    }
  }
  if (samples.length - runStart > maxRun) { maxRun = samples.length - runStart; worstKey = `${runStart}→${samples.length - 1}` }
  expect(maxRun, `longest stuck run ${worstKey} lasted ${maxRun} frames`).toBeLessThan(8)

  await game.close()
})
