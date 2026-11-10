<script lang="ts">
	import { devMode } from '#lib/dev.ts';
	import { saveSettings, settings } from '#lib/settings/settings.svelte.ts';
	import type { PlayerFlags } from '#lib/shared/player/types.ts';
	import type { AdminCommand } from '#lib/shared/protocol.ts';
	import Panel from './Panel.svelte';

	interface Props {
		onclose: () => void;
		status: string;
		sessionId: string | null;
		playerId: string | null;
		seed: number | null;
		/** Start and major rooms that can be teleported to. */
		rooms: string[];
		flags: PlayerFlags | null;
		mapView: boolean;
		/** Creature markers drawn through walls. */
		markers: boolean;
		onadmin: (command: AdminCommand) => void;
		onmapview: (enabled: boolean) => void;
		onmarkers: (enabled: boolean) => void;
	}

	let {
		onclose,
		status,
		sessionId,
		playerId,
		seed,
		rooms,
		flags,
		mapView,
		markers,
		onadmin,
		onmapview,
		onmarkers
	}: Props = $props();

	let seedInput = $state('');
	let sanityInput = $state('100');

	const toggles: {
		kind: 'noclip' | 'infiniteStamina' | 'infiniteBattery' | 'godMode';
		label: string;
	}[] = [
		{ kind: 'noclip', label: 'Noclip (fly through walls)' },
		{ kind: 'infiniteStamina', label: 'Infinite stamina' },
		{ kind: 'infiniteBattery', label: 'Infinite battery' },
		{ kind: 'godMode', label: 'God mode (no sanity loss)' }
	];

	function setSanity(): void {
		const value = Number(sanityInput);
		if (Number.isFinite(value)) onadmin({ kind: 'setSanity', value });
	}

	function regenerate(): void {
		const value = Number(seedInput);
		onadmin(
			seedInput.trim() && Number.isFinite(value)
				? { kind: 'regenerate', seed: value }
				: { kind: 'regenerate' }
		);
	}
</script>

{#if devMode}
	<Panel title="Admin" {onclose}>
		<h3>Session</h3>
		<div class="row"><span>Connection</span><code>{status}</code></div>
		<div class="row"><span>Session</span><code>{sessionId ?? '—'}</code></div>
		<div class="row"><span>Player</span><code>{playerId ?? '—'}</code></div>
		<label class="row">
			<span>Stats overlay</span>
			<input type="checkbox" bind:checked={settings.interface.showStats} onchange={saveSettings} />
		</label>

		<h3>Map</h3>
		<div class="row"><span>Seed</span><code>{seed ?? '—'}</code></div>
		<div class="row">
			<input
				type="text"
				inputmode="numeric"
				placeholder="Seed (blank = random)"
				bind:value={seedInput}
			/>
			<button type="button" onclick={regenerate}>Regenerate</button>
		</div>
		<label class="row">
			<span>Map debug view (orbit, lit)</span>
			<input
				type="checkbox"
				checked={mapView}
				onchange={(event) => onmapview(event.currentTarget.checked)}
			/>
		</label>

		<h3>Player</h3>
		{#each toggles as toggle (toggle.kind)}
			<label class="row">
				<span>{toggle.label}</span>
				<input
					type="checkbox"
					checked={flags?.[toggle.kind] ?? false}
					disabled={!flags}
					onchange={(event) => onadmin({ kind: toggle.kind, enabled: event.currentTarget.checked })}
				/>
			</label>
		{/each}
		<div class="teleports">
			{#each rooms as room (room)}
				<button type="button" onclick={() => onadmin({ kind: 'teleport', room })}>{room}</button>
			{/each}
		</div>
		<div class="row">
			<input type="text" inputmode="numeric" placeholder="Sanity" bind:value={sanityInput} />
			<button type="button" onclick={setSanity}>Set sanity</button>
		</div>

		<h3>Creatures</h3>
		<div class="row">
			<button type="button" onclick={() => onadmin({ kind: 'spawnCreature' })}
				>Spawn in front</button
			>
			<button type="button" onclick={() => onadmin({ kind: 'clearCreatures' })}>Remove all</button>
		</div>
		<label class="row">
			<span>Show creatures (through walls)</span>
			<input
				type="checkbox"
				checked={markers}
				onchange={(event) => onmarkers(event.currentTarget.checked)}
			/>
		</label>
		<p class="muted">Player and creature commands need DEV_MODE=true on the game server.</p>
	</Panel>
{/if}

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

	code {
		font-size: 0.85rem;
		color: var(--muted);
	}

	.teleports {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}

	.muted {
		color: var(--muted);
		font-size: 0.85rem;
	}
</style>
