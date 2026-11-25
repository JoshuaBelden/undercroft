import * as THREE from 'three';
import { PROBES } from '#lib/content/map/probes.ts';
import { PROBE_SIZE, readProbes, sampleProbes, type ProbeGrid } from '#lib/shared/map/probes.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';

/**
 * Lights what moves with the rooms' baked light (docs/dev/fixed-map.md#light-probes). The rooms
 * are lit by their lightmaps; anything else lit (explorers, creatures, crates, doors, dropped
 * things) takes the light of the probes where it stands: a little shader added to its material
 * puts the probes' irradiance in with the rest of its light. Only illumination: no shadows.
 */

const cache = new Map<string, Promise<ProbeGrid>>();

/** A room's probes by URL (content-hashed: each loads once). */
export function loadProbes(url: string): Promise<ProbeGrid> {
	let pending = cache.get(url);
	if (!pending) {
		pending = fetch(url)
			.then((response) => {
				if (!response.ok) throw new Error(`Light probes ${url}: ${response.status}`);
				return response.arrayBuffer();
			})
			.then(readProbes);
		cache.set(url, pending);
	}
	return pending;
}

/** The materials this can light: the ones the lights reach (and the probes, through the same sum). */
type Lit =
	| THREE.MeshStandardMaterial
	| THREE.MeshPhysicalMaterial
	| THREE.MeshLambertMaterial
	| THREE.MeshPhongMaterial;

function isLit(material: THREE.Material): material is Lit {
	return (
		material instanceof THREE.MeshStandardMaterial ||
		material instanceof THREE.MeshLambertMaterial ||
		material instanceof THREE.MeshPhongMaterial
	);
}

/** The probes' light, as the shader takes it: order-1 harmonics, world axes (see probes.ts). */
const HEADER = /* glsl */ `
uniform vec3 probeSH[ 4 ];
vec3 probeIrradiance( const in vec3 viewNormal ) {
	vec3 n = inverseTransformDirection( viewNormal, viewMatrix );
	vec3 e = probeSH[ 0 ] * 0.886227
		+ ( probeSH[ 1 ] * n.y + probeSH[ 2 ] * n.z + probeSH[ 3 ] * n.x ) * 1.023328;
	return max( e, vec3( 0.0 ) );
}
`;

interface Patched {
	uniform: { value: Float32Array };
}

/** Teach a material to take the probes' light; its uniform holds where it was last drawn. */
function patch(material: Lit): Patched {
	const existing = material.userData.probe as Patched | undefined;
	if (existing) return existing;
	const patched: Patched = { uniform: { value: new Float32Array(PROBE_SIZE) } };
	material.userData.probe = patched;
	material.onBeforeCompile = (shader) => {
		shader.uniforms.probeSH = patched.uniform;
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <lights_pars_begin>', `#include <lights_pars_begin>\n${HEADER}`)
			.replace(
				'#include <lights_fragment_maps>',
				'#include <lights_fragment_maps>\n\tirradiance += probeIrradiance( normal );'
			);
	};
	material.customProgramCacheKey = () => 'probe-lit';
	// Compiled already without it: again, with it.
	material.needsUpdate = true;
	return patched;
}

/** The rooms' probes, and which room each is placed where (rooms aren't turned yet). */
interface Placed {
	grid: ProbeGrid;
	offset: Vec3;
}

export class ProbeLight {
	private rooms: Placed[] = [];
	private sweepIn = 0;
	private sample = new Float32Array(PROBE_SIZE);
	private at = new THREE.Vector3();

	/** The probes of the map's rooms, each where its room stands. */
	setRooms(rooms: { grid: ProbeGrid; position: Vec3 }[]): void {
		this.rooms = rooms.map(({ grid, position }) => ({ grid, offset: position }));
		this.sweepIn = 0;
	}

	clear(): void {
		this.rooms = [];
	}

	/** Each frame: now and then, find what is new in the scene and teach it the probes. */
	update(scene: THREE.Scene, delta: number): void {
		if (this.rooms.length === 0) return;
		this.sweepIn -= delta;
		if (this.sweepIn > 0) return;
		this.sweepIn = PROBES.sweepEvery;
		scene.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			const materials = Array.isArray(object.material) ? object.material : [object.material];
			// Done already, unless its materials have changed since (an explorer dressed again).
			if (object.userData.probeLit === materials[0]) return;
			// The rooms themselves are lit by their lightmaps.
			if (!materials.some(isLit) || materials.some((m) => isLit(m) && m.lightMap)) return;
			object.userData.probeLit = materials[0];
			const patched = materials.filter(isLit).map(patch);
			object.onBeforeRender = () => {
				object.getWorldPosition(this.at);
				const sh = this.lightAt([this.at.x, this.at.y, this.at.z]);
				for (const { uniform } of patched) uniform.value.set(sh);
				// A material shared between things in different places: sent again for each.
				for (const material of materials) material.uniformsNeedUpdate = true;
			};
		});
	}

	/** The probes' light where something stands (in the room it is in), turned to PROBES.gain. */
	private lightAt(position: Vec3): Float32Array {
		const placed = this.roomAt(position);
		if (!placed) return this.sample.fill(0);
		const [ox, oy, oz] = placed.offset;
		sampleProbes(placed.grid, [position[0] - ox, position[1] - oy, position[2] - oz], this.sample);
		for (let k = 0; k < PROBE_SIZE; k++) this.sample[k] *= PROBES.gain;
		return this.sample;
	}

	/** The room whose probes reach this far (the nearest grid, for a spot between rooms). */
	private roomAt(position: Vec3): Placed | null {
		let best: Placed | null = null;
		let bestOut = Infinity;
		for (const placed of this.rooms) {
			const { origin, count, spacing } = placed.grid;
			const size: Vec3 = [
				(count[0] - 1) * spacing[0],
				(count[1] - 1) * spacing[1],
				(count[2] - 1) * spacing[0]
			];
			let out = 0;
			for (let a = 0; a < 3; a++) {
				const p = position[a] - placed.offset[a] - origin[a];
				out += Math.max(0, -p, p - size[a]);
			}
			if (out < bestOut) {
				best = placed;
				bestOut = out;
			}
		}
		return best;
	}
}
