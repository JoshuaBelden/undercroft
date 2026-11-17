import { MAP_KIT } from '../../src/lib/content/map/kit.ts';
import { ITEMS } from '../../src/lib/content/items.ts';
import { MOVEMENT } from '../../src/lib/content/player/movement.ts';
import { addItem, newStack } from '../../src/lib/shared/items/inventory.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import { dropSpot, roomPoints } from '../../src/lib/shared/map/points.ts';
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
			const room = roomPoints(this.ctx.layout, PIECES, MAP_KIT).find(
				(r) => r.name === command.room
			);
			if (!room) return false;
			player.state.position = this.ctx.freeSpot(room.position);
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

	private flag(
		player: Player,
		kind: 'noclip' | 'infiniteStamina' | 'infiniteBattery' | 'godMode' | 'infiniteAmmo',
		enabled: unknown
	): void {
		player.state.flags[kind] = enabled === true;
	}
}
