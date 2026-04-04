// Minimap: player-centric top-down tactical view.
// Vision cone always faces up — the world rotates around a fixed player dot.
// Shows visual range (blue) and sensor range (dim blue) cone highlights.
//
// Coordinate system: axial (q, r) converted to flat-top pixel via hexToPixel,
// with positions relative to the player (player always at SVG centre).

import { useState, useEffect } from 'react'
import { EventBus } from '../phaser/EventBus'
import { CombatState, COMBAT_STATE_CHANGED, getLatestState, getMoveTargets } from '../game/state/combat'
import { type HexCoord, DIRECTIONS, hexToPixel, hexDistance, hexesInCone } from '../game/hex/grid'
import { VIEW_RANGE, SENSOR_RANGE, GRID_COLS, GRID_ROWS } from '../game/constants'

const MINI_HEX_SIZE = 12
const MOVE_RANGE = 3

interface MinimapProps {
  mode: 'idle' | 'move-select'
  onMoveConfirm: (target: HexCoord) => void
}

// Pixel path for a flat-top hex centred at (cx, cy).
function hexPath(cx: number, cy: number, size: number): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`
  })
  return `M ${pts[0]} ${pts.slice(1).map(p => `L ${p}`).join(' ')} Z`
}

// Rotation (degrees) that puts the facing direction straight up in SVG space.
function facingRotation(facing: number): number {
  const dir = DIRECTIONS[facing]
  const dx = MINI_HEX_SIZE * 1.5 * dir.q
  const dy = MINI_HEX_SIZE * Math.sqrt(3) * (dir.r + dir.q * 0.5)
  const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI)
  return -90 - angleDeg
}

export default function Minimap({ mode, onMoveConfirm }: MinimapProps) {
  const [combatState, setCombatState] = useState<CombatState>(() => getLatestState())

  useEffect(() => {
    const handler = (state: CombatState) => setCombatState(state)
    EventBus.on(COMBAT_STATE_CHANGED, handler)
    return () => { EventBus.off(COMBAT_STATE_CHANGED, handler) }
  }, [])

  const isFullscreen = mode === 'move-select'
  // Size the viewbox around SENSOR_RANGE hexes in each direction.
  const viewRadius = (SENSOR_RANGE + 1) * MINI_HEX_SIZE * 2
  const svgSize = viewRadius * 2
  const cx = svgSize / 2
  const cy = svgSize / 2

  const { playerPosition, facing, entities } = combatState
  const rotateDeg = facingRotation(facing)

  // Compute cone hex sets for highlighting.
  const sensorConeSet = new Set(
    hexesInCone(playerPosition, facing, SENSOR_RANGE, GRID_COLS, GRID_ROWS).map(h => `${h.q},${h.r}`)
  )
  const visualConeSet = new Set(
    hexesInCone(playerPosition, facing, VIEW_RANGE, GRID_COLS, GRID_ROWS).map(h => `${h.q},${h.r}`)
  )

  // Move targets (only relevant in move-select mode).
  const moveTargets = isFullscreen
    ? getMoveTargets(playerPosition, entities, MOVE_RANGE, GRID_COLS, GRID_ROWS)
    : []
  const moveTargetSet = new Set(moveTargets.map(h => `${h.q},${h.r}`))

  // All hexes to render: SENSOR_RANGE radius around player, plus move targets.
  const renderHexes: HexCoord[] = []
  for (let q = playerPosition.q - SENSOR_RANGE - 1; q <= playerPosition.q + SENSOR_RANGE + 1; q++) {
    for (let r = playerPosition.r - SENSOR_RANGE - 1; r <= playerPosition.r + SENSOR_RANGE + 1; r++) {
      if (q < 0 || q >= GRID_COLS || r < 0 || r >= GRID_ROWS) continue
      const d = hexDistance({ q, r }, playerPosition)
      if (d <= SENSOR_RANGE || moveTargetSet.has(`${q},${r}`)) {
        renderHexes.push({ q, r })
      }
    }
  }

  // Pixel position relative to SVG centre for a hex.
  function hexSVGPos(h: HexCoord): { x: number; y: number } {
    const rel = { q: h.q - playerPosition.q, r: h.r - playerPosition.r }
    const p = hexToPixel(rel, MINI_HEX_SIZE)
    return { x: cx + p.x, y: cy + p.y }
  }

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
        width={isFullscreen ? '100%' : svgSize}
        height={isFullscreen ? '100%' : svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', flex: isFullscreen ? '1' : undefined }}
      >
        {/* Rotated world: cone always faces up */}
        <g transform={`rotate(${rotateDeg}, ${cx}, ${cy})`}>
          {renderHexes.map(h => {
            const { x, y } = hexSVGPos(h)
            const key = `${h.q},${h.r}`
            const inVisual  = visualConeSet.has(key)
            const inSensor  = sensorConeSet.has(key)
            const isTarget  = moveTargetSet.has(key)

            return (
              <path
                key={key}
                d={hexPath(x, y, MINI_HEX_SIZE)}
                fill={
                  isFullscreen && isTarget ? 'rgba(100,200,100,0.18)' :
                  inVisual  ? 'rgba(74,122,255,0.18)' :
                  inSensor  ? 'rgba(42,74,106,0.12)'  :
                  'none'
                }
                stroke={isFullscreen && isTarget ? '#4aff4a' : '#4a4a7a'}
                strokeWidth={isFullscreen && isTarget ? 1.2 : 0.8}
                onClick={
                  isFullscreen && isTarget
                    ? () => onMoveConfirm(h)
                    : undefined
                }
                style={{ cursor: isFullscreen && isTarget ? 'pointer' : 'default' }}
              />
            )
          })}

          {/* Entity markers */}
          {entities.map(e => {
            const { x, y } = hexSVGPos(e.position)
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
        </g>

        {/* Player dot — always at centre, outside the rotating group */}
        <circle
          cx={cx}
          cy={cy}
          r={isFullscreen ? 4 : 3}
          fill="#e6c200"
          style={{ pointerEvents: 'none' }}
        />
        {/* Static "up" indicator so orientation is clear */}
        <polygon
          points={`${cx},${cy - MINI_HEX_SIZE * 0.85} ${cx - 2},${cy - MINI_HEX_SIZE * 0.3} ${cx + 2},${cy - MINI_HEX_SIZE * 0.3}`}
          fill="#e6c200"
          opacity={0.7}
          style={{ pointerEvents: 'none' }}
        />
      </svg>
    </div>
  )
}
