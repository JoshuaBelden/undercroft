<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/account/account.svelte.ts';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { SoundBank } from '#lib/game/audio/SoundBank.ts';
	import { connection, me, send } from '#lib/game/net/connection.svelte.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import { launch } from '#lib/ui/launch.svelte.ts';
	import Outfit from '#lib/ui/Outfit.svelte';

	const explorer = $derived(session.account?.explorer ?? null);
	const ready = $derived(me()?.ready ?? false);
	/** Asked to confirm the loadout for a launch, and still able to. */
	const confirming = $derived(
		launch.confirming && !ready && !!connection.party?.affliction && !connection.party.expedition
	);

	let outfit = $state<Outfit | null>(null);
	let busy = $state(false);

	const audio = new AudioManager({ ...settings.audio });
	const sounds = new SoundBank(audio);

	/** Something was put down in a slot, sold or thrown away. */
	function changed(kind: 'move' | 'sell' | 'drop'): void {
		for (const category of ['master', 'sfx'] as const) {
			audio.setVolume(category, settings.audio[category]);
		}
		void audio.unlock().then(() => sounds.play(kind === 'sell' ? 'shop.sell' : 'inventory.drop'));
	}

	/** This loadout is the one: ready to descend, and back to the party. */
	async function confirm(): Promise<void> {
		if (busy) return;
		busy = true;
		// Changes still on their way to the server go first: being ready locks the loadout.
		await outfit?.settled();
		send({ type: 'ready', ready: true });
		launch.confirming = false;
		await goto(resolve('/(hub)'));
	}

	function back(): void {
		launch.confirming = false;
		void goto(resolve('/(hub)'));
	}

	onMount(() => () => {
		// Leaving the page any other way is not confirming.
		launch.confirming = false;
		audio.dispose();
	});
</script>

<!-- A full-width page: no centred column. -->
{#if explorer}
	<Outfit bind:this={outfit} {explorer} {ready} onchange={changed} />
	{#if confirming}
		<div class="confirm" role="group" aria-label="Confirm your loadout">
			<p>This is what you take down. Change anything you like, then confirm.</p>
			<button type="button" class="back" onclick={back}>Back</button>
			<button type="button" class="go" disabled={busy} onclick={() => void confirm()}>
				Confirm loadout
			</button>
		</div>
	{/if}
{:else}
	<p class="muted">Loading...</p>
{/if}

<style>
	.muted {
		margin: 32px 16px;
		color: var(--muted);
	}

	/* Along the bottom, in the middle: clear of the corner buttons. */
	.confirm {
		position: fixed;
		left: 50%;
		bottom: 20px;
		translate: -50% 0;
		max-width: calc(100vw - 32px);
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px 12px 10px 22px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: rgb(14 12 10 / 0.9);
		backdrop-filter: blur(6px);
	}

	.confirm p {
		margin: 0;
		color: var(--muted);
	}

	.confirm button {
		flex: none;
		padding: 10px 20px;
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.back {
		border-color: var(--text);
	}

	.back:hover,
	.back:focus-visible {
		border-color: var(--text);
		background: rgb(255 255 255 / 0.1);
	}

	/* The same dark yellow as the Launch button it follows. */
	.go {
		border-color: var(--launch);
		background: var(--launch);
		color: #14110f;
		font-weight: 700;
	}

	.go:hover:not(:disabled),
	.go:focus-visible {
		border-color: var(--launch-bright);
		background: var(--launch-bright);
	}

	.go:disabled {
		opacity: 0.45;
	}

	@media (max-width: 720px) {
		.confirm {
			bottom: 76px;
			flex-wrap: wrap;
			justify-content: center;
			border-radius: 18px;
			padding: 12px;
		}
	}
</style>
