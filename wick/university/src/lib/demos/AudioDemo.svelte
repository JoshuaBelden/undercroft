<script lang="ts">
	/**
	 * The Audio chapter's live demo: built only on @wick/audio, with a few recordings in
	 * static/demo. Category volumes, a dry bus beside world ones, muffle and reverb, positional
	 * sound around the listener, a fading loop, mono, and captions.
	 */
	import {
		applyAudioOptions,
		AudioManager,
		FadingLoop,
		SoundBank,
		type CaptionCue,
		type SoundCatalog,
		type Vec3
	} from '@wick/audio';
	import { onDestroy } from 'svelte';

	type Category = 'music' | 'ambience' | 'sfx';
	type Id = 'step' | 'door' | 'door.dry' | 'drip' | 'water';

	const CATALOG: SoundCatalog<Id, Category> = {
		sounds: {
			step: { file: 'step', category: 'sfx', volume: 0.9, variation: 0.08 },
			door: { file: 'door', category: 'sfx', volume: 0.9, caption: 'a door opens' },
			// The same recording on the dry bus: muffle and reverb leave it alone.
			'door.dry': { file: 'door', category: 'music', volume: 0.9 },
			drip: { file: 'drip', category: 'sfx', volume: 1, caption: 'water drips' },
			water: { file: 'water', category: 'ambience', volume: 0.6 }
		},
		files: {
			step: ['/demo/step-1.webm', '/demo/step-2.webm', '/demo/step-3.webm'],
			door: ['/demo/door.webm'],
			drip: ['/demo/drip.webm'],
			water: ['/demo/water-lap.webm']
		}
	};

	const START = { master: 0.8, music: 0.8, ambience: 0.8, sfx: 0.8 };
	let volumes = $state({ ...START });
	let muffle = $state(0);
	let reverb = $state(0);
	let mono = $state(false);
	let bed = $state(false);
	let started = $state(false);
	let captions = $state<(CaptionCue<Id> & { at: number })[]>([]);
	/** Where the last positional drip played, in metres from the listener (x right, z ahead). */
	let placed = $state<{ x: number; z: number } | null>(null);

	const audio = new AudioManager<Category>({
		categories: ['music', 'ambience', 'sfx'],
		dry: ['music'],
		defaultCategory: 'sfx',
		volumes: START,
		options: () => ({ mono, muteInBackground: false })
	});
	const sounds = new SoundBank(audio, CATALOG);
	const water = new FadingLoop(sounds, 'water', { in: 2, out: 1.5 });
	sounds.oncaption = (cue) => {
		captions = [...captions.slice(-3), { ...cue, at: performance.now() }];
	};

	async function start(): Promise<void> {
		await audio.unlock();
		audio.setListener([0, 0, 0], [0, 0, -1]);
		water.allow();
		started = true;
	}

	$effect(() => {
		for (const [category, value] of Object.entries(volumes)) {
			audio.setVolume(category as Category | 'master', value);
		}
	});
	$effect(() => audio.setMuffle(muffle));
	$effect(() => audio.setReverb(reverb));
	$effect(() => {
		void mono;
		applyAudioOptions();
	});
	$effect(() => water.setWanted(bed));

	/** Pad: 20 m across, the listener in the middle facing up the page. */
	const SPAN = 20;
	function dripAt(x: number, z: number): void {
		placed = { x, z };
		const at: Vec3 = [x, 0, -z];
		sounds.playAt('drip', at, 1, 2);
	}
	function padClick(event: MouseEvent): void {
		const pad = event.currentTarget as HTMLElement;
		const rect = pad.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / rect.width - 0.5) * SPAN;
		const z = (0.5 - (event.clientY - rect.top) / rect.height) * SPAN;
		dripAt(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
	}

	onDestroy(() => {
		water.dispose();
		audio.dispose();
	});
</script>

<section class="demo" aria-label="Audio demo">
	{#if !started}
		<div class="gate">
			<p>Browsers only let a page make sound after you interact with it.</p>
			<button type="button" class="primary" onclick={start}>Start audio</button>
		</div>
	{:else}
		<div class="grid">
			<fieldset>
				<legend>Category volumes</legend>
				{#each Object.keys(volumes) as category (category)}
					<label>
						<span>{category}</span>
						<input
							type="range"
							min="0"
							max="1"
							step="0.01"
							bind:value={volumes[category as keyof typeof volumes]}
						/>
					</label>
				{/each}
				<label class="check"><input type="checkbox" bind:checked={mono} /> Mono output</label>
			</fieldset>

			<fieldset>
				<legend>The space</legend>
				<label>
					<span>muffle</span>
					<input type="range" min="0" max="1" step="0.01" bind:value={muffle} />
				</label>
				<label>
					<span>reverb</span>
					<input type="range" min="0" max="1" step="0.01" bind:value={reverb} />
				</label>
				<p class="hint">Turn both up, then compare the two doors.</p>
				<div class="buttons">
					<button type="button" onclick={() => sounds.play('door')}>Door (sfx, world)</button>
					<button type="button" onclick={() => sounds.play('door.dry')}>Door (music, dry)</button>
					<button type="button" onclick={() => sounds.play('step')}>Footstep (3 variants)</button>
				</div>
				<label class="check"
					><input type="checkbox" bind:checked={bed} /> Water bed (a fading loop on ambience)</label
				>
			</fieldset>

			<fieldset>
				<legend>Positional</legend>
				<button
					type="button"
					class="pad"
					aria-label="Place a drip around the listener"
					onclick={padClick}
				>
					<span class="listener" aria-hidden="true">▲</span>
					{#if placed}
						<span
							class="drop"
							aria-hidden="true"
							style:left="{50 + (placed.x / SPAN) * 100}%"
							style:top="{50 - (placed.z / SPAN) * 100}%"
						></span>
					{/if}
				</button>
				<p class="hint">
					Click to drip water there (headphones help). You face up the page; 20 m across.
				</p>
				<div class="buttons">
					<button type="button" onclick={() => dripAt(-4, 0)}>Left</button>
					<button type="button" onclick={() => dripAt(4, 0)}>Right</button>
					<button type="button" onclick={() => dripAt(0, -6)}>Behind</button>
					<button type="button" onclick={() => dripAt(0, 9)}>Far ahead</button>
				</div>
			</fieldset>

			<fieldset>
				<legend>Captions</legend>
				{#if captions.length}
					<ol class="captions">
						{#each captions as caption (caption.at)}
							<li>{caption.text}{caption.direction ? ` (${caption.direction})` : ''}</li>
						{/each}
					</ol>
				{:else}
					<p class="hint">Captioned sounds appear here: the doors and the drip.</p>
				{/if}
			</fieldset>
		</div>
	{/if}
</section>

<style>
	.demo {
		border: 1px solid var(--accent);
		border-radius: 12px;
		padding: 1.2rem;
		margin: 1.4rem 0;
		max-width: 60rem;
		background: var(--panel);
	}
	.gate {
		text-align: center;
		padding: 1.4rem 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1rem;
	}
	fieldset {
		border: 1px solid var(--rule);
		border-radius: 8px;
		background: var(--bg);
		margin: 0;
		padding: 0.8rem 1rem 1rem;
	}
	legend {
		font-weight: 650;
		padding: 0 0.3rem;
	}
	label {
		display: grid;
		grid-template-columns: 5.5rem 1fr;
		align-items: center;
		gap: 0.6rem;
		margin: 0.3rem 0;
		font-size: 0.92rem;
	}
	label.check {
		display: flex;
		margin-top: 0.7rem;
	}
	.hint {
		font-size: 0.85rem;
		color: var(--muted);
		margin: 0.5rem 0;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	button {
		font: inherit;
		font-size: 0.88rem;
		padding: 0.35rem 0.7rem;
		border-radius: 6px;
		border: 1px solid var(--rule);
		background: var(--node);
		color: var(--ink);
		cursor: pointer;
	}
	button:hover {
		border-color: var(--accent);
	}
	button.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
		padding: 0.55rem 1.2rem;
		font-weight: 650;
	}
	.pad {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 1;
		padding: 0;
		background:
			linear-gradient(var(--rule) 1px, transparent 1px) 0 0 / 10% 10%,
			linear-gradient(90deg, var(--rule) 1px, transparent 1px) 0 0 / 10% 10%,
			var(--node);
		cursor: crosshair;
	}
	.listener {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		color: var(--accent);
		font-size: 1.1rem;
	}
	.drop {
		position: absolute;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--world);
		transform: translate(-50%, -50%);
	}
	.captions {
		margin: 0;
		padding-left: 1.2rem;
		font-size: 0.95rem;
	}
</style>
