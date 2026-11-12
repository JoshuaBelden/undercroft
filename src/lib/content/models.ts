import { MODELS } from './models.generated.ts';

/** A built model: its path in static/assets without the content hash. */
export type ModelPath = keyof typeof MODELS;

/**
 * The URL of a built model (`shared/items/knife.glb`, `afflictions/gloaming/creatures/...`). The
 * file name carries a hash of its contents, so it is cached forever and a rebuilt model gets a new
 * URL. A path that was never built fails `pnpm check`. See docs/dev/asset-pipeline.md.
 */
export function modelUrl(path: ModelPath): string {
	return MODELS[path].url;
}

/** Download size of a built model, by URL (preload progress); 0 if unknown. */
export function modelBytes(url: string): number {
	return BYTES.get(url) ?? 0;
}

const BYTES = new Map<string, number>(Object.values(MODELS).map((m) => [m.url, m.bytes]));
