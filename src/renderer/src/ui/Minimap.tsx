// Minimap: compact hex grid overlay (idle) or full-screen tactical view (move-select).
// Positional awareness only — actions are taken via the move-select mode.
//
// Coordinate systems:
//   Game state uses AXIAL coords (q, r).
//   The visual grid uses OFFSET coords (col, row) — the (col % 2) * 0.5 stagger
//   that produces a rectangular grid layout.
//   axialToOffset / offsetToAxial convert between them.

import { useState, useEffect } from 'react'
import { EventBus } from '../phaser/EventBus'
import { CombatState, COMBAT_STATE_CHANGED, getLatestState, getMoveTargets } from '../game/state/combat'
import { type HexCoord, DIRECTIONS } from '../game/hex/grid'

const HEX_SIZE = 8
const PAD = 6
const MOVE_RANGE = 3

interface MinimapProps {
  mode: 'idle' | 'move-select'
  onMoveConfirm: (target: HexCoord) => void
}

// Offset grid — renders a rectangular layout.
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

// Axial → offset: col = q, row = r + floor(q / 2)
function axialToOffset(h: HexCoord): { col: number; row: number } {
  return { col: h.q, row: h.r + Math.floor(h.q / 2) }
}

// Offset → axial (inverse of above)
function offsetToAxial(col: number, row: number): HexCoord {
  return { q: col, r: row - Math.floor(col / 2) }
}

// Maps an axial game position to SVG pixel coordinates in the offset grid.
function entitySVGPos(pos: HexCoord): { x: number; y: number } {
  const { col, row } = axialToOffset(pos)
  return hexCenter(col, row)
}

// Returns SVG polygon points for a facing arrow centred at (cx, cy).
// Uses the offset-grid direction vector to stay consistent with entity positions.
function facingArrowPoints(cx: number, cy: number, facing: number): string {
  const dir = DIRECTIONS[facing]
  const raw = {
    x: HEX_SIZE * 1.5 * dir.q,
    y: HEX_SIZE * Math.sqrt(3) * (dir.r + dir.q * 0.5),
  }
  const len = Math.sqrt(raw.x * raw.x + raw.y * raw.y)
  const ux = raw.x / len, uy = raw.y / len
  const tip = { x: cx + ux * HEX_SIZE * 0.85, y: cy + uy * HEX_SIZE * 0.85 }
  const perp = { x: -uy * 2, y: ux * 2 }
  return `${tip.x},${tip.y} ${cx + perp.x},${cy + perp.y} ${cx - perp.x},${cy - perp.y}`
}

export default function Minimap({ mode, onMoveConfirm }: MinimapProps) {
  const [combatState, setCombatState] = useState<CombatState>(() => getLatestState())

  useEffect(() => {
    const handler = (state: CombatState) => setCombatState(state)
    EventBus.on(COMBAT_STATE_CHANGED, handler)
    return () => { EventBus.off(COMBAT_STATE_CHANGED, handler) }
  }, [])

  const COLS = mode === 'move-select' ? 15 : 10
  const ROWS = mode === 'move-select' ? 15 : 10
  const svgW = PAD * 2 + HEX_SIZE * (1.5 * COLS + 0.5)
  const svgH = PAD * 2 + HEX_SIZE * Math.sqrt(3) * (ROWS + 0.5)

  // Move targets in axial space; convert to offset keys for the grid cell lookup.
  const moveTargets = mode === 'move-select'
    ? getMoveTargets(combatState.playerPosition, combatState.entities, MOVE_RANGE, COLS, ROWS)
    : []
  const moveTargetSet = new Set(
    moveTargets.map(h => { const o = axialToOffset(h); return `${o.col}-${o.row}` })
  )

  // Player offset position for highlighting the correct grid cell.
  const playerOffset = axialToOffset(combatState.playerPosition)

  const isFullscreen = mode === 'move-select'

  return (
    <div style={{
      padding: isFullscreen ? '0' : '6px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: isFullscreen ? '0' : '4px',
      height: isFullscreen ? '100%' : 'auto',
    }}>
      {!isFullscreen && (
        <div style={{ fontSize: '9px', color: '#e6c200', letterSpacing: '0.12em' }}>TACTICAL MAP</div>
      )}
      {isFullscreen && (
        <div style={{
          fontSize: '10px',
          color: '#e6c200',
          letterSpacing: '0.15em',
          padding: '12px 16px 8px',
          borderBottom: '1px solid #2a2a3a',
        }}>
          MOVE — SELECT DESTINATION
        </div>
      )}
      <svg
        width={isFullscreen ? '100%' : svgW}
        height={isFullscreen ? '100%' : svgH}
        viewBox={isFullscreen ? `0 0 ${svgW} ${svgH}` : undefined}
        preserveAspectRatio={isFullscreen ? 'xMidYMid meet' : undefined}
        style={{ display: 'block', flex: isFullscreen ? '1' : undefined }}
      >
        {Array.from({ length: COLS }, (_, col) =>
          Array.from({ length: ROWS }, (_, row) => {
            const { x, y } = hexCenter(col, row)
            const key = `${col}-${row}`
            const isTarget = moveTargetSet.has(key)
            const isPlayer = col === playerOffset.col && row === playerOffset.row

            return (
              <path
                key={key}
                d={hexPath(x, y)}
                fill={
                  isFullscreen && isPlayer ? 'rgba(230,194,0,0.2)' :
                  isFullscreen && isTarget ? 'rgba(100,200,100,0.18)' :
                  'none'
                }
                stroke={isFullscreen && isTarget ? '#4aff4a' : '#4a4a7a'}
                strokeWidth={isFullscreen && isTarget ? 1.2 : 0.8}
                onClick={
                  isFullscreen && isTarget
                    ? () => onMoveConfirm(offsetToAxial(col, row))
                    : undefined
                }
                style={{ cursor: isFullscreen && isTarget ? 'pointer' : 'default' }}
              />
            )
          })
        )}

        {/* Player marker + facing arrow */}
        {(() => {
          const { x, y } = entitySVGPos(combatState.playerPosition)
          return (
            <>
              <circle
                key="player"
                cx={x}
                cy={y}
                r={isFullscreen ? 4 : 3}
                fill="#e6c200"
                style={{ pointerEvents: 'none' }}
              />
              <polygon
                key="facing"
                points={facingArrowPoints(x, y, combatState.facing)}
                fill="#e6c200"
                opacity={0.85}
                style={{ pointerEvents: 'none' }}
              />
            </>
          )
        })()}

        {/* Entity markers */}
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
              style={{ pointerEvents: 'none' }}
            >X</text>
          )
        })}
      </svg>
    </div>
  )
}
