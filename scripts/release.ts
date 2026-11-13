/**
 * Cuts a release: bumps the version, dates the release notes, commits and tags. See
 * docs/dev/releasing.md.
 *
 *   pnpm release <patch | minor | major | x.y.z>
 *
 * 1. Needs a clean working tree and something under `## Unreleased` in CHANGELOG.md.
 * 2. Sets `version` in package.json.
 * 3. Renames the Unreleased section to `## <version> - <date>` and starts a new, empty one.
 * 4. Commits ("Release v<version>") and makes an annotated tag `v<version>` holding the notes.
 *
 * It doesn't push or deploy: it prints the commands for that.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PACKAGE = 'package.json';
const CHANGELOG = 'CHANGELOG.md';
const UNRELEASED = '## Unreleased';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

const bump = process.argv[2];
if (!bump) fail('Usage: pnpm release <patch | minor | major | x.y.z>');
if (git('status', '--porcelain')) fail('Commit or stash your changes first.');

const pkgText = readFileSync(PACKAGE, 'utf8');
const current = (JSON.parse(pkgText) as { version: string }).version;
const [major, minor, patch] = current.split('.').map(Number);
const next =
	bump === 'major'
		? `${major + 1}.0.0`
		: bump === 'minor'
			? `${major}.${minor + 1}.0`
			: bump === 'patch'
				? `${major}.${minor}.${patch + 1}`
				: bump;
if (!/^\d+\.\d+\.\d+$/.test(next)) fail(`Not a version: ${next}`);
if (git('tag', '--list', `v${next}`)) fail(`v${next} is already tagged.`);

const log = readFileSync(CHANGELOG, 'utf8');
const start = log.indexOf(UNRELEASED);
if (start < 0) fail(`${CHANGELOG} has no "${UNRELEASED}" section.`);
const bodyStart = start + UNRELEASED.length;
const end = log.indexOf('\n## ', bodyStart);
const notes = log.slice(bodyStart, end < 0 ? undefined : end).trim();
if (!notes) fail(`Nothing under "${UNRELEASED}" in ${CHANGELOG}: write the release notes first.`);

const date = new Date().toISOString().slice(0, 10);
writeFileSync(
	CHANGELOG,
	`${log.slice(0, start)}${UNRELEASED}\n\n## ${next} - ${date}\n\n${notes}\n${end < 0 ? '' : log.slice(end)}`
);
writeFileSync(PACKAGE, pkgText.replace(`"version": "${current}"`, `"version": "${next}"`));

git('add', PACKAGE, CHANGELOG);
git('commit', '-m', `Release v${next}`);
git('tag', '-a', `v${next}`, '-m', `Undercroft ${next}\n\n${notes}`);

console.log(`Released v${next} (was ${current}).

Next:
  git push && git push origin v${next}
  pnpm deploy:release --host <droplet> --domain <domain>
  gh release create v${next} --notes-from-tag     (optional: a GitHub release page)`);
