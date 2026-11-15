import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { GUEST_HEADERS } from '../../src/lib/server/local.ts';
import { memoryTransports } from './transports.ts';
import { TunnelGuest, TunnelHost } from './tunnel.ts';

/**
 * The tunnel end to end, without Steam: a guest page's WebSocket, through two transports joined
 * in memory, to a stand-in for the host's game server that echoes who it was told the guest is.
 */

const HOST = '76561190000000001';
const GUEST = '76561190000000002';
const KEY = 'host-key';

let cleanup: (() => void)[] = [];
afterEach(() => {
	for (const done of cleanup) done();
	cleanup = [];
});

async function gameServer(): Promise<{ url: string; seen: Record<string, string | undefined>[] }> {
	const seen: Record<string, string | undefined>[] = [];
	const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
	await new Promise((resolve) => server.once('listening', resolve));
	server.on('connection', (socket, request) => {
		const who = {
			key: request.headers[GUEST_HEADERS.hostKey] as string | undefined,
			steamId: request.headers[GUEST_HEADERS.steamId] as string | undefined
		};
		seen.push(who);
		socket.on('message', (data) => socket.send(`${who.steamId}: ${String(data)}`));
	});
	cleanup.push(() => server.close());
	return { url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

function opened(url: string): Promise<WebSocket> {
	const socket = new WebSocket(url);
	cleanup.push(() => socket.close());
	return new Promise((resolve, reject) => {
		socket.once('open', () => resolve(socket));
		socket.once('error', reject);
	});
}

const nextMessage = (socket: WebSocket): Promise<string> =>
	new Promise((resolve) => socket.once('message', (data) => resolve(String(data))));

describe('the tunnel', () => {
	it("carries a guest's messages both ways, as the SteamID the link says sent them", async () => {
		const server = await gameServer();
		const [hostEnd, guestEnd] = memoryTransports(HOST, GUEST);
		const host = new TunnelHost(
			hostEnd,
			() => server.url,
			KEY,
			(peer) => peer === GUEST
		);
		const guest = new TunnelGuest(guestEnd, HOST);
		cleanup.push(
			() => host.stop(),
			() => guest.stop()
		);
		const page = await opened(await guest.start());
		for (const message of ['hello', '{"type":"input","frames":[]}', 'é ✓']) {
			const reply = nextMessage(page);
			page.send(message);
			expect(await reply).toBe(`${GUEST}: ${message}`);
		}
		expect(server.seen).toEqual([{ key: KEY, steamId: GUEST }]);
		expect(host.open).toBe(1);
	});

	it('turns away someone who is not in the lobby', async () => {
		const server = await gameServer();
		const [hostEnd, guestEnd] = memoryTransports(HOST, GUEST);
		const host = new TunnelHost(
			hostEnd,
			() => server.url,
			KEY,
			() => false
		);
		const guest = new TunnelGuest(guestEnd, HOST);
		cleanup.push(
			() => host.stop(),
			() => guest.stop()
		);
		const page = await opened(await guest.start());
		const code = await new Promise<number>((resolve) => page.once('close', (c) => resolve(c)));
		expect(code).toBe(4000);
		expect(server.seen).toEqual([]);
	});

	it("closes the guest's page when the host's game server closes their connection", async () => {
		const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
		await new Promise((resolve) => server.once('listening', resolve));
		server.on('connection', (socket) => socket.close());
		cleanup.push(() => server.close());
		const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
		const [hostEnd, guestEnd] = memoryTransports(HOST, GUEST);
		const host = new TunnelHost(
			hostEnd,
			() => url,
			KEY,
			() => true
		);
		const guest = new TunnelGuest(guestEnd, HOST);
		cleanup.push(
			() => host.stop(),
			() => guest.stop()
		);
		const page = await opened(await guest.start());
		const code = await new Promise<number>((resolve) => page.once('close', (c) => resolve(c)));
		expect(code).toBe(4000);
	});
});
