import * as THREE from 'three';
import { CELL, EDGE_DIR, LEVEL_HEIGHT } from '#lib/shared/map/grid.ts';
import type { MapDebugGrid as GridData } from '#lib/shared/map/debug.ts';

/** Colours of the debug grid (dev only). */
const COLORS = { cell: 0x9a9a9a, connected: 0x3ddc6a, blocked: 0xe5484d, room: 0xf5d33a };
/** How see-through the yellow over room cells is. */
const ROOM_OPACITY = 0.28;
/** Lift off the floor, so the lines don't flicker against it. */
const LIFT = 0.05;
/** An entrance is drawn as a panel standing in the opening. */
const PANEL = { width: CELL * 0.7, height: 2.4, opacity: 0.45 };

/**
 * The map debug view's grid (see docs/dev/map-generation.md#debug-grid): an outline round every
 * occupied cell, rooms filled in see-through yellow, and a panel in every entrance, green when it is connected and red when it is
 * blocked. Edges with no entrance only have the cell outline. Drawn through walls, on top.
 */
export class MapDebugGrid {
	readonly root = new THREE.Group();
	private readonly materials = {
		cell: new THREE.LineBasicMaterial({
			color: COLORS.cell,
			depthTest: false,
			transparent: true,
			opacity: 0.6
		}),
		room: new THREE.MeshBasicMaterial({
			color: COLORS.room,
			transparent: true,
			opacity: ROOM_OPACITY,
			side: THREE.DoubleSide,
			depthTest: false,
			depthWrite: false
		}),
		connected: panelMaterial(COLORS.connected),
		blocked: panelMaterial(COLORS.blocked)
	};
	private readonly panel = new THREE.PlaneGeometry(PANEL.width, PANEL.height);

	constructor() {
		this.root.visible = false;
		this.root.renderOrder = 999;
	}

	build(grid: GridData): void {
		this.clear();
		// Each edge once, even where two cells share it.
		const seen = new Set<string>();
		const points: number[] = [];
		const half = CELL / 2;
		for (const [x, z, level] of grid.cells) {
			const cx = x * CELL;
			const cz = z * CELL;
			const y = level * LEVEL_HEIGHT + LIFT;
			const corners: [number, number][] = [
				[cx - half, cz - half],
				[cx + half, cz - half],
				[cx + half, cz + half],
				[cx - half, cz + half]
			];
			for (let i = 0; i < 4; i++) {
				const [ax, az] = corners[i];
				const [bx, bz] = corners[(i + 1) % 4];
				const key = `${ax + bx},${az + bz},${level}`;
				if (seen.has(key)) continue;
				seen.add(key);
				points.push(ax, y, az, bx, y, bz);
			}
		}
		const lines = new THREE.BufferGeometry();
		lines.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
		const outline = new THREE.LineSegments(lines, this.materials.cell);
		outline.renderOrder = 999;
		this.root.add(outline);

		// Rooms: one see-through yellow square per cell, all in one mesh, under the outlines.
		const fill: number[] = [];
		for (const [x, z, level] of grid.roomCells) {
			const cx = x * CELL;
			const cz = z * CELL;
			const y = level * LEVEL_HEIGHT + LIFT / 2;
			const [x0, x1, z0, z1] = [cx - half, cx + half, cz - half, cz + half];
			fill.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
		}
		const rooms = new THREE.BufferGeometry();
		rooms.setAttribute('position', new THREE.Float32BufferAttribute(fill, 3));
		const roomMesh = new THREE.Mesh(rooms, this.materials.room);
		roomMesh.renderOrder = 998;
		this.root.add(roomMesh);

		for (const entrance of grid.entrances) {
			const [dx, dz] = EDGE_DIR[entrance.edge];
			const mesh = new THREE.Mesh(this.panel, this.materials[entrance.state]);
			mesh.position.set(
				(entrance.cell[0] + dx / 2) * CELL,
				entrance.level * LEVEL_HEIGHT + PANEL.height / 2 + LIFT,
				(entrance.cell[1] + dz / 2) * CELL
			);
			// The plane faces +Z; turn it to stand across an east or west opening.
			if (dx !== 0) mesh.rotation.y = Math.PI / 2;
			mesh.renderOrder = 1000;
			this.root.add(mesh);
		}
	}

	setVisible(visible: boolean): void {
		this.root.visible = visible;
	}

	private clear(): void {
		for (const child of [...this.root.children]) {
			// The entrance panels share one geometry, disposed with the grid.
			if (child instanceof THREE.LineSegments) child.geometry.dispose();
			else if (child instanceof THREE.Mesh && child.geometry !== this.panel)
				child.geometry.dispose();
			this.root.remove(child);
		}
	}

	dispose(): void {
		this.clear();
		this.panel.dispose();
		for (const material of Object.values(this.materials)) material.dispose();
	}
}

function panelMaterial(color: number): THREE.MeshBasicMaterial {
	return new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity: PANEL.opacity,
		side: THREE.DoubleSide,
		depthTest: false,
		depthWrite: false
	});
}
