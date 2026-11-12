/**
 * Messages exchanged between client and game server over WebSocket.
 * All messages are JSON with a `type` discriminator.
 */
import type { AfflictionSnapshot } from './affliction/types.ts';
import type { CreatureSnapshot } from './creature/types.ts';
import type {
	CrateSlot,
	CratesSnapshot,
	GameEvent,
	InventoryAction,
	ProjectileSnapshot,
	WorldItemSnapshot
} from './items/types.ts';
import type { MapLayout } from './map/types.ts';
import type { PartyState } from './party/types.ts';
import type { InputFrame, ItemStack, PlayerSnapshot } from './player/types.ts';
import type { Person, SocialAction, SocialState } from './social/types.ts';

export type ClientMessage =
	/**
	 * First message. `ticket` says who this is (from the site's `/api/ticket`); without a valid one
	 * the connection is rejected. You get the party you were in if your place is still held,
	 * otherwise one of your own.
	 */
	| { type: 'hello'; protocol: number; ticket: string }
	| { type: 'ping'; clientTime: number }
	/** Fixed-step input frames since the last send (see docs/dev/player.md). */
	| { type: 'input'; frames: InputFrame[] }
	/** Dev-only commands; the server ignores them unless DEV_MODE=true. */
	| { type: 'admin'; command: AdminCommand }
	/** Leave the party for a new one of your own. */
	| { type: 'leaveParty' }
	/** Party host: put this member (by member id) out of the party. */
	| { type: 'kick'; member: string }
	/**
	 * Ready to descend (the loadout is confirmed), or not after all. Needs an Affliction chosen.
	 * Once everyone is ready the descent counts down and starts by itself.
	 */
	| { type: 'ready'; ready: boolean }
	/** Party host: choose the Affliction the expedition is against. Everyone becomes not ready. */
	| { type: 'affliction'; id: string }
	/** Friends and party invites (see docs/dev/social.md). */
	| { type: 'social'; action: SocialAction }
	/** The gamer tag was changed on the site: read it again. */
	| { type: 'rename' }
	/** Dead and watching the others: stop, and go back to the surface. */
	| { type: 'stopSpectating' }
	/** Give up on the expedition: back to the surface, leaving what you carried where you stood. */
	| { type: 'abandon' }
	/** Rearrange or drop what you carry (the inventory screen). */
	| { type: 'inventory'; action: InventoryAction }
	/** Done with the loot crate that is open. */
	| { type: 'closeCrate' };

export type AdminCommand =
	| {
			kind: 'noclip' | 'infiniteStamina' | 'infiniteBattery' | 'godMode' | 'infiniteAmmo';
			enabled: boolean;
	  }
	/** Put an item in your inventory (firearms come loaded). */
	| { kind: 'give'; item: string; count: number }
	/** Fill your guns and add spare ammo. */
	| { kind: 'refillAmmo' }
	| { kind: 'killCreatures' }
	/** Set the Affliction meter (0..1). */
	| { kind: 'setMeter'; value: number }
	/** Fill the meter: it manifests. */
	| { kind: 'manifest' }
	| { kind: 'banish' }
	/** Put a creature a few metres in front of you. */
	| { kind: 'spawnCreature' }
	| { kind: 'clearCreatures' }
	| { kind: 'setSanity'; value: number }
	/** Reveal everything the clues would. */
	| { kind: 'revealClues' }
	/** Forget the rite's clues, for this expedition and for everyone in it afterwards. */
	| { kind: 'resetRite' }
	/** Teleport to a start or major room by piece name. */
	| { kind: 'teleport'; room: string }
	/** Shut every loot crate and fill them again, hidden. */
	| { kind: 'resetCrates' }
	/** New map; omit the seed for a random one. */
	| { kind: 'regenerate'; seed?: number };

export type ServerMessage =
	/** Your party, sent on joining and whenever it changes. `you` is your member id. */
	| {
			type: 'party';
			you: string;
			party: PartyState;
	  }
	/** A party or social request was refused (no Affliction chosen, party full...). */
	| { type: 'partyError'; reason: string }
	/** Your friends, requests and invites, sent on connecting and whenever they change. */
	| { type: 'social'; state: SocialState }
	/** Answer to a `search`. */
	| { type: 'socialSearch'; query: string; results: Person[] }
	/** The expedition has started and you are in it. */
	| {
			type: 'welcome';
			playerId: string;
			sessionId: string;
			tickRate: number;
			/** The expedition map, generated on the server. Clients only render it. */
			layout: MapLayout;
			/** Back in an expedition already underway (a reconnect), not just arriving. */
			resumed: boolean;
	  }
	| { type: 'reject'; reason: string }
	| { type: 'pong'; clientTime: number; serverTime: number }
	| {
			type: 'tick';
			tick: number;
			serverTime: number;
			players: PlayerSnapshot[];
			creatures: CreatureSnapshot[];
			/** Items lying in the map. */
			items: WorldItemSnapshot[];
			/** Thrown items in flight. */
			projectiles: ProjectileSnapshot[];
			/** What happened this tick (shots, hits, pickups...). */
			events: GameEvent[];
			affliction: AfflictionSnapshot;
			/** Loot crates opened and in use (where they stand is in the layout). */
			crates: CratesSnapshot;
	  }
	/**
	 * The loot crate you have open, sent while it is open: its slots, and how far along (0..1) the
	 * first hidden one is to being revealed. `id: null` means it has closed.
	 */
	| { type: 'crate'; id: string | null; slots: CrateSlot[]; reveal: number }
	/** The map changed (admin regenerate); players have been respawned. */
	| { type: 'map'; layout: MapLayout }
	/**
	 * You climbed out: you have left the expedition. `carried` (here and below) is what you
	 * brought out, which you keep.
	 */
	| ({ type: 'extracted'; carried: ItemStack[] } & ExpeditionSummary)
	/**
	 * You bled out: you have left the expedition and lost what you carried. If `spectating`, others are still down there and
	 * you keep getting `tick` to watch them, until `spectateEnd` or you send `stopSpectating`.
	 */
	| ({ type: 'died'; spectating: boolean } & ExpeditionSummary)
	/** You abandoned the expedition: you have left it and lost what you carried. */
	| ({ type: 'abandoned' } & ExpeditionSummary)
	/** The expedition you were watching is over; `escaped` players got out alive. */
	| { type: 'spectateEnd'; escaped: number }
	/** The manifestation was banished: everyone leaves the expedition. */
	| ({ type: 'banished'; carried: ItemStack[] } & ExpeditionSummary)
	/** The rite was performed: the Affliction is resolved and everyone leaves the expedition. */
	| ({ type: 'resolved'; carried: ItemStack[] } & ExpeditionSummary);

/** How one explorer's expedition went: sent with every way out of it, for the results screen. */
export interface ExpeditionSummary {
	/** Time underground. */
	seconds: number;
	/** Deepest level reached below the start (0 = the start level). */
	deepestLevel: number;
	/** Creatures (and the manifestation) they finished off. */
	kills: number;
	/** Loot crates they were the first to open. */
	crates: number;
	/** Rite clues they found. */
	clues: number;
}

export function encode(message: ClientMessage | ServerMessage): string {
	return JSON.stringify(message);
}

export function decodeClient(raw: string): ClientMessage | null {
	return decode(raw, CLIENT_TYPES) as ClientMessage | null;
}

export function decodeServer(raw: string): ServerMessage | null {
	return decode(raw, SERVER_TYPES) as ServerMessage | null;
}

const CLIENT_TYPES = new Set<string>([
	'hello',
	'ping',
	'input',
	'admin',
	'leaveParty',
	'kick',
	'ready',
	'affliction',
	'social',
	'rename',
	'stopSpectating',
	'abandon',
	'inventory',
	'closeCrate'
]);
const SERVER_TYPES = new Set<string>([
	'party',
	'partyError',
	'social',
	'socialSearch',
	'welcome',
	'reject',
	'pong',
	'tick',
	'crate',
	'map',
	'extracted',
	'died',
	'abandoned',
	'spectateEnd',
	'banished',
	'resolved'
]);

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
