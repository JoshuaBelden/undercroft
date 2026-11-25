import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { MARKER_COLOURS, OVERLAY_COLOURS, ROOM_VIEWER } from '#lib/content/map/roomViewer.ts';
import type { RoomManifest, RoomMarker } from '#lib/shared/map/room.ts';
import type { ColliderBox } from '#lib/shared/map/types.ts';

/**
 * What the room viewer draws over a room: its collision boxes, its volumes and its markers, each
 * a group to show or hide. See docs/dev/room-viewer.md.
 */
export interface RoomOverlays {
	colliders: THREE.Group;
	volumes: THREE.Group;
	markers: THREE.Group;
	/** Each marker's name, beside it (drawn by the viewer's CSS2D layer). */
	labels: THREE.Group;
	dispose(): void;
}

/** Markers that face a way: a line shows where. */
const FACING = new Set(['spawn', 'crate', 'lootable', 'door', 'gate', 'spot', 'anchor']);

export function buildOverlays(manifest: RoomManifest): RoomOverlays {
	const disposables: { dispose(): void }[] = [];
	const own = <T extends { dispose(): void }>(thing: T): T => {
		disposables.push(thing);
		return thing;
	};
	const cube = own(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)));
	const solid = own(new THREE.BoxGeometry(1, 1, 1));
	const gem = own(new THREE.OctahedronGeometry(ROOM_VIEWER.marker.size));

	const outline = (box: ColliderBox, material: THREE.Material): THREE.Object3D => {
		const lines = new THREE.LineSegments(cube, material);
		place(lines, box);
		return lines;
	};

	const colliders = new THREE.Group();
	colliders.name = 'room-colliders';
	const colliderLine = own(
		new THREE.LineBasicMaterial({ color: OVERLAY_COLOURS.collider, depthTest: false })
	);
	for (const box of manifest.colliders) colliders.add(outline(box, colliderLine));

	const volumes = new THREE.Group();
	volumes.name = 'room-volumes';
	const volumeLine = own(new THREE.LineBasicMaterial({ color: OVERLAY_COLOURS.volume }));
	const volumeFill = own(
		new THREE.MeshBasicMaterial({
			color: OVERLAY_COLOURS.volume,
			transparent: true,
			opacity: 0.15,
			depthWrite: false,
			side: THREE.DoubleSide
		})
	);
	for (const box of manifest.volumes) {
		volumes.add(outline(box, volumeLine));
		const fill = new THREE.Mesh(solid, volumeFill);
		place(fill, box);
		volumes.add(fill);
	}

	const markers = new THREE.Group();
	markers.name = 'room-markers';
	const labels = new THREE.Group();
	labels.name = 'room-labels';
	const materials = new Map<number, THREE.MeshBasicMaterial>();
	const lines = new Map<number, THREE.LineBasicMaterial>();
	for (const marker of manifest.markers) {
		const colour = MARKER_COLOURS[marker.kind];
		let material = materials.get(colour);
		if (!material) {
			material = own(new THREE.MeshBasicMaterial({ color: colour, depthTest: false }));
			materials.set(colour, material);
		}
		let line = lines.get(colour);
		if (!line) {
			line = own(new THREE.LineBasicMaterial({ color: colour, depthTest: false }));
			lines.set(colour, line);
		}
		const gemMesh = new THREE.Mesh(gem, material);
		gemMesh.position.set(...marker.position);
		gemMesh.renderOrder = 2;
		markers.add(gemMesh);
		const path = markerPath(marker);
		if (path) {
			const geometry = own(new THREE.BufferGeometry().setFromPoints(path));
			const drawn = new THREE.Line(geometry, line);
			drawn.renderOrder = 2;
			markers.add(drawn);
		}
		labels.add(label(marker, colour));
	}

	return {
		colliders,
		volumes,
		markers,
		labels,
		dispose() {
			for (const thing of disposables) thing.dispose();
			for (const object of labels.children) (object as CSS2DObject).element.remove();
		}
	};
}

/** A box's place, size and turn. */
function place(object: THREE.Object3D, box: ColliderBox): void {
	object.position.set(...box.center);
	object.quaternion.set(...box.rotation);
	object.scale.set(box.halfExtents[0] * 2, box.halfExtents[1] * 2, box.halfExtents[2] * 2);
}

/** A rope hangs down its length; a marker that faces a way points there. */
function markerPath(marker: RoomMarker): THREE.Vector3[] | null {
	const [x, y, z] = marker.position;
	if (marker.kind === 'rope' && marker.extras.length > 0) {
		return [new THREE.Vector3(x, y, z), new THREE.Vector3(x, y - marker.extras.length, z)];
	}
	if (!FACING.has(marker.kind)) return null;
	const reach = ROOM_VIEWER.marker.arrow;
	const lift = ROOM_VIEWER.marker.size;
	return [
		new THREE.Vector3(x, y + lift, z),
		new THREE.Vector3(x - Math.sin(marker.yaw) * reach, y + lift, z - Math.cos(marker.yaw) * reach)
	];
}

function label(marker: RoomMarker, colour: number): CSS2DObject {
	const element = document.createElement('div');
	element.className = 'room-marker-label';
	element.textContent = marker.label;
	element.style.color = `#${colour.toString(16).padStart(6, '0')}`;
	const object = new CSS2DObject(element);
	object.position.set(
		marker.position[0],
		marker.position[1] + ROOM_VIEWER.marker.size * 2.5,
		marker.position[2]
	);
	return object;
}
