import type { AnimationChannel, Document, Node } from '@gltf-transform/core';

/**
 * Clips borrowed from another rigged model with the same bone names but its own rest pose and
 * size (two Mixamo-style rigs), retargeted onto the model: the Gloaming's manifestation walks,
 * charges, idles and casts with the witch's clips. See docs/dev/asset-pipeline.md#borrowed-clips.
 *
 * Each frame, every bone of the donor turns away from its rest pose by some rotation in world
 * space; the same bone of the model is turned by that much from its own rest, and its local
 * rotation worked back from its parent. Bones the donor lacks (extra fingers) stay at rest
 * relative to their parent. The hips' movement (a bob, in place) is scaled by the two hips'
 * heights. Rest poses can differ a fair way (an A-pose and a T-pose) and the motion still reads;
 * the model keeps its own rest shape under it.
 */

type Quat = [number, number, number, number];
type Vec3 = [number, number, number];

/** Which clips a model borrows: from which file, and under what name each goes in. */
export interface ClipDonor {
	/** The donor file, relative to art/export. */
	from: string;
	/** Donor clip name -> the name it takes in the model. */
	clips: Record<string, string>;
}

/** Models (file name without .glb) that borrow clips, and what from. */
export const CLIP_DONORS: Record<string, ClipDonor> = {
	// The manifestation's own walk is a mincing strut: it walks, runs at you, idles and casts with
	// the witch's instead (its own run, swing, flinch and fall stay).
	gloaming_boss: {
		from: 'creatures/witch.glb',
		clips: {
			Walking: 'Borrowed_Walking',
			Standard_Forward_Charge_inplace: 'Borrowed_Charge',
			Idle_9: 'Borrowed_Idle',
			mage_soell_cast_3: 'Borrowed_Cast'
		}
	}
};

/** Retarget the donor's clips into `doc`. Returns the names they went in under. */
export function retargetClips(
	doc: Document,
	donor: Document,
	clips: Record<string, string>
): string[] {
	const root = doc.getRoot();
	const buffer = root.listBuffers()[0] ?? doc.createBuffer();
	const target = rig(doc);
	const source = rig(donor);
	const taken = new Set(root.listAnimations().map((a) => a.getName()));
	const out: string[] = [];
	for (const clip of donor.getRoot().listAnimations()) {
		const name = clips[clip.getName()];
		if (!name) continue;
		if (taken.has(name)) throw new Error(`clip ${name} is already in the model`);
		const channels = new Map<string, AnimationChannel>();
		for (const ch of clip.listChannels()) {
			const node = ch.getTargetNode();
			const path = ch.getTargetPath();
			if (node && (path === 'rotation' || path === 'translation')) {
				channels.set(`${node.getName()}/${path}`, ch);
			}
		}
		const times = keyTimes([...channels.values()]);
		const rotations = new Map<string, number[]>();
		const hips: number[] = [];
		const hipsName = target.hips?.getName();
		for (const t of times) {
			// The donor's pose: every bone's world rotation at t.
			const sourceWorld = worldRotations(source, (n) => {
				const ch = channels.get(`${n.getName()}/rotation`);
				return ch ? (sample(ch, t) as Quat) : (n.getRotation() as Quat);
			});
			// The model's, built down from the root: a matched bone turns as the donor's did.
			const targetWorld = new Map<Node, Quat>();
			for (const node of target.order) {
				const parent = target.parent.get(node);
				const parentWorld = parent
					? (targetWorld.get(parent) ?? target.restWorld.get(parent)!)
					: IDENTITY;
				const match = source.byName.get(node.getName());
				let world: Quat;
				if (match && target.bones.has(node)) {
					const delta = mul(sourceWorld.get(match)!, inv(source.restWorld.get(match)!));
					world = mul(delta, target.restWorld.get(node)!);
				} else {
					world = mul(parentWorld, node.getRotation() as Quat);
				}
				targetWorld.set(node, world);
				if (target.bones.has(node) && match) {
					const local = normalize(mul(inv(parentWorld), world));
					const list = rotations.get(node.getName()) ?? [];
					list.push(...local);
					rotations.set(node.getName(), list);
				}
			}
			// The hips: the donor's movement off its rest, into the model's frame, scaled.
			if (target.hips && source.hips && hipsName) {
				const ch = channels.get(`${source.hips.getName()}/translation`);
				const rest = source.hips.getTranslation() as Vec3;
				const now = ch ? (sample(ch, t) as Vec3) : rest;
				const d: Vec3 = [now[0] - rest[0], now[1] - rest[1], now[2] - rest[2]];
				const sp = source.parent.get(source.hips);
				const tp = target.parent.get(target.hips);
				const toWorld = sp ? source.restWorld.get(sp)! : IDENTITY;
				const fromWorld = tp ? inv(target.restWorld.get(tp)!) : IDENTITY;
				const ratio = len(target.hips.getTranslation() as Vec3) / Math.max(1e-6, len(rest));
				const moved = rotate(mul(fromWorld, toWorld), d);
				const base = target.hips.getTranslation();
				hips.push(
					base[0] + moved[0] * ratio,
					base[1] + moved[1] * ratio,
					base[2] + moved[2] * ratio
				);
			}
		}
		const anim = doc.createAnimation(name);
		const input = doc
			.createAccessor()
			.setType('SCALAR')
			.setArray(new Float32Array(times))
			.setBuffer(buffer);
		const add = (node: Node, path: 'rotation' | 'translation', values: number[]) => {
			const output = doc
				.createAccessor()
				.setType(path === 'rotation' ? 'VEC4' : 'VEC3')
				.setArray(new Float32Array(values))
				.setBuffer(buffer);
			const sampler = doc
				.createAnimationSampler()
				.setInput(input)
				.setOutput(output)
				.setInterpolation('LINEAR');
			anim
				.addSampler(sampler)
				.addChannel(
					doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler)
				);
		};
		for (const node of target.order) {
			const values = rotations.get(node.getName());
			if (values) add(node, 'rotation', values);
		}
		if (target.hips && hips.length) add(target.hips, 'translation', hips);
		out.push(name);
	}
	const missing = Object.values(clips).filter((n) => !out.includes(n));
	if (missing.length) throw new Error(`the donor has no clip for ${missing.join(', ')}`);
	return out;
}

interface Rig {
	/** Every node under the scene, parents before children. */
	order: Node[];
	parent: Map<Node, Node>;
	/** The skin's joints. */
	bones: Set<Node>;
	byName: Map<string, Node>;
	/** World rotation of every node at rest. */
	restWorld: Map<Node, Quat>;
	hips: Node | null;
}

function rig(doc: Document): Rig {
	const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
	const order: Node[] = [];
	const parent = new Map<Node, Node>();
	const walk = (node: Node, up: Node | null) => {
		order.push(node);
		if (up) parent.set(node, up);
		for (const child of node.listChildren()) walk(child, node);
	};
	for (const node of scene?.listChildren() ?? []) walk(node, null);
	const skin = doc.getRoot().listSkins()[0];
	if (!skin) throw new Error('no skin to retarget onto');
	const bones = new Set(skin.listJoints());
	const byName = new Map([...bones].map((b) => [b.getName(), b]));
	const r: Rig = { order, parent, bones, byName, restWorld: new Map(), hips: null };
	r.restWorld = worldRotations(r, (n) => n.getRotation() as Quat);
	r.hips = [...bones].find((b) => b.getName().endsWith('Hips')) ?? null;
	return r;
}

function worldRotations(r: Rig, local: (n: Node) => Quat): Map<Node, Quat> {
	const world = new Map<Node, Quat>();
	for (const node of r.order) {
		const up = r.parent.get(node);
		world.set(node, mul(up ? world.get(up)! : IDENTITY, local(node)));
	}
	return world;
}

/** Every key time of these channels, in order. */
function keyTimes(channels: AnimationChannel[]): number[] {
	const set = new Set<number>();
	for (const ch of channels) {
		for (const t of ch.getSampler()?.getInput()?.getArray() ?? [])
			set.add(Math.round(t * 1e4) / 1e4);
	}
	return [...set].sort((a, b) => a - b);
}

/** A channel's value at time t (linear or step; rotations slerped). */
function sample(ch: AnimationChannel, t: number): number[] {
	const sampler = ch.getSampler()!;
	const times = sampler.getInput()!.getArray()!;
	const values = sampler.getOutput()!.getArray()!;
	const size = ch.getTargetPath() === 'rotation' ? 4 : 3;
	if (sampler.getInterpolation() === 'CUBICSPLINE')
		throw new Error('cubic spline clips are not supported');
	const at = (i: number) => Array.from(values.slice(i * size, i * size + size));
	if (t <= times[0]) return at(0);
	const last = times.length - 1;
	if (t >= times[last]) return at(last);
	let i = 0;
	while (i < last && times[i + 1] < t) i++;
	if (sampler.getInterpolation() === 'STEP') return at(i);
	const f = (t - times[i]) / (times[i + 1] - times[i]);
	const a = at(i);
	const b = at(i + 1);
	return size === 4 ? slerp(a as Quat, b as Quat, f) : a.map((v, k) => v + (b[k] - v) * f);
}

const IDENTITY: Quat = [0, 0, 0, 1];

function mul(a: Quat, b: Quat): Quat {
	const [ax, ay, az, aw] = a;
	const [bx, by, bz, bw] = b;
	return [
		aw * bx + ax * bw + ay * bz - az * by,
		aw * by - ax * bz + ay * bw + az * bx,
		aw * bz + ax * by - ay * bx + az * bw,
		aw * bw - ax * bx - ay * by - az * bz
	];
}

function inv(q: Quat): Quat {
	return [-q[0], -q[1], -q[2], q[3]];
}

function normalize(q: Quat): Quat {
	const l = Math.hypot(...q) || 1;
	return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

function slerp(a: Quat, b: Quat, f: number): Quat {
	let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
	const s = dot < 0 ? -1 : 1;
	dot *= s;
	if (dot > 0.9995) {
		return normalize([0, 1, 2, 3].map((k) => a[k] + (b[k] * s - a[k]) * f) as Quat);
	}
	const th = Math.acos(dot);
	const wa = Math.sin((1 - f) * th) / Math.sin(th);
	const wb = (Math.sin(f * th) / Math.sin(th)) * s;
	return [0, 1, 2, 3].map((k) => a[k] * wa + b[k] * wb) as Quat;
}

function rotate(q: Quat, v: Vec3): Vec3 {
	const r = mul(mul(q, [v[0], v[1], v[2], 0]), inv(q));
	return [r[0], r[1], r[2]];
}

function len(v: Vec3): number {
	return Math.hypot(v[0], v[1], v[2]);
}
