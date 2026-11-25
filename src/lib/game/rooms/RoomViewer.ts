import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ROOM_VIEWER } from '#lib/content/map/roomViewer.ts';
import { Engine } from '#lib/game/Engine.ts';
import type { InputMap } from '#lib/game/input/InputMap.ts';
import type { Action } from '#lib/game/input/actions.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import { SIM_RATE } from '#lib/shared/constants.ts';
import { buildCollisionWorld, type CollisionWorld } from '#lib/shared/map/collision.ts';
import {
	readRoom,
	roomPiece,
	type RoomManifest,
	type RoomMarker,
	type RoomNode
} from '#lib/shared/map/room.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';
import {
	clonePlayerState,
	createPlayerState,
	eyeHeight,
	idleFrame,
	stepPlayer
} from '#lib/shared/player/simulate.ts';
import type { PlayerState, Stance } from '#lib/shared/player/types.ts';
import type { RoomFile } from './files.ts';
import { buildOverlays, type RoomOverlays } from './overlays.ts';

/**
 * The room viewer (dev): one room, straight from its Blender export, to fly round or walk with the
 * game's own movement and collision, with its markers, colliders and volumes drawn over it.
 * Loading a room again (a re-export) keeps the camera where it is. See docs/dev/room-viewer.md.
 */

export type RoomViewMode = 'fly' | 'walk';

export interface RoomToggles {
	colliders: boolean;
	volumes: boolean;
	markers: boolean;
	labels: boolean;
	/** The baked lightmap, when the room has one. */
	lightmap: boolean;
	/** Even light everywhere (for a room with nothing baked yet). */
	fullbright: boolean;
	headlamp: boolean;
}

export interface RoomStats {
	fps: number;
	frameMs: number;
	drawCalls: number;
	triangles: number;
	textures: number;
	/** GPU memory for the textures, with mipmaps (MB). */
	textureMB: number;
	lightmap: { width: number; height: number; texelsPerMetre: number } | null;
}

/** Where the camera is, to come back to. */
export interface RoomView {
	position: Vec3;
	yaw: number;
	pitch: number;
	mode: RoomViewMode;
}

const DT = 1 / SIM_RATE;
const MAX_STEPS = 10;
const STANCES: Stance[] = ['stand', 'crouch', 'crawl'];
/** Markers whose names say they are only markers (drawn by the overlays instead). */
const HIDDEN = /^(col|vol|socket|spawn|extract)-/;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const textureLoader = new THREE.TextureLoader();

export class RoomViewer {
	readonly engine: Engine;
	mode: RoomViewMode = 'fly';
	manifest: RoomManifest | null = null;
	toggles: RoomToggles = {
		colliders: false,
		volumes: true,
		markers: true,
		labels: true,
		lightmap: true,
		fullbright: true,
		headlamp: false
	};

	private labelRenderer = new CSS2DRenderer();
	private room: THREE.Object3D | null = null;
	private overlays: RoomOverlays | null = null;
	private lightmap: THREE.Texture | null = null;
	private lightmapInfo: RoomStats['lightmap'] = null;
	private roomStats = { triangles: 0, textures: 0, textureMB: 0 };
	private world: CollisionWorld | null = null;
	private player: PlayerState | null = null;
	private previous: PlayerState | null = null;
	private stance: Stance = 'stand';
	private seq = 0;
	private accumulator = 0;
	private yaw = 0;
	private pitch = 0;
	private loadId = 0;
	private ambient = new THREE.AmbientLight(0xffffff, ROOM_VIEWER.fullbright.ambient);
	private hemisphere = new THREE.HemisphereLight(
		ROOM_VIEWER.fullbright.sky,
		ROOM_VIEWER.fullbright.ground,
		ROOM_VIEWER.fullbright.hemisphere
	);
	private headlamp: THREE.SpotLight;
	private move = new THREE.Vector3();
	private unsubscribe: (() => void)[] = [];

	constructor(
		canvas: HTMLCanvasElement,
		labels: HTMLElement,
		private input: InputMap
	) {
		this.engine = new Engine(canvas);
		this.engine.applyGraphics(settings.graphics);
		this.engine.camera.rotation.order = 'YXZ';
		this.engine.scene.add(this.ambient, this.hemisphere);
		const lamp = ROOM_VIEWER.headlamp;
		this.headlamp = new THREE.SpotLight(
			0xfff1dc,
			lamp.intensity,
			lamp.distance,
			lamp.angle,
			lamp.penumbra,
			lamp.decay
		);
		this.headlamp.position.set(0, 0, 0);
		this.headlamp.target.position.set(0, 0, -1);
		this.engine.camera.add(this.headlamp, this.headlamp.target);

		this.labelRenderer.domElement.className = 'room-labels';
		labels.append(this.labelRenderer.domElement);
		const resize = new ResizeObserver(() =>
			this.labelRenderer.setSize(labels.clientWidth, labels.clientHeight)
		);
		resize.observe(labels);
		this.unsubscribe.push(() => resize.disconnect());
		this.unsubscribe.push(
			input.onPressed((action) => {
				if (action === 'stance') this.nextStance();
			})
		);
		this.unsubscribe.push(this.engine.onUpdate((delta) => this.update(delta)));
		this.applyToggles();
		this.engine.start();
	}

	/** Load (or load again) a room. The camera stays where it is. */
	async load(file: RoomFile): Promise<RoomManifest> {
		const id = ++this.loadId;
		const [gltf, lightmap] = await Promise.all([
			loader.loadAsync(file.url),
			file.lightmap ? textureLoader.loadAsync(file.lightmap) : Promise.resolve(null)
		]);
		if (id !== this.loadId) {
			lightmap?.dispose();
			throw new Error('superseded');
		}
		this.clearRoom();
		const room = gltf.scene;
		room.updateMatrixWorld(true);
		const manifest = readRoom(file.name, roomNodes(gltf));
		room.traverse((object) => {
			if (HIDDEN.test(nodeName(gltf, object))) object.visible = false;
		});
		this.room = room;
		this.manifest = manifest;
		this.engine.scene.add(room);

		if (lightmap) {
			lightmap.flipY = false;
			lightmap.channel = 1;
			lightmap.colorSpace = THREE.SRGBColorSpace;
			this.lightmap = lightmap;
		}
		this.roomStats = measure(room);
		this.lightmapInfo = lightmap ? lightmapStats(room, lightmap) : null;

		this.overlays = buildOverlays(manifest);
		const { colliders, volumes, markers, labels } = this.overlays;
		this.engine.scene.add(colliders, volumes, markers, labels);

		this.world = buildCollisionWorld(
			{
				seed: 0,
				affliction: null,
				placements: [{ piece: file.name, position: [0, 0, 0], rotation: 0, tier: 0 }],
				crates: [],
				doors: []
			},
			{ [file.name]: roomPiece(manifest) }
		);
		this.applyToggles();
		return manifest;
	}

	setToggles(toggles: Partial<RoomToggles>): void {
		this.toggles = { ...this.toggles, ...toggles };
		this.applyToggles();
	}

	get hasLightmap(): boolean {
		return this.lightmap !== null;
	}

	/** Fly, or walk from where the camera is (falling to the floor below). */
	setMode(mode: RoomViewMode): void {
		this.mode = mode;
		if (mode === 'walk') {
			const eye = eyeHeight(createPlayerState([0, 0, 0], 0));
			const at = this.engine.camera.position;
			this.stance = 'stand';
			this.player = createPlayerState([at.x, at.y - eye, at.z], this.yaw);
			this.previous = clonePlayerState(this.player);
			this.accumulator = 0;
		} else {
			this.player = null;
			this.previous = null;
		}
	}

	/** Stand at a marker, facing its way. */
	goTo(marker: RoomMarker): void {
		const [x, y, z] = marker.position;
		this.yaw = marker.yaw;
		this.pitch = 0;
		if (this.mode === 'walk') {
			this.player = createPlayerState([x, y, z], marker.yaw);
			this.previous = clonePlayerState(this.player);
		} else {
			this.engine.camera.position.set(x, y + eyeHeight(createPlayerState([x, y, z], 0)), z);
		}
	}

	/** Where to start in a room never seen before: its first spawn, or over its middle. */
	startView(): RoomView {
		const spawn = this.manifest?.markers.find((m) => m.kind === 'spawn');
		if (spawn) {
			const [x, y, z] = spawn.position;
			return { position: [x, y + 1.6, z], yaw: spawn.yaw, pitch: 0, mode: 'fly' };
		}
		const box = this.room ? new THREE.Box3().setFromObject(this.room) : new THREE.Box3();
		const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
		const floor = box.isEmpty() ? 0 : box.min.y;
		return { position: [centre.x, floor + 1.6, centre.z], yaw: 0, pitch: 0, mode: 'fly' };
	}

	view(): RoomView {
		const p = this.engine.camera.position;
		return { position: [p.x, p.y, p.z], yaw: this.yaw, pitch: this.pitch, mode: this.mode };
	}

	restore(view: RoomView): void {
		this.engine.camera.position.set(...view.position);
		this.yaw = view.yaw;
		this.pitch = view.pitch;
		this.setMode(view.mode);
	}

	stats(): RoomStats {
		const frame = this.engine.stats;
		return {
			fps: frame.fps,
			frameMs: frame.frameMs,
			drawCalls: frame.drawCalls,
			...this.roomStats,
			lightmap: this.lightmapInfo
		};
	}

	dispose(): void {
		this.loadId++;
		for (const stop of this.unsubscribe) stop();
		this.clearRoom();
		this.labelRenderer.domElement.remove();
		this.engine.dispose();
	}

	private clearRoom(): void {
		if (this.room) {
			this.engine.scene.remove(this.room);
			disposeModel(this.room);
		}
		if (this.overlays) {
			const { colliders, volumes, markers, labels } = this.overlays;
			this.engine.scene.remove(colliders, volumes, markers, labels);
			this.overlays.dispose();
		}
		this.lightmap?.dispose();
		this.room = null;
		this.overlays = null;
		this.lightmap = null;
		this.manifest = null;
		this.world = null;
	}

	private applyToggles(): void {
		const t = this.toggles;
		if (this.overlays) {
			this.overlays.colliders.visible = t.colliders;
			this.overlays.volumes.visible = t.volumes;
			this.overlays.markers.visible = t.markers;
			this.overlays.labels.visible = t.markers && t.labels;
		}
		this.labelRenderer.domElement.style.display = t.markers && t.labels ? '' : 'none';
		this.ambient.visible = t.fullbright;
		this.hemisphere.visible = t.fullbright;
		this.headlamp.visible = t.headlamp;
		const lightmap = t.lightmap ? this.lightmap : null;
		this.room?.traverse((object) => {
			if (!(object instanceof THREE.Mesh) || !object.geometry.getAttribute('uv1')) return;
			for (const material of materials(object)) {
				if (!(material instanceof THREE.MeshStandardMaterial)) continue;
				if (material.lightMap === lightmap) continue;
				material.lightMap = lightmap;
				material.needsUpdate = true;
			}
		});
	}

	private nextStance(): void {
		if (this.mode !== 'walk') return;
		this.stance = STANCES[(STANCES.indexOf(this.stance) + 1) % STANCES.length];
	}

	private update(delta: number): void {
		this.look(delta);
		if (this.mode === 'walk') this.walk(delta);
		else this.fly(delta);
		this.engine.camera.rotation.set(this.pitch, this.yaw, 0);
		this.labelRenderer.render(this.engine.scene, this.engine.camera);
	}

	private look(delta: number): void {
		const [dx, dy] = this.input.consumeLook();
		const stick = this.input.lookStick();
		const fly = ROOM_VIEWER.fly;
		const mouse = fly.mouse * settings.controls.mouseSensitivity;
		this.yaw -= dx * mouse + stick.x * fly.stickTurn * delta;
		const invert = settings.controls.invertY ? -1 : 1;
		this.pitch -= (dy * mouse + stick.y * fly.stickTurn * delta) * invert;
		this.pitch = Math.max(-fly.maxPitch, Math.min(fly.maxPitch, this.pitch));
	}

	private axis(pos: Action, neg: Action): number {
		return (this.input.isDown(pos) ? 1 : 0) - (this.input.isDown(neg) ? 1 : 0);
	}

	private fly(delta: number): void {
		const stick = this.input.moveStick();
		const pushed = stick.x !== 0 || stick.y !== 0;
		this.move.set(
			pushed ? stick.x : this.axis('moveRight', 'moveLeft'),
			this.axis('climb', 'swimDown'),
			pushed ? stick.y : -this.axis('moveForward', 'moveBack')
		);
		if (this.move.lengthSq() === 0) return;
		const fly = ROOM_VIEWER.fly;
		const speed = fly.speed * (this.input.isDown('sprint') ? fly.fast : 1);
		// Up and down stay straight up and down; the rest follows where you look.
		const vertical = this.move.y;
		this.move.y = 0;
		this.move.applyQuaternion(this.engine.camera.quaternion);
		this.move.y += vertical;
		this.engine.camera.position.addScaledVector(this.move, speed * delta);
	}

	private walk(delta: number): void {
		const state = this.player;
		const world = this.world;
		if (!state || !world || !this.previous) return;
		this.accumulator += delta;
		let steps = 0;
		while (this.accumulator >= DT && steps < MAX_STEPS) {
			this.accumulator -= DT;
			steps++;
			const stick = this.input.moveStick();
			const pushed = stick.x !== 0 || stick.y !== 0;
			const frame = {
				...idleFrame(this.seq++, state),
				moveX: pushed ? stick.x : this.axis('moveRight', 'moveLeft'),
				moveZ: pushed ? -stick.y : this.axis('moveForward', 'moveBack'),
				yaw: this.yaw,
				pitch: this.pitch,
				sprint: this.input.isDown('sprint'),
				climb: this.input.isDown('climb'),
				swimDown: this.input.isDown('swimDown'),
				interact: this.input.isDown('interact'),
				stance: this.stance,
				headlamp: 0 as const
			};
			this.previous = clonePlayerState(state);
			stepPlayer(state, frame, world, DT);
			// The game's stance is the one the step allows (no standing up under a low ceiling).
			this.stance = state.stance;
		}
		if (steps === MAX_STEPS) this.accumulator = 0;
		const alpha = this.accumulator / DT;
		const prev = this.previous.position;
		const p = state.position;
		const at = (i: number) => prev[i] + (p[i] - prev[i]) * alpha;
		this.engine.camera.position.set(at(0), at(1) + eyeHeight(state), at(2));
	}
}

/** The name Blender gave a node, as exported (Three.js drops the dots from names). */
function nodeName(gltf: GLTF, object: THREE.Object3D): string {
	const index = gltf.parser.associations.get(object)?.nodes;
	const json = gltf.parser.json as { nodes?: { name?: string }[] };
	return (index !== undefined ? json.nodes?.[index]?.name : undefined) ?? object.name;
}

/** Every node of the export, in room space, for reading its markers. */
function roomNodes(gltf: GLTF): RoomNode[] {
	const nodes: RoomNode[] = [];
	const position = new THREE.Vector3();
	const rotation = new THREE.Quaternion();
	const scale = new THREE.Vector3();
	gltf.scene.traverse((object) => {
		if (object === gltf.scene) return;
		if (gltf.parser.associations.get(object)?.nodes === undefined) return;
		object.matrixWorld.decompose(position, rotation, scale);
		nodes.push({
			name: nodeName(gltf, object),
			position: [position.x, position.y, position.z],
			rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
			scale: [scale.x, scale.y, scale.z],
			extras: object.userData as Record<string, unknown>,
			mesh: object instanceof THREE.Mesh || object.children.some((c) => c instanceof THREE.Mesh)
		});
	});
	return nodes;
}

function materials(mesh: THREE.Mesh): THREE.Material[] {
	return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

const TEXTURE_SLOTS = [
	'map',
	'normalMap',
	'roughnessMap',
	'metalnessMap',
	'aoMap',
	'emissiveMap',
	'alphaMap'
] as const;

/** Triangles drawn, and the textures' count and GPU memory. */
function measure(room: THREE.Object3D): { triangles: number; textures: number; textureMB: number } {
	let triangles = 0;
	const textures = new Set<THREE.Texture>();
	room.traverse((object) => {
		if (!(object instanceof THREE.Mesh) || !object.visible) return;
		const geometry = object.geometry as THREE.BufferGeometry;
		triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
		for (const material of materials(object)) {
			for (const slot of TEXTURE_SLOTS) {
				const texture = (material as THREE.MeshStandardMaterial)[slot];
				if (texture) textures.add(texture);
			}
		}
	});
	let bytes = 0;
	for (const texture of textures) bytes += textureBytes(texture);
	return { triangles: Math.round(triangles), textures: textures.size, textureMB: bytes / 1e6 };
}

/** RGBA8 with a full mip chain: a third more than the top level. */
function textureBytes(texture: THREE.Texture): number {
	const image = texture.image as { width?: number; height?: number } | null;
	return ((image?.width ?? 0) * (image?.height ?? 0) * 4 * 4) / 3;
}

/** The lightmap's size, and how many of its texels fall on each metre of the room's surface. */
function lightmapStats(room: THREE.Object3D, lightmap: THREE.Texture): RoomStats['lightmap'] {
	const image = lightmap.image as { width: number; height: number };
	let area = 0;
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();
	room.traverse((object) => {
		if (!(object instanceof THREE.Mesh) || !object.visible) return;
		const geometry = object.geometry as THREE.BufferGeometry;
		if (!geometry.getAttribute('uv1')) return;
		const positions = geometry.getAttribute('position');
		const index = geometry.index;
		const count = index ? index.count : positions.count;
		for (let i = 0; i < count; i += 3) {
			const at = (k: number) => (index ? index.getX(i + k) : i + k);
			a.fromBufferAttribute(positions, at(0)).applyMatrix4(object.matrixWorld);
			b.fromBufferAttribute(positions, at(1)).applyMatrix4(object.matrixWorld);
			c.fromBufferAttribute(positions, at(2)).applyMatrix4(object.matrixWorld);
			area += b.sub(a).cross(c.sub(a)).length() / 2;
		}
	});
	return {
		width: image.width,
		height: image.height,
		texelsPerMetre: area > 0 ? Math.sqrt((image.width * image.height) / area) : 0
	};
}

function disposeModel(model: THREE.Object3D): void {
	model.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		object.geometry.dispose();
		for (const material of materials(object)) {
			for (const slot of TEXTURE_SLOTS) (material as THREE.MeshStandardMaterial)[slot]?.dispose();
			material.dispose();
		}
	});
}
