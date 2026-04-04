import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { hexToPixel } from '../../game/hex/grid'
import {
  createInitialCombatState,
  getEntitiesWithDistance,
  setLatestState,
  CombatState,
  COMBAT_STATE_CHANGED,
} from '../../game/state/combat'

const HEX_SIZE = 48

export class Combat extends Phaser.Scene {
  private state!: CombatState
  private entityGfx!: Map<number, Phaser.GameObjects.Graphics>
  private entityLabels!: Map<number, Phaser.GameObjects.Text>
  private gridOffset!: { x: number; y: number }

  constructor() {
    super('Combat')
  }

  create(): void {
    const gridW = HEX_SIZE * 14.5
    const gridH = HEX_SIZE * Math.sqrt(3) * 9.5
    this.gridOffset = {
      x: (this.scale.width - gridW) / 2 + HEX_SIZE,
      y: (this.scale.height - gridH) / 2 + HEX_SIZE,
    }

    this.drawHexGrid()

    this.state = createInitialCombatState()
    this.entityGfx = new Map()
    this.entityLabels = new Map()
    this.renderEntities()

    setLatestState(this.state)
    EventBus.emit('scene-ready', this)
    EventBus.emit(COMBAT_STATE_CHANGED, this.state)
  }

  private drawHexGrid(): void {
    const g = this.add.graphics()
    g.lineStyle(1, 0x1a1a2e, 1)

    for (let q = 0; q < 10; q++) {
      for (let r = 0; r < 10; r++) {
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

  private renderEntities(): void {
    const entities = getEntitiesWithDistance(this.state)

    for (const entity of entities) {
      const { x, y } = hexToPixel(entity.position, HEX_SIZE)
      const cx = x + this.gridOffset.x
      const cy = y + this.gridOffset.y

      const g = this.add.graphics()
      this.entityGfx.set(entity.id, g)

      if (entity.distance < 3) {
        const scale = 1.0 - entity.distance / 3
        const size = 40 * scale
        g.lineStyle(2, 0xe6c200, 1)
        g.strokeRect(cx - size / 2, cy - size / 2, size, size)
      } else {
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
}
