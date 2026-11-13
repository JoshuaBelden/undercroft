<script lang="ts">
	import AuthForm from '#lib/ui/AuthForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AuthForm mode="sign-in" discord={data.discord} />
