import { useState, useMemo, useCallback, useRef } from 'react'
import type { AppScene } from '../app/scenes'
import type { ComponentDef, MechBuild, Slot, EdgeFacing } from '../game/mech/components'
import { s } from '../app/scale'
import { attach, detach, buildPhysics, validateBuild } from '../game/mech/components'
import { layoutBuild, layoutBounds, type LayoutEntry } from '../game/mech/assembly'
import { DEV_LIBRARY, DEV_CHASSIS } from '../game/mech/library.dev'

interface HangarProps {
  devMode: boolean
  onLaunch: (build: MechBuild) => void
  onNavigate: (scene: AppScene) => void
}

let nextInstanceId = 1
function makeInstanceId(): string {
  return `inst-${nextInstanceId++}`
}

function freshBuild(): MechBuild {
  const chassisInstId = makeInstanceId()
  return {
    id: 'player-build',
    name: 'My Mech',
    rootInstanceId: chassisInstId,
    instances: [{ instanceId: chassisInstId, defId: DEV_CHASSIS.id }],
    attachments: [],
  }
}

const SLOT_ORDER: Slot[] = ['chassis', 'core', 'armament', 'logistics', 'joint']
const SLOT_LABELS: Record<Slot, string> = { chassis: 'CHASSIS', core: 'CORE', armament: 'ARMAMENT', logistics: 'LOGISTICS', joint: 'JOINT' }
const SLOT_COLORS: Record<Slot, string> = { chassis: '#888', core: '#e6c200', armament: '#cc4444', logistics: '#4a7aff', joint: '#66aa66' }

interface PendingEdge {
  parentInstanceId: string
  parentPointId: string
  screenX: number
  screenY: number
}

interface DraggingJoint {
  jointInstanceId: string
  pivotX: number
  pivotY: number
  startAngle: number
  startRotation: number
}

/** Find the nearest joint ancestor of an instance in the build tree. */
function findJointAncestor(build: MechBuild, instanceId: string, defs: ComponentDef[]): string | null {
  // Walk up the attachment tree.
  let current = instanceId
  while (true) {
    const att = build.attachments.find(a => a.childInstanceId === current)
    if (!att) return null
    const parentInst = build.instances.find(i => i.instanceId === att.parentInstanceId)
    if (!parentInst) return null
    const parentDef = defs.find(d => d.id === parentInst.defId)
    if (parentDef?.isJoint) return parentInst.instanceId
    current = att.parentInstanceId
  }
}

export default function Hangar({ devMode: _devMode, onLaunch, onNavigate }: HangarProps) {
  const [build, setBuild] = useState<MechBuild>(freshBuild)
  const [held, setHeld] = useState<ComponentDef | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingEdge, setPendingEdge] = useState<PendingEdge | null>(null)
  const [dragging, setDragging] = useState<DraggingJoint | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const library = DEV_LIBRARY
  const layout = useMemo(() => layoutBuild(build, library, 'front'), [build])
  const bounds = useMemo(() => layoutBounds(layout), [layout])
  const physics = useMemo(() => buildPhysics(build, library), [build])
  const validation = useMemo(() => validateBuild(build, library), [build])

  // Group library by slot (exclude chassis — always pre-placed as root).
  const palette = useMemo(() => {
    const groups = new Map<Slot, ComponentDef[]>()
    for (const def of library) {
      if (def.slot === 'chassis') continue
      const list = groups.get(def.slot) ?? []
      list.push(def)
      groups.set(def.slot, list)
    }
    return groups
  }, [library])

  // Find free parent attach points — any child can attach to any parent.
  const freeParentPoints = useMemo(() => {
    if (!held) return []
    const hasChild = held.attachPoints.some(p => p.role === 'child')
    if (!hasChild) return []
    const result: Array<{ instanceId: string; pointId: string; entry: LayoutEntry; def: ComponentDef; face: string }> = []
    for (const entry of layout) {
      const def = library.find(d => d.id === entry.defId)
      if (!def) continue
      const usedIds = new Set(
        build.attachments
          .filter(a => a.parentInstanceId === entry.instanceId)
          .map(a => a.parentAttachPointId),
      )
      for (const p of def.attachPoints) {
        if (p.role === 'parent' && !usedIds.has(p.id)) {
          result.push({ instanceId: entry.instanceId, pointId: p.id, entry, def, face: p.face })
        }
      }
    }
    return result
  }, [held, layout, build, library])

  function handleAttach(parentInstanceId: string, parentPointId: string, edgeFacing?: EdgeFacing) {
    if (!held) return
    const childPoint = held.attachPoints.find(p => p.role === 'child')
    if (!childPoint) return

    const childInstId = makeInstanceId()
    const newBuild: MechBuild = {
      ...build,
      instances: [...build.instances, { instanceId: childInstId, defId: held.id }],
      attachments: build.attachments,
    }
    const result = attach(newBuild, library, parentInstanceId, parentPointId, childInstId, childPoint.id, edgeFacing)
    if (typeof result === 'string') {
      setError(result)
    } else {
      setBuild(result)
      setError(null)
    }
    setHeld(null)
    setPendingEdge(null)
  }

  function handleAttachPointClick(parentInstanceId: string, parentPointId: string, face: string, e: React.MouseEvent) {
    if (face === 'edge') {
      // Show popover for edge facing direction.
      const rect = canvasRef.current?.getBoundingClientRect()
      setPendingEdge({
        parentInstanceId,
        parentPointId,
        screenX: e.clientX - (rect?.left ?? 0),
        screenY: e.clientY - (rect?.top ?? 0),
      })
    } else {
      handleAttach(parentInstanceId, parentPointId)
    }
  }

  function handleDetach(instanceId: string) {
    if (instanceId === build.rootInstanceId) return
    setBuild(detach(build, instanceId))
    setError(null)
  }

  // ─── Joint drag rotation ──────────────────────────────────────────

  function handleComponentMouseDown(instanceId: string, e: React.MouseEvent) {
    const jointId = findJointAncestor(build, instanceId, library)
    if (!jointId) return

    e.preventDefault()
    const jointEntry = layout.find(en => en.instanceId === jointId)
    if (!jointEntry) return
    const jointDef = library.find(d => d.id === jointEntry.defId)
    if (!jointDef) return
    const parentPoint = jointDef.attachPoints.find(p => p.role === 'parent')
    if (!parentPoint) return

    // Compute pivot in screen pixels: design-space coords × current --s value.
    const scaleFactor = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1
    const pivotX = (jointEntry.x + parentPoint.front.x + offsetX) * scaleFactor
    const pivotY = (jointEntry.y + parentPoint.front.y + offsetY) * scaleFactor

    const rect = canvasRef.current?.getBoundingClientRect()
    const mx = e.clientX - (rect?.left ?? 0)
    const my = e.clientY - (rect?.top ?? 0)
    const startAngle = Math.atan2(my - pivotY, mx - pivotX)
    const jointInst = build.instances.find(i => i.instanceId === jointId)
    const startRotation = jointInst?.rotation ?? 0

    setDragging({ jointInstanceId: jointId, pivotX, pivotY, startAngle, startRotation })
  }

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    const rect = canvasRef.current?.getBoundingClientRect()
    const mx = e.clientX - (rect?.left ?? 0)
    const my = e.clientY - (rect?.top ?? 0)
    const currentAngle = Math.atan2(my - dragging.pivotY, mx - dragging.pivotX)
    const delta = (currentAngle - dragging.startAngle) * (180 / Math.PI)
    const newRotation = dragging.startRotation + delta

    setBuild(prev => ({
      ...prev,
      instances: prev.instances.map(i =>
        i.instanceId === dragging.jointInstanceId ? { ...i, rotation: newRotation } : i
      ),
    }))
  }, [dragging])

  const handleMouseUp = useCallback(() => {
    setDragging(null)
  }, [])

  // Canvas centering offset (in design-space pixels — scaled via s()).
  const canvasW = 300
  const canvasH = 300
  const offsetX = (canvasW - bounds.width) / 2 - bounds.x
  const offsetY = (canvasH - bounds.height) / 2 - bounds.y

  return (
    <div className="hangar">
      <div className="hangar__header">
        <h1 className="hangar__title">HANGAR</h1>
        <button className="menu-btn" onClick={() => onNavigate('main-menu')}>BACK</button>
      </div>

      <div className="hangar__body">
        {/* ─── Component palette ─── */}
        <div className="hangar__palette">
          <div className="hangar__section-title">COMPONENTS</div>
          {SLOT_ORDER.filter(s => s !== 'chassis').map(slot => {
            const defs = palette.get(slot)
            if (!defs) return null
            return (
              <div key={slot}>
                <div className="hangar__slot-label">{SLOT_LABELS[slot]}</div>
                {defs.map(def => (
                  <button
                    key={def.id}
                    className={`hangar__comp-btn${held?.id === def.id ? ' hangar__comp-btn--held' : ''}`}
                    onClick={() => { setHeld(held?.id === def.id ? null : def); setPendingEdge(null) }}
                  >
                    {def.name}
                    <span className="hangar__comp-stats">
                      I:{def.physics.inertia} T:{def.physics.thrust} E:{def.physics.energy}
                    </span>
                  </button>
                ))}
              </div>
            )
          })}
          {held && (
            <div className="hangar__hint">Click a highlighted attach point to place.</div>
          )}
        </div>

        {/* ─── Schematic canvas ─── */}
        <div
          ref={canvasRef}
          className="hangar__canvas"
          style={{ width: s(canvasW), height: s(canvasH) }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={() => setPendingEdge(null)}
        >
          <div style={{ position: 'relative', transform: `translate(${s(offsetX)}, ${s(offsetY)})` }}>
            {layout.map(entry => {
              const def = library.find(d => d.id === entry.defId)
              const slot = def?.slot ?? 'chassis'
              const color = SLOT_COLORS[slot]
              const isRoot = entry.instanceId === build.rootInstanceId
              const occluded = !entry.visible
              const hasJointAncestor = !!findJointAncestor(build, entry.instanceId, library)
              const rotStyle = entry.rotation !== 0 ? {
                transform: `rotate(${entry.rotation}deg)`,
                transformOrigin: `${s(entry.rotationPivotX - entry.x)} ${s(entry.rotationPivotY - entry.y)}`,
              } : {}
              return (
                <div
                  key={entry.instanceId}
                  className={`hangar__bbox${!isRoot ? ' hangar__bbox--detachable' : ''}${occluded ? ' hangar__bbox--occluded' : ''}${hasJointAncestor ? ' hangar__bbox--jointed' : ''}`}
                  style={{
                    position: 'absolute',
                    left: s(entry.x),
                    top: s(entry.y),
                    width: s(entry.sprite.width),
                    height: s(entry.sprite.height),
                    borderColor: color,
                    color,
                    ...rotStyle,
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    if (!isRoot) handleDetach(entry.instanceId)
                  }}
                  onMouseDown={(e) => {
                    if (hasJointAncestor && e.button === 0) handleComponentMouseDown(entry.instanceId, e)
                  }}
                  title={isRoot ? 'Root chassis' : hasJointAncestor ? 'Drag to rotate · right-click to remove' : 'Right-click to remove'}
                >
                  <span className="hangar__bbox-label">{def?.name ?? entry.defId}</span>
                  {occluded && <span className="hangar__bbox-face-tag">REAR</span>}
                </div>
              )
            })}
            {/* Attach-point indicators */}
            {freeParentPoints.map(fp => {
              const point = fp.def.attachPoints.find(p => p.id === fp.pointId)!
              const isEdge = fp.face === 'edge'
              return (
                <div
                  key={`${fp.instanceId}-${fp.pointId}`}
                  className={`hangar__attach-point${isEdge ? ' hangar__attach-point--edge' : ''}`}
                  style={{
                    position: 'absolute',
                    left: s(fp.entry.x + point.front.x - 6),
                    top: s(fp.entry.y + point.front.y - 6),
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAttachPointClick(fp.instanceId, fp.pointId, fp.face, e)
                  }}
                  title={`Attach ${held?.name} → ${fp.pointId}${isEdge ? ' (edge)' : ''}`}
                />
              )
            })}
          </div>

          {/* Edge-facing popover */}
          {pendingEdge && (
            <div
              className="hangar__edge-popover"
              style={{ left: pendingEdge.screenX, top: pendingEdge.screenY }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="hangar__edge-btn"
                onClick={() => handleAttach(pendingEdge.parentInstanceId, pendingEdge.parentPointId, 'forward')}
              >FWD</button>
              <button
                className="hangar__edge-btn"
                onClick={() => handleAttach(pendingEdge.parentInstanceId, pendingEdge.parentPointId, 'backward')}
              >BACK</button>
            </div>
          )}
        </div>

        {/* ─── Stats panel ─── */}
        <div className="hangar__stats">
          <div className="hangar__section-title">MECH STATS</div>
          <div className="hangar__stat">
            <span>INERTIA</span><span>{physics.inertia}</span>
          </div>
          <div className="hangar__stat">
            <span>THRUST</span><span>{physics.thrust}</span>
          </div>
          <div className={`hangar__stat${physics.energy < 0 ? ' hangar__stat--warn' : ''}`}>
            <span>ENERGY</span><span>{physics.energy}</span>
          </div>
          <div className="hangar__divider" />
          <div className={`hangar__status${validation.viable ? ' hangar__status--ok' : ' hangar__status--err'}`}>
            {validation.viable ? 'OPERATIONAL' : 'NOT VIABLE'}
          </div>
          {validation.reasons.map((r, i) => (
            <div key={i} className="hangar__reason">{r}</div>
          ))}
          {error && <div className="hangar__reason">{error}</div>}
          <div className="hangar__section-title" style={{ marginTop: s(16) }}>COMPONENTS ({build.instances.length})</div>
          {build.instances.map(inst => {
            const def = library.find(d => d.id === inst.defId)
            return (
              <div key={inst.instanceId} className="hangar__instance">
                {def?.name ?? inst.defId}
              </div>
            )
          })}
        </div>
      </div>

      <div className="hangar__footer">
        <button className="menu-btn menu-btn--primary" onClick={() => onLaunch(build)}>
          LAUNCH
        </button>
      </div>
    </div>
  )
}
