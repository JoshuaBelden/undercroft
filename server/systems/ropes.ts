import { ROPE } from '../../src/lib/content/rope.ts';
import {
	addItem,
	getSlot,
	handRef,
	newStack,
	removeItem,
	takeStack
} from '../../src/lib/shared/items/inventory.ts';
import {
	applyTied,
	laidLength,
	ropeAction,
	ropeInHand,
	ropeLength
} from '../../src/lib/shared/items/rope.ts';
import { reequip } from '../../src/lib/shared/items/weapons.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { HAND } from '../../src/lib/shared/player/types.ts';
import { Ropes } from '../ropes.ts';
import {
	TICK_DT,
	type Player,
	type SessionContext,
	type SessionSystem,
	type SimulatedFrame
} from './system.ts';

/**
 * Rope (docs/dev/rope.md): laid along the floor while attack is held, tied at anchors to climb,
 * untied and gathered up again by holding interact. Climbing itself is player movement
 * (stepPlayer); this is what the server keeps of the ropes and who is handling them.
 */
export class RopeSystem implements SessionSystem {
	readonly ropes = new Ropes();
	/** What each player's interact hold is on (`roping`): changing target starts it over. */
	private targets = new Map<string, string>();
	/** The hand slot (`Inventory.selected`) each player is laying rope from. */
	private layingFrom = new Map<string, number>();

	constructor(private ctx: SessionContext) {}

	/** Ropes grabbed and let go by their own movement; attack pressed starts laying. */
	simulated(player: Player, { events, pressedAttack }: SimulatedFrame): void {
		const position: Vec3 = [...player.state.position];
		for (const event of events) {
			if (event.kind === 'grab') {
				this.ctx.events.push({ kind: 'ropeGrab', player: player.id, position });
			} else if (event.kind === 'letgo') {
				this.ctx.events.push({ kind: 'ropeLetGo', player: player.id, position });
			}
		}
		if (pressedAttack) this.startLaying(player);
	}

	/**
	 * Ropes each tick: pay out the ones being laid as their layers walk, and count interact held
	 * to tie a rope at an anchor, untie one, or gather up a laid rope.
	 */
	step(): void {
		for (const player of this.ctx.players.values()) {
			this.stepLaying(player);
			this.stepRoping(player);
		}
		const grown = this.ropes.takeGrowth();
		if (grown.length) this.ctx.broadcast({ type: 'ropeGrow', ropes: grown });
	}

	/**
	 * Pressing attack with rope in the hand starts paying it out along the floor where you stand;
	 * it lays while attack is held. Which slot it came from is kept, so letting go uses up that one.
	 */
	private startLaying(player: Player): void {
		const s = player.state;
		if (this.ropes.layingBy(player.id)) return;
		const stack = ropeInHand(s);
		if (!stack || !this.ctx.canUseHands(player) || !s.grounded) return;
		this.ropes.start(player.id, player.name, stack.item, [...s.position]);
		this.layingFrom.set(player.id, s.inventory.selected);
		this.changed();
	}

	/**
	 * Stop laying: the rope stays where it lies, and the pack or bundle it came from is used up,
	 * however much of it went down. Let go before any was laid, and it is kept.
	 */
	private stopLaying(player: Player): void {
		const slot = this.layingFrom.get(player.id);
		this.layingFrom.delete(player.id);
		const rope = this.ropes.stop(player.id);
		if (rope && slot !== undefined) this.useUp(player, slot, rope.item);
		this.changed();
	}

	private stepLaying(player: Player): void {
		const rope = this.ropes.layingBy(player.id);
		if (!rope) return;
		const s = player.state;
		const stack = ropeInHand(s);
		// Letting go of attack stops it, and so does anything that takes the hands or the rope
		// out of them.
		const still =
			player.lastInput?.attack === true &&
			stack?.item === rope.item &&
			s.inventory.selected === this.layingFrom.get(player.id) &&
			this.ctx.canUseHands(player);
		if (!still || !stack) {
			this.stopLaying(player);
			return;
		}
		if (!s.grounded) return;
		const before = rope.points.length;
		const left = ropeLength(stack) - laidLength(rope);
		this.ropes.extend(this.ctx.world, rope, s.position, left);
		// A rustle every couple of metres laid.
		const every = Math.round(2 / ROPE.spacing);
		if (Math.floor(rope.points.length / every) > Math.floor(before / every)) {
			this.ctx.events.push({ kind: 'ropeLay', player: player.id, position: [...s.position] });
		}
		// All of it paid out.
		if (ropeLength(stack) - laidLength(rope) < ROPE.spacing) this.stopLaying(player);
	}

	private stepRoping(player: Player): void {
		const ctx = this.ctx;
		const s = player.state;
		const busy =
			!ctx.canUseHands(player) ||
			!player.lastInput?.interact ||
			s.opening > 0 ||
			s.erasing > 0 ||
			s.performing > 0 ||
			s.extracting > 0 ||
			s.unbarring > 0 ||
			!s.grounded;
		const action = busy
			? null
			: ropeAction(ctx.world, this.ropes.laidList(), this.ropes.tiedList(), s);
		const target =
			action?.kind === 'gather'
				? action.rope.id
				: action && action.kind !== 'short'
					? `${action.kind}:${action.anchor.id}`
					: null;
		// Nobody unties a rope out from under someone climbing it.
		const occupied =
			action?.kind === 'untie' &&
			[...ctx.players.values()].some((p) => p.state.climbing?.rope === `tied-${action.anchor.id}`);
		if (!action || !target || occupied) {
			s.roping = 0;
			this.targets.delete(player.id);
			return;
		}
		if (this.targets.get(player.id) !== target) {
			// Something new to tie, untie or gather: start over.
			s.roping = 0;
			this.targets.set(player.id, target);
		}
		s.roping += TICK_DT;
		const seconds = action.kind === 'gather' ? ROPE.pickupSeconds : ROPE.tieSeconds;
		if (s.roping < seconds) return;
		s.roping = 0;
		this.targets.delete(player.id);
		const position: Vec3 = [...s.position];
		if (action.kind === 'tie') {
			const stack = ropeInHand(s);
			if (!stack) return;
			// Tied off, the whole pack or bundle is used, however long the drop.
			this.useUp(player, s.inventory.selected, stack.item);
			this.ropes.tie({
				anchor: action.anchor.id,
				by: player.id,
				name: player.name,
				item: stack.item
			});
			ctx.events.push({ kind: 'ropeTie', player: player.id, position });
			ctx.creatures.hear(position, ROPE.noise, player);
		} else if (action.kind === 'untie') {
			const tied = this.ropes.untie(action.anchor.id);
			if (tied) this.give(player, tied.item);
			ctx.events.push({ kind: 'ropeUntie', player: player.id, position });
			ctx.creatures.hear(position, ROPE.noise, player);
		} else if (action.kind === 'gather') {
			const rope = this.ropes.removeLaid(action.rope.id);
			if (rope) this.give(player, rope.item);
			ctx.events.push({ kind: 'ropeGather', player: player.id, position });
		}
		this.changed();
	}

	/**
	 * A rope pack or bundle used up (laid or tied): the one in hand slot `slot` if it is still
	 * there, else one like it from anywhere they carry it. An emptied hand goes back to a weapon.
	 */
	private useUp(player: Player, slot: number, item: string): void {
		const inv = player.state.inventory;
		const ref = handRef(inv, slot);
		const stack = ref ? getSlot({ inventory: inv }, ref) : null;
		if (ref && stack?.item === item) {
			takeStack({ inventory: inv }, ref, 1);
			if (inv.selected === slot) {
				inv.selected = HAND.primary;
				reequip(player.state.weapon);
			}
			return;
		}
		const hand = inv.selected;
		removeItem(inv, item, 1);
		if (inv.selected !== hand) reequip(player.state.weapon);
	}

	/** Rope taken back (gathered up, untied): the pack or bundle it was, in the pack or at their feet. */
	private give(player: Player, item: string): void {
		const stack = newStack(item);
		if (addItem(player.state.inventory, stack) > 0) {
			this.ctx.items.place(stack, [...player.state.position]);
		}
	}

	/** Ropes changed: the tied ones are climbable (or not) from now, and everyone is told. */
	private changed(): void {
		applyTied(this.ctx.world, this.ropes.tiedList());
		this.ctx.broadcast({ type: 'ropes', ...this.ropes.snapshot() });
	}

	joined(player: Player): void {
		this.ctx.send(player, { type: 'ropes', ...this.ropes.snapshot() });
	}

	/** Gone: a rope they were laying stays where it lies (nobody's pack to use up). */
	left(player: Player): void {
		this.ropes.stop(player.id);
		this.layingFrom.delete(player.id);
	}

	regenerated(): void {
		this.ropes.clear();
		this.changed();
	}

	admin = {
		clearRopes: () => {
			this.ropes.clear();
			this.changed();
		}
	} satisfies SessionSystem['admin'];
}
