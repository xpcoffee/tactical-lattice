import Phaser from 'phaser'

// Shared event bus for communication between Phaser scenes and React components.
// Phaser scenes emit events here; React components subscribe to them.
export const EventBus = new Phaser.Events.EventEmitter()
