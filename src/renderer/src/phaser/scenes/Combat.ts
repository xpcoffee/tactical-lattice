import Phaser from "phaser";
import { EventBus } from "../EventBus";
import { hexToPixel, hexesInCone, HexCoord } from "../../game/hex/grid";
import {
  createInitialCombatState,
  setLatestState,
  getVisibleEntities,
  CombatState,
  VisibleEntity,
  COMBAT_STATE_CHANGED,
} from "../../game/state/combat";
import {
  GRID_COLS,
  GRID_ROWS,
  VIEW_RANGE,
  SENSOR_RANGE,
} from "../../game/constants";

const PERSP_CAM_D = 80;
const HEX_WORLD_SIZE = 240;
const LATERAL_SCALE = 3.5;
const HORIZON_X_RATIO = 0.5;
const HORIZON_Y_RATIO = 0.4;
const ANCHOR_X_RATIO = 0.2;
const ANCHOR_Y_RATIO = 0.88;

const MOVE_DURATION = 280; // ms — camera glides to new position
const ROTATE_DURATION = 220; // ms — camera rotates to new facing
const ENTITY_FADE_DURATION = 350; // ms — entities fade when entering/leaving range
const HEX_FADE_SPEED = 1 / 0.3; // alpha units/sec — hex outlines fade in 300 ms

// When multiple entities share a hex, they're drawn staggered around the centre.
const STACK_DX = 10;
const STACK_DY = 6;

// Companion strip: entities standing on the player's hex are drawn in a
// fixed screen-space row slightly above centre. The first sprite sits just
// right of screen centre, subsequent entities alternate right/left around it.
const COMPANION_STRIP_Y_RATIO = 0.52; // just below screen centre
const COMPANION_STRIP_CENTER_RATIO = 0.55; // first sprite sits just right of centre
const COMPANION_STRIP_STEP = 180; // px between alternating positions

// ─── Hex animation tracking ───────────────────────────────────────────────────

interface HexAnim {
  hex: HexCoord;
  alpha: number;
  target: number; // 1 = fading/holding in, 0 = fading out
}

function hexKey(h: HexCoord): string {
  return `${h.q},${h.r}`;
}

// ─── Entity render tracking ───────────────────────────────────────────────────

interface EntityRender {
  gfx: Phaser.GameObjects.Graphics; // fallback / sensor / objective render
  sprite?: Phaser.GameObjects.Image; // used for visible mech entities
  label?: Phaser.GameObjects.Text;
  visibility: "visible" | "sensor";
}

// Enemy mech sprite size as a ratio of the player mech's rendered width,
// indexed by hex distance to the player (0 = same hex, up to VIEW_RANGE=3).
// The player sprite is 320 px (Mech.tsx); the enemy bitmap is 80 px native.
const PLAYER_MECH_PX = 320;
const MECH_SPRITE_NATIVE = 80;
const MECH_RATIO_BY_DIST = [0.9, 0.1, 0.05, 0.025];
const MECH_SCALE_BY_DIST = MECH_RATIO_BY_DIST.map(
  (r) => (PLAYER_MECH_PX * r) / MECH_SPRITE_NATIVE,
);

export class Combat extends Phaser.Scene {
  private state!: CombatState;
  private gridGfx!: Phaser.GameObjects.Graphics;
  private playerAnchor!: { x: number; y: number };
  private horizonX!: number;
  private horizonY!: number;

  // Movement animation — animOffset is added to world coords in worldToScreen.
  // Starts at +delta (view looks like old position), tweens to 0 (new position).
  // This gives a smooth forward camera glide with no bounce.
  private animOffset = { wx: 0, wy: 0 };
  private isMoving = false;

  // Rotation animation — angleOffset is added to the facing rotation angle.
  // Starts at -(delta * 60°) along shortest arc, tweens to 0.
  private animRot = { offset: 0 };
  private isRotating = false;

  // Per-hex alpha for fade-in/out of grid outlines as they enter/leave the cone.
  private hexAnims = new Map<string, HexAnim>();
  private prevConeSet = new Set<string>();

  // Persistent entity renders.
  private entityRenders = new Map<number, EntityRender>();
  private leavingEntities = new Set<number>();
  private prevVisibility = new Map<number, "visible" | "sensor">();
  // Updated on every visibility sync / redraw — stack index within each hex bucket.
  private entityStackInfo = new Map<
    number,
    { index: number; groupSize: number; onPlayerHex: boolean }
  >();

  // Per-entity screen-space transition tween. When an entity's rendered
  // position changes (new hex, or ground↔strip), we capture its previous
  // screen pos as (fromX, fromY) and tween `alpha` from 0→1. In
  // entityScreenPos, the final position is lerp(from → target, alpha).
  // Works uniformly for ground→ground, ground→strip, and strip→ground.
  private entityScreenTweens = new Map<
    number,
    { fromX: number; fromY: number; fromScale: number; alpha: number }
  >();

  constructor() {
    super("Combat");
  }

  create(): void {
    this.playerAnchor = {
      x: this.scale.width * ANCHOR_X_RATIO,
      y: this.scale.height * ANCHOR_Y_RATIO,
    };
    this.horizonX = this.scale.width * HORIZON_X_RATIO;
    this.horizonY = this.scale.height * HORIZON_Y_RATIO;

    this.gridGfx = this.add.graphics();
    this.state = createInitialCombatState();

    // Initial draw — no animations, set cone as baseline.
    const initCone = hexesInCone(
      this.state.playerPosition,
      this.state.facing,
      VIEW_RANGE,
      GRID_COLS,
      GRID_ROWS,
    );
    this.prevConeSet = new Set(initCone.map(hexKey));
    this.drawHexGrid();
    this.syncEntityVisibility();

    setLatestState(this.state);
    EventBus.emit("scene-ready", this);
    EventBus.emit(COMBAT_STATE_CHANGED, this.state);

    EventBus.on(COMBAT_STATE_CHANGED, (newState: CombatState) => {
      const oldPos = this.state.playerPosition;
      const oldFacing = this.state.facing;

      // Snapshot the current rendered screen position of every tracked entity
      // BEFORE the state swap, then after the swap we know where each entity
      // was drawn — the starting point for the new screen-space glide tween.
      const visibleEntitiesOld = getVisibleEntities(
        this.state,
        VIEW_RANGE,
        SENSOR_RANGE,
        GRID_COLS,
        GRID_ROWS,
      );
      this.updateEntityStackInfo(visibleEntitiesOld);
      const oldScreenByEntity = new Map<
        number,
        { x: number; y: number; scale: number }
      >();
      for (const e of visibleEntitiesOld) {
        if (!e.isVisible && !e.isSensor) continue;
        const p = this.entityScreenPos(e);
        const scale = this.entityMechScale(e);
        if (p) oldScreenByEntity.set(e.id, { x: p.x, y: p.y, scale });
      }

      this.state = newState;

      const moved =
        oldPos.q !== newState.playerPosition.q ||
        oldPos.r !== newState.playerPosition.r;
      const turned = oldFacing !== newState.facing;

      // Start screen-space glide tweens for entities whose rendered position
      // will change (new hex, or ground↔strip transition).
      this.scheduleEntityGlides(oldScreenByEntity);

      // Diff the cone for hex fade animations.
      this.scheduleConeTransition(oldPos, oldFacing);

      if (moved) {
        // Correct sign: +delta so the view starts at the old position and glides forward.
        const delta = hexToPixel(
          {
            q: newState.playerPosition.q - oldPos.q,
            r: newState.playerPosition.r - oldPos.r,
          },
          HEX_WORLD_SIZE,
        );
        this.animOffset.wx = delta.x;
        this.animOffset.wy = delta.y;
        this.isMoving = true;

        this.tweens.add({
          targets: this.animOffset,
          wx: 0,
          wy: 0,
          duration: MOVE_DURATION,
          ease: "Sine.easeInOut",
          onComplete: () => {
            this.isMoving = false;
            this.syncEntityVisibility();
          },
        });
        // Entities don't refresh until the glide finishes.
      } else if (turned) {
        // Shortest-arc delta in ±3 range so wrapping (0→5) rotates by 60°, not 300°.
        let rawDelta = newState.facing - oldFacing;
        while (rawDelta > 3) rawDelta -= 6;
        while (rawDelta < -3) rawDelta += 6;
        this.animRot.offset = (-rawDelta * Math.PI) / 3;
        this.isRotating = true;

        this.tweens.add({
          targets: this.animRot,
          offset: 0,
          duration: ROTATE_DURATION,
          ease: "Sine.easeInOut",
          onComplete: () => {
            this.isRotating = false;
            this.syncEntityVisibility();
          },
        });
      }
    });
  }

  // Runs every frame; drives hex-alpha animations and redraws during movement.
  update(_time: number, delta: number): void {
    const dtSec = delta / 1000;
    const hexStillAnimating = this.advanceHexAlphas(dtSec);
    const entitiesStillMoving = this.entityScreenTweens.size > 0;
    if (
      this.isMoving ||
      this.isRotating ||
      hexStillAnimating ||
      entitiesStillMoving
    ) {
      this.drawHexGrid();
      if (this.isMoving || this.isRotating || entitiesStillMoving)
        this.redrawEntityPositions();
    }
  }

  // ── Perspective projection ──────────────────────────────────────────────────

  private worldToScreen(
    wx: number,
    wy: number,
  ): { x: number; y: number } | null {
    const angle = ((this.state.facing - 2) * Math.PI) / 3 + this.animRot.offset;
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const awx = wx + this.animOffset.wx;
    const awy = wy + this.animOffset.wy;
    const rx = awx * cos - awy * sin;
    const ry = awx * sin + awy * cos;

    const eyeDepth = PERSP_CAM_D - ry;
    if (eyeDepth <= 0) return null;

    const scale = PERSP_CAM_D / eyeDepth;
    return {
      x:
        this.horizonX +
        (this.playerAnchor.x - this.horizonX + rx * LATERAL_SCALE) * scale,
      y: this.horizonY + (this.playerAnchor.y - this.horizonY) * scale,
    };
  }

  private hexToScreen(rel: {
    q: number;
    r: number;
  }): { x: number; y: number } | null {
    const p = hexToPixel(rel, HEX_WORLD_SIZE);
    return this.worldToScreen(p.x, p.y);
  }

  // For each entity whose rendered position will change, capture its previous
  // screen position and tween a `alpha` 0→1 value. entityScreenPos lerps
  // between the captured from-point and the live target position.
  // Works uniformly across ground→ground, ground→strip, and strip→ground.
  private entityMechScale(entity: VisibleEntity): number {
    const idx = Math.min(entity.distance, MECH_SCALE_BY_DIST.length - 1);
    return MECH_SCALE_BY_DIST[idx];
  }

  private scheduleEntityGlides(
    oldScreenByEntity: Map<number, { x: number; y: number; scale: number }>,
  ): void {
    // Refresh stack info with NEW state so entityScreenPos targets are correct.
    const visibleNew = getVisibleEntities(
      this.state,
      VIEW_RANGE,
      SENSOR_RANGE,
      GRID_COLS,
      GRID_ROWS,
    );
    this.updateEntityStackInfo(visibleNew);

    for (const e of visibleNew) {
      if (!e.isVisible && !e.isSensor) continue;
      const from = oldScreenByEntity.get(e.id);
      if (!from) continue; // wasn't rendered before — fade-in handles it
      const target = this.entityScreenPos(e);
      if (!target) continue;
      // Skip when the position is essentially unchanged (stationary entity).
      if (Math.abs(from.x - target.x) < 1 && Math.abs(from.y - target.y) < 1)
        continue;
      // Kill any in-flight glide so overlapping moves behave cleanly.
      const existing = this.entityScreenTweens.get(e.id);
      if (existing) this.tweens.killTweensOf(existing);
      const glide = {
        fromX: from.x,
        fromY: from.y,
        fromScale: from.scale,
        alpha: 0,
      };
      this.entityScreenTweens.set(e.id, glide);
      this.tweens.add({
        targets: glide,
        alpha: 1,
        duration: MOVE_DURATION,
        ease: "Sine.easeInOut",
        onComplete: () => this.entityScreenTweens.delete(e.id),
      });
    }
  }

  // ── Hex grid ────────────────────────────────────────────────────────────────

  // Diffs old cone vs new cone and schedules hex fade animations.
  private scheduleConeTransition(
    oldPlayerPos: HexCoord,
    oldFacing: number,
  ): void {
    const newCone = hexesInCone(
      this.state.playerPosition,
      this.state.facing,
      VIEW_RANGE,
      GRID_COLS,
      GRID_ROWS,
    );
    const newConeSet = new Set(newCone.map(hexKey));

    // Hexes entering the cone: fade in from 0.
    for (const h of newCone) {
      const k = hexKey(h);
      if (!this.prevConeSet.has(k)) {
        const existing = this.hexAnims.get(k);
        if (existing) {
          existing.target = 1; // was fading out, reverse
        } else {
          this.hexAnims.set(k, { hex: h, alpha: 0, target: 1 });
        }
      }
    }

    // Hexes leaving the cone: fade out.
    const oldCone = hexesInCone(
      oldPlayerPos,
      oldFacing,
      VIEW_RANGE,
      GRID_COLS,
      GRID_ROWS,
    );
    for (const h of oldCone) {
      const k = hexKey(h);
      if (!newConeSet.has(k)) {
        const existing = this.hexAnims.get(k);
        if (existing) {
          existing.target = 0; // was fading in, reverse
        } else {
          this.hexAnims.set(k, { hex: h, alpha: 1, target: 0 });
        }
      }
    }

    this.prevConeSet = newConeSet;
  }

  // Steps all hex alphas toward their target. Returns true if any are still moving.
  private advanceHexAlphas(dtSec: number): boolean {
    const step = HEX_FADE_SPEED * dtSec;
    let active = false;
    for (const [k, anim] of this.hexAnims) {
      if (anim.target === 1) {
        anim.alpha = Math.min(1, anim.alpha + step);
        if (anim.alpha < 1) active = true;
        // Completed fade-in: remove tracker (will draw at full alpha from cone list).
        else this.hexAnims.delete(k);
      } else {
        anim.alpha = Math.max(0, anim.alpha - step);
        if (anim.alpha > 0) active = true;
        else this.hexAnims.delete(k); // Fully faded out: remove.
      }
    }
    return active;
  }

  private drawHexGrid(): void {
    this.gridGfx.clear();

    const player = this.state.playerPosition;

    // Draw steady cone hexes (full alpha, not in hexAnims).
    this.gridGfx.lineStyle(1, 0x4a4a7a, 1);
    const cone = hexesInCone(
      player,
      this.state.facing,
      VIEW_RANGE,
      GRID_COLS,
      GRID_ROWS,
    );
    for (const h of cone) {
      if (this.hexAnims.has(hexKey(h))) continue; // drawn separately below
      this.strokeHex(player, h, 1);
    }

    // Draw animating hexes (fading in or out) at their current alpha.
    for (const anim of this.hexAnims.values()) {
      if (anim.alpha <= 0) continue;
      this.strokeHex(player, anim.hex, anim.alpha);
    }
  }

  private strokeHex(player: HexCoord, h: HexCoord, alpha: number): void {
    const rel = { q: h.q - player.q, r: h.r - player.r };
    const center = hexToPixel(rel, HEX_WORLD_SIZE);

    this.gridGfx.lineStyle(1, 0x4a4a7a, alpha);
    let started = false;
    this.gridGfx.beginPath();
    for (let i = 0; i < 6; i++) {
      const vAngle = (Math.PI / 3) * i;
      const pos = this.worldToScreen(
        center.x + HEX_WORLD_SIZE * Math.cos(vAngle),
        center.y + HEX_WORLD_SIZE * Math.sin(vAngle),
      );
      if (!pos) continue;
      if (!started) {
        this.gridGfx.moveTo(pos.x, pos.y);
        started = true;
      } else this.gridGfx.lineTo(pos.x, pos.y);
    }
    if (started) {
      this.gridGfx.closePath();
      this.gridGfx.strokePath();
    }
  }

  // ── Entity rendering ────────────────────────────────────────────────────────

  /** Recomputes per-entity stack info (bucket index, size, whether on player hex). */
  private updateEntityStackInfo(entities: VisibleEntity[]): void {
    this.entityStackInfo.clear();
    const player = this.state.playerPosition;
    const playerKey = hexKey(player);

    const buckets = new Map<string, VisibleEntity[]>();
    for (const e of entities) {
      if (!e.isVisible && !e.isSensor) continue;
      const k = hexKey(e.position);
      const arr = buckets.get(k);
      if (arr) arr.push(e);
      else buckets.set(k, [e]);
    }

    for (const [k, bucket] of buckets) {
      bucket.sort((a, b) => a.id - b.id); // stable order → no jitter
      const onPlayerHex = k === playerKey;
      const groupSize = bucket.length;
      bucket.forEach((e, index) => {
        this.entityStackInfo.set(e.id, { index, groupSize, onPlayerHex });
      });
    }
  }

  /** Returns final screen coords for a visible/sensor entity, or null if off-screen. */
  private entityScreenPos(
    entity: VisibleEntity,
  ): { x: number; y: number } | null {
    const target = this.entityTargetPos(entity);
    if (!target) return null;
    // Apply screen-space glide tween if active.
    const glide = this.entityScreenTweens.get(entity.id);
    if (!glide) return target;
    const a = glide.alpha;
    return {
      x: glide.fromX + (target.x - glide.fromX) * a,
      y: glide.fromY + (target.y - glide.fromY) * a,
    };
  }

  /** Untweened screen position an entity should eventually settle at. */
  private entityTargetPos(
    entity: VisibleEntity,
  ): { x: number; y: number } | null {
    const info = this.entityStackInfo.get(entity.id);
    if (!info) return null;

    if (info.onPlayerHex) {
      // Companion strip: first sprite at centre anchor, subsequent ones
      // alternate right / left: 0, +1·step, -1·step, +2·step…
      const centreX = this.scale.width * COMPANION_STRIP_CENTER_RATIO;
      const y = this.scale.height * COMPANION_STRIP_Y_RATIO;
      const i = info.index;
      const slot = i === 0 ? 0 : i % 2 === 1 ? (i + 1) / 2 : -(i / 2);
      return { x: centreX + slot * COMPANION_STRIP_STEP, y };
    }

    // Ground rendering: project the hex centre, then apply stagger offset.
    const player = this.state.playerPosition;
    const rel = {
      q: entity.position.q - player.q,
      r: entity.position.r - player.r,
    };
    const p = hexToPixel(rel, HEX_WORLD_SIZE);
    const base = this.worldToScreen(p.x, p.y);
    if (!base) return null;
    const stackOffset = info.index - (info.groupSize - 1) / 2;
    return {
      x: base.x + stackOffset * STACK_DX,
      y: base.y + stackOffset * STACK_DY,
    };
  }

  private redrawEntityPositions(): void {
    const entities = getVisibleEntities(
      this.state,
      VIEW_RANGE,
      SENSOR_RANGE,
      GRID_COLS,
      GRID_ROWS,
    );
    this.updateEntityStackInfo(entities);

    for (const entity of entities) {
      const render = this.entityRenders.get(entity.id);
      if (!render || this.leavingEntities.has(entity.id)) continue;

      const pos = this.entityScreenPos(entity);
      if (!pos) {
        render.gfx.setVisible(false);
        render.sprite?.setVisible(false);
        render.label?.setVisible(false);
        continue;
      }

      render.gfx.setVisible(true);
      this.paintEntity(render, pos, entity, render.visibility);
      if (render.label) {
        render.label.setVisible(true);
        render.label.setPosition(pos.x, pos.y);
      }
    }
  }

  private syncEntityVisibility(): void {
    const entities = getVisibleEntities(
      this.state,
      VIEW_RANGE,
      SENSOR_RANGE,
      GRID_COLS,
      GRID_ROWS,
    );
    this.updateEntityStackInfo(entities);

    const newVis = new Map<number, "visible" | "sensor">();
    for (const e of entities) {
      if (e.isVisible) newVis.set(e.id, "visible");
      else if (e.isSensor) newVis.set(e.id, "sensor");
    }

    for (const entity of entities) {
      if (!entity.isVisible && !entity.isSensor) continue;
      const newV = newVis.get(entity.id)!;
      const oldV = this.prevVisibility.get(entity.id);
      const pos = this.entityScreenPos(entity);
      if (!pos) continue;

      if (!oldV) {
        // Entity is re-entering after a fade-out that hasn't finished yet:
        // cancel the fade-out tween and reuse the existing render.
        if (this.leavingEntities.has(entity.id)) {
          const existing = this.entityRenders.get(entity.id);
          if (existing) {
            for (const t of this.renderTargets(existing))
              this.tweens.killTweensOf(t);
            this.leavingEntities.delete(entity.id);
            this.paintEntity(existing, pos, entity, newV);
            existing.visibility = newV;
            this.tweens.add({
              targets: this.renderTargets(existing),
              alpha: 1,
              duration: ENTITY_FADE_DURATION,
            });
            continue;
          }
        }
        const g = this.add.graphics().setAlpha(0);
        let label: Phaser.GameObjects.Text | undefined;
        if (newV === "sensor") {
          label = this.add
            .text(pos.x, pos.y, entity.label, {
              fontSize: "10px",
              color: "#4a7a4a",
            })
            .setOrigin(0.5)
            .setAlpha(0);
        }
        const render: EntityRender = { gfx: g, label, visibility: newV };
        this.paintEntity(render, pos, entity, newV);
        if (render.sprite) render.sprite.setAlpha(0);
        this.entityRenders.set(entity.id, render);
        this.tweens.add({
          targets: this.renderTargets(render),
          alpha: 1,
          duration: ENTITY_FADE_DURATION,
        });
      } else {
        const render = this.entityRenders.get(entity.id);
        if (!render) continue; // guard: render may have been destroyed mid-animation
        this.paintEntity(render, pos, entity, newV);
        if (oldV !== newV) {
          if (newV === "visible" && render.label) {
            render.label.destroy();
            render.label = undefined;
          } else if (newV === "sensor" && !render.label) {
            render.label = this.add
              .text(pos.x, pos.y, entity.label, {
                fontSize: "10px",
                color: "#4a7a4a",
              })
              .setOrigin(0.5)
              .setAlpha(render.gfx.alpha);
          }
          render.visibility = newV;
        } else {
          render.label?.setPosition(pos.x, pos.y);
        }
      }
    }

    for (const [id] of this.prevVisibility) {
      if (!newVis.has(id)) {
        const render = this.entityRenders.get(id);
        if (render && !this.leavingEntities.has(id)) {
          this.leavingEntities.add(id);
          this.tweens.add({
            targets: this.renderTargets(render),
            alpha: 0,
            duration: ENTITY_FADE_DURATION,
            onComplete: () => {
              render.gfx.destroy();
              render.sprite?.destroy();
              render.label?.destroy();
              this.entityRenders.delete(id);
              this.leavingEntities.delete(id);
            },
          });
        }
      }
    }

    this.prevVisibility = newVis;
  }

  // Draws an entity using either the mech sprite (visible enemy mech) or a
  // graphics marker (objective or sensor-only). Creates the sprite on demand.
  private paintEntity(
    render: EntityRender,
    pos: { x: number; y: number },
    entity: VisibleEntity,
    visibility: "visible" | "sensor",
  ): void {
    const useSprite = visibility === "visible" && entity.type === "mech";

    if (useSprite) {
      if (!render.sprite) {
        render.sprite = this.add
          .image(pos.x, pos.y, "enemy-mech")
          .setOrigin(0.5, 1)
          .setAlpha(render.gfx.alpha);
      }
      const targetScale = this.entityMechScale(entity);
      // Lerp scale during an active glide so ground↔strip transitions don't pop.
      const glide = this.entityScreenTweens.get(entity.id);
      const scale = glide
        ? glide.fromScale + (targetScale - glide.fromScale) * glide.alpha
        : targetScale;
      render.sprite.setPosition(pos.x, pos.y);
      render.sprite.setScale(scale);
      render.sprite.setVisible(true);
      render.gfx.clear();
    } else {
      if (render.sprite) render.sprite.setVisible(false);
      render.gfx.clear();
      if (visibility === "visible") {
        const s = (1.0 - entity.distance / (VIEW_RANGE + 1)) * 40;
        render.gfx.lineStyle(2, 0xe6c200, 1);
        render.gfx.strokeRect(pos.x - s / 2, pos.y - s / 2, s, s);
      } else {
        render.gfx.lineStyle(1, 0x4a7a4a, 1);
        render.gfx.strokeRect(pos.x - 14, pos.y - 10, 28, 20);
      }
    }
  }

  // All display objects belonging to an entity render — for coordinated tweens.
  private renderTargets(
    render: EntityRender,
  ): Array<
    | Phaser.GameObjects.Graphics
    | Phaser.GameObjects.Text
    | Phaser.GameObjects.Image
  > {
    const t: Array<
      | Phaser.GameObjects.Graphics
      | Phaser.GameObjects.Text
      | Phaser.GameObjects.Image
    > = [render.gfx];
    if (render.sprite) t.push(render.sprite);
    if (render.label) t.push(render.label);
    return t;
  }
}
