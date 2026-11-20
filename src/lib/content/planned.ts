/**
 * Art that is planned but not made yet: every asset the gear, crafting and loot round needs (the
 * art list in docs/handoff-gear-crafting-loot.md#art-assets), named here before anything uses it.
 * The admin Art & Assets page lists each one as Placeholder (a model drawn as a box, a clip held
 * as a pose) or Missing (a picture, a sound, a map piece) until the real file is there, so what is
 * left to make is always on that page. See docs/dev/admin.md#art-and-assets.
 *
 * A planned asset drops off the list by itself once the real one exists under the same name: a
 * built picture (`art/images/<id>.png`), a model (`static/assets/<id>.glb`), a map piece, a sound
 * in `SOUNDS`, a clip in the explorer's model. Once the content names it (an item's `image`, a
 * sound's `file`), take its line out of here.
 */

/** What kind of file it will be. */
export type PlannedKind = 'image' | 'model' | 'piece' | 'animation' | 'sound';

export interface PlannedAsset {
	kind: PlannedKind;
	/**
	 * The name it will have: a picture's name in art/images, a model's path under static/assets
	 * (no hash, `shared/items/hatchet.glb`), a map piece's kit name, an explorer clip, a sound id.
	 */
	id: string;
	/** What it is, for the list ("Hatchet", "Wall niche, open and sealed"). */
	label: string;
	/** Which group of the art list it is in. */
	group: string;
	/** The first phase of the handoff that needs it: start with the lowest. */
	phase: number;
}

/** Shorthand for a group of one kind of asset. */
function group(
	kind: PlannedKind,
	name: string,
	phase: number,
	entries: [id: string, label: string][]
): PlannedAsset[] {
	return entries.map(([id, label]) => ({ kind, id, label, group: name, phase }));
}

const item = (id: string): string => `shared/items/${id}.glb`;
const prop = (id: string): string => `shared/props/${id}.glb`;

export const PLANNED_ASSETS: PlannedAsset[] = [
	// Item pictures: the stash, loadout, store, Workshop, Library and pack.
	...group('image', 'Materials', 2, [
		['lamp_oil', 'Lamp oil'],
		['rock_salt', 'Rock salt'],
		['holy_water', 'Holy water'],
		['bone', 'Bone'],
		['gun_oil', 'Gun oil'],
		['gun_parts', 'Gun parts']
	]),
	...group('image', 'Treasure', 2, [
		['silver_snuffbox', 'Silver snuffbox'],
		['jet_rosary', 'Jet rosary'],
		['cameo_brooch', 'Cameo brooch'],
		['funeral_coin', 'Funeral coin (obol)'],
		['apothecary_jar', 'Apothecary jar'],
		['military_medal', 'Military medal'],
		['tarot_deck', 'Tarot deck'],
		['uncut_garnet', 'Uncut garnet'],
		['black_candle', 'Black candle'],
		['key_ring', "Custodian's key ring"],
		['saints_icon', "Painted saint's icon"],
		['keepers_ledger', "Ossuary keeper's ledger"],
		['brass_astrolabe', 'Brass astrolabe'],
		['porcelain_doll', 'Porcelain doll'],
		['crozier_head', "Bishop's crozier head"],
		['sealed_reliquary_jar', 'Sealed reliquary jar']
	]),
	...group('image', 'Melee weapons', 6, [
		['hatchet', 'Hatchet'],
		['trench_spade', 'Trench spade'],
		['short_spear', 'Short spear'],
		['nail_club', 'Nail-studded club'],
		['pickaxe', 'Pickaxe'],
		['sledgehammer', 'Sledgehammer'],
		['throwing_knives', 'Throwing knives']
	]),
	...group('image', 'Ranged weapons and ammo', 6, [
		['bolt_action_rifle', 'Bolt-action rifle'],
		['derringer', 'Derringer'],
		['crossbow', 'Crossbow'],
		['slingshot', 'Slingshot'],
		['oil_bottle', 'Oil bottle'],
		['rifle_rounds', 'Rifle rounds'],
		['crossbow_bolts', 'Crossbow bolts'],
		['pebbles', 'Pebbles']
	]),
	...group('image', 'Defense and gear', 6, [
		['leather_jerkin', 'Leather jerkin'],
		['field_crafting_kit', 'Field crafting kit'],
		['kneepads', 'Kneepads'],
		['felt_overshoes', 'Felt overshoes'],
		['gloves', 'Gloves'],
		['pocket_compass', 'Pocket compass']
	]),
	...group('image', 'Quick use', 6, [
		['laudanum', 'Laudanum'],
		['glow_sticks', 'Glow sticks'],
		['climbing_pitons', 'Climbing pitons'],
		['lockpicks', 'Lockpicks'],
		['snare', 'Snare'],
		['tripwire_bell', 'Tripwire bell'],
		['blessed_salt', 'Blessed salt'],
		['firecrackers', 'Firecrackers'],
		['bait', 'Bait'],
		['grave_dirt', 'Grave dirt'],
		['incense_censer', 'Incense censer'],
		['whistle', 'Whistle'],
		['recipe_fragment', 'Recipe fragment']
	]),

	// Item models, in the hand and on the floor. Materials and treasure stay boxes on the floor.
	...group('model', 'Item models', 4, [
		[item('hatchet'), 'Hatchet (one hand)'],
		[item('nail-club'), 'Nail-studded club (one hand)'],
		[item('throwing-knife'), 'Throwing knife (one hand)'],
		[item('derringer'), 'Derringer (one hand)'],
		[item('slingshot'), 'Slingshot (one hand)'],
		[item('trench-spade'), 'Trench spade (two hands)'],
		[item('short-spear'), 'Short spear (two hands)'],
		[item('pickaxe'), 'Pickaxe (two hands)'],
		[item('sledgehammer'), 'Sledgehammer (two hands)'],
		[item('rifle'), 'Bolt-action rifle (two hands)'],
		[item('crossbow'), 'Crossbow (two hands)'],
		[item('crossbow-bolt'), 'Crossbow bolt'],
		[item('oil-bottle'), 'Oil bottle, with a rag'],
		[item('firecrackers'), 'Firecrackers'],
		[item('glow-stick'), 'Glow stick'],
		[item('snare'), 'Snare'],
		[item('tripwire-bell'), 'Tripwire bell'],
		[item('salt-bag'), 'Blessed salt bag'],
		[item('bait'), 'Bait']
	]),
	...group('model', 'Item models', 5, [[item('piton'), 'Climbing piton']]),
	...group('model', 'Item models', 6, [
		[item('lockpicks'), 'Lockpicks'],
		[item('censer'), 'Incense censer'],
		[item('whistle'), 'Whistle'],
		[item('laudanum'), 'Laudanum bottle'],
		[item('grave-dirt'), 'Grave dirt pouch'],
		[item('compass'), 'Pocket compass']
	]),
	...group('model', 'Item models', 7, [
		[item('crafting-kit'), 'Field crafting kit (closed, and open on the floor)']
	]),

	// Lootables: each with its states, like the crate and trunk.
	...group('model', 'Lootables', 2, [
		[prop('wall-niche'), 'Wall niche: open, sealed, emptied'],
		[prop('bone-pile'), 'Bone pile: whole, rummaged'],
		[prop('sarcophagus'), 'Sarcophagus: lid on, pushed aside'],
		[prop('tool-chest'), "Quarrymen's tool chest: closed, pried open"],
		[prop('locker'), "Workman's locker: closed, open"],
		[prop('sunken-satchel'), 'Sunken satchel: closed, open'],
		[prop('offering-box'), 'Offering box: locked, opened, smashed'],
		[prop('vestry-cabinet'), 'Vestry cabinet: closed, open'],
		[prop('font'), 'Font: full, empty'],
		[prop('rat-nest'), 'Rat nest'],
		[prop('webbed-cocoon'), 'Webbed cocoon: whole, cut open'],
		[prop('smuggler-brick'), "Smuggler's brick: in place, pulled out"],
		[prop('surveyor-cache'), "Surveyor's cache: closed, open"],
		[prop('reliquary-alcove'), 'Reliquary alcove: grille shut, pried open']
	]),
	...group('model', 'Lootables', 3, [[prop('mausoleum-gate'), 'Mausoleum gate: shut, open']]),

	// The world: what stands in the way, and what is left behind.
	...group('model', 'World', 4, [
		[prop('salt-line'), 'Salt line (decal)'],
		[prop('fire-patch'), 'Fire patch (effect)']
	]),
	...group('model', 'World', 5, [
		[prop('spider-web'), 'Spider web across an arch: whole, cut'],
		[prop('rubble-wall'), 'Breakable rubble wall: whole, broken'],
		[prop('piton-anchor'), 'Piton anchor in rock, with rope tied'],
		[prop('chalk-sign'), "Smuggler's chalk sign (decal)"]
	]),
	...group('model', 'World', 8, [
		[prop('training-dummy'), 'Training dummy'],
		[prop('dummy-track'), 'Dummy track, with a moving dummy']
	]),

	// Map pieces, each with its crate and lootable markers (the new rooms are built: rooms.py).
	...group('piece', 'Rumors', 8, [
		['rumors-start', 'Rumors: the start room'],
		['rumors-way-in', 'Rumors: the way in (tutorial stops)'],
		['rumors-vault', 'Rumors: the training vault']
	]),

	// Explorer clips, beside the holding and using clips in explorer-clips.glb.
	...group('animation', 'Explorer clips', 2, [
		['search', 'Searching, reaching in (niches, nests)'],
		['pry', 'Prying (chests, stashes, alcoves)'],
		['push-lid', 'Pushing a lid (sarcophagus)'],
		['cut', 'Cutting (cocoons, webs)'],
		['fill-bottle', 'Filling a bottle (fonts)']
	]),
	...group('animation', 'Explorer clips', 4, [
		['spear-thrust', 'Spear thrust'],
		['spade-sweep', 'Wide spade sweep'],
		['sledge-swing', 'Two-handed sledge swing'],
		['crank-crossbow', 'Cranking a crossbow'],
		['work-bolt', 'Working a rifle bolt'],
		['lay-salt', 'Laying salt'],
		['set-snare', 'Setting a snare']
	]),
	...group('animation', 'Explorer clips', 5, [['hammer-piton', 'Hammering a piton']]),
	...group('animation', 'Explorer clips', 7, [
		['field-craft', 'Field crafting: kneel and work (looping)']
	]),

	// Sounds, by the id they will have in SOUNDS.
	...group('sound', 'Items', 1, [
		['item.repair', 'An item repaired'],
		['item.salvage', 'An item salvaged into materials']
	]),
	...group('sound', 'Lootables', 2, [
		['lootable.offering.smash', 'An offering box smashed'],
		['lootable.font', 'Filling a bottle at a font'],
		['gate.mausoleum', 'The mausoleum gate']
	]),
	...group('sound', 'Melee', 4, [
		['hatchet.swing', 'Hatchet swing'],
		['hatchet.hit', 'Hatchet hit'],
		['spade.swing', 'Trench spade swing'],
		['spade.hit', 'Trench spade hit'],
		['spear.thrust', 'Spear thrust'],
		['spear.hit', 'Spear hit'],
		['club.swing', 'Club swing'],
		['club.hit', 'Club hit'],
		['pickaxe.swing', 'Pickaxe swing'],
		['pickaxe.hit', 'Pickaxe hit'],
		['sledge.swing', 'Sledgehammer swing'],
		['sledge.hit', 'Sledgehammer hit'],
		['throwingKnife.throw', 'Throwing knife thrown'],
		['throwingKnife.land', 'Throwing knife lands']
	]),
	...group('sound', 'Ranged', 4, [
		['rifle.shot', 'Rifle shot'],
		['rifle.bolt', 'Rifle bolt worked'],
		['rifle.load', 'Rifle round loaded'],
		['derringer.shot', 'Derringer shot'],
		['derringer.reload', 'Derringer reload'],
		['crossbow.shot', 'Crossbow twang (quiet)'],
		['crossbow.crank', 'Crossbow cranked'],
		['crossbow.hit', 'Crossbow bolt hits'],
		['slingshot.shot', 'Slingshot snap'],
		['pebble.land', 'Pebble lands'],
		['oilBottle.light', 'Oil bottle lit'],
		['oilBottle.throw', 'Oil bottle thrown'],
		['oilBottle.shatter', 'Oil bottle shatters']
	]),
	...group('sound', 'Utility', 4, [
		['firecrackers.fuse', 'Firecracker fuse'],
		['firecrackers.bang', 'Firecrackers going off'],
		['salt.pour', 'Salt poured'],
		['glowstick.crack', 'Glow stick cracked']
	]),
	...group('sound', 'World', 5, [
		['rubble.break', 'Rubble breaking'],
		['web.tear', 'A web torn'],
		['web.burn', 'A web burning'],
		['piton.hammer', 'A piton hammered in'],
		['brick.scrape', "A smuggler's brick scraping"]
	]),
	...group('sound', 'Items with a use', 6, [
		['whistle.blow', 'Whistle'],
		['tripwire.ring', 'Tripwire bell rings'],
		['censer.swing', 'Censer swinging'],
		['laudanum.drink', 'Laudanum'],
		['compass.open', 'Compass opened'],
		['doll.phantom', "The doll's phantom sounds"],
		['tarot.draw', 'A tarot card drawn']
	]),
	...group('sound', 'Hub', 7, [
		['workshop.repair', 'Workshop: repair'],
		['workshop.craft', 'Workshop: craft'],
		['workshop.salvage', 'Workshop: salvage'],
		['store.tier', 'A store tier unlocked']
	]),
	...group('sound', 'Crafting', 7, [['craft.field', 'Field crafting (loop)']]),
	...group('sound', 'Rumors', 8, [
		['dummy.hit', 'Training dummy hit'],
		['dummy.reset', 'Training dummy resets'],
		['dummy.track', 'The dummy track running']
	])
];
