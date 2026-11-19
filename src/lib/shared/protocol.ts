/**
 * Messages exchanged between client and game server over WebSocket.
 * All messages are JSON with a `type` discriminator.
 */
import type { AfflictionSnapshot } from './affliction/types.ts';
import type { Alert } from './alerts/types.ts';
import type { CreatureSnapshot } from './creature/types.ts';
import type {
	CrateSlot,
	CratesSnapshot,
	GameEvent,
	InventoryAction,
	LaidRopeSnapshot,
	MarkSnapshot,
	ProjectileSnapshot,
	TiedRopeSnapshot,
	WorldItemSnapshot
} from './items/types.ts';
import type { MapLayout, Vec3 } from './map/types.ts';
import type { PartyState } from './party/types.ts';
import type { InputFrame, Inventory, ItemStack, PlayerSnapshot } from './player/types.ts';
import type { Person, SocialAction, SocialState } from './social/types.ts';

export type ClientMessage =
	/**
	 * First message. `ticket` says who this is (from the site's `/api/ticket`); without a valid one
	 * the connection is rejected. You get the party you were in if your place is still held,
	 * otherwise one of your own. `name` is your gamer tag: only used when you join someone's
	 * desktop game as a co-op guest, whose server has no account for you (docs/dev/hosting.md).
	 */
	| { type: 'hello'; protocol: number; ticket: string; name?: string }
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
	/** The gamer tag or avatar was changed on the site: read them again. */
	| { type: 'profile' }
	/** Dead and watching the others: stop, and go back to the surface. */
	| { type: 'stopSpectating' }
	/** Give up on the expedition: back to the surface, leaving what you carried where you stood. */
	| { type: 'abandon' }
	/** Rearrange or drop what you carry (the inventory screen). */
	| { type: 'inventory'; action: InventoryAction }
	/** Done with the loot crate that is open. */
	| { type: 'closeCrate' }
	/**
	 * Draw a chalk mark with the chalk in the hand: a symbol on the player's wheel, where their
	 * view meets the stone (`normal` out of it). The server checks it (see docs/dev/marks.md).
	 */
	| { type: 'mark'; symbol: string; position: Vec3; normal: Vec3 }
	/** Forget everything you know of an Affliction: no hints, unresolved. Not while underground. */
	| { type: 'resetAffliction'; id: string }
	/**
	 * A co-op guest's answer to the host's `vault` `take` (docs/dev/hosting.md#the-vault): what
	 * they take down from their own save, what they own (for the rite items) and their chalk
	 * wheel. The host checks it all.
	 */
	| { type: 'vault'; id: number; kit: unknown; owned: unknown; markWheel: unknown };

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
	/** Summon the manifestation, in the rite's room (as the rite does). */
	| { kind: 'manifest' }
	/** Banish it: the Affliction is resolved, as if a weapon had. */
	| { kind: 'banish' }
	/** Stun it (immunity still applies). */
	| { kind: 'stun' }
	/** Make it swing, fire its ray, charge, or vanish now, at whoever is nearest. */
	| { kind: 'bossStrike' }
	| { kind: 'bossRay' }
	| { kind: 'bossRush' }
	| { kind: 'bossVanish' }
	/**
	 * Put a creature (of this kind; the witch if left out) a few metres in front of you. `fated`:
	 * a dweller that turns when seen (or one that never does).
	 */
	| { kind: 'spawnCreature'; creature?: string; fated?: boolean }
	| { kind: 'clearCreatures' }
	/** Fill one of the party's attraction meters (a witch comes), or empty both. */
	| { kind: 'fillAttraction'; meter: 'noise' | 'light' }
	| { kind: 'resetAttraction' }
	| { kind: 'setSanity'; value: number }
	/** Take every condition off you (a hobble). */
	| { kind: 'clearConditions' }
	/** Reveal everything the clues would. */
	| { kind: 'revealClues' }
	/** Forget the rite's clues, for this expedition and for everyone in it afterwards. */
	| { kind: 'resetRite' }
	/** Set the seconds left before everyone still underground is lost. */
	| { kind: 'setDeadline'; seconds: number }
	/** Teleport to a start or major room by piece name. */
	| { kind: 'teleport'; room: string }
	/**
	 * Move your body to the free camera: `position` is the camera. The eyes go there and the body
	 * falls to the floor below (with noclip on, it stays). Nothing happens over no floor at all.
	 */
	| { kind: 'teleportTo'; position: Vec3 }
	/** Open every door between levels. */
	| { kind: 'openDoors' }
	/** Shut every loot crate and fill them again, hidden. */
	| { kind: 'resetCrates' }
	| { kind: 'unlockCrates' }
	| { kind: 'openWalls' }
	/** Rub out every chalk mark. */
	| { kind: 'clearMarks' }
	/** Take up every rope, laid and tied (anyone on one falls). */
	| { kind: 'clearRopes' }
	/** Your map: every cell drawn in it (`reveal`), or none (`clear`). See docs/dev/map.md. */
	| { kind: 'revealMap' }
	| { kind: 'clearMap' }
	/** New map; omit the seed for a random one. */
	| { kind: 'regenerate'; seed?: number }
	/** Throw an error on the game server, to try the crash prompt (docs/dev/reports.md). */
	| { kind: 'throw' };

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
	/** Something happened to you worth a notice: a friend request, an item... (docs/dev/alerts.md). */
	| { type: 'alert'; alert: Alert }
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
			/** The chalk symbols on their wheel: the only ones the server lets them draw. */
			markWheel: string[];
	  }
	| { type: 'reject'; reason: string }
	| { type: 'pong'; clientTime: number; serverTime: number }
	| {
			type: 'tick';
			tick: number;
			serverTime: number;
			players: PlayerSnapshot[];
			creatures: CreatureSnapshot[];
			/** Items lying in the map: left out while unchanged since the last tick sent to you. */
			items?: WorldItemSnapshot[];
			/** Thrown items in flight. */
			projectiles: ProjectileSnapshot[];
			/** What happened this tick (shots, hits, pickups...). */
			events: GameEvent[];
			affliction: AfflictionSnapshot;
			/** Loot crates opened and in use (where they stand is in the layout). */
			crates: CratesSnapshot;
			/** Doors between levels that have been opened (where they stand is in the layout). */
			doors: string[];
			/** Doors sealed shut: the final room's, from the rite until it is banished. */
			sealed: string[];
			/** False walls brought down (where they stood is in the layout). */
			walls: string[];
			/**
			 * Dev mode only (the admin bars): how full the party's noise and light meters are, 0..1
			 * (full for a moment after one brings a witch), how many witches are alive, and why the
			 * last one came (a meter, an omen, a dweller turning, admin) and how long ago.
			 * See docs/dev/creatures.md#attraction.
			 */
			attraction?: {
				noise: number;
				light: number;
				witches: number;
				last?: { cause: string; seconds: number };
			};
	  }
	/**
	 * The loot crate you have open, sent while it is open: its slots, and how far along (0..1) the
	 * first hidden one is to being revealed. `id: null` means it has closed.
	 */
	| { type: 'crate'; id: string | null; slots: CrateSlot[]; reveal: number }
	/**
	 * Every chalk mark in the expedition: sent to everyone when one is drawn or rubbed out, and to
	 * a player arriving or coming back.
	 */
	| { type: 'marks'; marks: MarkSnapshot[] }
	/**
	 * Every rope: laid along the floor, and tied at anchors. Sent like `marks`, whenever one is
	 * started, stopped, gathered up, tied or untied (see docs/dev/rope.md).
	 */
	| { type: 'ropes'; laid: LaidRopeSnapshot[]; tied: TiedRopeSnapshot[] }
	/** Points added to ropes being laid since the last tick. */
	| { type: 'ropeGrow'; ropes: { id: string; points: Vec3[] }[] }
	/**
	 * Your map: every cell you have sketched (or been shown), [x, z, level]. Sent whenever it
	 * changes, and to a player arriving or coming back. See docs/dev/map.md.
	 */
	| { type: 'survey'; cells: [number, number, number][] }
	/** The map changed (admin regenerate); players have been respawned. */
	| { type: 'map'; layout: MapLayout }
	/**
	 * You climbed out: you have left the expedition. `carried` (here and below) is what you
	 * brought out, which you keep.
	 */
	| ({ type: 'extracted'; carried: ItemStack[] } & ExpeditionSummary)
	/**
	 * You bled out (or, with `lost`, time ran out with you still underground): you have left the
	 * expedition and lost what you carried. If `spectating`, others are still down there and
	 * you keep getting `tick` to watch them, until `spectateEnd` or you send `stopSpectating`.
	 */
	| ({ type: 'died'; spectating: boolean; lost?: boolean } & ExpeditionSummary)
	/** You abandoned the expedition: you have left it and lost what you carried. */
	| ({ type: 'abandoned' } & ExpeditionSummary)
	/** The expedition you were watching is over; `escaped` players got out alive. */
	| { type: 'spectateEnd'; escaped: number }
	/** Your progress on an Affliction was reset (`resetAffliction`): reload the account. */
	| { type: 'afflictionReset'; id: string }
	/**
	 * Something broke on the game server while handling you or your expedition. `id` is the error
	 * recorded (null without a database); the client asks whether to report it.
	 */
	| { type: 'serverError'; id: string | null; message: string }
	/**
	 * You earned these achievements (src/lib/content/achievements.ts). The desktop app unlocks
	 * them on Steam; a browser ignores it. Sent each time, even for one earned before.
	 */
	| { type: 'achievement'; ids: string[] }
	/**
	 * Only to a co-op guest on someone's desktop game (docs/dev/hosting.md#the-vault): their stash
	 * and loadout are in their own save, so the host asks for what they take down (`take`, answered
	 * with the client's `vault`), keeps their hub locked while ready (`lock`) and hands back what
	 * they carried out (`return`, null if it was lost).
	 */
	| { type: 'vault'; id: number; op: 'take'; session: string }
	| { type: 'vault'; id: number; op: 'lock'; ready: boolean }
	| { type: 'vault'; id: number; op: 'return'; session: string; carried: Inventory | null };

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
	'profile',
	'stopSpectating',
	'abandon',
	'inventory',
	'closeCrate',
	'mark',
	'resetAffliction',
	'vault'
]);
const SERVER_TYPES = new Set<string>([
	'party',
	'partyError',
	'social',
	'socialSearch',
	'alert',
	'welcome',
	'reject',
	'pong',
	'tick',
	'crate',
	'marks',
	'ropes',
	'ropeGrow',
	'survey',
	'map',
	'extracted',
	'died',
	'abandoned',
	'spectateEnd',
	'afflictionReset',
	'serverError',
	'achievement',
	'vault'
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
