<script lang="ts">
	import { devMode } from '#lib/dev.ts';
	import { saveSettings, settings } from '#lib/settings/settings.svelte.ts';
	import Panel from './Panel.svelte';

	interface Props {
		onclose: () => void;
		status: string;
		sessionId: string | null;
		playerId: string | null;
	}

	let { onclose, status, sessionId, playerId }: Props = $props();
</script>

{#if devMode}
	<Panel title="Admin" {onclose}>
		<div class="row"><span>Connection</span><code>{status}</code></div>
		<div class="row"><span>Session</span><code>{sessionId ?? '—'}</code></div>
		<div class="row"><span>Player</span><code>{playerId ?? '—'}</code></div>
		<label class="row">
			<span>Stats overlay</span>
			<input type="checkbox" bind:checked={settings.interface.showStats} onchange={saveSettings} />
		</label>
	</Panel>
{/if}

<style>
	.row {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 4px 0;
	}

	code {
		font-size: 0.85rem;
		color: var(--muted);
	}
</style>
