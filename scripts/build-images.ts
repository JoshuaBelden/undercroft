/**
 * Turns raw interface art (art/images/*.png, *.jpg, *.webp) into WebP in
 * static/assets/ui/images, named <name>.<content-hash>.webp so each can be cached forever. Run
 * with `pnpm asset:images`. See docs/dev/asset-pipeline.md.
 *
 * Then writes src/lib/content/images.generated.ts: picture name -> URL, which `imageUrl()` reads.
 *
 * The site icon (art/images/icon) also becomes the browser tab icon, static/favicon.ico, and the
 * home screen icon iPhones and iPads use, static/apple-touch-icon.png. Both are linked from
 * src/app.html.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import sharp from 'sharp';
import { hashedName } from './hashed.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'art', 'images');
const OUT_DIR = path.join(ROOT, 'static', 'assets', 'ui', 'images');
/** Served at the site root: browsers and iOS look for the icons there. */
const STATIC_DIR = path.join(ROOT, 'static');
/** Where pictures were built before assets were split into shared/, ui/ and afflictions/. */
const LEGACY_DIR = path.join(ROOT, 'static', 'assets', 'images');
const URL_BASE = '/assets/ui/images';
const MANIFEST = path.join(ROOT, 'src', 'lib', 'content', 'images.generated.ts');
/** Nothing is shown wider than this; larger sources are scaled down. */
const MAX_WIDTH = 2560;
const QUALITY = 82;
/** The picture the tab and home screen icons are made from. */
const ICON = 'icon';
/** Sizes in the .ico: the tab, a pinned tab or shortcut, and high-density screens. */
const FAVICON_SIZES = [16, 32, 48, 64];
/** Apple's home screen icon size; iOS rounds the corners itself, so it is a full square. */
const TOUCH_ICON_SIZE = 180;
/** The black the art is drawn on, behind the home screen icon (which can't be transparent). */
const TOUCH_ICON_BACKGROUND = '#000000';

if (!existsSync(SOURCE_DIR)) {
	console.error(`No ${path.relative(ROOT, SOURCE_DIR)} folder: nothing to build.`);
	process.exit(1);
}
// Every picture is rebuilt from its source, so old (and removed) ones are cleared first.
rmSync(OUT_DIR, { recursive: true, force: true });
rmSync(LEGACY_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const urls: Record<string, string> = {};
for (const file of readdirSync(SOURCE_DIR).sort()) {
	if (!/\.(png|jpe?g|webp)$/i.test(file)) continue;
	const name = path.parse(file).name;
	const { data, info } = await sharp(path.join(SOURCE_DIR, file))
		.resize({ width: MAX_WIDTH, withoutEnlargement: true })
		.webp({ quality: QUALITY })
		.toBuffer({ resolveWithObject: true });
	const out = hashedName(`${name}.webp`, data);
	writeFileSync(path.join(OUT_DIR, out), data);
	urls[name] = `${URL_BASE}/${out}`;
	const kb = Math.round(data.byteLength / 1024);
	console.log(`${file} -> ${out} (${info.width}x${info.height}, ${kb} KB)`);
}

/** A square PNG of the icon, transparent around it. */
async function iconPng(file: string, size: number): Promise<Buffer> {
	return sharp(file)
		.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toBuffer();
}

/** An .ico holding PNG images (every browser reads those), one per size. */
function ico(images: { size: number; png: Buffer }[]): Buffer {
	const header = Buffer.alloc(6 + 16 * images.length);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // 1 = icon
	header.writeUInt16LE(images.length, 4);
	let offset = header.length;
	images.forEach(({ size, png }, i) => {
		const entry = 6 + 16 * i;
		header.writeUInt8(size >= 256 ? 0 : size, entry); // width (0 means 256)
		header.writeUInt8(size >= 256 ? 0 : size, entry + 1); // height
		header.writeUInt8(0, entry + 2); // no palette
		header.writeUInt8(0, entry + 3); // reserved
		header.writeUInt16LE(1, entry + 4); // colour planes
		header.writeUInt16LE(32, entry + 6); // bits per pixel
		header.writeUInt32LE(png.byteLength, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += png.byteLength;
	});
	return Buffer.concat([header, ...images.map((image) => image.png)]);
}

const iconFile = readdirSync(SOURCE_DIR).find((file) => path.parse(file).name === ICON);
if (iconFile) {
	const file = path.join(SOURCE_DIR, iconFile);
	const images = await Promise.all(
		FAVICON_SIZES.map(async (size) => ({ size, png: await iconPng(file, size) }))
	);
	writeFileSync(path.join(STATIC_DIR, 'favicon.ico'), ico(images));
	// The icon fills most of the square, with a margin so iOS's rounded corners don't clip it.
	const inner = Math.round(TOUCH_ICON_SIZE * 0.84);
	const touch = await sharp({
		create: {
			width: TOUCH_ICON_SIZE,
			height: TOUCH_ICON_SIZE,
			channels: 4,
			background: TOUCH_ICON_BACKGROUND
		}
	})
		.composite([{ input: await iconPng(file, inner), gravity: 'centre' }])
		.flatten({ background: TOUCH_ICON_BACKGROUND })
		.png()
		.toBuffer();
	writeFileSync(path.join(STATIC_DIR, 'apple-touch-icon.png'), touch);
	console.log(`${iconFile} -> favicon.ico (${FAVICON_SIZES.join(', ')}) + apple-touch-icon.png`);
} else {
	console.warn(`No art/images/${ICON}: favicon.ico and apple-touch-icon.png left as they are.`);
}

const source = `// Generated by scripts/build-images.ts (pnpm asset:images). Do not edit.

/** Picture name (art/images, no extension) -> URL of its built, content-hashed WebP. */
export const IMAGE_URLS: Record<string, string> = ${JSON.stringify(urls)};
`;
const config = await prettier.resolveConfig(MANIFEST);
writeFileSync(MANIFEST, await prettier.format(source, { ...config, filepath: MANIFEST }));
console.log(`Wrote ${Object.keys(urls).length} pictures -> ${path.relative(ROOT, MANIFEST)}`);
