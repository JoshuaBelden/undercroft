<script lang="ts">
	import { AUDIO_CATEGORIES, type AudioCategory } from '#lib/game/audio/AudioManager.ts';
	import { ACTIONS, bindingLabel, type Action } from '#lib/game/input/actions.ts';
	import {
		resetSettings,
		saveSettings,
		settings,
		type CaptionSize,
		type GraphicsQuality
	} from '#lib/settings/settings.svelte.ts';
	import Panel from './Panel.svelte';

	interface Props {
		onclose: () => void;
		onvolume?: (category: AudioCategory, value: number) => void;
		/** Graphics settings changed; re-apply them to the renderer. */
		ongraphics?: () => void;
	}

	let { onclose, onvolume, ongraphics }: Props = $props();

	const QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high'];
	const CAPTION_SIZES: CaptionSize[] = ['small', 'medium', 'large'];

	function graphicsChanged(): void {
		saveSettings();
		ongraphics?.();
	}

	const actions = Object.keys(ACTIONS) as Action[];
	const AUDIO_LABELS: Record<AudioCategory, string> = {
		master: 'Master',
		music: 'Music',
		ambience: 'Ambience',
		sfx: 'Sound effects'
	};

	function setVolume(category: AudioCategory, value: number): void {
		settings.audio[category] = value;
		saveSettings();
		onvolume?.(category, value);
	}
</script>

<Panel title="Settings" {onclose}>
	<h3>Audio</h3>
	{#each AUDIO_CATEGORIES as category (category)}
		<label class="row">
			<span>{AUDIO_LABELS[category]}</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.05"
				value={settings.audio[category]}
				oninput={(event) => setVolume(category, Number(event.currentTarget.value))}
			/>
		</label>
	{/each}

	<h3>Graphics</h3>
	<label class="row">
		<span>Field of view ({settings.graphics.fov}°)</span>
		<input
			type="range"
			min="60"
			max="100"
			step="1"
			bind:value={settings.graphics.fov}
			oninput={graphicsChanged}
		/>
	</label>
	<label class="row">
		<span>Brightness</span>
		<input
			type="range"
			min="0.5"
			max="2"
			step="0.05"
			bind:value={settings.graphics.brightness}
			oninput={graphicsChanged}
		/>
	</label>
	<p class="muted">
		Calibrate in the dark with your headlamp on low: shadows should be black, but the rock right in
		front of you should show detail.
	</p>
	<label class="row">
		<span>Quality</span>
		<select bind:value={settings.graphics.quality} onchange={graphicsChanged}>
			{#each QUALITIES as quality (quality)}
				<option value={quality}>{quality}</option>
			{/each}
		</select>
	</label>
	<label class="row">
		<span>Camera shake ({Math.round(settings.graphics.cameraShake * 100)}%)</span>
		<input
			type="range"
			min="0"
			max="1"
			step="0.05"
			bind:value={settings.graphics.cameraShake}
			oninput={saveSettings}
		/>
	</label>

	<h3>Mouse</h3>
	<label class="row">
		<span>Sensitivity ({settings.controls.mouseSensitivity.toFixed(2)})</span>
		<input
			type="range"
			min="0.2"
			max="3"
			step="0.05"
			bind:value={settings.controls.mouseSensitivity}
			oninput={saveSettings}
		/>
	</label>
	<label class="row">
		<span>Invert Y</span>
		<input type="checkbox" bind:checked={settings.controls.invertY} onchange={saveSettings} />
	</label>

	<h3>Accessibility</h3>
	<label class="row">
		<span>Subtitles and sound captions</span>
		<input type="checkbox" bind:checked={settings.accessibility.captions} onchange={saveSettings} />
	</label>
	<label class="row">
		<span>Caption size</span>
		<select bind:value={settings.accessibility.captionSize} onchange={saveSettings}>
			{#each CAPTION_SIZES as size (size)}
				<option value={size}>{size}</option>
			{/each}
		</select>
	</label>
	<p class="muted">
		Shows what you would hear as text, with the direction it came from. Captions appear even with
		the volume off.
	</p>

	<h3>Interface</h3>
	<label class="row">
		<span>Show performance stats</span>
		<input type="checkbox" bind:checked={settings.interface.showStats} onchange={saveSettings} />
	</label>

	<h3>Controls</h3>
	<p class="muted">Rebinding arrives with the keybinding screen. Current bindings:</p>
	{#each actions as action (action)}
		<div class="row">
			<span>{ACTIONS[action].label}</span>
			<kbd>{settings.bindings[action].map(bindingLabel).join(' / ')}</kbd>
		</div>
	{/each}

	<div class="footer">
		<button
			type="button"
			onclick={() => {
				resetSettings();
				ongraphics?.();
			}}>Reset to defaults</button
		>
	</div>
</Panel>

<style>
	h3 {
		margin: 16px 0 8px;
		font-size: 0.85rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}

	h3:first-child {
		margin-top: 0;
	}

	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding: 4px 0;
	}

	kbd {
		font-family: ui-monospace, monospace;
		padding: 2px 6px;
		border: 1px solid var(--border);
	}

	.muted {
		color: var(--muted);
		font-size: 0.9rem;
	}

	.footer {
		margin-top: 16px;
		display: flex;
		justify-content: flex-end;
	}
</style>
