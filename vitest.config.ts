import { defineConfig } from 'vitest/config';

// Unit tests for pure logic (see docs/dev/testing.md). No SvelteKit plugin: the shared code
// under test needs none, and leaving it out keeps the runs fast.
export default defineConfig({
	test: {
		include: [
			'src/**/*.test.ts',
			'server/**/*.test.ts',
			'desktop/src/**/*.test.ts',
			'wick/packages/*/src/**/*.test.ts'
		],
		environment: 'node',
		// Session tests play out seconds of an expedition: alone they take one or two seconds, but a
		// full parallel run on a busy machine can push some past vitest's 5 s default.
		testTimeout: 15_000,
		// Quiets the game server's log (server/testing/setup.ts).
		setupFiles: ['server/testing/setup.ts'],
		// `pnpm test:coverage`: only the code meant to be unit tested is counted.
		coverage: {
			provider: 'v8',
			include: [
				'src/lib/shared/**/*.ts',
				'server/**/*.ts',
				'src/lib/server/localdb/**/*.ts',
				'src/lib/server/store/**/*.ts',
				'desktop/src/frames.ts',
				'desktop/src/tunnel.ts',
				'desktop/src/navigation.ts',
				'wick/packages/*/src/**/*.ts'
			],
			exclude: [
				'**/*.test.ts',
				'**/testing/**',
				'**/*.generated.ts',
				// Process wiring: only does anything in a running server (docs/dev/testing.md).
				'server/index.ts',
				'server/db.ts',
				'server/config.ts',
				'server/log.ts'
			],
			reporter: ['text', 'html'],
			reportsDirectory: 'coverage'
		}
	}
});
