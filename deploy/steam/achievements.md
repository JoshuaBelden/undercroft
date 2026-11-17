# Steam achievements

These are entered by hand in the Steamworks partner site (**App Admin → Stats & Achievements →
Achievements**) once the game has its own app id. The **API name** has to match `id` in
`src/lib/content/achievements.ts` exactly: that's what the game unlocks. A test checks this list
matches the file. See `docs/dev/desktop.md#achievements`.

Each one also needs two 256×256 icons (achieved and unachieved), uploaded on the same page.

| API name           | Display name       | Description                                                |
| ------------------ | ------------------ | ---------------------------------------------------------- |
| `FIRST_EXTRACTION` | Daylight           | Get out of the undercroft alive with what you carried.     |
| `RITE_PERFORMED`   | The Rite Is Done   | Be in the undercroft when the rite is performed.           |
| `COOP_EXTRACTION`  | Nobody Left Behind | Get out alive from an expedition of two or more explorers. |
| `BANISHED`         | Banished           | Be there when a manifestation is banished.                 |
