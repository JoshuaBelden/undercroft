import { AFFLICTIONS, type AfflictionDef } from '../../content/afflictions.ts';
import { ANIM_FALLBACKS, ANIM_SLOTS, type AnimationMap } from '../../content/animations.ts';
import { AUDIO_FILES } from '../../content/audio/files.generated.ts';
import { AUDIO_LEVELS } from '../../content/audio/levels.generated.ts';
import { SOUNDS, type SoundDef } from '../../content/audio/sounds.ts';
import { CREATURES, type CreatureDef } from '../../content/creatures.ts';
import { IMAGE_URLS } from '../../content/images.generated.ts';
import { ITEMS, type ItemDef } from '../../content/items.ts';
import { MODELS } from '../../content/models.generated.ts';
import { PLANNED_ASSETS, type PlannedAsset } from '../../content/planned.ts';
import { bodyPaths, PLAYER_MODEL, wearPath } from '../../content/player/model.ts';
import { BODIES, WEAR, type BodyId, type WearId } from '../../content/player/wardrobe.ts';
import { PIECES } from '../../shared/map/pieces.generated.ts';
import { ROOMS } from '../../shared/map/rooms.generated.ts';
import {
	ASSET_KINDS,
	type AssetCatalog,
	type AssetRow,
	type AssetStatus,
	type SlotUse
} from '../../content/assets.ts';

export * from '../../content/assets.ts';

/**
 * The Art & Assets list (the admin app's /assets page, docs/dev/admin.md#art-and-assets): every
 * model, map piece, picture, sound and animation the game uses or names, and every file under
 * static/assets nothing uses. Built from the generated manifests, the content data and the source
 * (never a hand-kept list), so it can't drift. `buildCatalog` is pure; `readAssetDisk` (disk.ts)
 * gathers what it reads from the files.
 */

/** What `buildCatalog` reads from the files (see disk.ts). */
export interface AssetDisk {
	/** Every file under static/assets, by path from there (`shared/items/knife.90908878.glb`): bytes. */
	files: Map<string, number>;
	/** Each .gltf and .glb, by path: its clip names, and the files it loads (paths, resolved). */
	gltf: Map<string, { animations: string[]; uris: string[] }>;
	/** The game's source files (src/, server/), by path from the repository, for "used by". */
	sources: { file: string; text: string }[];
}

/** The content the catalog reads. Defaults to the game's; tests pass their own. */
export interface CatalogContent {
	models: Record<string, { url: string; bytes: number }>;
	/** The fixed map's rooms: each model, and its lightmap. */
	rooms?: Record<
		string,
		{ url: string; lightmap: { url: string } | null; probes?: { url: string } | null }
	>;
	pieces: Record<string, { url: string }>;
	images: Record<string, string>;
	audioFiles: Record<string, string[]>;
	audioLevels: Record<string, { lufs: number; peak: number; level: number; urls: string[] }>;
	sounds: Record<string, SoundDef>;
	items: Record<string, ItemDef>;
	creatures: Record<string, CreatureDef>;
	afflictions: Record<string, AfflictionDef>;
	/**
	 * The explorer: per body, the model paths of its clips file (`anims`) and every file it is drawn
	 * with (the body and each wardrobe piece), and the animation map they all share.
	 */
	explorer: { bodies: { id: string; anims: string; files: string[] }[]; animations: AnimationMap };
	/** Art named before it is made (content/planned.ts). */
	planned?: PlannedAsset[];
}

export const GAME_CONTENT: CatalogContent = {
	models: MODELS,
	pieces: PIECES,
	rooms: ROOMS,
	images: IMAGE_URLS,
	audioFiles: AUDIO_FILES,
	audioLevels: AUDIO_LEVELS,
	sounds: SOUNDS,
	items: ITEMS,
	creatures: CREATURES,
	afflictions: AFFLICTIONS,
	explorer: {
		animations: PLAYER_MODEL.animations,
		bodies: (Object.keys(BODIES) as BodyId[]).map((id) => ({
			id,
			anims: bodyPaths(id).anims,
			files: [bodyPaths(id).body, ...(Object.keys(WEAR) as WearId[]).map((w) => wearPath(id, w))]
		}))
	},
	planned: PLANNED_ASSETS
};

/** `/assets/a/b.png` -> `a/b.png`, the path under static/assets. */
export function assetPath(url: string): string {
	return url.replace(/^\/assets\//, '');
}

/** Files that use `modelUrl('<path>')`, `imageUrl('<name>')` or a `…IMAGE = '<name>'` constant. */
const MODEL_CALL = /modelUrl\(\s*'([^']+)'/g;
const IMAGE_CALL = /imageUrl\(\s*'([^']+)'|IMAGE\s*=\s*'([^']+)'/g;

/** Where each quoted name is used in the source: name -> files. */
function scan(sources: AssetDisk['sources'], pattern: RegExp): Map<string, Set<string>> {
	const found = new Map<string, Set<string>>();
	for (const { file, text } of sources) {
		for (const match of text.matchAll(pattern)) {
			const name = match[1] ?? match[2];
			if (!name) continue;
			const files = found.get(name) ?? new Set<string>();
			files.add(file);
			found.set(name, files);
		}
	}
	return found;
}

/** The content data the catalog reads itself, so it names their uses ("Item: Knife") better. */
const LABELLED = new Set([
	'src/lib/content/items.ts',
	'src/lib/content/creatures.ts',
	'src/lib/content/afflictions.ts',
	'src/lib/content/player/model.ts'
]);

/** Source files that use a name, but for the content data above. */
function codeUses(files: Set<string> | undefined): string[] {
	return [...(files ?? [])].filter((file) => !LABELLED.has(file)).sort();
}

export function buildCatalog(
	disk: AssetDisk,
	content: CatalogContent = GAME_CONTENT
): AssetCatalog {
	const rows: AssetRow[] = [];
	/** Every file under static/assets that something uses. */
	const used = new Set<string>();
	const size = (path: string): number => disk.files.get(path) ?? 0;
	const present = (path: string): boolean => disk.files.has(path);
	/** A file and everything it loads (a .gltf's buffers and textures). */
	const withDependencies = (path: string): string[] => [path, ...(disk.gltf.get(path)?.uris ?? [])];

	// Models: what the content names, and the code that loads them.
	const modelUsers = new Map<string, string[]>();
	const addUser = (url: string, who: string): void => {
		modelUsers.set(url, [...(modelUsers.get(url) ?? []), who]);
	};
	const itemsWithoutModel: [string, ItemDef][] = [];
	for (const [id, item] of Object.entries(content.items)) {
		if (item.model) addUser(item.model, `Item: ${item.name}`);
		else itemsWithoutModel.push([id, item]);
	}
	for (const [id, creature] of Object.entries(content.creatures)) {
		addUser(creature.model, `Creature: ${id}`);
	}
	for (const affliction of Object.values(content.afflictions)) {
		const body = affliction.manifestation?.body;
		if (body) addUser(body.model, `${affliction.name}: manifestation`);
	}
	const explorerMissing: { path: string; who: string }[] = [];
	for (const body of content.explorer.bodies) {
		for (const path of [body.anims, ...body.files]) {
			const model = content.models[path];
			if (model) addUser(model.url, `Explorer: ${body.id}`);
			else explorerMissing.push({ path, who: `Explorer: ${body.id}` });
		}
	}
	const modelCalls = scan(disk.sources, MODEL_CALL);
	for (const [path, model] of Object.entries(content.models)) {
		const file = assetPath(model.url);
		const usedBy = [...(modelUsers.get(model.url) ?? []), ...codeUses(modelCalls.get(path))];
		if (usedBy.length) used.add(file);
		rows.push({
			kind: 'model',
			id: path,
			usedBy,
			files: [model.url],
			bytes: present(file) ? size(file) : model.bytes,
			status: !present(file) ? 'missing' : usedBy.length ? 'ok' : 'unused',
			note: present(file) ? undefined : 'In the manifest, but the file is gone: pnpm asset:build'
		});
	}
	for (const { path, who } of explorerMissing) {
		rows.push({
			kind: 'model',
			id: path,
			usedBy: [who],
			files: [],
			bytes: 0,
			status: 'missing',
			note: 'Not built: export it from scripts/blender/wardrobe.py, then pnpm asset:build'
		});
	}
	for (const [id, item] of itemsWithoutModel) {
		rows.push({
			kind: 'model',
			id: `item: ${id}`,
			usedBy: [`Item: ${item.name}`],
			files: [],
			bytes: 0,
			status: item.placeholder ? 'placeholder' : 'missing',
			note: item.placeholder ? 'No model: drawn as a box' : 'No model and no placeholder box'
		});
	}

	// The fixed map's rooms (docs/dev/fixed-map.md): each model with its textures, its lightmap and
	// its light probes.
	for (const [name, room] of Object.entries(content.rooms ?? {})) {
		const files = [
			...withDependencies(assetPath(room.url)),
			...(room.lightmap ? [assetPath(room.lightmap.url)] : []),
			...(room.probes ? [assetPath(room.probes.url)] : [])
		];
		for (const each of files) used.add(each);
		const gone = files.filter((each) => !present(each));
		rows.push({
			kind: 'piece',
			id: `room: ${name}`,
			usedBy: ['The fixed map'],
			files: files.map((each) => `/assets/${each}`),
			bytes: files.reduce((sum, each) => sum + size(each), 0),
			status: gone.length ? 'missing' : 'ok',
			note: gone.length
				? `Missing ${gone.join(', ')}`
				: room.lightmap
					? undefined
					: 'No lightmap baked'
		});
	}

	// Map pieces: every piece the generator can place.
	for (const [name, piece] of Object.entries(content.pieces)) {
		const file = assetPath(piece.url);
		const files = withDependencies(file);
		for (const each of files) used.add(each);
		const gone = files.filter((each) => !present(each));
		rows.push({
			kind: 'piece',
			id: name,
			usedBy: ['Map generation'],
			files: files.map((each) => `/assets/${each}`),
			bytes: files.reduce((sum, each) => sum + size(each), 0),
			status: gone.length ? 'missing' : 'ok',
			note: gone.length ? `Missing ${gone.join(', ')}` : undefined
		});
	}

	// Pictures: named by items, Afflictions and the interface code.
	const imageUsers = new Map<string, string[]>();
	const addImage = (name: string, who: string): void => {
		imageUsers.set(name, [...(imageUsers.get(name) ?? []), who]);
	};
	for (const [id, item] of Object.entries(content.items)) {
		if (item.image) addImage(item.image, `Item: ${item.name}`);
		else {
			rows.push({
				kind: 'image',
				id: `item: ${id}`,
				usedBy: [`Item: ${item.name}`],
				files: [],
				bytes: 0,
				status: 'missing',
				note: 'The item names no picture'
			});
		}
	}
	for (const affliction of Object.values(content.afflictions)) {
		addImage(affliction.image, `Affliction: ${affliction.name}`);
	}
	for (const [name, files] of scan(disk.sources, IMAGE_CALL)) {
		for (const file of codeUses(files)) addImage(name, file);
	}
	const imageNames = new Set([...Object.keys(content.images), ...imageUsers.keys()]);
	for (const name of [...imageNames].sort()) {
		const url = content.images[name];
		const usedBy = imageUsers.get(name) ?? [];
		const file = url ? assetPath(url) : null;
		if (file && usedBy.length) used.add(file);
		const built = file !== null && present(file);
		rows.push({
			kind: 'image',
			id: name,
			usedBy,
			files: url ? [url] : [],
			bytes: file ? size(file) : 0,
			status: !built ? 'missing' : usedBy.length ? 'ok' : 'unused',
			note: built ? undefined : `No art/images/${name}.png built: pnpm asset:images`
		});
	}

	// Sounds: every SoundId, recorded or still to record, and recordings no sound plays.
	const recordings = new Set<string>();
	const sounds = Object.entries(content.sounds);
	const soundUses = scanQuoted(
		disk.sources.filter(({ file }) => !file.endsWith('content/audio/sounds.ts')),
		sounds.map(([id]) => id)
	);
	for (const [id, def] of sounds) {
		const ids = Array.isArray(def.file) ? def.file : def.file ? [def.file] : [];
		for (const each of ids) recordings.add(each);
		const urls = ids.flatMap((each) => content.audioFiles[each] ?? []);
		const gone = urls.filter((url) => !present(assetPath(url)));
		for (const url of urls) used.add(assetPath(url));
		const measured = content.audioLevels[id];
		let status: AssetStatus = 'ok';
		let note: string | undefined;
		if (!urls.length) {
			status = 'missing';
			note = ids.length
				? `Recording ${ids.join(', ')} isn't built: silent`
				: 'Needs recording: silent';
		} else if (gone.length) {
			status = 'missing';
			note = `${gone.length} of its files are gone`;
		}
		rows.push({
			kind: 'sound',
			id,
			usedBy: [def.category, ...(soundUses.get(id) ?? [])],
			files: urls,
			bytes: urls.reduce((sum, url) => sum + size(assetPath(url)), 0),
			status,
			note,
			level: measured
				? {
						lufs: measured.level,
						peak: measured.peak,
						stale: measured.urls.join() !== urls.join()
					}
				: null
		});
	}
	for (const [id, urls] of Object.entries(content.audioFiles)) {
		if (recordings.has(id)) continue;
		rows.push({
			kind: 'sound',
			id: `recording: ${id}`,
			usedBy: [],
			files: urls,
			bytes: urls.reduce((sum, url) => sum + size(assetPath(url)), 0),
			status: 'unused',
			note: 'Built, but no sound in sounds.ts plays it'
		});
	}

	// Animations: each rigged model's standard slots.
	const rigs: { id: string; who: string; model: string; map: AnimationMap }[] = [
		...content.explorer.bodies.map((body) => ({
			id: `explorer ${body.id}`,
			who: `Explorer: ${body.id}`,
			model: content.models[body.anims]?.url ?? '',
			map: content.explorer.animations
		})),
		...Object.entries(content.creatures).map(([id, c]) => ({
			id,
			who: `Creature: ${id}`,
			model: c.model,
			map: c.animations
		})),
		...Object.entries(content.afflictions).flatMap(([id, a]) => {
			const body = a.manifestation?.body;
			return body
				? [
						{
							id: `${id} manifestation`,
							who: `${a.name}: manifestation`,
							model: body.model,
							map: body.animations
						}
					]
				: [];
		})
	];
	for (const rig of rigs) {
		const clips = new Set(disk.gltf.get(assetPath(rig.model))?.animations ?? []);
		const slots = animationSlots(rig.map, clips);
		const absent = slots.filter((s) => s.absent);
		const poses = slots.filter((s) => s.pose);
		const missing = slots.filter((s) => !s.clip);
		rows.push({
			kind: 'animation',
			id: rig.id,
			usedBy: [rig.who],
			files: [rig.model],
			bytes: size(assetPath(rig.model)),
			status: absent.length ? 'missing' : poses.length ? 'placeholder' : 'ok',
			note:
				[
					absent.length ? `Not in the file: ${absent.map((s) => s.clip).join(', ')}` : '',
					poses.length ? `Held poses: ${poses.map((s) => s.slot).join(', ')}` : '',
					missing.length ? `${missing.length} of ${slots.length} slots fall back` : ''
				]
					.filter(Boolean)
					.join('. ') || undefined,
			slots
		});
	}

	// Planned art (content/planned.ts): each until the real file is there under its name.
	const clips = new Set(
		[...disk.gltf]
			.filter(([path]) => path.startsWith('shared/player/'))
			.flatMap(([, gltf]) => gltf.animations)
	);
	const made = (asset: PlannedAsset): boolean => {
		switch (asset.kind) {
			case 'image':
				return asset.id in content.images;
			case 'model':
				return asset.id in content.models;
			case 'piece':
				return asset.id in content.pieces;
			case 'sound':
				return asset.id in content.sounds;
			case 'animation':
				return clips.has(asset.id);
		}
	};
	for (const asset of content.planned ?? []) {
		if (made(asset)) continue;
		// A model is drawn as a box until it is made, a clip held as a pose; the rest is just missing.
		const stand =
			asset.kind === 'model' ? 'drawn as a box' : asset.kind === 'animation' ? 'a held pose' : '';
		rows.push({
			kind: asset.kind,
			id: asset.kind === 'animation' ? `explorer: ${asset.id}` : asset.id,
			usedBy: [`Planned: ${asset.group} (phase ${asset.phase})`],
			files: [],
			bytes: 0,
			status: stand ? 'placeholder' : 'missing',
			note: `${asset.label}. Not made yet${stand ? `: ${stand}` : ''}`,
			planned: asset.phase
		});
	}

	// Files no row above covers (an unused model or picture is listed in its own section).
	for (const path of [...used]) for (const each of disk.gltf.get(path)?.uris ?? []) used.add(each);
	for (const row of rows) for (const url of row.files) used.add(assetPath(url));
	for (const [path, bytes] of [...disk.files].sort(([a], [b]) => a.localeCompare(b))) {
		if (used.has(path)) continue;
		rows.push({
			kind: 'file',
			id: path,
			usedBy: [],
			files: [`/assets/${path}`],
			bytes,
			status: 'unused'
		});
	}

	return { rows, counts: countRows(rows) };
}

/** Each standard slot: the clip mapped to it (and whether the file has it), or its fallback. */
export function animationSlots(map: AnimationMap, clips: Set<string>): SlotUse[] {
	return ANIM_SLOTS.map((slot) => {
		const mapped = map[slot];
		if (mapped) {
			return {
				slot,
				clip: mapped.clip,
				absent: !clips.has(mapped.clip),
				pose: mapped.speed === 0,
				fallback: null
			};
		}
		const fallback = ANIM_FALLBACKS[slot].find((other) => map[other]) ?? null;
		return { slot, clip: null, absent: false, pose: false, fallback };
	});
}

/** Files that contain each name in quotes ('name', "name" or `name`). */
function scanQuoted(sources: AssetDisk['sources'], names: string[]): Map<string, string[]> {
	const found = new Map<string, string[]>();
	for (const name of names) {
		const quoted = [`'${name}'`, `"${name}"`, `\`${name}\``];
		const files = sources
			.filter(({ text }) => quoted.some((q) => text.includes(q)))
			.map(({ file }) => file)
			.sort();
		if (files.length) found.set(name, files);
	}
	return found;
}

function countRows(rows: AssetRow[]): AssetCatalog['counts'] {
	const counts = {} as AssetCatalog['counts'];
	for (const { id } of ASSET_KINDS) {
		counts[id] = { ok: 0, missing: 0, placeholder: 0, unused: 0 };
	}
	for (const row of rows) counts[row.kind][row.status]++;
	return counts;
}
