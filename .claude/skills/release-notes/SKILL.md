---
name: release-notes
description: Write the player-facing release notes for the next Undercroft release into src/lib/content/release.json, from the commits and GitHub issues since the last release tag. Use when asked for release notes, or before `pnpm release`. Argument: the version to release (e.g. 0.3.0), or patch/minor/major.
---

# Release notes

Write the notes players read on the in-game What's new page, the release tag and the GitHub release. `pnpm release` refuses to run until `src/lib/content/release.json` holds notes for the version it releases. See `docs/dev/releasing.md`.

## 1. Find the version and what is in it

- The version: the argument. For `patch`, `minor` or `major`, work it out from `version` in `package.json` (0.2.0 → minor → 0.3.0).
- The last release: `git describe --tags --abbrev=0 --match "v*"`.
- What changed: `git log --no-merges --format="%h %s%n%b" <last tag>..HEAD`. `pnpm release <version> --dry-run` lists the subjects too.
- For each `#123` mentioned, read the issue for what it means to a player: `gh issue view 123` (on this machine `gh` may be at `C:\Program Files\GitHub CLI\gh.exe`). Issues labelled `from-game` are bugs players reported: their fixes matter to them.
- Where a subject doesn't say enough, read the commit (`git show --stat <hash>`) or the player help it changed (`src/lib/content/help/`) to see what a player will notice. The help topics use the same words players see in game.

## 2. Write them for players

- What they'll notice, not how it was built: "Ropes: look at one and press E to take hold" rather than "RopeSystem, climbing in stepPlayer".
- Leave out what players won't notice: refactors, docs, tests, tooling, the admin panel and dev tools, art pipeline work, `wip` commits.
- One line per thing a player will notice. Merge the commits that made one thing ("Rope" and "Extraction rope" are one line about ropes). Put the big things first.
- Name keys as players have them by default, with the controller button: "press E (X on a controller)". Defaults are in `src/lib/game/input/actions.ts` and `PAD_DEFAULTS`.
- Plain, warm and short, in the voice of the rest of the game's text. Say "you". No marketing, no exclamation marks.
- Never name the creatures "Thralls": they are creatures (and the Affliction, the Gloaming, by name).
- Group under `### New`, `### Changes` and `### Fixes` when there are more than a handful of lines; leave out a heading with nothing under it.

The What's new page understands only: `### ` headings, `- ` bullets, plain paragraphs, and **bold**, `code` and [links](url) within a line. Nothing else (no nested lists, no `##`, no images).

## 3. Write release.json

```json
{
	"version": "0.3.0",
	"date": "2026-11-17",
	"notes": "### New\n\n- First thing.\n- Second thing.\n\n### Fixes\n\n- A fix."
}
```

- `version`: the version being released. `date`: today (YYYY-MM-DD; `pnpm release` sets it again on the day it runs).
- `notes`: the Markdown as one JSON string, `\n` between lines.
- Keep it formatted the way it is (tabs): run `pnpm format` after.
- Check it: `pnpm release <version> --dry-run` prints the notes and says whether they are ready, and `pnpm test` checks the file parses.

Then show the notes to the user to read and edit. Don't commit, tag, push or run `pnpm release` unless they ask: the release deploys to the live server.
