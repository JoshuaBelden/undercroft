<script lang="ts">
	import { onMount } from 'svelte';
	import { session } from '#lib/account/account.svelte.ts';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { SoundBank } from '#lib/game/audio/SoundBank.ts';
	import { me } from '#lib/game/net/connection.svelte.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import SkillTree from '#lib/ui/SkillTree.svelte';

	const explorer = $derived(session.account?.explorer ?? null);
	const ready = $derived(me()?.ready ?? false);

	const audio = new AudioManager({ ...settings.audio });
	const sounds = new SoundBank(audio);

	function sound(kind: 'unlock' | 'rank' | 'mastered' | 'denied' | 'respec'): void {
		for (const category of ['master', 'sfx'] as const) {
			audio.setVolume(category, settings.audio[category]);
		}
		void audio.unlock().then(() => sounds.play(`skills.${kind}`));
	}

	onMount(() => () => audio.dispose());
</script>

{#if explorer}
	<SkillTree {explorer} locked={ready || explorer.underground} onsound={sound} />
{:else}
	<p class="muted">Loading...</p>
{/if}

<style>
	.muted {
		margin: 32px;
		color: var(--muted);
	}
</style>
