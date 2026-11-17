# Versions, release notes and credits

## Versions

The version lives in one place, `version` in `package.json`. `src/lib/shared/version.ts` reads it (`GAME_VERSION`) for the client and the game server. Players see it at the top of the What's new page. The dashboard links to What's new and Credits with the pills at its bottom left. The game server logs it at start, and `pnpm deploy:release` prints it.

Undercroft uses [semantic versioning](https://semver.org), at 0.x during the beta:

| Bump    | When                                                                 |
| ------- | -------------------------------------------------------------------- |
| `minor` | each release to testers with new content or features (0.1 → 0.2)     |
| `patch` | fixes between them (0.2.0 → 0.2.1)                                   |
| `major` | 1.0.0 at launch; after that, saves or accounts that don't carry over |

`PROTOCOL_VERSION` in `src/lib/shared/constants.ts` is separate: bump it whenever client and server messages change, so a stale browser tab is refused instead of misbehaving.

## Release notes

There is no changelog file: git is the history. A release's notes are written once, for the release, for players: what they'll notice, not how it was built. They are written from the commits since the last `v*` tag (and the issues they close), so give each commit a subject that says what changed.

Claude writes them with the project skill `.claude/skills/release-notes/`: ask for `/release-notes 0.3.0` (or `minor`). It reads the commits and issues, leaves out what players won't notice (refactors, docs, tooling, dev tools), merges what belongs together, and writes `src/lib/content/release.json`: the version, the date and the notes. Read them and edit them as you like. You can also write the file yourself.

The notes are kept in the release's annotated tag `v<version>` and its GitHub release, where every earlier release's stay. The game shows only the current release: the in-game **What's new** page (`/about/changes`) reads `release.json` (`src/lib/content/release.ts`) and links to the GitHub releases for earlier ones. Notes are a small part of Markdown: `###` headings, `- ` bullets, paragraphs, and **bold**, `code` and [links](https://example.com) within a line.

## Day to day, and cutting a release

Work goes to GitHub as usual: commit, `git push`. Pushing doesn't touch the live game. Nothing deploys until a release.

When what's on `main` is ready for testers:

```
/release-notes minor             # in Claude Code: writes release.json for 0.3.0; read and edit it
pnpm release minor --dry-run     # the commits since the last release, and whether the notes are ready
pnpm release minor               # or patch, major, or an exact 0.3.0
```

`scripts/release.ts` needs `release.json` written for the version it releases (it refuses otherwise), a clean working tree on `main` apart from `release.json`, and the GitHub CLI signed in (`gh auth login`). It then:

1. ticks the version in `package.json` and `desktop/package.json`, and dates `release.json`;
2. commits `Release v<version>`, with `release.json` if it wasn't committed yet;
3. makes the annotated tag `v<version>` holding the notes, and pushes the commit and the tag;
4. creates the GitHub release from the tag;
5. deploys the tag to the live server (`pnpm deploy:release --ref v<version>`; `--host` and `--domain` change where, the live beta by default).

If a step fails it stops there, and prints the commands left to finish by hand.

`pnpm deploy:release` on its own still ships your local `HEAD` (or any `--ref`), which is handy for a quick fix between releases. To roll back, deploy the previous tag (`--ref v0.2.0`). The database isn't rolled back, so only do that when the newer release didn't change what's stored.

## Credits

The **Credits** page (`/about/credits`) is data in `src/lib/content/credits.ts`: the statement on AI use, and sections for art, sound and contributors (the contributors section links to the repository rather than naming people). When you add a third-party asset or source, add its credit in the same change, with its license. Entries marked `todo: true` are placeholders: they show (in yellow) only in dev mode, so players never see an empty slot. `SOURCE_URL` links the source code, which the AGPL asks for on a hosted copy; set it once the repository is public.

Both About pages are behind sign-in, like everything but the sign-in pages (`isOpen` in `src/lib/server/session.ts`).

## Licenses

- `LICENSE`: the code, AGPL-3.0 (`"license": "AGPL-3.0-only"` in `package.json`).
- `LICENSE-ASSETS.md`: art, models, sound, writing and the name, all rights reserved except for working on Undercroft itself. Third-party assets keep their own licenses (listed in the credits).
- `CLA.md`: what contributors grant. `.github/workflows/cla.yml` asks for a signature on each new contributor's first pull request and stores signatures in `signatures/cla.json` on the `cla-signatures` branch. Create that branch once, after the first push: `git push origin HEAD:cla-signatures`.
