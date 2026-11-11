<script lang="ts">
	interface Props {
		/** Who is being watched; empty while there is nobody to show yet. */
		name: string;
		onnext: () => void;
		onleave: () => void;
	}

	let { name, onnext, onleave }: Props = $props();
</script>

<div class="bar">
	<span class="label">You are dead</span>
	<span class="watching">{name ? `Watching ${name}` : 'Waiting for the others...'}</span>
	<button type="button" onclick={onnext}>Next</button>
	<button type="button" onclick={onleave}>Leave</button>
</div>

<style>
	.bar {
		position: fixed;
		left: 50%;
		bottom: 28px;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 8px 14px;
		font:
			12px ui-monospace,
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #e8dfcf;
		background: rgb(0 0 0 / 0.7);
		border: 1px solid rgb(232 223 207 / 0.15);
		z-index: 6;
	}

	.label {
		color: rgb(200 90 70 / 0.9);
	}

	.watching {
		max-width: 40vw;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	button {
		font: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
	}
</style>
