<script lang="ts" module>
	/** One explorer on the expedition, as the party HUD shows them. */
	export interface PartyMember {
		id: string;
		/** Gamer tag. */
		name: string;
		/** This player (always drawn last, at the bottom). */
		self: boolean;
		/** 0..1 (sanity is health). */
		health: number;
		/** 0..1; breath while underwater. */
		stamina: number;
		exhausted: boolean;
		underwater: boolean;
		downed: boolean;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Teammates in a stable order, then this player. */
		members: PartyMember[];
		/** Drawn under this player's bars (lamp, posture). */
		children?: Snippet;
	}

	let { members, children }: Props = $props();

	// This player always sits at the bottom, whatever order the list came in.
	const ordered = $derived([
		...members.filter((member) => !member.self),
		...members.filter((member) => member.self)
	]);
</script>

<div class="party" aria-label="Party">
	{#each ordered as member (member.id)}
		<div class="member" class:self={member.self} class:downed={member.downed}>
			<div class="name">
				<span class="tag">{member.name || 'Explorer'}</span>
				{#if member.downed}<span class="state">Downed</span>{/if}
			</div>
			<div class="bar health" class:low={member.health < 0.4} aria-label="Health">
				<div class="fill" style:width="{member.health * 100}%"></div>
			</div>
			<div
				class="bar stamina"
				class:exhausted={member.exhausted}
				class:underwater={member.underwater}
				aria-label={member.underwater ? 'Breath' : 'Stamina'}
			>
				<div class="fill" style:width="{member.stamina * 100}%"></div>
			</div>
			{#if member.self && children}{@render children()}{/if}
		</div>
	{/each}
</div>

<style>
	.party {
		position: fixed;
		left: 16px;
		bottom: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		pointer-events: none;
	}

	.member {
		display: flex;
		flex-direction: column;
		gap: 3px;
		width: 160px;
	}

	.member.self {
		width: 200px;
	}

	.name {
		display: flex;
		gap: 8px;
		align-items: baseline;
		font: 10px var(--font-ui);
		letter-spacing: 0.08em;
		color: var(--muted);
	}

	.tag {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.state {
		text-transform: uppercase;
		color: rgb(200 90 70 / 0.9);
	}

	.bar {
		height: 3px;
		background: rgb(255 255 255 / 0.08);
	}

	.member.self .bar.health {
		height: 5px;
	}

	.fill {
		height: 100%;
		transition: width 0.25s ease-out;
	}

	.health .fill {
		background: rgb(190 170 200 / 0.65);
	}

	.health.low .fill,
	.downed .health .fill {
		background: rgb(190 60 60 / 0.8);
	}

	.stamina .fill {
		background: rgb(220 210 190 / 0.6);
		transition: none;
	}

	.stamina.underwater .fill {
		background: rgb(120 170 210 / 0.75);
	}

	.stamina.exhausted .fill {
		background: rgb(200 90 70 / 0.7);
	}

	.downed .name .tag {
		color: rgb(200 90 70 / 0.9);
	}
</style>
