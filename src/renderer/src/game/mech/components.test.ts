import { describe, it, expect } from 'vitest'
import {
  canSnap,
  attach,
  detach,
  buildPhysics,
  validateBuild,
  collectDescendants,
  type ComponentDef,
  type MechBuild,
  type AttachPoint,
} from './components'
import { DEV_LIBRARY, DEV_DEFAULT_BUILD, DEV_CHASSIS, DEV_CORE, DEV_ARM_CANNON, DEV_REPAIR_DRONE } from './library.dev'

// ─── canSnap ────────────────────────────────────────────────────────

describe('canSnap', () => {
  const parent: AttachPoint = { id: 'p', kind: 'shoulder', role: 'parent', front: { x: 0, y: 0 }, rear: { x: 0, y: 0 }, z: 0, face: 'front' }
  const child:  AttachPoint = { id: 'c', kind: 'shoulder', role: 'child',  front: { x: 0, y: 0 }, rear: { x: 0, y: 0 }, z: 0, face: 'front' }

  it('returns true for matching kind + opposite roles', () => {
    expect(canSnap(parent, child)).toBe(true)
  })

  it('matches regardless of kind', () => {
    expect(canSnap(parent, { ...child, kind: 'head' })).toBe(true)
  })

  it('returns false when both are parents', () => {
    expect(canSnap(parent, { ...child, role: 'parent' })).toBe(false)
  })

  it('returns false when both are children', () => {
    expect(canSnap({ ...parent, role: 'child' }, child)).toBe(false)
  })

  it('ignores face when determining snap compatibility', () => {
    expect(canSnap({ ...parent, face: 'edge' }, { ...child, face: 'back' })).toBe(true)
  })

})

// ─── attach ─────────────────────────────────────────────────────────

describe('attach', () => {
  const emptyBuild: MechBuild = {
    id: 'test',
    name: 'Test',
    rootInstanceId: 'i-chassis',
    instances: [
      { instanceId: 'i-chassis', defId: 'dev-chassis-mk1' },
      { instanceId: 'i-core',    defId: 'dev-core-rc1' },
    ],
    attachments: [],
  }

  it('attaches matching points (non-edge)', () => {
    const result = attach(emptyBuild, DEV_LIBRARY, 'i-chassis', 'core-slot', 'i-core', 'core-child')
    expect(typeof result).not.toBe('string')
    const build = result as MechBuild
    expect(build.attachments).toHaveLength(1)
    expect(build.attachments[0].parentInstanceId).toBe('i-chassis')
    expect(build.attachments[0].edgeFacing).toBeUndefined()
  })

  it('attaches to edge point with edgeFacing', () => {
    const buildWithArm: MechBuild = {
      ...emptyBuild,
      instances: [...emptyBuild.instances, { instanceId: 'i-arm', defId: 'dev-arm-cannon' }],
    }
    const result = attach(buildWithArm, DEV_LIBRARY, 'i-chassis', 'left-shoulder', 'i-arm', 'arm-child', 'forward')
    expect(typeof result).not.toBe('string')
    const build = result as MechBuild
    expect(build.attachments[0].edgeFacing).toBe('forward')
  })

  it('rejects edge point without edgeFacing', () => {
    const buildWithArm: MechBuild = {
      ...emptyBuild,
      instances: [...emptyBuild.instances, { instanceId: 'i-arm', defId: 'dev-arm-cannon' }],
    }
    const result = attach(buildWithArm, DEV_LIBRARY, 'i-chassis', 'left-shoulder', 'i-arm', 'arm-child')
    expect(typeof result).toBe('string')
    expect(result).toContain('edgeFacing')
  })

  it('rejects edgeFacing on non-edge point', () => {
    const result = attach(emptyBuild, DEV_LIBRARY, 'i-chassis', 'core-slot', 'i-core', 'core-child', 'forward')
    expect(typeof result).toBe('string')
    expect(result).toContain('only valid for edge')
  })

  it('allows any child to attach to any parent regardless of kind', () => {
    const result = attach(emptyBuild, DEV_LIBRARY, 'i-chassis', 'left-shoulder', 'i-core', 'core-child', 'forward')
    expect(typeof result).not.toBe('string')
  })

  it('rejects already-used attach points', () => {
    const build1 = attach(emptyBuild, DEV_LIBRARY, 'i-chassis', 'core-slot', 'i-core', 'core-child') as MechBuild
    const withArm: MechBuild = {
      ...build1,
      instances: [...build1.instances, { instanceId: 'i-core2', defId: 'dev-core-rc1' }],
    }
    const result = attach(withArm, DEV_LIBRARY, 'i-chassis', 'core-slot', 'i-core2', 'core-child')
    expect(typeof result).toBe('string')
    expect(result).toContain('already in use')
  })

  it('rejects unknown instance', () => {
    const result = attach(emptyBuild, DEV_LIBRARY, 'i-ghost', 'core-slot', 'i-core', 'core-child')
    expect(typeof result).toBe('string')
  })
})

// ─── detach ─────────────────────────────────────────────────────────

describe('detach', () => {
  it('removes the child and its subtree', () => {
    const build: MechBuild = {
      ...DEV_DEFAULT_BUILD,
      instances: [
        ...DEV_DEFAULT_BUILD.instances,
        { instanceId: 'i-sub', defId: 'dev-repair-drone' },
      ],
      attachments: [
        ...DEV_DEFAULT_BUILD.attachments,
        { parentInstanceId: 'i-left-arm', parentAttachPointId: 'arm-child', childInstanceId: 'i-sub', childAttachPointId: 'drone-child' },
      ],
    }
    const result = detach(build, 'i-left-arm')
    expect(result.instances.find(i => i.instanceId === 'i-left-arm')).toBeUndefined()
    expect(result.instances.find(i => i.instanceId === 'i-sub')).toBeUndefined()
    expect(result.instances.find(i => i.instanceId === 'i-chassis')).toBeDefined()
    expect(result.instances.find(i => i.instanceId === 'i-core')).toBeDefined()
  })

  it('does not affect siblings', () => {
    const result = detach(DEV_DEFAULT_BUILD, 'i-left-arm')
    expect(result.instances.find(i => i.instanceId === 'i-right-arm')).toBeDefined()
  })
})

// ─── collectDescendants ─────────────────────────────────────────────

describe('collectDescendants', () => {
  it('returns the instance itself when it has no children', () => {
    const result = collectDescendants(DEV_DEFAULT_BUILD, 'i-core')
    expect(result).toEqual(new Set(['i-core']))
  })

  it('returns the root and all descendants', () => {
    const result = collectDescendants(DEV_DEFAULT_BUILD, 'i-chassis')
    expect(result).toContain('i-chassis')
    expect(result).toContain('i-core')
    expect(result).toContain('i-left-arm')
    expect(result).toContain('i-right-arm')
  })
})

// ─── buildPhysics ───────────────────────────────────────────────────

describe('buildPhysics', () => {
  it('sums attributes across all instances in the dev default build', () => {
    const p = buildPhysics(DEV_DEFAULT_BUILD, DEV_LIBRARY)
    expect(p.inertia).toBe(6)
    expect(p.thrust).toBe(-10)
    expect(p.energy).toBe(-1)
  })

  it('returns zeroes for an empty build', () => {
    const empty: MechBuild = { id: 'e', name: 'E', rootInstanceId: '', instances: [], attachments: [] }
    const p = buildPhysics(empty, DEV_LIBRARY)
    expect(p).toEqual({ inertia: 0, thrust: 0, energy: 0 })
  })
})

// ─── validateBuild ──────────────────────────────────────────────────

describe('validateBuild', () => {
  it('flags the dev default build as non-viable (negative energy)', () => {
    const v = validateBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY)
    expect(v.viable).toBe(false)
    expect(v.reasons.some(r => r.includes('energy'))).toBe(true)
  })

  it('flags missing chassis', () => {
    const build: MechBuild = {
      id: 't', name: 'T', rootInstanceId: 'i-core',
      instances: [{ instanceId: 'i-core', defId: 'dev-core-rc1' }],
      attachments: [],
    }
    const v = validateBuild(build, DEV_LIBRARY)
    expect(v.viable).toBe(false)
    expect(v.reasons).toContain('No chassis installed')
  })

  it('flags missing core', () => {
    const build: MechBuild = {
      id: 't', name: 'T', rootInstanceId: 'i-chassis',
      instances: [{ instanceId: 'i-chassis', defId: 'dev-chassis-mk1' }],
      attachments: [],
    }
    const v = validateBuild(build, DEV_LIBRARY)
    expect(v.viable).toBe(false)
    expect(v.reasons).toContain('No core installed')
  })

  it('passes for a minimal viable build', () => {
    const build: MechBuild = {
      id: 'min', name: 'Min', rootInstanceId: 'i-chassis',
      instances: [
        { instanceId: 'i-chassis', defId: 'dev-chassis-mk1' },
        { instanceId: 'i-core',    defId: 'dev-core-rc1' },
      ],
      attachments: [
        { parentInstanceId: 'i-chassis', parentAttachPointId: 'core-slot', childInstanceId: 'i-core', childAttachPointId: 'core-child' },
      ],
    }
    const v = validateBuild(build, DEV_LIBRARY)
    expect(v.viable).toBe(true)
    expect(v.reasons).toHaveLength(0)
  })
})
