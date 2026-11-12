import * as THREE from 'three';

/**
 * Muzzle flare: a camera-facing quad drawn by a shader. A white-hot core, jagged flame petals
 * whose shape changes with each shot's seed, and a soft glow. Additive and unlit, so it costs
 * no light. Sparks from bullet impacts reuse it, smaller and orange.
 */

const VERTEX = /* glsl */ `
	uniform float uSize;
	uniform float uRotation;
	varying vec2 vUv;
	void main() {
		vUv = uv;
		vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
		float c = cos(uRotation);
		float s = sin(uRotation);
		mv.xy += mat2(c, s, -s, c) * position.xy * uSize;
		gl_Position = projectionMatrix * mv;
	}
`;

const FRAGMENT = /* glsl */ `
	uniform float uFade;
	uniform float uSeed;
	uniform vec3 uColor;
	varying vec2 vUv;
	void main() {
		vec2 p = vUv * 2.0 - 1.0;
		float r = length(p);
		float a = atan(p.y, p.x);
		// Five to nine uneven petals; the seed turns and reshapes them shot to shot.
		float rays = 0.55 + 0.3 * sin(a * 5.0 + uSeed * 6.2832) + 0.15 * sin(a * 9.0 - uSeed * 11.0);
		rays = pow(clamp(rays, 0.0, 1.0), 2.5);
		float petals = smoothstep(1.0, 0.0, r / (0.3 + 0.7 * rays));
		float core = exp(-r * r * 22.0);
		float glow = exp(-r * 4.5) * 0.3;
		float light = (core * 1.8 + petals * 0.9 + glow) * uFade;
		vec3 color = mix(uColor, vec3(1.0, 0.96, 0.88), clamp(core * 1.4, 0.0, 1.0));
		gl_FragColor = vec4(color * light, 1.0);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

const geometry = new THREE.PlaneGeometry(1, 1);

export interface Flare {
	mesh: THREE.Mesh;
	/** Light it: `size` metres across, tinted `color`, for `life` seconds. */
	fire(size: number, life: number, color?: THREE.ColorRepresentation): void;
	/** Advance the fade. */
	update(delta: number): void;
	readonly lit: boolean;
	dispose(): void;
}

export function createFlare(): Flare {
	const material = new THREE.ShaderMaterial({
		vertexShader: VERTEX,
		fragmentShader: FRAGMENT,
		uniforms: {
			uSize: { value: 0.3 },
			uRotation: { value: 0 },
			uFade: { value: 0 },
			uSeed: { value: 0 },
			uColor: { value: new THREE.Color(0xff9a3c) }
		},
		blending: THREE.AdditiveBlending,
		transparent: true,
		depthWrite: false
	});
	const mesh = new THREE.Mesh(geometry, material);
	mesh.frustumCulled = false;
	mesh.renderOrder = 10;
	mesh.visible = false;
	let left = 0;
	let life = 1;
	let size = 0.3;
	const u = material.uniforms;
	return {
		mesh,
		get lit() {
			return left > 0;
		},
		fire(newSize, newLife, color = 0xff9a3c) {
			size = newSize;
			life = newLife;
			left = newLife;
			u.uSeed.value = Math.random();
			u.uRotation.value = Math.random() * Math.PI * 2;
			(u.uColor.value as THREE.Color).set(color);
			mesh.visible = true;
		},
		update(delta) {
			if (left <= 0) return;
			left = Math.max(0, left - delta);
			const t = left / life;
			u.uFade.value = t * t;
			// Blooms outward as it dies.
			u.uSize.value = size * (1.25 - 0.25 * t);
			mesh.visible = left > 0;
		},
		dispose() {
			mesh.removeFromParent();
			material.dispose();
		}
	};
}
