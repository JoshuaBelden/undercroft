<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { signOut } from '#lib/account/account.svelte.ts';
	import { openBugReport } from '#lib/game/crash.svelte.ts';
	import { menu as padMenu } from '#lib/game/input/menus.ts';
	import Avatar from '#lib/ui/Avatar.svelte';

	/**
	 * The avatar and gamer tag at the top right of the dashboard, as a menu: the Account screen, ideas and
	 * feedback, reporting a bug, and signing out. Closes on Escape, on a click anywhere else, and once something is chosen.
	 */
	interface Props {
		gamerTag: string;
		/** Their avatar's URL, or null (a figure shows instead). */
		avatar: string | null;
	}

	let { gamerTag, avatar }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();
	let button = $state<HTMLButtonElement>();
	let menu = $state<HTMLElement>();

	const items = (): HTMLElement[] => [
		...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
	];

	async function show(focus: 'first' | 'last' | null): Promise<void> {
		open = true;
		await tick();
		if (focus) items()[focus === 'first' ? 0 : items().length - 1]?.focus();
	}

	function close(refocus: boolean): void {
		open = false;
		if (refocus) button?.focus();
	}

	function onButtonKey(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			void show('first');
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			void show('last');
		}
	}

	function onMenuKey(event: KeyboardEvent): void {
		const all = items();
		const at = all.indexOf(document.activeElement as HTMLElement);
		if (event.key === 'Escape') {
			// Only the menu: the page's own Escape (back out a step) waits for the next press.
			event.preventDefault();
			event.stopPropagation();
			close(true);
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const by = event.key === 'ArrowDown' ? 1 : -1;
			all[(at + by + all.length) % all.length]?.focus();
		} else if (event.key === 'Tab') {
			close(false);
		}
	}

	function onWindowClick(event: MouseEvent): void {
		if (open && root && !root.contains(event.target as Node)) close(false);
	}
</script>

<svelte:window onclick={onWindowClick} />

<div class="account-menu" bind:this={root}>
	<button
		type="button"
		class="tag"
		class:open
		aria-haspopup="menu"
		aria-expanded={open}
		bind:this={button}
		onclick={() => (open ? close(false) : void show(null))}
		onkeydown={onButtonKey}
	>
		<Avatar src={avatar} size={28} />
		<span>{gamerTag}</span>
		<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
			<path fill="none" stroke="currentColor" stroke-width="1.6" d="M2.5 4.5 6 8l3.5-3.5" />
		</svg>
	</button>

	{#if open}
		<div
			class="menu"
			role="menu"
			tabindex="-1"
			bind:this={menu}
			onkeydown={onMenuKey}
			{@attach padMenu({ back: () => close(true) })}
		>
			<a role="menuitem" href={resolve('/account')} onclick={() => close(false)}>Account</a>
			<a role="menuitem" href={resolve('/(hub)/feedback')} onclick={() => close(false)}>
				Ideas and feedback
			</a>
			<button
				type="button"
				role="menuitem"
				onclick={() => {
					close(false);
					openBugReport();
				}}
			>
				Report a bug
			</button>
			<button
				type="button"
				role="menuitem"
				onclick={() => {
					close(false);
					void signOut();
				}}
			>
				Sign out
			</button>
		</div>
	{/if}
</div>

<style>
	.account-menu {
		position: relative;
	}

	/* The dashboard's pill (the Social button's style, src/routes/(hub)/+layout.svelte), a little shorter for the bar. */
	.tag {
		height: 36px;
		display: flex;
		align-items: center;
		gap: 10px;
		/* The avatar sits in the pill's round left end. */
		padding: 0 14px 0 3px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: rgb(4 3 3 / 0.92);
		color: var(--text);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.tag:hover,
	.tag:focus-visible,
	.tag.open {
		border-color: var(--accent);
	}

	.tag svg {
		display: block;
		transition: transform 0.15s;
	}

	.tag.open svg {
		transform: rotate(180deg);
	}

	.menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 30;
		min-width: 160px;
		display: flex;
		flex-direction: column;
		padding: 6px;
		border-radius: 8px;
		background: rgb(10 9 8 / 0.82);
		backdrop-filter: blur(6px);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.5);
	}

	.menu [role='menuitem'] {
		padding: 8px 12px;
		border: none;
		background: none;
		color: var(--text);
		font-family: var(--font-ui);
		font-size: 0.9rem;
		text-align: left;
		text-decoration: none;
	}

	.menu [role='menuitem']:hover,
	.menu [role='menuitem']:focus-visible {
		background: rgb(255 255 255 / 0.1);
		outline: none;
	}
</style>
