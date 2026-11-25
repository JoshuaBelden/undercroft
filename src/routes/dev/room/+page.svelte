<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { listRooms, onRoomChanged, type RoomFile } from '#lib/game/rooms/files.ts';

	/** The room viewer's picker: every room the dev server can show (docs/dev/room-viewer.md). */
	let rooms = $state.raw<RoomFile[]>([]);
	let problem = $state<string | null>(null);

	async function refresh(): Promise<void> {
		try {
			rooms = await listRooms();
			problem = null;
		} catch (err) {
			problem = err instanceof Error ? err.message : String(err);
		}
	}

	onMount(() => {
		void refresh();
		return onRoomChanged(() => void refresh());
	});

	const when = (ms: number) => new Date(ms).toLocaleString();
</script>

<svelte:head><title>Room viewer · Undercroft</title></svelte:head>

<main>
	<h1>Room viewer</h1>
	<p class="muted">
		Dev only. Rooms are read straight from Blender's exports; re-export one and an open viewer
		reloads it. See <code>docs/dev/room-viewer.md</code>.
	</p>
	{#if problem}
		<p class="problem">{problem}. The room viewer needs <code>pnpm dev</code>.</p>
	{/if}
	<section>
		<h2>Rooms <span class="muted">art/export/rooms/&lt;room&gt;.glb</span></h2>
		{#if rooms.length === 0}
			<p class="muted">None exported yet.</p>
		{:else}
			<ul>
				{#each rooms as room (room.name)}
					<li>
						<a href={resolve('/dev/room/[room]', { room: room.name })}>{room.name}</a>
						<span class="muted">
							{(room.bytes / 1e6).toFixed(1)} MB · {when(room.changed)}{room.lightmap
								? ' · lightmap'
								: ''}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 720px;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: var(--font-ui);
		color: var(--text);
	}
	h1,
	h2 {
		font-family: var(--font-display);
	}
	h2 .muted {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: normal;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--border);
	}
	a {
		color: var(--text);
	}
	.muted {
		color: var(--muted);
	}
	.problem {
		color: var(--broken);
	}
</style>
