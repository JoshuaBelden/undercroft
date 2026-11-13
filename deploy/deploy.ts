/**
 * Ships committed code (git HEAD, or a release tag with --ref, with its built static/assets) to
 * the droplet and restarts the stack. See docs/dev/deployment.md and docs/dev/releasing.md.
 *
 *   pnpm deploy:release --host <droplet ip or domain> --domain play.example.com [--ref v0.2.0]
 *
 * Uses your ssh/scp (key login as root, set up by deploy/provision.ts). Uncommitted changes are
 * not deployed: commit first. On the droplet:
 *   /opt/undercroft/.env   production settings (written on the first deploy, then left alone)
 *   /opt/undercroft/app    the release, replaced each deploy; the database lives in a volume
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
	options: {
		host: { type: 'string' },
		domain: { type: 'string' },
		user: { type: 'string', default: 'root' },
		/** What to ship: a tag (a release), branch or commit. */
		ref: { type: 'string', default: 'HEAD' }
	}
});
if (!args.host || !args.domain) {
	console.error('Usage: pnpm deploy:release --host <ip or domain> --domain <public hostname>');
	process.exit(1);
}
if (!/^[a-z0-9.-]+$/i.test(args.domain) || !/^[a-z0-9.:-]+$/i.test(args.host)) {
	console.error('--host and --domain must be plain host names or addresses.');
	process.exit(1);
}

const run = (command: string, list: string[]) =>
	execFileSync(command, list, { stdio: 'inherit', encoding: 'utf8' });

const ref = args.ref;
if (!/^[\w./^~-]+$/.test(ref) || ref.startsWith('-')) {
	console.error('--ref must be a tag, branch or commit.');
	process.exit(1);
}
const git = (...list: string[]) => execFileSync('git', list, { encoding: 'utf8' }).trim();
if (ref === 'HEAD' && git('status', '--porcelain')) {
	console.warn('Uncommitted changes are not deployed; shipping HEAD.');
}
const commit = git('rev-parse', '--short', `${ref}^{commit}`);
const version = (JSON.parse(git('show', `${ref}:package.json`)) as { version: string }).version;

const target = `${args.user}@${args.host}`;
const tmp = mkdtempSync(path.join(tmpdir(), 'undercroft-release-'));
const archive = path.join(tmp, 'release.tar.gz');
try {
	run('git', ['archive', '--format=tar.gz', '-o', archive, ref]);
	console.log(`Uploading ${version} (${commit}) to ${target}...`);
	run('ssh', [target, 'mkdir -p /opt/undercroft']);
	run('scp', [archive, `${target}:/opt/undercroft/release.tar.gz`]);
	const compose = 'docker compose -f docker-compose.prod.yml --env-file ../.env';
	const remote = [
		'set -e',
		'cd /opt/undercroft',
		`[ -f .env ] || printf 'DOMAIN=%s\\nMONGODB_DB=undercroft\\n' '${args.domain}' > .env`,
		'rm -rf app.next && mkdir app.next && tar xzf release.tar.gz -C app.next',
		'rm -rf app && mv app.next app && rm release.tar.gz',
		'cd app',
		`${compose} up -d --build --remove-orphans`,
		// Caddy's Caddyfile is a single-file mount, so a running Caddy keeps the old file after `app`
		// is replaced. Recreate it when what it runs differs from the new one.
		`{ ${compose} exec -T caddy cat /etc/caddy/Caddyfile | cmp -s - deploy/Caddyfile || ${compose} up -d --force-recreate caddy; }`,
		'docker image prune -f'
	].join(' && ');
	run('ssh', [target, remote]);
	console.log(`Deployed ${version} (${commit}): https://${args.domain}`);
} finally {
	rmSync(tmp, { recursive: true, force: true });
}
