import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { AppScene } from '../app/scenes'
import type { ComponentDef, ComponentSize, MechBuild, Slot, EdgeFacing, ViewKind } from '../game/mech/components'
import { s } from '../app/scale'
import { attach, detach, buildPhysics, validateBuild } from '../game/mech/components'
import { layoutBuild, layoutBounds, type LayoutEntry } from '../game/mech/assembly'
import { DEV_CHASSIS } from '../game/mech/library.dev'
import { loadLibrary, getLibrary } from '../game/mech/library'
import ComponentEditor from './ComponentEditor'

interface HangarProps {
  devMode: boolean
  onLaunch: (build: MechBuild) => void
  onNavigate: (scene: AppScene) => void
}

let nextInstanceId = 1
function makeInstanceId(): string {
  return `inst-${nextInstanceId++}`
}

let nextBuildId = 1
function makeBuildId(): string {
  return `build-${Date.now()}-${nextBuildId++}`
}

function freshBuild(): MechBuild {
  const chassisInstId = makeInstanceId()
  return {
    id: makeBuildId(),
    name: 'My Mech',
    rootInstanceId: chassisInstId,
    instances: [{ instanceId: chassisInstId, defId: DEV_CHASSIS.id }],
    attachments: [],
  }
}

const SLOT_ORDER: Slot[] = ['chassis', 'core', 'armament', 'logistics', 'joint']
const SLOT_LABELS: Record<Slot, string> = { chassis: 'CHASSIS', core: 'CORE', armament: 'ARMAMENT', logistics: 'LOGISTICS', joint: 'JOINT' }
const SLOT_COLORS: Record<Slot, string> = { chassis: '#888', core: '#e6c200', armament: '#cc4444', logistics: '#4a7aff', joint: '#66aa66' }

const PERSON_RATIO: Record<ComponentSize, number> = { small: 0.4, medium: 0.2, large: 0.1 }
const PERSON_SVG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 50" fill="none" stroke="#e6c200" stroke-width="1.5" stroke-linecap="round">
    <circle cx="10" cy="5" r="4"/>
    <line x1="10" y1="9" x2="10" y2="30"/>
    <line x1="10" y1="14" x2="3" y2="22"/>
    <line x1="10" y1="14" x2="17" y2="22"/>
    <line x1="10" y1="30" x2="4" y2="46"/>
    <line x1="10" y1="30" x2="16" y2="46"/>
  </svg>`,
)}`

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
  const [savedBuilds, setSavedBuilds] = useState<MechBuild[]>([])
  const [library, setLibrary] = useState<ComponentDef[]>(getLibrary)
  const [editingDef, setEditingDef] = useState<ComponentDef | null>(null)
  const [hangarView, setHangarView] = useState<ViewKind>('front')
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadLibrary().then(setLibrary)
    window.api.loadBuilds().then(setSavedBuilds)
  }, [])

  async function refreshLibrary() {
    setLibrary(await loadLibrary())
  }

  async function handleSaveBuild() {
    await window.api.saveBuild(build)
    setSavedBuilds(await window.api.loadBuilds())
  }

  async function handleLoadBuild(b: MechBuild) {
    setBuild(b)
    setHeld(null)
    setError(null)
    setPendingEdge(null)
  }

  async function handleDeleteBuild(id: string) {
    await window.api.deleteBuild(id)
    setSavedBuilds(await window.api.loadBuilds())
  }

  async function handleSaveComponent(def: ComponentDef) {
    // Store sprite URLs as relative paths for persistence.
    await window.api.saveComponentDef(def)
    await refreshLibrary()
    setEditingDef(null)
  }
  const layout = useMemo(() => layoutBuild(build, library, hangarView), [build, hangarView, library])
  const bounds = useMemo(() => layoutBounds(layout), [layout])
  const physics = useMemo(() => buildPhysics(build, library), [build])
  const validation = useMemo(() => validateBuild(build, library), [build])

  // Group library by slot for the palette.
  const palette = useMemo(() => {
    const groups = new Map<Slot, ComponentDef[]>()
    for (const def of library) {
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
    const pivotX = (jointEntry.x * buildZoom + parentPoint[hangarView].x * buildZoom + offsetX) * scaleFactor
    const pivotY = (jointEntry.y * buildZoom + parentPoint[hangarView].y * buildZoom + offsetY) * scaleFactor

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

  // Person-for-scale: sized relative to the chassis root's size class.
  const chassisDef = library.find(d => d.id === build.instances.find(i => i.instanceId === build.rootInstanceId)?.defId)
  const chassisSize: ComponentSize = chassisDef?.size ?? 'medium'
  const personRatio = PERSON_RATIO[chassisSize]

  // Canvas dimensions and zoom to fit the build inside.
  const canvasW = 300
  const canvasH = 300
  const padding = 20
  const buildZoom = bounds.width > 0 && bounds.height > 0
    ? Math.min((canvasW - padding * 2) / bounds.width, (canvasH - padding * 2) / bounds.height, 1)
    : 1
  const z = (px: number) => s(px * buildZoom)

  const personH = bounds.height * buildZoom * personRatio
  const personW = personH * (20 / 50)

  const scaledW = bounds.width * buildZoom
  const scaledH = bounds.height * buildZoom
  const offsetX = (canvasW - scaledW) / 2 - bounds.x * buildZoom
  const offsetY = (canvasH - scaledH) / 2 - bounds.y * buildZoom

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
          {SLOT_ORDER.map(slot => {
            const defs = palette.get(slot)
            if (!defs) return null
            return (
              <div key={slot}>
                <div className="hangar__slot-label">{SLOT_LABELS[slot]}</div>
                {defs.map(def => (
                  <button
                    key={def.id}
                    className={`hangar__comp-btn${held?.id === def.id ? ' hangar__comp-btn--held' : ''}`}
                    onClick={() => {
                      if (def.slot === 'chassis') {
                        // Swap root chassis — keep existing attachments if possible.
                        setBuild(prev => ({
                          ...prev,
                          instances: prev.instances.map(i =>
                            i.instanceId === prev.rootInstanceId ? { ...i, defId: def.id } : i
                          ),
                        }))
                        setHeld(null)
                      } else {
                        setHeld(held?.id === def.id ? null : def)
                      }
                      setPendingEdge(null)
                    }}
                    onContextMenu={(e) => { e.preventDefault(); setEditingDef(def) }}
                    title={def.slot === 'chassis' ? 'Click to swap chassis · right-click to edit' : 'Click to hold · right-click to edit'}
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
          <div className="hangar__divider" />
          <button
            className="hangar__save-btn"
            onClick={() => setEditingDef({} as ComponentDef)}
          >
            NEW COMPONENT
          </button>
        </div>

        {/* ─── Schematic canvas / Component editor ─── */}
        {editingDef !== null ? (
          <ComponentEditor
            initial={editingDef.id ? editingDef : undefined}
            onSave={handleSaveComponent}
            onCancel={() => setEditingDef(null)}
          />
        ) : (
        /* ─── Schematic canvas ─── */
        <div className="hangar__canvas-wrapper">
        <div className="hangar__view-toggle">
          {(['front', 'rear'] as const).map(v => (
            <button
              key={v}
              className={`hangar__view-btn${hangarView === v ? ' hangar__view-btn--active' : ''}`}
              onClick={() => setHangarView(v)}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
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
                transformOrigin: `${z(entry.rotationPivotX - entry.x)} ${z(entry.rotationPivotY - entry.y)}`,
              } : {}
              return (
                <div
                  key={entry.instanceId}
                  className={`hangar__bbox${!isRoot ? ' hangar__bbox--detachable' : ''}${occluded ? ' hangar__bbox--occluded' : ''}${hasJointAncestor ? ' hangar__bbox--jointed' : ''}`}
                  style={{
                    position: 'absolute',
                    left: z(entry.x),
                    top: z(entry.y),
                    width: z(entry.sprite.width),
                    height: z(entry.sprite.height),
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
                  {entry.sprite.url && !entry.sprite.url.startsWith('data:') && (
                    <img
                      src={entry.sprite.url}
                      className="hangar__bbox-sprite"
                      draggable={false}
                    />
                  )}
                  <span className="hangar__bbox-label">{def?.name ?? entry.defId}</span>
                  {occluded && <span className="hangar__bbox-face-tag">REAR</span>}
                </div>
              )
            })}
            {/* Person-for-scale reference */}
            <img
              src={PERSON_SVG}
              className="hangar__person"
              style={{
                position: 'absolute',
                left: z(bounds.x + bounds.width + 8 / buildZoom),
                top: s(offsetY + scaledH - personH),
                width: s(personW),
                height: s(personH),
              }}
              draggable={false}
            />
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
                    left: z(fp.entry.x + point[hangarView].x - 6 / buildZoom),
                    top: z(fp.entry.y + point[hangarView].y - 6 / buildZoom),
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
        </div>
        )}

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
          <div className="hangar__divider" />
          <div className="hangar__section-title">BUILD</div>
          <input
            className="hangar__name-input"
            value={build.name}
            onChange={e => setBuild(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Build name"
          />
          <button className="hangar__save-btn" onClick={handleSaveBuild}>SAVE</button>
          <button className="hangar__save-btn" onClick={() => setBuild(freshBuild())}>NEW</button>
          {savedBuilds.length > 0 && (
            <>
              <div className="hangar__section-title" style={{ marginTop: s(8) }}>SAVED BUILDS</div>
              {savedBuilds.map(sb => (
                <div key={sb.id} className="hangar__saved-build">
                  <button
                    className={`hangar__saved-build-name${sb.id === build.id ? ' hangar__saved-build-name--active' : ''}`}
                    onClick={() => handleLoadBuild(sb)}
                  >
                    {sb.name}
                  </button>
                  <button
                    className="hangar__saved-build-del"
                    onClick={() => handleDeleteBuild(sb.id)}
                    title="Delete build"
                  >×</button>
                </div>
              ))}
            </>
          )}
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
