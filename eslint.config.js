import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// WICK's boundary (docs/wick-roadmap.md): the engine never reaches into the game. Its packages
		// import each other by package name, never Undercroft's code or content.
		files: ['wick/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							// Undercroft's own subpath imports. ($app and $lib in wick/university are its own.)
							regex: '^#lib(/|$)',
							message: 'WICK must not import Undercroft (docs/wick-roadmap.md, the boundary rule).'
						},
						{
							group: ['**/src/lib/**', '**/server/**', '../../../../*'],
							message:
								'WICK must not import outside wick/ (docs/wick-roadmap.md, the boundary rule).'
						}
					]
				}
			]
		}
	},
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {}
	}
);
