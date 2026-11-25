# Handoff: the pivot to places, persistence and purpose

Undercroft is an extraction horror game in the catacombs, with the feel of _As Above, So Below_ and _Constantine_. It isn't Arc Raiders and it isn't Phasmophobia. This document is the design for moving it there: a fixed, hand-built map that players learn and change; light, sound and creatures that make the place frightening without making every run a fight; and reasons to keep going down.

It's a living document. When a phase is built, move what it settled into the matching `docs/dev/` page and mark it done here. The items, crafting and loot design stays in [handoff-gear-crafting-loot.md](handoff-gear-crafting-loot.md).

Status markers: **Decided** is agreed; **Proposed** is a suggestion not yet confirmed; **Open** needs a decision.

## Why the pivot

Testing showed the game stopped being fun once the newness wore off:

- **Every system punished engaging and nothing rewarded it.** Light, noise, kills and carried loot all fill meters. A full attraction meter summons a witch 5–10 m from the player, out of sight, so the best play was to touch nothing, stay dark and leave.
- **The procedural map felt small.** Five or six rooms joined by endless loops of uninteresting halls, easy to get lost in and hard to remember.
- **Combat was the default outcome, and it was clunky.** Rats and spiders ran in to be smashed; the witch wiped the party; weapons felt the same, with little feedback.
- **The loop was borrowed** from Arc Raiders (loot, craft, repair, tiers) without what makes that loop work: readable enemies, great gunplay, big handcrafted maps, and other players.

## The core

> You go under the city to rob the dead, and something down there is awake. Each descent you learn the place a little better, change it a little more, and take what you can before the catacombs take you.

What keeps players coming back:

- **Knowing the place:** the same catacombs every run, so familiarity is mastery. Small changes from run to run matter because the rest is known.
- **Changing the place:** shortcuts opened, lamps relit, marks left on the walls. The map becomes yours.
- **Purpose each run:** quest tasks, relics to find or attune, the dead to return, and Absalom to understand.
- **Greed against fear:** go deeper for better things, or leave with what you have.

## Names (Decided)

The Gloaming is retired as a name.

| What          | Name                                    | Notes                                                                                   |
| ------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| The first map | **The Under-Parish**                    | The catacombs beneath the parish: the starter map and the way into the larger catacombs |
| The way in    | **The Sewer**, then **the First Stair** | Every run starts in the Sewer; the First Stair leads down into the Parish               |
| The demon     | **Absalom**                             | The first Affliction, and the boss                                                      |

Later maps are larger regions beyond the Under-Parish (the Quarries, the Deep Ossuary...), each with its own entrance. In the UI, map names drop "the": the map screen shows **Under-Parish**.

## Maps and their Afflictions (Decided)

An Affliction is a **condition on a map**, not the thing you choose to play.

- **You choose a map,** then optionally an Affliction for it. With none, the map plays as itself: its creatures, loot and variance, no boss.
- **An Affliction** says which maps it can be laid on, what unlocks it, and what it changes while it's there:
  - which creatures walk (its Thralls) and how bold they are;
  - its Aspects (if kept), omens and lamp-line pressure;
  - whether the rite can be started, and at which rite sites;
  - loot that only appears while it's there (its relic components, the boss's drops).
- **Absalom is the first.** Laying him on the Under-Parish means he's present: the rite can be started at a rite site, his Thralls walk, and he takes the lamp lines back. He becomes available once the rite is known (see below).
- **On the picker:** **The Under-Parish** · Affliction: **None** or **Absalom**.
- **More later:** new Afflictions for the same map (the Under-Parish flooded, the ossuary walls moving), so a hand-built map stays useful as the game grows.
- **Code:** Afflictions keep their data shape, with a list of maps they apply to added; a map becomes its own data (pieces, placement manifest, rite sites, shortcuts, zones) instead of something an Affliction generates.

## The story (Proposed)

A draft that keeps Fontaine's ten quests and their beats, retold with the new names. The quest table in [quests.md](dev/quests.md) changes to match when Phase 7 lands.

- **The parish.** Above the old quarries stands a parish church. For two centuries its priests carried the city's dead down the First Stair by night, under black cloth, by candlelight, to rest in the Under-Parish. **Father Lenoir** walked at the front of every procession with a lantern.
- **Absalom.** Something was already down there. Absalom is a demon that moves the dead: it shifts bones from grave to grave and sets candles burning on tombs no one tends. Lenoir found it in the deepest ossuary and bound it with an oath sworn on his own hand: as long as the hand kept the oath, the dead would stay where they were laid. When he died, they buried him under the altar, the hand with him, so the oath would hold.
- **The Night Carters.** Generations later, a gang of carters who hauled bones for the parish robbed Lenoir's tomb. They took his hand and made it into a Hand of Glory, a thieves' candle that opens any lock and keeps sleepers asleep. The oath broke.
- **Now.** The dead are moving again. Bones are found in the wrong niches, candles burn where no one lit them, and the carters' own dead walk the old procession routes as Absalom's Thralls. **Dr. Margaux Fontaine,** an archaeologist of history and the occult, hires the explorers to find out why.
- **The quests** follow it a page at a time: the moved dead, the candles, the oath on the walls of bone, the carters' road, the salt for their carts, Lenoir under the altar, the carters' sunken ledger, the Hand of Glory, the Thralls as the procession, and finally the rite.
- **The rite** renews Lenoir's binding: candles, chalk, and the Hand of Glory returned (replacing the Pendant). Performing it the first time drives Absalom back and changes the Under-Parish for good. After that he can be called up again at a rite site, by anyone who knows how.

## Dev note (Decided)

The rule from the last handoff still holds: mechanics live in focused modules in the lib, driven by data, keyed by fields not ids. In particular:

- **Map data** (rooms, their placement, variance, zones, rite sites, shortcuts) is content data, not code.
- **Persistence rules** (what lasts, how sessions merge it) live in `src/lib/shared/` as pure functions, used by the server and the hub alike.
- **Server systems** one per mechanic (variance, persistence, pacing director, sound propagation).

## Maps: a place, not a maze (Decided)

### One hand-built map

- **The Under-Parish, the first map, is a fixed map,** designed and built by hand. The procedural generator is retired.
- **The old kit is dead.** `src/lib/content/map/kit.ts` and its Blender pieces stay for reference only. Every room is a new `.blend`, built one at a time. The [renames table](#renames-from-the-old-kit) records which old piece each new room replaces.
- **The map never changes,** so an interconnected, vertical layout is learnable: players should know their way after a few runs, and the variance then matters because the rest is known.

### Structure: interconnected and vertical

- **Three depths** for the Under-Parish, each with its own history, look and danger: the Parish (1), the Ossuary (2), the Quarries and the water (3).
- **Not rail-roaded:** a depth isn't one room after another. Each depth is laid out for a reason (why the catacombs are there, why each room is there), and players choose where to go within it.
- **The spine:** the **Bone Well**, the shaft the parish tipped the dead down, runs through all three depths. Every depth opens onto it from galleries and ledges, so it's a landmark on every level, and anything falling down it is heard on all of them.
- **More than one way to each new depth,** some open from the start and some unlocked. Between depths 1 and 2: the Bone Well's broken stair (gaps need a ladder or rope) and the Bone Chute (unlocked). Between 2 and 3: the Bone Well, the Sinkhole, the Broken Stair and the Stone Shaft.
- **Loops between zones, not trivial loops.** The generator made small, pointless loops. Instead, loops join different zones and depths, and most are shut at first: opening them is what persistence is for.
- **Dead ends have a purpose:** a stash, a secret, a view, a story. A dead end off the beaten path with nothing in it is cut.

### Entrances and extraction

- **One entrance: the Sewer.** No multiple spawn points: this isn't PvP, so players don't need separating. Shortcuts open faster ways down from inside instead (the Bone Chute is the first).
- **Extraction points are separate from the entrance,** and close at different times during a run, **each for a reason** of its own (see the room catalogue).
- **Some are on the published map; others are found.** Finding one is a discovery, and it stays found.

| Extraction        | Where                       | Known?                 | Why it closes                                            |
| ----------------- | --------------------------- | ---------------------- | -------------------------------------------------------- |
| The sewer ladder  | The Sewer                   | Always                 | Never: the way you came in                               |
| The church stair  | The Charnel House (depth 1) | Discovered: bricked up | The sexton locks the church; the wall above settles back |
| Smugglers' tunnel | Smugglers' Cellar (depth 1) | Discovered             | Their lookout bars it at an hour                         |
| The storm drain   | The Pump Room (depth 1)     | On the map             | It floods when the water above rises                     |
| The Hoist Shaft   | Depth 3                     | On the map             | Its old winch fails partway through a run                |

### Rooms

- **Big enough to explore horizontally and vertically:** galleries and balconies, ledges and stacked niches, collapsed floors, ladders and hoists between heights. Chambers of 30–50 m across and 10–15 m high are within reach with baked lighting.
- **Overlooks:** where it makes sense, players enter a room from above and see it before going in. That's where creatures can be left for players to deal with or avoid.
- **Several entrances, when they make sense:** two to four ways in and out, at different heights, each with a reason (the original door, a collapse, a crack, a chute).
- **Each set-piece room has a purpose:** a landmark (seen or heard), a loot cluster of its own type, a hazard, and a secret.
- **Light contrast** in every room: lit areas, dim edges and a dark corner.

### Chokes and passages with a reason

The generator's halls, squeezes and crawls were random. On the fixed map, each one has to make sense:

- **A squeeze** is a crack where rock shifted and opened one room into another, or a shortcut.
- **A crawl** is the Rat Warren, an old drainage culvert, the crack from the Sewer.
- **A flooded passage** comes from the Cistern's water level, so it changes when the pumps are fixed.
- **A ledge** is a quarry face or a gallery of the Bone Well.
- **Every choke has another way round** (longer or riskier), and none stands between a party and every exit.
- **Hallways are designed too,** with something to see or do: niches, a collapse, a view, a sound.

### Variance on a known layout

Small changes hit harder on a map you know. Each run rolls:

- **Which extraction points are open,** and when they close.
- **Doors and passages:** a gate locked, a rockfall that wasn't there last time, a stretch flooded.
- **Where loot, creatures and lairs are.**
- **Uncharted pockets:** a few small maze-like sections that aren't on the published map, different each run.

### The map as an item

- **The published map** is an item: cheap (about 25 coin), one backpack slot, and lost on a failed extraction like anything else.
- **With it:** the overall map and where you are. **Without it:** your senses, landmarks and memory.
- **It's about 80% right:** a passage drawn that's now collapsed, a chamber that isn't on it at all. It comes from the Survey Station's old inspectors.
- **Sketching** happens only in the uncharted pockets.
- **Proposed:** contacts sell annotated maps with more marked.
- **The map screen** shows the name without "the": **Under-Parish**.

### No tutorial (Decided)

- **Rumors and the tutorial steps are removed.** Players discover mechanics by playing; the way in teaches the basics on its own (searching, keys, crawling, the headlamp, listening).
- **Fontaine's first quest** changes from "Get out of Rumors" to **"Get into the Parish"**: find the key and reach the lit hallway.
- **Absalom unlocks through the story,** not after Rumors.

## The way in (Decided)

1. **The Sewer (spawn).** Fontaine's tip: a long sewer tunnel. Players come down a ladder from a manhole, halfway along it. Daylight from the top of the ladder lights a pool at its foot; beyond that, both ways, it's dark. **The ladder is the first extraction point.**
2. **The crack.** Somewhere in the dark, a section of wall has failed. Headlamps are needed to find it, and a draught whistling through it helps a player who stops to listen. Players crawl through.
3. **The Storeroom (dark).** The parish's old storeroom, built too close to the surface; it's its wall that failed. One locked door, and the bodies of explorers who got this far and no further. Searching them finds the key.
4. **The door stays unlocked** for good once opened: the first persistence beat.
5. **The First Stair:** plain stone stairs down to another door.
6. **The Parish Walk (lit).** The door opens onto a lit hallway, the hub of depth 1, joining the Parish's rooms. One of them, the **Charnel House**, was the original way in from the church above, and holds a discoverable extraction (the church stair) and the Bone Chute.

## Persistence states (Decided)

Persistence should explain itself: **why** something was shut and **why** it's open now. Every persistent thing in the map is in one of these states, shown and told in the world:

| State               | Meaning                                         | Example                                                                     |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| **Locked**          | Shut, with a reason you can see                 | The Storeroom door; the Family Mausoleum's gate                             |
| **Discovered**      | Found, but not yet usable                       | The bricked-up church stair, noticed by its newer brick                     |
| **Unlocked**        | Opened with a key, a lever or from the far side | The Storeroom door; a one-way gate                                          |
| **Fixed**           | Repaired with parts or materials                | The Pump Room's pumps; a lamp line                                          |
| **Cleared**         | An obstacle removed                             | Rubble broken with a pickaxe; webs burned                                   |
| **Made accessible** | Something left in place                         | A rope left hanging; a ladder kicked down; pitons in a wall                 |
| **Reverted**        | Back to how it was, with a reason               | An Affliction locks a door again, puts out a lamp line, grows the webs back |

Afflictions are what make things revert: Absalom can relock an unlocked door, put out a fixed lamp line, or flood a cleared passage, so the world pushes back.

## Pacing without a timer (Decided)

A run timer suits Arc Raiders, not this. What hurries players instead:

- **Supplies running low:** batteries, bandages, light.
- **Extraction points closing,** each for its own reason.
- **Sanity running down.**
- **Creatures growing bolder** as the party's presence is felt over time (what omens were for).

**The light and noise attraction meters are removed.** Each creature's own AI decides what alerts it and what sets it hunting, by what it hears and sees.

## The Under-Parish: room catalogue (Decided)

Each room has a theme line: **materials**, **light**, **creatures** (harmless, low, moderate, high, deadly) and **loot value** (low, modest, good, high, exceptional), then why it's there, what happens there, and its persistence hooks. Creature and loot levels are the room's baseline; Afflictions raise them.

### Above: the way in

**The Sewer** (spawn). _Cement and iron, partially lit, creatures harmless, loot low._ A long city sewer tunnel with water in a central channel. Lit only at the foot of the ladder from the manhole above; dark both ways. Rats. The ladder is the always-open extraction. The crack to the Storeroom is somewhere in the dark, found with a headlamp and by its draught.

### Depth 1: the Parish

**Why it's here:** the church's own underground: crypts for its priests, storerooms, drains and the pumps that kept water out. The newest part, brick and mortar, closest to the street. **Lit** by electric cage lamps strung by the city's inspectors decades ago, still running off an old line: the first lamp line to keep and lose.

**The Storeroom.** _Brick and rotting timber, dark, creatures harmless, loot low._ The parish storeroom, built too close to the surface: shelves of candles, coffin boards and oil drums, all rotting. Its outer wall failed into the sewer. A locked door and the bodies of earlier explorers, one with the key. **Unlocked** for good once opened.

**The First Stair.** _Worn stone steps, dim, no creatures, no loot._ A plain stair between the Storeroom's door and the Parish Walk's.

**The Parish Walk.** _Whitewashed brick vaults, lit, creatures low, loot low._ The lit hallway at the heart of depth 1, joining its rooms. Electric cage lamps, cables stapled along the vault, plaques with the parish's old room names. Its lamp line can fail and be **fixed**.

**The Charnel House.** _Stone slab tables and tiled floor drains, partially lit, creatures low, loot modest._ Where the dead were prepared before going below, and the original way in, down from the church. The church stair is bricked up from above: a **discovered** extraction (noticed by its newer brick), opened with a crowbar or pickaxe. A grate in the floor is the **Bone Chute**, ignored at first, **unlocked** later as a drop straight into the Sorting Vault.

**The Priests' Crypt.** _Carved limestone and a marble altar tomb, dim, creatures low, loot good._ Where the parish buried its priests. Father Lenoir's tomb, under the altar, has been broken open and robbed: a story room, with clues for Fontaine's quests.

**The Vestry.** _Dark wood panelling and stone, lit by candles, creatures low, loot modest._ Where the priests made ready for the processions. Candles, robes on hooks, a font of holy water, vestry cabinets. The reliable place for rite supplies.

**Smugglers' Cellar.** _Brick barrel vaults, dim, creatures low, loot good._ The parish wine cellar, taken over by smugglers with a tunnel to the street. Stashes behind loose bricks marked in chalk. The tunnel is a **discovered** extraction that their lookout bars at an hour.

**The Pump Room.** _Rusted iron machinery and wet brick, partially lit, creatures low (rats), loot modest._ The pumps that kept the crypts dry, now half-flooded. **Fixing** the pumps lowers the water at depth 3 (the Cistern, the Drowned Chapel, the flooded passages). The storm drain here is an extraction that floods when the water above rises.

**Survey Station.** _Plaster, desks and pinned maps, lit, no creatures (the Surveyor), loot modest._ The city inspectors' office at the top of the old quarries. Maps on every wall, all a little wrong. Where the published map comes from, and the Surveyor's haunt.

**Explorers' Camp.** _Raw rock, tarps and bedrolls, dim, creatures moderate (spiders), loot good._ A modern explorers' camp at the edge where the crypts meet the quarries, between depths 1 and 2. A cold fire, gear left behind, dead explorers and recipe fragments.

**The Bone Well (rim).** _Limestone, an angel statue at the rim, lit from the Parish side, creatures low, loot low._ The top of the spine. Bones were tipped down it from here. A broken stair winds down its wall to depth 2; its gaps need a ladder or rope (**made accessible**).

### Depth 2: the Ossuary

**Why it's here:** when the cemeteries above were cleared, the dead were carried and tipped down here and arranged: bone walls, galleries of named niches, mass graves. **Dim:** the dwellers live here, and the first lairs.

**Ossuary Hall.** _Patterned walls of skulls and femurs, dim, creatures moderate, loot good._ The great arranged ossuary, the heart of depth 2, overlooking the Bone Well. Bone piles and niches. A lamp line runs through it.

**The Sorting Vault.** _Rough stone and heaped bone, dim, creatures moderate (rats), loot modest._ Where bones from the chute landed and were sorted. The Bone Chute's landing. Bone piles and rat nests.

**Burial Gallery.** _Rows of carved niches with brass plaques, dim, creatures moderate, loot good._ Paid niches for the city's named dead, epitaphs on each. Searched niche by niche.

**Family Mausoleum.** _Marble and iron, dark, creatures moderate, loot high._ A wealthy family's private vault behind an iron gate. Sarcophagi and a locked trunk. The gate is **locked** until opened with a key or lockpicks.

**Plague Pit.** _Lime-washed stone over a mass of bone, dim, creatures high, loot good._ A mass grave from an epidemic. Searching among the dead costs sanity. Grave dirt and rock salt.

**Webbed Gallery.** _Niches thick with web, dark, creatures high (spiders), loot good._ A gallery abandoned, then taken by spiders. Cocoons hold what's left of explorers. Webs can be **cleared**, and grow back (**reverted**).

**Rat Warren.** _Soft, crumbling rock, dark, creatures moderate (rats), loot modest._ Low tunnels the rats chewed through between two galleries: a crawl with a reason. Rat nests with their hoards.

**Sunken Ossuary.** _A sealed chamber below a grate, dark, creatures moderate, loot high._ Bones dumped into a chamber nobody recorded. Reached only on a rope (**made accessible** once one is left). Untouched niches and a sarcophagus.

### Between depths 2 and 3

**The Sinkhole.** _Raw collapsed rock, dark, creatures moderate, loot modest._ Where the quarry ceiling gave way under the streets. A rope down to depth 3.

**Broken Stair.** _Cut stone ending in air, dark, creatures moderate, loot modest._ A quarry stair that collapses halfway down; 6 m to the landing below.

**The Stone Shaft.** _A hewn shaft with a rotten winch frame, dark, creatures moderate, loot modest._ An old hauling shaft where stone was lifted. A rope down, or a ladder kicked down from below.

### Depth 3: the Quarries and the water

**Why it's here:** the oldest part, older than the parish: the medieval limestone workings the city was built from, with pillars of rock left to hold up the streets. Water came in from an old aqueduct and springs. Where Lenoir found Absalom. **Dark** and vast.

**Quarry Gallery.** _Raw limestone pillars with tool marks, dark, creatures high, loot good._ The stone was cut here, leaving rows of pillars to hide among. The carters' bell is a landmark you can hear across the depth.

**Quarrymen's Lodge.** _Timber and stone, dim (a lantern left burning), creatures moderate, loot good._ Where the quarrymen ate and kept their tools: benches, a cold stove, picks on the wall. Tool chests full of materials.

**The Cistern.** _Vaulted stone over black water, dark, creatures high, loot high._ A reservoir from the old aqueduct. Diving for sunken satchels. Its water level drops when the Pump Room is **fixed**, opening passages.

**Drowned Chapel.** _Carved stone flooded to the pews, dark, creatures high, loot high._ A chapel built for the quarrymen, flooded when the water rose. Underwater offerings and a font. Reachable on foot once the water drops.

**Saints' Crypt.** _Old carved limestone and silver, dim (votive candles), creatures high, loot exceptional._ Relics hidden deep in a time of persecution. A reliquary alcove; a quest room.

**The Lower Chapel** (was the Gloaming Chapel). _Stone older than the parish, cut with binding marks, dark, creatures deadly, loot exceptional._ Where Lenoir found Absalom and made the binding: the rite site most tied to the story. The first resolution changes it for good.

**The Hoist Shaft.** _An iron hoist cage in a hauling shaft, partially lit (a work lamp), creatures high, loot low._ The main hauling shaft to the surface: the deep extraction. Its old winch fails partway through a run.

## Renames from the old kit

The old kit stays for reference. This records which old piece each new room replaces.

| Old kit id                                                      | Old name           | New name               | Depth | Notes                                                                  |
| --------------------------------------------------------------- | ------------------ | ---------------------- | ----- | ---------------------------------------------------------------------- |
| —                                                               | —                  | **The Sewer**          | Above | New. Spawn, ladder extraction, the crack                               |
| —                                                               | —                  | **The Storeroom**      | 1     | New. Dark, locked door, the bodies, the key                            |
| `stairs-deep`                                                   | The Long Stair     | **The First Stair**    | 1     | Now a short stair between two doors                                    |
| —                                                               | —                  | **The Parish Walk**    | 1     | New. The lit hallway, the hub of depth 1                               |
| —                                                               | —                  | **The Charnel House**  | 1     | New. The church stair extraction and the Bone Chute                    |
| `room-crypt`                                                    | (unnamed crypt)    | **The Priests' Crypt** | 1     | Lenoir's robbed tomb                                                   |
| `vestry`                                                        | The Vestry         | The Vestry             | 1     |                                                                        |
| `smugglers-cellar`                                              | Smugglers' Cellar  | Smugglers' Cellar      | 1     | Their tunnel is a discovered extraction                                |
| `pump-room`                                                     | The Pump Room      | The Pump Room          | 1     | Fixing the pumps lowers the water at depth 3                           |
| `survey-station`                                                | Survey Station     | Survey Station         | 1     | Was a dead-end variant; now a room                                     |
| `explorers-camp`                                                | Explorers' Camp    | Explorers' Camp        | 1–2   |                                                                        |
| `angel-well`                                                    | The Angel's Well   | **The Bone Well**      | 1–3   | No longer the start: the spine through every depth                     |
| `ossuary-hall`                                                  | Ossuary Hall       | Ossuary Hall           | 2     |                                                                        |
| `room-vault`                                                    | Charnel Vault      | **The Sorting Vault**  | 2     | Renamed so it isn't confused with the Charnel House                    |
| `room-gallery`                                                  | Burial Gallery     | Burial Gallery         | 2     |                                                                        |
| `family-mausoleum`                                              | Family Mausoleum   | Family Mausoleum       | 2     |                                                                        |
| `plague-pit`                                                    | Plague Pit         | Plague Pit             | 2     |                                                                        |
| `webbed-gallery`                                                | Webbed Gallery     | Webbed Gallery         | 2     |                                                                        |
| `rat-warren`                                                    | Rat Warren         | Rat Warren             | 2     | A crawl between two galleries                                          |
| `sunken-ossuary`                                                | Sunken Ossuary     | Sunken Ossuary         | 2     |                                                                        |
| `sinkhole`                                                      | The Sinkhole       | The Sinkhole           | 2→3   |                                                                        |
| `broken-stair`                                                  | Broken Stair       | Broken Stair           | 2→3   |                                                                        |
| `drop-hall`                                                     | The Drop           | **The Stone Shaft**    | 2→3   | An old hauling shaft                                                   |
| `quarry-gallery`                                                | Quarry Gallery     | Quarry Gallery         | 3     |                                                                        |
| `quarry-lodge`                                                  | Quarrymen's Lodge  | Quarrymen's Lodge      | 3     | Was levels 1–2; now with the quarries                                  |
| `cistern`                                                       | The Cistern        | The Cistern            | 3     |                                                                        |
| `drowned-chapel`                                                | Drowned Chapel     | Drowned Chapel         | 3     |                                                                        |
| `saints-crypt`                                                  | Saints' Crypt      | Saints' Crypt          | 3     |                                                                        |
| `gloaming-chapel`                                               | Gloaming Chapel    | **The Lower Chapel**   | 3     | Where Lenoir found Absalom                                             |
| `extraction-gate`                                               | The Shaft          | **The Hoist Shaft**    | 3     | The deep extraction                                                    |
| `pit`                                                           | The Pit            | —                      | —     | Retired: the Bone Well covers it                                       |
| `rumors-walk`, `rumors-vault`                                   | The Training Vault | —                      | —     | Retired with Rumors                                                    |
| `stairwell`                                                     | (old cellar start) | —                      | —     | Already retired                                                        |
| `room-small`, `hall-*`, `hall-dead-end`, `cap-hall`, `rockfall` | Generic pieces     | —                      | —     | Retired: passages, rockfalls and dead ends are designed into each room |

## Building it (Decided)

### Blender

- **One `.blend` per room,** built one at a time, modelled, baked and exported on its own.
- **One assembly file** for the whole map, each room linked in as a collection (File → Link). It's where the layout is made and checked; it's never exported itself.
- **A manifest** of each room's position and rotation, taken from the assembly, is what the game reads.
- **Standard opening sizes** (hall, crawl, door) so rooms stitch together reliably, even without the generator.
- **Block it out first:** grey boxes in the assembly for every room and route, walked in-game, before modelling. Layout problems are cheap to fix in grey boxes.
- **Seams:** bake each room with its neighbours linked in, so light carries across doorways, and make openings natural seams: an archway, a step, a change of stone.
- **Culling:** with each room a separate mesh, draw only the room you're in and its neighbours.

### The room viewer (debug)

A dev-only tool (behind dev mode, like the other admin tools) to see a room in the game in seconds while building it.

- **View mode:** client only. Load one room's `.glb` and lightmap, and fly or walk around it.
- **Play mode:** a dev session with only that room, on the real server, so doors, lootables, ropes and creatures work.
- **Room picker,** and a URL per room (for example `/dev/room/storeroom`) to bookmark the one in progress.
- **Hot reload:** re-export from Blender and the viewer reloads the room, keeping the camera where it was.
- **Toggles:** collision wireframe, nav grid, every marker (spawns, doors, lootables, creatures, extraction, openings), lightmap on or off, light probes, the room's acoustics.
- **Stats:** triangles, draw calls, lightmap size and texture memory, against the budget.
- **Spawn:** at a marker, or where the camera was last time.

## Light: baked (Decided)

- **Baked lightmaps** from Blender (Cycles, on a second UV channel), applied as the material's `lightMap` in Three.js. Light costs a texture lookup instead of a calculation, so the map can have many lamps, shafts and bounce light.
- **Lights exported in a glTF are not cheaper.** `KHR_lights_punctual` lights load as ordinary Three.js lights at runtime. Only baking makes lighting cheap.
- **Light probes** (an irradiance volume or a few `LightProbe`s per room) light moving things (explorers, creatures, dropped items), which aren't in the bake.
- **The headlamp is the one dynamic light.**
- **Lightmap budget:** about 10–16 texels per metre; a 40 × 40 m chamber needs one or two 2048 maps.
- **Zones:**
  - **Lit:** most of the map. Maintenance lamps along the old tourist route, light from street shafts, candlelit chapels, a lantern left burning. Players can see the place.
  - **Dim:** half-light, where the dweller lives.
  - **Dark:** rare and deliberate, so dark is frightening when it comes: deep crypts, flooded tunnels, places Absalom has taken.
- **Removed:** placing candles to light areas, and glow sticks as markers. Candles stay as an item (the rite, crafting, quests).
- **Lamp zones can switch:** bake a zone lit and unlit, and swap between them, so Absalom can put lights out and players can relight them (see Persistence).

## Sound: the main sense (Decided)

Sound now carries more of the tension than light.

- **Sound travels along the tunnels, not through rock.** Loudness and direction come from path distance along the nav graph, so a witch two corridors over sounds like she's coming round the corner.
- **Authored acoustics per space:** the Ossuary's dry clatter, the Cistern's echo, a crawlspace's muffle. Players learn where they are by ear.
- **Listening is an action:** stopping to listen is how you scout.
- **Creatures telegraph by sound.** Each has three sound sets that mean something:
  - **Idle:** where it is (the witch's breathing, a dweller's wet clicks, rats behind the walls).
  - **Alert:** it's noticed something (the breathing stops, the clicking quickens).
  - **Attack:** a wind-up you can react to, about half a second before the hit.
- **The player's sound is a tool:** lures, bells, the slingshot and firecrackers pull threats where you want them.

## Creatures: they live there (Decided)

- **Territories and lairs:** each threat has a home and a hunting ground. It roams, rests and returns. Players can scout it, wait it out, or slip past while it's away.
- **Routes, not spawns:** creatures come from somewhere you could have heard. **Nothing appears on top of a player.**
- **No attraction meters:** the light and noise meters are removed. Each creature's own AI decides what alerts it and what sets it hunting, from what it hears and sees, and it travels from where it was, with tells on the way.
- **A pacing director** (in the style of Left 4 Dead) watches the party's tension and gives quiet stretches after a scare, then builds again.
- **Risk you choose:** the best loot sits near lairs and in dark zones.
- **Avoidance works:** places to hide, breaking line of sight, a lure thrown the other way. Hiding should work most of the time for a player who reads the signs.
- **Critters as hazards,** not fodder: rats swarm out of walls when disturbed and flee light; spiders wait over doorways and drop when you pass.

## Persistence: the catacombs remember (Decided)

The biggest reason to keep going down. You get to know the map, and you change it for good.

### Whose map

**Combined for the session.** A session opens everything any player in it has opened. Whatever is opened during the session is kept by **everyone present**. A newcomer playing with a veteran sees the veteran's shortcuts, but keeps only what they were there for.

### What lasts

- **Permanent:** shortcuts (one-way gates, a rope left in place, cleared rubble), unsealed sections, quest changes to the map.
- **Contested:** relit lamp lines and other things the Affliction pushes back on. They slowly revert unless kept up.
- **States:** see [Persistence states](#persistence-states-decided) for locked, discovered, unlocked, fixed, cleared, made accessible and reverted.
- **Per run:** loot, creatures, the variance.

### Shortcuts

Gates that open from one side only, ropes you can leave hanging, rubble walls you clear. Opened once, they stay. The map gets faster to cross as you learn it and open it up, so "open the gate between the quarry and the Cistern" can be the purpose of a run.

### Relighting the lamp lines

The old maintenance lamps along the tunnels are dead. Fix one (a fuse, oil, a part from deep down) and that stretch stays lit for later runs: a safe corridor. Absalom slowly takes them back. It's a tug of war between the players and the Affliction, built on the switchable baked lamp zones.

### Chalk marks

- **Personal and permanent:** your marks stay across runs.
- **A cap** (about 30); the oldest fade first.
- **In a party,** teammates see your marks faintly and their own clearly.

### Quest tasks

Quests use persistence: open a particular shortcut, relight a particular line, reach a sealed section and open it. A quest's change to the map is permanent.

## Escorting (Decided: optional quest task)

A quest task, never required for a run. An explorer from an earlier crew is alive and trapped deep. Find them, then get them out. They're slow and frightened, they make noise, and if they panic they run. A hard task with a big reward.

## Relics and attunement (Decided)

Relics aren't more firepower. They're the occult toolkit, each changing how a run plays, for combat or anything else.

- **Attunement:** each time a relic is carried down **and** brought back out, it gains a level (up to three, say), and grows more useful.
- **Harder to sell:** an attuned relic's sell price falls as it attunes, and a fully attuned one can't be sold. You keep it or donate it to Fontaine's collection for something permanent.
- **Lost like anything else** on a failed extraction.
- **A cost to use:** charges per run, a sanity cost, or drawing the Affliction's attention.
- **A relic slot:** one (two later, as a reward).
- **A goal for a whole run:**
  - **Found:** each relic has a rare spawn in a particular kind of room.
  - **Assembled:** some are pieces scattered across the map, put together in the hub's reliquary.
  - **Earned:** from the boss or a quest.

**Proposed relics:**

| Relic                 | What it does                              | Attunement grows it                            |
| --------------------- | ----------------------------------------- | ---------------------------------------------- |
| Saint's finger        | Shows what stands in the half-light       | Wider range, then through a wall               |
| Lenoir's lantern      | A light Thralls won't approach            | Longer burn, then a larger circle              |
| Carter's bell         | Rung, it freezes creatures within earshot | Longer freeze, then you choose who hears it    |
| Rosary of the drowned | Breathe longer underwater                 | Then swim silently, then breathe indefinitely  |
| Bone compass          | Points to the nearest rite site or relic  | Then to the nearest danger, then to a teammate |
| Mourner's veil        | Creatures lose you while you stand still  | Faster, then while you walk slowly             |

## Room-tagged loot (Decided)

Lootables already belong to rooms. The loot itself gets a `rooms` field on each loot entry (`['chapel', 'vestry']` for the black candle, `['quarry', 'lodge']` for metal scraps). A lootable rolls from what fits both its type and the room it's in. On a fixed map, players learn where to hunt for what, and relic pieces have a natural place.

## Absalom: solve once, fight as often as you like (Decided)

The rite stops being the one reason to go down, and the boss stops being a final event in one room. Absalom is the Under-Parish's first Affliction.

1. **The mystery, once per account:** work out how to launch the rite: what it needs, where it can be done, how. Clues come from Fontaine's quests, the dead's notes, and the Affliction's Aspects.
2. **The first resolution changes the world:** something permanent, such as a sealed section opening or light returning to part of the map. "We did it" is felt in every run after.
3. **After that, Absalom is an Affliction you can lay on the Under-Parish,** and the rite an event any party in it can start:
   - **Where:** at any **rite site**, consecrated places spread across the map (chapels, shrines, the Vestry). The party chooses its battlefield, near its shortcuts or an exit. The boss appears there.
   - **Cost:** a rite kit each time (candles, chalk, a token), so starting it is a decision.
   - **Why repeat it:** the boss carries what nothing else does: relic components, rare materials, a bounty.

**Open:** whether the rite can be started at any rite site, or at one site chosen at random each run. Any site fits persistence better.

### Aspects: Naming and Binding (Proposed)

The aim is a mechanic of its own, big enough to be interesting, never taking over the run.

- **Two Aspects per run,** each shown through about three signs placed along routes players use anyway: footprints in the wet, a dead explorer's last note, every candle in a chapel turned one way.
- **Naming:** in the journal, a player names an Aspect they think they've identified. A commitment, nothing more.
- **Binding:** at a shrine, a short held bind (about 20 seconds, with noise) using a common item. Right, and the Aspect turns against the Affliction for the rest of the run ("she follows the heaviest pack" becomes a sack of bricks to bait her). Wrong, and a backlash: lights die nearby, she hears you, the Aspect grows stronger.
- **Rewards:** a correct name earns Fontaine's bounty on extraction; a binding earns safety, and weakens the boss if the rite is started.
- **Guardrails:** optional, short, and never needed to finish a quest task or get out. Parties split naturally: someone reads the signs while others work.

### Omens

Pacing no longer needs a timer or a hidden meter: see [Pacing without a timer](#pacing-without-a-timer-decided). What omens did becomes **creatures growing bolder** as the party's presence is felt, and the world reverting things (lamps going out, doors relocking). **Open:** whether that's an Affliction's job only, or happens in every run.

## Combat (Decided: later)

Combat isn't meant to be the central experience. With a spacious map, better light and creatures that live in the world, players get more control over when they fight. Then:

- **Hit feedback:** a short hit-stop, a hit marker, a flinch, bone dust or blood, distinct sounds for hit and miss.
- **Telegraphs:** a wind-up pose and sound on everything that attacks.
- **One defensive verb:** a shove or dodge on stamina.
- **Reach, thrust and sweep that matter:** today a hit is a capsule test, so a thrust and a sweep play the same. Use the weapon's real shape and the creature's facing.

## What this retires

- The procedural map generator and the old map kit (kept for reference).
- Rumors and the tutorial steps.
- The Long Stair between levels, and gated levels.
- The light and noise attraction meters.
- A run timer.
- Sketching across the whole map (kept for uncharted pockets).
- Witches summoned 5–10 m from a player when a meter fills.
- Placing candles to light areas; glow sticks as markers.
- The rite as a single final event in one fixed room.

## Phases

Map work first, as asked. Each phase leaves the game playable.

### Phase 1: the fixed map pipeline and the room viewer

- **The room viewer** first (view and play modes, hot reload, toggles, stats), so each room can be built and checked one at a time.
- The assembly manifest in place of the generator's layout, with one `.glb` per room.
- Baked lightmaps on a second UV channel, and light probes for moving things.
- Room-based culling.
- The nav grid, collision, lootable, creature and extraction markers built from the fixed rooms.
- Maps as data of their own (rooms, manifest, zones, extraction points), no longer generated by an Affliction.
- Prove it end to end with **the way in**: the Sewer, the Storeroom, the First Stair and the Parish Walk.
- Retire the generator, the old kit (for reference only), Rumors and the tutorial.

### Phase 2: the Under-Parish

- **Block out** the whole map in grey boxes in the assembly, and walk it.
- **Build** the rooms of the catalogue one at a time, depth 1 first. For each room, settle the lamp question below.
- **Ways between depths:** the Bone Well's broken stair, the Bone Chute, the Sinkhole, the Broken Stair, the Stone Shaft.
- **Extraction points** with their reasons for closing, some on the map and some found.
- **Variance:** which extraction points are open, doors and rockfalls, loot and creature placement, uncharted pockets.
- **The map item** and the published map (80% right); sketching only in pockets. The map screen shows **Under-Parish**.
- **Room banners** keep showing the level (now the depth).
- **Remove** candle placement and glow sticks as markers.
- **Fontaine's first quest** becomes "Get into the Parish".

### Phase 3: sound

- Sound along the nav graph (path distance and direction), not straight lines.
- Acoustic zones per room.
- Creature idle, alert and attack sound sets as telegraphs.

### Phase 4: creatures that live there

- Territories, lairs and routes; nothing spawns on top of a player.
- The light and noise meters removed: each creature's own perception alerts and sets it hunting; creatures travel with tells.
- Creatures growing bolder over a run.
- The pacing director.
- Hiding places and avoidance.
- Rats and spiders as hazards.

### Phase 5: persistence

- Per-account world state, merged per session (everything anyone has opened; what's opened is kept by everyone present).
- The persistence states (locked, discovered, unlocked, fixed, cleared, made accessible, reverted), shown in the world.
- Shortcuts, unsealed sections, the Bone Chute, the pumps and the water level.
- Lamp lines (switchable baked zones) and Absalom taking them back.
- Persistent chalk marks with a cap.
- Quest tasks that change the map; the escort task.

### Phase 6: loot and relics

- Room tags on loot entries.
- Relics: the relic slot, attunement, falling sell value, use costs, rare room spawns, assembly in the reliquary.

### Phase 7: Absalom and Afflictions as conditions

- Afflictions as conditions laid on a map (maps became data of their own in Phase 1); the picker (map, then Affliction or none).
- Renaming the Gloaming to Absalom in content, quests and help; the story retold.
- The rite as a mystery, the first resolution's world change, rite sites and the repeatable rite event.
- Aspects (Naming and Binding), if confirmed.
- Omens, as decided by then.

### Phase 8: combat feel

- Hit feedback, telegraphs, a shove or dodge, reach and shape that matter.

## Open questions

- **Lit by default, or lit as a reward? Settle it room by room as each is built.** [Light](#light-baked-decided) says most of the map is lit ("maintenance lamps along the old tourist route"), while [Relighting the lamp lines](#relighting-the-lamp-lines) says those lamps are dead until fixed. When building each room, decide which of its lights are always on (street shafts, chapel candles, a lantern left burning), which are a lamp line that starts lit and can fail, and which start dead and are a persistence reward, and record it in the room's catalogue entry. The "old tourist route" isn't placed anywhere yet either.

- **Rite sites:** any site, or one chosen at random each run?
- **Aspects:** go with Naming and Binding?
- **Bolder creatures and reverting:** an Affliction's job only, or part of every run?
- **Lamp lines:** how fast does Absalom take them back?
- **Relics:** how many attunement levels, and which relics ship first?
- **Annotated maps** from contacts: yes or no?
