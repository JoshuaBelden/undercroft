# Combat mechanics

The ways weapons and thrown and placed things behave beyond a plain swing or shot: stamina per swing, sweeps, bleeding, snags, piercing and silent shots, slow rounds, the throw arc, fuses, fires, snares and lines of salt, and what works crawling or downed. The plain swing, shot and throw are in [items.md](items.md#using-items-stepweapon) and [items.md](items.md#combat-server). The design is the gear, crafting and loot handoff ([docs/handoff-gear-crafting-loot.md](../handoff-gear-crafting-loot.md)).

**Every behaviour is a field on the item, never its id.** Code checks the field; any item with it behaves that way. The items that use them come with Phase 6 of the handoff; until then the fields are tried with test items (`src/lib/shared/testing/items.ts`: `test.spade`, `test.club`, `test.rifle`, `test.crossbow`, `test.firecracker`, `test.oil`, `test.snare`, `test.salt`...). The knife, crowbar and brick already cost stamina to swing.

## Files

| File                                 | What                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `src/lib/content/items.ts`           | The fields (`MeleeSpec`, `FirearmSpec`, `ThrowSpec`, `PlaceSpec`, the `ItemDef` flags) |
| `src/lib/shared/items/weapons.ts`    | `stepWeapon`: stamina, snags, setting things down, putting a throw down; `canUseHeld`  |
| `src/lib/shared/items/projectile.ts` | Flight (`FLIGHT`, `flightStep`, `flightPath`): the server's and the throw arc's        |
| `server/combat.ts`                   | Sweeps, piercing, silent and slow rounds, bleeding, snags                              |
| `server/items.ts`                    | Things in flight (`launch` with a `Flight`), landing, breaking                         |
| `server/creatures.ts`                | `hold` (a snare), `bleed`, `wards` (lines they won't cross), `crosses`                 |
| `server/systems/hazards.ts`          | `HazardSystem`: fuses, fires, snares, lines of salt; the `hazards` snapshot            |
| `src/lib/game/play/hazards.ts`       | Drawing them, their sounds, and the throw arc                                          |

## Swings

- **Stamina** (`melee.stamina`): each swing costs that much stamina, a tap of a throwable (a knife let go early) too. With too little left, or worn out, it doesn't swing: a `winded` SimEvent (a gasp, `player.winded`), once a press. Admin infinite stamina pays nothing. Stamina comes back as it does after sprinting (`MOVEMENT.stamina`). The knife costs 4, the brick 8, the crowbar 10; a sledgehammer (20) empties a full bar in five swings.
- **Sweeps** (`melee.sweep`): every creature in the arc is hit, each for `damage`, not just the nearest.
- **Bleeding** (`melee.bleed: { dps, seconds }`): a hit sets the creature bleeding (`CreatureDirector.bleed`): `dps` a second for `seconds`, the kill credited to whoever opened the wound. A fresh wound replaces a weaker one. A `bleed` event plays `creature.bleed`. Creatures that bleed to death are told like any kill (`takeBled`, then `creatureDie`).
- **Snags** (`melee.snag: { chance, seconds }`): on a hit, with that chance, the weapon snags: `WeaponState.snag` counts down and it won't swing till then. Rolled on the server; the client learns it from the snapshot. A `snag` event plays `club.snag`.

## Bare hands

With nothing in the hand (an empty weapon slot, a knife thrown, a brick used up, an empty quick-use slot taken in hand), attack punches. Bare hands aren't an item: `HANDS` in `src/lib/content/items.ts` is an `ItemDef` kept out of `ITEMS`, so it is never carried, dropped, sold or listed, with a `melee` spec like any weapon's (weak, short, quick, and tiring: 8 damage, 1.2 m, 5 stamina). `stepWeapon` swings it when the hand is empty, held to punch again and again, and the `swing` SimEvent carries `item: 'hands'`. Look up whatever is behind a swing with `heldDef(item)`, not `ITEMS[item]`: it gives `HANDS` for `hands`. The server resolves it as any swing (`server/combat.ts`), with nothing to wear; it tears webs as any blow does (`server/systems/walls.ts`).

- **Where:** as for any held item (`canUseHeld`): not crawling, squeezed or down.
- **Seen:** the body plays its `melee_attack` clip at the punch's length.
- **Sound:** none of its own (`melee.sound` with null swing and hit): a creature it lands on still cries out, and creatures still hear it (`noise`).
- **Admin:** nothing of its own: drop what is in the hand to punch, and infinite stamina and kill all ([items.md](items.md#admin)) apply.
- **Tuning:** change `HANDS.melee`; the tests in `src/lib/shared/items/combat.test.ts` and `server/combat.test.ts` read it.

## Shots

- **Piercing** (`firearm.pierce`): each pellet passes through every creature in its line, to the first wall, each taking its damage (with falloff).
- **Silent** (`ItemDef.silent`): nothing hears the shot and it adds nothing to the noise meter.
- **Slow rounds** (`firearm.projectile: { speed, landNoise, breakChance }`): the shot is a round in flight, not a hit at once. The server launches one of the gun's `ammo` (`WorldItems.launch` with a `Flight`: its speed, no lob, the gun's damage), it falls as it goes, hits the first creature in its way, and drops where it stops, to be picked up again, unless it breaks on a hit (`breakChance`). Its landing is heard `landNoise` away. No muzzle flare or smoke.

## Thrown things

- **The throw arc:** while a throw is drawn back (from a quarter of `THROW_DRAW`), a faint line shows its flight and a ring where it will land (`Hazards.self`, from `flightPath`, the same steps the server flies it with: `FLIGHT.gravity`, the lob `FLIGHT.lift`). The setting **Throw arc** (`settings.interface.throwPreview`, Interface) turns it off.
- **Putting a throw down:** aim (or opening the menu) while drawn back puts it down: no throw, no swing, and nothing more until attack is let go (`WeaponState.putDown`).
- **Fuses** (`throwable.fuse: { seconds, noise, hiss, bang }`): where it lands, it hisses (`fuseLit`), then `seconds` later goes off (`fuseBang`), heard `noise` away with no source: creatures come to look. It is used up.
- **Fires** (`throwable.fire: { radius, dps, seconds, sound }`): where it lands (or hits), it bursts into a fire on the floor below: every creature and explorer within `radius` takes `dps` a second while it burns, the kills the thrower's. It is used up. Clients draw a flame and a flickering light, lit only within 22 m of the camera, so far fires cost no light (it counts in the light budget).

## Placed things

`ItemDef.place: { seconds, sound, snare?, ward? }`: from the quick-use slot, hold attack standing still for `seconds` and it is set down on the floor in front (`place` SimEvent; moving or letting go stops it). The server puts it on the floor a step ahead (`HazardSystem.simulated`), if there is floor there and no wall in the way, and raises `placed` (the item's `sound`).

- **Snares** (`snare: { hold, radius }`): the first creature that steps within `radius` is held fast for `hold` seconds (`CreatureDirector.hold`: it stands struggling, and an attack not yet landed is lost), and the snare is spent. A `snared` event plays `snare.spring`.
- **Lines of salt** (`ward: { length, seconds }`): a line `length` across the way, for `seconds`. Creatures won't cross it: a move that would (`crosses`) is undone, so they stay on their side.
- **Tripwire bells** (`tripwire: { length, noise }`): a line across the way that rings when something crosses it (`noise`, and a `tripwire` event: the party is told), then sets itself again; each ring is a use of its `durability`. The `place` event carries the bell's `worn`, so a bell set down rings only what it has left.
- **Taken up again:** a snare or a tripwire bell still set is taken back with interact, looking at it (the snare, or the middle of the line), when no floor item is in view (`HazardSystem.takeBack`, from `PackSystem`): back into the pack as it was, a bell with a ring's wear for each ring. The client prompts for it (`Hazards.target`, `prompt`) and draws each with its item's model.

What is set down or set off is in every tick's `hazards` (`HazardsSnapshot`: fires, snares, wards, tripwires), and drawn by every client.

## Crawling, squeezed or down

Using anything needs room: crawling or squeezed, nothing works, but for things made for it (`ItemDef.cramped`: a short spear, a derringer). Down, only things made for that (`ItemDef.downed`: a derringer). `canUseHeld` decides it for `stepWeapon`.

**Too heavy to run with:** with a `noSprint` item in the hand (a sledgehammer), there is no sprinting.

## Admin

The admin tools of [items.md](items.md#admin) apply (Give, infinite ammo and stamina, kill all). The items that carry these fields arrive with Phase 6.

## The round's weapons

The weapons of the handoff are data on these mechanics (`src/lib/content/items/weapons.ts`): the hatchet (cuts webs, thrown), the trench spade (`sweep`), the short spear (`cramped`, a narrow arc), the nail-studded club (`bleed`, `snag`), the pickaxe (`breaks` rubble), the sledgehammer (`smash`, `noSprint`, `stagger`), the rifle (`pierce`, `single`), the derringer (`cramped`, `downed`, revolver rounds), the crossbow (`silent`, a `projectile` bolt, `reloadSlow`), the slingshot (a pebble or a coin in flight, `alsoFires`), the oil bottle (`fire`), throwing knives. See [items.md](items.md#the-rounds-items) for the fields.

## Adding a behaviour

Add a field to the item's spec, check it where the behaviour happens (`stepWeapon` for timing and what the player can do, `server/combat.ts` for what a hit does, `HazardSystem` for things that last in the map), give it a test item, a sound (with a `synth` until recorded) and a line here.
