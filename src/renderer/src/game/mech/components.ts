// Mech component system: types, attachment logic, and build validation.
// Pure functions — no engine dependencies, fully testable in Node.

import { type PhysicsAttributes, sumAttributes, isViable } from './physics'

// ─── Component definitions ──────────────────────────────────────────

export type Slot = 'core' | 'chassis' | 'armament' | 'logistics' | 'joint'
export type ViewKind = 'front' | 'rear'
export type AttachFace = 'front' | 'back' | 'edge'
export type EdgeFacing = 'forward' | 'backward'
export type EffectiveFacing = 'forward' | 'backward'

export interface SpriteAsset {
  url: string
  width: number
  height: number
}

export interface AttachPoint {
  id: string
  /** Match tag — points with the same kind and opposite role can snap. */
  kind: string
  role: 'parent' | 'child'
  /** Position in front-sprite pixel coords (origin = top-left). */
  front: { x: number; y: number }
  /** Position in rear-sprite pixel coords (origin = top-left). */
  rear: { x: number; y: number }
  /** Depth layer for z-ordering during composite rendering. */
  z: number
  /** Which surface of the component this point sits on. */
  face: AttachFace
}

export interface ComponentDef {
  id: string
  name: string
  slot: Slot
  physics: PhysicsAttributes
  sprites: Record<ViewKind, SpriteAsset>
  attachPoints: AttachPoint[]
  /** When true, this component acts as a rotatable joint. */
  isJoint?: boolean
}

// ─── Build (assembled mech) ─────────────────────────────────────────

export interface ComponentInstance {
  instanceId: string
  defId: string
  /** Rotation in degrees. Only meaningful for joint components. */
  rotation?: number
}

export interface BuildAttachment {
  parentInstanceId: string
  parentAttachPointId: string
  childInstanceId: string
  childAttachPointId: string
  /** Required when parent attach point face === 'edge'. */
  edgeFacing?: EdgeFacing
}

export interface MechBuild {
  id: string
  name: string
  rootInstanceId: string
  instances: ComponentInstance[]
  attachments: BuildAttachment[]
}

// ─── Helpers ────────────────────────────────────────────────────────

function getDef(defs: ComponentDef[], defId: string): ComponentDef | undefined {
  return defs.find(d => d.id === defId)
}

function getInstance(build: MechBuild, instanceId: string): ComponentInstance | undefined {
  return build.instances.find(i => i.instanceId === instanceId)
}

function getAttachPoint(def: ComponentDef, pointId: string): AttachPoint | undefined {
  return def.attachPoints.find(p => p.id === pointId)
}

/** IDs of attach points on an instance that are already used (as parent or child). */
function usedAttachPointIds(build: MechBuild, instanceId: string): Set<string> {
  const used = new Set<string>()
  for (const a of build.attachments) {
    if (a.parentInstanceId === instanceId) used.add(a.parentAttachPointId)
    if (a.childInstanceId === instanceId) used.add(a.childAttachPointId)
  }
  return used
}

// ─── Snap / attach ──────────────────────────────────────────────────

/** Can these two attach points snap together?
 *  Only checks role compatibility — any child can attach to any parent. */
export function canSnap(
  parentPoint: AttachPoint,
  childPoint: AttachPoint,
): boolean {
  return parentPoint.role === 'parent' && childPoint.role === 'child'
}

/** Attach a child instance to a parent instance. Returns a new build or an error string. */
export function attach(
  build: MechBuild,
  defs: ComponentDef[],
  parentInstanceId: string,
  parentAttachPointId: string,
  childInstanceId: string,
  childAttachPointId: string,
  edgeFacing?: EdgeFacing,
): MechBuild | string {
  const parentInst = getInstance(build, parentInstanceId)
  const childInst = getInstance(build, childInstanceId)
  if (!parentInst) return `Unknown parent instance: ${parentInstanceId}`
  if (!childInst) return `Unknown child instance: ${childInstanceId}`

  const parentDef = getDef(defs, parentInst.defId)
  const childDef = getDef(defs, childInst.defId)
  if (!parentDef) return `Unknown component def: ${parentInst.defId}`
  if (!childDef) return `Unknown component def: ${childInst.defId}`

  const pPoint = getAttachPoint(parentDef, parentAttachPointId)
  const cPoint = getAttachPoint(childDef, childAttachPointId)
  if (!pPoint) return `Unknown attach point ${parentAttachPointId} on ${parentDef.name}`
  if (!cPoint) return `Unknown attach point ${childAttachPointId} on ${childDef.name}`

  if (!canSnap(pPoint, cPoint)) return `Points ${pPoint.id} and ${cPoint.id} cannot snap (kind or role mismatch)`

  if (pPoint.face === 'edge' && edgeFacing === undefined) {
    return `Edge attach point ${pPoint.id} requires an edgeFacing direction`
  }
  if (pPoint.face !== 'edge' && edgeFacing !== undefined) {
    return `edgeFacing is only valid for edge attach points`
  }

  const parentUsed = usedAttachPointIds(build, parentInstanceId)
  const childUsed = usedAttachPointIds(build, childInstanceId)
  if (parentUsed.has(parentAttachPointId)) return `Attach point ${parentAttachPointId} is already in use`
  if (childUsed.has(childAttachPointId)) return `Attach point ${childAttachPointId} is already in use`

  return {
    ...build,
    attachments: [
      ...build.attachments,
      { parentInstanceId, parentAttachPointId, childInstanceId, childAttachPointId, edgeFacing },
    ],
  }
}

/** Detach a child instance (and its entire subtree). Returns a new build. */
export function detach(build: MechBuild, childInstanceId: string): MechBuild {
  const toRemove = new Set<string>()
  const queue = [childInstanceId]
  while (queue.length > 0) {
    const id = queue.shift()!
    toRemove.add(id)
    for (const a of build.attachments) {
      if (a.parentInstanceId === id && !toRemove.has(a.childInstanceId)) {
        queue.push(a.childInstanceId)
      }
    }
  }

  return {
    ...build,
    instances: build.instances.filter(i => !toRemove.has(i.instanceId)),
    attachments: build.attachments.filter(
      a => !toRemove.has(a.parentInstanceId) && !toRemove.has(a.childInstanceId),
    ),
  }
}

/** Collect all descendant instance IDs (including the given instance). */
export function collectDescendants(build: MechBuild, instanceId: string): Set<string> {
  const result = new Set<string>()
  const queue = [instanceId]
  while (queue.length > 0) {
    const id = queue.shift()!
    result.add(id)
    for (const a of build.attachments) {
      if (a.parentInstanceId === id && !result.has(a.childInstanceId)) {
        queue.push(a.childInstanceId)
      }
    }
  }
  return result
}

// ─── Physics aggregation ────────────────────────────────────────────

export function buildPhysics(build: MechBuild, defs: ComponentDef[]): PhysicsAttributes {
  const attrs = build.instances
    .map(i => getDef(defs, i.defId)?.physics)
    .filter((p): p is PhysicsAttributes => p !== undefined)
  return sumAttributes(attrs)
}

// ─── Validation ─────────────────────────────────────────────────────

export interface BuildValidation {
  viable: boolean
  reasons: string[]
}

export function validateBuild(build: MechBuild, defs: ComponentDef[]): BuildValidation {
  const reasons: string[] = []

  const slots = new Set(
    build.instances
      .map(i => getDef(defs, i.defId)?.slot)
      .filter((s): s is Slot => s !== undefined),
  )
  if (!slots.has('chassis')) reasons.push('No chassis installed')
  if (!slots.has('core')) reasons.push('No core installed')

  const physics = buildPhysics(build, defs)
  if (!isViable(physics)) reasons.push(`Net energy is ${physics.energy} (must be >= 0)`)

  return { viable: reasons.length === 0, reasons }
}
