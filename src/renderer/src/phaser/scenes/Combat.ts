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

// Isometric rendering constants
const ISO_HEX_SIZE = 120
const ISO_SCALE_Y  = 0.55
// Mech anchor: feet of the mech sprite in screen space (bottom-left area)
const ANCHOR_X_RATIO = 0.35
const ANCHOR_Y_RATIO = 0.70

export class Combat extends Phaser.Scene {
  private state!: CombatState
  private gridGfx!: Phaser.GameObjects.Graphics
  private entityGfx!: Map<number, Phaser.GameObjects.Graphics>
  private entityLabels!: Map<number, Phaser.GameObjects.Text>
  private mechGfx!: Phaser.GameObjects.Graphics
  private playerAnchor!: { x: number; y: number }

  constructor() {
    super('Combat')
  }

  create(): void {
    this.playerAnchor = {
      x: this.scale.width  * ANCHOR_X_RATIO,
      y: this.scale.height * ANCHOR_Y_RATIO,
    }

    this.gridGfx    = this.add.graphics()
    this.mechGfx    = this.add.graphics()
    this.entityGfx  = new Map()
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

  // Convert a hex relative to the player into isometric screen coordinates.
  private hexToIsoScreen(relHex: { q: number; r: number }): { x: number; y: number } {
    const cart = hexToPixel(relHex, ISO_HEX_SIZE)
    const angle = (this.state.facing - 2) * Math.PI / 3
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const rx = cart.x * cos - cart.y * sin
    const ry = cart.x * sin + cart.y * cos
    return {
      x: this.playerAnchor.x + rx,
      y: this.playerAnchor.y + ry * ISO_SCALE_Y,
    }
  }

  private drawHexGrid(): void {
    this.gridGfx.clear()
    this.gridGfx.lineStyle(1, 0x4a4a7a, 1)

    const player = this.state.playerPosition
    // Only render the player hex + the visible cone (VIEW_RANGE radius)
    const coneHexes = hexesInCone(player, this.state.facing, VIEW_RANGE, GRID_COLS, GRID_ROWS)
    const hexesToDraw = [player, ...coneHexes]

    for (const h of hexesToDraw) {
      const rel = { q: h.q - player.q, r: h.r - player.r }
      const { x, y } = this.hexToIsoScreen(rel)
      this.gridGfx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i
        const px = x + ISO_HEX_SIZE * Math.cos(angle)
        const py = y + ISO_HEX_SIZE * Math.sin(angle) * ISO_SCALE_Y
        if (i === 0) this.gridGfx.moveTo(px, py)
        else this.gridGfx.lineTo(px, py)
      }
      this.gridGfx.closePath()
      this.gridGfx.strokePath()
    }
  }

  private drawMechSprite(): void {
    this.mechGfx.clear()
    const { x, y } = this.playerAnchor
    // Upright triangle: feet at (x, y), tip extends upward
    this.mechGfx.fillStyle(0xe6c200, 0.9)
    this.mechGfx.fillTriangle(x, y - 24, x - 10, y, x + 10, y)
  }

  private renderEntities(): void {
    const entities = getVisibleEntities(this.state, VIEW_RANGE, SENSOR_RANGE, GRID_COLS, GRID_ROWS)
    const player = this.state.playerPosition

    for (const entity of entities) {
      if (!entity.isVisible && !entity.isSensor) continue

      const rel = { q: entity.position.q - player.q, r: entity.position.r - player.r }
      const { x, y } = this.hexToIsoScreen(rel)

      const g = this.add.graphics()
      this.entityGfx.set(entity.id, g)

      if (entity.isVisible) {
        const scale = 1.0 - entity.distance / (VIEW_RANGE + 1)
        const size = 40 * scale
        g.lineStyle(2, 0xe6c200, 1)
        g.strokeRect(x - size / 2, y - size / 2, size, size)
      } else {
        g.lineStyle(1, 0x4a7a4a, 1)
        g.strokeRect(x - 14, y - 10, 28, 20)

        const label = this.add.text(x, y, entity.label, {
          fontSize: '10px',
          color: '#4a7a4a',
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
