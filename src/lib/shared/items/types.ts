import type { Vec3 } from '../map/types.ts';
import type { EquipmentSlot, ItemStack } from '../player/types.ts';

/** An item lying in the map, as broadcast in each tick. See docs/dev/items.md. */
export interface WorldItemSnapshot {
	id: string;
	/** Key into ITEMS. */
	item: string;
	count: number;
	position: Vec3;
	yaw: number;
	/** Hung on a wall facing out along this (a hint), instead of lying on a floor or a top. */
	normal?: Vec3;
}

/**
 * A slot of the loot crate a player has open, as that player is told it: what is there, nothing,
 * or `'hidden'` for something not revealed yet (what it is is never sent).
 */
export type CrateSlot = ItemStack | null | 'hidden';

/** A rope laid along the floor (see docs/dev/rope.md): its points, every ROPE.spacing metres. */
export interface LaidRopeSnapshot {
	id: string;
	/** Player id of whoever laid it, and their gamer tag. */
	by: string;
	name: string;
	points: Vec3[];
	/** Still being paid out (its last point follows them). */
	laying: boolean;
	/** The rope item it was laid from: gathering it up gives that back. */
	item: string;
}

/** A rope tied at an anchor, hanging down the drop. */
export interface TiedRopeSnapshot {
	/** `Anchor.id` in the collision world. */
	anchor: string;
	by: string;
	name: string;
	/** The rope item tied there: untying it gives that back. */
	item: string;
}

/**
 * A chalk mark on a wall, floor or ceiling, as every client is told it. See docs/dev/marks.md.
 */
export interface MarkSnapshot {
	id: string;
	/** Key into MARK_SYMBOLS. */
	symbol: string;
	/** On the stone, as the drawer's client aimed it. */
	position: Vec3;
	/** Out of the surface (unit). */
	normal: Vec3;
	/** The symbol's top, along the surface (unit). */
	up: Vec3;
	/** Player id of whoever drew it. */
	by: string;
	/** Their gamer tag, for the label. */
	name: string;
}

/** Which loot crates have been opened (their lids stay up) and which someone is going through. */
export interface CratesSnapshot {
	open: string[];
	busy: string[];
	/** Crates someone has tried and found jammed, still shut fast (pry them with a crowbar). */
	jammed: string[];
	/** Trunks still locked (a key opens one). */
	locked: string[];
	/** Hidden ones (a smuggler's stash) someone has noticed: everyone can open them now. */
	noticed: string[];
	/** Ones filled from (a font) that have run dry. */
	dry: string[];
	/**
	 * Drop boxes (docs/dev/lootables.md#drop-boxes): made where explorers drop things, so not in
	 * the layout. `owner` is the player who dropped into it first.
	 */
	boxes: DropBoxSnapshot[];
}

export interface DropBoxSnapshot {
	id: string;
	/** Floor centre, world space. */
	position: Vec3;
	/** Turn about +Y (radians), as a crate placement's: its front to +Z at 0. */
	yaw: number;
	owner: string;
}

/**
 * What has been set down or set off in the map (server/systems/hazards.ts): fires burning, snares
 * set and lines of salt. Every client draws them. See docs/dev/combat.md.
 */
export interface HazardsSnapshot {
	fires: { id: string; position: Vec3; radius: number }[];
	snares: { id: string; item: string; position: Vec3; yaw: number }[];
	wards: { id: string; item: string; a: Vec3; b: Vec3 }[];
	/** Glow sticks lying lit: `left` of `seconds` (they fade at the end). */
	glows: { id: string; item: string; position: Vec3; left: number; seconds: number }[];
	/** Bait lying where it landed. */
	baits: { id: string; item: string; position: Vec3 }[];
	/** Tripwire bells set across the way. */
	tripwires: { id: string; item: string; a: Vec3; b: Vec3 }[];
	/** Charges set down, their fuses burning (docs/dev/quests.md#the-barred-stair). */
	charges: { id: string; item: string; position: Vec3 }[];
}

/** A thrown item in flight. */
export interface ProjectileSnapshot {
	id: string;
	item: string;
	position: Vec3;
}

/** A slot: in the stash (on the surface only) or somewhere in an inventory. */
export type SlotRef =
	| { area: 'stash'; index: number }
	| { area: 'backpack'; index: number }
	| { area: 'quick'; index: number }
	| { area: 'equipment'; slot: EquipmentSlot };

export type SlotArea = SlotRef['area'];

/**
 * Rearranging what you have. The same requests serve the pack screen underground (the
 * `inventory` message) and the Loadout page on the surface (`POST /api/explorer/loadout`).
 */
export type InventoryAction =
	/**
	 * Onto another slot: into it if it is empty (`count` moves part of a stack), onto a stack of
	 * the same item, or swapping places with what is there.
	 */
	| { kind: 'move'; from: SlotRef; to: SlotRef; count?: number }
	/** Shift-click: stash to loadout and back; underground, backpack to its slot and back. */
	| { kind: 'quick'; from: SlotRef }
	/** Into the weapon, defense or quick-use slot it belongs in. */
	| { kind: 'equip'; from: SlotRef }
	/** `count` of a stack into an empty slot beside it. */
	| { kind: 'split'; from: SlotRef; count: number }
	/** Underground: onto the floor in front of you. On the surface: gone for good. */
	| { kind: 'drop'; from: SlotRef; count: number };

/**
 * Something that happened this tick, for every client to show and hear (their own predicted
 * actions included: clients skip the local player's swing/shot/reload sounds they already
 * played).
 */
export type GameEvent =
	| {
			kind: 'shot';
			player: string;
			item: string;
			origin: Vec3;
			/** Where the first pellet stopped (wall or creature). */
			end: Vec3;
			creature: boolean;
	  }
	| { kind: 'swing'; player: string; item: string; origin: Vec3; hit: 'creature' | 'wall' | null }
	| { kind: 'throw'; player: string; item: string; origin: Vec3 }
	| { kind: 'land'; item: string; position: Vec3 }
	| { kind: 'break'; item: string; position: Vec3 }
	| { kind: 'reload'; player: string; item: string; position: Vec3 }
	| { kind: 'empty'; player: string; item: string; position: Vec3 }
	/** `count`: how many were taken (all that fit). */
	| { kind: 'pickup'; player: string; item: string; count: number; position: Vec3 }
	| { kind: 'drop'; player: string; item: string; position: Vec3 }
	/** Something dropped went into a drop box (docs/dev/lootables.md#drop-boxes). */
	| { kind: 'boxed'; player: string; item: string; position: Vec3 }
	| { kind: 'creatureHit'; id: string; position: Vec3 }
	/** `by`: the player who finished it off, if one did. */
	| { kind: 'creatureDie'; id: string; position: Vec3; by: string | null }
	/** A loot crate was opened for the first time. */
	| { kind: 'crateOpen'; id: string; player: string; position: Vec3 }
	/** A door between levels was opened (it stays open). */
	| { kind: 'doorOpen'; id: string; player: string; position: Vec3 }
	/** A barred door tried by hand: it rattles, and stays shut (docs/dev/quests.md). */
	| { kind: 'doorRattle'; id: string; player: string; position: Vec3 }
	/** A charge went off: heard all over the level; `door` if it blew a barred one open. */
	| { kind: 'blast'; item: string; position: Vec3; door: string | null }
	/** A room task is being worked: heard as it goes (each noise pulse). */
	| { kind: 'taskWork'; id: string; position: Vec3 }
	/** A room task was finished (docs/dev/quests.md#room-tasks). */
	| { kind: 'taskDone'; id: string; player: string; position: Vec3 }
	/** The rite slammed the final room's door shut and sealed it (`open`: it had stood open). */
	| { kind: 'doorSeal'; id: string; position: Vec3; open: boolean }
	/** What the rite summoned was banished: the sealed door opens by itself. */
	| { kind: 'doorRelease'; id: string; position: Vec3 }
	/** Someone going through a crate started on the next thing in it. */
	| { kind: 'rummage'; player: string; position: Vec3 }
	/** Someone tried a crate and found it jammed, or tried a locked trunk with no key. */
	| { kind: 'crateStuck'; id: string; player: string; position: Vec3 }
	/** A key turned in a trunk's lock (the key is used up). */
	| { kind: 'crateUnlock'; id: string; player: string; position: Vec3 }
	/** Someone started levering at a jammed crate or a wall with a crowbar. */
	| { kind: 'pry'; target: 'crate' | 'wall'; player: string; position: Vec3 }
	/** Someone started breaking at a rubble wall (a pickaxe). */
	| { kind: 'dig'; id: string; player: string; position: Vec3 }
	/** A web took a blow (`down`: it is torn through), or burned away. */
	| { kind: 'webHit'; id: string; position: Vec3; down: boolean; burned: boolean }
	/** A false wall came down under the crowbar (see map-generation.md#false-walls). */
	| { kind: 'wallDown'; id: string; player: string; position: Vec3 }
	/** A hint was found: what it says, and the requirements (item ids) and room (piece id) it revealed. */
	| {
			kind: 'clue';
			player: string;
			position: Vec3;
			text: string;
			requirements: string[];
			room: string | null;
	  }
	/** The rite was performed: it summons the manifestation. */
	| { kind: 'rite'; player: string; position: Vec3 }
	/** The manifestation the rite summoned was banished: the Affliction is resolved and calmed. */
	| { kind: 'resolved'; position: Vec3 }
	/** Put down, what the rite summoned left `item` where it fell, to be laid to rest. */
	| { kind: 'fallen'; item: string; position: Vec3 }
	/** A player tried to swing with too little stamina: a gasp. */
	| { kind: 'winded'; player: string; position: Vec3 }
	/** A hit set a creature bleeding. */
	| { kind: 'bleed'; id: string; position: Vec3 }
	/** A player's weapon snagged on a hit (it won't swing for a moment). */
	| { kind: 'snag'; player: string; item: string; position: Vec3 }
	/** Something reached into bit a player (a rat nest), or stung them (a cocoon). */
	| { kind: 'bitten'; player: string; position: Vec3 }
	/** A player drew a tarot card coming down (TAROT): its blessing or curse is on them. */
	| { kind: 'tarot'; player: string; card: string }
	/** A tripwire bell rang: something crossed it. Everyone is told (the party hears where). */
	| { kind: 'tripwire'; id: string; item: string; position: Vec3 }
	/** A training dummy took a hit (its damage, for the numbers), or came whole again. */
	| { kind: 'dummyHit'; id: string; amount: number; position: Vec3 }
	| { kind: 'dummyReset'; id: string; position: Vec3 }
	/** A player knelt to make or mend something below. */
	| { kind: 'crafting'; player: string; position: Vec3 }
	/** A player took something (laudanum, grave dirt). */
	| { kind: 'dosed'; player: string; item: string; position: Vec3 }
	/** A player blew a whistle: the party is shown where, for `seconds`. */
	| { kind: 'whistle'; player: string; position: Vec3; seconds: number }
	/** A piton hammered in at an edge (an anchor from now on); or no edge there to take one. */
	| { kind: 'piton'; player: string; position: Vec3 }
	| { kind: 'pitonFailed'; player: string }
	/** A player filled something at a font (a bottle of holy water). */
	| { kind: 'filled'; crate: string; player: string; item: string; position: Vec3 }
	/** A player noticed a hidden lootable's sign (a smuggler's chalk mark). */
	| { kind: 'noticed'; crate: string; player: string; position: Vec3 }
	/** Something fragile broke (a fall, a box smashed open). */
	| { kind: 'shatter'; item: string; position: Vec3 }
	/** A player set something down (a snare, a line of salt). */
	| { kind: 'placed'; player: string; item: string; position: Vec3 }
	/** A snare caught a creature (it is held for a while; the snare is spent). */
	| { kind: 'snared'; id: string; item: string; position: Vec3 }
	/** Something on a fuse landed and is hissing; then it went off. */
	| { kind: 'fuseLit'; item: string; position: Vec3 }
	| { kind: 'fuseBang'; item: string; position: Vec3 }
	/** Something burst into a fire (an oil bottle). */
	| { kind: 'fire'; item: string; position: Vec3 }
	/** A lamp was turned on from off: a flash that stuns what is vulnerable to it, if lit. */
	| { kind: 'strobe'; player: string; position: Vec3; stunned: number }
	/** Time ran out: everyone still underground is lost. */
	| { kind: 'deadline' }
	/** A chalk mark was drawn, or rubbed out by whoever drew it. */
	| { kind: 'mark'; player: string; position: Vec3 }
	| { kind: 'rub'; player: string; position: Vec3 }
	/** A player hit the floor hard enough to hurt (`hard`: very hard). */
	| { kind: 'fall'; player: string; position: Vec3; hard: boolean }
	/** A player took hold of a rope, or let go of one (or slipped off). */
	| { kind: 'ropeGrab'; player: string; position: Vec3 }
	| { kind: 'ropeLetGo'; player: string; position: Vec3 }
	/** Rope tied at an anchor, untied, gathered up; paid out along the floor (every few metres). */
	| { kind: 'ropeTie'; player: string; position: Vec3 }
	| { kind: 'ropeUntie'; player: string; position: Vec3 }
	| { kind: 'ropeGather'; player: string; position: Vec3 }
	| { kind: 'ropeLay'; player: string; position: Vec3 }
	/** A player finished sketching into their map, or showing it to a teammate (`with`). */
	| { kind: 'sketch'; player: string; position: Vec3 }
	| { kind: 'showMap'; player: string; with: string; position: Vec3 }
	/**
	 * The surveyor (`creature`) shared his map with a player: `cells` new ones drawn into theirs
	 * (none if they'd already seen everywhere he has).
	 */
	| { kind: 'surveyorMap'; player: string; creature: string; cells: number; position: Vec3 }
	/** A player used what was in their hand on a teammate (`patient`): a bandage, a battery. */
	| { kind: 'tend'; player: string; patient: string; item: string; position: Vec3 }
	/** The Affliction reached a new omen stage. */
	| { kind: 'omen'; stage: number }
	/** The rite summoned the manifestation (it gathers, then hunts). */
	| { kind: 'manifest' }
	/**
	 * The manifestation fired its ray, from `from` to where it struck (`to`): on `player` (their
	 * lamp is snuffed), or on the stone (null).
	 */
	| { kind: 'ray'; from: Vec3; to: Vec3; player: string | null };
