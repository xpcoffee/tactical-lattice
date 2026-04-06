// Build layout: computes screen-space positions for each component instance
// given a MechBuild and a view (front or rear).
// Pure functions — no rendering deps.

import type {
  MechBuild,
  ComponentDef,
  ViewKind,
  SpriteAsset,
  AttachFace,
  EdgeFacing,
  EffectiveFacing,
} from './components'
import { collectDescendants } from './components'

export interface LayoutEntry {
  instanceId: string
  defId: string
  /** Top-left x in composite pixel space. */
  x: number
  /** Top-left y in composite pixel space. */
  y: number
  /** Depth layer for z-ordering. */
  z: number
  sprite: SpriteAsset
  /** Which direction this component effectively faces. */
  effectiveFacing: EffectiveFacing
  /** False when occluded in this view (e.g. back-mounted component in front view). */
  visible: boolean
  /** Cumulative rotation from ancestor joints (degrees). */
  rotation: number
  /** Rotation pivot x in composite space (only meaningful when rotation !== 0). */
  rotationPivotX: number
  /** Rotation pivot y in composite space (only meaningful when rotation !== 0). */
  rotationPivotY: number
}

// ─── Pure helpers ───────────────────────────────────────────────────

export function opposite(f: EffectiveFacing): EffectiveFacing {
  return f === 'forward' ? 'backward' : 'forward'
}

/**
 * Which sprite view to use for a component with the given effective facing
 * when the camera is looking from `view`.
 *
 * Forward-facing + front camera → front sprite
 * Backward-facing + front camera → rear sprite (seeing the back of a flipped component)
 */
export function resolveView(facing: EffectiveFacing, view: ViewKind): ViewKind {
  if (view === 'front') return facing === 'forward' ? 'front' : 'rear'
  return facing === 'forward' ? 'rear' : 'front'
}

/**
 * Is a parent attach-point's surface visible from this camera view?
 * Edge faces are always visible. Front/back depends on parent's effective facing.
 */
export function isVisibleFromView(
  face: AttachFace,
  parentFacing: EffectiveFacing,
  view: ViewKind,
): boolean {
  if (face === 'edge') return true
  // A 'front' face on a forward-facing parent faces the front camera.
  const faceFacesForward = (face === 'front') === (parentFacing === 'forward')
  return (view === 'front') === faceFacesForward
}

/**
 * Compute a child's effective facing based on the parent's facing,
 * the parent attach-point face, and the edge facing direction.
 */
export function computeChildFacing(
  parentFacing: EffectiveFacing,
  parentFace: AttachFace,
  edgeFacing?: EdgeFacing,
): EffectiveFacing {
  if (parentFace === 'front') return parentFacing
  if (parentFace === 'back') return opposite(parentFacing)
  // edge: edgeFacing is relative to parent's effective facing
  const raw = edgeFacing ?? 'forward'
  if (parentFacing === 'forward') return raw === 'forward' ? 'forward' : 'backward'
  return raw === 'forward' ? 'backward' : 'forward'
}

// ─── Layout ─────────────────────────────────────────────────────────

function getDef(defs: ComponentDef[], defId: string): ComponentDef | undefined {
  return defs.find(d => d.id === defId)
}

/**
 * Walk the build tree from root, computing each component's position,
 * effective facing, visibility, and joint rotation metadata.
 *
 * Returns a depth-sorted list (lowest z first → render back-to-front).
 */
export function layoutBuild(
  build: MechBuild,
  defs: ComponentDef[],
  view: ViewKind,
): LayoutEntry[] {
  const entries: LayoutEntry[] = []

  const rootInst = build.instances.find(i => i.instanceId === build.rootInstanceId)
  if (!rootInst) return entries

  const rootDef = getDef(defs, rootInst.defId)
  if (!rootDef) return entries

  // Per-instance tracking.
  const positions = new Map<string, { x: number; y: number }>()
  const facings = new Map<string, EffectiveFacing>()
  const cumulativeRotations = new Map<string, number>()

  positions.set(rootInst.instanceId, { x: 0, y: 0 })
  facings.set(rootInst.instanceId, 'forward')
  cumulativeRotations.set(rootInst.instanceId, 0)

  entries.push({
    instanceId: rootInst.instanceId,
    defId: rootInst.defId,
    x: 0,
    y: 0,
    z: 0,
    sprite: rootDef.sprites[view],
    effectiveFacing: 'forward',
    visible: true, // root is always visible
    rotation: 0,
    rotationPivotX: 0,
    rotationPivotY: 0,
  })

  // BFS from root through attachments.
  const queue = [rootInst.instanceId]
  const visited = new Set<string>([rootInst.instanceId])

  while (queue.length > 0) {
    const parentId = queue.shift()!
    const parentPos = positions.get(parentId)!
    const parentFacing = facings.get(parentId)!
    const parentRot = cumulativeRotations.get(parentId)!
    const parentInst = build.instances.find(i => i.instanceId === parentId)!
    const parentDef = getDef(defs, parentInst.defId)
    if (!parentDef) continue

    for (const att of build.attachments) {
      if (att.parentInstanceId !== parentId) continue
      if (visited.has(att.childInstanceId)) continue
      visited.add(att.childInstanceId)

      const childInst = build.instances.find(i => i.instanceId === att.childInstanceId)
      if (!childInst) continue
      const childDef = getDef(defs, childInst.defId)
      if (!childDef) continue

      const pPoint = parentDef.attachPoints.find(p => p.id === att.parentAttachPointId)
      const cPoint = childDef.attachPoints.find(p => p.id === att.childAttachPointId)
      if (!pPoint || !cPoint) continue

      // Effective facing.
      const childFacing = computeChildFacing(parentFacing, pPoint.face, att.edgeFacing)
      facings.set(att.childInstanceId, childFacing)

      // Resolve which sprite coords to use.
      const parentResolved = resolveView(parentFacing, view)
      const childResolved = resolveView(childFacing, view)

      // Position: align attach points.
      const childX = parentPos.x + pPoint[parentResolved].x - cPoint[childResolved].x
      const childY = parentPos.y + pPoint[parentResolved].y - cPoint[childResolved].y
      positions.set(att.childInstanceId, { x: childX, y: childY })

      // Visibility.
      const visible = isVisibleFromView(pPoint.face, parentFacing, view)

      // Joint rotation: accumulate if parent is a joint.
      let childRot = parentRot
      if (parentDef.isJoint) {
        childRot += parentInst.rotation ?? 0
      }
      cumulativeRotations.set(att.childInstanceId, childRot)

      entries.push({
        instanceId: att.childInstanceId,
        defId: childInst.defId,
        x: childX,
        y: childY,
        z: cPoint.z,
        sprite: childDef.sprites[childResolved],
        effectiveFacing: childFacing,
        visible,
        rotation: childRot,
        rotationPivotX: 0,
        rotationPivotY: 0,
      })

      queue.push(att.childInstanceId)
    }
  }

  // Post-process: set rotation pivots for joint subtrees.
  for (const att of build.attachments) {
    const parentInst = build.instances.find(i => i.instanceId === att.parentInstanceId)
    if (!parentInst) continue
    const parentDef = getDef(defs, parentInst.defId)
    if (!parentDef?.isJoint) continue
    const rotation = parentInst.rotation ?? 0
    if (rotation === 0) continue

    const parentPos = positions.get(att.parentInstanceId)
    if (!parentPos) continue
    const pPoint = parentDef.attachPoints.find(p => p.id === att.parentAttachPointId)
    if (!pPoint) continue

    const parentResolved = resolveView(
      facings.get(att.parentInstanceId) ?? 'forward',
      view,
    )
    const pivotX = parentPos.x + pPoint[parentResolved].x
    const pivotY = parentPos.y + pPoint[parentResolved].y

    const subtree = collectDescendants(build, att.childInstanceId)
    for (const entry of entries) {
      if (subtree.has(entry.instanceId)) {
        entry.rotationPivotX = pivotX
        entry.rotationPivotY = pivotY
      }
    }
  }

  // Sort by z (back to front).
  entries.sort((a, b) => a.z - b.z)
  return entries
}

/**
 * Compute the bounding box of the full composite in pixel space.
 * Useful for centering the composite in a container.
 */
export function layoutBounds(entries: LayoutEntry[]): { x: number; y: number; width: number; height: number } {
  if (entries.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const e of entries) {
    minX = Math.min(minX, e.x)
    minY = Math.min(minY, e.y)
    maxX = Math.max(maxX, e.x + e.sprite.width)
    maxY = Math.max(maxY, e.y + e.sprite.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
