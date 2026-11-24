<script lang="ts">
	import {
		BODIES,
		OPTIONAL_SLOTS,
		TINTS,
		WEAR,
		type BodyId,
		type TintPart,
		type WearId,
		type WearSlot
	} from '#lib/content/player/wardrobe.ts';
	import type { Look } from '#lib/shared/player/look.ts';
	import CharacterPreview from './CharacterPreview.svelte';

	/**
	 * The Character screen (docs/dev/player.md#the-look): the explorer turning on the left, and on
	 * the right a row per choice (body, face, what is worn in each slot) and a row of colours per
	 * part that can be tinted. Every change goes to `onchange` at once.
	 */
	interface Props {
		look: Look;
		onchange: (look: Look) => void;
		/** Why the last change didn't save, if it didn't. */
		error?: string;
	}

	let { look, onchange, error = '' }: Props = $props();

	const BODY_IDS = Object.keys(BODIES) as BodyId[];
	/** The rows of things worn, in order, and what each is called. */
	const SLOTS: { slot: WearSlot; label: string }[] = [
		{ slot: 'hair', label: 'Hair' },
		{ slot: 'shirt', label: 'Shirt' },
		{ slot: 'pants', label: 'Pants' },
		{ slot: 'jacket', label: 'Outer layer' }
	];
	const PART_LABELS: Record<TintPart, string> = {
		skin: 'Skin',
		hair: 'Hair colour',
		shirt: 'Shirt colour',
		pants: 'Pants colour',
		jacket: 'Outer layer colour'
	};

	/** The choices for a slot: its pieces, and nothing if it may be left empty. */
	function choices(slot: WearSlot): (WearId | null)[] {
		const pieces = (Object.keys(WEAR) as WearId[]).filter((id) => WEAR[id].slot === slot);
		return OPTIONAL_SLOTS.has(slot) ? [null, ...pieces] : pieces;
	}

	/** One step along a list, round from the end to the start. */
	function stepped<T>(list: readonly T[], at: T, by: number): T {
		const i = list.indexOf(at);
		return list[(i + by + list.length) % list.length];
	}

	function change(next: Partial<Look>): void {
		onchange({ ...look, ...next });
	}

	function stepBody(by: number): void {
		change({ body: stepped(BODY_IDS, look.body, by), face: 0 });
	}

	function stepFace(by: number): void {
		const faces = BODIES[look.body].faces;
		change({ face: (look.face + by + faces) % faces });
	}

	function stepWear(slot: WearSlot, by: number): void {
		const next = stepped(choices(slot), look.wear[slot] ?? null, by);
		const wear = { ...look.wear };
		if (next) wear[slot] = next;
		else delete wear[slot];
		change({ wear });
	}

	function tint(part: TintPart, id: string): void {
		change({ tints: { ...look.tints, [part]: id } });
	}

	/** The parts that can be coloured now: the skin, and each slot with something in it. */
	const parts = $derived(
		(['skin', 'hair', 'shirt', 'pants', 'jacket'] as const).filter(
			(part) => part === 'skin' || look.wear[part]
		)
	);

	/** A part's colour: its chosen swatch, or its palette's first. */
	function chosen(part: TintPart): string {
		return look.tints[part] ?? TINTS[part][0].id;
	}
</script>

<div class="character">
	<section class="panel stage" aria-label="Preview">
		<CharacterPreview {look} />
	</section>
	<section class="panel choices" aria-labelledby="character-title">
		<h2 id="character-title">Character</h2>
		<p class="note">How others see you underground. A change shows from your next expedition.</p>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="rows">
			<div class="row">
				<span class="label">Body</span>
				<div class="stepper" data-pad-stepper>
					<button type="button" aria-label="Previous body" onclick={() => stepBody(-1)}>◀</button>
					<span class="value">{BODIES[look.body].label}</span>
					<button type="button" aria-label="Next body" onclick={() => stepBody(1)}>▶</button>
				</div>
			</div>
			<div class="row">
				<span class="label">Face</span>
				<div class="stepper" data-pad-stepper>
					<button type="button" aria-label="Previous face" onclick={() => stepFace(-1)}>◀</button>
					<span class="value">{look.face + 1} of {BODIES[look.body].faces}</span>
					<button type="button" aria-label="Next face" onclick={() => stepFace(1)}>▶</button>
				</div>
			</div>
			{#each SLOTS as { slot, label } (slot)}
				{@const id = look.wear[slot]}
				<div class="row">
					<span class="label">{label}</span>
					<div class="stepper" data-pad-stepper>
						<button
							type="button"
							aria-label="Previous {label.toLowerCase()}"
							onclick={() => stepWear(slot, -1)}>◀</button
						>
						<span class="value">{id ? WEAR[id].label : 'None'}</span>
						<button
							type="button"
							aria-label="Next {label.toLowerCase()}"
							onclick={() => stepWear(slot, 1)}>▶</button
						>
					</div>
				</div>
			{/each}
			{#each parts as part (part)}
				<div class="row">
					<span class="label">{PART_LABELS[part]}</span>
					<div class="swatches" role="radiogroup" aria-label={PART_LABELS[part]}>
						{#each TINTS[part] as swatch (swatch.id)}
							<button
								type="button"
								role="radio"
								aria-checked={chosen(part) === swatch.id}
								aria-label={swatch.label}
								title={swatch.label}
								class="swatch"
								class:own={!swatch.color}
								style:--swatch={swatch.color ?? 'transparent'}
								onclick={() => tint(part, swatch.id)}
							></button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.character {
		width: min(1200px, 100%);
		box-sizing: border-box;
		margin: 24px auto 84px;
		padding: 0 16px;
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
		gap: 16px;
	}

	/* As tall as the window allows, like the Library's and the Loadout page's panels. */
	.panel {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		height: calc(100vh - 170px);
		padding: 18px 24px 24px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(14 12 10 / 0.55);
		backdrop-filter: blur(6px);
		min-width: 0;
	}

	h2 {
		margin: 0 0 6px;
		font-family: var(--font-display);
	}

	.note {
		margin: 0 0 14px;
		color: var(--muted);
	}

	.error {
		margin: 0 0 12px;
		color: var(--danger, #e07a6a);
	}

	.rows {
		display: flex;
		flex-direction: column;
		gap: 10px;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-right: 6px;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	.row {
		display: grid;
		grid-template-columns: 11em minmax(0, 1fr);
		align-items: center;
		gap: 16px;
		padding: 8px 10px;
		border-radius: 12px;
		background: rgb(255 255 255 / 0.02);
	}

	.label {
		color: var(--muted);
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.value {
		min-width: 9em;
		text-align: center;
	}

	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.swatch {
		width: 28px;
		height: 28px;
		padding: 0;
		border-radius: 50%;
		border: 2px solid var(--border);
		background: var(--swatch);
	}

	/* The texture's own colour: a split disc rather than one colour. */
	.swatch.own {
		background: linear-gradient(135deg, #8a7a66 50%, #3b332b 50%);
	}

	.swatch[aria-checked='true'] {
		border-color: var(--accent, #e8c37a);
		box-shadow: 0 0 0 2px rgb(232 195 122 / 0.35);
	}

	@media (max-width: 800px) {
		.character {
			grid-template-columns: 1fr;
		}

		.panel.stage {
			height: 50vh;
		}
	}
</style>
