/**
 * Cuts a release, from start to the live server. See docs/dev/releasing.md.
 *
 *   pnpm release <patch | minor | major | x.y.z> [--dry-run] [--host <ip>] [--domain <name>]
 *
 * The notes are written first, for players, into src/lib/content/release.json (the in-game
 * What's new page): ask Claude for `/release-notes <version>` (.claude/skills/release-notes/),
 * or write them yourself. The release is refused unless that file is for this version.
 *
 * 1. Ticks the version in package.json and desktop/package.json, and dates release.json.
 * 2. Builds the beta testers' desktop app (`pnpm desktop:build:hosted`).
 * 3. Commits "Release v<version>" (with release.json, if it wasn't committed yet).
 * 4. Makes the annotated tag `v<version>`, holding the notes, and pushes the commit and the tag.
 * 5. Creates the GitHub release from the tag (`gh`), with the desktop app's installer on it
 *    (what /download sends you to).
 * 6. Deploys the tag (`pnpm deploy:release --ref v<version>`).
 *
 * Needs a clean working tree on main (release.json aside) and `gh` signed in. `--dry-run`
 * shows the commits since the last release and whether the notes are ready, and does nothing.
 * If a step fails, it stops and prints the commands left to finish.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { notReady, notesFromCommits, type ReleaseEntry } from '../src/lib/content/release.ts';
import { DESKTOP_INSTALLER } from '../src/lib/shared/desktop.ts';

const PACKAGE = 'package.json';
const DESKTOP_PACKAGE = 'desktop/package.json';
const RELEASE = 'src/lib/content/release.json';
/** Where `pnpm desktop:build:hosted` writes the installer (desktop/package.json). */
const INSTALLER = `desktop/release/hosted/${DESKTOP_INSTALLER}`;
/** The live server (docs/dev/deployment.md#the-live-beta). */
const LIVE = { host: '64.23.154.42', domain: 'undercroft.us' };

const { values: args, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		'dry-run': { type: 'boolean', default: false },
		host: { type: 'string', default: LIVE.host },
		domain: { type: 'string', default: LIVE.domain }
	}
});

const git = (...list: string[]) => execFileSync('git', list, { encoding: 'utf8' }).trim();
const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

const bump = positionals[0];
if (!bump) fail('Usage: pnpm release <patch | minor | major | x.y.z> [--dry-run]');

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
const tag = `v${next}`;
if (git('tag', '--list', tag)) fail(`${tag} is already tagged.`);

let since: string | null = null;
try {
	since = git('describe', '--tags', '--abbrev=0', '--match', 'v*');
} catch {
	// No release yet: every commit.
}
const subjects = git('log', '--no-merges', '--format=%s', ...(since ? [`${since}..HEAD`] : []));
const commits = notesFromCommits(subjects.split('\n'));
if (!commits) fail(`Nothing has been committed since ${since}.`);

const written = JSON.parse(readFileSync(RELEASE, 'utf8')) as ReleaseEntry;
const problem = notReady(written, next);
console.log(`Undercroft ${next} (was ${current}). Commits since ${since ?? 'the start'}:\n`);
console.log(`${commits}\n`);
console.log(problem ?? `The notes in ${RELEASE}:\n\n${written.notes}\n`);
if (args['dry-run']) process.exit(0);
if (problem) fail(problem);
const notes = written.notes.trim();

// release.json may be left uncommitted, for the release commit; nothing else may.
const dirty = git('status', '--porcelain')
	.split('\n')
	.filter((line) => line && !line.endsWith(RELEASE));
if (dirty.length) fail('Commit or stash your changes first (release.json aside).');
if (git('branch', '--show-current') !== 'main') fail('Release from main.');
try {
	execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
} catch {
	fail('The GitHub CLI (gh) is needed, signed in: gh auth login.');
}

const date = new Date().toISOString().slice(0, 10);
const release: ReleaseEntry = { version: next, date, notes };

const run = (command: string, list: string[]) =>
	// pnpm is a .cmd on Windows, which only runs through a shell. Nothing else does: a shell would
	// split an argument with spaces in it (the release's title) into several.
	execFileSync(command, list, {
		stdio: 'inherit',
		shell: command === 'pnpm' && process.platform === 'win32'
	});

/** Every step, in order, with the command that does it by hand if it is left to finish. */
const steps: { name: string; manual: string; run: () => void }[] = [
	{
		name: 'tick the version and date the notes',
		manual: '',
		run: () => {
			writeFileSync(PACKAGE, pkgText.replace(`"version": "${current}"`, `"version": "${next}"`));
			// The desktop app is released with the game, at the same version.
			const desktop = readFileSync(DESKTOP_PACKAGE, 'utf8');
			writeFileSync(DESKTOP_PACKAGE, desktop.replace(/"version": "[^"]+"/, `"version": "${next}"`));
			writeFileSync(RELEASE, JSON.stringify(release, null, '\t') + '\n');
		}
	},
	{
		name: 'build the desktop app',
		manual: 'pnpm desktop:build:hosted',
		run: () => run('pnpm', ['desktop:build:hosted'])
	},
	{
		name: 'commit',
		manual: `git add ${PACKAGE} ${DESKTOP_PACKAGE} ${RELEASE} && git commit -m "Release ${tag}"`,
		run: () => {
			git('add', PACKAGE, DESKTOP_PACKAGE, RELEASE);
			git('commit', '-m', `Release ${tag}`);
		}
	},
	{
		name: 'tag',
		manual: `git tag -a ${tag} -m "Undercroft ${next}" (with the notes)`,
		run: () => git('tag', '-a', tag, '-m', `Undercroft ${next}\n\n${notes}`)
	},
	{
		name: 'push',
		manual: 'git push origin main --follow-tags',
		run: () => run('git', ['push', 'origin', 'main', '--follow-tags'])
	},
	{
		name: 'create the GitHub release',
		manual: `gh release create ${tag} --title "Undercroft ${next}" --notes-from-tag`,
		run: () =>
			run('gh', ['release', 'create', tag, '--title', `Undercroft ${next}`, '--notes-from-tag'])
	},
	{
		name: 'attach the desktop app',
		manual: `gh release upload ${tag} ${INSTALLER} --clobber`,
		run: () => run('gh', ['release', 'upload', tag, INSTALLER, '--clobber'])
	},
	{
		name: 'deploy',
		manual: `pnpm deploy:release --host ${args.host} --domain ${args.domain} --ref ${tag}`,
		run: () =>
			run('pnpm', ['deploy:release', '--host', args.host, '--domain', args.domain, '--ref', tag])
	}
];

for (const [i, step] of steps.entries()) {
	console.log(`\n> ${step.name}`);
	try {
		step.run();
	} catch (error) {
		console.error(`\nStopped at "${step.name}": ${(error as Error).message}`);
		const left = steps
			.slice(i)
			.map((s) => s.manual)
			.filter(Boolean);
		if (left.length) console.error(`To finish, fix that and run:\n  ${left.join('\n  ')}`);
		process.exit(1);
	}
}

console.log(`\nReleased and deployed ${tag}.`);
