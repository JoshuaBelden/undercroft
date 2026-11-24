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

/**
 * Bones lined up with the donor's before its turns are copied: bone -> the child it points at
 * and, optionally, two bones across it that fix its twist (a palm's width). Each named by its end
 * (`LeftArm` matches `mixamorig:LeftArm`).
 */
export type BoneAlignment = Record<string, { to: string; across?: [string, string] }>;

/**
 * The explorer's limbs, for a body whose rest pose differs from the clips' rig (the explorer's
 * arms and hands rest 15-25 degrees from MPFB's). The spine is left out: the clips' rig has its
 * spine joints in a zigzag no body should copy.
 */
export const LIMB_ALIGNMENT: BoneAlignment = Object.fromEntries(
	(['Left', 'Right'] as const).flatMap((s) => [
		[`${s}Shoulder`, { to: `${s}Arm` }],
		[`${s}Arm`, { to: `${s}ForeArm` }],
		[`${s}ForeArm`, { to: `${s}Hand` }],
		[`${s}Hand`, { to: `${s}HandMiddle1`, across: [`${s}HandIndex1`, `${s}HandPinky1`] }],
		[`${s}UpLeg`, { to: `${s}Leg` }],
		[`${s}Leg`, { to: `${s}Foot` }],
		[`${s}Foot`, { to: `${s}ToeBase` }],
		...['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].flatMap((f) => [
			[`${s}Hand${f}1`, { to: `${s}Hand${f}2` }],
			[`${s}Hand${f}2`, { to: `${s}Hand${f}3` }]
		])
	])
);

export interface RetargetOptions {
	/** Bones lined up with the donor's rest first, so a limb points where the donor's does. */
	align?: BoneAlignment;
	/**
	 * Only the bones a donor clip moves get a channel; the rest follow whatever else is playing.
	 * For clips played over others on part of the body (the explorer's arm poses): written whole,
	 * they would hold the legs still too.
	 */
	keyedOnly?: boolean;
}

/** Retarget the donor's clips into `doc`. Returns the names they went in under. */
export function retargetClips(
	doc: Document,
	donor: Document,
	clips: Record<string, string>,
	{ align = {}, keyedOnly = false }: RetargetOptions = {}
): string[] {
	const root = doc.getRoot();
	const buffer = root.listBuffers()[0] ?? doc.createBuffer();
	const target = rig(doc);
	const source = rig(donor);
	const lineUp = alignments(target, source, align);
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
					const rest = target.restWorld.get(node)!;
					const fix = lineUp.get(node);
					world = mul(delta, fix ? mul(fix, rest) : rest);
				} else {
					world = mul(parentWorld, node.getRotation() as Quat);
				}
				targetWorld.set(node, world);
				if (
					target.bones.has(node) &&
					match &&
					(!keyedOnly || channels.has(`${match.getName()}/rotation`))
				) {
					const local = normalize(mul(inv(parentWorld), world));
					const list = rotations.get(node.getName()) ?? [];
					list.push(...local);
					rotations.set(node.getName(), list);
				}
			}
			// The hips: the donor's movement off its rest, into the model's frame, scaled.
			const hipsKeyed = !!source.hips && channels.has(`${source.hips.getName()}/translation`);
			if (target.hips && source.hips && hipsName && (!keyedOnly || hipsKeyed)) {
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

/**
 * For each named bone (by its end, `RightHand`), the turn from the model's bone into the donor's
 * same bone's frame, once the clips are retargeted with `align`: something hung from the donor's
 * bone (a held item, at its grip) goes under the model's bone turned by this, and sits as it did.
 * Keyed by the bone's name as three.js gives it (no ':').
 */
export function boneFrames(
	doc: Document,
	donor: Document,
	align: BoneAlignment,
	ends: string[]
): Record<string, [number, number, number, number]> {
	const target = rig(doc);
	const source = rig(donor);
	const lineUp = alignments(target, source, align);
	const out: Record<string, Quat> = {};
	for (const end of ends) {
		const t = [...target.byName.values()].find((b) => b.getName().endsWith(end));
		const s = [...source.byName.values()].find((b) => b.getName().endsWith(end));
		if (!t || !s) continue;
		// The model's bone moves as `fix * rest` does in the donor's place, so the donor's frame is
		// inv(fix * targetRest) * sourceRest from it.
		const fix = lineUp.get(t) ?? IDENTITY;
		const frame = normalize(mul(inv(mul(fix, target.restWorld.get(t)!)), source.restWorld.get(s)!));
		out[
			t
				.getName()
				.replace(/[[\].:/]/g, '')
				.replace(/\s/g, '_')
		] = frame;
	}
	return out;
}

/**
 * Per aligned bone of the model, the world turn that brings it from its rest onto the donor's:
 * its direction (to its child) onto the donor's, then, about that, the bones across it.
 */
function alignments(target: Rig, source: Rig, align: BoneAlignment): Map<Node, Quat> {
	const out = new Map<Node, Quat>();
	const find = (r: Rig, end: string) =>
		[...r.byName.values()].find((b) => b.getName().endsWith(end));
	for (const [end, spec] of Object.entries(align)) {
		const t = [end, spec.to, ...(spec.across ?? [])].map((e) => find(target, e));
		const s = [end, spec.to, ...(spec.across ?? [])].map((e) => find(source, e));
		if (t.some((b) => !b) || s.some((b) => !b)) continue;
		const dir = (r: Rig, a: Node, b: Node) =>
			normalizeV(sub(r.restPosition.get(b)!, r.restPosition.get(a)!));
		const td = dir(target, t[0]!, t[1]!);
		const sd = dir(source, s[0]!, s[1]!);
		let q = fromTo(td, sd);
		if (spec.across) {
			// The twist: the across line, once turned, onto the donor's, both flattened square to the bone.
			const flat = (v: Vec3) => normalizeV(sub(v, scale(sd, dot(v, sd))));
			const ta = flat(rotate(q, dir(target, t[2]!, t[3]!)));
			const sa = flat(dir(source, s[2]!, s[3]!));
			q = mul(fromTo(ta, sa), q);
		}
		out.set(t[0]!, q);
	}
	return out;
}

interface Rig {
	/** Every node under the scene, parents before children. */
	order: Node[];
	parent: Map<Node, Node>;
	/** The skin's joints. */
	bones: Set<Node>;
	byName: Map<string, Node>;
	/** World rotation and position of every node at rest. */
	restWorld: Map<Node, Quat>;
	restPosition: Map<Node, Vec3>;
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
	const r: Rig = {
		order,
		parent,
		bones,
		byName,
		restWorld: new Map(),
		restPosition: new Map(),
		hips: null
	};
	r.restWorld = worldRotations(r, (n) => n.getRotation() as Quat);
	for (const node of order) {
		const up = parent.get(node);
		const local = node.getTranslation() as Vec3;
		r.restPosition.set(
			node,
			up ? add(r.restPosition.get(up)!, rotate(r.restWorld.get(up)!, local)) : local
		);
	}
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

function add(a: Vec3, b: Vec3): Vec3 {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(v: Vec3, k: number): Vec3 {
	return [v[0] * k, v[1] * k, v[2] * k];
}

function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalizeV(v: Vec3): Vec3 {
	const l = len(v) || 1;
	return [v[0] / l, v[1] / l, v[2] / l];
}

/** The shortest turn taking direction `a` onto `b` (both unit length). */
function fromTo(a: Vec3, b: Vec3): Quat {
	const d = dot(a, b);
	if (d < -0.999999) {
		// Opposite: half a turn about any axis square to a.
		const axis = normalizeV(Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [a[2], 0, -a[0]]);
		return [axis[0], axis[1], axis[2], 0];
	}
	const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
	return normalize([c[0], c[1], c[2], 1 + d]);
}
