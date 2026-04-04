import Phaser from 'phaser'

export class Preloader extends Phaser.Scene {
  constructor() {
    super('Preloader')
  }

  preload(): void {
    // Load sprite sheets, tilesets, and audio here before combat starts
  }

  create(): void {
    this.scene.start('Combat')
  }
}
