import Phaser from 'phaser'
import { EventBus } from '../EventBus'

const HEX_SIZE = 28
const GRID_COLS = 10
const GRID_ROWS = 10

export class Combat extends Phaser.Scene {
  constructor() {
    super('Combat')
  }

  create(): void {
    this.drawHexGrid()
    EventBus.emit('scene-ready', this)
  }

  private drawHexGrid(): void {
    const graphics = this.add.graphics()
    graphics.lineStyle(1, 0x2a2a4a, 0.9)

    const gridW = HEX_SIZE * 1.5 * GRID_COLS
    const gridH = HEX_SIZE * Math.sqrt(3) * GRID_ROWS
    const offsetX = (this.scale.width - gridW) / 2 + HEX_SIZE
    const offsetY = (this.scale.height - gridH) / 2 + HEX_SIZE

    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        const x = offsetX + HEX_SIZE * 1.5 * col
        const y = offsetY + HEX_SIZE * Math.sqrt(3) * (row + (col % 2) * 0.5)
        this.strokeHex(graphics, x, y, HEX_SIZE)
      }
    }
  }

  private strokeHex(g: Phaser.GameObjects.Graphics, cx: number, cy: number, size: number): void {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i
      return { x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) }
    })
    g.beginPath()
    g.moveTo(pts[0].x, pts[0].y)
    pts.slice(1).forEach(p => g.lineTo(p.x, p.y))
    g.closePath()
    g.strokePath()
  }
}
