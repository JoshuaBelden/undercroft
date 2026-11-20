import { ITEMS } from '../src/lib/content/items.ts';
import { wearHeld } from '../src/lib/shared/items/inventory.ts';
import { pelletDirections } from '../src/lib/shared/items/weapons.ts';
import type { GameEvent } from '../src/lib/shared/items/types.ts';
import { rayVsCapsule, segmentHit, type CollisionWorld } from '../src/lib/shared/map/collision.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import type { SimEvent } from '../src/lib/shared/player/types.ts';
import type { CreatureDirector, CreatureBody, Prey } from './creatures.ts';
import type { WorldItems } from './items.ts';
import { MANIFESTATION_ID, type AfflictionDirector } from './affliction.ts';

/**
 * Resolves what players did with their items (SimEvents from the shared simulation): shots and
 * swings hit creatures or walls, thrown items launch and land, and all of it makes
 * noise creatures hear. No friendly fire: only creatures are hit. See docs/dev/items.md.
 */

export interface CombatContext {
	world: CollisionWorld;
	creatures: CreatureDirector;
	/** The Affliction's manifestation is a target too, while it's out. */
	affliction: AfflictionDirector;
	items: WorldItems;
	/** Broadcast to every client this tick. */
	out: GameEvent[];
}

/** Shots carry on past their effective range, at half damage, this much further. */
const OVERRANGE = 1.5;

export function resolve(ctx: CombatContext, player: Prey, events: SimEvent[]): void {
	for (const event of events) {
		switch (event.kind) {
			case 'shot':
				shoot(ctx, player, event);
				break;
			case 'swing':
				swing(ctx, player, event);
				break;
			case 'throw':
				ctx.items.launch(event.stack, event.origin, event.direction, player.id);
				ctx.out.push({ kind: 'throw', player: player.id, item: event.item, origin: event.origin });
				break;
			case 'reloaded':
				ctx.out.push({
					kind: 'reload',
					player: player.id,
					item: event.item,
					position: [...player.state.position]
				});
				break;
			case 'broke':
				broke(ctx, player, event.item);
				break;
			case 'dose':
				ctx.out.push({
					kind: 'dosed',
					player: player.id,
					item: event.item,
					position: [...player.state.position]
				});
				break;
			case 'whistle': {
				const spec = ITEMS[event.item]?.whistle;
				if (!spec) break;
				const position: Vec3 = [...player.state.position];
				ctx.creatures.hear(position, spec.noise, player);
				ctx.out.push({ kind: 'whistle', player: player.id, position, seconds: spec.seconds });
				break;
			}
			case 'winded':
				ctx.out.push({ kind: 'winded', player: player.id, position: [...player.state.position] });
				break;
			case 'empty':
				ctx.out.push({
					kind: 'empty',
					player: player.id,
					item: event.item,
					position: [...player.state.position]
				});
				break;
		}
	}
}

/** Nearest creature a ray hits before `limit` metres, with the distance. */
function rayCreature(
	bodies: CreatureBody[],
	origin: Vec3,
	direction: Vec3,
	limit: number
): { body: CreatureBody; distance: number } | null {
	let best: { body: CreatureBody; distance: number } | null = null;
	for (const body of bodies) {
		const d = rayVsCapsule(origin, direction, limit, body.position, body.height, body.radius);
		if (d !== null && (!best || d < best.distance)) best = { body, distance: d };
	}
	return best;
}

function shoot(ctx: CombatContext, player: Prey, event: Extract<SimEvent, { kind: 'shot' }>): void {
	const def = ITEMS[event.item];
	const gun = def?.firearm;
	if (!gun) return;
	const spread = event.aimed ? gun.spread.aimed : gun.spread.hip;
	if (gun.projectile) {
		// A round in flight (a bolt, a pebble): it hits (or lands) when it gets there.
		const [dir] = pelletDirections(event.direction, spread, 1, event.seed);
		ctx.items.launch({ item: event.round ?? gun.ammo, count: 1 }, event.origin, dir, player.id, {
			speed: gun.projectile.speed,
			lift: 0,
			damage: gun.damage,
			landNoise: gun.projectile.landNoise,
			breakChance: gun.projectile.breakChance ?? 0,
			usedUp: false
		});
		ctx.out.push({
			kind: 'shot',
			player: player.id,
			item: event.item,
			origin: event.origin,
			end: event.origin,
			creature: false
		});
		if (!def.silent) ctx.creatures.hear(event.origin, gun.noise, player);
		return;
	}
	const bodies = targets(ctx);
	const maxRange = gun.range * OVERRANGE;
	const damage = new Map<string, number>();
	let firstEnd: Vec3 | null = null;
	let firstCreature = false;
	for (const dir of pelletDirections(event.direction, spread, gun.pellets, event.seed)) {
		const far: Vec3 = [
			event.origin[0] + dir[0] * maxRange,
			event.origin[1] + dir[1] * maxRange,
			event.origin[2] + dir[2] * maxRange
		];
		const wall = segmentHit(ctx.world, event.origin, far);
		const wallDistance = wall === null ? maxRange : wall * maxRange;
		// A piercing round goes through everything in its line to the wall; others stop at the first.
		const hits = gun.pierce
			? rayCreatures(bodies, event.origin, dir, wallDistance)
			: [rayCreature(bodies, event.origin, dir, wallDistance)].filter((h) => h !== null);
		const hit = hits[0] ?? null;
		const distance = hit && !gun.pierce ? hit.distance : wallDistance;
		for (const each of hits) {
			// Full damage up close, losing `falloff` of it by the end of the effective range.
			const falloff = 1 - gun.falloff * Math.min(1, each.distance / gun.range);
			damage.set(each.body.id, (damage.get(each.body.id) ?? 0) + gun.damage * falloff);
		}
		if (!firstEnd) {
			firstEnd = [
				event.origin[0] + dir[0] * distance,
				event.origin[1] + dir[1] * distance,
				event.origin[2] + dir[2] * distance
			];
			firstCreature = !!hit;
		}
	}
	for (const [id, amount] of damage) hurt(ctx, id, amount, player, bodies);
	ctx.out.push({
		kind: 'shot',
		player: player.id,
		item: event.item,
		origin: event.origin,
		end: firstEnd ?? event.origin,
		creature: firstCreature
	});
	// Gunfire: everything nearby comes for the shooter (but for a silent weapon's).
	if (!def.silent) ctx.creatures.hear(event.origin, gun.noise, player);
}

/** Every creature a ray hits before `limit` metres, nearest first. */
function rayCreatures(
	bodies: CreatureBody[],
	origin: Vec3,
	direction: Vec3,
	limit: number
): { body: CreatureBody; distance: number }[] {
	const hits: { body: CreatureBody; distance: number }[] = [];
	for (const body of bodies) {
		const d = rayVsCapsule(origin, direction, limit, body.position, body.height, body.radius);
		if (d !== null) hits.push({ body, distance: d });
	}
	return hits.sort((a, b) => a.distance - b.distance);
}

function swing(
	ctx: CombatContext,
	player: Prey,
	event: Extract<SimEvent, { kind: 'swing' }>
): void {
	const melee = ITEMS[event.item]?.melee;
	if (!melee) return;
	const bodies = targets(ctx);
	const [ox, oy, oz] = event.origin;
	let target: CreatureBody | null = null;
	let targetDistance = Infinity;
	// A sweep hits every creature in its arc; a swing, the nearest.
	const swept: CreatureBody[] = [];
	for (const body of bodies) {
		// Nearest point on the body's axis to the eye.
		const cy = Math.max(
			body.position[1] + body.radius,
			Math.min(body.position[1] + body.height - body.radius, oy)
		);
		const to: Vec3 = [body.position[0] - ox, cy - oy, body.position[2] - oz];
		const d = Math.hypot(to[0], to[1], to[2]);
		if (d - body.radius > melee.range) continue;
		const along =
			(to[0] * event.direction[0] + to[1] * event.direction[1] + to[2] * event.direction[2]) /
			Math.max(d, 1e-6);
		// Up close the body fills more of the view: widen the arc by its angular size.
		const arc = melee.arc + Math.atan2(body.radius, Math.max(d, 0.1));
		if (Math.acos(Math.min(1, along)) > arc) continue;
		if (segmentHit(ctx.world, event.origin, [body.position[0], cy, body.position[2]]) !== null)
			continue;
		swept.push(body);
		if (d < targetDistance) {
			target = body;
			targetDistance = d;
		}
	}
	let hit: 'creature' | 'wall' | null = null;
	if (target) {
		for (const body of melee.sweep ? swept : [target]) {
			hurt(ctx, body.id, melee.damage, player, bodies);
			if (melee.stagger) ctx.creatures.stagger(body.id, melee.stagger);
			// A wound that bleeds (a nail-studded club): it goes on hurting.
			if (
				melee.bleed &&
				body.id !== MANIFESTATION_ID &&
				ctx.creatures.bleed(body.id, melee.bleed.dps, melee.bleed.seconds, player)
			) {
				ctx.out.push({
					kind: 'bleed',
					id: body.id,
					position: [body.position[0], body.position[1] + 1, body.position[2]]
				});
			}
		}
		hit = 'creature';
		// It can snag on what it hit, and won't swing for a moment.
		if (melee.snag && Math.random() < melee.snag.chance) {
			player.state.weapon.snag = melee.snag.seconds;
			ctx.out.push({
				kind: 'snag',
				player: player.id,
				item: event.item,
				position: [...player.state.position]
			});
		}
	} else {
		const reach: Vec3 = [
			ox + event.direction[0] * melee.range,
			oy + event.direction[1] * melee.range,
			oz + event.direction[2] * melee.range
		];
		if (segmentHit(ctx.world, event.origin, reach) !== null) hit = 'wall';
	}
	ctx.out.push({ kind: 'swing', player: player.id, item: event.item, origin: event.origin, hit });
	if (!hit) return;
	ctx.creatures.hear(event.origin, melee.noise, player);
	// Every hit wears what made it: a brick is used up at the last, anything else breaks.
	const result = wearHeld(player.state.inventory, event.item);
	if (result === 'broke' || result === 'usedUp') broke(ctx, player, event.item);
}

/** Tell everyone something of a player's broke (or was used up): the sound of it giving way. */
function broke(ctx: CombatContext, player: Prey, item: string): void {
	ctx.out.push({ kind: 'break', item, position: [...player.state.position] });
}

/** Damage a creature and report it (and its death) to clients. */
export function hurt(
	ctx: CombatContext,
	id: string,
	amount: number,
	from: Prey | null,
	bodies: CreatureBody[] = targets(ctx)
): void {
	const body = bodies.find((b) => b.id === id);
	const position: Vec3 = body
		? [body.position[0], body.position[1] + 1, body.position[2]]
		: [0, 0, 0];
	const killed =
		id === MANIFESTATION_ID
			? ctx.affliction.damage(amount)
			: ctx.creatures.damage(id, amount, from);
	ctx.out.push(
		killed
			? { kind: 'creatureDie', id, position, by: from?.id ?? null }
			: { kind: 'creatureHit', id, position }
	);
}

/** Everything that can be hit: living creatures and the manifestation. */
export function targets(ctx: CombatContext): CreatureBody[] {
	const bodies = ctx.creatures.hitBodies();
	const manifestation = ctx.affliction.hitBody();
	if (manifestation) bodies.push(manifestation);
	return bodies;
}
