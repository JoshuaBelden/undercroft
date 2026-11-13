<script lang="ts">
	import { crashes, openBugReport } from '#lib/game/crash.svelte.ts';
	import Dialog from './Dialog.svelte';

	/**
	 * Asks whether to report an error that just happened (`promptCrash`). Nothing is sent unless
	 * the player chooses to; "Report it" opens the bug report form with the error attached.
	 */
	const crash = $derived(crashes.pending);
	const where = $derived(
		crash?.source === 'game'
			? 'on the game server'
			: crash?.source === 'web'
				? 'on our side'
				: 'in the game'
	);
</script>

{#if crash}
	<Dialog title="Something went wrong" onclose={() => (crashes.pending = null)}>
		<p>An error happened {where}. Would you send us a report about it?</p>
		<p>The error is attached for you; a sentence about what you were doing helps a lot.</p>
		{#snippet footer()}
			<button type="button" onclick={() => (crashes.pending = null)}>Not now</button>
			<button type="button" class="primary" onclick={() => openBugReport(crash)}>Report it</button>
		{/snippet}
	</Dialog>
{/if}
