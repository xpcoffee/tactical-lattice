# Tactical Lattice — Gameplay Design

## Core Fantasy

You are a remote operator deploying and upgrading a combat mech. Between missions you obsess over the build — balancing physics, power, and faction loyalty. In combat, you read the battlefield from your drone's eye view and make moment-to-moment decisions that your build either supports or punishes.

---

## Two Loops

### Loop 1 — The Hangar (Build)

The hangar is a combined inventory, build tool, and tech tree. There is no abstract crafting — all components are physical objects with real attributes that interact.

#### Component Slots

| Slot | Purpose |
|---|---|
| **Core** | The mech's kill condition and control method. Multiple cores = redundancy. |
| **Chassis** | Structural frame. Determines available component mounting points, base armor zones. |
| **Armaments** | Weapons. Each has energy cost, thrust effect (recoil), and constant inertia. |
| **Logistics Drones** | Support units. Provide passive combat abilities. |

#### Core Types
- **Remote Controlled Core** — player-operated; primary play mode
- **AI Core** — autonomous operation (future: auto-battle system)
- A mech is destroyed when **all cores are destroyed**
- Multiple cores can be installed for redundancy

#### Physical Attributes

Every component has three physical attributes:

| Attribute | Meaning |
|---|---|
| **Inertia** | Constant weight. Accumulates across all components. Heavier mech = more time ticks to move. |
| **Thrust** | Movement power. Can be a constant value or a per-tick modifier (e.g. recoil pushes back for 1 tick). |
| **Energy** | Generation (+) or consumption (−). The mech must have net energy ≥ 0 to operate. |

**Example — Heavy Cannon:**
- Energy: −5 (requires generators to support)
- Thrust: −5 for 1 time tick (recoil — pushes mech back unless counteracted)
- Inertia: +1 (constant weight)

**Example — Damper:**
- Thrust: +7 for 1 time tick (absorbs recoil)
- Inertia: +1

Leaving recoil unmitigated is a valid build choice — repositioning via knockback can be a tactic.

#### Economy

- **Salvaged components** — actual physical parts looted from destroyed enemies or mission rewards. No abstract currency for gear.
- **Faction reputation** — earned by running missions aligned with a faction. Reputation unlocks **augments**: permanent modifications applied to a specific component in the hangar.
  - Example factions: weapons manufacturers (explosive augment), smuggler guild (short-range teleport augment)
  - Augments are the primary tech-tree progression path

#### Persistence

The hangar persists across mech loss. If your mech is destroyed in combat, faction reputation, augments, and salvaged components remain — the player rebuilds from what they have.

---

### Loop 2 — Missions

#### Mission Board

No world map. The player selects from a list of available missions on a mission board. Mission types are a parameter; the first implemented type is combat.

#### Combat

##### Visual Layout

```
┌─────────────────┬───────────────────────────────┐
│                 │                               │
│   MECH STATUS   │       BATTLEFIELD VIEW        │
│     VIEW        │    (enemies, objectives,      │
│   (bottom-left) │     action/target select)     │
│                 │                               │
│                 ├───────────────────────────────┤
│                 │     MINIMAP  (10x10 hex)      │
└─────────────────┴───────────────────────────────┘
```

- **Mech status view (bottom-left):** Over-the-shoulder view of your mech from a trailing logistics drone. Shows visual state — overheated weapons, destroyed limbs, action animations. Status panel only, not an action surface.
- **Battlefield view (center/main):** Primary interaction surface. Pixelated isometric sprites. Player selects targets and actions here.
- **Minimap (top-right):** 10x10 hex grid. Positional awareness only.

##### Time Tick System

All units act **simultaneously**. Time is discrete — every action has a tick cost:

| Action | Time Ticks |
|---|---|
| Move 1 hex | 1 |
| Light weapon fire | 1 |
| Heavy weapon fire | 3 |

**Flow:**
1. Player selects an action
2. The world advances by that action's tick count — all units execute their queued actions over those ticks
3. World pauses when the player's action resolves
4. Player selects their next action

Enemy speed, drone support timing, and weapon choice all interact with this system. A slow heavy weapon gives enemies 3 ticks of movement before you can act again.

##### Damage Model

- Per-component HP on every mech (yours and enemies)
- Destroying a component disables its function — lose a weapon slot, lose that weapon; destroy an engine, movement degrades
- **Kill condition:** all cores destroyed

##### Scale

4–8 enemies per combat mission.

##### Logistics Drone Abilities

Drones provide passive support triggered as abilities/cooldowns. They are not separate units on the hex map.

| Ability | Effect |
|---|---|
| **Field Repair** | Restore HP to a damaged component mid-combat |
| **Ammo Resupply** | Reload or refill a weapon |
| **Scouting / Reveal** | Reveal enemy positions on minimap beyond normal sensor range |

---

## What Makes This Game Distinctive

1. **Physics-first builds** — Inertia/thrust/energy are real values that interact. The build puzzle has direct mechanical consequences in combat (knockback, movement cost, power constraints).
2. **Time ticks, not turns** — Simultaneous resolution with pause-on-decision. Slower weapons are genuinely riskier; fast builds feel different from heavy builds.
3. **Salvage-based economy** — You want specific enemy components, not abstract currency. Mission selection is motivated by what enemies drop.
4. **Faction augments as tech tree** — Progression is relational and flavored, not a skill tree grid.
5. **Remote operation framing** — The mech is a tool, not an avatar. The trailing drone camera reinforces this aesthetically.

---

## Open Questions (deferred)

- Additional mission types beyond combat
- Faction relationship mechanics (how reputation is gained/lost, conflicting factions)
- AI Core auto-battle system
- Enemy faction compositions and how they telegraph build types
- Multiplayer / async PvP potential
