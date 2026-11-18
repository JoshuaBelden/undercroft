import { describe, expect, it } from 'vitest';
import {
	GAME_CONTENT,
	animationSlots,
	assetPath,
	buildCatalog,
	type AssetDisk,
	type CatalogContent
} from './catalog.ts';

/** A disk with every file the manifests name (1 KB each), and the source given. */
function diskFor(content: CatalogContent, sources: AssetDisk['sources'] = []): AssetDisk {
	const files = new Map<string, number>();
	const add = (url: string): void => void files.set(assetPath(url), 1024);
	for (const model of Object.values(content.models)) add(model.url);
	for (const piece of Object.values(content.pieces)) add(piece.url);
	for (const url of Object.values(content.images)) add(url);
	for (const urls of Object.values(content.audioFiles)) urls.forEach(add);
	return { files, gltf: new Map(), sources };
}

const row = (catalog: ReturnType<typeof buildCatalog>, kind: string, id: string) =>
	catalog.rows.find((r) => r.kind === kind && r.id === id);

describe('buildCatalog', () => {
	it('lists every built model, with the content that uses it', () => {
		const catalog = buildCatalog(diskFor(GAME_CONTENT));
		for (const path of Object.keys(GAME_CONTENT.models)) {
			expect(row(catalog, 'model', path)).toBeDefined();
		}
		const knife = row(catalog, 'model', 'shared/items/knife.glb');
		expect(knife?.status).toBe('ok');
		expect(knife?.usedBy).toContain('Item: Knife');
	});

	it('finds models loaded by code, and calls one nothing loads unused', () => {
		const disk = diskFor(GAME_CONTENT, [
			{ file: 'src/lib/game/items/Crates.ts', text: "modelUrl('shared/props/crate.glb')" }
		]);
		const catalog = buildCatalog(disk);
		expect(row(catalog, 'model', 'shared/props/crate.glb')?.usedBy).toEqual([
			'src/lib/game/items/Crates.ts'
		]);
		expect(row(catalog, 'model', 'shared/props/corpse.glb')?.status).toBe('unused');
	});

	it('a model in the manifest whose file is gone is missing', () => {
		const disk = diskFor(GAME_CONTENT);
		disk.files.delete(assetPath(GAME_CONTENT.models['shared/items/knife.glb'].url));
		expect(row(buildCatalog(disk), 'model', 'shared/items/knife.glb')?.status).toBe('missing');
	});

	it('an item with no model is a placeholder when it has a box to draw', () => {
		const catalog = buildCatalog(diskFor(GAME_CONTENT));
		const boxed = Object.entries(GAME_CONTENT.items).find(([, i]) => !i.model && i.placeholder);
		expect(boxed).toBeDefined();
		expect(row(catalog, 'model', `item: ${boxed?.[0]}`)?.status).toBe('placeholder');
	});

	it('a picture the code names but nobody built is missing; one nobody names is unused', () => {
		const disk = diskFor(GAME_CONTENT, [
			{ file: 'src/lib/ui/AuthPage.svelte', text: "imageUrl('logo')" },
			{ file: 'src/lib/ui/Pane.svelte', text: "const UNKNOWN_IMAGE = 'never-drawn';" }
		]);
		const catalog = buildCatalog(disk);
		expect(row(catalog, 'image', 'logo')?.status).toBe('ok');
		expect(row(catalog, 'image', 'never-drawn')?.status).toBe('missing');
		expect(row(catalog, 'image', 'icon')?.status).toBe('unused');
	});

	it('a sound with no recording plays its synthesized stand-in', () => {
		const content: CatalogContent = {
			...GAME_CONTENT,
			sounds: {
				recorded: { file: 'rec', category: 'sfx', volume: 1 },
				made: { synth: { kind: 'click' }, category: 'sfx', volume: 1 },
				silent: { file: 'unbuilt', category: 'sfx', volume: 1 }
			},
			audioFiles: { rec: ['/assets/shared/audio/rec.1.webm'], spare: ['/assets/x.webm'] },
			audioLevels: { recorded: { level: -20, lufs: -20, peak: -1, urls: ['/old.webm'] } }
		};
		const catalog = buildCatalog(
			diskFor(content, [{ file: 'a.ts', text: "play('made')" }]),
			content
		);
		expect(row(catalog, 'sound', 'recorded')?.status).toBe('ok');
		expect(row(catalog, 'sound', 'recorded')?.level).toEqual({ lufs: -20, peak: -1, stale: true });
		expect(row(catalog, 'sound', 'made')?.status).toBe('synthesized');
		expect(row(catalog, 'sound', 'made')?.usedBy).toEqual(['sfx', 'a.ts']);
		expect(row(catalog, 'sound', 'silent')?.status).toBe('missing');
		expect(row(catalog, 'sound', 'recording: spare')?.status).toBe('unused');
	});

	it('lists a file nothing uses once, and keeps what a glTF loads', () => {
		const disk = diskFor(GAME_CONTENT);
		const piece = assetPath(Object.values(GAME_CONTENT.pieces)[0].url);
		const buffer = piece.replace(/\.gltf$/, '.bin');
		disk.files.set(buffer, 10);
		disk.gltf.set(piece, { animations: [], uris: [buffer] });
		disk.files.set('shared/stray.png', 7);
		const catalog = buildCatalog(disk);
		const files = catalog.rows.filter((r) => r.kind === 'file').map((r) => r.id);
		expect(files).toEqual(['shared/stray.png']);
		expect(catalog.counts.file.unused).toBe(1);
	});

	it("an animation the map names that isn't in the model file is missing", () => {
		const disk = diskFor(GAME_CONTENT);
		disk.gltf.set(assetPath(GAME_CONTENT.creatures.witch.model), { animations: [], uris: [] });
		expect(row(buildCatalog(disk), 'animation', 'witch')?.status).toBe('missing');
	});
});

describe('animationSlots', () => {
	it('gives each slot its clip, a held pose, or what it falls back to', () => {
		const slots = animationSlots(
			{
				idle: { clip: 'Walk', speed: 0 },
				running: { clip: 'Run' },
				melee_attack: { clip: 'Gone' }
			},
			new Set(['Walk', 'Run'])
		);
		const at = (slot: string) => slots.find((s) => s.slot === slot);
		expect(at('idle')).toMatchObject({ clip: 'Walk', pose: true, absent: false });
		expect(at('walking')).toMatchObject({ clip: null, fallback: 'running' });
		expect(at('melee_attack')).toMatchObject({ clip: 'Gone', absent: true });
		expect(at('dodge')).toMatchObject({ clip: null, fallback: null });
	});
});
