"""Undercroft props (things standing in the map that aren't part of a piece): the loot crate.

Bootstraps the models inside the kit .blend. Like pieces and items, the .blend is the source of
truth once they exist: building skips a prop collection that already exists unless force=True,
so hand edits are kept.

Run inside Blender (Text Editor or the Blender MCP):

    import sys, importlib
    sys.path.insert(0, r"D:/Code/undercroft/scripts/blender")
    import kit, props; importlib.reload(kit); importlib.reload(props)
    props.build_all()            # build props that don't exist yet
    props.export_all()           # write art/export/props/<name>.glb

Conventions (see docs/dev/asset-pipeline.md):
- 1 unit = 1 m. Each prop lives in a collection `prop-<name>` under a root empty of the same name.
- Origin on the floor, centred. The front faces -Y; the back (+Y) goes against a wall.
- A part the game moves is its own object with its origin on the pivot: the crate's lid
  (`crate-lid`) has its origin on the back top edge, and the game turns it about its X axis.
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import kit

EXPORT = os.path.join(kit.EXPORT, "props")

PROPS = ["crate"]

# The crate: outer size (m), plank thickness, and how thick the lid is.
CRATE_W = 0.9
CRATE_D = 0.6
CRATE_H = 0.5
CRATE_WALL = 0.03
CRATE_LID = 0.04
PLANKS = "mat-prop-planks"


def prop_collection(name, force=False):
    full = f"prop-{name}"
    coll = kit.piece_collection(full, force=force)
    root = bpy.data.objects.new(full, None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.2
    root["prop"] = name
    coll.objects.link(root)
    return coll, root


def build_crate(force=False):
    coll, root = prop_collection("crate", force)
    hw, hd = CRATE_W / 2, CRATE_D / 2
    top = CRATE_H - CRATE_LID
    t = CRATE_WALL

    body = kit.MeshBuilder("crate-body")
    # Outside, inside (faces turned in) and the rim between them. No top: the lid closes it.
    body.box((-hw, -hd, 0), (hw, hd, top), PLANKS, skip=("+z", "-z"))
    body.box((-hw + t, -hd + t, t), (hw - t, hd - t, top), PLANKS, skip=("+z",), inward=True)
    for lo, hi in (
        ((-hw, -hd, top), (hw, -hd + t, top)),
        ((-hw, hd - t, top), (hw, hd, top)),
        ((-hw, -hd + t, top), (-hw + t, hd - t, top)),
        ((hw - t, -hd + t, top), (hw, hd - t, top)),
    ):
        body.face(
            [(lo[0], lo[1], top), (hi[0], lo[1], top), (hi[0], hi[1], top), (lo[0], hi[1], top)],
            PLANKS,
            facing=(0, 0, 1),
        )
    # Battens: upright at each corner of the front and back, and a band along the foot.
    proud = 0.012
    for y0, y1 in ((-hd - proud, -hd), (hd, hd + proud)):
        for x0 in (-hw, hw - 0.07):
            body.box((x0, y0, 0), (x0 + 0.07, y1, top), PLANKS)
    for x0, x1 in ((-hw - proud, -hw), (hw, hw + proud)):
        body.box((x0, -hd, 0), (x1, hd, 0.07), PLANKS)
        body.box((x0, -hd, top - 0.07), (x1, hd, top), PLANKS)
    body.finish(coll, root)

    # The lid, in its own space: the origin is the hinge line along the back top edge.
    over = 0.015
    lid = kit.MeshBuilder("crate-lid")
    lid.box((-hw - over, -CRATE_D - over, 0), (hw + over, 0, CRATE_LID), PLANKS)
    for x in (-hw * 0.6, hw * 0.6):
        lid.box((x - 0.035, -CRATE_D - over, CRATE_LID), (x + 0.035, 0, CRATE_LID + proud), PLANKS)
    obj = lid.finish(coll, root)
    obj.location = (0, hd, top)
    return coll


BUILDERS = {"crate": build_crate}


# ---------------------------------------------------------------------------
# Crate markers: `crate-<n>` empties in a piece, where a loot crate may stand. The game fills
# only some of them. The empty sits on the floor at the crate's centre; its local +Y points at
# the wall behind the crate.

# Which way each wall lies, and the turn about Z that puts the crate's back against it.
WALLS = {
    "n": ((0, 1, 0), 0.0),
    "s": ((0, -1, 0), math.pi),
    "e": ((1, 0, 0), -math.pi / 2),
    "w": ((-1, 0, 0), math.pi / 2),
}
# Half the crate's footprint with its battens, and the gap left behind it.
CRATE_HALF_W = CRATE_W / 2 + 0.02
CRATE_HALF_D = CRATE_D / 2 + 0.02
CRATE_GAP = 0.02


def _piece_tree(root):
    """BVH of a piece's visible meshes (not col-/vol-), in the root's space."""
    bm = bmesh.new()
    inv = root.matrix_world.inverted()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for child in root.children_recursive:
        if child.type != "MESH" or child.name.startswith(("col-", "vol-")):
            continue
        evaluated = child.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        part = bmesh.new()
        part.from_mesh(mesh)
        bmesh.ops.transform(part, matrix=inv @ child.matrix_world, verts=part.verts)
        copy = bpy.data.meshes.new("tmp-crate-probe")
        part.to_mesh(copy)
        part.free()
        bm.from_mesh(copy)
        bpy.data.meshes.remove(copy)
        evaluated.to_mesh_clear()
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def probe_crate(piece, x, y, wall):
    """Where a crate started near (x, y) ends up pushed back against `wall` ('n', 's', 'e', 'w').

    Returns its centre, the spread of the wall's distance across the crate's back (uneven rock
    shows as a wide spread), the highest thing under its footprint, and the clear floor in front.
    """
    root = bpy.data.objects[piece]
    tree = _piece_tree(root)
    direction = Vector(WALLS[wall][0])
    side = Vector((-direction.y, direction.x, 0))
    hits = []
    for across in (-CRATE_HALF_W, 0, CRATE_HALF_W):
        for z in (0.08, 0.25, 0.45):
            hit = tree.ray_cast(Vector((x, y, z)) + side * across, direction, 4.0)
            if hit[0] is None:
                raise ValueError(f"{piece}: no wall to the {wall} of ({x}, {y})")
            hits.append(hit[3])
    centre = Vector((x, y, 0)) + direction * (min(hits) - CRATE_HALF_D - CRATE_GAP)
    under = 0.0
    for across in (-CRATE_HALF_W, 0, CRATE_HALF_W):
        for along in (-CRATE_HALF_D, 0, CRATE_HALF_D):
            origin = centre + side * across + direction * along + Vector((0, 0, 1.2))
            hit = tree.ray_cast(origin, Vector((0, 0, -1)), 2.0)
            if hit[0] is not None:
                under = max(under, hit[0].z)
    start = centre + Vector((0, 0, 0.5)) - direction * (CRATE_HALF_D + 0.01)
    front = tree.ray_cast(start, -direction, 6.0)
    return {
        "centre": (round(centre.x, 3), round(centre.y, 3), 0.0),
        "wall_spread": round(max(hits) - min(hits), 2),
        "under": round(under, 2),
        "front": round(front[3], 2) if front[0] is not None else None,
    }


def crate_marker(piece, x, y, wall):
    """Add the next `crate-<n>` empty to a piece, against `wall` near (x, y) (piece space)."""
    info = probe_crate(piece, x, y, wall)
    root = bpy.data.objects[piece]
    taken = {child.name.split(".")[0] for child in root.children}
    index = next(i for i in range(100) if f"crate-{i}" not in taken)
    coll = bpy.data.collections[piece]
    empty = kit.marker(coll, root, f"crate-{index}", info["centre"], display="ARROWS", size=0.45)
    empty.rotation_euler = (0, 0, WALLS[wall][1])
    info["name"] = empty.name
    return info


def layout_props(spacing=2.0, y=-18.0):
    """Line the props up in the viewport away from the pieces and items (roots only)."""
    for idx, name in enumerate(PROPS):
        root = bpy.data.objects.get(f"prop-{name}")
        if root:
            root.location = (idx * spacing, y, 0)


def build_all():
    """Build props that don't exist yet. Existing (possibly hand-edited) props are skipped."""
    built = []
    for name in PROPS:
        try:
            BUILDERS[name]()
            built.append(name)
        except kit.PieceExists:
            print(f"skip prop-{name}: already exists")
    layout_props()
    return built


def export_prop(name):
    os.makedirs(EXPORT, exist_ok=True)
    full = f"prop-{name}"
    root = bpy.data.objects[full]
    saved = root.location.copy()
    root.location = (0, 0, 0)
    layer = kit._find_layer_collection(bpy.context.view_layer.layer_collection, full)
    bpy.context.view_layer.active_layer_collection = layer
    path = os.path.join(EXPORT, name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_active_collection=True,
        use_active_collection_with_nested=True,
        export_extras=False,
        export_apply=True,
        export_yup=True,
        export_lights=False,
        export_cameras=False,
        export_image_format="JPEG",  # raw intermediate; asset:build re-encodes to WebP
    )
    root.location = saved
    return path


def export_all():
    return [export_prop(name) for name in PROPS]
