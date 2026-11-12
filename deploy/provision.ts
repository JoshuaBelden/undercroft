/**
 * Creates (or finds) the production droplet on DigitalOcean. Safe to run again: everything it
 * makes is looked up by name or tag first. See docs/dev/deployment.md.
 *
 *   pnpm deploy:provision --domain play.example.com [--region sfo3] [--size s-1vcpu-1gb]
 *                         [--ssh-key ~/.ssh/id_ed25519.pub] [--backups]
 *
 * Needs a DigitalOcean API token: DIGITALOCEAN_ACCESS_TOKEN in the environment, or the file
 * ~/.undercroft/do-token (never commit it or paste it anywhere).
 *
 *  1. Registers your SSH public key with the account (if it isn't already).
 *  2. Creates an Ubuntu droplet tagged `undercroft`, with cloud-init adding 2 GB of swap (the
 *     smallest sizes need it to build the image) and installing Docker and a nightly MongoDB
 *     dump. `--backups` also turns on DigitalOcean's weekly droplet backups (20% extra).
 *  3. Puts a cloud firewall on it: SSH, HTTP and HTTPS (with HTTP/3) in, anything out.
 *  4. Points the domain's A record at it, if the domain's DNS is hosted on DigitalOcean.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const API = 'https://api.digitalocean.com/v2';
const NAME = 'undercroft';
const TAG = 'undercroft';

const { values: args } = parseArgs({
	options: {
		domain: { type: 'string' },
		region: { type: 'string', default: 'sfo3' },
		// The cheapest size that runs the stack; resize up from the dashboard as players arrive.
		size: { type: 'string', default: 's-1vcpu-1gb' },
		'ssh-key': { type: 'string', default: path.join(homedir(), '.ssh', 'id_ed25519.pub') },
		backups: { type: 'boolean', default: false }
	}
});

/** Where the token can live instead of the environment: outside the repo, never committed. */
const TOKEN_FILE = path.join(homedir(), '.undercroft', 'do-token');

const token =
	process.env.DIGITALOCEAN_ACCESS_TOKEN ||
	(existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : '');
if (!token) {
	console.error(`Set DIGITALOCEAN_ACCESS_TOKEN, or put the token in ${TOKEN_FILE}.`);
	process.exit(1);
}

async function api<T>(method: string, route: string, body?: unknown): Promise<T> {
	const response = await fetch(`${API}${route}`, {
		method,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	if (!response.ok) {
		throw new Error(`${method} ${route}: ${response.status} ${await response.text()}`);
	}
	return (response.status === 204 ? undefined : await response.json()) as T;
}

/** DigitalOcean identifies SSH keys by the MD5 fingerprint of the key blob. */
function fingerprint(publicKey: string): string {
	const blob = Buffer.from(publicKey.trim().split(/\s+/)[1] ?? '', 'base64');
	return (createHash('md5').update(blob).digest('hex').match(/../g) ?? []).join(':');
}

async function sshKey(): Promise<number> {
	const publicKey = readFileSync(args['ssh-key'], 'utf8').trim();
	const print = fingerprint(publicKey);
	const { ssh_keys } = await api<{ ssh_keys: { id: number; fingerprint: string }[] }>(
		'GET',
		'/account/keys?per_page=200'
	);
	const known = ssh_keys.find((key) => key.fingerprint === print);
	if (known) return known.id;
	const { ssh_key } = await api<{ ssh_key: { id: number } }>('POST', '/account/keys', {
		name: `${NAME}-deploy`,
		public_key: publicKey
	});
	console.log(`Registered SSH key ${print}`);
	return ssh_key.id;
}

/** cloud-init: swap, Docker, the app folder, and a nightly MongoDB dump kept for two weeks. */
const USER_DATA = `#cloud-config
package_update: true
write_files:
  - path: /etc/cron.d/undercroft-backup
    content: |
      30 4 * * * root cd /opt/undercroft/app && docker compose -f docker-compose.prod.yml --env-file ../.env exec -T mongo mongodump --archive --gzip > /opt/undercroft/backups/mongo-$(date +\\%F).gz && find /opt/undercroft/backups -name 'mongo-*.gz' -mtime +14 -delete
runcmd:
  - fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  - echo '/swapfile none swap sw 0 0' >> /etc/fstab
  - curl -fsSL https://get.docker.com | sh
  - mkdir -p /opt/undercroft/backups
`;

interface Droplet {
	id: number;
	status: string;
	networks: { v4: { ip_address: string; type: string }[] };
}

async function droplet(key: number): Promise<Droplet> {
	const { droplets } = await api<{ droplets: Droplet[] }>('GET', `/droplets?tag_name=${TAG}`);
	if (droplets.length) {
		console.log(`Droplet ${droplets[0].id} already exists`);
		return droplets[0];
	}
	const created = await api<{ droplet: Droplet }>('POST', '/droplets', {
		name: NAME,
		region: args.region,
		size: args.size,
		image: 'ubuntu-24-04-x64',
		ssh_keys: [key],
		backups: args.backups,
		monitoring: true,
		ipv6: true,
		tags: [TAG],
		user_data: USER_DATA
	});
	console.log(`Creating droplet ${created.droplet.id} (${args.size} in ${args.region})...`);
	return created.droplet;
}

async function waitActive(id: number): Promise<string> {
	for (;;) {
		const { droplet } = await api<{ droplet: Droplet }>('GET', `/droplets/${id}`);
		const ip = droplet.networks.v4.find((n) => n.type === 'public')?.ip_address;
		if (droplet.status === 'active' && ip) return ip;
		await new Promise((resolve) => setTimeout(resolve, 5000));
	}
}

async function firewall(): Promise<void> {
	const { firewalls } = await api<{ firewalls: { name: string }[] }>('GET', '/firewalls');
	if (firewalls.some((f) => f.name === NAME)) return;
	const anywhere = { addresses: ['0.0.0.0/0', '::/0'] };
	await api('POST', '/firewalls', {
		name: NAME,
		tags: [TAG],
		inbound_rules: [
			{ protocol: 'tcp', ports: '22', sources: anywhere },
			{ protocol: 'tcp', ports: '80', sources: anywhere },
			{ protocol: 'tcp', ports: '443', sources: anywhere },
			{ protocol: 'udp', ports: '443', sources: anywhere }
		],
		outbound_rules: [
			{ protocol: 'tcp', ports: 'all', destinations: anywhere },
			{ protocol: 'udp', ports: 'all', destinations: anywhere },
			{ protocol: 'icmp', destinations: anywhere }
		]
	});
	console.log('Created firewall (22, 80, 443 in)');
}

/** Point the domain at the droplet, if its zone is on DigitalOcean DNS. */
async function dns(domain: string, ip: string): Promise<void> {
	const { domains } = await api<{ domains: { name: string }[] }>('GET', '/domains?per_page=200');
	const zone = domains
		.map((d) => d.name)
		.filter((name) => domain === name || domain.endsWith(`.${name}`))
		.sort((a, b) => b.length - a.length)[0];
	if (!zone) {
		console.log(`DNS for ${domain} isn't on DigitalOcean: add an A record ${domain} -> ${ip}`);
		return;
	}
	const host = domain === zone ? '@' : domain.slice(0, -(zone.length + 1));
	const { domain_records } = await api<{ domain_records: { id: number }[] }>(
		'GET',
		`/domains/${zone}/records?type=A&name=${domain}`
	);
	if (domain_records.length) {
		await api('PUT', `/domains/${zone}/records/${domain_records[0].id}`, { data: ip });
	} else {
		await api('POST', `/domains/${zone}/records`, { type: 'A', name: host, data: ip, ttl: 300 });
	}
	console.log(`DNS: ${domain} -> ${ip}`);
}

const key = await sshKey();
const created = await droplet(key);
const ip = await waitActive(created.id);
await firewall();
if (args.domain) await dns(args.domain, ip);
console.log(`
Droplet ready at ${ip}. Cloud-init installs Docker in the first few minutes after boot.
Next: pnpm deploy:release --host ${ip} --domain ${args.domain ?? '<your domain>'}`);
