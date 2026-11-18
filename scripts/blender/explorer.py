"""Undercroft explorer: hand-keyed upper-body clips for holding and using items.

The explorer (every player's body) came from Mixamo with walking, running, crawling, climbing
and a few other clips, but nothing for holding a gun, a bandage or a battery. This script adds
those clips to art/blender/Explorer.blend and exports them, on the bare skeleton, to
art/export/player/explorer-clips.glb; `pnpm asset:build` merges them into the explorer by bone
name. They key only the arm bones (and fingers): the game plays them over the legs' clip, on the
upper body alone (see docs/dev/player.md#player-model).

Run inside Blender with art/blender/Explorer.blend open (Text Editor or the Blender MCP):

    import sys, importlib
    sys.path.insert(0, r"D:/Code/undercroft/scripts/blender")
    import explorer; importlib.reload(explorer)
    explorer.build_all()      # (re)make every clip in CLIPS
    explorer.export()         # write art/export/player/explorer-clips.glb, then `pnpm asset:build`

How a clip is made: each key gives where each wrist goes and which way the hand faces, in the
model's own space (it faces -Y, its right is -X, up is +Z, metres from its feet). The arm is
solved with a temporary IK chain (pole behind the elbow), the hand turned with a copy-rotation,
and the result baked to plain rotation keys. Fingers curl by `grip` (0 open, 1 a fist).
"""

import glob
import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXPORT = os.path.join(ROOT, "art", "export", "player", "explorer-clips.glb")
ARMATURE = "SmartRigArmature"
MESH = "output_unwrapped"
FPS = 24

# The palm's normal in each hand bone's rest space. With the bone's Y (wrist to fingers) it fixes
# the hand's turn: worked out from where the thumb sits (along x palm points to the right thumb,
# palm x along to the left one).
PALM = {"Right": Vector((-0.37, 0.0, -0.93)), "Left": Vector((0.33, 0.0, -0.94))}
FINGERS = ("Index", "Middle", "Ring", "Pinky")


def v(x, y, z):
    return Vector((x, y, z))


# ---- the clips -----------------------------------------------------------------------------
#
# A hand key: (wrist position, finger direction, palm normal, elbow pole, grip). Directions
# needn't be unit length. The pole is a point the elbow bends toward.

R_POLE = v(-0.45, 0.35, 0.95)
L_POLE = v(0.45, 0.35, 0.95)

# One-handed: a revolver or a blade held low and forward, barrel ahead.
ONE = dict(R=(v(-0.2, -0.36, 1.08), v(0.08, -1, -0.12), v(1, 0, 0.1), R_POLE, 0.85))
ONE_UP = dict(R=(v(-0.2, -0.36, 1.09), v(0.08, -1, -0.1), v(1, 0, 0.1), R_POLE, 0.85))
# Two-handed: the shotgun across the body, stock under the right arm, left hand on the fore-end.
TWO_GUN = v(0.45, -0.9, -0.05)
TWO_FORE = 0.24  # metres from the grip to where the left hand holds it


def two_hand(rise=0.0):
    """The shotgun's grip in the right hand, the left cupping the fore-end from below."""
    g = TWO_GUN.normalized()
    wrist = v(-0.12, -0.17, 1.16 + rise)
    # The gun sits a little toward the palm (+X) of the right hand: see show_item's nudge.
    grip = wrist + g * 0.07 + v(0.03, 0, 0)
    fore = grip + g * TWO_FORE
    left_along = v(-1, -0.3, 0).normalized()
    return dict(
        R=(wrist, g, v(1, 0, 0.15), R_POLE, 0.85),
        L=(fore - left_along * 0.07 + v(0, 0, 0.005), left_along, v(0, 0, 1), L_POLE, 0.75),
    )


TWO = two_hand()
TWO_UP = two_hand(0.01)
# An item held in front, in the right hand, palm up and in.
ITEM = dict(R=(v(-0.15, -0.3, 1.04), v(0.25, -1, 0), v(0.5, 0, 0.85), R_POLE, 0.6))
ITEM_UP = dict(R=(v(-0.15, -0.3, 1.05), v(0.25, -1, 0.02), v(0.5, 0, 0.85), R_POLE, 0.6))


def kicked(pose, side, up, back, tilt):
    """The same pose with that wrist thrown up and back, and the hand tipped up."""
    wrist, fingers, palm, pole, grip = pose[side]
    f = fingers.normalized()
    f = (f + v(0, 0, tilt)).normalized()
    return {**pose, side: (wrist + v(0, back, up), f, palm, pole, grip)}


def kicked_two(pose, up, back, tilt):
    out = kicked(pose, "R", up, back, tilt)
    return kicked(out, "L", up, back, 0)


# Reload: the gun brought in to the middle of the chest, muzzle up and left; the left hand
# feeds it.
RELOAD_R = (v(-0.08, -0.26, 1.15), v(0.6, -0.55, 0.45), v(0.2, 0.3, 1), R_POLE, 0.85)
RELOAD_L_A = (v(0.04, -0.3, 1.12), v(-0.5, -0.6, 0.3), v(-1, 0, 0.3), L_POLE, 0.4)
RELOAD_L_B = (v(0.09, -0.24, 1.06), v(-0.4, -0.6, 0.2), v(-1, 0, 0.3), L_POLE, 0.8)
RELOAD = dict(R=RELOAD_R, L=RELOAD_L_A)
RELOAD_FEED = dict(R=RELOAD_R, L=RELOAD_L_B)

# Bandaging: the left forearm held across in front, the right hand winding round it.
BANDAGE_L = (v(0.0, -0.32, 1.12), v(-1, -0.2, 0), v(0, 0, -1), v(0.45, 0.2, 0.8), 0.3)
BANDAGE_MID = v(0.1, -0.29, 1.11)


def winding(angle):
    """The right hand at `angle` round the left forearm."""
    off = v(-0.02, -math.sin(angle) * 0.07, math.cos(angle) * 0.07)
    wrist = BANDAGE_MID + off + v(-0.11, 0, 0)
    palm = -off.normalized()
    return dict(R=(wrist, v(1, 0, 0), palm, R_POLE, 0.55), L=BANDAGE_L)


# Changing the battery: both hands up at the lamp on the forehead.
def at_lamp(twist):
    return dict(
        R=(v(-0.09, -0.26, 1.5), v(0.45 + twist, -0.1, 0.9), v(0.3, 1, 0), R_POLE, 0.7),
        L=(v(0.09, -0.26, 1.49), v(-0.45, -0.1, 0.9), v(-0.3, 1, 0), L_POLE, 0.5),
    )


# Clip name -> (frame, pose) keys. Loops end on their first pose.
CLIPS = {
    "Hold_One_Hand": [(0, ONE), (36, ONE_UP), (72, ONE)],
    "Hold_Two_Hand": [(0, TWO), (36, TWO_UP), (72, TWO)],
    "Hold_Item": [(0, ITEM), (36, ITEM_UP), (72, ITEM)],
    "Fire_One_Hand": [(0, ONE), (2, kicked(ONE, "R", 0.05, 0.05, 0.45)), (10, ONE)],
    "Fire_Two_Hand": [(0, TWO), (2, kicked_two(TWO, 0.04, 0.07, 0.25)), (12, TWO)],
    "Reload": [
        (0, ONE),
        (8, RELOAD),
        (16, RELOAD_FEED),
        (24, RELOAD),
        (32, RELOAD_FEED),
        (40, RELOAD),
        (48, ONE),
    ],
    "Use_Bandage": [(i * 6, winding(i * math.pi / 2)) for i in range(5)],
    "Use_Battery": [(0, at_lamp(0)), (12, at_lamp(0.25)), (24, at_lamp(0))],
}

# ---- building ------------------------------------------------------------------------------


def bone(side, part):
    return f"mixamorig:{side}{part}"


def arm_bones(side):
    names = [bone(side, p) for p in ("Shoulder", "Arm", "ForeArm", "Hand")]
    for finger in FINGERS + ("Thumb",):
        names += [bone(side, f"Hand{finger}{i}") for i in (1, 2, 3)]
    return names


def hand_matrix(rig, side, fingers, palm):
    """World rotation for the hand bone: its Y along `fingers`, its palm toward `palm`."""
    y_l = Vector((0, 1, 0))
    p_l = PALM[side].normalized()
    p_l = (p_l - y_l * p_l.dot(y_l)).normalized()
    local = Matrix((y_l, p_l, y_l.cross(p_l))).transposed()
    f = fingers.normalized()
    p = (palm - f * palm.dot(f)).normalized()
    world = Matrix((f, p, f.cross(p))).transposed()
    # The bone's axes in the world are its pose matrix's columns: it maps `local` onto `world`.
    return (rig.matrix_world.to_3x3() @ world @ local.inverted()).to_4x4()


def curl_quats(rig, side, grip):
    """Local rotations that close the fingers (and thumb, less) by `grip`."""
    out = {}
    hand = rig.data.bones[bone(side, "Hand")]
    palm_w = hand.matrix_local.to_3x3() @ PALM[side].normalized()
    for finger in FINGERS + ("Thumb",):
        amount = grip * (0.55 if finger == "Thumb" else 1.0)
        for i, share in zip((1, 2, 3), (1.0, 1.1, 0.8)):
            b = rig.data.bones[bone(side, f"Hand{finger}{i}")]
            m = b.matrix_local.to_3x3()
            along = (m @ Vector((0, 1, 0))).normalized()
            # Turning  about along x palm tips it toward the palm.
            axis_w = along.cross(palm_w).normalized()
            axis_l = (m.inverted() @ axis_w).normalized()
            out[b.name] = Quaternion(axis_l, amount * share * 1.15)
    return out


def ensure_empty(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        obj = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(obj)
    obj.empty_display_size = 0.05
    return obj


def solve(rig, pose):
    """Pose the arms for one key; returns {bone: local quaternion} for the keyed bones."""
    scene = bpy.context.scene
    result = {}
    for side in ("Right", "Left"):
        key = pose.get(side[0])
        fore = rig.pose.bones[bone(side, "ForeArm")]
        hand = rig.pose.bones[bone(side, "Hand")]
        for c in list(fore.constraints) + list(hand.constraints):
            if c.name.startswith("tmp-"):
                (fore if c in list(fore.constraints) else hand).constraints.remove(c)
        if key is None:
            continue
        wrist, fingers, palm, pole_at, _grip = key
        target = ensure_empty(f"tmp-{side}-wrist")
        target.matrix_world = Matrix.Translation(rig.matrix_world @ wrist)
        pole = ensure_empty(f"tmp-{side}-pole")
        pole.location = rig.matrix_world @ pole_at
        turn = ensure_empty(f"tmp-{side}-hand")
        turn.matrix_world = hand_matrix(rig, side, fingers, palm)
        ik = fore.constraints.new("IK")
        ik.name = "tmp-ik"
        ik.target = target
        ik.pole_target = pole
        ik.pole_angle = -math.pi / 2
        ik.chain_count = 2
        rot = hand.constraints.new("COPY_ROTATION")
        rot.name = "tmp-rot"
        rot.target = turn
    scene.frame_set(scene.frame_current)
    bpy.context.view_layer.update()
    for side in ("Right", "Left"):
        key = pose.get(side[0])
        if key is None:
            continue
        for part in ("Arm", "ForeArm", "Hand"):
            pb = rig.pose.bones[bone(side, part)]
            basis = rig.convert_space(
                pose_bone=pb, matrix=pb.matrix, from_space="POSE", to_space="LOCAL"
            )
            result[pb.name] = basis.to_quaternion()
        result.update(curl_quats(rig, side, key[4]))
    clear(rig)
    return result


def clear(rig):
    for pb in rig.pose.bones:
        for c in list(pb.constraints):
            if c.name.startswith("tmp-"):
                pb.constraints.remove(c)
    for obj in list(bpy.data.objects):
        if obj.name.startswith("tmp-"):
            bpy.data.objects.remove(obj)


def rest_pose(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
        pb.scale = Vector((1, 1, 1))


def build(name):
    rig = bpy.data.objects[ARMATURE]
    ad = rig.animation_data or rig.animation_data_create()
    # Whatever clip was being looked at comes back after (the rebuilt one, if it was this).
    was = ad.action.name if ad.action else None
    ad.action = None
    rest_pose(rig)
    keys = [(frame, solve(rig, pose)) for frame, pose in CLIPS[name]]
    rest_pose(rig)

    old = bpy.data.actions.get(name)
    if old:
        for track in list(ad.nla_tracks):
            if track.name == name:
                ad.nla_tracks.remove(track)
        bpy.data.actions.remove(old)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    ad.action = action
    for frame, quats in keys:
        for bone_name, q in quats.items():
            pb = rig.pose.bones[bone_name]
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=frame, group=bone_name)
    ad.action = None
    rest_pose(rig)
    track = ad.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    track.mute = True
    ad.action = bpy.data.actions.get(was) if was else None
    return action


def build_all():
    for name in CLIPS:
        build(name)
    print("built", ", ".join(CLIPS))


def preview(name, frame=0):
    """Show a clip in the viewport at a frame (for checking it)."""
    rig = bpy.data.objects[ARMATURE]
    rig.animation_data.action = bpy.data.actions[name]
    bpy.context.scene.frame_set(frame)


def export():
    """
    Write the clips in CLIPS, and only them, on the bare skeleton (no mesh). The asset build
    merges them into explorer.glb by bone name. The Mixamo clips and the mesh are never
    re-exported: Blender's exporter resamples every clip to whole frames (shifting each one's
    length, so loops hitch) and re-encodes the mesh.
    """
    rig = bpy.data.objects[ARMATURE]
    ad = rig.animation_data
    # The clip being looked at in the .blend comes back after: every track is muted, so without
    # an active action nothing moves in the viewport.
    was = ad.action
    ad.action = None
    rest_pose(rig)
    # Set the other clips' tracks aside for the export, and put them back after.
    aside = []
    for track in list(ad.nla_tracks):
        if track.name in CLIPS:
            continue
        strip = track.strips[0]
        aside.append((track.name, strip.action, strip.frame_start, track.mute))
        ad.nla_tracks.remove(track)
    try:
        for obj in bpy.context.view_layer.objects:
            obj.select_set(obj.name == ARMATURE)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.export_scene.gltf(
            filepath=EXPORT,
            use_selection=True,
            export_animations=True,
            export_animation_mode="NLA_TRACKS",
            export_def_bones=False,
            export_yup=True,
            # Every bone, sampled: the exporter would otherwise drop a channel that holds still
            # (curled fingers, an arm that doesn't move). The asset build keeps a clip's rotation
            # channels that are off the rest pose, so an arm it leaves alone follows the legs.
        )
    finally:
        for name, action, start, mute in aside:
            track = ad.nla_tracks.new()
            track.name = name
            track.strips.new(name, int(start), action)
            track.mute = mute
        ad.action = was
    print("exported", EXPORT)


# ---- grips -----------------------------------------------------------------------------------
#
# Where each item sits in the right hand. Items are modelled with their origin at the grip,
# forward +Y, up +Z (scripts/blender/items.py, scripts/items.config.ts). Held, forward runs along
# the hand bone (wrist to fingers), up is the thumb side and the palm is on the item's left.
# Each entry: the clip whose first frame to check it in, a nudge from the wrist (along the hand,
# toward the palm, up; metres) and a turn (radians) about the item's own Y, X and Z, in that
# order. `grip_numbers()` turns them into the game's `grip` (src/lib/content/items.ts), in the
# hand bone's frame as three.js sees it.

# Item id -> model file in static/assets/shared/items (when it isn't the id).
MODEL_FILES = {"rope-pack": "rope_pack", "rope-bundle": "rope_bundle"}
# Resting on the palm: the item's top turned to face out of it.
ON_PALM = (-math.pi / 2, 0.0, 0.0)

GRIPS = {
    "knife": ("Hold_One_Hand", (0.07, 0.03, 0.0), (0.0, 0.25, 0.0)),
    "crowbar": ("Hold_One_Hand", (0.07, 0.03, 0.0), (0.0, 0.8, 0.0)),
    "brick": ("Hold_One_Hand", (0.08, 0.04, 0.0), (0.0, 0.0, 0.0)),
    "revolver": ("Hold_One_Hand", (0.07, 0.03, 0.015), (0.0, 0.0, 0.0)),
    "shotgun": ("Hold_Two_Hand", (0.07, 0.03, 0.0), (0.0, 0.0, 0.0)),
    "bandage": ("Hold_Item", (0.08, 0.05, 0.0), ON_PALM),
    "medkit": ("Hold_Item", (0.08, 0.04, 0.0), (0.0, 0.0, -math.pi / 2)),
    "battery": ("Hold_Item", (0.08, 0.04, 0.0), ON_PALM),
    "salts": ("Hold_Item", (0.08, 0.04, 0.0), ON_PALM),
    "chalk": ("Hold_Item", (0.08, 0.03, 0.0), (0.0, 0.0, 0.0)),
    "rope-pack": ("Hold_Item", (0.08, 0.08, 0.0), ON_PALM),
    "rope-bundle": ("Hold_Item", (0.08, 0.08, 0.0), ON_PALM),
}

# The built models (pnpm asset:build), already turned into the item frame.
ITEMS_DIR = os.path.join(ROOT, "static", "assets", "shared", "items")
HAND = bone("Right", "Hand")


def hand_frame(rig):
    """The right hand's (along, palm, up) axes and wrist in world space, as posed now."""
    pb = rig.pose.bones[HAND]
    m = (rig.matrix_world @ pb.matrix).to_3x3()
    y_l = Vector((0, 1, 0))
    p_l = PALM["Right"].normalized()
    p_l = (p_l - y_l * p_l.dot(y_l)).normalized()
    along = (m @ y_l).normalized()
    palm = (m @ p_l).normalized()
    return along, palm, along.cross(palm), rig.matrix_world @ pb.head


def item_matrix(rig, item):
    """Where GRIPS puts the item, in world space, in the hand as posed now."""
    _clip, nudge, turn = GRIPS[item]
    along, palm, up, wrist = hand_frame(rig)
    basis = Matrix((-palm, along, up)).transposed()  # item X (right), Y (forward), Z (up)
    spin = (
        Matrix.Rotation(turn[0], 3, "Y")
        @ Matrix.Rotation(turn[1], 3, "X")
        @ Matrix.Rotation(turn[2], 3, "Z")
    )
    m = (basis @ spin).to_4x4()
    m.translation = wrist + along * nudge[0] + palm * nudge[1] + up * nudge[2]
    return m


def show_item(item):
    """Pose the item's clip (first frame) and put the item in the hand, to look at it."""
    rig = bpy.data.objects[ARMATURE]
    preview(GRIPS[item][0], 0)
    name = f"grip-{item}"
    obj = bpy.data.objects.get(name)
    if obj is None:
        before = set(bpy.data.objects)
        model = MODEL_FILES.get(item, item)
        bpy.ops.import_scene.gltf(filepath=glob.glob(os.path.join(ITEMS_DIR, f"{model}.*.glb"))[0])
        obj = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(obj)
        for o in bpy.data.objects:
            if o not in before and o.parent is None and o is not obj:
                o.parent = obj
    obj.matrix_world = item_matrix(rig, item)
    return obj


def hide_items():
    holders = [o for o in bpy.data.objects if o.name.startswith("grip-")]
    doomed = {c.name for o in holders for c in o.children_recursive} | {o.name for o in holders}
    for name in doomed:
        bpy.data.objects.remove(bpy.data.objects[name])


# glTF is Y-up: Blender (x, y, z) is glTF (x, z, -y).
TO_GLTF = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0))).to_4x4()
# An item's model in three.js points down -Z with +Y up; in Blender it points +Y with +Z up.
ITEM_TO_BLENDER = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_4x4()


def gltf_rest(node_name):
    """A bone's rest matrix in the exported clips file, in glTF world space."""
    import json
    import struct

    with open(EXPORT, "rb") as f:
        data = f.read()
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20 : 20 + length])
    nodes = doc["nodes"]
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}

    def local(n):
        t = Vector(n.get("translation", (0, 0, 0)))
        x, y, z, w = n.get("rotation", (0, 0, 0, 1))
        s = n.get("scale", (1, 1, 1))
        m = Quaternion((w, x, y, z)).to_matrix().to_4x4()
        m = m @ Matrix.Diagonal((*s, 1))
        m.translation = t
        return m

    i = next(i for i, n in enumerate(nodes) if n.get("name") == node_name)
    m = Matrix.Identity(4)
    while i is not None:
        m = local(nodes[i]) @ m
        i = parent.get(i)
    return m


def grip_numbers():
    """
    Each item's `grip` for src/lib/content/items.ts: where it sits in the hand bone's own frame
    in the game (three.js, from the exported file), as offset (m) and rotation (XYZ Euler,
    radians). Run export() first: the hand's frame is read from it.
    """
    rig = bpy.data.objects[ARMATURE]
    hand = rig.data.bones[HAND]
    # The exported bone's frame against Blender's (the importer may have turned bones).
    rest_blender = TO_GLTF @ rig.matrix_world @ hand.matrix_local
    fix = rest_blender.inverted() @ gltf_rest(hand.name)
    out = {}
    for item, (clip, _nudge, _turn) in GRIPS.items():
        preview(clip, 0)
        posed = rig.matrix_world @ rig.pose.bones[HAND].matrix
        rel = fix.inverted() @ posed.inverted() @ item_matrix(rig, item) @ ITEM_TO_BLENDER
        t = rel.translation
        e = rel.to_euler("ZYX")  # three.js 'XYZ' order
        out[item] = ([round(t.x, 4), round(t.y, 4), round(t.z, 4)], [round(e.x, 3), round(e.y, 3), round(e.z, 3)])
        print(f"{item}: offset {out[item][0]}, rotation {out[item][1]}")
    return out
