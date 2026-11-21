/**
 * How raw item models in art/export/items are stood up into the game's item frame.
 * Run `pnpm asset:build` after changing this. See docs/dev/asset-pipeline.md.
 *
 * The game expects an item with its grip at the origin, pointing forward (-Z in the built file,
 * +Y in Blender), top up, at real size. Models built by scripts/blender/items.py already are, and
 * need no entry here. A model from elsewhere (sculpted or generated: centred, any way round, any
 * size) gets an entry saying which way it faces in its file and how big it should be.
 */

export type Axis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export interface ItemFrame {
	/** The direction in the raw file that the business end points: muzzle, blade tip, hook. */
	forward: Axis;
	/** The direction in the raw file that is the item's top (a gun's sights, a blade's spine). */
	up: Axis;
	/** Length along `forward` in the game, in metres. The model is scaled to it. */
	length: number;
	/**
	 * Where the hand goes, which becomes the origin: [from the back end, from the bottom], each
	 * 0..1 of the model's length and height.
	 */
	grip: [number, number];
	/**
	 * For a model lying askew in its file (not square to any axis): turned this many degrees about
	 * one of its axes first, counterclockwise looking down that axis. `forward` and `up` are then
	 * read from the model as turned.
	 */
	tilt?: { axis: Axis; degrees: number };
}

export const ITEM_FRAMES: Record<string, ItemFrame> = {
	// Muzzle at -X, stock drooping at +X.
	shotgun: { forward: '-x', up: '+y', length: 1.0, grip: [0.3, 0.5] },
	// Muzzle at -X, grip hanging down at +X.
	revolver: { forward: '-x', up: '+y', length: 0.26, grip: [0.2, 0.55] },
	// Lies flat: blade toward -X, edge toward +Z (so its top, the spine, is -Z).
	knife: { forward: '-x', up: '-z', length: 0.3, grip: [0.3, 0.5] },
	// Stands on end: hook at +Y, curling toward +X. Held with the claw curling down, so its top is
	// -X; the grip is measured from that bottom, so 0.72 is the same spot on the shaft as before.
	crowbar: { forward: '+y', up: '-x', length: 0.78, grip: [0.29, 0.72] },
	// Lies on its broad face.
	brick: { forward: '-x', up: '+z', length: 0.22, grip: [0.5, 0.5] },
	// A stoppered bottle standing upright (tallest along +Y). Its depth along Z is scaled to
	// 3.5 cm, which makes it about 9 cm tall; held round its middle.
	salts: { forward: '-z', up: '+y', length: 0.035, grip: [0.5, 0.4] },
	// Upright (tallest along +Y). Its depth along Z is scaled to 5.3 cm, which makes it about
	// 8 cm tall and 6 cm wide; held round its middle.
	bandage: { forward: '-z', up: '+y', length: 0.053, grip: [0.5, 0.5] },
	// A stick lying along X. About 8 cm long; pinched a little behind the middle.
	chalk: { forward: '-x', up: '+y', length: 0.08, grip: [0.35, 0.5] },
	// A fat dry cell lying along Z, its + terminal toward +Z. About 9 cm long; held round its middle.
	battery: { forward: '+z', up: '+y', length: 0.09, grip: [0.5, 0.5] },
	// A bound pack of rope, longest along X. About 45 cm across; held round its middle.
	rope_pack: { forward: '-x', up: '+y', length: 0.45, grip: [0.5, 0.5] },
	// A loose heap of rope lying flat. About 50 cm across; held from the middle.
	rope_bundle: { forward: '-z', up: '+y', length: 0.5, grip: [0.5, 0.5] },
	// A medical case standing on its edge, longest along X. About 28 cm wide; held by its top.
	medkit: { forward: '-x', up: '+y', length: 0.28, grip: [0.5, 0.85] },
	// A field book lying flat on its back cover, longest along X. About 18 cm; held in the middle.
	notebook: { forward: '-x', up: '+y', length: 0.18, grip: [0.5, 0.5] },
	// An old iron key lying flat, longest along X. About 12 cm long; held by its bow.
	key: { forward: '-x', up: '+y', length: 0.12, grip: [0.2, 0.5] },
	// A round pendant facing +Z (thin along Z): its face is its top, so it lies flat. About 7 cm.
	pendant: { forward: '+y', up: '+z', length: 0.07, grip: [0.5, 0.5] },

	// The gear, crafting and loot round's generated models: each 1.9 m along its longest side.
	// Stands on end, head at +Y, the edge toward -X: held edge down, like the crowbar's claw.
	hatchet: { forward: '+y', up: '+x', length: 0.45, grip: [0.15, 0.6] },
	// Lies along X, the blade at -X, flat in the XZ plane: carried with the blade flat.
	trench_spade: { forward: '-x', up: '+y', length: 0.75, grip: [0.12, 0.5] },
	// Stands on end, the head at +Y, flat in the XY plane.
	short_spear: { forward: '+y', up: '+z', length: 1.4, grip: [0.3, 0.5] },
	// Stands on end, the studded head at +Y.
	nail_club: { forward: '+y', up: '+z', length: 0.65, grip: [0.15, 0.5] },
	// The haft along Z, the head at +Z: the pick's point at -X, the broad end at +X. Point down.
	pickaxe: { forward: '+z', up: '+x', length: 0.85, grip: [0.15, 0.5] },
	// Leans about 37° off upright in its file (the head up and to -X): stood up first, then like
	// the club, a face of the head down.
	sledgehammer: {
		forward: '+y',
		up: '+x',
		length: 0.9,
		grip: [0.12, 0.5],
		tilt: { axis: '+z', degrees: -37 }
	},
	// The stock along X, the prod and stirrup at -X, the string's side up.
	crossbow: { forward: '-x', up: '+y', length: 0.8, grip: [0.3, 0.45] },
	// Upright, the rag at the neck (+Y). Its depth along Z is scaled to 9 cm, which makes it
	// about 24 cm tall; held round its middle.
	oil_bottle: { forward: '-z', up: '+y', length: 0.09, grip: [0.5, 0.4] },
	// Stands on end, the point at -Y, the wrapped grip at +Y.
	throwing_knives: { forward: '-y', up: '+x', length: 0.24, grip: [0.3, 0.5] },
	// The fork up (+Y), the pouch hanging back toward -Z: shoots toward +Z. 18 cm deep (about
	// 22 cm tall); held by the handle, at the front and bottom.
	slingshot: { forward: '+z', up: '+y', length: 0.18, grip: [0.75, 0.2] },
	// A stake lying along X, the wire loop out to -Z. About 30 cm long.
	snare: { forward: '-x', up: '+y', length: 0.3, grip: [0.5, 0.5] },
	// A bell on a coil of line, lying flat, longest along X. About 25 cm across.
	tripwire_bell: { forward: '-x', up: '+y', length: 0.25, grip: [0.5, 0.5] },
	// A ring of crackers lying flat. About 15 cm across.
	firecrackers: { forward: '-z', up: '+y', length: 0.15, grip: [0.5, 0.5] },
	// A paper parcel lying flat. About 14 cm deep.
	bait: { forward: '-z', up: '+y', length: 0.14, grip: [0.5, 0.5] },
	// The mouthpiece toward +Z, held toward you. About 6 cm long.
	whistle: { forward: '-z', up: '+y', length: 0.06, grip: [0.5, 0.5] },
	// Lying open, the lid standing up at -Z. About 10 cm, lid and all; held by the case.
	pocket_compass: { forward: '-z', up: '+y', length: 0.1, grip: [0.7, 0.3] },
	// The muzzle at -X, the sights up, the sling hanging under it. About 1.1 m; held at the wrist
	// of the stock, behind the trigger.
	rifle: { forward: '-x', up: '+y', length: 1.1, grip: [0.3, 0.5] },
	// The barrels at -X, the grip hanging down at +X. About 13 cm; held round the grip.
	derringer: { forward: '-x', up: '+y', length: 0.13, grip: [0.15, 0.4] },
	// An open cloth roll lying flat, its tab out to +Z. About 15 cm long.
	lockpicks: { forward: '-z', up: '+y', length: 0.15, grip: [0.5, 0.5] },
	// A few spikes lying flat on a ring, the points toward +Z. About 18 cm; held by the eyes.
	piton: { forward: '+z', up: '+y', length: 0.18, grip: [0.25, 0.5] },
	// A stick lying along X, its cap at -X. About 15 cm; held round its middle.
	glow_sticks: { forward: '-x', up: '+y', length: 0.15, grip: [0.5, 0.5] },
	// A square bottle standing upright, its cork at +Y. Its depth along Z is scaled to 3.3 cm,
	// which makes it about 12 cm tall; held round its middle.
	laudanum: { forward: '-z', up: '+y', length: 0.033, grip: [0.5, 0.4] },
	// A jar lying on its side, spilling earth toward +Z, the lid beside it. About 16 cm, spill
	// and all.
	grave_dirt: { forward: '-z', up: '+y', length: 0.16, grip: [0.5, 0.5] },
	// A tied sack lying flat, salt spilling from its mouth toward +Z. About 20 cm, spill and all.
	salt_bag: { forward: '-z', up: '+y', length: 0.2, grip: [0.5, 0.5] },
	// A censer lying on its side in its file, the lid toward -Z and the point toward +Z, its chain
	// out to -X: stood up (its top -Z) and held hanging. Its diameter along Y is scaled to 13 cm,
	// which makes it about 22 cm tall.
	censer: { forward: '+y', up: '-z', length: 0.13, grip: [0.5, 0.9] }
};
