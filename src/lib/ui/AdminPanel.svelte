<script lang="ts" module>
	const GROUPS = [
		'Session',
		'Map',
		'Player',
		'Items',
		'Affliction',
		'Rite',
		'Creatures',
		'Controller',
		'Account'
	] as const;
	type Group = (typeof GROUPS)[number];
	/** The group last looked at, so reopening the screen goes back to it. */
	let lastGroup: Group = 'Session';
</script>

<script lang="ts">
	import { adminAccount, ApiError } from '#lib/account/account.svelte.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { devMode } from '#lib/dev.ts';
	import { device, padFamily } from '#lib/game/input/device.svelte.ts';
	import { canVibrate, connectedPads, familyOf, playRumble } from '#lib/game/input/gamepad.ts';
	import type { PadFamily } from '#lib/game/input/actions.ts';
	import { saveSettings, settings } from '#lib/settings/settings.svelte.ts';
	import type { PlayerFlags } from '#lib/shared/player/types.ts';
	import type { AdminCommand } from '#lib/shared/protocol.ts';
	import StepperField from './StepperField.svelte';
	import TabScreen from './TabScreen.svelte';

	/**
	 * The admin screen (dev mode only): a TabScreen like settings, one group per area of the
	 * game. Laid over the game view; moving or Esc closes it (see the play page).
	 */
	interface Props {
		onclose: () => void;
		status: string;
		sessionId: string | null;
		playerId: string | null;
		seed: number | null;
		/** Start, major and extraction rooms that can be teleported to. */
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

	let group = $state<Group>(lastGroup);
	$effect(() => {
		lastGroup = group;
	});

	const onOff = (value: boolean): string => (value ? 'On' : 'Off');

	const FAMILY_NAMES: Record<PadFamily, string> = { xbox: 'Xbox', playstation: 'PlayStation' };

	/** One connected controller, as the Controller group shows it. */
	interface PadReading {
		index: number;
		id: string;
		kind: string;
		pressed: string;
		sticks: string;
		vibrates: boolean;
	}

	const inUse = $derived(
		device.kind === 'pad' ? `Controller, ${FAMILY_NAMES[padFamily()]} icons` : 'Keyboard and mouse'
	);

	/** The connected controllers, read every frame while the Controller group shows. */
	let pads = $state<PadReading[]>([]);
	$effect(() => {
		if (group !== 'Controller') return;
		let frame = requestAnimationFrame(function read() {
			pads = connectedPads().map((pad) => ({
				index: pad.index,
				id: pad.id,
				kind:
					pad.mapping === 'standard'
						? `Standard, ${FAMILY_NAMES[familyOf(pad)]}`
						: 'Not standard: ignored',
				// Buttons by index; analog ones (the triggers) with how far they are in.
				pressed:
					pad.buttons
						.flatMap((button, index) =>
							button.value > 0.05 || button.pressed
								? [button.value < 1 ? `${index} (${button.value.toFixed(2)})` : `${index}`]
								: []
						)
						.join(', ') || '—',
				sticks: pad.axes.map((axis) => axis.toFixed(2)).join('  '),
				vibrates: canVibrate(pad)
			}));
			frame = requestAnimationFrame(read);
		});
		return () => cancelAnimationFrame(frame);
	});

	let seedInput = $state('');
	let moneyInput = $state('100');
	let sanityInput = $state('100');
	let meterInput = $state('70');
	let deadlineInput = $state('10');
	let accountMessage = $state('');

	// Clues are read where they lie; they can't be given.
	const itemIds = Object.keys(ITEMS).filter((id) => ITEMS[id].kind !== 'clue');
	let giveItem = $state('crowbar');
	let giveCount = $state('1');

	function stepItem(by: number): void {
		const index = itemIds.indexOf(giveItem);
		giveItem = itemIds[(index + by + itemIds.length) % itemIds.length];
	}

	const toggles: {
		kind: 'noclip' | 'infiniteStamina' | 'infiniteBattery' | 'godMode' | 'infiniteAmmo';
		label: string;
		hint?: string;
	}[] = [
		{ kind: 'noclip', label: 'Noclip', hint: 'Fly through walls.' },
		{ kind: 'infiniteStamina', label: 'Infinite stamina' },
		{ kind: 'infiniteBattery', label: 'Infinite battery' },
		{ kind: 'godMode', label: 'God mode', hint: 'No sanity loss.' },
		{ kind: 'infiniteAmmo', label: 'Infinite ammo' }
	];

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

	function setMeter(event: SubmitEvent): void {
		event.preventDefault();
		const value = Number(meterInput);
		if (Number.isFinite(value)) onadmin({ kind: 'setMeter', value: value / 100 });
	}

	function setDeadline(event: SubmitEvent): void {
		event.preventDefault();
		const seconds = Number(deadlineInput);
		if (Number.isFinite(seconds)) onadmin({ kind: 'setDeadline', seconds });
	}

	function give(event: SubmitEvent): void {
		event.preventDefault();
		const count = Number(giveCount);
		onadmin({ kind: 'give', item: giveItem, count: Number.isFinite(count) ? count : 1 });
	}

	function setSanity(event: SubmitEvent): void {
		event.preventDefault();
		const value = Number(sanityInput);
		if (Number.isFinite(value)) onadmin({ kind: 'setSanity', value });
	}

	function regenerate(event: SubmitEvent): void {
		event.preventDefault();
		const value = Number(seedInput);
		onadmin(
			seedInput.trim() && Number.isFinite(value)
				? { kind: 'regenerate', seed: value }
				: { kind: 'regenerate' }
		);
	}
</script>

<!-- A read-only value: name on the left, the value on the right. -->
{#snippet info(name: string, value: string, hint?: string)}
	<div class="setting">
		<div class="pill">
			<span class="name">{name}</span>
			<code class="value">{value}</code>
		</div>
		{#if hint}<p class="hint">{hint}</p>{/if}
	</div>
{/snippet}

<!-- An action: the whole pill is the button. -->
{#snippet action(name: string, onclick: () => void, hint?: string)}
	<div class="setting">
		<button type="button" class="pill" {onclick}><span class="name">{name}</span></button>
		{#if hint}<p class="hint">{hint}</p>{/if}
	</div>
{/snippet}

{#if devMode}
	<TabScreen label="Admin" groups={GROUPS} bind:group {onclose} dim>
		{#if group === 'Session'}
			{@render info('Connection', status)}
			{@render info('Session', sessionId ?? '—')}
			{@render info('Player', playerId ?? '—')}
			<StepperField
				label="Stats overlay"
				text={onOff(settings.interface.showStats)}
				onstep={() => {
					settings.interface.showStats = !settings.interface.showStats;
					saveSettings();
				}}
			/>
			{@render action('Throw a server error', () => onadmin({ kind: 'throw' }))}
			{@render action('Throw a client error', () => {
				setTimeout(() => {
					throw new Error('Test error from the admin panel');
				});
			})}
			<p class="hint">Try the crash prompt and bug reports (docs/dev/reports.md).</p>
		{:else if group === 'Map'}
			{@render info('Seed', seed === null ? '—' : String(seed))}
			<form class="setting" onsubmit={regenerate}>
				<label class="pill">
					<span class="name">New seed</span>
					<input
						type="text"
						inputmode="numeric"
						placeholder="random"
						autocomplete="off"
						bind:value={seedInput}
					/>
				</label>
				<button type="submit">Regenerate</button>
			</form>
			<StepperField
				label="Map debug view"
				text={onOff(mapView)}
				onstep={() => onmapview(!mapView)}
				hint="Orbit camera, fully lit."
			/>
		{:else if group === 'Player'}
			{#each toggles as toggle (toggle.kind)}
				<StepperField
					label={toggle.label}
					text={onOff(flags?.[toggle.kind] ?? false)}
					disabled={!flags}
					onstep={() => onadmin({ kind: toggle.kind, enabled: !(flags?.[toggle.kind] ?? false) })}
					hint={toggle.hint}
				/>
			{/each}
			<form class="setting" onsubmit={setSanity}>
				<label class="pill">
					<span class="name">Sanity</span>
					<input type="text" inputmode="numeric" autocomplete="off" bind:value={sanityInput} />
				</label>
				<button type="submit">Set</button>
			</form>
			<p class="hint">Teleport to a room:</p>
			{#each rooms as room (room)}
				{@render action(room, () => onadmin({ kind: 'teleport', room }))}
			{/each}
		{:else if group === 'Items'}
			<StepperField label="Item" text={ITEMS[giveItem]?.name ?? giveItem} onstep={stepItem} />
			<form class="setting" onsubmit={give}>
				<label class="pill">
					<span class="name">Count</span>
					<input type="text" inputmode="numeric" autocomplete="off" bind:value={giveCount} />
				</label>
				<button type="submit">Give</button>
				<p class="hint">Firearms come loaded.</p>
			</form>
			{@render action('Refill ammo', () => onadmin({ kind: 'refillAmmo' }))}
			{@render action('Reset crates', () => onadmin({ kind: 'resetCrates' }))}
			{@render action('Clear chalk marks', () => onadmin({ kind: 'clearMarks' }))}
		{:else if group === 'Affliction'}
			{@render info(
				'Meter',
				`${meter === null ? '—' : `${(meter * 100).toFixed(1)}%`} · omen ${omen}`
			)}
			<form class="setting" onsubmit={setMeter}>
				<label class="pill">
					<span class="name">Meter %</span>
					<input type="text" inputmode="numeric" autocomplete="off" bind:value={meterInput} />
				</label>
				<button type="submit">Set</button>
			</form>
			<form class="setting" onsubmit={setDeadline}>
				<label class="pill">
					<span class="name">Time left (s)</span>
					<input type="text" inputmode="numeric" autocomplete="off" bind:value={deadlineInput} />
				</label>
				<button type="submit">Set</button>
			</form>
			{@render action('Force manifestation', () => onadmin({ kind: 'manifest' }))}
			{@render action('Banish', () => onadmin({ kind: 'banish' }))}
		{:else if group === 'Rite'}
			{@render action('Reveal all clues', () => onadmin({ kind: 'revealClues' }))}
			{@render action('Reset rite progress', () => onadmin({ kind: 'resetRite' }))}
			<p class="hint">
				Give 5 Candles, Chalk and "The Pendant" under Items; teleport to gloaming-chapel to perform
				it.
			</p>
		{:else if group === 'Creatures'}
			{@render action('Spawn in front', () => onadmin({ kind: 'spawnCreature' }))}
			{@render action('Kill all', () => onadmin({ kind: 'killCreatures' }))}
			{@render action('Remove all', () => onadmin({ kind: 'clearCreatures' }))}
			<StepperField
				label="Show creatures"
				text={onOff(markers)}
				onstep={() => onmarkers(!markers)}
				hint="Markers drawn through walls."
			/>
		{:else if group === 'Controller'}
			{@render info('In use', inUse)}
			{#each pads as pad (pad.index)}
				{@render info(`Controller ${pad.index}`, pad.kind, pad.id)}
				{@render info('Buttons', pad.pressed)}
				{@render info('Sticks', pad.sticks, pad.vibrates ? undefined : "Can't vibrate here.")}
			{:else}
				<p class="hint">No controllers. Browsers only show one once a button on it is pressed.</p>
			{/each}
			{@render action('Test rumble', () => playRumble('hit'), 'On every controller.')}
		{:else}
			<form
				class="setting"
				onsubmit={(event) => {
					event.preventDefault();
					void account({ action: 'grantMoney', amount: Number(moneyInput) || 0 });
				}}
			>
				<label class="pill">
					<span class="name">Money</span>
					<input type="text" inputmode="numeric" autocomplete="off" bind:value={moneyInput} />
				</label>
				<button type="submit">Grant</button>
			</form>
			{@render action(
				`Grant ${ITEMS[giveItem]?.name ?? giveItem} × ${Number(giveCount) || 1} to stash`,
				() => void account({ action: 'grantItem', item: giveItem, count: Number(giveCount) || 1 }),
				'The item and count chosen under Items.'
			)}
			{@render action('Reset explorer', () => void account({ action: 'resetExplorer' }))}
			<p class="hint" role="status">
				{accountMessage || 'These work on the surface and are refused while underground.'}
			</p>
		{/if}

		{#snippet footer()}
			<p class="note">Player and creature commands need DEV_MODE=true on the game server.</p>
		{/snippet}
	</TabScreen>
{/if}

<style>
	.note {
		margin: 0;
		color: var(--muted);
		font-size: 0.85rem;
	}
</style>
