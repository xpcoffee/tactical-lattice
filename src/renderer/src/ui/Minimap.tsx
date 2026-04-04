// Minimap: 10×10 hex grid overlay in the top-right corner.
// Positional awareness only — actions are taken in the main battlefield view.

import { useState, useEffect } from 'react'
import { EventBus } from '../phaser/EventBus'
import { CombatState, COMBAT_STATE_CHANGED, getLatestState } from '../game/state/combat'
import { hexToPixel } from '../game/hex/grid'

const COLS = 10
const ROWS = 10
const HEX_SIZE = 8
const PAD = 6

function hexCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: PAD + HEX_SIZE + HEX_SIZE * 1.5 * col,
    y: PAD + HEX_SIZE + HEX_SIZE * Math.sqrt(3) * (row + (col % 2) * 0.5),
  }
}

function hexPath(cx: number, cy: number): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i
    return `${cx + HEX_SIZE * Math.cos(angle)},${cy + HEX_SIZE * Math.sin(angle)}`
  })
  return `M ${pts[0]} ${pts.slice(1).map(p => `L ${p}`).join(' ')} Z`
}

const SVG_W = PAD * 2 + HEX_SIZE * (1.5 * COLS + 0.5)
const SVG_H = PAD * 2 + HEX_SIZE * Math.sqrt(3) * (ROWS + 0.5)

// hexCenter(col, row) is equivalent to hexToPixel({q: col, r: row}, HEX_SIZE) + (PAD + HEX_SIZE).
// Entity axial positions map directly into minimap SVG space using this offset.
function entitySVGPos(pos: { q: number; r: number }): { x: number; y: number } {
  const { x, y } = hexToPixel(pos, HEX_SIZE)
  return { x: PAD + HEX_SIZE + x, y: PAD + HEX_SIZE + y }
}

export default function Minimap() {
  const [combatState, setCombatState] = useState<CombatState>(() => getLatestState())

  useEffect(() => {
    const handler = (state: CombatState) => setCombatState(state)
    EventBus.on(COMBAT_STATE_CHANGED, handler)
    return () => { EventBus.off(COMBAT_STATE_CHANGED, handler) }
  }, [])

  return (
    <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ fontSize: '9px', color: '#e6c200', letterSpacing: '0.12em' }}>TACTICAL MAP</div>
      <svg
        width={SVG_W}
        height={SVG_H}
        style={{ display: 'block' }}
      >
        {Array.from({ length: COLS }, (_, col) =>
          Array.from({ length: ROWS }, (_, row) => {
            const { x, y } = hexCenter(col, row)
            return (
              <path
                key={`${col}-${row}`}
                d={hexPath(x, y)}
                fill="none"
                stroke="#4a4a7a"
                strokeWidth={0.8}
              />
            )
          })
        )}

        {(() => {
          const { x, y } = entitySVGPos(combatState.playerPosition)
          return <circle key="player" cx={x} cy={y} r={3} fill="#e6c200" />
        })()}

        {combatState.entities.map(e => {
          const { x, y } = entitySVGPos(e.position)
          return (
            <text
              key={e.id}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="8"
              fill="#cc4444"
            >X</text>
          )
        })}
      </svg>
    </div>
  )
}
