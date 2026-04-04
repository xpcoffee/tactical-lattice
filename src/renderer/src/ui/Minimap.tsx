// Minimap: compact hex grid overlay (idle) or full-screen tactical view (move-select).
// Positional awareness only — actions are taken via the move-select mode.

import { useState, useEffect } from 'react'
import { EventBus } from '../phaser/EventBus'
import { CombatState, COMBAT_STATE_CHANGED, getLatestState, getMoveTargets } from '../game/state/combat'
import { hexToPixel, type HexCoord } from '../game/hex/grid'

const HEX_SIZE = 8
const PAD = 6
const MOVE_RANGE = 3

interface MinimapProps {
  mode: 'idle' | 'move-select'
  onMoveConfirm: (target: HexCoord) => void
}

// Axial flat-top formula — matches hexToPixel() so grid cells, player, entities, and
// move targets all share the same coordinate system.
function hexCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: PAD + HEX_SIZE + HEX_SIZE * (3 / 2) * col,
    y: PAD + HEX_SIZE + HEX_SIZE * (Math.sqrt(3) / 2 * col + Math.sqrt(3) * row),
  }
}

function hexPath(cx: number, cy: number): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i
    return `${cx + HEX_SIZE * Math.cos(angle)},${cy + HEX_SIZE * Math.sin(angle)}`
  })
  return `M ${pts[0]} ${pts.slice(1).map(p => `L ${p}`).join(' ')} Z`
}

// hexCenter(col, row) ≡ hexToPixel({q: col, r: row}, HEX_SIZE) + (PAD + HEX_SIZE) offset
function entitySVGPos(pos: HexCoord): { x: number; y: number } {
  const { x, y } = hexToPixel(pos, HEX_SIZE)
  return { x: PAD + HEX_SIZE + x, y: PAD + HEX_SIZE + y }
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

  const moveTargets = mode === 'move-select'
    ? getMoveTargets(combatState.playerPosition, combatState.entities, MOVE_RANGE, COLS, ROWS)
    : []
  const moveTargetSet = new Set(moveTargets.map(h => `${h.q}-${h.r}`))

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
            const isPlayer = col === combatState.playerPosition.q && row === combatState.playerPosition.r

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
                onClick={isFullscreen && isTarget ? () => onMoveConfirm({ q: col, r: row }) : undefined}
                style={{ cursor: isFullscreen && isTarget ? 'pointer' : 'default' }}
              />
            )
          })
        )}

        {/* Player marker */}
        {(() => {
          const { x, y } = entitySVGPos(combatState.playerPosition)
          return (
            <circle
              key="player"
              cx={x}
              cy={y}
              r={isFullscreen ? 4 : 3}
              fill="#e6c200"
              style={{ pointerEvents: 'none' }}
            />
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
