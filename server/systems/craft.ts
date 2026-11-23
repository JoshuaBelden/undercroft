import { ITEMS } from '../../src/lib/content/items.ts';
import { CRAFT, RECIPES, REPAIRS } from '../../src/lib/content/recipes.ts';
import { hasIngredients, recipeStatus } from '../../src/lib/shared/items/crafting.ts';
import { addWear, lasting, wearOf } from '../../src/lib/shared/items/durability.ts';
import {
	addItem,
	carriedCount,
	getSlot,
	newStack,
	removeItem,
	sanitizeRef,
	workingGear
} from '../../src/lib/shared/items/inventory.ts';
import type { SlotRef } from '../../src/lib/shared/items/types.ts';
import { headlampOutput } from '../../src/lib/shared/player/headlamp.ts';
import type { ItemStack } from '../../src/lib/shared/player/types.ts';
import { log } from '../log.ts';
import { TICK_DT, type Player, type SessionContext, type SessionSystem } from './system.ts';

/** What a player is kneeling over: a recipe to make, or a slot to mend. */
type Work = { recipe: string } | { repair: SlotRef };

/**
 * Field crafting (docs/dev/crafting.md#field-crafting): with the field crafting kit worn, a field
 * recipe they have discovered all of, and its materials carried, a player kneels for
 * CRAFT.field.seconds, heard a little, in light, and it goes into their pack. Or they mend one
 * thing a share of the way (CRAFT.fieldRepair), with its materials. Each is a use of the kit.
 * Moving, the dark or the kit failing stops it.
 */
export class CraftSystem implements SessionSystem {
	private work = new Map<string, Work>();

	constructor(private ctx: SessionContext) {}

	/** Start making a recipe, or mending a slot (the `craft` message). Refused, nothing happens. */
	start(player: Player, raw: { recipe?: unknown; repair?: unknown }): void {
		const s = player.state;
		if (s.downed || s.dead || s.extracted || s.swimming || s.crafting > 0) return;
		if (!this.kit(player)) return;
		if (typeof raw.recipe === 'string') {
			const recipe = RECIPES.find((r) => r.id === raw.recipe);
			const learned = this.ctx.systems.quests.learned(player);
			if (!recipe?.field || recipeStatus(recipe, player.discovered, learned) !== 'available')
				return;
			if (!hasIngredients(recipe, (item) => carriedCount(s.inventory, item))) return;
			this.begin(player, { recipe: recipe.id }, recipe.makes);
			return;
		}
		const ref = sanitizeRef(raw.repair);
		const stack = ref ? getSlot({ inventory: s.inventory }, ref) : null;
		if (!ref || !stack || !this.mendable(player, stack)) return;
		this.begin(player, { repair: ref }, stack.item);
	}

	/** Stop (the `stopCraft` message, or something interrupting). */
	stop(player: Player): void {
		if (!this.work.has(player.id)) return;
		this.work.delete(player.id);
		player.state.crafting = 0;
		player.state.craftingItem = null;
	}

	step(): void {
		const ctx = this.ctx;
		const { seconds, noise, every } = CRAFT.field;
		for (const player of ctx.players.values()) {
			const job = this.work.get(player.id);
			if (!job) continue;
			const s = player.state;
			const input = player.lastInput;
			const moving = !!input && (Math.abs(input.moveX) > 0.01 || Math.abs(input.moveZ) > 0.01);
			if (s.downed || s.dead || s.extracted || moving || !this.kit(player) || !lit(player)) {
				this.stop(player);
				continue;
			}
			const before = s.crafting;
			s.crafting += TICK_DT;
			if (before <= 1e-5 || Math.floor(s.crafting / every) !== Math.floor(before / every)) {
				ctx.creatures.hear([...s.position], noise * s.mods.craftNoise, { id: player.id, state: s });
			}
			if (s.crafting < seconds * s.mods.craftTime) continue;
			this.finish(player, job);
			this.stop(player);
		}
	}

	private begin(player: Player, job: Work, item: string): void {
		this.work.set(player.id, job);
		player.state.crafting = 1e-6;
		player.state.craftingItem = item;
		this.ctx.events.push({
			kind: 'crafting',
			player: player.id,
			position: [...player.state.position]
		});
	}

	/** Done: the materials go, the thing is made (or mended), and the kit wears a use. */
	private finish(player: Player, job: Work): void {
		const ctx = this.ctx;
		const s = player.state;
		const kit = this.kit(player);
		if (!kit) return;
		if ('recipe' in job) {
			const recipe = RECIPES.find((r) => r.id === job.recipe);
			if (!recipe || !hasIngredients(recipe, (item) => carriedCount(s.inventory, item))) return;
			for (const i of recipe.ingredients) removeItem(s.inventory, i.item, i.count);
			const made: ItemStack = { ...newStack(recipe.makes, recipe.count), crafted: true };
			const left = addItem(s.inventory, made);
			if (left > 0) ctx.items.dropAll([{ ...made, count: left }], s.position);
			ctx.send(player, { type: 'crafted', item: recipe.makes, count: recipe.count });
			ctx.experience.crafted(player, recipe);
			ctx.systems.quests.happened({ kind: 'craft', recipe: recipe.id });
			log.info(`${player.name} made ${recipe.makes} below in ${ctx.id.slice(0, 8)}`);
		} else {
			const stack = getSlot({ inventory: s.inventory }, job.repair);
			if (!stack || !this.mendable(player, stack)) return;
			for (const m of REPAIRS[stack.item]) removeItem(s.inventory, m.item, m.count);
			const max = lasting(ITEMS[stack.item])!.max;
			stack.worn = Math.max(0, wearOf(stack) - max * CRAFT.fieldRepair);
			if (stack.worn === 0) delete stack.worn;
			ctx.send(player, { type: 'crafted', item: stack.item, count: 0 });
		}
		if (addWear(kit, s.mods.wear) === 'broke') {
			ctx.events.push({ kind: 'break', item: kit.item, position: [...s.position] });
		}
	}

	/** The working kit they wear, if any. */
	private kit(player: Player): ItemStack | null {
		return workingGear(player.state.inventory).find((stack) => ITEMS[stack.item]?.crafting) ?? null;
	}

	/** Worn, mendable (not the kit itself), with its materials carried. */
	private mendable(player: Player, stack: ItemStack): boolean {
		const materials = REPAIRS[stack.item];
		const last = lasting(ITEMS[stack.item]);
		if (!materials || !last || last.usedUp || wearOf(stack) <= 0 || ITEMS[stack.item]?.crafting) {
			return false;
		}
		return materials.every((m) => carriedCount(player.state.inventory, m.item) >= m.count);
	}

	left(player: Player): void {
		this.work.delete(player.id);
	}

	regenerating(): void {
		this.work.clear();
	}
}

/** Enough light to work by: their own lamp lit. */
function lit(player: Player): boolean {
	return headlampOutput(player.state).on;
}
