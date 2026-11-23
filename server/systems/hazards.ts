import { ITEMS } from '../../src/lib/content/items.ts';
import { addItem, newStack } from '../../src/lib/shared/items/inventory.ts';
import { lookedAtItem } from '../../src/lib/shared/items/pickup.ts';
import type { HazardsSnapshot } from '../../src/lib/shared/items/types.ts';
import { floorHeightAt, segmentHit } from '../../src/lib/shared/map/collision.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import type { SimEvent } from '../../src/lib/shared/player/types.ts';
import { hurt, targets } from '../combat.ts';
import { crosses, type Ward } from '../creatures.ts';
import type { ProjectileResult } from '../items.ts';
import { TICK_DT, type Player, type SessionContext, type SessionSystem } from './system.ts';

/**
 * What players set down or set off in the map, and what it does while it lasts
 * (docs/dev/combat.md): fuses that go off a while after landing (a lure), fires that burn
 * whatever stands in them, snares that hold the first creature through, lines of salt creatures
 * won't cross. Keyed by the items' fields (`throwable.fuse`, `throwable.fire`, `place.snare`,
 * `place.ward`), never their ids.
 */

interface Fuse {
	item: string;
	position: Vec3;
	left: number;
	noise: number;
	/** A charge (`place.blast`): set down, not thrown; it blows open a barred door this near. */
	blast?: { id: string; radius: number };
}

interface Fire {
	id: string;
	item: string;
	position: Vec3;
	radius: number;
	dps: number;
	left: number;
	/** Who threw it: what it kills is theirs. */
	by: string | null;
}

interface Snare {
	id: string;
	item: string;
	position: Vec3;
	yaw: number;
	radius: number;
	hold: number;
}

interface Laid extends Ward {
	id: string;
	item: string;
	left: number;
}

interface Glow {
	id: string;
	item: string;
	position: Vec3;
	left: number;
	seconds: number;
}

interface Bait {
	id: string;
	item: string;
	position: Vec3;
	creature: string;
	radius: number;
	left: number;
}

interface Tripwire extends Ward {
	id: string;
	item: string;
	noise: number;
	/** Rings left (its wear: each ring a use) before it is spent. */
	rings: number;
	/** Seconds before it can ring again (it sets itself). */
	wait: number;
}

/** A tripwire bell sets itself again this long after it rings (s). */
const TRIPWIRE_RESET = 3;

/** Things are set down this far in front of the eye (m), on the floor below. */
const PLACE_AHEAD = 0.9;

export class HazardSystem implements SessionSystem {
	private fuses: Fuse[] = [];
	private fires: Fire[] = [];
	private snares: Snare[] = [];
	private wards: Laid[] = [];
	private glows: Glow[] = [];
	private baits: Bait[] = [];
	private tripwires: Tripwire[] = [];
	/** Where each creature was last tick, for what it crosses. */
	private was = new Map<string, Vec3>();
	private nextId = 1;

	constructor(private ctx: SessionContext) {}

	/** Something thrown came down (PackSystem): a fuse lit, or a fire, if it is that kind of thing. */
	landed(result: Extract<ProjectileResult, { kind: 'land' }>): void {
		const spec = ITEMS[result.item]?.throwable;
		const position: Vec3 = [...result.position];
		if (spec?.fuse) {
			this.fuses.push({
				item: result.item,
				position,
				left: spec.fuse.seconds,
				noise: spec.fuse.noise
			});
			this.ctx.events.push({ kind: 'fuseLit', item: result.item, position });
		}
		if (spec?.glow || spec?.lure) {
			const floor = floorHeightAt(
				this.ctx.world,
				position[0],
				position[2],
				position[1] + 0.5,
				position[1] - 3
			);
			const at: Vec3 = [position[0], floor ?? position[1], position[2]];
			// A glow stick: a light on the floor till it fades.
			if (spec.glow) {
				this.glows.push({
					id: `g${this.nextId++}`,
					item: result.item,
					position: at,
					left: spec.glow.seconds,
					seconds: spec.glow.seconds
				});
			}
			// Bait: what likes it goes to it.
			if (spec.lure) {
				this.baits.push({
					id: `b${this.nextId++}`,
					item: result.item,
					position: at,
					creature: spec.lure.creature,
					radius: spec.lure.radius,
					left: spec.lure.seconds
				});
			}
		}
		if (spec?.fire) {
			// The fire sits on the floor under where it burst.
			const floor = floorHeightAt(
				this.ctx.world,
				position[0],
				position[2],
				position[1] + 0.5,
				position[1] - 3
			);
			const at: Vec3 = [position[0], floor ?? position[1], position[2]];
			this.fires.push({
				id: `f${this.nextId++}`,
				item: result.item,
				position: at,
				radius: spec.fire.radius,
				dps: spec.fire.dps,
				left: spec.fire.seconds,
				by: result.thrower
			});
			this.ctx.events.push({ kind: 'fire', item: result.item, position: at });
			// Webs near it burn away.
			this.ctx.systems.walls.burn(at, spec.fire.radius);
		}
	}

	/** A player set something down (the `place` SimEvent): a snare or a line of salt. */
	simulated(player: Player, step: { events: SimEvent[] }): void {
		for (const event of step.events) {
			if (event.kind !== 'place') continue;
			const spec = ITEMS[event.item]?.place;
			// A piton is the rope system's (an anchor).
			if (!spec || spec.anchor) continue;
			const ahead = this.floorAhead(event.origin, event.direction);
			if (!ahead) continue;
			const yaw = Math.atan2(-event.direction[0], -event.direction[2]);
			if (spec.snare) {
				this.snares.push({
					id: `s${this.nextId++}`,
					item: event.item,
					position: ahead,
					yaw,
					radius: spec.snare.radius,
					hold: spec.snare.hold
				});
			}
			if (spec.tripwire) {
				// Across the way the player faces, like a line of salt.
				const half = spec.tripwire.length / 2;
				const across: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
				this.tripwires.push({
					id: `t${this.nextId++}`,
					item: event.item,
					a: [ahead[0] - across[0] * half, ahead[1], ahead[2] - across[2] * half],
					b: [ahead[0] + across[0] * half, ahead[1], ahead[2] + across[2] * half],
					noise: spec.tripwire.noise,
					// As worn as the bell was: each ring is a use.
					rings: Math.max(1, (ITEMS[event.item]?.durability?.max ?? 1) - (event.worn ?? 0)),
					wait: 0
				});
			}
			if (spec.blast) {
				// A charge: its fuse lit as it is set, and nothing to pick back up.
				this.fuses.push({
					item: event.item,
					position: ahead,
					left: spec.blast.fuse,
					noise: spec.blast.noise,
					blast: { id: `c${this.nextId++}`, radius: spec.blast.radius }
				});
			}
			if (spec.ward) {
				// Across the way the player faces, centred in front of them.
				const half = spec.ward.length / 2;
				const across: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
				this.wards.push({
					id: `w${this.nextId++}`,
					item: event.item,
					a: [ahead[0] - across[0] * half, ahead[1], ahead[2] - across[2] * half],
					b: [ahead[0] + across[0] * half, ahead[1], ahead[2] + across[2] * half],
					left: spec.ward.seconds
				});
			}
			this.ctx.events.push({
				kind: 'placed',
				player: player.id,
				item: event.item,
				position: ahead
			});
		}
	}

	/**
	 * Interact on a snare or a tripwire bell you set (or anyone did), with no floor item in view
	 * (PackSystem): it is taken up again, back into the pack as it was. False if none is in view
	 * or there is no room for it.
	 */
	takeBack(player: Player, eye: Vec3, look: Vec3): boolean {
		const s = player.state;
		const set = [
			...this.snares.map((snare) => ({ id: snare.id, item: snare.item, position: snare.position })),
			...this.tripwires.map((wire) => ({
				id: wire.id,
				item: wire.item,
				position: wireMiddle(wire)
			}))
		];
		const found = lookedAtItem(this.ctx.world, s.position, eye, look, set);
		if (!found) return false;
		const stack = newStack(found.item);
		const wire = this.tripwires.find((w) => w.id === found.id);
		const max = ITEMS[found.item]?.durability?.max;
		if (wire && max) stack.worn = max - wire.rings;
		if (addItem(s.inventory, stack) > 0) return false;
		this.snares = this.snares.filter((snare) => snare.id !== found.id);
		this.tripwires = this.tripwires.filter((w) => w.id !== found.id);
		this.ctx.events.push({
			kind: 'pickup',
			player: player.id,
			item: found.item,
			count: 1,
			position: [...found.position]
		});
		return true;
	}

	/** The floor a step in front of the eye, if there is one there and nothing in the way of it. */
	private floorAhead(origin: Vec3, direction: Vec3): Vec3 | null {
		const flat = Math.hypot(direction[0], direction[2]) || 1;
		const at: Vec3 = [
			origin[0] + (direction[0] / flat) * PLACE_AHEAD,
			origin[1],
			origin[2] + (direction[2] / flat) * PLACE_AHEAD
		];
		if (segmentHit(this.ctx.world, origin, at) !== null) return null;
		const floor = floorHeightAt(this.ctx.world, at[0], at[2], origin[1], origin[1] - 3);
		return floor === null ? null : [at[0], floor, at[2]];
	}

	step(): void {
		const ctx = this.ctx;
		// Fuses burn down, then go off: heard far (no source: creatures go and look).
		for (const fuse of this.fuses) {
			fuse.left -= TICK_DT;
			if (fuse.left > 0) continue;
			ctx.creatures.hear(fuse.position, fuse.noise, null);
			if (fuse.blast) {
				const door = ctx.systems.doors.blast(fuse.position, fuse.blast.radius);
				ctx.events.push({ kind: 'blast', item: fuse.item, position: fuse.position, door });
				continue;
			}
			ctx.events.push({ kind: 'fuseBang', item: fuse.item, position: fuse.position });
		}
		this.fuses = this.fuses.filter((fuse) => fuse.left > 0);

		// Fires burn what stands in them, creatures and explorers alike.
		const combat = ctx.combat();
		for (const fire of this.fires) {
			fire.left -= TICK_DT;
			const by = fire.by ? (ctx.players.get(fire.by) ?? null) : null;
			const from = by ? { id: by.id, state: by.state } : null;
			for (const body of targets(combat)) {
				if (inside(fire, body.position)) hurt(combat, body.id, fire.dps * TICK_DT, from, [body]);
			}
			for (const player of ctx.players.values()) {
				const s = player.state;
				if (s.dead || s.downed || s.extracted || !inside(fire, s.position)) continue;
				ctx.hurt(player, fire.dps * TICK_DT);
			}
		}
		this.fires = this.fires.filter((fire) => fire.left > 0);

		// A snare holds the first creature that steps in it, and is spent.
		const bodies = ctx.creatures.hitBodies();
		this.snares = this.snares.filter((snare) => {
			const caught = bodies.find(
				(body) =>
					Math.abs(body.position[1] - snare.position[1]) < 1 &&
					Math.hypot(body.position[0] - snare.position[0], body.position[2] - snare.position[2]) <
						snare.radius + body.radius
			);
			if (!caught || !ctx.creatures.hold(caught.id, snare.hold)) return true;
			ctx.events.push({
				kind: 'snared',
				id: caught.id,
				item: snare.item,
				position: snare.position
			});
			return false;
		});

		// Lines of salt fade.
		for (const ward of this.wards) ward.left -= TICK_DT;
		this.wards = this.wards.filter((ward) => ward.left > 0);
		ctx.creatures.wards = this.wards;

		// Glow sticks fade; bait is eaten in time.
		for (const glow of this.glows) glow.left -= TICK_DT;
		this.glows = this.glows.filter((glow) => glow.left > 0);
		ctx.creatures.glows = this.glows.map(({ id, position }) => ({ id, position }));
		for (const bait of this.baits) bait.left -= TICK_DT;
		this.baits = this.baits.filter((bait) => bait.left > 0);
		ctx.creatures.lures = this.baits.map(({ creature, position, radius }) => ({
			creature,
			position,
			radius
		}));

		// A tripwire rings when something crosses it, then sets itself again, until it is spent.
		const now = new Map(bodies.map((body) => [body.id, [...body.position] as Vec3]));
		for (const wire of this.tripwires) {
			wire.wait = Math.max(0, wire.wait - TICK_DT);
			if (wire.wait > 0) continue;
			const crossed = [...now].some(([id, at]) => {
				const before = this.was.get(id);
				return !!before && crosses(before, at, wire);
			});
			if (!crossed) continue;
			wire.rings--;
			wire.wait = TRIPWIRE_RESET;
			const middle: Vec3 = [
				(wire.a[0] + wire.b[0]) / 2,
				wire.a[1] + 0.2,
				(wire.a[2] + wire.b[2]) / 2
			];
			ctx.creatures.hear(middle, wire.noise, null);
			ctx.events.push({ kind: 'tripwire', id: wire.id, item: wire.item, position: middle });
		}
		this.tripwires = this.tripwires.filter((wire) => wire.rings > 0);
		this.was = now;
	}

	snapshot(): HazardsSnapshot {
		return {
			fires: this.fires.map(({ id, position, radius }) => ({ id, position, radius })),
			snares: this.snares.map(({ id, item, position, yaw }) => ({ id, item, position, yaw })),
			wards: this.wards.map(({ id, item, a, b }) => ({ id, item, a, b })),
			glows: this.glows.map(({ id, item, position, left, seconds }) => ({
				id,
				item,
				position,
				left: Math.round(left * 10) / 10,
				seconds
			})),
			baits: this.baits.map(({ id, item, position }) => ({ id, item, position })),
			charges: this.fuses.flatMap(({ item, position, blast }) =>
				blast ? [{ id: blast.id, item, position }] : []
			),
			tripwires: this.tripwires.map(({ id, item, a, b }) => ({ id, item, a, b }))
		};
	}

	regenerating(): void {
		this.fuses = [];
		this.fires = [];
		this.snares = [];
		this.wards = [];
		this.glows = [];
		this.baits = [];
		this.tripwires = [];
		this.was.clear();
		this.ctx.creatures.wards = [];
		this.ctx.creatures.glows = [];
		this.ctx.creatures.lures = [];
	}
}

/** Whether a point (feet) is in a fire: within its radius, on about its floor. */
function inside(fire: Fire, position: Vec3): boolean {
	if (Math.abs(position[1] - fire.position[1]) > 1.2) return false;
	return Math.hypot(position[0] - fire.position[0], position[2] - fire.position[2]) <= fire.radius;
}

/** The middle of a tripwire's line: where it is looked at to take it up. */
export function wireMiddle(wire: Ward): Vec3 {
	return [(wire.a[0] + wire.b[0]) / 2, wire.a[1], (wire.a[2] + wire.b[2]) / 2];
}
