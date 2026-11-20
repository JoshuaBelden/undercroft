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
		'Account',
		'Alerts',
		'Steam'
	] as const;
	type Group = (typeof GROUPS)[number];
	/** The other player in the Alerts tab's test alerts. */
	const TEST_PERSON = { account: 'test', name: 'Wanderer' };
	/** The group last looked at, so reopening the screen goes back to it. */
	let lastGroup: Group = 'Session';
</script>

<script lang="ts">
	import { adminAccount, ApiError } from '#lib/account/account.svelte.ts';
	import { ACHIEVEMENTS } from '#lib/content/achievements.ts';
	import { desktop } from '#lib/desktop.ts';
	import type { LobbyStatus, SteamStatus } from '#lib/shared/desktop.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { CREATURES } from '#lib/content/creatures.ts';
	import { raise } from '#lib/game/alerts.svelte.ts';
	import { GRIP_ITEMS, GRIP_POSES, type GripPose } from '#lib/game/player/GripCheck.ts';
	import { devMode } from '#lib/dev.ts';
	import { device, padFamily } from '#lib/game/input/device.svelte.ts';
	import { canVibrate, connectedPads, familyOf, playRumble } from '#lib/game/input/gamepad.ts';
	import { bindingLabel, type PadFamily } from '#lib/game/input/actions.ts';
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
		/** The map view flown through (F9) instead of orbited. */
		freecam: boolean;
		/** Cell and entrance grid over the map view. */
		gridView: boolean;
		/** Creature markers drawn through walls. */
		markers: boolean;
		/** The party's attraction meters (and the omens) as bars under the clock. */
		attraction: boolean;
		/** Teammates' gamer tags drawn over the rock. */
		tagsThroughWalls: boolean;
		/** The Grip check's item (null: off) and what the test explorer does with it. */
		gripItem: string | null;
		gripPose: GripPose;
		/** Affliction meter 0..1 (dev only) and omen stage. */
		meter: number | null;
		omen: number;
		onadmin: (command: AdminCommand) => void;
		onmapview: (enabled: boolean) => void;
		onfreecam: (enabled: boolean) => void;
		ongridview: (enabled: boolean) => void;
		/** In the free camera: your body to the camera, and back into it. */
		onbodytocamera: () => void;
		/** In the free camera: the camera back to your body, still flying. */
		oncameratobody: () => void;
		onmarkers: (enabled: boolean) => void;
		onattraction: (enabled: boolean) => void;
		ontagsthroughwalls: (enabled: boolean) => void;
		ongripcheck: (item: string | null, pose: GripPose) => void;
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
		freecam,
		gridView,
		markers,
		attraction,
		tagsThroughWalls,
		gripItem,
		gripPose,
		meter,
		omen,
		onadmin,
		onmapview,
		onfreecam,
		ongridview,
		onbodytocamera,
		oncameratobody,
		onmarkers,
		onattraction,
		ontagsthroughwalls,
		ongripcheck
	}: Props = $props();

	let group = $state<Group>(lastGroup);
	$effect(() => {
		lastGroup = group;
	});

	const onOff = (value: boolean): string => (value ? 'On' : 'Off');
	const freecamKey = $derived(
		settings.bindings.toggleFreecam[0]
			? bindingLabel(settings.bindings.toggleFreecam[0])
			: 'Unbound'
	);

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
	let trustInput = $state('1000');
	let sanityInput = $state('100');
	let meterInput = $state('70');
	let deadlineInput = $state('10');
	let accountMessage = $state('');

	// Clues are read where they lie; they can't be given.
	const itemIds = Object.keys(ITEMS).filter((id) => ITEMS[id].kind !== 'clue');
	let giveItem = $state('crowbar');
	let giveCount = $state('1');

	const creatureKinds = Object.keys(CREATURES);
	let spawnKind = $state('witch');

	function stepKind(by: number): void {
		const index = creatureKinds.indexOf(spawnKind);
		spawnKind = creatureKinds[(index + by + creatureKinds.length) % creatureKinds.length];
	}

	function stepItem(by: number): void {
		const index = itemIds.indexOf(giveItem);
		giveItem = itemIds[(index + by + itemIds.length) % itemIds.length];
	}

	/** The Grip check steps through Off and every item that can be in the hand. */
	function stepGrip(by: number): void {
		const options = [null, ...GRIP_ITEMS];
		const index = options.indexOf(gripItem);
		ongripcheck(options[(index + by + options.length) % options.length], gripPose);
	}

	function stepGripPose(by: number): void {
		const index = GRIP_POSES.indexOf(gripPose);
		ongripcheck(gripItem, GRIP_POSES[(index + by + GRIP_POSES.length) % GRIP_POSES.length]);
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

	/** The desktop app's Steam, read when the Steam group is opened (null: not the desktop app). */
	let steam = $state<SteamStatus | null>(null);
	let steamMessage = $state('');
	/** The Steam lobby behind the party (docs/dev/hosting.md#the-lobby). */
	let lobby = $state<LobbyStatus | null>(null);
	$effect(() => {
		if (group !== 'Steam') return;
		const bridge = desktop();
		void bridge?.steam.status().then((status) => (steam = status));
		void bridge?.party.status().then((status) => (lobby = status));
		return bridge?.party.onChange((status) => (lobby = status));
	});

	/** Unlock an achievement on Steam directly, without earning it (to see it work). */
	async function testAchievement(id: string): Promise<void> {
		const bridge = desktop();
		if (!bridge) return;
		const unlocked = await bridge.steam.achievement(id);
		steamMessage = unlocked
			? `${id} unlocked: Steam shows it in the overlay`
			: `Steam refused ${id}: it isn't one of this app's achievements (yet)`;
	}

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
			<StepperField
				label="Free camera"
				text={onOff(freecam)}
				onstep={() => onfreecam(!freecam)}
				hint="{freecamKey}. Fly with the move keys, climb and swim down for up and down, sprint for faster."
			/>
			{#if freecam}
				{@render action(
					'Move your body here',
					onbodytocamera,
					'Where the camera is; you fall to the floor below.'
				)}
				{@render action('Camera back to your body', oncameratobody)}
			{/if}
			{@render action(
				'Reveal whole map',
				() => onadmin({ kind: 'revealMap' }),
				'Every cell drawn in your map (docs/dev/map.md).'
			)}
			{@render action('Clear map', () => onadmin({ kind: 'clearMap' }), 'Nothing drawn in it.')}
			<StepperField
				label="Grid"
				text={onOff(gridView)}
				onstep={() => ongridview(!gridView)}
				hint="In map view: cell outlines, rooms in yellow; entrances green when connected, red when blocked (cap or dead end)."
			/>
			{@render action(
				'Open the doors',
				() => onadmin({ kind: 'openDoors' }),
				'Every door between levels and every locked gate, for everyone, as if held open.'
			)}
			{@render action(
				'Bring down false walls',
				() => onadmin({ kind: 'openWalls' }),
				'Every false wall, rubble wall and web in the map comes down, as if pried, broken or cut.'
			)}
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
			<StepperField
				label="Gamer tags through walls"
				text={onOff(tagsThroughWalls)}
				onstep={() => ontagsthroughwalls(!tagsThroughWalls)}
				hint="Teammates' names drawn over the rock, still fading with distance. For checking where they are."
			/>
			{@render action('Clear conditions', () => onadmin({ kind: 'clearConditions' }))}
			<p class="hint">Teleport to a room, or to something to try out:</p>
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
			{@render action('Wear held item', () => onadmin({ kind: 'wearHeld' }))}
			{@render action('Break held item', () => onadmin({ kind: 'breakHeld' }))}
			{@render action('Repair everything', () => onadmin({ kind: 'repairAll' }))}
			{@render action('Reset crates', () => onadmin({ kind: 'resetCrates' }))}
			{@render action(
				'Unlock crates',
				() => onadmin({ kind: 'unlockCrates' }),
				"Unjams and unlocks every lootable, finds every smuggler's stash and fills every font."
			)}
			{@render action('Clear chalk marks', () => onadmin({ kind: 'clearMarks' }))}
			<StepperField
				label="Grip check"
				text={gripItem ? (ITEMS[gripItem]?.name ?? gripItem) : 'Off'}
				onstep={stepGrip}
				hint="A test explorer stands in front of you holding this item, as a teammate would (only you see it). Each item's grip is in items.ts."
			/>
			<StepperField
				label="Grip pose"
				text={gripPose[0].toUpperCase() + gripPose.slice(1)}
				disabled={!gripItem}
				onstep={stepGripPose}
				hint="Hold it; fire and reload (guns); use it (a bandage, a battery) or swing it."
			/>
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
			{@render action('Summon manifestation', () => onadmin({ kind: 'manifest' }))}
			{@render action('Stun it', () => onadmin({ kind: 'stun' }))}
			{@render action('Make it swing', () => onadmin({ kind: 'bossStrike' }))}
			{@render action('Make it fire its ray', () => onadmin({ kind: 'bossRay' }))}
			{@render action('Make it charge', () => onadmin({ kind: 'bossRush' }))}
			{@render action('Make it vanish', () => onadmin({ kind: 'bossVanish' }))}
			{@render action('Banish (resolves it)', () => onadmin({ kind: 'banish' }))}
		{:else if group === 'Rite'}
			{@render action('Reveal all clues', () => onadmin({ kind: 'revealClues' }))}
			{@render action('Reset rite progress', () => onadmin({ kind: 'resetRite' }))}
			<p class="hint">
				Give 5 Candles, Chalk and "The Pendant" under Items; teleport to gloaming-chapel to perform
				it.
			</p>
		{:else if group === 'Creatures'}
			<StepperField label="Kind" text={spawnKind} onstep={stepKind} />
			{@render action('Spawn in front', () =>
				onadmin({ kind: 'spawnCreature', creature: spawnKind })
			)}
			{@render action(
				'Spawn a dweller that turns',
				() => onadmin({ kind: 'spawnCreature', creature: 'dweller', fated: true }),
				'Becomes a witch when you see it.'
			)}
			{@render action('Kill all', () => onadmin({ kind: 'killCreatures' }))}
			{@render action('Remove all', () => onadmin({ kind: 'clearCreatures' }))}
			<StepperField
				label="Show creatures"
				text={onOff(markers)}
				onstep={() => onmarkers(!markers)}
				hint="Markers drawn through walls."
			/>
			<StepperField
				label="Show attraction"
				text={onOff(attraction)}
				onstep={() => onattraction(!attraction)}
				hint="Noise, light and omen meters under the clock. A witch comes when noise or light fills."
			/>
			{@render action('Fill noise', () => onadmin({ kind: 'fillAttraction', meter: 'noise' }))}
			{@render action('Fill light', () => onadmin({ kind: 'fillAttraction', meter: 'light' }))}
			{@render action('Empty both', () => onadmin({ kind: 'resetAttraction' }))}
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
		{:else if group === 'Alerts'}
			<!-- Raised here only, to see them stack and slide (docs/dev/alerts.md). -->
			{@render action(
				`Item: ${ITEMS[giveItem]?.name ?? giveItem} × ${Number(giveCount) || 1}`,
				() =>
					raise({
						kind: 'item',
						item: giveItem,
						count: Number(giveCount) || 1,
						source: 'pickup'
					}),
				'The item and count chosen under Items. Again within its time adds to the same alert.'
			)}
			{@render action('Gift from another player', () =>
				raise({
					kind: 'item',
					item: giveItem,
					count: Number(giveCount) || 1,
					source: 'gift',
					from: TEST_PERSON
				})
			)}
			{@render action('Friend request', () =>
				raise({ kind: 'social', event: 'friendRequest', person: TEST_PERSON })
			)}
			{@render action('Party invite', () =>
				raise({ kind: 'social', event: 'partyInvite', person: TEST_PERSON })
			)}
			{@render action(
				'One of each',
				() => {
					raise({ kind: 'social', event: 'friendAccepted', person: TEST_PERSON });
					raise({ kind: 'item', item: giveItem, count: 1, source: 'store' });
					raise({ kind: 'social', event: 'partyJoined', person: TEST_PERSON });
				},
				settings.interface.alerts ? undefined : 'Alerts are turned off in Settings > Interface.'
			)}
		{:else if group === 'Steam'}
			{#if !desktop()}
				<p class="hint">Steam is only there in the desktop app (pnpm desktop:dev).</p>
			{:else}
				{@render info('Desktop app', desktop()?.version ?? '—')}
				{@render info('Steam', steam ? (steam.available ? 'Running' : 'Not running') : '…')}
				{@render info(
					'App id',
					String(steam?.appId ?? '—'),
					'Spacewar (480) until the game has its own.'
				)}
				{@render info('SteamID', steam?.steamId ?? '—')}
				{@render info('Steam name', steam?.persona ?? '—')}
				{@render info(
					'Lobby',
					lobby?.available ? `${lobby.role} of ${lobby.lobbyId}` : 'None (no Steam)',
					"Host: our game server runs the expedition. Guest: we play on the owner's."
				)}
				{@render info('Lobby owner', lobby?.owner ?? '—')}
				{@render info('Lobby members', lobby?.members.join(', ') || '—')}
				{@render info(
					'Friends can join',
					lobby ? (lobby.joinable ? 'Yes' : 'No (underground)') : '—'
				)}
				{#if lobby?.role === 'guest'}
					{@render action(
						'Leave the lobby',
						() => void desktop()?.party.leave(),
						'Back to our own game.'
					)}
				{:else if lobby?.available}
					{@render action(
						'Invite friends',
						() => void desktop()?.party.invite(),
						"Steam's invite dialog."
					)}
				{/if}
				{#each ACHIEVEMENTS as achievement (achievement.id)}
					{@render action(
						`Unlock ${achievement.id}`,
						() => void testAchievement(achievement.id),
						achievement.name
					)}
				{/each}
				{@render action(
					'Unlock ACH_WIN_ONE_GAME',
					() => void testAchievement('ACH_WIN_ONE_GAME'),
					"One of Spacewar's own, to see the overlay with app 480."
				)}
				<p class="hint" role="status">{steamMessage}</p>
			{/if}
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
			{@render action(
				'Discover everything',
				() => void account({ action: 'discoverAll' }),
				'Every item there is to discover, as if seen; every recipe in the Library and Workshop.'
			)}
			{@render action('Forget discoveries', () => void account({ action: 'resetDiscoveries' }))}
			{@render action(
				'Rumors done',
				() => void account({ action: 'completeTraining' }),
				'As if you had got out of Rumors: the Gloaming opens.'
			)}
			{@render action(
				'Forget Afflictions',
				() => void account({ action: 'forgetAfflictions' }),
				'Every hint and resolution forgotten: Rumors to do again, the Gloaming locked.'
			)}
			<form
				class="setting"
				onsubmit={(event) => {
					event.preventDefault();
					void account({ action: 'setTrust', sold: Number(trustInput) || 0 });
				}}
			>
				<label class="pill">
					<span class="name">Trust (coin sold)</span>
					<input type="text" inputmode="numeric" autocomplete="off" bind:value={trustInput} />
				</label>
				<button type="submit">Set</button>
			</form>
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
