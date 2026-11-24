/**
 * Recipes, repairs and salvage (docs/dev/crafting.md, from the handoff's Craft, Repair and Salvage
 * columns). A recipe is made in the Workshop on the surface, from the stash, at once; a `field`
 * recipe can also be made below, with the field crafting kit worn. Firearms and ammunition are
 * never crafted. A recipe is available once every ingredient of it is discovered.
 */

export interface Ingredient {
	item: string;
	count: number;
}

export interface Recipe {
	/** The recipe's id: what it makes, unless one item has two recipes. */
	id: string;
	makes: string;
	/** How many one craft makes (throwing knives, bolts and pitons: three). */
	count: number;
	/** Can be made below, with the kit (else only in the Workshop). */
	field: boolean;
	ingredients: Ingredient[];
	/**
	 * Experience for making it below (docs/dev/progression.md#crafting): 5 a simple field craft, 10
	 * a bigger one. The Workshop pays only the first time each recipe is made.
	 */
	xp: number;
	/**
	 * Taught by a quest, not found: it never shows in the Library or the Workshop, and is known
	 * only to explorers a quest has taught it (QuestDef.teachesRecipes). Field only.
	 */
	learned?: boolean;
}

const of = (spec: Record<string, number>): Ingredient[] =>
	Object.entries(spec).map(([item, count]) => ({ item, count }));

function recipe(
	makes: string,
	ingredients: Record<string, number>,
	field = false,
	count = 1,
	xp = field ? 10 : 0
): Recipe {
	return { id: makes, makes, count, field, ingredients: of(ingredients), xp };
}

export const RECIPES: Recipe[] = [
	// The Workshop only.
	recipe('knife', { metal: 1, leather: 1 }),
	recipe('hatchet', { metal: 2, wood: 1 }),
	recipe('short-spear', { wood: 2, metal: 1 }),
	recipe('crossbow', { wood: 3, metal: 2, twine: 3 }),
	recipe('slingshot', { wood: 1, rubber: 1, leather: 1 }),
	recipe('coat', { rags: 6, twine: 2 }),
	recipe('jerkin', { leather: 6, twine: 3 }),
	recipe('crafting-kit', { leather: 1, twine: 1, metal: 1 }),
	recipe('kneepads', { leather: 2, twine: 1 }),
	recipe('overshoes', { rags: 3, twine: 1 }),
	recipe('gloves', { leather: 2, twine: 1 }),
	recipe('rope-bundle', { 'rope-length': 8 }),
	recipe('lockpicks', { metal: 1, nails: 2 }),
	// In the field too.
	recipe('nail-club', { wood: 1, nails: 4 }, true),
	recipe('throwing-knives', { metal: 2 }, true, 3),
	recipe('oil-bottle', { 'glass-bottle': 1, 'lamp-oil': 1, rags: 1 }, true),
	recipe('bolts', { wood: 1, nails: 2 }, true, 3, 5),
	recipe('bandage', { rags: 2 }, true, 1, 5),
	recipe('pitons', { metal: 2 }, true, 3),
	recipe('snare', { 'rope-length': 1, metal: 1 }, true),
	recipe('tripwire-bell', { twine: 2, nails: 2 }, true),
	recipe('blessed-salt', { 'rock-salt': 1, 'holy-water': 1 }, true),
	recipe('candle', { wax: 2, twine: 1 }, true, 1, 5),
	// Taught by a quest (docs/dev/quests.md), never in the Library: made below only.
	{
		...recipe(
			'quarrymans-charge',
			{ 'powder-flask': 1, firecrackers: 1, 'lamp-oil': 1, twine: 1 },
			true,
			1,
			10
		),
		learned: true
	}
];

/** What mending each thing takes (plus coin: CRAFT.repairShare of its price, by the wear). */
export const REPAIRS: Record<string, Ingredient[]> = {
	knife: of({ metal: 1 }),
	crowbar: of({ metal: 1 }),
	hatchet: of({ metal: 1 }),
	'trench-spade': of({ wood: 1, metal: 1 }),
	'short-spear': of({ wood: 1 }),
	'nail-club': of({ nails: 2 }),
	pickaxe: of({ wood: 1, metal: 2 }),
	sledgehammer: of({ wood: 1, metal: 2 }),
	revolver: of({ 'gun-oil': 1 }),
	shotgun: of({ 'gun-oil': 1, 'gun-parts': 1 }),
	rifle: of({ 'gun-oil': 1, 'gun-parts': 1 }),
	derringer: of({ 'gun-oil': 1 }),
	crossbow: of({ twine: 2, wood: 1 }),
	slingshot: of({ rubber: 1 }),
	coat: of({ rags: 2, twine: 1 }),
	jerkin: of({ leather: 2, twine: 1 }),
	'crafting-kit': of({ leather: 1 }),
	kneepads: of({ leather: 1 }),
	overshoes: of({ rags: 2 }),
	gloves: of({ leather: 1 }),
	'tripwire-bell': of({ twine: 1 }),
	// A fill of the censer.
	censer: of({ 'lamp-oil': 1 })
};

/** What breaking each thing down gives. Salvage gives materials, never discoveries. */
export const SALVAGE: Record<string, Ingredient[]> = {
	knife: of({ metal: 1 }),
	crowbar: of({ metal: 2 }),
	hatchet: of({ metal: 1, wood: 1 }),
	'trench-spade': of({ metal: 1, wood: 1 }),
	'short-spear': of({ wood: 1, metal: 1 }),
	'nail-club': of({ wood: 1, nails: 2 }),
	pickaxe: of({ metal: 2, wood: 1 }),
	sledgehammer: of({ metal: 2, wood: 1 }),
	'throwing-knives': of({ metal: 1 }),
	revolver: of({ 'gun-parts': 1, metal: 1 }),
	shotgun: of({ 'gun-parts': 1, wood: 1, metal: 1 }),
	rifle: of({ 'gun-parts': 2, wood: 1 }),
	derringer: of({ 'gun-parts': 1 }),
	crossbow: of({ wood: 2, metal: 1, twine: 1 }),
	slingshot: of({ wood: 1, rubber: 1 }),
	coat: of({ rags: 3, twine: 1 }),
	jerkin: of({ leather: 3, twine: 1 }),
	'crafting-kit': of({ leather: 1, metal: 1 }),
	kneepads: of({ leather: 1 }),
	overshoes: of({ rags: 2 }),
	gloves: of({ leather: 1 }),
	compass: of({ metal: 1, 'glass-bottle': 1 }),
	lockpicks: of({ metal: 1 }),
	snare: of({ 'rope-length': 1 }),
	// Unpicked into its strands (worth what the length is: no recipe makes rope from twine).
	'rope-length': of({ twine: 2 }),
	'tripwire-bell': of({ twine: 1, nails: 1 }),
	censer: of({ metal: 2 }),
	whistle: of({ metal: 1 }),
	candle: of({ wax: 1 })
};

export const CRAFT = {
	/** Repairs cost this share of the item's price in coin, by how worn it is, besides materials. */
	repairShare: 0.2,
	/** Rope salvages into one rope length per this many metres left (packs and bundles). */
	ropePerLength: 5,
	/** Field crafting: kneeling this long, heard `noise` away every `every` seconds, in light. */
	field: { seconds: 6, noise: 4, every: 2 },
	/** A field repair with the kit gives back this share of one item's wear. */
	fieldRepair: 0.3
};
