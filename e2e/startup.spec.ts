import { test, expect } from '@playwright/test'
import { launchGame } from './launch'

// Thresholds (ms). Generous enough for slow CI/WSL2, tight enough to catch
// regressions like broken dep-optimisation (would push Phaser past 5 s).
const REACT_MS_LIMIT  =   500
const PHASER_MS_LIMIT = 1_200
const TOTAL_MS_LIMIT  = 1_200

test('startup timings are within acceptable bounds', async () => {
  // Attach the console listener before Phaser initialises so we don't miss it.
  const game = await launchGame()

  const timingLine = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for [startup] console log')),
      12_000,
    )
    game.page.on('console', (msg) => {
      if (msg.text().startsWith('[startup]')) {
        clearTimeout(timer)
        resolve(msg.text())
      }
    })
  })

  // Format: "[startup] react: 42 ms | phaser: 1234 ms | total: 1276 ms"
  const parse = (key: string) =>
    parseInt(timingLine.match(new RegExp(`${key}:\\s*(\\d+)`))?.[1] ?? '-1')

  const reactMs  = parse('react')
  const phaserMs = parse('phaser')
  const totalMs  = parse('total')

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
