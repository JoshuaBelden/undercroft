/**
 * Ships the committed code (git HEAD, with its built static/assets) to the droplet and
 * restarts the stack. See docs/dev/deployment.md.
 *
 *   pnpm deploy:release --host <droplet ip or domain> --domain play.example.com
 *
 * Uses your ssh/scp (key login as root, set up by deploy/provision.ts). Uncommitted changes are
 * not deployed: commit first. On the droplet:
 *   /opt/undercroft/.env   production settings (written on the first deploy, then left alone)
 *   /opt/undercroft/app    the release, replaced each deploy; the database lives in a volume
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
	options: {
		host: { type: 'string' },
		domain: { type: 'string' },
		user: { type: 'string', default: 'root' }
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

const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (dirty) console.warn('Uncommitted changes are not deployed; shipping HEAD.');
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

const target = `${args.user}@${args.host}`;
const tmp = mkdtempSync(path.join(tmpdir(), 'undercroft-release-'));
const archive = path.join(tmp, 'release.tar.gz');
try {
	run('git', ['archive', '--format=tar.gz', '-o', archive, 'HEAD']);
	console.log(`Uploading ${version} (${commit}) to ${target}...`);
	run('ssh', [target, 'mkdir -p /opt/undercroft']);
	run('scp', [archive, `${target}:/opt/undercroft/release.tar.gz`]);
	const remote = [
		'set -e',
		'cd /opt/undercroft',
		`[ -f .env ] || printf 'DOMAIN=%s\\nMONGODB_DB=undercroft\\n' '${args.domain}' > .env`,
		'rm -rf app.next && mkdir app.next && tar xzf release.tar.gz -C app.next',
		'rm -rf app && mv app.next app && rm release.tar.gz',
		'cd app',
		'docker compose -f docker-compose.prod.yml --env-file ../.env up -d --build --remove-orphans',
		'docker image prune -f'
	].join(' && ');
	run('ssh', [target, remote]);
	console.log(`Deployed ${version} (${commit}): https://${args.domain}`);
} finally {
	rmSync(tmp, { recursive: true, force: true });
}
