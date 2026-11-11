"""Undercroft item models (weapons, ammo, consumables).

Bootstraps simple low-poly item models inside the kit .blend. Like the map pieces, the .blend is
the source of truth once they exist: building skips any item collection that already exists
unless force=True, so hand edits are kept.

Run inside Blender (Text Editor or the Blender MCP):

    import sys, importlib
    sys.path.insert(0, r"D:/Code/undercroft/scripts/blender")
    import kit, items; importlib.reload(kit); importlib.reload(items)
    items.build_all()            # build items that don't exist yet
    items.export_all()           # write art/export/items/<id>.glb

Conventions (see docs/dev/asset-pipeline.md and docs/dev/items.md):
- 1 unit = 1 m. Each item lives in a collection `item-<id>` under a root empty of the same name.
- Origin at the grip (where the hand holds it). Barrel or blade points along +Y (forward in
  the game), up is +Z.
"""

import math
import os

import bmesh
import bpy

import kit

EXPORT = os.path.join(kit.EXPORT, "items")

# Plain PBR materials (no textures): name -> base color, roughness, metallic.
MATERIALS = {
    "mat-item-steel": ((0.42, 0.42, 0.44), 0.35, 0.9),
    "mat-item-dark-steel": ((0.08, 0.08, 0.09), 0.45, 0.85),
    "mat-item-rust": ((0.28, 0.13, 0.07), 0.8, 0.4),
    "mat-item-wood": ((0.22, 0.12, 0.06), 0.65, 0.0),
    "mat-item-grip": ((0.04, 0.035, 0.03), 0.8, 0.0),
    "mat-item-brick": ((0.42, 0.17, 0.11), 0.92, 0.0),
    "mat-item-brass": ((0.6, 0.45, 0.18), 0.35, 0.9),
    "mat-item-card": ((0.48, 0.4, 0.28), 0.85, 0.0),
    "mat-item-card-red": ((0.4, 0.07, 0.05), 0.8, 0.0),
    "mat-item-cloth": ((0.78, 0.74, 0.66), 0.95, 0.0),
    "mat-item-glass": ((0.18, 0.09, 0.03), 0.15, 0.0),
}

ITEMS = [
    "knife",
    "crowbar",
    "brick",
    "revolver",
    "shotgun",
    "ammo-revolver",
    "ammo-shotgun",
    "bandage",
    "salts",
]


def material(name):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    color, roughness, metallic = MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.use_backface_culling = True
    if hasattr(mat, "use_nodes") and not mat.use_nodes:
        mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


# ---------------------------------------------------------------------------
# Building blocks: each makes one mesh object parented to the item's root.


def _object(coll, root, name, bm, mat):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material(mat))
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.parent = root
    return obj


def box(coll, root, name, center, size, mat, rot_x=0.0):
    """Axis-aligned box (size = full extents), optionally tilted about X (radians)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if rot_x:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=_rot_x(rot_x), verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    return _object(coll, root, name, bm, mat)


def cylinder(coll, root, name, a, b, radius, mat, segments=10, radius_b=None):
    """Cylinder (or cone) between points a and b."""
    bm = bmesh.new()
    length = math.dist(a, b)
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        segments=segments,
        radius1=radius,
        radius2=radius if radius_b is None else radius_b,
        depth=length,
    )
    # Created along Z centred at the origin: orient it from a to b.
    d = [b[i] - a[i] for i in range(3)]
    from mathutils import Vector

    rot = Vector((0, 0, 1)).rotation_difference(Vector(d).normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    mid = [(a[i] + b[i]) / 2 for i in range(3)]
    bmesh.ops.translate(bm, vec=mid, verts=bm.verts)
    return _object(coll, root, name, bm, mat)


def blade(coll, root, name, y0, y1, width, thickness, mat):
    """Single-edged blade from y0 to a point at y1: spine on top (+Z), edge below."""
    bm = bmesh.new()
    t = thickness / 2
    # Cross-section: spine (top) thick, edge (bottom) thin. Tip pulls up toward the spine.
    pts = [
        (y0, width / 2, t),
        (y0, -width / 2, 0.0003),
        (y1 - width * 0.6, -width * 0.25, 0.0003),
        (y1, width * 0.35, 0.0003),
        (y1 - width * 0.4, width / 2, t),
    ]
    top = [bm.verts.new((x_off, y, z)) for (y, z, x_off) in pts]
    bot = [bm.verts.new((-x_off, y, z)) for (y, z, x_off) in pts]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(coll, root, name, bm, mat)


def _rot_x(angle):
    from mathutils import Matrix

    return Matrix.Rotation(angle, 4, "X")


def item_collection(item, force=False):
    name = f"item-{item}"
    coll = kit.piece_collection(name, force=force)
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.1
    root["item"] = item
    coll.objects.link(root)
    return coll, root


# ---------------------------------------------------------------------------
# Items


def build_knife(force=False):
    coll, root = item_collection("knife", force)
    cylinder(coll, root, "knife-handle", (0, -0.085, 0), (0, 0.02, 0), 0.013, "mat-item-wood", 8)
    box(coll, root, "knife-guard", (0, 0.024, 0.002), (0.012, 0.008, 0.05), "mat-item-steel")
    cylinder(coll, root, "knife-pommel", (0, -0.095, 0), (0, -0.085, 0), 0.015, "mat-item-steel", 8)
    blade(coll, root, "knife-blade", 0.028, 0.2, 0.03, 0.004, "mat-item-steel")
    return coll


def build_crowbar(force=False):
    coll, root = item_collection("crowbar", force)
    # Straight shaft, chisel end behind the hand, hook bending up and back at the front.
    cylinder(coll, root, "crowbar-shaft", (0, -0.18, 0), (0, 0.5, 0), 0.012, "mat-item-rust", 6)
    box(coll, root, "crowbar-chisel", (0, -0.2, 0.004), (0.018, 0.05, 0.006), "mat-item-rust", rot_x=0.15)
    prev = (0, 0.5, 0)
    for i in range(1, 7):
        a = math.pi * i / 6
        point = (0, 0.5 + math.sin(a) * 0.05, 0.05 - math.cos(a) * 0.05)
        cylinder(coll, root, f"crowbar-hook-{i}", prev, point, 0.012, "mat-item-rust", 6)
        prev = point
    box(coll, root, "crowbar-claw", (0, 0.47, 0.1), (0.022, 0.05, 0.008), "mat-item-rust", rot_x=-0.3)
    return coll


def build_brick(force=False):
    coll, root = item_collection("brick", force)
    box(coll, root, "brick-body", (0, 0, 0), (0.1025, 0.215, 0.065), "mat-item-brick")
    # A chipped corner so it isn't a perfect box.
    box(coll, root, "brick-chip", (0.04, 0.09, 0.028), (0.03, 0.04, 0.02), "mat-item-brick", rot_x=0.4)
    return coll


def build_revolver(force=False):
    coll, root = item_collection("revolver", force)
    # Grip below and behind the hand position, angled back.
    box(coll, root, "revolver-grip", (0, -0.025, -0.045), (0.028, 0.035, 0.1), "mat-item-wood", rot_x=-0.3)
    box(coll, root, "revolver-frame", (0, 0.03, 0.02), (0.022, 0.09, 0.04), "mat-item-dark-steel")
    cylinder(coll, root, "revolver-drum", (0, 0.02, 0.02), (0, 0.065, 0.02), 0.021, "mat-item-dark-steel", 12)
    cylinder(coll, root, "revolver-barrel", (0, 0.065, 0.032), (0, 0.2, 0.032), 0.008, "mat-item-dark-steel", 10)
    box(coll, root, "revolver-sight", (0, 0.192, 0.043), (0.003, 0.008, 0.008), "mat-item-dark-steel")
    box(coll, root, "revolver-hammer", (0, -0.018, 0.045), (0.008, 0.016, 0.02), "mat-item-dark-steel", rot_x=-0.4)
    box(coll, root, "revolver-trigger", (0, 0.012, -0.012), (0.004, 0.006, 0.02), "mat-item-dark-steel")
    box(coll, root, "revolver-guard", (0, 0.015, -0.026), (0.006, 0.04, 0.004), "mat-item-dark-steel")
    return coll


def build_shotgun(force=False):
    coll, root = item_collection("shotgun", force)
    # Double barrel: stock behind the hand, receiver at it, barrels forward.
    box(coll, root, "shotgun-stock", (0, -0.2, -0.04), (0.04, 0.3, 0.06), "mat-item-wood", rot_x=0.12)
    box(coll, root, "shotgun-wrist", (0, -0.02, -0.01), (0.032, 0.09, 0.04), "mat-item-wood")
    box(coll, root, "shotgun-receiver", (0, 0.07, 0.005), (0.045, 0.1, 0.05), "mat-item-dark-steel")
    for side, x in (("l", -0.011), ("r", 0.011)):
        cylinder(coll, root, f"shotgun-barrel-{side}", (x, 0.12, 0.018), (x, 0.66, 0.018), 0.011, "mat-item-dark-steel", 10)
    box(coll, root, "shotgun-rib", (0, 0.39, 0.031), (0.006, 0.54, 0.004), "mat-item-dark-steel")
    box(coll, root, "shotgun-forend", (0, 0.24, -0.004), (0.04, 0.16, 0.026), "mat-item-wood")
    box(coll, root, "shotgun-trigger", (0, 0.04, -0.03), (0.004, 0.006, 0.02), "mat-item-dark-steel")
    return coll


def build_ammo_revolver(force=False):
    coll, root = item_collection("ammo-revolver", force)
    box(coll, root, "ammo-revolver-box", (0, 0, 0), (0.05, 0.07, 0.03), "mat-item-card")
    for i in range(3):
        cylinder(coll, root, f"ammo-revolver-round-{i}", (-0.015 + i * 0.015, 0.0, 0.015), (-0.015 + i * 0.015, 0.0, 0.028), 0.005, "mat-item-brass", 6)
    return coll


def build_ammo_shotgun(force=False):
    coll, root = item_collection("ammo-shotgun", force)
    box(coll, root, "ammo-shotgun-box", (0, 0, 0), (0.07, 0.1, 0.06), "mat-item-card-red")
    return coll


def build_bandage(force=False):
    coll, root = item_collection("bandage", force)
    cylinder(coll, root, "bandage-roll", (-0.03, 0, 0), (0.03, 0, 0), 0.028, "mat-item-cloth", 12)
    return coll


def build_salts(force=False):
    coll, root = item_collection("salts", force)
    cylinder(coll, root, "salts-bottle", (0, 0, -0.03), (0, 0, 0.02), 0.016, "mat-item-glass", 10)
    cylinder(coll, root, "salts-neck", (0, 0, 0.02), (0, 0, 0.032), 0.008, "mat-item-glass", 8)
    cylinder(coll, root, "salts-cap", (0, 0, 0.032), (0, 0, 0.04), 0.009, "mat-item-steel", 8)
    return coll


BUILDERS = {
    "knife": build_knife,
    "crowbar": build_crowbar,
    "brick": build_brick,
    "revolver": build_revolver,
    "shotgun": build_shotgun,
    "ammo-revolver": build_ammo_revolver,
    "ammo-shotgun": build_ammo_shotgun,
    "bandage": build_bandage,
    "salts": build_salts,
}


def layout_items(spacing=0.8, y=-12.0):
    """Line the items up in the viewport away from the pieces (roots only)."""
    for idx, item in enumerate(ITEMS):
        root = bpy.data.objects.get(f"item-{item}")
        if root:
            root.location = (idx * spacing, y, 0)


def build_all():
    """Build items that don't exist yet. Existing (possibly hand-edited) items are skipped."""
    built = []
    for item in ITEMS:
        try:
            BUILDERS[item]()
            built.append(item)
        except kit.PieceExists:
            print(f"skip item-{item}: already exists")
    layout_items()
    return built


def export_item(item):
    os.makedirs(EXPORT, exist_ok=True)
    name = f"item-{item}"
    root = bpy.data.objects[name]
    saved = root.location.copy()
    root.location = (0, 0, 0)
    layer = kit._find_layer_collection(bpy.context.view_layer.layer_collection, name)
    bpy.context.view_layer.active_layer_collection = layer
    path = os.path.join(EXPORT, item + ".glb")
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
    )
    root.location = saved
    return path


def export_all():
    return [export_item(item) for item in ITEMS]
