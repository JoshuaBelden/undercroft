import type { AnimSlot } from './animations.ts';
import type { SynthSpec } from './audio/sounds.ts';

/**
 * The Art & Assets list's kinds, statuses and rows (the admin app's /assets page; built by
 * src/lib/server/assets/catalog.ts). Safe in the browser: no content data here.
 */

export type AssetKind = 'model' | 'piece' | 'image' | 'sound' | 'animation' | 'file';
export type AssetStatus = 'ok' | 'missing' | 'placeholder' | 'synthesized' | 'unused';

export const ASSET_KINDS: { id: AssetKind; label: string }[] = [
	{ id: 'model', label: 'Models' },
	{ id: 'piece', label: 'Map pieces' },
	{ id: 'image', label: 'Pictures' },
	{ id: 'sound', label: 'Sounds' },
	{ id: 'animation', label: 'Animations' },
	{ id: 'file', label: 'Unused files' }
];

export const ASSET_STATUSES: { id: AssetStatus; label: string; hint: string }[] = [
	{ id: 'ok', label: 'OK', hint: 'Used and present' },
	{ id: 'missing', label: 'Missing', hint: 'Named by the game, but no file' },
	{ id: 'placeholder', label: 'Placeholder', hint: 'A stand-in: a box, a held pose' },
	{ id: 'synthesized', label: 'Synthesized', hint: 'No recording: made in code' },
	{ id: 'unused', label: 'Unused', hint: 'A file nothing uses' }
];

/** One slot of a rigged model: its clip, or what it falls back to. */
export interface SlotUse {
	slot: AnimSlot;
	/** The clip mapped to it, if any. */
	clip: string | null;
	/** The mapped clip isn't in the model file. */
	absent: boolean;
	/** The clip is held on its first frame (speed 0): a pose standing in for a real clip. */
	pose: boolean;
	/** With no clip: the slot played instead, or null (whatever was playing carries on). */
	fallback: AnimSlot | null;
}

export interface AssetRow {
	kind: AssetKind;
	id: string;
	/** What uses it: content ("Item: Knife") or source files. */
	usedBy: string[];
	/** Its files, as URLs under /assets. */
	files: string[];
	bytes: number;
	status: AssetStatus;
	note?: string;
	/** Sounds: how loud it plays (LUFS, from `pnpm asset:levels`); stale when its files changed. */
	level?: { lufs: number; peak: number; stale: boolean } | null;
	/** Sounds: the placeholder made in code, and the volume and rate it plays at, so it can be heard. */
	synth?: { spec: SynthSpec; volume: number; rate: number };
	/** Animations: every standard slot. */
	slots?: SlotUse[];
	/** Art not made yet (content/planned.ts): the first phase of the handoff that needs it. */
	planned?: number;
}

export interface AssetCatalog {
	rows: AssetRow[];
	/** Rows by kind and status. */
	counts: Record<AssetKind, Record<AssetStatus, number>>;
}
