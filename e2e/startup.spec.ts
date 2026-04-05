import { test, expect } from '@playwright/test'
import { launchGame } from './launch'

// Thresholds (ms). Generous enough for slow CI/WSL2, tight enough to catch
// regressions like broken dep-optimisation (would push Phaser past 5 s).
const REACT_MS_LIMIT  =   500
const PHASER_MS_LIMIT = 1_200
const TOTAL_MS_LIMIT  = 1_200

test('startup timings are within acceptable bounds', async () => {
  const game = await launchGame()

  // Poll window.__startupTimings — main.tsx records it when scene-ready fires.
  // Reading from window instead of from console.log avoids races with
  // listener attachment.
  const timings = await game.page.waitForFunction(
    () => (window as unknown as { __startupTimings?: { react: number; phaser: number; total: number } }).__startupTimings,
    null,
    { timeout: 12_000 },
  ).then(h => h.jsonValue())

  const reactMs  = Math.round(timings.react)
  const phaserMs = Math.round(timings.phaser)
  const totalMs  = Math.round(timings.total)

  // Echo to stdout so the timing appears in CI logs and build output.
  console.log(`[startup-timings] react=${reactMs}ms phaser=${phaserMs}ms total=${totalMs}ms`)

  expect(reactMs,  'react mount time').toBeGreaterThan(0)
  expect(phaserMs, 'phaser init time').toBeGreaterThan(0)
  expect(totalMs,  'total startup time').toBeGreaterThan(0)

  expect(reactMs,  'react mount time exceeded limit').toBeLessThan(REACT_MS_LIMIT)
  expect(phaserMs, 'phaser init time exceeded limit').toBeLessThan(PHASER_MS_LIMIT)
  expect(totalMs,  'total startup time exceeded limit').toBeLessThan(TOTAL_MS_LIMIT)

  await game.close()
})
