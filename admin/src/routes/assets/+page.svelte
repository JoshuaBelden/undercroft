<script lang="ts">
	import {
		ASSET_KINDS,
		ASSET_STATUSES,
		type AssetKind,
		type AssetRow,
		type AssetStatus
	} from '#lib/content.ts';
	import { synthesize } from '#lib/audio.ts';
	import { bytes } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let kind = $state<AssetKind | null>(null);
	let status = $state<AssetStatus | null>(null);
	let search = $state('');

	const BADGE: Record<AssetStatus, string> = {
		ok: 'good',
		missing: 'warn',
		placeholder: 'info',
		synthesized: 'info',
		unused: ''
	};
	const KIND_NAME = Object.fromEntries(ASSET_KINDS.map((k) => [k.id, k.label.toLowerCase()]));
	const STATUS_NAME = Object.fromEntries(ASSET_STATUSES.map((s) => [s.id, s.label]));

	/** "27 sounds synthesized · 1 picture missing": everything that isn't OK. */
	const summary = $derived(
		ASSET_KINDS.flatMap(({ id }) =>
			ASSET_STATUSES.filter((s) => s.id !== 'ok' && data.counts[id][s.id] > 0).map(
				(s) => `${data.counts[id][s.id]} ${KIND_NAME[id]} ${s.label.toLowerCase()}`
			)
		)
	);

	const total = (of: AssetStatus | null, inKind: AssetKind | null = kind): number =>
		ASSET_KINDS.filter((k) => !inKind || k.id === inKind).reduce(
			(sum, k) =>
				sum +
				(of ? data.counts[k.id][of] : Object.values(data.counts[k.id]).reduce((a, b) => a + b, 0)),
			0
		);

	const shown = $derived.by(() => {
		const query = search.trim().toLowerCase();
		return data.rows.filter(
			(row) =>
				(!kind || row.kind === kind) &&
				(!status || row.status === status) &&
				(!query ||
					row.id.toLowerCase().includes(query) ||
					row.usedBy.some((who) => who.toLowerCase().includes(query)))
		);
	});

	const sections = $derived(
		ASSET_KINDS.map((k) => ({ ...k, rows: shown.filter((row) => row.kind === k.id) })).filter(
			(section) => section.rows.length > 0
		)
	);

	/** An asset's preview, served by this app (assets/file), so the game site needn't be running. */
	const url = (path: string): string => `/assets/file/${path.replace(/^\/assets\//, '')}`;
	const isImage = (path: string): boolean => /\.(webp|png|jpe?g)$/.test(path);

	/** A sound playing: its recording (`file`) or its placeholder made in code (`synth`). */
	type Source = 'file' | 'synth';
	interface Playback {
		id: string;
		source: Source;
		stop: () => void;
	}

	/** The sound playing now, so a second press stops it. Raw: compared by identity. */
	let playing = $state.raw<Playback | null>(null);
	/** Why the last sound didn't play. */
	let playError = $state<string | null>(null);
	/** Made on the first synth played (a browser only allows it after a press). */
	let context: AudioContext | null = null;

	const isPlaying = (row: AssetRow, source: Source): boolean =>
		playing?.id === row.id && playing.source === source;

	const failed = (row: AssetRow, failure: unknown): string =>
		`${row.id} didn't play: ${failure instanceof Error ? failure.message : String(failure)}`;

	/** Stop whatever is playing; true when it was this very sound (the press means stop). */
	function stopPlaying(row: AssetRow, source: Source): boolean {
		const was = playing;
		playing = null;
		was?.stop();
		return was?.id === row.id && was.source === source;
	}

	function finished(playback: Playback): void {
		if (playing === playback) playing = null;
	}

	function playFile(row: AssetRow): void {
		if (stopPlaying(row, 'file') || row.files.length === 0) return;
		const audio = new Audio(url(row.files[Math.floor(Math.random() * row.files.length)]));
		const playback: Playback = { id: row.id, source: 'file', stop: () => audio.pause() };
		audio.addEventListener('ended', () => finished(playback));
		playing = playback;
		playError = null;
		void audio.play().catch((failure: unknown) => {
			finished(playback);
			playError = failed(row, failure);
		});
	}

	/** Render the sound's synth and play it once, at the volume and rate the game plays it. */
	function playSynth(row: AssetRow): void {
		if (stopPlaying(row, 'synth') || !row.synth) return;
		try {
			context ??= new AudioContext();
			const source = context.createBufferSource();
			source.buffer = synthesize(context, row.synth.spec);
			source.playbackRate.value = row.synth.rate;
			const gain = context.createGain();
			gain.gain.value = row.synth.volume;
			source.connect(gain).connect(context.destination);
			const playback: Playback = { id: row.id, source: 'synth', stop: () => source.stop() };
			source.addEventListener('ended', () => finished(playback));
			playing = playback;
			playError = null;
			void context.resume();
			source.start();
		} catch (failure) {
			playError = failed(row, failure);
		}
	}
</script>

<svelte:head><title>Art & Assets · Undercroft Admin</title></svelte:head>

<h1>Art & Assets</h1>
<p class="muted">
	Every model, map piece, picture, sound and animation the game uses or names, from the built
	manifests, the content data and the source, as checked out where this app runs. Levels come from
	<code>pnpm asset:levels</code>.
</p>

{#if summary.length}
	<p class="summary">{summary.join(' · ')}</p>
{:else}
	<p class="summary">Everything is in.</p>
{/if}

{#if playError}<p class="error" role="alert">{playError}</p>{/if}

<div class="filters">
	<div class="toolbar" role="group" aria-label="Kind">
		<button type="button" aria-pressed={kind === null} onclick={() => (kind = null)}>
			All <span class="count">{total(status, null)}</span>
		</button>
		{#each ASSET_KINDS as k (k.id)}
			<button type="button" aria-pressed={kind === k.id} onclick={() => (kind = k.id)}>
				{k.label} <span class="count">{total(status, k.id)}</span>
			</button>
		{/each}
	</div>
	<div class="toolbar" role="group" aria-label="Status">
		<button type="button" aria-pressed={status === null} onclick={() => (status = null)}>
			Any status <span class="count">{total(null)}</span>
		</button>
		{#each ASSET_STATUSES as s (s.id)}
			<button
				type="button"
				title={s.hint}
				aria-pressed={status === s.id}
				onclick={() => (status = s.id)}
			>
				{s.label} <span class="count">{total(s.id)}</span>
			</button>
		{/each}
	</div>
	<input
		type="search"
		placeholder="Search by name or use"
		aria-label="Search"
		bind:value={search}
	/>
</div>

{#each sections as section (section.id)}
	<section>
		<h2>{section.label} <span class="muted">{section.rows.length}</span></h2>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Asset</th>
						<th>Used by</th>
						<th>Status</th>
						<th class="number">Size</th>
						{#if section.id === 'sound'}<th class="number">Plays at</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each section.rows as row (row.id)}
						<tr>
							<td>
								<div class="asset">
									{#if row.files.length && isImage(row.files[0])}
										<img src={url(row.files[0])} alt="" loading="lazy" />
									{:else if row.kind === 'sound' && (row.files.length || row.synth)}
										{@const source = row.files.length ? 'file' : 'synth'}
										<button
											type="button"
											class="play"
											title={source === 'synth' ? 'Made in code' : undefined}
											aria-label="{isPlaying(row, source) ? 'Stop' : 'Play'} {row.id}"
											onclick={() => (source === 'file' ? playFile(row) : playSynth(row))}
											>{isPlaying(row, source) ? '■' : '▶'}</button
										>
									{/if}
									<div>
										<code>{row.id}</code>
										{#if row.note}<p class="muted note">{row.note}</p>{/if}
										{#if row.files.length && row.synth}
											<button
												type="button"
												class="synth"
												title="The placeholder made in code, played when the recording isn't built"
												aria-label="{isPlaying(row, 'synth') ? 'Stop' : 'Play'} {row.id}'s synth"
												onclick={() => playSynth(row)}
												>{isPlaying(row, 'synth') ? '■' : '▶'} synth ({row.synth.spec.kind})</button
											>
										{/if}
										{#if row.slots}
											<ul class="slots">
												{#each row.slots as slot (slot.slot)}
													<li
														class:absent={slot.absent}
														class:pose={slot.pose}
														class:fallback={!slot.clip}
														title={slot.clip
															? `${slot.clip}${slot.absent ? ' (not in the file)' : slot.pose ? ' (held pose)' : ''}`
															: slot.fallback
																? `No clip: plays ${slot.fallback}`
																: 'No clip: whatever was playing carries on'}
													>
														{slot.slot}{#if !slot.clip}
															→ {slot.fallback ?? '—'}{/if}
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								</div>
							</td>
							<td>
								<div class="used">
									{#if row.usedBy.length}
										{#each row.usedBy.slice(0, 4) as who (who)}<span>{who}</span>{/each}
										{#if row.usedBy.length > 4}
											<span class="muted" title={row.usedBy.slice(4).join('\n')}
												>+{row.usedBy.length - 4} more</span
											>
										{/if}
									{:else}
										<span class="muted">Nothing</span>
									{/if}
								</div>
							</td>
							<td><span class="badge {BADGE[row.status]}">{STATUS_NAME[row.status]}</span></td>
							<td class="number">
								{row.bytes ? bytes(row.bytes) : '—'}
								{#if row.files.length > 1}<p class="muted note">{row.files.length} files</p>{/if}
							</td>
							{#if section.id === 'sound'}
								<td class="number">
									{#if row.level}
										{row.level.lufs.toFixed(1)} LUFS
										{#if row.level.stale}<p class="muted note">out of date</p>{/if}
									{:else}
										<span class="muted">—</span>
									{/if}
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{:else}
	<p class="muted">Nothing matches.</p>
{/each}

<style>
	.summary {
		font-size: 17px;
		margin: 0 0 16px;
	}

	.filters {
		display: grid;
		gap: 8px;
		margin-bottom: 20px;
	}

	.filters input {
		max-width: 320px;
	}

	button[aria-pressed='true'] {
		border-color: var(--accent);
		color: #fff;
	}

	.count {
		color: var(--muted);
		margin-left: 4px;
	}

	section {
		margin-bottom: 28px;
	}

	h2 {
		margin: 0 0 10px;
		font-size: 22px;
	}

	.asset {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}

	.asset img {
		width: 48px;
		height: 48px;
		object-fit: contain;
		background: rgb(0 0 0 / 0.3);
		border-radius: 4px;
		flex: none;
	}

	.play {
		width: 32px;
		height: 32px;
		padding: 0;
		flex: none;
	}

	.synth {
		margin-top: 4px;
		padding: 1px 8px;
		font-size: 12px;
	}

	.note {
		margin: 2px 0 0;
		font-size: 13px;
	}

	.used {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 10px;
		max-width: 360px;
	}

	.number {
		text-align: right;
		white-space: nowrap;
	}

	.slots {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.slots li {
		font-size: 12px;
		padding: 1px 6px;
		border-radius: 3px;
		border: 1px solid var(--border);
	}

	.slots li.fallback {
		color: var(--muted);
		border-style: dashed;
	}

	.slots li.pose {
		border-color: #6aa0c0;
	}

	.slots li.absent {
		border-color: #c07a3a;
		color: #e0a060;
	}
</style>
