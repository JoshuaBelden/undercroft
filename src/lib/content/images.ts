import { IMAGE_VERSIONS } from './images.generated.ts';

/**
 * The URL of a picture in static/assets/images (name without extension). It carries the
 * picture's content hash, so a rebuilt picture gets a new URL and no browser keeps showing the
 * old one. Use it for every interface picture. See docs/dev/asset-pipeline.md.
 */
export function imageUrl(name: string): string {
	const version = IMAGE_VERSIONS[name];
	return `/assets/images/${name}.webp${version ? `?v=${version}` : ''}`;
}

/** The picture behind the screens outside the catacombs, for `style:--backdrop-image`. */
export const BACKDROP_IMAGE = `url('${imageUrl('login-bg')}')`;
