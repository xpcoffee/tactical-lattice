import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { hexToPixel, hexesInCone } from '../../game/hex/grid'
import {
  createInitialCombatState,
  setLatestState,
  getVisibleEntities,
  CombatState,
  COMBAT_STATE_CHANGED,
} from '../../game/state/combat'
import { GRID_COLS, GRID_ROWS, VIEW_RANGE, SENSOR_RANGE } from '../../game/constants'

// Perspective ground-plane projection constants.
//
// The hex grid is treated as a flat floor. The camera sits above and behind
// the player, looking forward. Everything converges to a vanishing point at
// (horizonX, horizonY). The player hex always projects to playerAnchor.
//
// PERSP_CAM_D controls how fast hexes converge to the horizon:
//   scale = PERSP_CAM_D / (PERSP_CAM_D + forward_depth)
// Smaller values = more extreme perspective (faster convergence).
const PERSP_CAM_D     = 80    // perspective depth parameter
const HEX_WORLD_SIZE  = 240   // world-space hex size (controls physical spacing)
const HORIZON_X_RATIO = 0.60  // vanishing point x: centre of battlefield panel
const HORIZON_Y_RATIO = 0.40  // horizon line: 40% from top of canvas
const ANCHOR_X_RATIO  = 0.54  // mech foot x: slightly left of horizon centre
const ANCHOR_Y_RATIO  = 0.78  // mech foot y: near bottom

export class Combat extends Phaser.Scene {
  private state!: CombatState
  private gridGfx!: Phaser.GameObjects.Graphics
  private entityGfx!: Map<number, Phaser.GameObjects.Graphics>
  private entityLabels!: Map<number, Phaser.GameObjects.Text>
  private mechGfx!: Phaser.GameObjects.Graphics
  private playerAnchor!: { x: number; y: number }
  private horizonX!: number
  private horizonY!: number

  constructor() {
    super('Combat')
  }

  create(): void {
    this.playerAnchor = {
      x: this.scale.width  * ANCHOR_X_RATIO,
      y: this.scale.height * ANCHOR_Y_RATIO,
    }
    this.horizonX = this.scale.width  * HORIZON_X_RATIO
    this.horizonY = this.scale.height * HORIZON_Y_RATIO

    this.gridGfx      = this.add.graphics()
    this.mechGfx      = this.add.graphics()
    this.entityGfx    = new Map()
    this.entityLabels = new Map()

    this.state = createInitialCombatState()
    this.drawScene()
    setLatestState(this.state)
    EventBus.emit('scene-ready', this)
    EventBus.emit(COMBAT_STATE_CHANGED, this.state)

    EventBus.on(COMBAT_STATE_CHANGED, (newState: CombatState) => {
      this.state = newState
      this.updateScene()
    })
  }

  // Project any world-space pixel point (wx, wy) to screen coordinates.
  //
  // The facing rotation maps the mech's forward direction to "up" in world space
  // (negative wy = in front of the player). The perspective formula then maps:
  //   depth=0  (player position) → playerAnchor
  //   depth→∞  (horizon)         → (horizonX, horizonY)
  //
  // Returns null for points behind the camera (eyeDepth ≤ 0).
  private worldToScreen(wx: number, wy: number): { x: number; y: number } | null {
    const angle = (this.state.facing - 2) * Math.PI / 3
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const rx = wx * cos - wy * sin   // lateral offset after rotation
    const ry = wx * sin + wy * cos   // signed depth: negative = in front of player

    const eyeDepth = PERSP_CAM_D - ry  // always positive for forward hexes
    if (eyeDepth <= 0) return null

    const scale = PERSP_CAM_D / eyeDepth

    return {
      // Lateral convergence: starts at anchorX offset at depth=0, converges to horizonX
      x: this.horizonX + (this.playerAnchor.x - this.horizonX + rx) * scale,
      // Vertical convergence: starts at anchorY, converges to horizonY
      y: this.horizonY + (this.playerAnchor.y - this.horizonY) * scale,
    }
  }

  private hexToScreen(relHex: { q: number; r: number }): { x: number; y: number } | null {
    const p = hexToPixel(relHex, HEX_WORLD_SIZE)
    return this.worldToScreen(p.x, p.y)
  }

  private drawHexGrid(): void {
    this.gridGfx.clear()
    this.gridGfx.lineStyle(1, 0x4a4a7a, 1)

    const player = this.state.playerPosition
    // Only the vision cone — the player hex is the mech's feet, shown by the sprite.
    const hexes = hexesInCone(player, this.state.facing, VIEW_RANGE, GRID_COLS, GRID_ROWS)

    for (const h of hexes) {
      const rel = { q: h.q - player.q, r: h.r - player.r }
      const center = hexToPixel(rel, HEX_WORLD_SIZE)

      let started = false
      this.gridGfx.beginPath()
      for (let i = 0; i < 6; i++) {
        const vAngle = (Math.PI / 3) * i
        const pos = this.worldToScreen(
          center.x + HEX_WORLD_SIZE * Math.cos(vAngle),
          center.y + HEX_WORLD_SIZE * Math.sin(vAngle),
        )
        if (!pos) continue
        if (!started) { this.gridGfx.moveTo(pos.x, pos.y); started = true }
        else this.gridGfx.lineTo(pos.x, pos.y)
      }
      if (started) {
        this.gridGfx.closePath()
        this.gridGfx.strokePath()
      }
    }
  }

  private drawMechSprite(): void {
    this.mechGfx.clear()
    const { x, y } = this.playerAnchor
    this.mechGfx.fillStyle(0xe6c200, 0.9)
    this.mechGfx.fillTriangle(x, y - 24, x - 10, y, x + 10, y)
  }

  private renderEntities(): void {
    const entities = getVisibleEntities(this.state, VIEW_RANGE, SENSOR_RANGE, GRID_COLS, GRID_ROWS)
    const player = this.state.playerPosition

    for (const entity of entities) {
      if (!entity.isVisible && !entity.isSensor) continue

      const rel = { q: entity.position.q - player.q, r: entity.position.r - player.r }
      const pos = this.hexToScreen(rel)
      if (!pos) continue

      const g = this.add.graphics()
      this.entityGfx.set(entity.id, g)

      if (entity.isVisible) {
        const s = (1.0 - entity.distance / (VIEW_RANGE + 1)) * 40
        g.lineStyle(2, 0xe6c200, 1)
        g.strokeRect(pos.x - s / 2, pos.y - s / 2, s, s)
      } else {
        g.lineStyle(1, 0x4a7a4a, 1)
        g.strokeRect(pos.x - 14, pos.y - 10, 28, 20)
        const label = this.add.text(pos.x, pos.y, entity.label, {
          fontSize: '10px', color: '#4a7a4a',
        }).setOrigin(0.5)
        this.entityLabels.set(entity.id, label)
      }
    }
  }

  private drawScene(): void {
    this.drawHexGrid()
    this.renderEntities()
    this.drawMechSprite()
  }

  private updateScene(): void {
    for (const gfx of this.entityGfx.values()) gfx.destroy()
    for (const lbl of this.entityLabels.values()) lbl.destroy()
    this.entityGfx.clear()
    this.entityLabels.clear()
    this.drawScene()
  }
}
