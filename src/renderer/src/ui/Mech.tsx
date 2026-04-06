// Mech sprite overlay — over-the-shoulder (rear) view of the player's mech.
// Composites component bounding boxes using layoutBuild when a player build
// is available; falls back to the static placeholder when there's no build.

import mechSprite from '../assets/mech-placeholder.png'
import { getPlayerBuild } from '../game/state/combat'
import { layoutBuild, layoutBounds } from '../game/mech/assembly'
import { getLibrary } from '../game/mech/library'
import type { Slot } from '../game/mech/components'
import { s } from '../app/scale'

const RENDER_WIDTH = 180 // reference pixels — scaled via s()
const SLOT_COLORS: Record<Slot, string> = { chassis: '#888', core: '#e6c200', armament: '#cc4444', logistics: '#4a7aff', joint: '#66aa66' }

export default function Mech() {
  const build = getPlayerBuild()

  if (!build) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s(4) }}>
        <img src={mechSprite} alt="mech" style={{ imageRendering: 'pixelated', width: s(RENDER_WIDTH) }} />
        <div style={{ fontSize: s(8), color: '#e6c200', letterSpacing: '0.12em', opacity: 0.6 }}>UNIT-01</div>
      </div>
    )
  }

  const library = getLibrary()
  const allEntries = layoutBuild(build, library, 'rear')
  const entries = allEntries.filter(e => e.visible)
  const bounds = layoutBounds(entries)
  if (bounds.width === 0 || bounds.height === 0) {
    return null
  }

  // scale maps design-space to reference pixels; s() then maps to screen pixels.
  const scale = RENDER_WIDTH / Math.max(bounds.width, 1)
  const scaledH = bounds.height * scale

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s(4) }}>
      <div style={{
        position: 'relative',
        width: s(RENDER_WIDTH),
        height: s(scaledH),
      }}>
        {entries.map(entry => {
          const def = library.find(d => d.id === entry.defId)
          const slot = def?.slot ?? 'chassis'
          const color = SLOT_COLORS[slot]
          const rotStyle = entry.rotation !== 0 ? {
            transform: `rotate(${entry.rotation}deg)`,
            transformOrigin: `${s((entry.rotationPivotX - bounds.x) * scale - (entry.x - bounds.x) * scale)} ${s((entry.rotationPivotY - bounds.y) * scale - (entry.y - bounds.y) * scale)}`,
          } : {}
          return (
            <div
              key={entry.instanceId}
              style={{
                position: 'absolute',
                left: s((entry.x - bounds.x) * scale),
                top: s((entry.y - bounds.y) * scale),
                width: s(entry.sprite.width * scale),
                height: s(entry.sprite.height * scale),
                border: `1px solid ${color}`,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.04)',
                ...rotStyle,
              }}
            >
              {entry.sprite.url && !entry.sprite.url.startsWith('data:') && (
                <img
                  src={entry.sprite.url}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', imageRendering: 'pixelated', pointerEvents: 'none' }}
                  draggable={false}
                />
              )}
              <span style={{
                fontFamily: 'monospace',
                fontSize: s(7),
                color,
                opacity: 0.7,
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                padding: `0 ${s(2)}`,
                position: 'relative',
              }}>
                {def?.name ?? entry.defId}
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: s(8), color: '#e6c200', letterSpacing: '0.12em', opacity: 0.6 }}>
        {build.name.toUpperCase()}
      </div>
    </div>
  )
}
