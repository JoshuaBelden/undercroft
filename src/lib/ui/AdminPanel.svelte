<script lang="ts">
	import { adminAccount, ApiError } from '#lib/account/account.svelte.ts';
	import { ITEMS } from '#lib/content/items.ts';
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
		/** Affliction meter 0..1 (dev only) and omen stage. */
		meter: number | null;
		omen: number;
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
		meter,
		omen,
		onadmin,
		onmapview,
		onmarkers
	}: Props = $props();

	let seedInput = $state('');
	let moneyInput = $state('100');
	let accountMessage = $state('');

	/** Account tools go to the site, not the game server, and work on the surface. */
	async function account(change: Parameters<typeof adminAccount>[0]): Promise<void> {
		accountMessage = '';
		try {
			await adminAccount(change);
			accountMessage = 'Done';
		} catch (caught) {
			accountMessage = caught instanceof ApiError ? caught.message : 'Could not reach the site';
		}
	}
	let sanityInput = $state('100');
	let meterInput = $state('70');

	function setMeter(): void {
		const value = Number(meterInput);
		if (Number.isFinite(value)) onadmin({ kind: 'setMeter', value: value / 100 });
	}
	let giveItem = $state('crowbar');
	let giveCount = $state('1');
	// Clues are read where they lie; they can't be given.
	const itemIds = Object.keys(ITEMS).filter((id) => ITEMS[id].kind !== 'clue');

	const toggles: {
		kind: 'noclip' | 'infiniteStamina' | 'infiniteBattery' | 'godMode' | 'infiniteAmmo';
		label: string;
	}[] = [
		{ kind: 'noclip', label: 'Noclip (fly through walls)' },
		{ kind: 'infiniteStamina', label: 'Infinite stamina' },
		{ kind: 'infiniteBattery', label: 'Infinite battery' },
		{ kind: 'godMode', label: 'God mode (no sanity loss)' },
		{ kind: 'infiniteAmmo', label: 'Infinite ammo' }
	];

	function give(): void {
		const count = Number(giveCount);
		onadmin({ kind: 'give', item: giveItem, count: Number.isFinite(count) ? count : 1 });
	}

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

		<h3>Items</h3>
		<div class="row">
			<select bind:value={giveItem} aria-label="Item">
				{#each itemIds as id (id)}
					<option value={id}>{ITEMS[id].name}</option>
				{/each}
			</select>
			<input type="text" inputmode="numeric" aria-label="Count" bind:value={giveCount} size="3" />
			<button type="button" onclick={give}>Give</button>
		</div>
		<div class="row">
			<button type="button" onclick={() => onadmin({ kind: 'refillAmmo' })}>Refill ammo</button>
		</div>

		<h3>Affliction</h3>
		<div class="row">
			<span>Meter</span><code
				>{meter === null ? '—' : `${(meter * 100).toFixed(1)}%`} · omen {omen}</code
			>
		</div>
		<div class="row">
			<input
				type="text"
				inputmode="numeric"
				aria-label="Meter percent"
				bind:value={meterInput}
				size="4"
			/>
			<button type="button" onclick={setMeter}>Set meter %</button>
		</div>
		<div class="row">
			<button type="button" onclick={() => onadmin({ kind: 'manifest' })}
				>Force manifestation</button
			>
			<button type="button" onclick={() => onadmin({ kind: 'banish' })}>Banish</button>
		</div>

		<h3>Account (on the surface)</h3>
		<div class="row">
			<input type="text" inputmode="numeric" aria-label="Money" bind:value={moneyInput} size="5" />
			<button
				type="button"
				onclick={() => void account({ action: 'grantMoney', amount: Number(moneyInput) || 0 })}
				>Grant money</button
			>
			<button
				type="button"
				onclick={() =>
					void account({ action: 'grantItem', item: giveItem, count: Number(giveCount) || 1 })}
				>Grant item to stash</button
			>
		</div>
		<div class="row">
			<button type="button" onclick={() => void account({ action: 'resetExplorer' })}
				>Reset explorer</button
			>
			{#if accountMessage}<span role="status">{accountMessage}</span>{/if}
		</div>
		<p class="muted">
			Grant item uses the item and count chosen under Items. These are refused while underground.
		</p>

		<h3>Rite</h3>
		<div class="row">
			<button type="button" onclick={() => onadmin({ kind: 'revealClues' })}
				>Reveal all clues</button
			>
			<button type="button" onclick={() => onadmin({ kind: 'resetRite' })}
				>Reset rite progress</button
			>
		</div>
		<p class="muted">Give "The Pendant" above; teleport to gloaming-chapel to perform it.</p>

		<h3>Creatures</h3>
		<div class="row">
			<button type="button" onclick={() => onadmin({ kind: 'spawnCreature' })}
				>Spawn in front</button
			>
			<button type="button" onclick={() => onadmin({ kind: 'killCreatures' })}>Kill all</button>
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
