import { IMAGE_URLS } from './images.generated.ts';

/**
 * The URL of an interface picture (name without extension, built into static/assets/ui/images).
 * The file name carries the picture's content hash, so it is cached forever and a rebuilt
 * picture gets a new URL. Use it for every interface picture. See docs/dev/asset-pipeline.md.
 */
export function imageUrl(name: string): string {
	return IMAGE_URLS[name] ?? `/assets/ui/images/${name}.webp`;
}

/** The picture behind the screens outside the catacombs, for `style:--backdrop-image`. */
export const BACKDROP_IMAGE = `url('${imageUrl('login-bg')}')`;
