import * as THREE from 'three';
import { AFFLICTIONS, type TrainingSpec } from '#lib/content/afflictions.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import { PIECES } from '#lib/shared/map/pieces.generated.ts';
import { worldSpots } from '#lib/shared/map/spots.ts';
import type { MapLayout, Vec3 } from '#lib/shared/map/types.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { PlayContext, PlayFeature } from './feature.ts';

/** A tutorial step being shown. */
export interface TutorialCard {
	title: string;
	line: string;
	/** The help topic it points to. */
	help?: string;
}

/** A dummy hit's number, rising where it was struck. */
export interface HitNumber {
	id: number;
	text: string;
	x: number;
	y: number;
	fade: number;
}

/** How long (s) a step stays up, and a hit's number. */
const CARD_SECONDS = 16;
const NUMBER_SECONDS = 1.2;

/**
 * The training ground (Rumors, docs/dev/rumors.md) on the play page: each tutorial step shown
 * once as the player reaches it (the first on arriving), and each hit on a dummy as a number
 * rising where it landed.
 */
export class Training implements PlayFeature {
	card = $state<TutorialCard | null>(null);
	numbers = $state<HitNumber[]>([]);
	private spec: TrainingSpec | null = null;
	private steps: { position: Vec3 | null; radius: number; card: TutorialCard }[] = [];
	private told: number[] = [];
	private cardLeft = 0;
	private hits: { id: number; text: string; position: Vec3; left: number }[] = [];
	private nextHit = 1;

	constructor(private ctx: PlayContext) {}

	mapLoaded(layout: MapLayout): void {
		this.clear();
		this.spec = (layout.affliction && AFFLICTIONS[layout.affliction]?.training) || null;
		if (!this.spec) return;
		const spots = worldSpots(layout, PIECES);
		this.steps = this.spec.steps.map((step) => ({
			position: step.spot ? (spots.find((s) => s.name === step.spot)?.position ?? null) : null,
			radius: step.radius,
			card: { title: step.title, line: step.line, help: step.help }
		}));
	}

	event(event: GameEvent): void {
		const { sounds } = this.ctx;
		if (event.kind === 'dummyHit') {
			sounds.playAt('dummy.hit', event.position, 1, 6);
			this.hits.push({
				id: this.nextHit++,
				text: `${Math.round(event.amount)}`,
				position: [event.position[0], event.position[1] + 1.9, event.position[2]],
				left: NUMBER_SECONDS
			});
		} else if (event.kind === 'dummyReset') {
			sounds.playAt('dummy.reset', event.position, 1, 6);
		}
	}

	self(state: PlayerState, delta: number): void {
		if (!this.spec) return;
		this.steps.forEach((step, index) => {
			if (this.told.includes(index)) return;
			const near =
				step.position === null ||
				Math.hypot(state.position[0] - step.position[0], state.position[2] - step.position[2]) <=
					step.radius;
			if (!near) return;
			this.told.push(index);
			this.card = step.card;
			this.cardLeft = CARD_SECONDS;
			this.ctx.sounds.play('ui.alert');
		});
		if (this.card) {
			this.cardLeft -= delta;
			if (this.cardLeft <= 0) this.card = null;
		}
	}

	update(delta: number): void {
		if (!this.hits.length) {
			if (this.numbers.length) this.numbers = [];
			return;
		}
		const { engine, canvas } = this.ctx;
		for (const hit of this.hits) {
			hit.left -= delta;
			hit.position[1] += delta * 0.6;
		}
		this.hits = this.hits.filter((hit) => hit.left > 0);
		this.numbers = this.hits.flatMap((hit) => {
			const p = new THREE.Vector3(...hit.position).project(engine.camera);
			if (p.z > 1) return [];
			return [
				{
					id: hit.id,
					text: hit.text,
					x: ((p.x + 1) / 2) * canvas.clientWidth,
					y: ((1 - p.y) / 2) * canvas.clientHeight,
					fade: Math.min(1, hit.left / (NUMBER_SECONDS * 0.5))
				}
			];
		});
	}

	/** Put the step away. */
	dismiss(): void {
		this.card = null;
	}

	clear(): void {
		this.spec = null;
		this.steps = [];
		this.told = [];
		this.card = null;
		this.hits = [];
		this.numbers = [];
	}
}
