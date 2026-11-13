<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';

	/**
	 * A button that runs one form action on the current page (`?/name`), asking first when
	 * `confirm` is given. Extra fields go in `children`.
	 */
	interface Props {
		action: string;
		label: string;
		confirm?: string;
		danger?: boolean;
		primary?: boolean;
		/** Hidden fields sent with it. */
		fields?: Record<string, string>;
		children?: Snippet;
	}

	let {
		action,
		label,
		confirm,
		danger = false,
		primary = false,
		fields = {},
		children
	}: Props = $props();
</script>

<form
	method="POST"
	action="?/{action}"
	use:enhance={({ cancel }) => {
		if (confirm && !window.confirm(confirm)) cancel();
		return async ({ update }) => update({ reset: false });
	}}
>
	{#each Object.entries(fields) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
	{@render children?.()}
	<button type="submit" class:danger class:primary>{label}</button>
</form>

<style>
	form {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
</style>
