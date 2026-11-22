# Explorer progression: experience, levels and the skill tree

What explorers earn across expeditions, and what they spend it on (issue #18). Progression widens what an explorer can do; it doesn't take the fear away. Bonuses stay modest (rank 3 tops out around 30 to 45%), and what is carried down and not brought back is still gone.

## Files

| What                                                                            | Where                                                                               |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Levels, the XP table, respec price, categories and skills (with their tooltips) | `src/lib/content/progression.ts`                                                    |
| XP on each lootable, recipe and creature                                        | `xp` on `LootableDef` (and `sealed.xp`), `Recipe`, `CreatureDef`                    |
| The rules: levels, points, spending, respec, modifiers                          | `src/lib/shared/progression/progression.ts`                                         |
| Earning it underground                                                          | `server/experience.ts` (`Experience`, one per `Session`)                            |
| Storing it                                                                      | `src/lib/server/store/progression.ts` (`ExplorerDoc.progression`)                   |
| Reading it at descent, keeping it after                                         | `server/belongings.ts` (`progressions`, `keepExperience`), `server/parties.ts`      |
| Spending points                                                                 | `POST /api/explorer/progression`, `skills()` in `src/lib/account/account.svelte.ts` |
| The Skills page                                                                 | `src/routes/(hub)/skills/+page.svelte`, `src/lib/ui/SkillTree.svelte`               |
| "+X Experience" under the clock                                                 | `src/lib/ui/ExperienceGain.svelte`, the `experience` message                        |

## Levels

1000 XP a level (`LEVELS.xpPerLevel`), capped at level 60, one skill point per level. From level 1 (`LEVELS.treeAt`) the hub bar shows the explorer's level, a round button left of the avatar, which opens the Skills page. `levelOf(xp)` and `pointsLeft(p)` are the only places this is worked out.

## Earning

`Experience.award(player, source, amount, first?, bonus?)` pays `amount`, plus `bonus` if the key `first` hasn't been paid to that explorer before. Firsts are kept for good in `progression.firsts` as `loot:<lootable>`, `item:<item>`, `recipe:<recipe>`, `kill:<creature>`, `hint:<affliction>:<n>`, `rite:<affliction>` and `extract:<level>`. Resetting rite progress doesn't clear them, so a hint pays once ever.

What pays, and from where:

- **Looting** (`crateOpen` events, counted in `Session.tally`): the first opener gets the lootable's `xp` (its `sealed.xp` if it was sealed: a jammed crate), plus `XP.rarity` for the best thing inside, plus `XP.firstLootable` the first time they open that kind. A drop box pays nothing.
- **Discovery**: `Session.discover`, when an item is new to the player: `XP.discovery`, as a first.
- **Field crafting**: `CraftSystem.finish` calls `Experience.crafted`. The recipe's `xp`, for its first `XP.recipeRepeats` makes in a run, and `XP.firstRecipe` once. The Workshop pays only that first-time bonus (`workshopCrafted` in the store): crafting from the stash is safe and unlimited.
- **Kills** (`creatureDie`, with `by`): the creature's `xp` to the killer, with `XP.firstKill` once; teammates within `XP.shareRange` m get `XP.killShare` of it. Moths, the surveyor and training dummies are 0. Banishing the manifestation (`resolved`) pays `XP.banish` to everyone still down there.
- **Hints and the rite**: a hint found (`clue`) pays `XP.clue` to everyone on the expedition who hasn't learned it before; the rite performed (`rite`) pays `XP.rite` to everyone present, with `XP.firstRite` the first time for that Affliction.
- **The way out**: `Experience.finish(player, outcome)`, once per player, from `leaving`, `abandon` and `logRun`. Getting out pays `XP.extract` by the deepest level reached, with `XP.firstExtract` the first time from that level. Dying or running out of time pays `XP.died` of it; abandoning or leaving the party, nothing.
- **A training ground** (Rumors) pays its firsts and nothing else, so the safe map can't be farmed.

Awards build up in `PlayerExperience.pending`. `Experience.flush` sends each player one `experience` message a tick, and the play page shows it under the clock (`ExperienceGain`). When the run ends, `ExpeditionSummary.experience` (earned, and what they had before) goes to the results screen, which also says when a level was reached. The `onExperience` hook keeps it (`addExperience`: `$inc` the XP, `$addToSet` the firsts) for every outcome, so experience survives a death, and the run log gets `xp` and `xpBySource`.

A co-op guest on someone's desktop game (docs/dev/hosting.md) comes down with no skills and keeps nothing: their save is their own.

### Tuning

Every value is data: the `XP` table, and `xp` on lootables, recipes and creatures. The admin dashboard shows the average XP a run, and a member's runs show each run's XP with its sources. If levelling needs slowing, lower `XP.extract` first: it is the steadiest source and leaves the firsts alone.

## The skill tree

Three categories (`SKILL_CATEGORIES`): Nerve, Grit and Craft. Opening one costs a point; each of its four skills has three ranks, a point each. The connector skill above them isn't designed yet: the page shows it as a "?".

A skill (`SkillDef` in `SKILLS`) names its `ranks` (the bonus at each, as a fraction) and its `effects`: which modifiers it changes, and how (`less` multiplies by `1 - bonus`, `more` by `1 + bonus`, `chance` sets it). Its `detail(bonus, context)` writes the tooltip from the game data (the headlamp's drain, the witch's dark range, the held weapon's damage...), so a balance change updates it.

### Modifiers

`modifiersFor(skills)` turns ranks into `Modifiers`: one number per `ModifierKey`, 1 (or 0 for `scrounge`) changing nothing. The session puts them on `PlayerState.mods` as a player comes down. Being on the player state, they reach the client, so prediction (battery drain, bandaging, tending) agrees with the server. Where each is read:

| Modifier                  | Skill            | Read in                                                                           |
| ------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| `batteryDrain`            | Lamplighter      | `updateBattery` (shared simulate)                                                 |
| `darkDrain`               | Used to the Dark | `server/systems/sanity.ts`                                                        |
| `moveNoise`               | Soft Step        | `server/attraction.ts` (the noise meter)                                          |
| `darkSpotted`             | Still as Stone   | `CreatureDirector.sees` (unlit range)                                             |
| `melee`                   | Heavy Hand       | `server/combat.ts` melee hits (fists too)                                         |
| `spread`                  | Steady Aim       | `server/combat.ts` shots                                                          |
| `blowSanity`              | Thick Skin       | `server/systems/creatures.ts`, before armour                                      |
| `healTime`                | Field Dressing   | bandaging and `tendSeconds` (shared), `vitals.ts`                                 |
| `craftTime`, `craftNoise` | Tinker           | `server/systems/craft.ts`, `vitals.ts`                                            |
| `wear`                    | Careful Hands    | every `addWear` and `wearHeld` call for use (guns, melee, gear, gloves, the kit)  |
| `openTime`, `openNoise`   | Light Fingers    | `CrateSystem.work`, `crates.svelte.ts`                                            |
| `scrounge`                | Scrounger        | `CrateSystem.scrounge`: one material from the lootable's table, first opener only |

### Adding a skill

1. Add a `ModifierKey` if it changes something new, with its identity in `noModifiers()`.
2. Read `s.mods.<key>` where the value is used (shared code if the client predicts it).
3. Add a `SkillDef` to `SKILLS`, with `ranks`, `effects`, `summary` and a `detail` worked out from the data.
4. Test the effect in the system's test, and the tooltip numbers in `progression.test.ts`.

### Spending

The Skills page (`SkillTree.svelte`) shows all three categories side by side, each a round button at the foot of its branch with its four skills tied to it by lines; a skill's ranks fill thirds of the ring round its icon, and its tooltip gives what it does now and at the next rank. It spends on a hold, never a click: the mouse or a finger held on a skill or closed category, Enter or Space held, or the controller's X held with it focused (the menu's `holding` option, `HOLD_TIME` long). It calls `POST /api/explorer/progression` with `{ action: 'spend', category | skill }`. The store (`spendPoint`) checks `canSpend` again and writes only the categories and skills, matched on what it read, so it never loses experience the game server adds meanwhile. Nothing can be spent while ready or underground.

**Respec** (`{ action: 'respec' }`) puts every point back for `RESPEC_COST` coin, written to the ledger as `respec`. Experience and firsts stay. The button is disabled while the explorer can't afford it, and asks in a `Dialog` first.

Sounds: `skills.unlock`, `skills.rank`, `skills.mastered` (rank 3), `skills.denied` (a hold with nothing to spend), recorded (`art/sfx/skills.*.mp3`, `scripts/audio.config.ts`), in `src/lib/content/audio/sounds.ts`.

## Admin

- The admin app's member page shows the level, XP, unspent points and skills, and can **Set level**, **Set experience**, **Set rank** (any skill 0 to 3, its category opened with it) and **Reset levels and skills**, each audited.
- In dev mode, the in-game admin panel's Account section can grant experience to your own explorer and reset your levels and skills (`grantExperience`, `resetProgression` on `POST /api/admin`).
- Resetting an explorer to a new player clears their progression too.

## Testing

`src/lib/shared/progression/progression.test.ts` covers levels, spending, respec, modifiers and the tooltip numbers. `server/experience.test.ts` runs a real `Session` for each way to earn, the firsts, the kill share, the run's end and the results, Rumors, and a skill changing the simulation.
