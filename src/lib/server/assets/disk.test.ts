import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog } from './catalog.ts';
import { assetFile, assetsDir, gltfJson, gltfUses, readAssetDisk, repositoryRoot } from './disk.ts';

/** A .glb holding just this JSON chunk. */
function glb(json: object): Buffer {
	let text = JSON.stringify(json);
	while (text.length % 4) text += ' ';
	const body = Buffer.from(text, 'utf8');
	const header = Buffer.alloc(20);
	header.write('glTF', 0, 'ascii');
	header.writeUInt32LE(2, 4);
	header.writeUInt32LE(20 + body.length, 8);
	header.writeUInt32LE(body.length, 12);
	header.write('JSON', 16, 'ascii');
	return Buffer.concat([header, body]);
}

describe('gltf', () => {
	it('reads the JSON chunk of a .glb', () => {
		const json = gltfJson(glb({ animations: [{ name: 'Idle' }] }), true);
		expect(gltfUses(json, 'shared/creatures/witch.glb').animations).toEqual(['Idle']);
		expect(gltfJson(Buffer.from('not a glb at all'), true)).toBeNull();
	});

	it('resolves what a .gltf loads against where it sits, skipping embedded data', () => {
		const uses = gltfUses(
			{
				buffers: [
					{ uri: 'cistern.24eff6d8.bin' },
					{ uri: 'data:application/octet-stream;base64,AA' }
				],
				images: [{ uri: '../textures/Rock%20061.webp' }]
			},
			'shared/map/cistern.4ffc6e73.gltf'
		);
		expect(uses.uris).toEqual(['shared/map/cistern.24eff6d8.bin', 'shared/textures/Rock 061.webp']);
	});
});

describe('in the Docker image', () => {
	it("reads the site build's copy of the assets, without its compressed copies", async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'assets-'));
		try {
			mkdirSync(path.join(root, 'src/lib/content'), { recursive: true });
			mkdirSync(path.join(root, 'build/client/assets/ui'), { recursive: true });
			writeFileSync(path.join(root, 'build/client/assets/ui/logo.1.webp'), 'x');
			writeFileSync(path.join(root, 'build/client/assets/ui/logo.1.webp.br'), 'x');
			expect(assetsDir(root)).toBe(path.join(root, 'build/client/assets'));
			expect(repositoryRoot(path.join(root, 'src'))).toBe(root);
			const disk = await readAssetDisk(root);
			expect([...disk.files.keys()]).toEqual(['ui/logo.1.webp']);
			// The previews' file route: inside the assets folder only.
			expect(assetFile('ui/logo.1.webp', root)).toBe(
				path.join(root, 'build/client/assets/ui/logo.1.webp')
			);
			expect(assetFile('ui/logo.1.webp.br', root)).toBeNull();
			expect(assetFile('../../../src/lib/content', root)).toBeNull();
			expect(assetFile('ui/none.webp', root)).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe('the repository', () => {
	it('has every file its manifests name, and its pieces load nothing missing', async () => {
		const catalog = buildCatalog(await readAssetDisk(repositoryRoot()));
		const missing = catalog.rows.filter(
			(r) =>
				r.status === 'missing' &&
				r.planned === undefined &&
				(r.kind === 'model' || r.kind === 'piece' || r.kind === 'sound') &&
				// A sound not recorded yet is a to-do on the page, not a broken manifest.
				!(r.kind === 'sound' && r.files.length === 0)
		);
		expect(missing.map((r) => `${r.kind} ${r.id}: ${r.note}`)).toEqual([]);
	});
});
