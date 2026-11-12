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
}

export const ITEM_FRAMES: Record<string, ItemFrame> = {
	// Muzzle at -X, stock drooping at +X.
	shotgun: { forward: '-x', up: '+y', length: 1.0, grip: [0.3, 0.5] },
	// Muzzle at -X, grip hanging down at +X.
	revolver: { forward: '-x', up: '+y', length: 0.26, grip: [0.2, 0.55] },
	// Lies flat: blade toward -X, spine toward +Z.
	knife: { forward: '-x', up: '+z', length: 0.3, grip: [0.3, 0.5] },
	// Stands on end: hook at +Y, curling toward +X.
	crowbar: { forward: '+y', up: '+x', length: 0.78, grip: [0.29, 0.28] },
	// Lies on its broad face.
	brick: { forward: '-x', up: '+z', length: 0.22, grip: [0.5, 0.5] },
	// A stoppered bottle standing upright (tallest along +Y). Its depth along Z is scaled to
	// 3.5 cm, which makes it about 9 cm tall; held round its middle.
	salts: { forward: '-z', up: '+y', length: 0.035, grip: [0.5, 0.4] },
	// Upright (tallest along +Y). Its depth along Z is scaled to 5.3 cm, which makes it about
	// 8 cm tall and 6 cm wide; held round its middle.
	bandage: { forward: '-z', up: '+y', length: 0.053, grip: [0.5, 0.5] }
};
