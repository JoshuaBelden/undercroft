<script lang="ts">
	import { resolve } from '$app/paths';
	import Code from '#university/Code.svelte';
	import PackageMap from '#university/diagrams/PackageMap.svelte';

	const generics = `
// The package is generic over the game's ids and categories...
export class SoundBank<Id extends string, C extends string> {
  constructor(audio: AudioManager<C>, catalog: SoundCatalog<Id, C>) { /* ... */ }
  play(id: Id, volume = 1): void { /* ... */ }
}

// ...so the game's own registry types every call site.
const SOUNDS = { 'door.open': { file: 'door', category: 'sfx', volume: 1 } } satisfies
  Record<string, SoundDef<'sfx' | 'music'>>;
const sounds = new SoundBank(audio, { sounds: SOUNDS, files: FILES });

sounds.play('door.open');   // ok
sounds.play('door.opne');   // compile error: not a key of SOUNDS`;

	const testing = `
// No browser needed: hand the sound bank a fake AudioManager.
const audio = {
  unlocked: true,
  load: vi.fn(async () => ({}) as AudioBuffer),
  playBuffer: vi.fn(() => handle),
  // ...
};
const bank = new SoundBank(audio as unknown as AudioManager<'sfx'>, CATALOG);
bank.play('step');
expect(audio.playBuffer).toHaveBeenCalledOnce();`;

	const workspace = `
# pnpm-workspace.yaml
packages:
  - wick/packages/*
  - wick/university`;

	const dependency = `
// package.json (the game)
"dependencies": {
  "@wick/audio": "workspace:*"
}`;

	const packageJson = `
// wick/packages/audio/package.json
{
  "name": "@wick/audio",
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}`;

	const lint = `
// eslint.config.js: inside wick/, reject imports that reach out of it.
{
  files: ['wick/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { regex: '^#lib(/|$)', message: 'WICK must not import the game.' },
        { group: ['**/src/lib/**', '../../../../*'], message: 'WICK must not import outside wick/.' }
      ]
    }]
  }
}`;

	const bootstrap = `
// The game: one module per package binds WICK to the game's types and content.
import { SoundBank as WickSoundBank } from '@wick/audio';
import { FILES, SOUNDS, type SoundId } from './content/sounds.ts';
import type { SoundCategory } from './content/categories.ts';
import type { AudioManager } from './AudioManager.ts';

export class SoundBank extends WickSoundBank<SoundId, SoundCategory> {
  constructor(audio: AudioManager) {
    super(audio, { sounds: SOUNDS, files: FILES });
  }
}

// Everywhere else in the game:
const sounds = new SoundBank(audio);`;

	const subtree = `
# Make a branch holding only wick/'s history, with wick/ as its root:
git subtree split --prefix=wick -b wick-only
# Push it as a new repository:
git push git@github.com:you/wick.git wick-only:main`;
</script>

<h1>Architecture</h1>
<p class="lede">
	WICK is a set of independent packages. A game depends on the ones it needs and supplies its own
	content to them. Dependencies point one way only: the game depends on WICK, never the reverse.
</p>

<PackageMap />

<h2>The packages</h2>
<table>
	<thead><tr><th>Package</th><th>Responsibility</th><th>Status</th></tr></thead>
	<tbody>
		<tr>
			<td><code>@wick/audio</code></td>
			<td
				>Web Audio mixing buses, low-pass occlusion, convolution reverb, HRTF spatialization,
				recordings by id</td
			>
			<td><a href={resolve('/audio')}>Available</a></td>
		</tr>
		<tr>
			<td><code>@wick/render</code></td>
			<td>The Three.js renderer and frame loop, glTF loading, skeletal animation, light budget</td>
			<td>Planned</td>
		</tr>
		<tr>
			<td><code>@wick/input</code></td>
			<td
				>Action mapping over keyboard, mouse and Gamepad API; remapping; controller menu navigation</td
			>
			<td>Planned</td>
		</tr>
		<tr>
			<td><code>@wick/settings</code></td>
			<td>A schema-driven, persisted settings store with versioned migration</td>
			<td>Planned</td>
		</tr>
		<tr>
			<td><code>@wick/net</code></td>
			<td
				>Authoritative fixed-tick server, input queueing, client-side prediction and reconciliation,
				an event bus</td
			>
			<td>Planned</td>
		</tr>
		<tr>
			<td><code>@wick/membership</code></td>
			<td
				>Accounts, sessions, TOTP two-factor, OAuth sign-in, friends, roles, crash and bug reporting</td
			>
			<td>Planned</td>
		</tr>
		<tr>
			<td><code>@wick/tooling</code></td>
			<td
				>Asset optimization (glTF, textures, Opus audio), content hashing, releases, an Electron
				desktop shell</td
			>
			<td>Planned</td>
		</tr>
	</tbody>
</table>

<h2>Design principles</h2>

<h3>Inversion of control: the game supplies, WICK consumes</h3>
<p>
	A WICK package never imports a game's data. It declares what it needs, as a config object, a
	catalog or an interface, and the game passes that in. This is <em>dependency inversion</em>: the
	reusable module defines the abstraction, and the specific module implements or fills it. Three
	things follow:
</p>
<ul>
	<li>
		<strong>Reuse.</strong> The package has no knowledge of any one game, so a second game uses it unchanged.
	</li>
	<li>
		<strong>Testability.</strong> Anything passed in can be replaced by a fake. The sound bank's
		tests hand it a fake <code>AudioManager</code> and run under Node, with no browser and no Web Audio.
	</li>
	<li>
		<strong>Explicit dependencies.</strong> A package's constructor tells you everything it relies on.
		Nothing reaches out to a global store behind your back.
	</li>
</ul>
<Code code={testing} label="wick/packages/audio/src/SoundBank.test.ts (abridged)" />

<h3>Generic type parameters carry the game's types through</h3>
<p>
	Injection would cost type safety if packages took plain <code>string</code>s. Instead they are
	generic over the game's identifiers. A <code>SoundBank&lt;Id, C&gt;</code> built from the game's registry
	only accepts that registry's keys. A misspelled sound id fails at compile time, and your editor autocompletes
	every sound.
</p>
<Code code={generics} />

<h3>The boundary rule</h3>
<p>
	<strong>Nothing in <code>wick/</code> imports anything outside <code>wick/</code>.</strong> A WICK
	package may depend on other <code>@wick/*</code> packages and on third-party libraries, nothing else.
	That keeps the dependency graph acyclic and one-directional. If a package reached into the game even
	once, you could no longer take it to another game without bringing that code along, and a change in
	the game could break the engine.
</p>
<p>Two checks enforce it, so it can't erode quietly:</p>
<ul>
	<li>
		<strong>Lint.</strong> ESLint's <code>no-restricted-imports</code> rule inspects every
		<code>import</code> declaration's module specifier in <code>wick/**</code>. It rejects the
		game's subpath imports (<code>#lib/…</code>) and any relative path that climbs out of
		<code>wick/</code>.
	</li>
	<li>
		<strong>Isolated type checks.</strong> Each package has its own <code>tsconfig.json</code> whose
		<code>include</code> is only its <code>src</code>. Run alone (<code>tsc -p</code>), its module
		resolution has nothing outside the package to find, so an import that only resolves inside the
		game is an error.
	</li>
</ul>
<Code code={lint} label="eslint.config.js" />

<h3>Source-first packages</h3>
<p>
	A WICK package has no build step. Its <code>package.json</code> <code>exports</code> field points
	straight at its TypeScript entry point, and the consuming app's bundler (Vite, esbuild) compiles
	it with the app's own code. Edits are live immediately, with no watch process or stale
	<code>dist/</code>. The trade-off is that a consumer needs a TypeScript-aware toolchain, with
	<code>moduleResolution: "bundler"</code> and <code>allowImportingTsExtensions</code>, since
	sources import each other with explicit <code>.ts</code> extensions. Publishing to a registry later
	would add a build that emits JavaScript and declaration files.
</p>
<Code code={packageJson} />

<h2>How the workspace works</h2>
<p>
	WICK's packages live in a <strong>pnpm workspace</strong>, one repository holding several
	packages:
</p>
<ul>
	<li>
		<code>pnpm-workspace.yaml</code> lists the package folders by glob.
	</li>
	<li>
		A dependency written as <code>workspace:*</code> resolves to the local package, not the
		registry. pnpm links it into the consumer's <code>node_modules</code> as a symlink, so there is no
		copy to keep in sync.
	</li>
	<li>
		pnpm's <code>node_modules</code> is strict: a package can only import what its own
		<code>package.json</code> declares. That stops "phantom dependencies", where code works only because
		something else happened to install a library.
	</li>
	<li>
		If the packages are ever published, pnpm rewrites <code>workspace:*</code> to the real version numbers.
	</li>
</ul>
<Code code={workspace} label="pnpm-workspace.yaml" />
<Code code={dependency} label="package.json (the game)" />

<h2>Wiring a game to WICK</h2>
<p>
	For each package, the game keeps one small module that binds WICK's generics to the game's types
	and passes in the game's content. Usually that's a subclass whose constructor supplies the
	configuration. The rest of the game imports that module rather than WICK directly. Configuration
	then lives in one place, call sites stay short, and swapping or upgrading the package touches one
	file.
</p>
<Code code={bootstrap} label="the game: game/audio/SoundBank.ts" />

<h2>Moving WICK to its own repository</h2>
<p>
	The boundary rule makes <code>wick/</code> self-contained, so it can leave the repository it
	started in with its history intact. <code>git subtree split</code> walks the history and keeps
	only the commits that touched <code>wick/</code>. It rewrites them so <code>wick/</code> becomes
	the root and produces a branch you can push as a new repository. Consumers then point their
	<code>@wick/*</code> dependencies at that repository (a git or registry dependency) instead of
	<code>workspace:*</code>. Imports don't change, because they use package names, not paths.
</p>
<Code code={subtree} />
