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

`CHANGELOG.md` is the only copy. Each change that players will notice adds a line under `## Unreleased`, in the same commit as the change, written for players: what they'll notice, not how it was built. Group lines under `###` headings (`### New`, `### Changes`, `### Fixes`, `### Known issues`, or by area).

The in-game **What's new** page (`/about/changes`) reads the file at build time (`src/lib/content/changelog.ts`) and shows every release, with the Unreleased section as "In this build". The parser only understands what the file uses: `##` releases (`## 0.2.0 - 2026-12-01`), `###` headings, `- ` bullets, paragraphs, and **bold**, `code` and [links](https://example.com) within a line. Anything above the first `##` is the file's introduction and isn't shown.

## Day to day, and cutting a release

Work goes to GitHub as usual: commit (with its CHANGELOG line under Unreleased), `git push`. Pushing doesn't touch the live game. Nothing deploys automatically.

When what's on GitHub is ready for testers:

```
pnpm release minor                    # or patch, major, or an exact 0.3.0: commits and tags v0.2.0
git push --follow-tags                # the release commit and its tag
gh release create v0.2.0 --notes-from-tag   # optional: a release page on GitHub
pnpm deploy:release --host 64.23.154.42 --domain undercroft.us --ref v0.2.0
```

`--ref v0.2.0` ships exactly what was tagged, whatever you have checked out or changed since. Without `--ref` it ships your local `HEAD`, which is handy for a quick fix between releases. The live build then shows the Unreleased notes as "In this build", under the last version number. To roll back, deploy the previous tag (`--ref v0.1.0`). The database isn't rolled back, so only do that when the newer release didn't change what's stored.

`scripts/release.ts` needs a clean working tree and something under `## Unreleased`. It sets the version in `package.json`, renames the section to `## <version> - <date>`, starts a new empty Unreleased, commits `Release v<version>` and makes an annotated tag `v<version>` that holds the notes. It doesn't push or deploy.

## Credits

The **Credits** page (`/about/credits`) is data in `src/lib/content/credits.ts`: the creator, the statement on AI use, which AI tools made what, and sections for inspirations, art, sound, tools and testers. When you add a third-party asset, tool or source, add its credit in the same change, with its license. Entries marked `todo: true` are placeholders: they show (in yellow) only in dev mode, so players never see an empty slot. `SOURCE_URL` links the source code, which the AGPL asks for on a hosted copy; set it once the repository is public.

Both About pages are behind sign-in, like everything but the sign-in pages (`isOpen` in `src/lib/server/session.ts`).

## Licenses

- `LICENSE`: the code, AGPL-3.0 (`"license": "AGPL-3.0-only"` in `package.json`).
- `LICENSE-ASSETS.md`: art, models, sound, writing and the name, all rights reserved except for working on Undercroft itself. Third-party assets keep their own licenses (listed in the credits).
- `CLA.md`: what contributors grant. `.github/workflows/cla.yml` asks for a signature on each new contributor's first pull request and stores signatures in `signatures/cla.json` on the `cla-signatures` branch. Create that branch once, after the first push: `git push origin HEAD:cla-signatures`.
