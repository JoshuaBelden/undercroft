import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/**
 * The admin app (docs/dev/admin.md). It shares the game's MongoDB code (src/lib/server/store) and
 * its .env, both one folder up.
 */
export default defineConfig({
	envDir: '..',
	server: { fs: { allow: ['..'] } },
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	]
});
