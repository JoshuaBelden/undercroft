/**
 * Messages exchanged between client and game server over WebSocket.
 * All messages are JSON with a `type` discriminator.
 */
import type { MapLayout } from './map/types.ts';
import type { InputFrame, PlayerSnapshot } from './player/types.ts';

export type ClientMessage =
	| { type: 'hello'; protocol: number; name: string }
	| { type: 'ping'; clientTime: number }
	/** Fixed-step input frames since the last send (see docs/dev/player.md). */
	| { type: 'input'; frames: InputFrame[] }
	/** Dev-only commands; the server ignores them unless DEV_MODE=true. */
	| { type: 'admin'; command: AdminCommand };

export type AdminCommand =
	| { kind: 'noclip' | 'infiniteStamina' | 'infiniteBattery'; enabled: boolean }
	/** Teleport to a start or major room by piece name. */
	| { kind: 'teleport'; room: string }
	/** New map; omit the seed for a random one. */
	| { kind: 'regenerate'; seed?: number };

export type ServerMessage =
	| {
			type: 'welcome';
			playerId: string;
			sessionId: string;
			tickRate: number;
			/** The expedition map, generated on the server. Clients only render it. */
			layout: MapLayout;
	  }
	| { type: 'reject'; reason: string }
	| { type: 'pong'; clientTime: number; serverTime: number }
	| { type: 'tick'; tick: number; serverTime: number; players: PlayerSnapshot[] }
	/** The map changed (admin regenerate); players have been respawned. */
	| { type: 'map'; layout: MapLayout };

export function encode(message: ClientMessage | ServerMessage): string {
	return JSON.stringify(message);
}

export function decodeClient(raw: string): ClientMessage | null {
	return decode(raw, CLIENT_TYPES) as ClientMessage | null;
}

export function decodeServer(raw: string): ServerMessage | null {
	return decode(raw, SERVER_TYPES) as ServerMessage | null;
}

const CLIENT_TYPES = new Set<string>(['hello', 'ping', 'input', 'admin']);
const SERVER_TYPES = new Set<string>(['welcome', 'reject', 'pong', 'tick', 'map']);

function decode(raw: string, allowed: Set<string>): unknown {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			'type' in parsed &&
			typeof parsed.type === 'string' &&
			allowed.has(parsed.type)
		) {
			return parsed;
		}
	} catch {
		// Malformed JSON is treated as an unknown message.
	}
	return null;
}
