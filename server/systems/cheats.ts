import { MAP_KIT } from '../../src/lib/content/map/kit.ts';
import { ITEMS } from '../../src/lib/content/items.ts';
import { MOVEMENT } from '../../src/lib/content/player/movement.ts';
import { addItem, newStack } from '../../src/lib/shared/items/inventory.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import { toWorld } from '../../src/lib/shared/map/grid.ts';
import { dropSpot, inFront, roomPoints, testPoints } from '../../src/lib/shared/map/points.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
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
			if (typeof command.item !== 'string' || !ITEMS[command.item]) return false;
			const count = Math.max(1, Math.min(99, Math.floor(Number(command.count) || 1)));
			const magazine = ITEMS[command.item].firearm?.magazine;
			addItem(player.state.inventory, newStack(command.item, count, magazine));
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

	/**
	 * Teleports only the server can work out: `stuck-crate`, in front of the first jammed crate
	 * (found or not); `pendant`, beside the Pendant wherever it lies (on the floor, or its crate).
	 */
	private secretPoint(name: string): Vec3 | null {
		const { crates, items, layout } = this.ctx;
		const placement = (id: string) => layout.crates.find((c) => c.id === id);
		if (name === 'stuck-crate') {
			const jammed = crates.list().find(({ crate }) => crate.lock === 'jammed')?.crate;
			const at = jammed && placement(jammed.id);
			return at ? inFront(at) : null;
		}
		if (name === 'pendant') {
			const lying = items.snapshots().find((i) => i.item === 'pendant');
			if (lying) {
				const [x, y, z] = lying.position;
				// On the altar: where the rite is performed, in front of it. Otherwise right there.
				const rite = layout.placements
					.flatMap((p) => (PIECES[p.piece]?.rites ?? []).map((r) => toWorld(p, r)))
					.find((r) => Math.hypot(r[0] - x, r[2] - z) < 3 && Math.abs(r[1] - y) < 2.5);
				return rite ?? [x, y + 0.05, z];
			}
			const holder = crates
				.list()
				.find(({ crate }) => crate.slots.some((s) => s?.item === 'pendant'))?.crate;
			const at = holder && placement(holder.id);
			return at ? inFront(at) : null;
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
