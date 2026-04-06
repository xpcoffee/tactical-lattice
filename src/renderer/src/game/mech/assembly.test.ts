import { describe, it, expect } from 'vitest'
import { layoutBuild, layoutBounds, opposite, resolveView, isVisibleFromView, computeChildFacing } from './assembly'
import { DEV_DEFAULT_BUILD, DEV_LIBRARY, DEV_CHASSIS, DEV_JOINT, DEV_ARM_CANNON } from './library.dev'
import type { MechBuild, ComponentInstance, BuildAttachment } from './components'

// ─── Pure helpers ───────────────────────────────────────────────────

describe('opposite', () => {
  it('flips forward to backward', () => expect(opposite('forward')).toBe('backward'))
  it('flips backward to forward', () => expect(opposite('backward')).toBe('forward'))
})

describe('resolveView', () => {
  it('forward + front camera → front sprite', () => expect(resolveView('forward', 'front')).toBe('front'))
  it('backward + front camera → rear sprite', () => expect(resolveView('backward', 'front')).toBe('rear'))
  it('forward + rear camera → rear sprite', () => expect(resolveView('forward', 'rear')).toBe('rear'))
  it('backward + rear camera → front sprite', () => expect(resolveView('backward', 'rear')).toBe('front'))
})

describe('isVisibleFromView', () => {
  it('edge is always visible (front view)', () => expect(isVisibleFromView('edge', 'forward', 'front')).toBe(true))
  it('edge is always visible (rear view)', () => expect(isVisibleFromView('edge', 'backward', 'rear')).toBe(true))

  it('front face + forward parent → visible from front', () => expect(isVisibleFromView('front', 'forward', 'front')).toBe(true))
  it('front face + forward parent → hidden from rear', () => expect(isVisibleFromView('front', 'forward', 'rear')).toBe(false))
  it('front face + backward parent → hidden from front', () => expect(isVisibleFromView('front', 'backward', 'front')).toBe(false))
  it('front face + backward parent → visible from rear', () => expect(isVisibleFromView('front', 'backward', 'rear')).toBe(true))

  it('back face + forward parent → hidden from front', () => expect(isVisibleFromView('back', 'forward', 'front')).toBe(false))
  it('back face + forward parent → visible from rear', () => expect(isVisibleFromView('back', 'forward', 'rear')).toBe(true))
})

describe('computeChildFacing', () => {
  it('front face preserves parent facing', () => {
    expect(computeChildFacing('forward', 'front')).toBe('forward')
    expect(computeChildFacing('backward', 'front')).toBe('backward')
  })
  it('back face flips parent facing', () => {
    expect(computeChildFacing('forward', 'back')).toBe('backward')
    expect(computeChildFacing('backward', 'back')).toBe('forward')
  })
  it('edge face uses edgeFacing relative to parent', () => {
    expect(computeChildFacing('forward', 'edge', 'forward')).toBe('forward')
    expect(computeChildFacing('forward', 'edge', 'backward')).toBe('backward')
    expect(computeChildFacing('backward', 'edge', 'forward')).toBe('backward')
    expect(computeChildFacing('backward', 'edge', 'backward')).toBe('forward')
  })
})

// ─── layoutBuild ────────────────────────────────────────────────────

describe('layoutBuild', () => {
  it('places the root at (0,0) with forward facing', () => {
    const entries = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'front')
    const root = entries.find(e => e.instanceId === 'i-chassis')!
    expect(root.x).toBe(0)
    expect(root.y).toBe(0)
    expect(root.effectiveFacing).toBe('forward')
    expect(root.visible).toBe(true)
    expect(root.rotation).toBe(0)
  })

  it('positions the core at the core-slot attach point', () => {
    const entries = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'front')
    const core = entries.find(e => e.instanceId === 'i-core')!
    // core-slot front = (40,50), core-child front = (15,15) → (25, 35)
    expect(core.x).toBe(25)
    expect(core.y).toBe(35)
  })

  it('positions left arm using front-view coords', () => {
    const entries = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'front')
    const leftArm = entries.find(e => e.instanceId === 'i-left-arm')!
    // left-shoulder front = (0,20), arm-child front = (10,5) → (-10, 15)
    expect(leftArm.x).toBe(-10)
    expect(leftArm.y).toBe(15)
  })

  it('mirrors arm positions in rear view', () => {
    const entries = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'rear')
    const leftArm = entries.find(e => e.instanceId === 'i-left-arm')!
    // left-shoulder rear = (80,20), arm-child rear = (10,5) → (70, 15)
    expect(leftArm.x).toBe(70)
    expect(leftArm.y).toBe(15)
  })

  it('sorts entries by z (back to front)', () => {
    const entries = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'front')
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].z).toBeGreaterThanOrEqual(entries[i - 1].z)
    }
  })

  it('returns empty for a build with no root', () => {
    const bad: MechBuild = { id: 'x', name: 'X', rootInstanceId: 'missing', instances: [], attachments: [] }
    expect(layoutBuild(bad, DEV_LIBRARY, 'front')).toEqual([])
  })
})

// ─── Effective facing propagation ───────────────────────────────────

describe('effective facing', () => {
  it('core on front-face parent point faces forward', () => {
    const entries = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'front')
    const core = entries.find(e => e.instanceId === 'i-core')!
    expect(core.effectiveFacing).toBe('forward')
  })

  it('edge-mounted arm with edgeFacing=forward faces forward', () => {
    const entries = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'front')
    const arm = entries.find(e => e.instanceId === 'i-left-arm')!
    expect(arm.effectiveFacing).toBe('forward')
  })

  it('back-face mounted component faces backward', () => {
    // Build: chassis + repair drone on logistics-bay (face: back)
    const build: MechBuild = {
      id: 'test-back', name: 'TB', rootInstanceId: 'i-chassis',
      instances: [
        { instanceId: 'i-chassis', defId: 'dev-chassis-mk1' },
        { instanceId: 'i-drone',   defId: 'dev-repair-drone' },
      ],
      attachments: [
        { parentInstanceId: 'i-chassis', parentAttachPointId: 'logistics-bay', childInstanceId: 'i-drone', childAttachPointId: 'drone-child' },
      ],
    }
    const entries = layoutBuild(build, DEV_LIBRARY, 'front')
    const drone = entries.find(e => e.instanceId === 'i-drone')!
    expect(drone.effectiveFacing).toBe('backward')
  })
})

// ─── Visibility ─────────────────────────────────────────────────────

describe('visibility', () => {
  it('root is always visible', () => {
    const entries = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'front')
    expect(entries.find(e => e.instanceId === 'i-chassis')!.visible).toBe(true)
  })

  it('front-face component is visible from front view', () => {
    const entries = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'front')
    expect(entries.find(e => e.instanceId === 'i-core')!.visible).toBe(true)
  })

  it('front-face component is hidden from rear view', () => {
    const entries = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'rear')
    expect(entries.find(e => e.instanceId === 'i-core')!.visible).toBe(false)
  })

  it('edge-mounted component is visible from both views', () => {
    const front = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'front')
    const rear = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'rear')
    expect(front.find(e => e.instanceId === 'i-left-arm')!.visible).toBe(true)
    expect(rear.find(e => e.instanceId === 'i-left-arm')!.visible).toBe(true)
  })

  it('back-face component is hidden from front view', () => {
    const build: MechBuild = {
      id: 'test', name: 'T', rootInstanceId: 'i-chassis',
      instances: [
        { instanceId: 'i-chassis', defId: 'dev-chassis-mk1' },
        { instanceId: 'i-drone',   defId: 'dev-repair-drone' },
      ],
      attachments: [
        { parentInstanceId: 'i-chassis', parentAttachPointId: 'logistics-bay', childInstanceId: 'i-drone', childAttachPointId: 'drone-child' },
      ],
    }
    expect(layoutBuild(build, DEV_LIBRARY, 'front').find(e => e.instanceId === 'i-drone')!.visible).toBe(false)
    expect(layoutBuild(build, DEV_LIBRARY, 'rear').find(e => e.instanceId === 'i-drone')!.visible).toBe(true)
  })
})

// ─── Joint rotation ─────────────────────────────────────────────────

describe('joint rotation', () => {
  // Build with joint: chassis → shoulder-joint → arm
  function buildWithJoint(rotation: number): MechBuild {
    return {
      id: 'joint-test', name: 'JT', rootInstanceId: 'i-chassis',
      instances: [
        { instanceId: 'i-chassis', defId: 'dev-chassis-mk1' },
        { instanceId: 'i-joint',   defId: 'dev-joint', rotation },
        { instanceId: 'i-arm',     defId: 'dev-arm-cannon' },
      ],
      attachments: [
        { parentInstanceId: 'i-chassis', parentAttachPointId: 'left-shoulder', childInstanceId: 'i-joint', childAttachPointId: 'joint-child', edgeFacing: 'forward' },
        { parentInstanceId: 'i-joint',   parentAttachPointId: 'joint-parent',  childInstanceId: 'i-arm',   childAttachPointId: 'arm-child',   edgeFacing: 'forward' },
      ],
    }
  }

  it('joint with 0 rotation: arm has rotation=0', () => {
    const entries = layoutBuild(buildWithJoint(0), DEV_LIBRARY, 'front')
    const arm = entries.find(e => e.instanceId === 'i-arm')!
    expect(arm.rotation).toBe(0)
  })

  it('joint with 45-degree rotation: arm has rotation=45', () => {
    const entries = layoutBuild(buildWithJoint(45), DEV_LIBRARY, 'front')
    const arm = entries.find(e => e.instanceId === 'i-arm')!
    expect(arm.rotation).toBe(45)
  })

  it('joint rotation sets pivot on arm entry', () => {
    const entries = layoutBuild(buildWithJoint(30), DEV_LIBRARY, 'front')
    const joint = entries.find(e => e.instanceId === 'i-joint')!
    const arm = entries.find(e => e.instanceId === 'i-arm')!
    // Pivot = joint position + joint-parent point front coords (6, 6)
    expect(arm.rotationPivotX).toBe(joint.x + 6)
    expect(arm.rotationPivotY).toBe(joint.y + 6)
  })

  it('positions are NOT modified by rotation (CSS handles visual)', () => {
    const entries0 = layoutBuild(buildWithJoint(0), DEV_LIBRARY, 'front')
    const entries90 = layoutBuild(buildWithJoint(90), DEV_LIBRARY, 'front')
    const arm0 = entries0.find(e => e.instanceId === 'i-arm')!
    const arm90 = entries90.find(e => e.instanceId === 'i-arm')!
    expect(arm0.x).toBe(arm90.x)
    expect(arm0.y).toBe(arm90.y)
  })
})

// ─── layoutBounds ───────────────────────────────────────────────────

describe('layoutBounds', () => {
  it('computes bounding box for the dev default build', () => {
    const entries = layoutBuild(DEV_DEFAULT_BUILD, DEV_LIBRARY, 'front')
    const bounds = layoutBounds(entries)
    expect(bounds.x).toBe(-10)
    expect(bounds.width).toBe(100)
    expect(bounds.height).toBeGreaterThan(0)
  })

  it('returns zero bounds for empty layout', () => {
    expect(layoutBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})
