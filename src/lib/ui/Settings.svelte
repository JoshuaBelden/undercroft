<script lang="ts">
	import { ACCOUNT } from '#lib/content/account.ts';
	import {
		ApiError,
		changeGamerTag,
		loadAccount,
		session,
		signOut
	} from '#lib/account/account.svelte.ts';
	import {
		AUDIO_CATEGORIES,
		applyAudioOptions,
		type AudioCategory
	} from '#lib/game/audio/AudioManager.ts';
	import { ACTIONS, bindingLabel, type Action } from '#lib/game/input/actions.ts';
	import {
		FRAME_CAPS,
		resetSettings,
		saveSettings,
		settings,
		type CaptionSize,
		type GraphicsQuality
	} from '#lib/settings/settings.svelte.ts';
	import Dialog from './Dialog.svelte';
	import { fullscreen, toggleFullscreen } from './fullscreen.svelte.ts';
	import SliderField from './SliderField.svelte';
	import StepperField from './StepperField.svelte';
	import TabScreen from './TabScreen.svelte';

	/**
	 * The settings screen: a TabScreen whose groups are the settings groups.
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
		/** Underground: offer to abandon the expedition (asked to confirm first). */
		onabandon?: () => void;
	}

	let { onclose, dim = false, onvolume, ongraphics, onaccount, onabandon }: Props = $props();

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
	/** Asking whether to really abandon the expedition. */
	let confirmingAbandon = $state(false);
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
	const holdToggle = (toggle: boolean): string => (toggle ? 'Press to switch' : 'Hold');

	/** A setting that changes how sound is mixed: mono, muting in the background. */
	function audioOptionChanged(): void {
		saveSettings();
		applyAudioOptions();
	}

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
		applyAudioOptions();
	}
</script>

<TabScreen label="Settings" groups={GROUPS} bind:group {onclose} {dim}>
	{#snippet actions()}
		{#if onabandon}
			<button type="button" class="back abandon" onclick={() => (confirmingAbandon = true)}>
				Abandon expedition
			</button>
		{/if}
	{/snippet}

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
			<SliderField
				label={AUDIO_LABELS[category]}
				value={settings.audio[category]}
				min={0}
				max={1}
				step={0.05}
				text={percent(settings.audio[category])}
				onset={(value) => setVolume(category, value)}
			/>
		{/each}
		<StepperField
			label="In the background"
			text={settings.sound.muteInBackground ? 'Muted' : 'Playing'}
			onstep={() => {
				settings.sound.muteInBackground = !settings.sound.muteInBackground;
				audioOptionChanged();
			}}
			hint="Whether you still hear the game while another tab or window is in front. Underground, the expedition carries on either way."
		/>
	{:else if group === 'Graphics'}
		<StepperField
			label="Display"
			text={fullscreen.active ? 'Fullscreen' : 'Windowed'}
			onstep={toggleFullscreen}
			hint="Fills the whole screen. {bindingLabel(
				settings.bindings.toggleFullscreen[0] ?? ''
			)} switches it anywhere."
		/>
		<StepperField
			label="Camera"
			text={settings.graphics.view === 'shoulder' ? 'Over the shoulder' : 'First person'}
			onstep={() => {
				settings.graphics.view = settings.graphics.view === 'shoulder' ? 'first' : 'shoulder';
				saveSettings();
			}}
			hint="Look through your explorer's eyes, or from behind their shoulder. {bindingLabel(
				settings.bindings.toggleView[0] ?? ''
			)} switches it while you play."
		/>
		<SliderField
			label="Field of view"
			value={settings.graphics.fov}
			min={60}
			max={100}
			step={1}
			text="{settings.graphics.fov}°"
			onset={(value) => {
				settings.graphics.fov = value;
				graphicsChanged();
			}}
		/>
		<SliderField
			label="Brightness"
			value={settings.graphics.brightness}
			min={0.5}
			max={2}
			step={0.05}
			text={percent(settings.graphics.brightness)}
			onset={(value) => {
				settings.graphics.brightness = value;
				graphicsChanged();
			}}
			hint="Calibrate in the dark with your headlamp on low: shadows should be black, but the rock right in front of you should show detail."
		/>
		<StepperField
			label="Quality"
			text={settings.graphics.quality}
			onstep={(by) => {
				settings.graphics.quality = stepped(QUALITIES, settings.graphics.quality, by);
				graphicsChanged();
			}}
		/>
		<SliderField
			label="Render resolution"
			value={settings.graphics.renderScale}
			min={0.5}
			max={1}
			step={0.05}
			text={percent(settings.graphics.renderScale)}
			onset={(value) => {
				settings.graphics.renderScale = value;
				graphicsChanged();
			}}
			hint="Draws fewer pixels and scales them up: the biggest gain in frame rate on a slow graphics card, at the cost of a softer picture."
		/>
		<StepperField
			label="Frame rate limit"
			text={settings.graphics.frameCap ? `${settings.graphics.frameCap} fps` : 'None'}
			onstep={(by) => {
				settings.graphics.frameCap = stepped(FRAME_CAPS, settings.graphics.frameCap, by);
				graphicsChanged();
			}}
			hint="Caps how often the picture is drawn. Saves battery and keeps a laptop cooler and quieter."
		/>
		<SliderField
			label="Camera shake"
			value={settings.graphics.cameraShake}
			min={0}
			max={1}
			step={0.05}
			text={percent(settings.graphics.cameraShake)}
			onset={(value) => {
				settings.graphics.cameraShake = value;
				saveSettings();
			}}
		/>
	{:else if group === 'Mouse'}
		<SliderField
			label="Sensitivity"
			value={settings.controls.mouseSensitivity}
			min={0.2}
			max={3}
			step={0.05}
			text={settings.controls.mouseSensitivity.toFixed(2)}
			onset={(value) => {
				settings.controls.mouseSensitivity = value;
				saveSettings();
			}}
		/>
		<SliderField
			label="Aiming sensitivity"
			value={settings.controls.aimSensitivity}
			min={0.2}
			max={2}
			step={0.05}
			text={settings.controls.aimSensitivity.toFixed(2)}
			onset={(value) => {
				settings.controls.aimSensitivity = value;
				saveSettings();
			}}
			hint="Look speed while aiming down the sights, on top of the sensitivity above."
		/>
		<StepperField
			label="Invert Y"
			text={onOff(settings.controls.invertY)}
			onstep={() => {
				settings.controls.invertY = !settings.controls.invertY;
				saveSettings();
			}}
		/>
	{:else if group === 'Accessibility'}
		<StepperField
			label="Captions"
			text={onOff(settings.accessibility.captions)}
			onstep={() => {
				settings.accessibility.captions = !settings.accessibility.captions;
				saveSettings();
			}}
			hint="Subtitles and sound captions: shows what you would hear as text, with the direction it came from. Captions appear even with the volume off."
		/>
		<StepperField
			label="Caption size"
			text={settings.accessibility.captionSize}
			onstep={(by) => {
				settings.accessibility.captionSize = stepped(
					CAPTION_SIZES,
					settings.accessibility.captionSize,
					by
				);
				saveSettings();
			}}
		/>
		<StepperField
			label="Reduce flashing"
			text={onOff(settings.accessibility.reduceFlashing)}
			onstep={() => {
				settings.accessibility.reduceFlashing = !settings.accessibility.reduceFlashing;
				saveSettings();
			}}
			hint="Lamp flicker and cut-outs fade gently instead of strobing, and gunshots and the hurt flash are much softer. Your lamp lights exactly as much as before."
		/>
		<StepperField
			label="Sprint"
			text={holdToggle(settings.accessibility.toggleSprint)}
			onstep={() => {
				settings.accessibility.toggleSprint = !settings.accessibility.toggleSprint;
				saveSettings();
			}}
			hint="Press the sprint key once to run, instead of holding it. You stop running when you stop moving or change stance."
		/>
		<StepperField
			label="Aim"
			text={holdToggle(settings.accessibility.toggleAim)}
			onstep={() => {
				settings.accessibility.toggleAim = !settings.accessibility.toggleAim;
				saveSettings();
			}}
			hint="Press the aim key once to raise a gun to your eye, and again to lower it. Anything else in your hand is still thrown with a press."
		/>
		<StepperField
			label="Mono audio"
			text={onOff(settings.accessibility.monoAudio)}
			onstep={() => {
				settings.accessibility.monoAudio = !settings.accessibility.monoAudio;
				audioOptionChanged();
			}}
			hint="Both ears hear everything. Captions still show which way a sound came from."
		/>
	{:else if group === 'Interface'}
		<StepperField
			label="Held item"
			text={onOff(settings.interface.quickSlots)}
			onstep={() => {
				settings.interface.quickSlots = !settings.interface.quickSlots;
				saveSettings();
			}}
			hint="Names what is in your hand at the bottom of the screen."
		/>
		<StepperField
			label="Pick-up prompts"
			text={onOff(settings.interface.itemPrompts)}
			onstep={() => {
				settings.interface.itemPrompts = !settings.interface.itemPrompts;
				saveSettings();
			}}
			hint="Names the thing on the floor you are looking at."
		/>
		<StepperField
			label="Performance stats"
			text={onOff(settings.interface.showStats)}
			onstep={() => {
				settings.interface.showStats = !settings.interface.showStats;
				saveSettings();
			}}
		/>
	{:else}
		<p class="hint">Rebinding arrives with the keybinding screen. Current bindings:</p>
		{#each controls as control (control.action)}
			<div class="setting">
				<div class="pill">
					<span class="name">{control.name}</span>
					<kbd class="value">{settings.bindings[control.action].map(bindingLabel).join(' / ')}</kbd>
				</div>
				{#if control.note}
					<p class="hint">{control.note}</p>
				{/if}
			</div>
		{/each}
	{/if}

	{#snippet footer()}
		<button type="button" onclick={() => (confirmingReset = true)}>Reset to defaults</button>
	{/snippet}
</TabScreen>

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

{#if confirmingAbandon}
	<Dialog title="Abandon the expedition" onclose={() => (confirmingAbandon = false)}>
		<p>You go back to the surface now, alone. Anyone with you stays down there.</p>
		<p>Everything you carry is left where you stand, as if you had died.</p>
		{#snippet footer()}
			<button type="button" onclick={() => (confirmingAbandon = false)}>Stay</button>
			<button
				type="button"
				class="primary"
				onclick={() => {
					confirmingAbandon = false;
					onabandon?.();
				}}
			>
				Abandon
			</button>
		{/snippet}
	</Dialog>
{/if}

<style>
	.abandon {
		color: #ff9a70;
	}
</style>
