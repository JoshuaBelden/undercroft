import * as THREE from 'three';

/**
 * The manifestation's ray, drawn: the charge gathering at its hands (blue smoke drawn in round a
 * dark core, thickening as it builds) and the ray itself (a dark beam in a blue sheath, thin white
 * streaks crackling along it, smoke drifting off it as it fades). No lights: none of it counts
 * toward the light budget.
 * See docs/dev/affliction.md#the-ray-it-puts-your-light-out.
 */

/** The smoke's colour, and the beam's dark core. */
const SMOKE = 0x5f7dff;
const CORE = 0x04050a;
/** Smoke motes gathering in the charge. */
const CHARGE_MOTES = 80;
/** Radius (m) they start out at, and the dark core's largest radius. */
const CHARGE_RADIUS = 0.9;
const CHARGE_CORE = 0.22;
/** Seconds the beam shows, and the smoke off it lingers. */
const BEAM_SECONDS = 0.5;
const SMOKE_SECONDS = 1.1;
/** Smoke motes per metre of beam. */
const MOTES_PER_METRE = 9;
const MAX_MOTES = 220;
/** White streaks along the beam (1px lines): per metre, at most, how long each, how far out. */
const STREAKS_PER_METRE = 5;
const MAX_STREAKS = 120;
const STREAK_LENGTH: [number, number] = [0.4, 1.8];
const STREAK_SPREAD = 0.22;

interface Shot {
	group: THREE.Group;
	core: THREE.Mesh;
	sheath: THREE.Mesh;
	streaks: THREE.LineSegments;
	from: THREE.Vector3;
	to: THREE.Vector3;
	smoke: THREE.Points;
	/** Each mote's drift (m/s). */
	drift: Float32Array;
	age: number;
}

let smokeTexture: THREE.Texture | null = null;

/** A soft round puff, drawn once on a canvas. */
function puff(): THREE.Texture {
	if (smokeTexture) return smokeTexture;
	const size = 64;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const g = canvas.getContext('2d')!;
	const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	grad.addColorStop(0, 'rgba(255,255,255,1)');
	grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
	grad.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, size, size);
	smokeTexture = new THREE.CanvasTexture(canvas);
	return smokeTexture;
}

function smokeMaterial(size: number): THREE.PointsMaterial {
	return new THREE.PointsMaterial({
		color: SMOKE,
		size,
		map: puff(),
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		sizeAttenuation: true
	});
}

const axis = new THREE.Vector3();
const side = new THREE.Vector3();
const other = new THREE.Vector3();
const point = new THREE.Vector3();

/**
 * Lay the beam's streaks out afresh: each a short line along it, a little off its axis, most of
 * them near the middle, so they flicker like a crackle round the dark core.
 */
function crackle(streaks: THREE.LineSegments, from: THREE.Vector3, to: THREE.Vector3): void {
	const length = from.distanceTo(to);
	axis.subVectors(to, from).normalize();
	side.set(0, 1, 0).cross(axis);
	if (side.lengthSq() < 1e-6) side.set(1, 0, 0).cross(axis);
	side.normalize();
	other.crossVectors(axis, side);
	const positions = streaks.geometry.getAttribute('position') as THREE.BufferAttribute;
	for (let i = 0; i < positions.count / 2; i++) {
		const run = STREAK_LENGTH[0] + Math.random() * (STREAK_LENGTH[1] - STREAK_LENGTH[0]);
		const start = Math.random() * Math.max(0, length - run);
		const end = Math.min(length, start + run);
		const a = Math.random() * Math.PI * 2;
		// Mostly close in, a few further out.
		const r = STREAK_SPREAD * Math.random() ** 2;
		const twist = (Math.random() - 0.5) * 0.06;
		for (const [k, t, rr] of [
			[0, start, r],
			[1, end, r + twist]
		] as const) {
			point
				.copy(from)
				.addScaledVector(axis, t)
				.addScaledVector(side, Math.cos(a) * rr)
				.addScaledVector(other, Math.sin(a) * rr);
			positions.setXYZ(i * 2 + k, point.x, point.y, point.z);
		}
	}
	positions.needsUpdate = true;
}

export class RayEffects {
	readonly root = new THREE.Group();
	private chargeMotes: THREE.Points;
	/** Each charge mote: its direction in, and where it is along it (1 out, 0 at the hands). */
	private chargeDirs = new Float32Array(CHARGE_MOTES * 3);
	private chargePhase = new Float32Array(CHARGE_MOTES);
	private chargeCore: THREE.Mesh;
	private charging = 0;
	private shots: Shot[] = [];
	private beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);

	constructor() {
		this.root.name = 'manifestation-ray';
		const positions = new Float32Array(CHARGE_MOTES * 3);
		for (let i = 0; i < CHARGE_MOTES; i++) {
			const v = new THREE.Vector3().randomDirection();
			this.chargeDirs.set([v.x, v.y, v.z], i * 3);
			this.chargePhase[i] = Math.random();
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		this.chargeMotes = new THREE.Points(geometry, smokeMaterial(0.32));
		this.chargeMotes.frustumCulled = false;
		this.chargeMotes.visible = false;
		this.chargeCore = new THREE.Mesh(
			new THREE.SphereGeometry(1, 12, 10),
			new THREE.MeshBasicMaterial({
				color: CORE,
				transparent: true,
				opacity: 0.9,
				depthWrite: false
			})
		);
		this.chargeCore.visible = false;
		this.root.add(this.chargeMotes, this.chargeCore);
	}

	/** The charge gathering at `at` (world space), `amount` 0..1 of the way built; 0 hides it. */
	charge(at: THREE.Vector3, amount: number): void {
		this.charging = amount;
		this.chargeMotes.visible = this.chargeCore.visible = amount > 0;
		this.chargeMotes.position.copy(at);
		this.chargeCore.position.copy(at);
	}

	/** The ray strikes from `from` to `to` (world space). */
	fire(from: THREE.Vector3, to: THREE.Vector3): void {
		const length = from.distanceTo(to);
		if (length < 0.05) return;
		const group = new THREE.Group();
		const mid = from.clone().add(to).multiplyScalar(0.5);
		const up = new THREE.Quaternion().setFromUnitVectors(
			new THREE.Vector3(0, 1, 0),
			to.clone().sub(from).normalize()
		);
		const beam = (radius: number, material: THREE.Material) => {
			const mesh = new THREE.Mesh(this.beamGeometry, material);
			mesh.position.copy(mid);
			mesh.quaternion.copy(up);
			mesh.scale.set(radius, length, radius);
			mesh.frustumCulled = false;
			group.add(mesh);
			return mesh;
		};
		const core = beam(
			0.07,
			new THREE.MeshBasicMaterial({
				color: CORE,
				transparent: true,
				opacity: 0.95,
				depthWrite: false
			})
		);
		const sheath = beam(
			0.2,
			new THREE.MeshBasicMaterial({
				color: SMOKE,
				transparent: true,
				opacity: 0.7,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				side: THREE.DoubleSide
			})
		);
		// Thin white streaks along it, crackling (laid out afresh every frame: see `crackle`).
		const streakCount = Math.min(MAX_STREAKS, Math.ceil(length * STREAKS_PER_METRE));
		const streakGeometry = new THREE.BufferGeometry();
		streakGeometry.setAttribute(
			'position',
			new THREE.BufferAttribute(new Float32Array(streakCount * 6), 3)
		);
		const streaks = new THREE.LineSegments(
			streakGeometry,
			new THREE.LineBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 1,
				depthWrite: false,
				blending: THREE.AdditiveBlending
			})
		);
		streaks.frustumCulled = false;
		group.add(streaks);
		crackle(streaks, from, to);
		// Smoke along the beam, drifting off it.
		const count = Math.min(MAX_MOTES, Math.ceil(length * MOTES_PER_METRE));
		const positions = new Float32Array(count * 3);
		const drift = new Float32Array(count * 3);
		const p = new THREE.Vector3();
		for (let i = 0; i < count; i++) {
			p.lerpVectors(from, to, Math.random());
			const off = new THREE.Vector3().randomDirection();
			positions.set([p.x + off.x * 0.08, p.y + off.y * 0.08, p.z + off.z * 0.08], i * 3);
			drift.set([off.x * 0.35, off.y * 0.35 + 0.25, off.z * 0.35], i * 3);
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		const smoke = new THREE.Points(geometry, smokeMaterial(0.45));
		smoke.frustumCulled = false;
		group.add(smoke);
		this.root.add(group);
		this.shots.push({
			group,
			core,
			sheath,
			streaks,
			from: from.clone(),
			to: to.clone(),
			smoke,
			drift,
			age: 0
		});
	}

	update(delta: number): void {
		if (this.charging > 0) {
			// Motes drawn in round the hands, faster and thicker as the charge builds.
			const positions = this.chargeMotes.geometry.getAttribute('position') as THREE.BufferAttribute;
			for (let i = 0; i < CHARGE_MOTES; i++) {
				let t = this.chargePhase[i] - delta * (0.8 + 1.6 * this.charging);
				if (t <= 0) t += 1;
				this.chargePhase[i] = t;
				const r = CHARGE_RADIUS * t;
				// A little swirl: each mote turns about the vertical as it comes in.
				const a = (1 - t) * 2.5;
				const x = this.chargeDirs[i * 3];
				const z = this.chargeDirs[i * 3 + 2];
				positions.setXYZ(
					i,
					(x * Math.cos(a) - z * Math.sin(a)) * r,
					this.chargeDirs[i * 3 + 1] * r * 0.6,
					(x * Math.sin(a) + z * Math.cos(a)) * r
				);
			}
			positions.needsUpdate = true;
			const motes = this.chargeMotes.material as THREE.PointsMaterial;
			motes.opacity = 0.25 + 0.75 * this.charging;
			const pulse = 1 + 0.12 * Math.sin(performance.now() / 45);
			this.chargeCore.scale.setScalar(Math.max(0.01, CHARGE_CORE * this.charging * pulse));
		}
		for (const shot of this.shots) {
			shot.age += delta;
			const beam = Math.max(0, 1 - shot.age / BEAM_SECONDS);
			(shot.core.material as THREE.MeshBasicMaterial).opacity = 0.95 * beam;
			(shot.sheath.material as THREE.MeshBasicMaterial).opacity = 0.7 * beam;
			shot.core.visible = shot.sheath.visible = shot.streaks.visible = beam > 0;
			if (beam > 0) {
				(shot.streaks.material as THREE.LineBasicMaterial).opacity = Math.min(1, beam * 1.6);
				crackle(shot.streaks, shot.from, shot.to);
			}
			const fade = Math.max(0, 1 - shot.age / SMOKE_SECONDS);
			const material = shot.smoke.material as THREE.PointsMaterial;
			material.opacity = fade * 0.8;
			material.size = 0.45 + shot.age * 0.6;
			const positions = shot.smoke.geometry.getAttribute('position') as THREE.BufferAttribute;
			for (let i = 0; i < positions.count; i++) {
				positions.setXYZ(
					i,
					positions.getX(i) + shot.drift[i * 3] * delta,
					positions.getY(i) + shot.drift[i * 3 + 1] * delta,
					positions.getZ(i) + shot.drift[i * 3 + 2] * delta
				);
			}
			positions.needsUpdate = true;
		}
		for (const shot of this.shots.filter((s) => s.age >= SMOKE_SECONDS)) this.drop(shot);
	}

	/** Stop the charge and take every ray away (the fight is over, or the expedition). */
	clear(): void {
		this.charge(this.root.position, 0);
		for (const shot of [...this.shots]) this.drop(shot);
	}

	dispose(): void {
		this.clear();
		this.beamGeometry.dispose();
		this.chargeMotes.geometry.dispose();
		(this.chargeMotes.material as THREE.Material).dispose();
		this.chargeCore.geometry.dispose();
		(this.chargeCore.material as THREE.Material).dispose();
		this.root.clear();
	}

	private drop(shot: Shot): void {
		shot.group.removeFromParent();
		shot.smoke.geometry.dispose();
		shot.streaks.geometry.dispose();
		const materials = [shot.core.material, shot.sheath.material, shot.streaks.material];
		for (const m of [...materials, shot.smoke.material]) {
			(m as THREE.Material).dispose();
		}
		this.shots = this.shots.filter((s) => s !== shot);
	}
}
