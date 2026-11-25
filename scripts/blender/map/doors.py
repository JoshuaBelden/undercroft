"""Doors for the fixed map's rooms (docs/dev/fixed-map.md#doors): one model per door type (DOOR_TYPES
in src/lib/content/doors.ts), each a prop the game stands in a doorway at a door-<n> marker naming
its type.

Builds art/blender/props/doors.blend (refusing to replace one that exists, like a room) and exports
each door to art/export/props/<door>.glb for `pnpm asset:build`. Headless:

    blender -b --factory-startup -P scripts/blender/map/doors.py             # build, save, export
    blender -b --factory-startup -P scripts/blender/map/doors.py -- --force  # rebuild over hand edits
    blender -b art/blender/props/doors.blend -P scripts/blender/map/doors.py -- --export

Conventions (as the double door's, scripts/blender/props.py): origin on the floor in the middle of
the doorway; the room side is +Y (the door marker's +Y points into the room); a leaf swings away
from it, toward -Y. A leaf is its own object, `door-leaf-l`, its origin on its hinge at -X, reaching
toward +X: the game turns it about its vertical axis. Everything else is fixed: the frame.
"""

import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from common import kit  # noqa: E402

PROPS_BLEND = os.path.join(kit.ART, "blender", "props", "doors.blend")
PROPS_EXPORT = os.path.join(kit.EXPORT, "props")

common.add_materials(
    {
        "mat-door-wood": {"set": "Wood028", "tile": 1.0},
        "mat-door-frame": {"set": "Wood028", "tile": 1.5},
        "mat-door-iron": {"color": (0.06, 0.055, 0.05), "roughness": 0.55, "metallic": 0.4},
    }
)

# simple-wood-door: a plank door in a timber frame, a thumb latch on the room side.
SIMPLE = {
    "opening": (1.2, 2.2),  # the frame's outside: the doorway it stands in (m)
    "frame": 0.1,  # the frame's width
    "depth": 0.2,  # the frame's depth, through the wall
    "leaf": 0.05,  # the leaf's thickness
    "planks": 5,
}


def collection(name):
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "PLAIN_AXES"
    coll.objects.link(root)
    return coll, root


def build_simple_wood_door():
    """A single plank door hung on its left in a timber frame, battens and a brace on its far side,
    an iron thumb latch and its keeper on the room side."""
    name = "door-simple-wood"
    coll, root = collection(name)
    w, h = SIMPLE["opening"]
    f, d, t = SIMPLE["frame"], SIMPLE["depth"], SIMPLE["leaf"]
    F, W, I = "mat-door-frame", "mat-door-wood", "mat-door-iron"

    frame = kit.MeshBuilder(name + "-frame")
    half = w / 2
    # Jambs, head and a low sill, the leaf closing against a stop on the far side.
    frame.box((-half, -d / 2, 0), (-half + f, d / 2, h), F)
    frame.box((half - f, -d / 2, 0), (half, d / 2, h), F)
    frame.box((-half, -d / 2, h - f), (half, d / 2, h), F)
    frame.box((-half + f, -d / 2, 0), (half - f, d / 2, 0.02), F)
    stop = 0.025
    for x0, x1, z0, z1 in ((-half + f, -half + f + stop, 0.02, h - f), (half - f - stop, half - f, 0.02, h - f), (-half + f, half - f, h - f - stop, h - f)):
        frame.box((x0, -d / 2, z0), (x1, -t / 2, z1), F)
    frame.finish(coll, root)

    # The leaf, built with its hinge at x = 0 and reaching +X, then set at the left jamb.
    leaf_w = w - 2 * f - 0.01
    leaf_h = h - f - 0.03
    leaf = kit.MeshBuilder("door-leaf-l")
    planks = SIMPLE["planks"]
    gap = 0.006
    width = (leaf_w - gap * (planks - 1)) / planks
    for k in range(planks):
        x0 = k * (width + gap)
        leaf.box((x0, -t / 2, 0.01), (x0 + width, t / 2, leaf_h), W)
    # Battens across the far side (-Y), and a brace between them, rising from the hinge side.
    batten = 0.12
    for z in (0.3, leaf_h - 0.35):
        leaf.box((0.03, -t / 2 - 0.03, z), (leaf_w - 0.03, -t / 2, z + batten), W)
    brace_lo, brace_hi = 0.3 + batten, leaf_h - 0.35
    run = leaf_w - 0.16
    a, b = Vector((0.08, -t / 2 - 0.015, brace_lo + 0.05)), Vector((0.08 + run, -t / 2 - 0.015, brace_hi - 0.05))
    axis = (b - a).normalized()
    side = Vector((0, 1, 0)).cross(axis).normalized() * 0.05
    depth = Vector((0, 0.015, 0))
    for c0, c1 in ((side + depth, -side + depth), (-side + depth, -side - depth), (-side - depth, side - depth), (side - depth, side + depth)):
        leaf.face([a + c0, a + c1, b + c1, b + c0], W, facing=(c0 + c1) / 2)
    # The thumb latch, on the room side (+Y), near the free edge: a bar across to the keeper on
    # the jamb, a lift and a bow handle below it.
    latch_x, latch_z = leaf_w - 0.08, 1.05
    leaf.box((latch_x - 0.18, t / 2, latch_z - 0.012), (latch_x + 0.07, t / 2 + 0.012, latch_z + 0.012), I)
    leaf.box((latch_x - 0.2, t / 2, latch_z - 0.05), (latch_x - 0.16, t / 2 + 0.006, latch_z + 0.05), I)
    for z in (latch_z - 0.13, latch_z - 0.31):
        leaf.box((latch_x - 0.11, t / 2, z - 0.025), (latch_x - 0.05, t / 2 + 0.004, z + 0.025), I)
    leaf.box((latch_x - 0.095, t / 2 + 0.004, latch_z - 0.31), (latch_x - 0.065, t / 2 + 0.05, latch_z - 0.13), I)
    # Strap hinges on the room side, reaching in from the hinge edge.
    for z in (0.35, leaf_h - 0.3):
        leaf.box((0.0, t / 2, z - 0.025), (0.55, t / 2 + 0.006, z + 0.025), I)
    obj = leaf.finish(coll, root)
    obj.location = (-half + f + 0.005, 0, 0)

    # The keeper the latch drops into, on the right jamb's room side.
    keeper = kit.MeshBuilder(name + "-keeper")
    keeper.box((half - f - 0.01, d / 2, latch_z - 0.03), (half - f + 0.03, d / 2 + 0.02, latch_z + 0.04), I)
    keeper.finish(coll, root)
    return coll


DOORS = {"door-simple-wood": build_simple_wood_door}


def export(name):
    os.makedirs(PROPS_EXPORT, exist_ok=True)
    layer = kit._find_layer_collection(bpy.context.view_layer.layer_collection, name)
    bpy.context.view_layer.active_layer_collection = layer
    path = os.path.join(PROPS_EXPORT, name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_active_collection=True,
        use_active_collection_with_nested=True,
        export_extras=True,
        export_apply=True,
        export_yup=True,
        export_lights=False,
        export_cameras=False,
        export_image_format="JPEG",
    )
    return path


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if "--export" not in args:
        if os.path.exists(PROPS_BLEND) and "--force" not in args:
            raise SystemExit(f"{os.path.relpath(PROPS_BLEND, common.REPO)} exists: export it (-- --export), or rebuild with -- --force")
        common.empty_scene()
        for build in DOORS.values():
            build()
        os.makedirs(os.path.dirname(PROPS_BLEND), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=PROPS_BLEND)
        print("  " + os.path.relpath(PROPS_BLEND, common.REPO))
    for name in DOORS:
        print("  " + os.path.relpath(export(name), common.REPO))


if __name__ == "__main__":
    main()
