<script lang="ts">
	import { sellPrice } from '#lib/content/economy.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import Dialog from './Dialog.svelte';
	import type { ItemBoard } from './itemBoard.svelte.ts';
	import ItemMenu from './ItemMenu.svelte';
	import ItemTooltip from './ItemTooltip.svelte';
	import { stackLabel } from './items.ts';
	import QuantityDialog from './QuantityDialog.svelte';

	/**
	 * Everything a screen of item slots shows on top of them: the tooltip, the alternate menu and
	 * the dialogs (how many to split or sell, whether to really drop). Put one beside the slots,
	 * with the screen's `ItemBoard`.
	 */
	interface Props {
		board: ItemBoard;
	}

	let { board }: Props = $props();

	const asking = $derived(board.asking);
	const askingName = $derived(asking ? (ITEMS[asking.stack.item]?.name ?? asking.stack.item) : '');
</script>

{#if board.pointed}
	<ItemTooltip stack={board.pointed.stack} anchor={board.pointed.rect} />
{/if}

{#if board.menu}
	{@const menu = board.menu}
	<ItemMenu
		title={stackLabel(menu.stack)}
		entries={board.entries(menu.ref, menu.stack)}
		x={menu.x}
		y={menu.y}
		onchoose={(id) => board.choose(id)}
		onclose={() => board.closeMenu()}
	/>
{/if}

{#if asking?.kind === 'split'}
	<QuantityDialog
		title="Split"
		name={askingName}
		max={asking.stack.count - 1}
		confirm="Split"
		onconfirm={(count) => board.answer(count)}
		onclose={() => board.cancel()}
	/>
{:else if asking?.kind === 'sell'}
	<QuantityDialog
		title="Sell"
		name={askingName}
		max={asking.stack.count}
		confirm="Sell"
		each={sellPrice(asking.stack.item)}
		price={(amount) => board.price(amount)}
		onconfirm={(count) => board.answer(count)}
		onclose={() => board.cancel()}
	/>
{:else if asking?.kind === 'drop'}
	<Dialog title="Drop" onclose={() => board.cancel()}>
		<p>Drop <strong>{stackLabel(asking.stack)}</strong>?</p>
		<p>Up here there is nowhere for it to land. It will be gone for good.</p>
		{#snippet footer()}
			<button type="button" onclick={() => board.cancel()}>Keep it</button>
			<button type="button" class="primary" onclick={() => board.answer(0)}>Drop it</button>
		{/snippet}
	</Dialog>
{/if}
