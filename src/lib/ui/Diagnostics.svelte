<script lang="ts">
	import { api } from '#lib/account/account.svelte.ts';
	import { BENCHMARK, BENCHMARK_SECONDS } from '#lib/content/diagnostics.ts';
	import { REPORT } from '#lib/content/reports.ts';
	import {
		BenchmarkCancelled,
		runBenchmark,
		type BenchmarkProgress
	} from '#lib/game/benchmark/Benchmark.ts';
	import { closeDiagnostics } from '#lib/game/benchmark/state.svelte.ts';
	import { collectDiagnostics } from '#lib/game/diagnostics.ts';
	import { menu } from '#lib/game/input/menus.ts';
	import type { BenchmarkResult } from '#lib/shared/diagnostics.ts';
	import type { ReportInput } from '#lib/shared/reports.ts';
	import Dialog from './Dialog.svelte';

	/**
	 * Run Diagnostics, from the account menu: says what it will do, runs the benchmark full screen
	 * (Escape or the controller's B cancels), then shows the numbers and offers to send them. Sent
	 * like a bug report and filed on GitHub labelled `diagnostics`. See docs/dev/diagnostics.md.
	 */

	type Phase = 'intro' | 'running' | 'done' | 'failed' | 'sent';

	let phase = $state<Phase>('intro');
	let progress = $state<BenchmarkProgress | null>(null);
	let result = $state.raw<BenchmarkResult | null>(null);
	let failure = $state('');
	let note = $state('');
	let sending = $state(false);
	let error = $state('');
	let issue = $state<number | null>(null);
	let canvas = $state<HTMLCanvasElement>();
	let controller: AbortController | null = null;

	/** The browser and GPU, gathered with the results so what is shown is what is sent. */
	let diagnostics = $state.raw(collectDiagnostics());

	async function start(): Promise<void> {
		phase = 'running';
		progress = null;
		failure = '';
		controller = new AbortController();
		// Wait for the canvas to be on screen, with its size.
		await new Promise((resolve) => requestAnimationFrame(resolve));
		if (!canvas || controller.signal.aborted) return;
		try {
			result = await runBenchmark(canvas, (next) => (progress = next), controller.signal);
			diagnostics = collectDiagnostics();
			phase = 'done';
		} catch (thrown) {
			if (thrown instanceof BenchmarkCancelled && thrown.message === 'Cancelled') {
				phase = 'intro';
				return;
			}
			console.error('Diagnostics failed', thrown);
			failure = (thrown as Error).message;
			phase = 'failed';
		} finally {
			controller = null;
		}
	}

	function cancel(): void {
		if (controller) controller.abort();
		else phase = 'intro';
	}

	function close(): void {
		controller?.abort();
		closeDiagnostics();
	}

	/** The fullscreen run: a modal dialog, so Escape cancels it and the page behind takes no input. */
	function runner(dialog: HTMLDialogElement): () => void {
		const quiet = (event: KeyboardEvent): void => event.stopPropagation();
		dialog.addEventListener('keydown', quiet);
		dialog.showModal();
		return () => {
			dialog.removeEventListener('keydown', quiet);
			dialog.close();
		};
	}

	function title(): string {
		const gpu = diagnostics.gpu ?? 'unknown GPU';
		return `Diagnostics: ${gpu}`.slice(0, REPORT.titleMax);
	}

	async function send(): Promise<void> {
		if (!result) return;
		error = '';
		sending = true;
		const body: ReportInput = {
			title: title(),
			description: note,
			steps: '',
			diagnostics,
			benchmark: result
		};
		try {
			({ issue } = await api<{ issue: number | null }>('/api/report', 'POST', body));
			phase = 'sent';
		} catch (thrown) {
			error = (thrown as Error).message;
		} finally {
			sending = false;
		}
	}
</script>

{#if phase === 'running'}
	<dialog
		class="runner"
		aria-label="Running diagnostics"
		{@attach runner}
		{@attach menu({ back: cancel })}
		oncancel={(event) => {
			event.preventDefault();
			cancel();
		}}
	>
		<canvas bind:this={canvas}></canvas>
		<div class="bar">
			<div class="status" role="status">
				{#if !progress || progress.phase === 'loading'}
					Loading the catacombs…
				{:else}
					Measuring {progress.label} ({progress.stage} of {BENCHMARK.stages.length})
				{/if}
			</div>
			<div class="track" aria-hidden="true">
				<div class="fill" style:width="{Math.round((progress?.fraction ?? 0) * 100)}%"></div>
			</div>
			<button type="button" onclick={cancel}>Cancel</button>
		</div>
	</dialog>
{:else if phase === 'intro'}
	<Dialog title="Run diagnostics" onclose={close}>
		<p>
			Walks through the same stretch of catacombs at each graphics quality, about {Math.ceil(
				BENCHMARK_SECONDS
			)} seconds after it loads, and measures how smoothly it draws.
		</p>
		<p>
			Keep this screen in front while it runs. Your settings are not changed. Afterwards you see the
			numbers and can send them to us.
		</p>
		{#snippet footer()}
			<button type="button" onclick={close}>Cancel</button>
			<button type="button" class="primary" onclick={() => void start()}>Start</button>
		{/snippet}
	</Dialog>
{:else if phase === 'failed'}
	<Dialog title="Diagnostics stopped" onclose={close}>
		<p>It couldn't finish: {failure}.</p>
		{#snippet footer()}
			<button type="button" onclick={close}>Close</button>
			<button type="button" class="primary" onclick={() => void start()}>Try again</button>
		{/snippet}
	</Dialog>
{:else if phase === 'sent'}
	<Dialog title="Diagnostics sent" onclose={close}>
		<p>Thank you. They're with us{issue ? ` as issue #${issue}` : ''}.</p>
		{#snippet footer()}
			<button type="button" class="primary" onclick={close}>Close</button>
		{/snippet}
	</Dialog>
{:else if result}
	<Dialog title="Diagnostics" onclose={close} wide>
		<table>
			<thead>
				<tr>
					<th>Quality</th>
					<th>FPS</th>
					<th>1% low</th>
					<th>Draws</th>
					<th>Triangles</th>
				</tr>
			</thead>
			<tbody>
				{#each result.stages as stage (stage.id)}
					<tr>
						<td>{stage.label}</td>
						<td>{stage.fps}</td>
						<td>{stage.lowFps}</td>
						<td>{stage.drawCalls}</td>
						<td>{stage.triangles.toLocaleString()}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="note">
			Your screen refreshes {result.device.refreshHz} times a second: no quality draws faster than that.
		</p>
		<form
			id="diagnostics"
			onsubmit={(event) => {
				event.preventDefault();
				void send();
			}}
		>
			<label>
				Anything to add <span class="optional">(optional)</span>
				<textarea
					bind:value={note}
					maxlength={REPORT.textMax}
					rows="2"
					placeholder="The device, if it isn't obvious, or how the game plays on it"></textarea>
			</label>
			<details>
				<summary>What is sent</summary>
				<dl>
					<dt>Version</dt>
					<dd>{diagnostics.version}</dd>
					<dt>Browser</dt>
					<dd>{diagnostics.userAgent}</dd>
					{#if diagnostics.gpu}<dt>GPU</dt>
						<dd>{diagnostics.gpu}</dd>{/if}
					<dt>Screen</dt>
					<dd>{result.device.canvas} @{result.device.pixelRatio}, {result.device.refreshHz} Hz</dd>
					<dt>Graphics</dt>
					<dd>
						WebGL {result.device.webgl2 ? 2 : 1}, textures up to {result.device.maxTextureSize},
						compressed:
						{result.device.compressed.join(', ') || 'none'}
					</dd>
					<dt>Textures</dt>
					<dd>{result.textures} (~{result.textureMb} MB)</dd>
					{#if result.device.cores}<dt>CPU cores</dt>
						<dd>{result.device.cores}</dd>{/if}
					{#if result.device.memoryGb}<dt>Memory</dt>
						<dd>{result.device.memoryGb} GB</dd>{/if}
					<dt>Frame times</dt>
					<dd>every quality's average, slowest and 95th percentile</dd>
					{#if diagnostics.console?.length}<dt>Console</dt>
						<dd>{diagnostics.console.length} lines</dd>{/if}
				</dl>
				<p class="note">Never your email, gamer tag or password.</p>
			</details>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
		</form>
		{#snippet footer()}
			<button type="button" onclick={close}>Close</button>
			<button type="button" onclick={() => void start()}>Run again</button>
			<button type="submit" form="diagnostics" class="primary" disabled={sending}>
				{sending ? 'Sending…' : 'Send'}
			</button>
		{/snippet}
	</Dialog>
{/if}

<style>
	.runner {
		width: 100vw;
		height: 100vh;
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 0;
		border: none;
		background: #000;
		overflow: hidden;
	}

	.runner::backdrop {
		background: #000;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.bar {
		position: absolute;
		left: 50%;
		bottom: 24px;
		transform: translateX(-50%);
		width: min(520px, calc(100vw - 32px));
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px 14px;
		align-items: center;
		padding: 12px 16px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: rgb(10 9 8 / 0.82);
		color: var(--text);
		font-family: var(--font-ui);
	}

	.status {
		font-size: 0.9rem;
	}

	.track {
		grid-column: 1;
		height: 4px;
		border-radius: 2px;
		background: rgb(255 255 255 / 0.15);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		background: var(--accent);
		transition: width 0.25s linear;
	}

	.bar button {
		grid-column: 2;
		grid-row: 1 / span 2;
		padding: 7px 18px;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 8px;
		font-variant-numeric: tabular-nums;
	}

	th,
	td {
		padding: 4px 8px;
		text-align: right;
		border-bottom: 1px solid rgb(20 17 15 / 0.15);
	}

	th:first-child,
	td:first-child {
		text-align: left;
	}

	form {
		display: grid;
		gap: 12px;
		margin-top: 12px;
	}

	label {
		display: grid;
		gap: 4px;
		font-weight: 600;
	}

	.optional {
		font-weight: 400;
		opacity: 0.7;
	}

	textarea {
		font: inherit;
		font-weight: 400;
		padding: 7px 10px;
		border: 1px solid rgb(20 17 15 / 0.35);
		border-radius: 6px;
		background: rgb(255 255 255 / 0.7);
		color: #14110f;
		resize: vertical;
	}

	details {
		font-size: 0.9rem;
	}

	summary {
		cursor: pointer;
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 2px 12px;
		margin: 8px 0;
	}

	dt {
		opacity: 0.7;
	}

	dd {
		margin: 0;
		word-break: break-word;
	}

	.note {
		opacity: 0.7;
		font-size: 0.9rem;
	}

	.error {
		color: #8a1c0e;
		font-weight: 600;
	}
</style>
