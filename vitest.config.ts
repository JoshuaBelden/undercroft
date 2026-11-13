import { defineConfig } from 'vitest/config';

// Unit tests for pure logic (see docs/dev/testing.md). No SvelteKit plugin: the shared code
// under test needs none, and leaving it out keeps the runs fast.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
		environment: 'node',
		// Quiets the game server's log (server/testing/setup.ts).
		setupFiles: ['server/testing/setup.ts'],
		// `pnpm test:coverage`: only the code meant to be unit tested is counted.
		coverage: {
			provider: 'v8',
			include: ['src/lib/shared/**/*.ts', 'server/**/*.ts'],
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
