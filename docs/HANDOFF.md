# Undercroft: Design Handoff

Co-op (and solo) first-person horror extraction game. Players run repeated expeditions into the catacombs to resolve **Afflictions**, scavenging loot, managing light, and surviving Thralls. The feel is anxious, scary, and suspenseful.

## Core loop

1. **Hub**: buy and repair gear, craft, pick a loadout, choose an Affliction.
2. **Descend**: from the start room into a partly procedural catacomb map.
3. **Scavenge and survive**: find loot, clues, and rite items; manage light, stamina, and sanity.
4. **Decide**: push deeper for better loot, or extract.
5. **Extract or resolve**: get out with what you carry, or complete the rite.
6. **Sell, repair, repeat.**

## Afflictions

An Affliction is the force behind a run. It is not a single roaming monster; it defines the conditions of the map.

Each Affliction defines:

- Name
- Thralls (creature types encountered)
- Rooms that can appear
- The rite that resolves it
- Loot types

### Progression

- The first Affliction (**Gloaming**) is the tutorial.
- Resolving it unlocks a tougher Affliction, which then unlocks several more.
- Resolved Afflictions can be replayed for their loot or challenge.

### The Affliction meter

- Roughly **30 minutes** to reach 100%.
- Advanced by **time underground**, **loot carried**, and **killing creatures**.
- No visible meter. Players read it through effects: sounds, flickering and failing lights, whispers, bolder Thralls.
- At 100%, the Affliction **manifests** somewhere in the map and hunts the players.

### Outcomes

- **Resolve**: complete the rite. The Affliction is done, progression unlocks, players automatically extract.
- **Banish**: temporarily kill the manifestation. Players extract, but the Affliction is not resolved.
- **Extract**: leave at any time through an extraction point.
- **Die**: lose what you carried (except shrined items).

The Affliction can manifest before the rite is possible.

## Rites

- Every player can open the rite at any time and see its requirements.
- Requirements start hidden. **Generic clues** found in the catacombs reveal them one slot at a time. No riddles or mystery solving.
- The **last clue reveals the rite location**.
- Revealed requirements are **recorded across runs**, so failed runs still make progress.
- Players hand the required items to one **rite holder**. The holder goes to the valid room (a room banner appears on entry) and initiates the rite. Nothing needs to be placed. No boss fight.
- If the holder dies, items drop where they fell; anyone can pick them up and become the holder.

## Gloaming (first Affliction)

- A darkening force in the catacombs. Teaches light management.
- **Rite requirements**: 5 candles, 1 chalk, the Pendant. Any candle tier counts.
- Candles can be placed to light areas, but they're also needed for the rite and they burn down. A burnt stub doesn't count.
- Chalk gives one wall marking per stick, so players must save one for the rite.

### Gloaming Thrall (unnamed)

- Looks like a random person with black eyes, standing in a corner.
- **Visible only in half-light**: not in full light, not in full darkness. A headlamp on its lowest setting reveals it (and saves battery). Headlamp flicker also briefly reveals it.
- When aggroed: moves slowly, then in sudden fast bursts. Melee attack.
- Infrequent, but a nightmare to deal with.

### Second Thrall concept (placement undecided)

- Moves slowly when the player moves slowly or stands still. When the player moves fast, it runs much faster than the player.

## The map

- Every expedition starts in a **start room** with either **stairs down** or a **rope to rappel down**. The rope can be taken, which removes that route back up.
- Each map has **5 static major rooms**, built in Blender:
  1. Stairwell (start)
  2. Ossuary Hall
  3. Quarry Gallery
  4. Cistern (flooded, swimmable)
  5. Gloaming Chapel (deepest)
- Rooms are **connected randomly** by catacomb features: halls, canals, squeezes, crawlspaces, square rooms, secret doors, swimmable sections.
- **Extraction points** are defined in the room models. Players must remember how to get back to them.
- **Deeper = better loot, harder creatures, harder extraction.**
- Generation is grid-based from a modular Blender kit with standardized openings. The map graph guarantees a path from start to the deepest room and includes loops.
- **Hallucination pockets** (later): tiles that open into non-catacomb places (a bedroom, a hospital ward, a diner). Higher risk, better loot.

## Navigation

- **Chalk**: one mark per stick on walls.
- **Glow sticks**: throwable, temporary, colored light. Their dim glow creates half-light.
- Mapping may come later.

## Player systems

- **Sanity**: the health bar. Drained by Thrall attacks, darkness, and seeing things. At zero, the player is downed.
- **Stamina**: sprinting, climbing, swimming, squeezes, struggling free.
- **Claustrophobia**: crawlspaces (slow, can't turn, light points forward), squeezes (heavy packs won't fit), swim sections, tight spaces.
- **Dropped loot** can be picked up by any player.

## Shrines

- Found in the catacombs. Each holds **one item** that stays with the player regardless of death or extraction.

## Gear (purchased)

- **Headlamps**: starter is inefficient, eats batteries, and flickers a lot (which reveals the half-light Thrall). Upgrades are steadier and more efficient, with low and bright settings. The rite benefits from bright light, so saving battery matters.
- **Flashlight**, **batteries**, **rope**, **lighter**, **glow sticks**.
- **Backpacks**: tiered capacity. Upgraded packs are **waterproof**.
- **Ranged weapons**: revolver, shotgun. Ammo is always purchased, never crafted. Gunfire is loud and attracts danger.
- **Smelling salts**: revive a downed player. Solo: auto-used if carried.
- **Bandages**: restore some sanity.

## Melee weapons

- **Crowbar**: pries open niches, coffins, and secret doors. Slow.
- **Knife**: fast, quiet, short reach. Helps with cloth and rope crafting.
- **Brick**: found everywhere, free, breaks after a few hits, throwable.

## Crafting

- **A player skill.** No workbenches or factories.
- Can be done in the hub or during an expedition.
- In an expedition: crafting takes time, the player can't move, it requires light, and it makes a little noise.
- Recipes unlock by use or by finding explorer notes. Higher skill means faster, better results with fewer materials.
- Example recipes: candles (wax scraps + wick), torches (bone + rag + oil), chalk (limestone), bone wards, noisemakers, bandages, battery splices (two dead batteries + wire = one weak battery), oilcloth pouches (protect one or two items from water).
- **Candles have tiers**: brightness and burn time.

## Water

- Swimming with a non-waterproof pack soaks candles, lighters, chalk, and craft materials. Wet items don't work until dried.
- Drying takes time and is faster near a lit flame.
- Wet batteries short out and lose charge.

## Economy

- Loot is sold for money. Money buys and repairs gear.
- Gear has durability.

## Open questions

- Placement of the movement-mirroring Thrall.
- Gloaming manifestation behavior and how it's banished.
- Loot types and values.
- Hub design.
- Afflictions beyond Gloaming.
- Roles (later, built on working mechanics).
- Hallucination pockets (post-beta candidate).
