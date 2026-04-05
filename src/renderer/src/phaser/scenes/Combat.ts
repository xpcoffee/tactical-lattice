import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { hexToPixel, hexesInCone, HexCoord } from '../../game/hex/grid'
import {
  createInitialCombatState,
  setLatestState,
  getVisibleEntities,
  CombatState,
  VisibleEntity,
  COMBAT_STATE_CHANGED,
} from '../../game/state/combat'
import { GRID_COLS, GRID_ROWS, VIEW_RANGE, SENSOR_RANGE } from '../../game/constants'

const PERSP_CAM_D     = 80
const HEX_WORLD_SIZE  = 240
const LATERAL_SCALE   = 3.5
const HORIZON_X_RATIO = 0.50
const HORIZON_Y_RATIO = 0.40
const ANCHOR_X_RATIO  = 0.20
const ANCHOR_Y_RATIO  = 0.88

const MOVE_DURATION        = 280   // ms — camera glides to new position
const ENTITY_FADE_DURATION = 350   // ms — entities fade when entering/leaving range
const HEX_FADE_SPEED       = 1 / 0.30  // alpha units/sec — hex outlines fade in 300 ms

// ─── Hex animation tracking ───────────────────────────────────────────────────

interface HexAnim {
  hex: HexCoord
  alpha: number
  target: number  // 1 = fading/holding in, 0 = fading out
}

function hexKey(h: HexCoord): string { return `${h.q},${h.r}` }

// ─── Entity render tracking ───────────────────────────────────────────────────

interface EntityRender {
  gfx: Phaser.GameObjects.Graphics
  label?: Phaser.GameObjects.Text
  visibility: 'visible' | 'sensor'
}

export class Combat extends Phaser.Scene {
  private state!: CombatState
  private gridGfx!: Phaser.GameObjects.Graphics
  private playerAnchor!: { x: number; y: number }
  private horizonX!: number
  private horizonY!: number

  // Movement animation — animOffset is added to world coords in worldToScreen.
  // Starts at +delta (view looks like old position), tweens to 0 (new position).
  // This gives a smooth forward camera glide with no bounce.
  private animOffset = { wx: 0, wy: 0 }
  private isMoving = false

  // Per-hex alpha for fade-in/out of grid outlines as they enter/leave the cone.
  private hexAnims = new Map<string, HexAnim>()
  private prevConeSet = new Set<string>()

  // Persistent entity renders.
  private entityRenders  = new Map<number, EntityRender>()
  private leavingEntities = new Set<number>()
  private prevVisibility  = new Map<number, 'visible' | 'sensor'>()

  constructor() { super('Combat') }

  create(): void {
    this.playerAnchor = {
      x: this.scale.width  * ANCHOR_X_RATIO,
      y: this.scale.height * ANCHOR_Y_RATIO,
    }
    this.horizonX = this.scale.width  * HORIZON_X_RATIO
    this.horizonY = this.scale.height * HORIZON_Y_RATIO

    this.gridGfx = this.add.graphics()
    this.state   = createInitialCombatState()

    // Initial draw — no animations, set cone as baseline.
    const initCone = hexesInCone(
      this.state.playerPosition, this.state.facing, VIEW_RANGE, GRID_COLS, GRID_ROWS,
    )
    this.prevConeSet = new Set(initCone.map(hexKey))
    this.drawHexGrid()
    this.syncEntityVisibility()

    setLatestState(this.state)
    EventBus.emit('scene-ready', this)
    EventBus.emit(COMBAT_STATE_CHANGED, this.state)

    EventBus.on(COMBAT_STATE_CHANGED, (newState: CombatState) => {
      const oldPos     = this.state.playerPosition
      const oldFacing  = this.state.facing
      this.state       = newState

      const moved = oldPos.q !== newState.playerPosition.q
                 || oldPos.r !== newState.playerPosition.r
      const turned = oldFacing !== newState.facing

      // Diff the cone for hex fade animations.
      this.scheduleConeTransition(oldPos, oldFacing)

      if (moved) {
        // Correct sign: +delta so the view starts at the old position and glides forward.
        const delta = hexToPixel({
          q: newState.playerPosition.q - oldPos.q,
          r: newState.playerPosition.r - oldPos.r,
        }, HEX_WORLD_SIZE)
        this.animOffset.wx = delta.x
        this.animOffset.wy = delta.y
        this.isMoving = true

        this.tweens.add({
          targets: this.animOffset,
          wx: 0,
          wy: 0,
          duration: MOVE_DURATION,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            this.isMoving = false
            this.syncEntityVisibility()
          },
        })
        // Entities don't refresh until the glide finishes.
      } else if (turned) {
        // Facing change — entity visibility updates immediately.
        this.syncEntityVisibility()
      }
    })
  }

  // Runs every frame; drives hex-alpha animations and redraws during movement.
  update(_time: number, delta: number): void {
    const dtSec = delta / 1000
    const hexStillAnimating = this.advanceHexAlphas(dtSec)
    if (this.isMoving || hexStillAnimating) {
      this.drawHexGrid()
      if (this.isMoving) this.redrawEntityPositions()
    }
  }

  // ── Perspective projection ──────────────────────────────────────────────────

  private worldToScreen(wx: number, wy: number): { x: number; y: number } | null {
    const angle = (this.state.facing - 2) * Math.PI / 3
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const awx = wx + this.animOffset.wx
    const awy = wy + this.animOffset.wy
    const rx = awx * cos - awy * sin
    const ry = awx * sin + awy * cos

    const eyeDepth = PERSP_CAM_D - ry
    if (eyeDepth <= 0) return null

    const scale = PERSP_CAM_D / eyeDepth
    return {
      x: this.horizonX + (this.playerAnchor.x - this.horizonX + rx * LATERAL_SCALE) * scale,
      y: this.horizonY + (this.playerAnchor.y - this.horizonY) * scale,
    }
  }

  private hexToScreen(rel: { q: number; r: number }): { x: number; y: number } | null {
    const p = hexToPixel(rel, HEX_WORLD_SIZE)
    return this.worldToScreen(p.x, p.y)
  }

  // ── Hex grid ────────────────────────────────────────────────────────────────

  // Diffs old cone vs new cone and schedules hex fade animations.
  private scheduleConeTransition(oldPlayerPos: HexCoord, oldFacing: number): void {
    const newCone = hexesInCone(
      this.state.playerPosition, this.state.facing, VIEW_RANGE, GRID_COLS, GRID_ROWS,
    )
    const newConeSet = new Set(newCone.map(hexKey))

    // Hexes entering the cone: fade in from 0.
    for (const h of newCone) {
      const k = hexKey(h)
      if (!this.prevConeSet.has(k)) {
        const existing = this.hexAnims.get(k)
        if (existing) {
          existing.target = 1  // was fading out, reverse
        } else {
          this.hexAnims.set(k, { hex: h, alpha: 0, target: 1 })
        }
      }
    }

    // Hexes leaving the cone: fade out.
    const oldCone = hexesInCone(oldPlayerPos, oldFacing, VIEW_RANGE, GRID_COLS, GRID_ROWS)
    for (const h of oldCone) {
      const k = hexKey(h)
      if (!newConeSet.has(k)) {
        const existing = this.hexAnims.get(k)
        if (existing) {
          existing.target = 0  // was fading in, reverse
        } else {
          this.hexAnims.set(k, { hex: h, alpha: 1, target: 0 })
        }
      }
    }

    this.prevConeSet = newConeSet
  }

  // Steps all hex alphas toward their target. Returns true if any are still moving.
  private advanceHexAlphas(dtSec: number): boolean {
    const step = HEX_FADE_SPEED * dtSec
    let active = false
    for (const [k, anim] of this.hexAnims) {
      if (anim.target === 1) {
        anim.alpha = Math.min(1, anim.alpha + step)
        if (anim.alpha < 1) active = true
        // Completed fade-in: remove tracker (will draw at full alpha from cone list).
        else this.hexAnims.delete(k)
      } else {
        anim.alpha = Math.max(0, anim.alpha - step)
        if (anim.alpha > 0) active = true
        else this.hexAnims.delete(k)  // Fully faded out: remove.
      }
    }
    return active
  }

  private drawHexGrid(): void {
    this.gridGfx.clear()

    const player = this.state.playerPosition

    // Draw steady cone hexes (full alpha, not in hexAnims).
    this.gridGfx.lineStyle(1, 0x4a4a7a, 1)
    const cone = hexesInCone(player, this.state.facing, VIEW_RANGE, GRID_COLS, GRID_ROWS)
    for (const h of cone) {
      if (this.hexAnims.has(hexKey(h))) continue  // drawn separately below
      this.strokeHex(player, h, 1)
    }

    // Draw animating hexes (fading in or out) at their current alpha.
    for (const anim of this.hexAnims.values()) {
      if (anim.alpha <= 0) continue
      this.strokeHex(player, anim.hex, anim.alpha)
    }
  }

  private strokeHex(player: HexCoord, h: HexCoord, alpha: number): void {
    const rel    = { q: h.q - player.q, r: h.r - player.r }
    const center = hexToPixel(rel, HEX_WORLD_SIZE)

    this.gridGfx.lineStyle(1, 0x4a4a7a, alpha)
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
    if (started) { this.gridGfx.closePath(); this.gridGfx.strokePath() }
  }

  // ── Entity rendering ────────────────────────────────────────────────────────

  private redrawEntityPositions(): void {
    const player   = this.state.playerPosition
    const entities = getVisibleEntities(this.state, VIEW_RANGE, SENSOR_RANGE, GRID_COLS, GRID_ROWS)

    for (const entity of entities) {
      const render = this.entityRenders.get(entity.id)
      if (!render || this.leavingEntities.has(entity.id)) continue

      const rel = { q: entity.position.q - player.q, r: entity.position.r - player.r }
      const pos = this.hexToScreen(rel)
      if (!pos) { render.gfx.setVisible(false); render.label?.setVisible(false); continue }

      render.gfx.setVisible(true)
      render.gfx.clear()
      this.drawEntityGfx(render.gfx, pos, entity, render.visibility)
      if (render.label) { render.label.setVisible(true); render.label.setPosition(pos.x, pos.y) }
    }
  }

  private syncEntityVisibility(): void {
    const player   = this.state.playerPosition
    const entities = getVisibleEntities(this.state, VIEW_RANGE, SENSOR_RANGE, GRID_COLS, GRID_ROWS)

    const newVis = new Map<number, 'visible' | 'sensor'>()
    for (const e of entities) {
      if (e.isVisible)      newVis.set(e.id, 'visible')
      else if (e.isSensor)  newVis.set(e.id, 'sensor')
    }

    for (const entity of entities) {
      if (!entity.isVisible && !entity.isSensor) continue
      const newV = newVis.get(entity.id)!
      const oldV = this.prevVisibility.get(entity.id)
      const rel  = { q: entity.position.q - player.q, r: entity.position.r - player.r }
      const pos  = this.hexToScreen(rel)
      if (!pos) continue

      if (!oldV) {
        const g     = this.add.graphics().setAlpha(0)
        this.drawEntityGfx(g, pos, entity, newV)
        let label: Phaser.GameObjects.Text | undefined
        if (newV === 'sensor') {
          label = this.add.text(pos.x, pos.y, entity.label, {
            fontSize: '10px', color: '#4a7a4a',
          }).setOrigin(0.5).setAlpha(0)
        }
        this.entityRenders.set(entity.id, { gfx: g, label, visibility: newV })
        this.tweens.add({ targets: label ? [g, label] : [g], alpha: 1, duration: ENTITY_FADE_DURATION })
      } else {
        const render = this.entityRenders.get(entity.id)!
        render.gfx.clear()
        this.drawEntityGfx(render.gfx, pos, entity, newV)
        if (oldV !== newV) {
          if (newV === 'visible' && render.label) { render.label.destroy(); render.label = undefined }
          else if (newV === 'sensor' && !render.label) {
            render.label = this.add.text(pos.x, pos.y, entity.label, {
              fontSize: '10px', color: '#4a7a4a',
            }).setOrigin(0.5).setAlpha(render.gfx.alpha)
          }
          render.visibility = newV
        } else {
          render.label?.setPosition(pos.x, pos.y)
        }
      }
    }

    for (const [id] of this.prevVisibility) {
      if (!newVis.has(id)) {
        const render = this.entityRenders.get(id)
        if (render && !this.leavingEntities.has(id)) {
          this.leavingEntities.add(id)
          const targets: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Text> = [render.gfx]
          if (render.label) targets.push(render.label)
          this.tweens.add({
            targets, alpha: 0, duration: ENTITY_FADE_DURATION,
            onComplete: () => {
              render.gfx.destroy(); render.label?.destroy()
              this.entityRenders.delete(id); this.leavingEntities.delete(id)
            },
          })
        }
      }
    }

    this.prevVisibility = newVis
  }

  private drawEntityGfx(
    g: Phaser.GameObjects.Graphics,
    pos: { x: number; y: number },
    entity: VisibleEntity,
    visibility: 'visible' | 'sensor',
  ): void {
    if (visibility === 'visible') {
      const s = (1.0 - entity.distance / (VIEW_RANGE + 1)) * 40
      g.lineStyle(2, 0xe6c200, 1)
      g.strokeRect(pos.x - s / 2, pos.y - s / 2, s, s)
    } else {
      g.lineStyle(1, 0x4a7a4a, 1)
      g.strokeRect(pos.x - 14, pos.y - 10, 28, 20)
    }
  }
}
