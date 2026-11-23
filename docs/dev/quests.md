# Quests, people on the surface, and the Gloaming's story

Quests are what the people on the surface ask of the explorers. The first person is **Fontaine** (Dr. Margaux Fontaine), an archaeologist of history and the occult who hired them. Her ten quests teach the game (the basics, rummaging, crafting, room tasks, going deeper, combat) and, one casebook page at a time, tell why the Gloaming is there. The tenth is the Gloaming's rite. The design is in [#17](https://github.com/JoshuaBelden/undercroft/issues/17).

Everything is data, read by one engine. A new quest is data only; a new kind of objective, condition or effect is added to the engine once, and every quest can use it.

## Files

| File                                                  | What                                                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/lib/shared/quests/types.ts`                      | The vocabulary: `Condition`, `Objective`, `QuestDef`, `NpcDef`, `Line`, `QuestRecord`, `QuestEvent`, `QuestBrief` |
| `src/lib/shared/quests/engine.ts`                     | The engine: pure rules (what is open, advancing, committing, reporting, learned recipes, rooms needed)            |
| `src/lib/shared/quests/tasks.ts`                      | Which room task's object a player is looking at (client and server alike)                                         |
| `src/lib/content/quests.ts`                           | Fontaine's ten quests (`QUESTS`, `QUEST_ORDER`, `MIDDLE`, `RITE_QUEST`)                                           |
| `src/lib/content/npcs.ts`                             | The people on the surface (`NPCS`): who, their lines, their quests, what they sell                                |
| `src/lib/content/tasks.ts`                            | Room tasks (`TASKS`): room, spot, verb, seconds, noise, sound, what it yields                                     |
| `src/lib/content/quests.test.ts`                      | Every item, recipe, creature, room, task, quest and Affliction the data names exists                              |
| `src/lib/server/store/quests.ts`                      | The surface: commit, report, buy from an NPC; `advanceQuests`; older explorers brought in (`questsOf`)            |
| `src/routes/api/quests/+server.ts`                    | `POST { action: 'commit' \| 'report' \| 'buy' }`                                                                  |
| `server/systems/quests.ts`                            | `QuestSystem`: below, events become quest progress, kept at once                                                  |
| `server/systems/tasks.ts`                             | `TaskSystem`: room tasks' objects, working them, noise                                                            |
| `server/systems/doors.ts`                             | The barred stair (rattles; a charge blows it)                                                                     |
| `server/systems/hazards.ts`                           | The quarryman's charge (a placed fuse with `place.blast`)                                                         |
| `src/lib/ui/People.svelte`, `src/routes/(hub)/people` | The People page                                                                                                   |
| `src/lib/ui/QuestPanel.svelte`                        | Your open quests on the HUD, under the rite panel                                                                 |
| `src/lib/game/play/quests.svelte.ts`, `tasks.ts`      | The play page's side: quests from the server, room tasks' objects                                                 |

## The vocabulary

**Lines.** Everything someone says or writes is a `Line { id, text }`: an offer, an objective's text, a casebook page, a greeting. Ids are `<quest>.<part>.<n>` (`moved-dead.offer.2`). An id stays put when its text changes, so a voice can be added later through the audio manager keyed by line id, without touching the data. Add lines at the end of a part, never in between.

**Conditions** (`Condition`), true or not of one explorer: `done` (a quest reported), `open` (offered and not done), `flag`, `resolved` (an Affliction), and `all`, `any`, `not` to combine them. Used by a quest's `requires`, an NPC sale's `when`, and a rite's `begin` ([rite.md](rite.md)).

**Objectives** (`Objective`), each counting up to its `count` (1 when it has none):

| Kind      | Counts                                                          | Fed by                                                     |
| --------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `extract` | getting out of that Affliction alive                            | `QuestSystem.left` (that player only)                      |
| `reach`   | reaching level `level` (1 is the top) or deeper                 | the deepest level each tick (`QuestSystem.count`)          |
| `loot`    | a lootable searched the first time (in that Affliction, or any) | `crateOpen` events                                         |
| `craft`   | one of a recipe made below                                      | `CraftSystem.finish`                                       |
| `kill`    | a creature of that kind put down                                | `creatureDie` events (kind from `CreatureDirector.kindOf`) |
| `task`    | a room task done                                                | `TaskSystem`                                               |
| `resolve` | the Affliction's rite resolved                                  | `AfflictionSystem.resolve` (eligible players only)         |

**Quests** (`QuestDef`): `npc`, `title`, `teaches` (the label on the list), `requires`, `offer`, `objectives`, `commit` (items brought back), `page` (the casebook page), `reward` (`coins`, `xp`, `items`), `teachesRecipes` (recipes kept out of the Library, known while the quest is open and after), `sets` (flags set when it is done).

**NPCs** (`NpcDef`): `name`, `role`, `portrait` (a picture name; a letter stands in until it exists), `greeting`, `quests` (in the order listed), `sells` (`{ item, price, when? }`).

## How a quest goes

1. **Offered** once its `requires` holds. Only open and done quests are ever shown, never a locked one (`status` returns null for those).
2. **Objectives** are met below. **They are shared:** a search, a kill, a craft, a level reached or a room task counts for everyone still down there with a quest that wants it. Getting out counts only for whoever got out.
3. **Kept at once.** Every change is written as it happens (`SessionHooks.onQuests` → `keepQuests` in `server/belongings.ts`, writes in order per explorer). A task done stays done even if its doer dies after. The hub can't change an explorer's quests while they are underground, so the game server writing the whole record is safe.
4. **Committed** on the People page: dragging a stack from the stash onto the quest's slot (or Commit, which takes the first stack of it in the stash) gives up as much of it as is still wanted, for good (`commitQuest`, through `changeExplorer`, which now guards `quests` too). **Commitments are each player's own:** everyone brings back their own. What was lent for the descent (the free loadout) can't be committed.
5. **Ready** when every objective is met and everything committed. **Reported** (Report to Fontaine): done, the casebook page earned, the reward paid (`reportQuest`; experience through `addExperience`, a first `quest:<id>`).

Fontaine's order: the first quest alone, then the eight in `MIDDLE` all at once, in any order, then the last once all eight are done (`requires: all(done ...)`).

**Older explorers** (`questsOf`): one with no quest record starts at the first quest, with its objective already met if they have been through Rumors, so they report it for the flask. Having resolved the Gloaming before skips nothing.

## Room tasks

A `task` objective names a room task (`TASKS`): something in a named room to hold interact on for 10 to 15 s. The whole time it is loud: heard `noise` away every `every` seconds through creature hearing (`CreatureDirector.hear`, with the worker as the prey), and each pulse is a `taskWork` event the client plays the task's sound for. One works while the others hold the door.

- **The map has the room.** At descent (`Parties.begin`) the party's open tasks go to `Session.questTasks`, which builds the map again from the same seed with `require` (the generator's required rooms, [map-generation.md](map-generation.md#required-rooms)) and the tasks' objects in it. Not in a training map.
- **Where:** at the room's `spot-<name>` marker (`TaskDef.spot`, placed by `scripts/blender/task_spots.py`: on the floor, back to a wall, the Cistern's on its walkway); without one, on the dry standing floor nearest the room's middle. `layout.tasks` carries them to clients.
- **Working it:** `TaskSystem.step`, with `PlayerState.tasking`. Interact takes a floor item, a crate or a door first, as on the client. Letting go starts it over. Done (`taskDone`, and `tick.tasks`), it stays done for the run; what it `yields` lies on the floor in front of it, toward whoever did it.
- **Placeholders:** each object is a box of `TaskDef.placeholder` until it has a model.

## The barred stair

`AfflictionDef.barred` (`{ level, flag }`) bars the long stair down to a level: the Gloaming's to level 3, the deepest, where the chapel is. Its door (the `stairs-deep` door with `tier === level - 1`) is in `Doors.barred`, separate from sealing, so the rite letting its doors go never opens it.

- **By hand:** holding interact on it only rattles it (`doorRattle`, once per hold). The prompt reads "(barred from the far side)".
- **The quarryman's charge** (`quarrymans-charge`): powder flask, firecrackers, lamp oil and twine, made below with the field kit. It is a `learned` recipe, taught by quest 8 (`teachesRecipes`): never in the Library or the Workshop, and field crafting accepts it only from those taught (`recipeStatus(..., learned)`; the `quests` message tells the client). Set down from the quick-use slot (`place.blast`), its fuse burns 8 s (shown as a placed thing, `hazards.charges`), then it goes off: heard all over the level (`noise`), a `blast` event, and a barred door within `radius` is blown open (`DoorSystem.blast` → `Doors.blowOpen`).
- **For good:** everyone down there then has the flag (a `flag` quest event). A party with anyone who has it finds the door unbarred (`DoorSystem.joined`). Anyone else needs a charge.
- **The flask** is used up. Fontaine sells more while quest 8 is open and after (`sells.when`), so losing it never stops the quest.

## The rite

The last quest's objective is `resolve gloaming`. The Gloaming's rite (`RiteSpec.begin`, `RiteSpec.laid`) is begun at the altar only by those whose last quest is open and who haven't resolved it; put down, he leaves his lantern, and laying it in his tomb under the altar resolves it, only for them. See [rite.md](rite.md#a-quests-rite).

## The story, quest by quest

| #   | Quest                  | Teaches                | Objectives                                                            | Commit              | What Fontaine learns                  |
| --- | ---------------------- | ---------------------- | --------------------------------------------------------------------- | ------------------- | ------------------------------------- |
| 1   | Fontaine               | Basics                 | Get out of Rumors                                                     |                     | Reward: the powder flask              |
| 2   | The Moved Dead         | Rummaging              | Search 8 lootables in the Gloaming                                    | Bone rosary         | These dead were brought here          |
| 3   | By Candle, Never Torch | Crafting               | Make 5 candles below                                                  | 5 candles           | The Lamplighter led the processions   |
| 4   | The Walls of Bone      | Room tasks             | Rubbing of the oath (Ossuary Hall)                                    | The rubbing         | His oath, sworn on a hand             |
| 5   | The Carters' Road      | Going deeper           | Reach level 2; ring the carters' bell (Quarry Gallery)                | Signet ring         | The Night Carters                     |
| 6   | Salt for the Carts     | Crafting               | Make 2 blessed salt below                                             | 1 blessed salt      | Father Lenoir, buried under the altar |
| 7   | The Sunken Box         | Room tasks             | Haul up the strongbox (The Cistern)                                   | The Carters' ledger | They robbed his tomb                  |
| 8   | What They Took         | Crafting, going deeper | Make a charge; reach level 3; break the bricked niche (Saints' Crypt) | Hand of Glory       | His hand, made a thieves' candle      |
| 9   | The Carriers           | Combat                 | Put down one of the things that hunt                                  |                     | They are the procession               |
| 10  | The Last Procession    | Everything             | Resolve the Gloaming's rite                                           |                     | He rests                              |

The setting has the feel of Paris's catacombs without naming them: limestone quarries, the dead of the city's cemeteries carried down by night under black cloth, by candlelight. Two centuries ago Father Lenoir, the Lamplighter, walked at the front of every procession with a lantern, and swore on his hand that none of the dead would lie in the dark. The Night Carters who drove the carts turned smugglers, robbed his tomb and made his hand a Hand of Glory; the parish barred the stair. With his oath torn from him he rose: every dusk the procession walks again. The omens are its approach, what hunts is its carriers, the dwellers are the Carters who never got out; he takes your light because the dead need it.

## On the surface: the People page

`src/routes/(hub)/people` (the People tab, which shows how many quests are ready to report) renders `People.svelte`: the NPC's portrait, role and greeting, then three tabs.

- **Quests:** open ones (ready to report first) then done ones. Each shows its offer, its objectives with counts, a slot per thing to bring back (a drop target for the stash beside it, and a Commit button for keyboard and controller), what it pays, and Report when ready.
- **Casebook:** the pages earned, in the order earned (`casebook`). Each stands on its own, since the middle eight can be done in any order.
- **Buy:** what they sell whose `when` holds.

Committing plays `quest.commit`, reporting `quest.done`.

## Underground

The server sends each player a `quests` message (their open quests as `QuestBrief`s, and the recipes quests taught them) on arriving and whenever they change. `QuestPanel` shows up to three under the rite panel, those with something left to do below first, objectives ticked off, then "Bring it back to commit" or "Report back on the surface". It follows the rite panel's setting and binding (Settings > Interface > Show rite and quest panel, `toggleRitePanel`).

## Adding

- **A quest:** add a `QuestDef` to `LIST` in `src/lib/content/quests.ts` and its id to its NPC's `quests`. Run the tests: `quests.test.ts` checks every reference.
- **An NPC:** add an `NpcDef` to `src/lib/content/npcs.ts`, and their portrait to `art/images` (`pnpm asset:images`).
- **A room task:** add a `TaskDef` to `src/lib/content/tasks.ts` (a room in `MAP_KIT`, and a sound) and a `task` objective naming it. Give its room the `spot-<name>` marker: add it to `TASKS` in `scripts/blender/task_spots.py` and run it headless (`blender --background art/blender/catacomb-kit.blend --python scripts/blender/task_spots.py`, which finds a place the way lootable markers are found and saves the .blend), then `pnpm asset:export` and `pnpm asset:build`. `quests.test.ts` checks every task's room has its spot. Commit the .blend in the art repo.
- **An objective kind:** add it to `Objective` and, if new events feed it, to `QuestEvent`; match them in `matches` (`engine.ts`); feed the event from the server (`QuestSystem.happened`). The engine tests cover the rules.
- **A condition kind:** add it to `Condition` and `test` (`engine.ts`), and to `conditions` in `quests.test.ts` if it nests.

## Admin

In-game (dev mode): **Finish quest objectives** (`questObjectives`: every open quest's, or one `quest`), **Set flag** (`questFlag`, for everyone down there; `gloaming.level-3-open` unbars the stair from the next descent), **Put him down** (`fell`: summon and banish, so the lantern lies by you), and teleports to each `task-<id>`, the `tomb` and the `lantern`.

On the admin site, a member's page can set a quest done or open again, set and clear flags, and reset their quests.
