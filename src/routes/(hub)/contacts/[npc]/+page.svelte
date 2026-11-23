<script lang="ts">
	import { onMount } from 'svelte';
	import { session } from '#lib/account/account.svelte.ts';
	import type { SoundId } from '#lib/content/audio/sounds.ts';
	import { NPCS } from '#lib/content/npcs.ts';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { SoundBank } from '#lib/game/audio/SoundBank.ts';
	import { me } from '#lib/game/net/connection.svelte.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import Contact from '#lib/ui/Contact.svelte';
	import { greet } from '#lib/ui/greetings.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const explorer = $derived(session.account?.explorer ?? null);
	const ready = $derived(me()?.ready ?? false);

	const audio = new AudioManager({ ...settings.audio });
	const sounds = new SoundBank(audio);

	/** At the volumes the player set (they may have changed since the page opened). */
	function play(sound: SoundId): void {
		for (const category of ['master', 'sfx'] as const) {
			audio.setVolume(category, settings.audio[category]);
		}
		void audio.unlock().then(() => sounds.play(sound));
	}

	function changed(kind: 'commit' | 'report' | 'buy'): void {
		play(kind === 'commit' ? 'quest.commit' : kind === 'report' ? 'quest.done' : 'shop.buy');
	}

	// Opening their page, they greet you: one of their lines, unless they did a little while ago.
	$effect(() => {
		const voice = NPCS[data.npc]?.voice;
		if (voice && greet(data.npc, voice.every)) play(voice.sound as SoundId);
	});

	onMount(() => () => audio.dispose());
</script>

{#if explorer}
	{#key data.npc}
		<Contact
			npcId={data.npc}
			{explorer}
			locked={ready || explorer.underground}
			onchange={changed}
		/>
	{/key}
{:else}
	<p class="muted">Loading...</p>
{/if}

<style>
	.muted {
		margin: 32px;
		color: var(--muted);
	}
</style>
