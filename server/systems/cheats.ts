import { MAP_KIT } from '../../src/lib/content/map/kit.ts';
import { ITEMS } from '../../src/lib/content/items.ts';
import { MOVEMENT } from '../../src/lib/content/player/movement.ts';
import { addWear, lasting, mend, wreck } from '../../src/lib/shared/items/durability.ts';
import {
	addItem,
	addItemAt,
	allStacksLive,
	canTake,
	EQUIPMENT,
	held,
	newStack,
	sanitizeRef,
	takeStack
} from '../../src/lib/shared/items/inventory.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import { dropSpot, inFront, roomPoints, testPoints } from '../../src/lib/shared/map/points.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import type { ItemStack } from '../../src/lib/shared/player/types.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import type { Player, SessionContext, SessionSystem } from './system.ts';

/**
 * Admin tools for your own explorer (docs/dev/admin.md): flags, items, ammo, conditions and
 * teleporting. Dev mode only, like every admin command.
 */
export class CheatSystem implements SessionSystem {
	constructor(private ctx: SessionContext) {}

	admin = {
		noclip: (player, command) => this.flag(player, command.kind, command.enabled),
		infiniteStamina: (player, command) => this.flag(player, command.kind, command.enabled),
		infiniteBattery: (player, command) => this.flag(player, command.kind, command.enabled),
		godMode: (player, command) => this.flag(player, command.kind, command.enabled),
		infiniteAmmo: (player, command) => this.flag(player, command.kind, command.enabled),
		give: (player, command) => {
			const def = typeof command.item === 'string' ? ITEMS[command.item] : undefined;
			if (!def) return false;
			const to = command.to === undefined ? null : sanitizeRef(command.to);
			if (command.to !== undefined && !to) return false;
			const count = Math.max(1, Math.min(99, Math.floor(Number(command.count) || 1)));
			const inv = player.state.inventory;
			const stack = newStack(command.item, count, def.firearm?.magazine);
			const left = to ? addItemAt(inv, to, stack) : addItem(inv, stack);
			const given = count - left;
			if (given > 0) {
				this.ctx.send(player, {
					type: 'alert',
					alert: { kind: 'item', item: command.item, count: given, source: 'grant' }
				});
			}
			// What didn't fit is said, not dropped or lost without a word.
			if (left > 0) {
				const heavy = canTake(inv, newStack(command.item)) === 'heavy';
				this.ctx.send(player, {
					type: 'alert',
					alert: {
						kind: 'note',
						title: given > 0 ? `Only ${given} of ${count} given` : 'Nothing given',
						line: heavy
							? `${def.name}: too heavy to carry more.`
							: to
								? `${def.name}: no room in that slot.`
								: `${def.name}: no room for it.`
					}
				});
			}
		},
		discard: (player, command) => {
			const from = sanitizeRef(command.from);
			if (!from || !takeStack({ inventory: player.state.inventory }, from, Infinity)) return false;
		},
		emptyInventory: (player) => {
			// Emptied in place: the pack itself (and its size) stays.
			const inv = player.state.inventory;
			for (const slot of EQUIPMENT) inv.equipment[slot] = null;
			inv.backpack.fill(null);
			inv.quick.fill(null);
		},
		refillAmmo: (player) => {
			for (const slot of ['primary', 'secondary'] as const) {
				const stack = player.state.inventory.equipment[slot];
				const gun = stack ? ITEMS[stack.item]?.firearm : undefined;
				if (!stack || !gun) continue;
				stack.loaded = gun.magazine;
				addItem(player.state.inventory, newStack(gun.ammo, gun.magazine * 4));
			}
		},
		wearHeld: (player) => {
			const stack = this.wearable(player);
			const last = stack ? lasting(ITEMS[stack.item]) : null;
			if (!stack || !last) return false;
			addWear(stack, Math.ceil(last.max / 4));
		},
		breakHeld: (player) => {
			const stack = this.wearable(player);
			if (!stack) return false;
			wreck(stack);
		},
		repairAll: (player) => {
			for (const stack of allStacksLive(player.state.inventory)) mend(stack);
		},
		clearConditions: (player) => {
			player.state.conditions = [];
		},
		teleport: (player, command) => {
			const { layout } = this.ctx;
			const at =
				[...roomPoints(layout, PIECES, MAP_KIT), ...testPoints(layout, PIECES)].find(
					(r) => r.name === command.room
				)?.position ?? this.secretPoint(command.room);
			if (!at) return false;
			player.state.position = this.ctx.freeSpot(at);
			player.state.velocity = [0, 0, 0];
		},
		teleportTo: (player, command) => {
			const at = command.position;
			if (!Array.isArray(at) || at.length !== 3 || !at.every(Number.isFinite)) return false;
			const [x, y, z] = at as Vec3;
			const feet: Vec3 = [x, y - eyeHeight(player.state), z];
			const spot = player.state.flags.noclip
				? feet
				: dropSpot(this.ctx.world, feet, MOVEMENT.stances.stand.height, MOVEMENT.radius);
			if (!spot) return false;
			player.state.position = spot;
			player.state.velocity = [0, 0, 0];
		}
	} satisfies SessionSystem['admin'];

	/** What the wear tools work on: what is in the hand if it wears, else what is worn for defense. */
	private wearable(player: Player): ItemStack | null {
		const inv = player.state.inventory;
		return (
			[held(inv), inv.equipment.defense].find((stack) => !!stack && !!lasting(ITEMS[stack.item])) ??
			null
		);
	}

	/**
	 * Teleports only the server can work out: `stuck-crate`, in front of the first jammed crate
	 * (found or not); `tomb`, where the rite is performed and what it leaves is laid to rest;
	 * `lantern`, beside his lantern wherever it lies (docs/dev/quests.md#the-rite).
	 */
	private secretPoint(name: string): Vec3 | null {
		const { crates, items, layout } = this.ctx;
		const placement = (id: string) => layout.crates.find((c) => c.id === id);
		if (name === 'stuck-crate') {
			const jammed = crates.list().find(({ crate }) => crate.lock === 'jammed')?.crate;
			const at = jammed && placement(jammed.id);
			return at ? inFront(at) : null;
		}
		if (name === 'tomb') {
			const tomb = this.ctx.rite.tomb;
			return tomb ? [tomb[0], tomb[1] + 0.05, tomb[2]] : null;
		}
		const laid = this.ctx.affliction.def.rite.laid;
		if (name === 'lantern' && laid) {
			const lying = items.snapshots().find((i) => i.item === laid.item);
			return lying ? [lying.position[0], lying.position[1] + 0.05, lying.position[2]] : null;
		}
		return null;
	}

	private flag(
		player: Player,
		kind: 'noclip' | 'infiniteStamina' | 'infiniteBattery' | 'godMode' | 'infiniteAmmo',
		enabled: unknown
	): void {
		player.state.flags[kind] = enabled === true;
	}
}
