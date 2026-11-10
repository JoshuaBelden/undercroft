/**
 * Generates static/assets/dev/dev-cube.glb, a placeholder used to verify the asset
 * pipeline before real Blender exports exist. Run with `pnpm asset:dev`.
 */
import { mkdirSync } from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';

const doc = new Document();
const buffer = doc.createBuffer();

// 24 vertices (4 per face) so each face gets a flat normal.
const faces: { normal: [number, number, number]; corners: [number, number, number][] }[] = [
	{
		normal: [1, 0, 0],
		corners: [
			[1, -1, 1],
			[1, -1, -1],
			[1, 1, -1],
			[1, 1, 1]
		]
	},
	{
		normal: [-1, 0, 0],
		corners: [
			[-1, -1, -1],
			[-1, -1, 1],
			[-1, 1, 1],
			[-1, 1, -1]
		]
	},
	{
		normal: [0, 1, 0],
		corners: [
			[-1, 1, 1],
			[1, 1, 1],
			[1, 1, -1],
			[-1, 1, -1]
		]
	},
	{
		normal: [0, -1, 0],
		corners: [
			[-1, -1, -1],
			[1, -1, -1],
			[1, -1, 1],
			[-1, -1, 1]
		]
	},
	{
		normal: [0, 0, 1],
		corners: [
			[-1, -1, 1],
			[1, -1, 1],
			[1, 1, 1],
			[-1, 1, 1]
		]
	},
	{
		normal: [0, 0, -1],
		corners: [
			[1, -1, -1],
			[-1, -1, -1],
			[-1, 1, -1],
			[1, 1, -1]
		]
	}
];

const positions: number[] = [];
const normals: number[] = [];
const indices: number[] = [];
faces.forEach((face, i) => {
	for (const corner of face.corners) {
		positions.push(...corner.map((v) => v * 0.5));
		normals.push(...face.normal);
	}
	const base = i * 4;
	indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
});

const material = doc
	.createMaterial('limestone')
	.setBaseColorFactor([0.62, 0.56, 0.48, 1])
	.setRoughnessFactor(0.9);

const primitive = doc
	.createPrimitive()
	.setMaterial(material)
	.setAttribute(
		'POSITION',
		doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer)
	)
	.setAttribute(
		'NORMAL',
		doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer)
	)
	.setIndices(
		doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer)
	);

const mesh = doc.createMesh('dev-cube').addPrimitive(primitive);
const node = doc.createNode('dev-cube').setMesh(mesh);
doc.createScene('scene').addChild(node);

mkdirSync('static/assets/dev', { recursive: true });
await new NodeIO().write('static/assets/dev/dev-cube.glb', doc);
console.log('Wrote static/assets/dev/dev-cube.glb');
