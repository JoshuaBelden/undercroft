"""Undercroft critters: simple procedural clips for the rat, spider and moth.

The three models came rigged but with no animation. This script keys a small set of clips for
each one (idle, walk, run, attack, hurt, death) as NLA tracks in its .blend, and exports them on
the bare skeleton to art/export/creatures/<name>-clips.glb; `pnpm asset:build` merges them into
<name>.glb by bone name (scripts/clips.ts), the same way as the explorer's hand-keyed clips.

Run inside Blender with art/blender/<name>.blend open (Text Editor or the Blender MCP):

    import sys, importlib
    sys.path.insert(0, r"D:/Code/undercroft/scripts/blender")
    import critters; importlib.reload(critters)
    critters.build_all()      # (re)make every clip for the open file's critter
    critters.export()         # write art/export/creatures/<name>-clips.glb, then `pnpm asset:build`

How a clip is made: each frame, a function of time (seconds) returns turns for some bones, each
about an axis in the model's own rest space (it faces -Y, its right is -X, up is +Z). A turn is
taken relative to the bone's rest, so a child turned on top of its parent adds to it. `swing`
and `lift` work out the axis from the leg itself: forward and back about the vertical, and the
tip up or down about the axis across it. Loops are keyed on every frame over whole cycles, so
the last frame meets the first.
"""

import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXPORT_DIR = os.path.join(ROOT, "art", "export", "creatures")
FPS = 24
TAU = math.pi * 2
UP = Vector((0, 0, 1))
SIDE = Vector((1, 0, 0))
AHEAD = Vector((0, -1, 0))


def wave(t, period, phase=0.0):
    """sin over a cycle of `period` seconds, offset by `phase` (fraction of a cycle)."""
    return math.sin(TAU * (t / period + phase))


def ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


# ---- the rigs --------------------------------------------------------------------------------
#
# Each rig: the armature's name, its bones by job, and its clips (name -> (frames, pose(t))).
# A pose returns a list of (bone, axis, angle) turns, plus ("loc", bone, vector) moves in rest
# space; several turns on one bone are applied in order.


class Pose:
    """Collects one frame's turns."""

    def __init__(self, rig):
        self.rig = rig
        self.turns = []
        self.moves = []

    def turn(self, bone, axis, angle):
        self.turns.append((bone, Vector(axis), angle))

    def swing(self, bone, angle):
        """The bone's far end forward (+) or back (-) about the vertical."""
        d = self.direction(bone)
        # Turning about +Z carries a bone on the right (-X) toward -Y (forward) for +angle...
        side = -1 if d.x < 0 else 1
        self.turn(bone, UP, -angle * side)

    def lift(self, bone, angle):
        """The bone's far end up (+) or down (-), about the horizontal axis across it."""
        d = self.direction(bone)
        d.z = 0
        if d.length < 1e-4:
            d = Vector(AHEAD)
        d.normalize()
        self.turn(bone, d.cross(UP), angle)

    def pitch(self, bone, angle):
        """Nose up (+) about the side axis."""
        self.turn(bone, SIDE, -angle)

    def roll(self, bone, angle):
        self.turn(bone, AHEAD, angle)

    def yaw(self, bone, angle):
        self.turn(bone, UP, angle)

    def move(self, bone, offset):
        self.moves.append((bone, Vector(offset)))

    def direction(self, bone):
        b = self.rig.data.bones[bone]
        return (b.tail_local - b.head_local).normalized()


def local_turn(rig, bone, axis, angle):
    """A turn about an axis in rest (armature) space, as the bone's own pose rotation."""
    rest = rig.data.bones[bone].matrix_local.to_3x3()
    return Quaternion(rest.inverted() @ axis.normalized(), angle)


def local_move(rig, bone, offset):
    rest = rig.data.bones[bone].matrix_local.to_3x3()
    return rest.inverted() @ offset


# ---- rat -------------------------------------------------------------------------------------

RAT = dict(
    armature="purebind_armature",
    spine=["joint_02", "joint_05", "joint_04", "joint_03"],
    neck="joint_24",
    head="joint_23",
    jaw="joint_42",
    ears=["joint_44", "joint_46"],
    tail=["joint_22", "joint_21", "joint_20", "joint_19", "joint_18", "joint_17"],
    # (hip/shoulder, knee, ankle), front pair then hind pair; left is +X.
    legs={
        "front_l": ["joint_30", "joint_29", "joint_28"],
        "front_r": ["joint_36", "joint_35", "joint_34"],
        "hind_l": ["joint_10", "joint_09", "joint_08"],
        "hind_r": ["joint_15", "joint_14", "joint_13"],
    },
    root="joint_01",
)


def rat_tail(p, t, amount=0.25, period=1.6):
    for i, bone in enumerate(RAT["tail"]):
        p.yaw(bone, amount * wave(t, period, -i * 0.12))


def rat_gait(p, t, period, stride, gallop):
    """Trot (diagonal pairs) or bound (front pair, then hind pair)."""
    phases = (
        {"front_l": 0.0, "front_r": 0.0, "hind_l": 0.5, "hind_r": 0.5}
        if gallop
        else {"front_l": 0.0, "hind_r": 0.0, "front_r": 0.5, "hind_l": 0.5}
    )
    for leg, phase in phases.items():
        hip, knee, ankle = RAT["legs"][leg]
        s = wave(t, period, phase)
        # Forward while lifted: the knee folds on the way forward.
        lift = max(0.0, math.cos(TAU * (t / period + phase)))
        p.pitch(hip, -stride * s)
        p.pitch(knee, (0.6 if leg.startswith("front") else -0.6) * lift * stride * 1.6)
        p.pitch(ankle, 0.3 * lift * stride)
    bob = abs(wave(t, period, 0.25))
    for bone in RAT["spine"]:
        p.pitch(bone, (0.05 if gallop else 0.02) * (bob - 0.5))
    p.pitch(RAT["head"], -0.04 * bob)
    rat_tail(p, t, 0.15, period * 2)


def rat_idle(p, t):
    # Breathe, sniff (quick nose twitches every so often), ears flick, tail sways.
    for bone in RAT["spine"][1:]:
        p.pitch(bone, 0.015 * wave(t, 1.0))
    sniff = 0.06 * wave(t, 0.25) * max(0.0, wave(t, 2.0))
    p.pitch(RAT["head"], 0.08 * wave(t, 2.0, 0.1) + sniff)
    p.yaw(RAT["neck"], 0.18 * wave(t, 4.0))
    for i, ear in enumerate(RAT["ears"]):
        p.lift(ear, 0.15 * max(0.0, wave(t, 1.0, i * 0.5)) ** 4)
    rat_tail(p, t)


def rat_bite(p, t):
    # Crouch back, lunge, snap, recover: 0.5 s.
    k = t / 0.5
    lunge = ease(k / 0.35) - ease((k - 0.55) / 0.45)
    coil = ease(k / 0.2) - ease((k - 0.2) / 0.15)
    for bone in RAT["spine"]:
        p.pitch(bone, 0.06 * coil - 0.05 * lunge)
    p.pitch(RAT["neck"], -0.25 * lunge)
    p.pitch(RAT["head"], 0.35 * lunge)
    p.pitch(RAT["jaw"], -0.6 * (ease((k - 0.2) / 0.15) - ease((k - 0.38) / 0.12)))
    for leg in ("front_l", "front_r"):
        p.pitch(RAT["legs"][leg][0], 0.4 * lunge)
    for leg in ("hind_l", "hind_r"):
        p.pitch(RAT["legs"][leg][0], -0.3 * lunge)
    rat_tail(p, t, 0.3, 0.5)


def rat_hurt(p, t):
    k = t / 0.35
    jolt = math.sin(math.pi * min(1.0, k))
    p.roll(RAT["root"], 0.25 * jolt)
    p.pitch(RAT["head"], 0.3 * jolt)
    p.pitch(RAT["jaw"], -0.4 * jolt)
    rat_tail(p, t, 0.5, 0.35)


def rat_die(p, t):
    k = ease(t / 0.7)
    p.roll(RAT["root"], 1.5 * k)
    p.move(RAT["root"], (0.0, 0.0, -0.12 * k))
    p.pitch(RAT["head"], -0.3 * k)
    p.pitch(RAT["jaw"], -0.3 * k)
    for leg in RAT["legs"].values():
        p.pitch(leg[0], 0.2 * k)
        p.pitch(leg[1], 0.5 * k)


RAT["clips"] = {
    "Idle": (96, rat_idle),
    "Walk": (12, lambda p, t: rat_gait(p, t, 0.5, 0.35, False)),
    "Run": (8, lambda p, t: rat_gait(p, t, 1 / 3, 0.55, True)),
    "Bite": (12, rat_bite),
    "Hurt": (9, rat_hurt),
    "Die": (18, rat_die),
}


# ---- spider ----------------------------------------------------------------------------------

SPIDER = dict(
    armature="SmartRigArmature",
    root="Bone_000",
    body="Bone_001",
    head="Bone_003",
    fangs=["Bone_069", "Bone_071"],
    palps=["Bone_077", "Bone_083"],
    abdomen=["Bone_007", "Bone_006"],
    # Each leg's chain from the body out; front to back down each side. Left is +X.
    left=[
        ["Bone_061", "Bone_060", "Bone_059"],
        ["Bone_013", "Bone_012", "Bone_011"],
        ["Bone_025", "Bone_024", "Bone_023"],
        ["Bone_037", "Bone_036", "Bone_035"],
        ["Bone_043", "Bone_042", "Bone_041"],
    ],
    right=[
        ["Bone_055", "Bone_054", "Bone_053"],
        ["Bone_019", "Bone_018", "Bone_017"],
        ["Bone_031", "Bone_030", "Bone_029"],
        ["Bone_049", "Bone_048", "Bone_047"],
        ["Bone_067", "Bone_066", "Bone_065"],
    ],
)


def spider_legs():
    for side, legs in ((0, SPIDER["left"]), (1, SPIDER["right"])):
        for i, leg in enumerate(legs):
            yield side, i, leg


def spider_gait(p, t, period, stride, rise):
    """Alternating sets: every other leg down one side, the opposite ones down the other."""
    for side, i, leg in spider_legs():
        phase = ((i + side) % 2) * 0.5
        s = wave(t, period, phase)
        up = max(0.0, math.cos(TAU * (t / period + phase)))
        p.swing(leg[0], stride * s)
        p.lift(leg[0], rise * up)
        p.lift(leg[1], -rise * 0.5 * up)
    sway = wave(t, period / 2)
    p.move(SPIDER["root"], (0.0, 0.0, 0.015 * sway))
    p.pitch(SPIDER["abdomen"][0], 0.03 * wave(t, period, 0.25))
    for i, palp in enumerate(SPIDER["palps"]):
        p.lift(palp, 0.15 * wave(t, period, i * 0.5))


def spider_idle(p, t):
    for side, i, leg in spider_legs():
        # Now and then one leg shifts its footing.
        shift = max(0.0, wave(t, 4.0, (i * 2 + side) / 10.0)) ** 8
        p.lift(leg[0], 0.12 * shift)
        p.swing(leg[0], 0.04 * shift)
    p.move(SPIDER["root"], (0.0, 0.0, 0.01 * wave(t, 2.0)))
    p.pitch(SPIDER["abdomen"][0], 0.04 * wave(t, 2.0, 0.2))
    for i, palp in enumerate(SPIDER["palps"]):
        p.lift(palp, 0.12 * wave(t, 1.0, i * 0.3))
    for i, fang in enumerate(SPIDER["fangs"]):
        p.swing(fang, 0.08 * wave(t, 2.0, i * 0.5))


def spider_strike(p, t):
    # Rear up on the hind legs, front legs raised, then drive down with the fangs: 0.6 s.
    k = t / 0.6
    rear = ease(k / 0.4) - ease((k - 0.55) / 0.45)
    strike = ease((k - 0.4) / 0.12) - ease((k - 0.7) / 0.3)
    p.pitch(SPIDER["body"], 0.15 * rear - 0.12 * strike)
    p.move(SPIDER["root"], (0.0, 0.0, 0.15 * rear))
    for side, i, leg in spider_legs():
        if i < 2:
            p.lift(leg[0], (0.7 - i * 0.25) * rear)
            p.swing(leg[0], 0.3 * rear)
        else:
            # The body tips back over the hind legs: they fold to keep their feet down.
            p.lift(leg[0], 0.12 * (i - 1) * rear)
            p.lift(leg[1], -0.1 * (i - 1) * rear)
    for fang in SPIDER["fangs"]:
        p.swing(fang, 0.5 * rear - 0.7 * strike)
    for palp in SPIDER["palps"]:
        p.lift(palp, 0.5 * rear)


def spider_hurt(p, t):
    k = math.sin(math.pi * min(1.0, t / 0.35))
    p.move(SPIDER["root"], (0.0, 0.0, -0.06 * k))
    p.roll(SPIDER["body"], 0.12 * k)
    for side, i, leg in spider_legs():
        p.lift(leg[0], 0.25 * k)
        p.lift(leg[1], -0.3 * k)


def spider_die(p, t):
    # It drops and its legs curl in under it.
    k = ease(t / 0.9)
    p.move(SPIDER["root"], (0.0, 0.0, -0.45 * k))
    p.roll(SPIDER["body"], 0.2 * k)
    for side, i, leg in spider_legs():
        p.lift(leg[0], 0.5 * k)
        p.lift(leg[1], -1.1 * k)
        p.lift(leg[2], -0.9 * k)
    for palp in SPIDER["palps"]:
        p.lift(palp, -0.6 * k)


SPIDER["clips"] = {
    "Idle": (96, spider_idle),
    "Walk": (16, lambda p, t: spider_gait(p, t, 2 / 3, 0.22, 0.35)),
    "Run": (8, lambda p, t: spider_gait(p, t, 1 / 3, 0.32, 0.45)),
    "Strike": (15, spider_strike),
    "Hurt": (9, spider_hurt),
    "Die": (22, spider_die),
}


# ---- moth ------------------------------------------------------------------------------------

MOTH = dict(
    armature="SmartRigArmature",
    root="Bone_000",
    thorax="Bone_001",
    head="Bone_015",
    antennae=[["Bone_041", "Bone_040"], ["Bone_045", "Bone_044"]],
    abdomen=["Bone_005", "Bone_004", "Bone_031"],
    # Each wing's chain from the body out: fore wings, then hind wings.
    fore=[["Bone_026", "Bone_025"], ["Bone_029", "Bone_028"]],
    hind=[["Bone_037", "Bone_036"], ["Bone_034", "Bone_033"]],
    legs=[["Bone_019", "Bone_018"], ["Bone_023", "Bone_022"], ["Bone_009", "Bone_008"], ["Bone_013", "Bone_012"]],
)


def moth_flap(p, t, period, amount, bob):
    s = wave(t, period)
    lag = wave(t, period, -0.08)
    for wing in MOTH["fore"]:
        p.lift(wing[0], amount * s + 0.15)
        p.lift(wing[1], 0.25 * amount * wave(t, period, -0.15))
    for wing in MOTH["hind"]:
        p.lift(wing[0], amount * 0.85 * lag + 0.1)
        p.lift(wing[1], 0.2 * amount * wave(t, period, -0.2))
    # The body rides each beat; the abdomen trails it.
    p.move(MOTH["root"], (0.0, 0.0, -bob * s))
    for i, bone in enumerate(MOTH["abdomen"]):
        p.pitch(bone, 0.06 * wave(t, period, -0.2 - i * 0.1))
    for i, antenna in enumerate(MOTH["antennae"]):
        p.lift(antenna[0], 0.1 * wave(t, period * 2, i * 0.5))
    for leg in MOTH["legs"]:
        p.lift(leg[0], -0.2)


def moth_hurt(p, t):
    k = math.sin(math.pi * min(1.0, t / 0.3))
    moth_flap(p, t, 0.15, 0.6, 0.02)
    p.roll(MOTH["root"], 0.5 * k)


def moth_die(p, t):
    # The wings fold up over its back and it tumbles.
    k = ease(t / 0.6)
    for wing in MOTH["fore"] + MOTH["hind"]:
        p.lift(wing[0], 1.1 * k)
    p.roll(MOTH["root"], 2.4 * k)
    for leg in MOTH["legs"]:
        p.lift(leg[0], -0.6 * k)
        p.lift(leg[1], -0.6 * k)


MOTH["clips"] = {
    # Whole beats in whole frames: 8, 6 and 4 frames a beat.
    "Hover": (24, lambda p, t: moth_flap(p, t, 8 / FPS, 0.8, 0.03)),
    "Fly": (24, lambda p, t: moth_flap(p, t, 6 / FPS, 0.95, 0.04)),
    "Dart": (24, lambda p, t: moth_flap(p, t, 4 / FPS, 1.05, 0.05)),
    "Hurt": (8, moth_hurt),
    "Die": (15, moth_die),
}


RIGS = {"rat": RAT, "spider": SPIDER, "moth": MOTH}


# ---- building and exporting ------------------------------------------------------------------


def critter():
    """Which critter the open .blend is (its file name)."""
    name = os.path.splitext(os.path.basename(bpy.data.filepath))[0].lower()
    if name not in RIGS:
        raise RuntimeError(f"open rat.blend, spider.blend or moth.blend (not {name})")
    return name, RIGS[name]


def rest_pose(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
        pb.scale = Vector((1, 1, 1))


def frame_keys(rig, pose_fn, t):
    p = Pose(rig)
    pose_fn(p, t)
    quats = {}
    for bone, axis, angle in p.turns:
        q = local_turn(rig, bone, axis, angle)
        # Later turns on the same bone go on top of earlier ones (both in rest space).
        quats[bone] = quats[bone] @ q if bone in quats else q
    moves = {}
    for bone, offset in p.moves:
        moves[bone] = moves.get(bone, Vector()) + local_move(rig, bone, offset)
    return quats, moves


def build(name, clip):
    rig_def = RIGS[name]
    rig = bpy.data.objects[rig_def["armature"]]
    frames, pose_fn = rig_def["clips"][clip]
    ad = rig.animation_data or rig.animation_data_create()
    ad.action = None
    rest_pose(rig)
    old = bpy.data.actions.get(clip)
    if old:
        for track in list(ad.nla_tracks):
            if track.name == clip:
                ad.nla_tracks.remove(track)
        bpy.data.actions.remove(old)
    action = bpy.data.actions.new(clip)
    action.use_fake_user = True
    ad.action = action
    keyed = set()
    # Every bone any frame turns is keyed on every frame (rest where a frame leaves it alone).
    samples = [(f, frame_keys(rig, pose_fn, f / FPS)) for f in range(frames + 1)]
    for _, (quats, moves) in samples:
        keyed.update(("rot", b) for b in quats)
        keyed.update(("loc", b) for b in moves)
    for f, (quats, moves) in samples:
        for kind, bone in keyed:
            pb = rig.pose.bones[bone]
            if kind == "rot":
                pb.rotation_quaternion = quats.get(bone, Quaternion())
                pb.keyframe_insert("rotation_quaternion", frame=f, group=bone)
            else:
                pb.location = moves.get(bone, Vector())
                pb.keyframe_insert("location", frame=f, group=bone)
    ad.action = None
    rest_pose(rig)
    track = ad.nla_tracks.new()
    track.name = clip
    track.strips.new(clip, 0, action)
    track.mute = True
    return action


def build_all():
    name, rig_def = critter()
    for clip in rig_def["clips"]:
        build(name, clip)
    print("built", name, ", ".join(rig_def["clips"]))


def preview(clip, frame=0):
    """Show a clip in the viewport at a frame (for checking it)."""
    _, rig_def = critter()
    rig = bpy.data.objects[rig_def["armature"]]
    rig.animation_data.action = bpy.data.actions[clip]
    bpy.context.scene.frame_set(frame)


def export():
    """Write this critter's clips, and only them, on the bare skeleton (no mesh)."""
    name, rig_def = critter()
    rig = bpy.data.objects[rig_def["armature"]]
    ad = rig.animation_data
    ad.action = None
    rest_pose(rig)
    path = os.path.join(EXPORT_DIR, f"{name}-clips.glb")
    for obj in bpy.context.view_layer.objects:
        obj.select_set(obj.name == rig.name)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=path,
        use_selection=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_def_bones=False,
        export_yup=True,
    )
    print("exported", path)
