// Developer component library — placeholder definitions for testing.
// Uses 1×1 data-URL PNGs tinted per slot; real art comes later.

import type { ComponentDef, MechBuild, ComponentInstance, BuildAttachment } from './components'

// Tiny coloured 1×1 PNGs (rendered at component dimensions with imageRendering: pixelated).
// Generated as base64 so the library has zero external dependencies.
const TINT = {
  chassis:   'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12NgYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==', // grey
  core:      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12P4z8D4HwAFAAH/VscqYQAAAABJRU5ErkJggg==', // yellow
  armament:  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12P4z8BQDwAEgAF/vCksmAAAAABJRU5ErkJggg==', // red
  logistics: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12Ng+M/AAAADAQEAhehnMQAAAABJRU5ErkJggg==', // blue
  joint:     'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12Ng+M9QDwAEgAF/ER3FnwAAAABJRU5ErkJggg==', // green
} as const

function sprite(tint: string, w: number, h: number) {
  return { url: tint, width: w, height: h }
}

// ─── Component definitions ──────────────────────────────────────────

export const DEV_CHASSIS: ComponentDef = {
  id: 'dev-chassis-mk1',
  name: 'MK-I Frame',
  slot: 'chassis',
  physics: { inertia: 3, thrust: 0, energy: 0 },
  sprites: {
    front: sprite(TINT.chassis, 80, 120),
    rear:  sprite(TINT.chassis, 80, 120),
  },
  attachPoints: [
    { id: 'head-mount',     kind: 'head',       role: 'parent', front: { x: 40, y: 5 },   rear: { x: 40, y: 5 },   z: 1,  face: 'front' },
    { id: 'left-shoulder',  kind: 'shoulder',    role: 'parent', front: { x: 0, y: 20 },   rear: { x: 80, y: 20 },  z: 0,  face: 'edge' },
    { id: 'right-shoulder', kind: 'shoulder',    role: 'parent', front: { x: 80, y: 20 },  rear: { x: 0, y: 20 },   z: 0,  face: 'edge' },
    { id: 'core-slot',      kind: 'core-mount',  role: 'parent', front: { x: 40, y: 50 },  rear: { x: 40, y: 50 },  z: 2,  face: 'front' },
    { id: 'logistics-bay',  kind: 'logistics',   role: 'parent', front: { x: 40, y: 100 }, rear: { x: 40, y: 100 }, z: -1, face: 'back' },
  ],
}

export const DEV_CORE: ComponentDef = {
  id: 'dev-core-rc1',
  name: 'RC-1 Core',
  slot: 'core',
  physics: { inertia: 1, thrust: 0, energy: 5 },
  sprites: {
    front: sprite(TINT.core, 30, 30),
    rear:  sprite(TINT.core, 30, 30),
  },
  attachPoints: [
    { id: 'core-child', kind: 'core-mount', role: 'child', front: { x: 15, y: 15 }, rear: { x: 15, y: 15 }, z: 2, face: 'front' },
  ],
}

export const DEV_ARM_CANNON: ComponentDef = {
  id: 'dev-arm-cannon',
  name: 'Arm Cannon',
  slot: 'armament',
  physics: { inertia: 1, thrust: -5, energy: -3 },
  sprites: {
    front: sprite(TINT.armament, 20, 60),
    rear:  sprite(TINT.armament, 20, 60),
  },
  attachPoints: [
    { id: 'arm-child', kind: 'shoulder', role: 'child', front: { x: 10, y: 5 }, rear: { x: 10, y: 5 }, z: 0, face: 'edge' },
  ],
}

export const DEV_REPAIR_DRONE: ComponentDef = {
  id: 'dev-repair-drone',
  name: 'Repair Drone',
  slot: 'logistics',
  physics: { inertia: 0, thrust: 0, energy: -1 },
  sprites: {
    front: sprite(TINT.logistics, 24, 24),
    rear:  sprite(TINT.logistics, 24, 24),
  },
  attachPoints: [
    { id: 'drone-child', kind: 'logistics', role: 'child', front: { x: 12, y: 12 }, rear: { x: 12, y: 12 }, z: -1, face: 'back' },
  ],
}

export const DEV_JOINT: ComponentDef = {
  id: 'dev-joint',
  name: 'Joint',
  slot: 'joint',
  isJoint: true,
  physics: { inertia: 0.5, thrust: 0, energy: 0 },
  sprites: {
    front: sprite(TINT.joint, 12, 12),
    rear:  sprite(TINT.joint, 12, 12),
  },
  attachPoints: [
    { id: 'joint-child',  kind: '*', role: 'child',  front: { x: 6, y: 6 }, rear: { x: 6, y: 6 }, z: 0, face: 'edge' },
    { id: 'joint-parent', kind: '*', role: 'parent', front: { x: 6, y: 6 }, rear: { x: 6, y: 6 }, z: 0, face: 'edge' },
  ],
}

/** All dev components. */
export const DEV_LIBRARY: ComponentDef[] = [
  DEV_CHASSIS,
  DEV_CORE,
  DEV_ARM_CANNON,
  DEV_REPAIR_DRONE,
  DEV_JOINT,
]

// ─── Dev default build ──────────────────────────────────────────────

const devInstances: ComponentInstance[] = [
  { instanceId: 'i-chassis',   defId: 'dev-chassis-mk1' },
  { instanceId: 'i-core',      defId: 'dev-core-rc1' },
  { instanceId: 'i-left-arm',  defId: 'dev-arm-cannon' },
  { instanceId: 'i-right-arm', defId: 'dev-arm-cannon' },
]

const devAttachments: BuildAttachment[] = [
  { parentInstanceId: 'i-chassis', parentAttachPointId: 'core-slot',       childInstanceId: 'i-core',      childAttachPointId: 'core-child' },
  { parentInstanceId: 'i-chassis', parentAttachPointId: 'left-shoulder',   childInstanceId: 'i-left-arm',  childAttachPointId: 'arm-child', edgeFacing: 'forward' },
  { parentInstanceId: 'i-chassis', parentAttachPointId: 'right-shoulder',  childInstanceId: 'i-right-arm', childAttachPointId: 'arm-child', edgeFacing: 'forward' },
]

export const DEV_DEFAULT_BUILD: MechBuild = {
  id: 'dev-default',
  name: 'Dev Mech',
  rootInstanceId: 'i-chassis',
  instances: devInstances,
  attachments: devAttachments,
}
