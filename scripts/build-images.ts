/**
 * Turns raw interface art (art/images/*.png, *.jpg, *.webp) into WebP in static/assets/images, keeping
 * each file's name. Run with `pnpm asset:images`. See docs/dev/asset-pipeline.md.
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'art', 'images');
const OUT_DIR = path.join(ROOT, 'static', 'assets', 'images');
/** Nothing is shown wider than this; larger sources are scaled down. */
const MAX_WIDTH = 2560;
const QUALITY = 82;

if (!existsSync(SOURCE_DIR)) {
	console.error(`No ${path.relative(ROOT, SOURCE_DIR)} folder: nothing to build.`);
	process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

for (const file of readdirSync(SOURCE_DIR)) {
	if (!/\.(png|jpe?g|webp)$/i.test(file)) continue;
	const out = path.join(OUT_DIR, `${path.parse(file).name}.webp`);
	const info = await sharp(path.join(SOURCE_DIR, file))
		.resize({ width: MAX_WIDTH, withoutEnlargement: true })
		.webp({ quality: QUALITY })
		.toFile(out);
	const kb = Math.round(statSync(out).size / 1024);
	console.log(`${file} -> ${path.relative(ROOT, out)} (${info.width}x${info.height}, ${kb} KB)`);
}
