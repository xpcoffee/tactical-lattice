import Phaser from 'phaser'
import enemyMechUrl from '../../assets/mech-enemy.png'

export class Preloader extends Phaser.Scene {
  constructor() {
    super('Preloader')
  }

  preload(): void {
    this.load.image('enemy-mech', enemyMechUrl)
  }

  create(): void {
    this.scene.start('Combat')
  }
}
