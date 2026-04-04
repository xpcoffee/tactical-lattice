import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { hexToPixel, hexesInCone, DIRECTIONS } from '../../game/hex/grid'
import {
  createInitialCombatState,
  setLatestState,
  getVisibleEntities,
  CombatState,
  COMBAT_STATE_CHANGED,
} from '../../game/state/combat'
import { GRID_COLS, GRID_ROWS, HEX_SIZE, VIEW_RANGE, SENSOR_RANGE } from '../../game/constants'

export class Combat extends Phaser.Scene {
  private state!: CombatState
  private entityGfx!: Map<number, Phaser.GameObjects.Graphics>
  private entityLabels!: Map<number, Phaser.GameObjects.Text>
  private coneGfx!: Phaser.GameObjects.Graphics
  private facingGfx!: Phaser.GameObjects.Graphics
  private gridOffset!: { x: number; y: number }

  constructor() {
    super('Combat')
  }

  create(): void {
    const gridW = HEX_SIZE * (1.5 * (GRID_COLS - 1) + 1)
    const gridH = HEX_SIZE * Math.sqrt(3) * (GRID_ROWS - 0.5)
    this.gridOffset = {
      x: (this.scale.width - gridW) / 2 + HEX_SIZE,
      y: (this.scale.height - gridH) / 2 + HEX_SIZE,
    }

    this.drawHexGrid()

    // Cone and facing overlays sit above the grid but below entities
    this.coneGfx = this.add.graphics()
    this.facingGfx = this.add.graphics()

    this.state = createInitialCombatState()
    this.entityGfx = new Map()
    this.entityLabels = new Map()
    this.renderEntities()
    this.drawConeOverlay()
    this.drawFacingIndicator()

    setLatestState(this.state)
    EventBus.emit('scene-ready', this)
    EventBus.emit(COMBAT_STATE_CHANGED, this.state)

    // Re-render whenever state changes (player moves, rotates, etc.)
    EventBus.on(COMBAT_STATE_CHANGED, (newState: CombatState) => {
      this.state = newState
      this.updateEntities()
    })
  }

  private drawHexGrid(): void {
    const g = this.add.graphics()
    g.lineStyle(1, 0x1a1a2e, 1)

    for (let q = 0; q < GRID_COLS; q++) {
      for (let r = 0; r < GRID_ROWS; r++) {
        const { x, y } = hexToPixel({ q, r }, HEX_SIZE)
        const cx = x + this.gridOffset.x
        const cy = y + this.gridOffset.y

        g.beginPath()
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i
          const px = cx + HEX_SIZE * Math.cos(angle)
          const py = cy + HEX_SIZE * Math.sin(angle)
          if (i === 0) g.moveTo(px, py)
          else g.lineTo(px, py)
        }
        g.closePath()
        g.strokePath()
      }
    }
  }

  private drawConeOverlay(): void {
    this.coneGfx.clear()
    const cone = hexesInCone(this.state.playerPosition, this.state.facing, SENSOR_RANGE, GRID_COLS, GRID_ROWS)

    for (const h of cone) {
      const { x, y } = hexToPixel(h, HEX_SIZE)
      const cx = x + this.gridOffset.x
      const cy = y + this.gridOffset.y
      const dist = Math.max(
        Math.abs(h.q - this.state.playerPosition.q),
        Math.abs(h.q + h.r - this.state.playerPosition.q - this.state.playerPosition.r),
        Math.abs(h.r - this.state.playerPosition.r),
      )

      if (dist <= VIEW_RANGE) {
        this.coneGfx.fillStyle(0x4a7aff, 0.12)
      } else {
        this.coneGfx.fillStyle(0x2a4a6a, 0.08)
      }

      this.coneGfx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i
        const px = cx + HEX_SIZE * Math.cos(angle)
        const py = cy + HEX_SIZE * Math.sin(angle)
        if (i === 0) this.coneGfx.moveTo(px, py)
        else this.coneGfx.lineTo(px, py)
      }
      this.coneGfx.closePath()
      this.coneGfx.fillPath()
    }
  }

  private drawFacingIndicator(): void {
    this.facingGfx.clear()
    const { x, y } = hexToPixel(this.state.playerPosition, HEX_SIZE)
    const cx = x + this.gridOffset.x
    const cy = y + this.gridOffset.y

    const dir = DIRECTIONS[this.state.facing]
    const dp = hexToPixel(dir, HEX_SIZE)
    const dm = Math.sqrt(dp.x * dp.x + dp.y * dp.y)
    const ux = dp.x / dm, uy = dp.y / dm
    const arrowLen = HEX_SIZE * 0.55
    const halfSpread = HEX_SIZE * 0.2

    // Perpendicular for chevron base spread
    const px = -uy, py = ux

    const tipX = cx + ux * arrowLen
    const tipY = cy + uy * arrowLen
    const base1X = cx + px * halfSpread
    const base1Y = cy + py * halfSpread
    const base2X = cx - px * halfSpread
    const base2Y = cy - py * halfSpread

    this.facingGfx.lineStyle(2, 0xe6c200, 0.9)
    this.facingGfx.beginPath()
    this.facingGfx.moveTo(base1X, base1Y)
    this.facingGfx.lineTo(tipX, tipY)
    this.facingGfx.lineTo(base2X, base2Y)
    this.facingGfx.strokePath()
  }

  private renderEntities(): void {
    const entities = getVisibleEntities(this.state, VIEW_RANGE, SENSOR_RANGE, GRID_COLS, GRID_ROWS)

    for (const entity of entities) {
      if (!entity.isVisible && !entity.isSensor) continue

      const { x, y } = hexToPixel(entity.position, HEX_SIZE)
      const cx = x + this.gridOffset.x
      const cy = y + this.gridOffset.y

      const g = this.add.graphics()
      this.entityGfx.set(entity.id, g)

      if (entity.isVisible) {
        const scale = 1.0 - entity.distance / (VIEW_RANGE + 1)
        const size = 40 * scale
        g.lineStyle(2, 0xe6c200, 1)
        g.strokeRect(cx - size / 2, cy - size / 2, size, size)
      } else {
        // Sensor-only: consistent small wireframe + label
        g.lineStyle(1, 0x4a7a4a, 1)
        g.strokeRect(cx - 14, cy - 10, 28, 20)

        const label = this.add.text(cx, cy, entity.label, {
          fontSize: '10px',
          color: '#4a7a4a',
        }).setOrigin(0.5)
        this.entityLabels.set(entity.id, label)
      }
    }
  }

  private updateEntities(): void {
    this.coneGfx.clear()
    this.facingGfx.clear()
    for (const gfx of this.entityGfx.values()) gfx.destroy()
    for (const lbl of this.entityLabels.values()) lbl.destroy()
    this.entityGfx.clear()
    this.entityLabels.clear()
    this.drawConeOverlay()
    this.drawFacingIndicator()
    this.renderEntities()
  }
}
