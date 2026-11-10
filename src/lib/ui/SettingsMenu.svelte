<script lang="ts">
	import { AUDIO_CATEGORIES, type AudioCategory } from '#lib/game/audio/AudioManager.ts';
	import { ACTIONS, bindingLabel, type Action } from '#lib/game/input/actions.ts';
	import { resetSettings, saveSettings, settings } from '#lib/settings/settings.svelte.ts';
	import Panel from './Panel.svelte';

	interface Props {
		onclose: () => void;
		onvolume?: (category: AudioCategory, value: number) => void;
	}

	let { onclose, onvolume }: Props = $props();

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
		<button type="button" onclick={resetSettings}>Reset to defaults</button>
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
