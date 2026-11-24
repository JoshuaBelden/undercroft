import {
	BODIES,
	OPTIONAL_SLOTS,
	TINT_PARTS,
	TINTS,
	WEAR,
	WEAR_SLOTS,
	type BodyId,
	type TintPart,
	type WearId,
	type WearSlot
} from '../../content/player/wardrobe.ts';

/**
 * How a player's explorer looks: the body, its face, what is worn in each slot, and the colour
 * of each tintable part (swatch ids from `TINTS`). Saved on the explorer, sent with the player so
 * everyone draws them the same. See docs/dev/player.md#the-look.
 */
export interface Look {
	body: BodyId;
	/** 0 is the body's own face; n is its shape key `face-<n>`. */
	face: number;
	wear: Partial<Record<WearSlot, WearId>>;
	tints: Partial<Record<TintPart, string>>;
}

export const DEFAULT_LOOK: Look = {
	body: 'male',
	face: 0,
	wear: { hair: 'hair-short', shirt: 'shirt', pants: 'pants-cargo' },
	tints: { skin: 'light' }
};

/**
 * A look from anything (a request, a saved document, a snapshot): nothing at all is the default
 * look; within one, unknown bodies, faces, pieces
 * and colours fall back to the default, a piece in the wrong slot is dropped, and a required slot
 * left empty gets the default's piece.
 */
export function cleanLook(raw: unknown): Look {
	if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_LOOK);
	const r = raw as Record<string, unknown>;
	const body =
		typeof r.body === 'string' && r.body in BODIES ? (r.body as BodyId) : DEFAULT_LOOK.body;
	const faces = BODIES[body].faces;
	const face =
		typeof r.face === 'number' && Number.isInteger(r.face) && r.face >= 0 && r.face < faces
			? r.face
			: 0;
	const rawWear = (r.wear && typeof r.wear === 'object' ? r.wear : {}) as Record<string, unknown>;
	const wear: Look['wear'] = {};
	for (const slot of WEAR_SLOTS) {
		const id = rawWear[slot];
		if (typeof id === 'string' && id in WEAR && WEAR[id as WearId].slot === slot) {
			wear[slot] = id as WearId;
		} else if (!OPTIONAL_SLOTS.has(slot) && DEFAULT_LOOK.wear[slot]) {
			wear[slot] = DEFAULT_LOOK.wear[slot];
		}
	}
	const rawTints = (r.tints && typeof r.tints === 'object' ? r.tints : {}) as Record<
		string,
		unknown
	>;
	const tints: Look['tints'] = {};
	for (const part of TINT_PARTS) {
		const id = rawTints[part];
		if (typeof id === 'string' && TINTS[part].some((s) => s.id === id)) tints[part] = id;
	}
	return { body, face, wear, tints };
}

/**
 * A look picked at random (`random` gives 0..1): any body, face and pieces, and any colours. For
 * the admin panel's Random look.
 */
export function randomLook(random: () => number): Look {
	const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length) % list.length];
	const body = pick(Object.keys(BODIES) as BodyId[]);
	const wear: Look['wear'] = {};
	for (const slot of WEAR_SLOTS) {
		const pieces = (Object.keys(WEAR) as WearId[]).filter((id) => WEAR[id].slot === slot);
		const choice = pick(OPTIONAL_SLOTS.has(slot) ? [null, ...pieces] : pieces);
		if (choice) wear[slot] = choice;
	}
	const tints: Look['tints'] = {};
	for (const part of TINT_PARTS) tints[part] = pick(TINTS[part]).id;
	return {
		body,
		face: Math.floor(random() * BODIES[body].faces) % BODIES[body].faces,
		wear,
		tints
	};
}

/** The swatch a part is tinted with: its chosen one, or its palette's first. */
export function tintOf(look: Look, part: TintPart): string | null {
	const palette = TINTS[part];
	return (palette.find((s) => s.id === look.tints[part]) ?? palette[0]).color;
}
