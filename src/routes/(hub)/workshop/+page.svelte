<script lang="ts">
	import { onMount } from 'svelte';
	import { session } from '#lib/account/account.svelte.ts';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { SoundBank } from '#lib/game/audio/SoundBank.ts';
	import { me } from '#lib/game/net/connection.svelte.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import Workshop from '#lib/ui/Workshop.svelte';
	import { workshopAsk } from '#lib/ui/workshop.svelte.ts';

	const explorer = $derived(session.account?.explorer ?? null);
	const ready = $derived(me()?.ready ?? false);
	/** Repair in an item's menu sends it here with the slot to mend (taken once). */
	const preselect = workshopAsk.repair;
	workshopAsk.repair = null;

	const audio = new AudioManager({ ...settings.audio });
	const sounds = new SoundBank(audio);

	function changed(kind: 'craft' | 'repair'): void {
		for (const category of ['master', 'sfx'] as const) {
			audio.setVolume(category, settings.audio[category]);
		}
		void audio.unlock().then(() => sounds.play(`workshop.${kind}`));
	}

	onMount(() => () => audio.dispose());
</script>

{#if explorer}
	<Workshop {explorer} locked={ready || explorer.underground} {preselect} onchange={changed} />
{:else}
	<p class="muted">Loading...</p>
{/if}

<style>
	.muted {
		margin: 32px;
		color: var(--muted);
	}
</style>
