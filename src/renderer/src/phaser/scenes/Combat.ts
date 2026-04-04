import Phaser from 'phaser'
import { EventBus } from '../EventBus'

export class Combat extends Phaser.Scene {
  constructor() {
    super('Combat')
  }

  create(): void {
    // Battlefield view — full screen canvas.
    // Placeholder: subtle grid background until sprites are in place.
    this.drawBackground()
    EventBus.emit('scene-ready', this)
  }

  private drawBackground(): void {
    const g = this.add.graphics()
    g.lineStyle(1, 0x12121f, 1)
    const step = 48
    for (let x = 0; x < this.scale.width; x += step) {
      g.lineBetween(x, 0, x, this.scale.height)
    }
    for (let y = 0; y < this.scale.height; y += step) {
      g.lineBetween(0, y, this.scale.width, y)
    }
  }
}
