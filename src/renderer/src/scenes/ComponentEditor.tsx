import { useState, useRef, useLayoutEffect } from 'react'
import type { ComponentDef, ComponentSize, Slot, AttachPoint, AttachFace, SpriteAsset, ViewKind } from '../game/mech/components'
import { s } from '../app/scale'

const SLOTS: Slot[] = ['chassis', 'core', 'armament', 'logistics', 'joint']
const FACES: AttachFace[] = ['front', 'back', 'edge']
const SIZES: ComponentSize[] = ['small', 'medium', 'large']

// Person-to-chassis height ratio per size class.
// small: person is 40% of chassis height
// medium: person is 20% of chassis height
// large: person is 10% of chassis height
const PERSON_RATIO: Record<ComponentSize, number> = { small: 0.4, medium: 0.2, large: 0.1 }

// Target: chassis fills ~40% of canvas height.
const CHASSIS_CANVAS_RATIO = 0.4

interface Props {
  initial?: ComponentDef
  onSave: (def: ComponentDef) => void
  onCancel: () => void
}

let nextPointId = 1

function makePointId(): string {
  return `pt-${Date.now()}-${nextPointId++}`
}

function emptySprite(): SpriteAsset {
  return { url: '', width: 40, height: 40 }
}

function emptyDef(): ComponentDef {
  return {
    id: `comp-${Date.now()}`,
    name: '',
    slot: 'armament',
    size: 'medium',
    physics: { inertia: 0, thrust: 0, energy: 0 },
    sprites: { front: emptySprite(), rear: emptySprite() },
    attachPoints: [],
  }
}

// Simple person silhouette as inline SVG data URL.
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

export default function ComponentEditor({ initial, onSave, onCancel }: Props) {
  const [def, setDef] = useState<ComponentDef>(initial ?? emptyDef)
  const [activeView, setActiveView] = useState<ViewKind>('front')
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null)
  const [draggingPoint, setDraggingPoint] = useState<string | null>(null)
  const [canvasHeight, setCanvasHeight] = useState(400)
  const canvasRef = useRef<HTMLDivElement>(null)
  const canvasAreaRef = useRef<HTMLDivElement>(null)

  const sprite = def.sprites[activeView]
  const hasSprite = sprite.url !== ''
  const size = def.size ?? 'medium'

  // Compute zoom so the chassis sprite fills ~40% of the canvas area height.
  const targetChassisH = canvasHeight * CHASSIS_CANVAS_RATIO
  const zoom = sprite.height > 0 ? targetChassisH / sprite.height : 3

  // Person height in pixels relative to chassis.
  const personRatio = PERSON_RATIO[size]
  const personH = sprite.height * zoom * personRatio
  const personW = personH * (20 / 50) // SVG aspect ratio 20:50

  // Measure canvas area on mount / resize.
  useLayoutEffect(() => {
    const el = canvasAreaRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setCanvasHeight(e.contentRect.height)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // ─── Field updaters ─────────────────────────────────────────────

  function updateField<K extends keyof ComponentDef>(key: K, value: ComponentDef[K]) {
    setDef(prev => ({ ...prev, [key]: value }))
  }

  function updatePhysics(key: string, value: number) {
    setDef(prev => ({ ...prev, physics: { ...prev.physics, [key]: value } }))
  }

  function updateSprite(view: ViewKind, patch: Partial<SpriteAsset>) {
    setDef(prev => ({
      ...prev,
      sprites: { ...prev.sprites, [view]: { ...prev.sprites[view], ...patch } },
    }))
  }

  function updatePoint(pointId: string, patch: Partial<AttachPoint>) {
    setDef(prev => ({
      ...prev,
      attachPoints: prev.attachPoints.map(p => p.id === pointId ? { ...p, ...patch } : p),
    }))
  }

  // ─── PNG import ─────────────────────────────────────────────────

  async function handleImport(view: ViewKind) {
    const result = await window.api.importPng(def.id, view)
    if (!result) return
    const url = `repodata:///${result.relativePath}`
    // Load the image to get natural dimensions.
    const img = new Image()
    img.src = url
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject }).catch(() => {})
    const w = img.naturalWidth || def.sprites[view].width
    const h = img.naturalHeight || def.sprites[view].height
    updateSprite(view, { url, width: w, height: h })
    // If the other view has no sprite yet, reuse the same image for both.
    const otherView: ViewKind = view === 'front' ? 'rear' : 'front'
    if (!def.sprites[otherView].url) {
      const otherResult = await window.api.copySprite(def.id, view, otherView)
      if (otherResult) {
        updateSprite(otherView, { url: `repodata:///${otherResult.relativePath}`, width: w, height: h })
      }
    }
  }

  // ─── Attach point interactions ──────────────────────────────────

  function handleCanvasClick(e: React.MouseEvent) {
    if (draggingPoint) return
    if (!hasSprite) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.round((e.clientX - rect.left) / zoom)
    const y = Math.round((e.clientY - rect.top) / zoom)
    if (x < 0 || y < 0 || x > sprite.width || y > sprite.height) return

    const mirrorX = sprite.width - x
    const newPoint: AttachPoint = {
      id: makePointId(),
      kind: 'mount',
      role: 'child',
      front: activeView === 'front' ? { x, y } : { x: mirrorX, y },
      rear: activeView === 'rear' ? { x, y } : { x: mirrorX, y },
      z: 0,
      face: 'front',
    }
    setDef(prev => ({ ...prev, attachPoints: [...prev.attachPoints, newPoint] }))
    setSelectedPoint(newPoint.id)
  }

  function handlePointMouseDown(pointId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (e.button === 2) {
      // Right-click: delete
      e.preventDefault()
      setDef(prev => ({ ...prev, attachPoints: prev.attachPoints.filter(p => p.id !== pointId) }))
      if (selectedPoint === pointId) setSelectedPoint(null)
      return
    }
    setSelectedPoint(pointId)
    setDraggingPoint(pointId)
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!draggingPoint) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.round(Math.max(0, Math.min(sprite.width, (e.clientX - rect.left) / zoom)))
    const y = Math.round(Math.max(0, Math.min(sprite.height, (e.clientY - rect.top) / zoom)))
    updatePoint(draggingPoint, { [activeView]: { x, y } })
  }

  function handleMouseUp() {
    setDraggingPoint(null)
  }

  // ─── Save ───────────────────────────────────────────────────────

  function handleSave() {
    if (!def.name.trim()) return
    onSave(def)
  }

  // ─── Sprite URL for display ─────────────────────────────────────

  function displayUrl(sa: SpriteAsset): string {
    if (!sa.url) return ''
    return sa.url
  }

  const selected = def.attachPoints.find(p => p.id === selectedPoint) ?? null

  return (
    <div className="comp-editor">
      <div className="comp-editor__header">
        <h2 className="comp-editor__title">{initial ? 'EDIT COMPONENT' : 'NEW COMPONENT'}</h2>
      </div>

      <div className="comp-editor__body">
        {/* ─── Metadata ─── */}
        <div className="comp-editor__meta">
          <div className="comp-editor__section-title">METADATA</div>
          <label className="comp-editor__label">
            NAME
            <input
              className="comp-editor__input"
              value={def.name}
              onChange={e => updateField('name', e.target.value)}
              placeholder="Component name"
            />
          </label>
          <label className="comp-editor__label">
            SLOT
            <select
              className="comp-editor__input"
              value={def.slot}
              onChange={e => updateField('slot', e.target.value as Slot)}
            >
              {SLOTS.map(sl => <option key={sl} value={sl}>{sl.toUpperCase()}</option>)}
            </select>
          </label>
          {def.slot === 'joint' && (
            <label className="comp-editor__checkbox">
              <input
                type="checkbox"
                checked={def.isJoint ?? false}
                onChange={e => updateField('isJoint', e.target.checked || undefined)}
              />
              IS JOINT
            </label>
          )}
          <div className="comp-editor__section-title" style={{ marginTop: s(8) }}>PHYSICS</div>
          {(['inertia', 'thrust', 'energy'] as const).map(attr => (
            <label key={attr} className="comp-editor__label">
              {attr.toUpperCase()}
              <input
                className="comp-editor__input comp-editor__input--num"
                type="number"
                value={def.physics[attr]}
                onChange={e => updatePhysics(attr, parseFloat(e.target.value) || 0)}
              />
            </label>
          ))}

          {/* ─── Size ─── */}
          <div className="comp-editor__section-title" style={{ marginTop: s(8) }}>SIZE</div>
          <div className="comp-editor__size-slider">
            {SIZES.map(sz => (
              <button
                key={sz}
                className={`comp-editor__size-btn${size === sz ? ' comp-editor__size-btn--active' : ''}`}
                onClick={() => updateField('size', sz)}
              >
                {sz.toUpperCase()}
              </button>
            ))}
          </div>

          {/* ─── Sprite import ─── */}
          <div className="comp-editor__section-title" style={{ marginTop: s(8) }}>SPRITES</div>
          {(['front', 'rear'] as const).map(view => (
            <div key={view} className="comp-editor__sprite-row">
              <span className="comp-editor__sprite-label">{view.toUpperCase()}</span>
              {def.sprites[view].url ? (
                <span className="comp-editor__sprite-ok">imported</span>
              ) : (
                <span className="comp-editor__sprite-none">none</span>
              )}
              <button className="comp-editor__import-btn" onClick={() => handleImport(view)}>
                IMPORT PNG
              </button>
            </div>
          ))}
          <div className="comp-editor__dim-row">
            <label className="comp-editor__label">
              W
              <input
                className="comp-editor__input comp-editor__input--num"
                type="number"
                value={def.sprites.front.width}
                onChange={e => {
                  const v = parseInt(e.target.value) || 1
                  updateSprite('front', { width: v })
                  updateSprite('rear', { width: v })
                }}
              />
            </label>
            <label className="comp-editor__label">
              H
              <input
                className="comp-editor__input comp-editor__input--num"
                type="number"
                value={def.sprites.front.height}
                onChange={e => {
                  const v = parseInt(e.target.value) || 1
                  updateSprite('front', { height: v })
                  updateSprite('rear', { height: v })
                }}
              />
            </label>
          </div>
        </div>

        {/* ─── Attach-point canvas ─── */}
        <div ref={canvasAreaRef} className="comp-editor__canvas-area">
          <div className="comp-editor__view-toggle">
            {(['front', 'rear'] as const).map(v => (
              <button
                key={v}
                className={`comp-editor__view-btn${activeView === v ? ' comp-editor__view-btn--active' : ''}`}
                onClick={() => setActiveView(v)}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="comp-editor__canvas-with-person">
            <div
              ref={canvasRef}
              className="comp-editor__canvas"
              style={{
                width: sprite.width * zoom,
                height: sprite.height * zoom,
              }}
              onClick={handleCanvasClick}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onContextMenu={e => e.preventDefault()}
            >
              {hasSprite && (
                <img
                  src={displayUrl(sprite)}
                  className="comp-editor__sprite-img"
                  style={{ width: sprite.width * zoom, height: sprite.height * zoom }}
                  draggable={false}
                />
              )}
              {!hasSprite && (
                <div className="comp-editor__canvas-placeholder">
                  Import a PNG to start placing attach points
                </div>
              )}
              {def.attachPoints.map(pt => {
                const pos = pt[activeView]
                const isSelected = pt.id === selectedPoint
                return (
                  <div
                    key={pt.id}
                    className={`comp-editor__point${isSelected ? ' comp-editor__point--selected' : ''}`}
                    style={{
                      left: pos.x * zoom - 6,
                      top: pos.y * zoom - 6,
                      borderColor: pt.role === 'parent' ? '#e6c200' : '#4a7aff',
                      background: pt.role === 'parent' ? 'rgba(230,194,0,0.4)' : 'rgba(74,122,255,0.4)',
                    }}
                    onMouseDown={e => handlePointMouseDown(pt.id, e)}
                    title={`${pt.id} (${pt.role})`}
                  />
                )
              })}
            </div>
            {/* Person reference silhouette — aligned to bottom of chassis */}
            <div className="comp-editor__person" style={{ height: personH, width: personW }}>
              <img src={PERSON_SVG} style={{ width: personW, height: personH }} draggable={false} />
            </div>
          </div>
          <div className="comp-editor__canvas-hint">
            Click to add point. Drag to move. Right-click to delete.
          </div>
        </div>

        {/* ─── Point properties ─── */}
        <div className="comp-editor__point-props">
          <div className="comp-editor__section-title">ATTACH POINTS ({def.attachPoints.length})</div>
          {def.attachPoints.map(pt => (
            <button
              key={pt.id}
              className={`comp-editor__point-list-item${pt.id === selectedPoint ? ' comp-editor__point-list-item--active' : ''}`}
              onClick={() => setSelectedPoint(pt.id)}
            >
              {pt.id.slice(0, 12)} ({pt.role})
            </button>
          ))}
          {selected && (
            <>
              <div className="comp-editor__section-title" style={{ marginTop: s(8) }}>SELECTED POINT</div>
              <label className="comp-editor__label">
                ID
                <input
                  className="comp-editor__input"
                  value={selected.id}
                  onChange={e => {
                    const newId = e.target.value
                    setDef(prev => ({
                      ...prev,
                      attachPoints: prev.attachPoints.map(p => p.id === selected.id ? { ...p, id: newId } : p),
                    }))
                    setSelectedPoint(newId)
                  }}
                />
              </label>
              <label className="comp-editor__label">
                ROLE
                <select
                  className="comp-editor__input"
                  value={selected.role}
                  onChange={e => updatePoint(selected.id, { role: e.target.value as 'parent' | 'child' })}
                >
                  <option value="parent">PARENT</option>
                  <option value="child">CHILD</option>
                </select>
              </label>
              <label className="comp-editor__label">
                FACE
                <select
                  className="comp-editor__input"
                  value={selected.face}
                  onChange={e => updatePoint(selected.id, { face: e.target.value as AttachFace })}
                >
                  {FACES.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                </select>
              </label>
              <label className="comp-editor__label">
                KIND
                <input
                  className="comp-editor__input"
                  value={selected.kind}
                  onChange={e => updatePoint(selected.id, { kind: e.target.value })}
                />
              </label>
              <label className="comp-editor__label">
                Z
                <input
                  className="comp-editor__input comp-editor__input--num"
                  type="number"
                  value={selected.z}
                  onChange={e => updatePoint(selected.id, { z: parseFloat(e.target.value) || 0 })}
                />
              </label>
              <div className="comp-editor__coords">
                FRONT: ({selected.front.x}, {selected.front.y}) &nbsp;
                REAR: ({selected.rear.x}, {selected.rear.y})
              </div>
            </>
          )}
        </div>
      </div>

      <div className="comp-editor__footer">
        <button className="menu-btn" onClick={onCancel}>CANCEL</button>
        <button
          className="menu-btn menu-btn--primary"
          onClick={handleSave}
          disabled={!def.name.trim()}
        >
          SAVE
        </button>
      </div>
    </div>
  )
}
