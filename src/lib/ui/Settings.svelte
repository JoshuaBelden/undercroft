<script lang="ts">
	import { ACCOUNT } from '#lib/content/account.ts';
	import {
		ApiError,
		changeGamerTag,
		loadAccount,
		session,
		signOut
	} from '#lib/account/account.svelte.ts';
	import { AUDIO_CATEGORIES, type AudioCategory } from '#lib/game/audio/AudioManager.ts';
	import { ACTIONS, bindingLabel, type Action } from '#lib/game/input/actions.ts';
	import {
		resetSettings,
		saveSettings,
		settings,
		type CaptionSize,
		type GraphicsQuality
	} from '#lib/settings/settings.svelte.ts';
	import Dialog from './Dialog.svelte';

	/**
	 * The settings screen: fills the window, with its own top bar whose tabs are the groups.
	 * The dashboard shows it as the `/settings` page; the game view lays it over the catacombs
	 * (`dim`), since leaving that page would leave the expedition.
	 */
	interface Props {
		onclose: () => void;
		/** Darken what is behind the screen (the game view; the dashboard has its own backdrop). */
		dim?: boolean;
		onvolume?: (category: AudioCategory, value: number) => void;
		/** Graphics settings changed; re-apply them to the renderer. */
		ongraphics?: () => void;
		/** The gamer tag was changed (the game server should read it again). */
		onaccount?: () => void;
	}

	let { onclose, dim = false, onvolume, ongraphics, onaccount }: Props = $props();

	const GROUPS = [
		'Account',
		'Audio',
		'Graphics',
		'Mouse',
		'Accessibility',
		'Interface',
		'Controls'
	] as const;
	let group = $state<(typeof GROUPS)[number]>('Account');

	let gamerTag = $state(session.account?.gamerTag ?? '');
	let tagMessage = $state('');
	/** Asking whether to really reset everything. */
	let confirmingReset = $state(false);
	if (!session.account) void loadAccount().then((account) => (gamerTag = account?.gamerTag ?? ''));

	async function saveTag(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		tagMessage = '';
		try {
			await changeGamerTag(gamerTag);
			gamerTag = session.account?.gamerTag ?? gamerTag;
			tagMessage = 'Saved';
			onaccount?.();
		} catch (caught) {
			tagMessage = caught instanceof ApiError ? caught.message : 'Could not reach the server';
		}
	}

	const QUALITIES: readonly GraphicsQuality[] = ['low', 'medium', 'high'];
	const CAPTION_SIZES: readonly CaptionSize[] = ['small', 'medium', 'large'];

	const AUDIO_LABELS: Record<AudioCategory, string> = {
		master: 'Master',
		music: 'Music',
		ambience: 'Ambience',
		sfx: 'Sound effects'
	};

	/** Each action as a short name, with any bracketed note from its label set beside it. */
	const controls = (Object.keys(ACTIONS) as Action[]).map((action) => {
		const [name, note] = ACTIONS[action].label.split(' (');
		return { action, name, note: note?.replace(/\)$/, '') };
	});

	/** The option `by` places along from the current one, wrapping round at either end. */
	function stepped<T>(options: readonly T[], current: T, by: number): T {
		const index = options.indexOf(current);
		return options[(index + by + options.length) % options.length];
	}

	const percent = (value: number): string => `${Math.round(value * 100)}%`;
	const onOff = (value: boolean): string => (value ? 'On' : 'Off');

	function graphicsChanged(): void {
		saveSettings();
		ongraphics?.();
	}

	function setVolume(category: AudioCategory, value: number): void {
		settings.audio[category] = value;
		saveSettings();
		onvolume?.(category, value);
	}

	function reset(): void {
		confirmingReset = false;
		resetSettings();
		ongraphics?.();
		for (const category of AUDIO_CATEGORIES) onvolume?.(category, settings.audio[category]);
	}

	interface SliderOptions {
		label: string;
		value: number;
		min: number;
		max: number;
		step: number;
		/** The value as shown at the right of the pill. */
		text: string;
		onset: (value: number) => void;
		hint?: string;
	}

	interface StepperOptions {
		label: string;
		/** The value as shown between the arrows. */
		text: string;
		/** An arrow was pressed: -1 for the left one, 1 for the right. */
		onstep: (by: number) => void;
		hint?: string;
	}
</script>

<!-- A number: the pill is the slider, filled up to the value. -->
{#snippet slider(options: SliderOptions)}
	<div class="setting">
		<label
			class="pill range"
			style:--fill="{((options.value - options.min) / (options.max - options.min)) * 100}%"
		>
			<span class="name">{options.label}</span>
			<span class="value">{options.text}</span>
			<input
				type="range"
				min={options.min}
				max={options.max}
				step={options.step}
				value={options.value}
				oninput={(event) => options.onset(Number(event.currentTarget.value))}
			/>
		</label>
		{#if options.hint}
			<p class="hint">{options.hint}</p>
		{/if}
	</div>
{/snippet}

<!-- A choice (or on/off): arrows either side of the value step through the options. -->
{#snippet stepper(options: StepperOptions)}
	<div class="setting">
		<div class="pill steps" role="group" aria-label={options.label}>
			<span class="name">{options.label}</span>
			<span class="stepper">
				<button type="button" class="arrow" aria-label="Previous" onclick={() => options.onstep(-1)}
					>&lt;</button
				>
				<span class="value" aria-live="polite">{options.text}</span>
				<button type="button" class="arrow" aria-label="Next" onclick={() => options.onstep(1)}
					>&gt;</button
				>
			</span>
		</div>
		{#if options.hint}
			<p class="hint">{options.hint}</p>
		{/if}
	</div>
{/snippet}

<section class="settings" class:dim aria-label="Settings">
	<header>
		<nav aria-label="Settings groups">
			{#each GROUPS as name (name)}
				<button
					type="button"
					class:current={group === name}
					aria-current={group === name ? 'true' : undefined}
					onclick={() => (group = name)}
				>
					{name}
				</button>
			{/each}
		</nav>
		<button type="button" class="back" onclick={onclose}>Back</button>
	</header>

	<div class="content">
		<h1>{group}</h1>

		<div class="fields">
			{#if group === 'Account'}
				<form class="setting" onsubmit={saveTag}>
					<label class="pill">
						<span class="name">Gamer tag</span>
						<input
							type="text"
							minlength={ACCOUNT.tagMin}
							maxlength={ACCOUNT.tagMax}
							required
							autocomplete="off"
							bind:value={gamerTag}
						/>
					</label>
					{#if gamerTag !== (session.account?.gamerTag ?? gamerTag)}
						<button type="submit">Save</button>
					{/if}
					<p class="hint" role="status">{tagMessage || 'The name other players see.'}</p>
				</form>
				<div class="setting">
					<button type="button" class="pill" onclick={() => void signOut()}>
						<span class="name">Sign out</span>
					</button>
					<p class="hint">Signed in as {session.account?.email ?? '...'}</p>
				</div>
			{:else if group === 'Audio'}
				{#each AUDIO_CATEGORIES as category (category)}
					{@render slider({
						label: AUDIO_LABELS[category],
						value: settings.audio[category],
						min: 0,
						max: 1,
						step: 0.05,
						text: percent(settings.audio[category]),
						onset: (value) => setVolume(category, value)
					})}
				{/each}
			{:else if group === 'Graphics'}
				{@render slider({
					label: 'Field of view',
					value: settings.graphics.fov,
					min: 60,
					max: 100,
					step: 1,
					text: `${settings.graphics.fov}°`,
					onset: (value) => {
						settings.graphics.fov = value;
						graphicsChanged();
					}
				})}
				{@render slider({
					label: 'Brightness',
					value: settings.graphics.brightness,
					min: 0.5,
					max: 2,
					step: 0.05,
					text: percent(settings.graphics.brightness),
					onset: (value) => {
						settings.graphics.brightness = value;
						graphicsChanged();
					},
					hint: 'Calibrate in the dark with your headlamp on low: shadows should be black, but the rock right in front of you should show detail.'
				})}
				{@render stepper({
					label: 'Quality',
					text: settings.graphics.quality,
					onstep: (by) => {
						settings.graphics.quality = stepped(QUALITIES, settings.graphics.quality, by);
						graphicsChanged();
					}
				})}
				{@render slider({
					label: 'Camera shake',
					value: settings.graphics.cameraShake,
					min: 0,
					max: 1,
					step: 0.05,
					text: percent(settings.graphics.cameraShake),
					onset: (value) => {
						settings.graphics.cameraShake = value;
						saveSettings();
					}
				})}
			{:else if group === 'Mouse'}
				{@render slider({
					label: 'Sensitivity',
					value: settings.controls.mouseSensitivity,
					min: 0.2,
					max: 3,
					step: 0.05,
					text: settings.controls.mouseSensitivity.toFixed(2),
					onset: (value) => {
						settings.controls.mouseSensitivity = value;
						saveSettings();
					}
				})}
				{@render stepper({
					label: 'Invert Y',
					text: onOff(settings.controls.invertY),
					onstep: () => {
						settings.controls.invertY = !settings.controls.invertY;
						saveSettings();
					}
				})}
			{:else if group === 'Accessibility'}
				{@render stepper({
					label: 'Captions',
					text: onOff(settings.accessibility.captions),
					onstep: () => {
						settings.accessibility.captions = !settings.accessibility.captions;
						saveSettings();
					},
					hint: 'Subtitles and sound captions: shows what you would hear as text, with the direction it came from. Captions appear even with the volume off.'
				})}
				{@render stepper({
					label: 'Caption size',
					text: settings.accessibility.captionSize,
					onstep: (by) => {
						settings.accessibility.captionSize = stepped(
							CAPTION_SIZES,
							settings.accessibility.captionSize,
							by
						);
						saveSettings();
					}
				})}
			{:else if group === 'Interface'}
				{@render stepper({
					label: 'Quick slots',
					text: onOff(settings.interface.quickSlots),
					onstep: () => {
						settings.interface.quickSlots = !settings.interface.quickSlots;
						saveSettings();
					},
					hint: 'The bar of items at the bottom of the screen.'
				})}
				{@render stepper({
					label: 'Pick-up prompts',
					text: onOff(settings.interface.itemPrompts),
					onstep: () => {
						settings.interface.itemPrompts = !settings.interface.itemPrompts;
						saveSettings();
					},
					hint: 'Names the thing on the floor you are looking at.'
				})}
				{@render stepper({
					label: 'Performance stats',
					text: onOff(settings.interface.showStats),
					onstep: () => {
						settings.interface.showStats = !settings.interface.showStats;
						saveSettings();
					}
				})}
			{:else}
				<p class="hint">Rebinding arrives with the keybinding screen. Current bindings:</p>
				{#each controls as control (control.action)}
					<div class="setting">
						<div class="pill">
							<span class="name">{control.name}</span>
							<kbd class="value"
								>{settings.bindings[control.action].map(bindingLabel).join(' / ')}</kbd
							>
						</div>
						{#if control.note}
							<p class="hint">{control.note}</p>
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		<div class="footer">
			<button type="button" onclick={() => (confirmingReset = true)}>Reset to defaults</button>
		</div>
	</div>
</section>

{#if confirmingReset}
	<Dialog title="Reset to defaults" onclose={() => (confirmingReset = false)}>
		<p>Every setting, in every group, goes back to how it was when you first played.</p>
		<p>Your account and gamer tag are not changed.</p>
		{#snippet footer()}
			<button type="button" onclick={() => (confirmingReset = false)}>Cancel</button>
			<button type="button" class="primary" onclick={reset}>Reset</button>
		{/snippet}
	</Dialog>
{/if}

<style>
	.settings {
		/* How wide every setting's pill is. */
		--setting-width: 400px;
		position: fixed;
		inset: 0;
		z-index: 20;
		display: flex;
		flex-direction: column;
	}

	.settings.dim {
		background: rgb(0 0 0 / 0.6);
	}

	/* The bar matches the dashboard's (src/routes/(hub)/+layout.svelte): it stands in for it. */
	header {
		display: flex;
		align-items: center;
		gap: 28px;
		padding: 0 24px;
		background: rgb(10 9 8 / 0.78);
	}

	nav {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 10px;
		padding: 12px 0;
	}

	nav button,
	.back {
		padding: 6px 16px;
		border: 1px solid transparent;
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	nav button:hover,
	nav button:focus-visible,
	.back:hover,
	.back:focus-visible {
		background: rgb(255 255 255 / 0.1);
	}

	nav button.current {
		border-color: var(--text);
	}

	.back {
		border-color: var(--border);
	}

	/* Everything under the bar shares what is left of the window; only the fields scroll. */
	.content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		width: min(900px, 100%);
		margin: 0;
		padding: 0 24px 24px;
	}

	h1 {
		margin: 28px 0 16px;
		font-size: 2rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.fields {
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 20px;
		background: rgb(10 9 8 / 0.1);
	}

	/* One setting: its pill, then anything said about it. */
	.setting {
		display: flex;
		align-items: center;
		gap: 8px 16px;
	}

	.hint {
		margin: 0;
		color: var(--muted);
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.pill {
		position: relative;
		flex: none;
		width: var(--setting-width);
		max-width: 100%;
		min-height: 40px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 16px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 999px;
		/* More solid than the container it sits in. */
		background: rgb(10 9 8 / 0.4);
		font-family: var(--font-ui);
		font-size: 0.9rem;
		white-space: nowrap;
	}

	.pill:hover,
	.pill:has(:focus-visible) {
		border-color: var(--accent);
	}

	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.value {
		position: relative;
		color: var(--text);
		font-variant-numeric: tabular-nums;
		text-transform: capitalize;
	}

	/* The slider itself is invisible and covers the pill; the fill behind the text shows the value. */
	.range {
		cursor: ew-resize;
	}

	.range::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: var(--fill);
		background: rgb(0 129 157 / 0.35);
	}

	.range .name {
		position: relative;
	}

	.range input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: ew-resize;
	}

	.steps {
		padding-right: 6px;
	}

	.stepper {
		display: flex;
		align-items: center;
	}

	.stepper .value {
		min-width: 3em;
		text-align: center;
	}

	.arrow {
		padding: 4px 8px;
		border: none;
		font-weight: 700;
		color: var(--muted);
	}

	.arrow:hover,
	.arrow:focus-visible {
		color: var(--text);
	}

	.pill input[type='text'] {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		outline: none;
		background: transparent;
		color: var(--text);
		font-size: inherit;
		text-align: right;
	}

	button.pill {
		cursor: pointer;
	}

	kbd {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		text-transform: none;
	}

	.footer {
		margin-top: 16px;
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 720px) {
		header {
			flex-wrap: wrap;
			gap: 0 20px;
			padding: 10px 16px 0;
		}

		nav {
			order: 3;
			flex-basis: 100%;
			overflow-x: auto;
		}

		.back {
			margin-left: auto;
		}

		/* No room beside the pill: what is said about a setting goes under it. */
		.setting {
			flex-wrap: wrap;
		}
	}
</style>
