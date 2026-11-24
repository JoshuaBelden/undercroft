"""Undercroft wardrobe: the explorer's bodies, faces, hair and clothes, built with MPFB.

Every player is drawn as one explorer they dress (see docs/dev/player.md#the-look): a body (male
or female) with one of its faces, a hair style and clothes. This script builds all of it from the
MakeHuman assets in MPFB (Blender's MakeHuman add-on), so the art can be rebuilt from scratch:

- `art/export/player/body-<body>.glb`: the body, skinned to MPFB's Mixamo rig (the bone names the
  game's clips use), with its eyes, eyebrows, eyelashes and boots, a shape key per face, and a
  `_HIDE` vertex attribute: per vertex, a bit for each garment that covers it (the game collapses
  the body under what is worn, so it never shows through).
- `art/export/player/<body>/<garment>.glb`: each hair style and garment, fitted to that body and
  skinned to its rig, with the same face shape keys where a face moves it (hair).

Needs MPFB (extensions.blender.org) and the CC0 MakeHuman asset packs it loads:
makehuman_system_assets, shirts01, pants01 (docs/dev/asset-pipeline.md#the-wardrobe).

Run inside Blender (an empty scene; it clears it), from the Text Editor or the Blender MCP:

    import sys, importlib
    sys.path.insert(0, r"D:/Code/undercroft/scripts/blender")
    import wardrobe; importlib.reload(wardrobe)
    wardrobe.build("male")      # make the body, its faces and its wardrobe in the scene
    wardrobe.export("male")     # write art/export/player/body-male.glb and male/*.glb
    wardrobe.build_all()        # both bodies, built and exported; then `pnpm asset:build`

The clips are not here: the build retargets the explorer's clips onto each body's rig.
"""

import glob
import os

import bmesh
import bpy
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXPORT = os.path.join(ROOT, "art", "export", "player")

# MakeHuman macro sliders, 0..1. Ethnicity is an even mix; skin tone is the player's choice.
RACE = {"african": 0.33, "asian": 0.33, "caucasian": 0.34}
BODIES = {
    "male": {
        "macro": {"gender": 1.0, "age": 0.5, "muscle": 0.6, "weight": 0.5, "height": 0.5,
                  "proportions": 0.6, "cupsize": 0.5, "firmness": 0.5},
        "skin": "young_caucasian_male",
        "eyebrows": "eyebrow001",
        "eyelashes": "eyelashes01",
    },
    "female": {
        "macro": {"gender": 0.0, "age": 0.5, "muscle": 0.55, "weight": 0.5, "height": 0.5,
                  "proportions": 0.6, "cupsize": 0.45, "firmness": 0.6},
        "skin": "young_caucasian_female",
        "eyebrows": "eyebrow002",
        "eyelashes": "eyelashes02",
    },
}

# Always worn, part of the body file.
EYES = "low-poly"
BOOTS = "shoes01"

# The wardrobe: id -> (MPFB asset kind, asset name). Every body gets every piece, fitted to it.
# The order is fixed: a piece's place in it is its `_HIDE` bit (the boots take bit 0).
WEAR = {
    "hair-short": ("hair", "short02"),
    "hair-bob": ("hair", "bob02"),
    "hair-ponytail": ("hair", "ponytail01"),
    "hair-long": ("hair", "long01"),
    "hair-afro": ("hair", "afro01"),
    "shirt": ("clothes", "namuhekam_male_polo_shirt"),
    "pants-cargo": ("clothes", "cortu_cargo_pants"),
    "pants-wool": ("clothes", "toigo_wool_pants"),
    # No CC0 jacket exists in the MakeHuman packs: the sweater is the outer layer for now.
    "jacket-sweater": ("clothes", "toigo_fisherman_sweater"),
}
# Hair covers nothing of the body; clothes and boots hide what is under them.
HIDES = {"shirt", "pants-cargo", "pants-wool", "jacket-sweater"}

# The faces after each body's own (face 0): MakeHuman face targets and how far each goes, 0..1.
# Each becomes a shape key `face-<n>` on the body and on everything fitted to the head. Kept to
# the face and head shape: the eyes stay where they are. Pulling the nose tip down drags the
# lips' colour onto it, so no face does.
FACES = {
    "male": [
        # Broad and square: wide jaw and chin, a wide flat nose, a thick neck.
        {"head/head-square": 1.0, "chin/chin-width-incr": 1.0, "chin/chin-prominent-incr": 0.6,
         "nose/nose-scale-horiz-incr": 0.8, "nose/nose-flaring-incr": 0.7, "nose/nose-compression-compress": 0.5,
         "mouth/mouth-scale-horiz-incr": 0.6, "neck/neck-scale-horiz-incr": 0.6,
         "cheek/l-cheek-bones-incr": 0.5, "cheek/r-cheek-bones-incr": 0.5},
        # Long and gaunt: a long head, a long hooked nose, hollow cheeks, a long chin.
        {"head/head-oval": 1.0, "head/head-scale-horiz-decr": 0.5, "nose/nose-scale-vert-incr": 1.0,
         "nose/nose-hump-incr": 1.0, "chin/chin-height-incr": 0.9,
         "cheek/l-cheek-inner-decr": 0.8, "cheek/r-cheek-inner-decr": 0.8, "mouth/mouth-scale-vert-decr": 0.5},
        # Round and soft: full cheeks, a button nose, a small chin, full lips.
        {"head/head-round": 1.0, "head/head-fat-incr": 0.8, "cheek/l-cheek-volume-incr": 1.0,
         "cheek/r-cheek-volume-incr": 1.0, "nose/nose-volume-incr": 0.6, "nose/nose-scale-vert-decr": 0.6,
         "nose/nose-point-up": 0.6, "chin/chin-prominent-decr": 0.7, "mouth/mouth-lowerlip-volume-incr": 0.8,
         "mouth/mouth-upperlip-volume-incr": 0.6},
        # Rugged: a jutting jaw, a heavy brow, high cheekbones, a broken nose, a thin mouth.
        {"chin/chin-prognathism-incr": 0.8, "chin/chin-bones-incr": 0.8, "head/head-rectangular": 0.8,
         "nose/nose-flaring-incr": 1.0, "nose/nose-point-width-incr": 0.8, "nose/nose-greek-decr": 0.8,
         "cheek/l-cheek-bones-incr": 1.0, "cheek/r-cheek-bones-incr": 1.0, "eyebrows/eyebrows-trans-down": 0.8,
         "eyebrows/eyebrows-angle-down": 0.6, "mouth/mouth-scale-horiz-decr": 0.5,
         "mouth/mouth-lowerlip-volume-decr": 0.6, "mouth/mouth-upperlip-volume-decr": 0.6},
    ],
    "female": [
        # Heart-shaped: a pointed chin, a small narrow nose, full lips, high cheekbones.
        {"head/head-invertedtriangular": 1.0, "chin/chin-width-decr": 0.8, "chin/chin-triangle": 0.6,
         "nose/nose-scale-horiz-decr": 0.7, "nose/nose-point-up": 0.5, "mouth/mouth-upperlip-volume-incr": 0.9,
         "mouth/mouth-lowerlip-volume-incr": 0.8, "cheek/l-cheek-bones-incr": 0.7, "cheek/r-cheek-bones-incr": 0.7},
        # Round: full cheeks, a snub nose, a soft chin.
        {"head/head-round": 1.0, "head/head-fat-incr": 0.6, "cheek/l-cheek-volume-incr": 1.0,
         "cheek/r-cheek-volume-incr": 1.0, "nose/nose-point-up": 0.9, "nose/nose-scale-vert-decr": 0.7,
         "nose/nose-volume-incr": 0.4, "chin/chin-prominent-decr": 0.6, "mouth/mouth-scale-horiz-decr": 0.4},
        # Long and angular: a long head, a strong aquiline nose, sharp cheekbones, a long chin.
        {"head/head-oval": 1.0, "head/head-scale-horiz-decr": 0.4, "nose/nose-hump-incr": 1.0,
         "nose/nose-scale-vert-incr": 0.8, "cheek/l-cheek-bones-incr": 1.0,
         "cheek/r-cheek-bones-incr": 1.0, "cheek/l-cheek-inner-decr": 0.6, "cheek/r-cheek-inner-decr": 0.6,
         "chin/chin-height-incr": 0.8},
        # Strong and square: a wide jaw, a broad nose, a low brow, a wide mouth.
        {"head/head-square": 1.0, "chin/chin-width-incr": 0.9, "chin/chin-prominent-incr": 0.5,
         "nose/nose-flaring-incr": 0.9, "nose/nose-scale-horiz-incr": 0.7, "eyebrows/eyebrows-trans-down": 0.6,
         "mouth/mouth-scale-horiz-incr": 0.6, "mouth/mouth-cupidsbow-incr": 0.7, "neck/neck-scale-horiz-incr": 0.4},
    ],
}
HIDE_BITS = {"boots": 0, **{wid: i + 1 for i, wid in enumerate(WEAR)}}
# Pieces worn under others, and the pieces over them: where one over it covers it, it isn't drawn.
UNDER = {
    "pants-cargo": ["shirt", "jacket-sweater"],
    "pants-wool": ["shirt", "jacket-sweater"],
}

# A piece a face moves less than this (m) gets no shape key for it: refitting's own noise.
MOVED = 5e-4

# Body vertices this close (m) under a garment's surface are covered by it.
COVER = 0.03


def mpfb():
    from bl_ext.blender_org.mpfb.services import LocationService
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService

    return LocationService, HumanService, TargetService


def asset(kind, name, ext):
    LocationService, _, _ = mpfb()
    found = glob.glob(os.path.join(LocationService.get_user_data(), kind, name, "*." + ext))
    if not found:
        raise FileNotFoundError(f"MPFB has no {kind} {name}: load its asset pack")
    return found[0]


def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def basemesh(body):
    return bpy.data.objects[f"body-{body}"]


def rig(body):
    return bpy.data.objects[f"rig-{body}"]


def piece(body, name):
    """The fitted copy of an MPFB asset on this body (MPFB names it `<basemesh>.<asset>`)."""
    return bpy.data.objects[f"body-{body}.{name}"]


def build(body):
    """Make the body, its always-worn parts and every wardrobe piece, fitted, in an empty scene."""
    _, HumanService, _ = mpfb()
    spec = BODIES[body]
    clear()
    bm = HumanService.create_human(macro_detail_dict={**spec["macro"], "race": dict(RACE)})
    bm.name = f"body-{body}"
    armature = HumanService.add_builtin_rig(bm, "mixamo", import_weights=True)
    armature.name = f"rig-{body}"
    HumanService.set_character_skin(asset("skins", spec["skin"], "mhmat"), bm, skin_type="GAMEENGINE")
    parts = [
        ("eyes", EYES, "Eyes"),
        ("eyebrows", spec["eyebrows"], "Eyebrows"),
        ("eyelashes", spec["eyelashes"], "Eyelashes"),
        ("clothes", BOOTS, "Clothes"),
    ]
    parts += [(kind, name, "Hair" if kind == "hair" else "Clothes") for kind, name in WEAR.values()]
    for kind, name, atype in parts:
        HumanService.add_mhclo_asset(
            asset(kind, name, "mhclo"), bm, asset_type=atype, subdiv_levels=0, material_type="MAKESKIN"
        )
    select_only(bm)
    bpy.ops.mpfb.bake_shapekeys()
    make_faces(body)
    return bm


def select_only(obj):
    bpy.context.view_layer.objects.active = obj
    for other in bpy.context.view_layer.objects:
        other.select_set(other == obj)


def fitted(body):
    """The body's mesh and every piece fitted to it."""
    return [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(f"body-{body}")]


def make_faces(body):
    """
    Each face in FACES as a shape key `face-<n>` (n from 1) on the body and on every piece its
    targets move once refitted (eyes, brows, lashes, hair). The body is left with its own face.
    """
    LocationService, HumanService, TargetService = mpfb()
    bm = basemesh(body)
    targets = os.path.join(LocationService.get_mpfb_data(), "targets")
    if not bm.data.shape_keys:
        bm.shape_key_add(name="Basis")
    objects = fitted(body)
    neutral = {o.name: [v.co.copy() for v in o.data.vertices] for o in objects if o != bm}
    shapes = {}
    for n, face in enumerate(FACES[body], start=1):
        loaded = []
        for target, weight in face.items():
            path = os.path.join(targets, *target.split("/")) + ".target.gz"
            keys = bm.data.shape_keys
            before = {k.name for k in keys.key_blocks} if keys else set()
            TargetService.load_target(bm, path, weight=weight)
            loaded += [k.name for k in bm.data.shape_keys.key_blocks if k.name not in before]
        HumanService.refit(bm)
        key = bm.shape_key_add(name=f"face-{n}", from_mix=True)
        key.value = 0.0
        for o in objects:
            if o != bm:
                shapes.setdefault(o.name, {})[n] = [v.co.copy() for v in o.data.vertices]
        for name in loaded:
            bm.shape_key_remove(bm.data.shape_keys.key_blocks[name])
    HumanService.refit(bm)
    for o in objects:
        if o == bm:
            continue
        rest = neutral[o.name]
        for i, v in enumerate(o.data.vertices):
            v.co = rest[i]
        moved = {n: co for n, co in shapes.get(o.name, {}).items()
                 if max((a - b).length for a, b in zip(co, rest)) > MOVED}
        if not moved:
            continue
        if not o.data.shape_keys:
            o.shape_key_add(name="Basis")
        for n, co in moved.items():
            key = o.shape_key_add(name=f"face-{n}")
            for i, c in enumerate(co):
                key.data[i].co = c


def covered(body_obj, garment):
    """Indices of the body's vertices under the garment's surface, less a ring at its edges."""
    deps = bpy.context.evaluated_depsgraph_get()
    g = garment.evaluated_get(deps)
    gm = g.to_mesh()
    tree = BVHTree.FromPolygons(
        [g.matrix_world @ v.co for v in gm.vertices], [p.vertices[:] for p in gm.polygons]
    )
    g.to_mesh_clear()
    under = set()
    me = body_obj.data
    for v in me.vertices:
        co = body_obj.matrix_world @ v.co
        hit, normal, _, dist = tree.find_nearest(co)
        if hit is None or dist > COVER:
            continue
        # Behind the cloth (its normal points away from the body), or right against it.
        if (co - hit).dot(normal) < 0 or dist < 0.005:
            under.add(v.index)
    # Let the ring at the garment's edges show, so a hem never opens a gap.
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    edge = {i for i in under if any(e.other_vert(bm.verts[i]).index not in under for e in bm.verts[i].link_edges)}
    bm.free()
    return under - edge


def mark_hidden(body):
    """Write `_HIDE` on the body: per vertex, the bits of every garment covering it."""
    bm = basemesh(body)
    bits = [0] * len(bm.data.vertices)
    for wid, bit in HIDE_BITS.items():
        if wid != "boots" and wid not in HIDES:
            continue
        name = BOOTS if wid == "boots" else WEAR[wid][1]
        for i in covered(bm, piece(body, name)):
            bits[i] |= 1 << bit
    attr = bm.data.attributes.get("_HIDE") or bm.data.attributes.new("_HIDE", "FLOAT", "POINT")
    attr.data.foreach_set("value", [float(b) for b in bits])


def mark_layers(body):
    """
    Write `_HIDE` on each piece worn under others (`UNDER`): per vertex, the bits of every piece
    over it that covers it, so a waistband never pokes through a hem.
    """
    for wid, overs in UNDER.items():
        under = piece(body, WEAR[wid][1])
        bits = [0] * len(under.data.vertices)
        for over in overs:
            for i in covered(under, piece(body, WEAR[over][1])):
                bits[i] |= 1 << HIDE_BITS[over]
        attr = under.data.attributes.get("_HIDE") or under.data.attributes.new("_HIDE", "FLOAT", "POINT")
        attr.data.foreach_set("value", [float(b) for b in bits])


def strip_helpers(body):
    """
    Delete MakeHuman's helper geometry (and the masks that hid it), keeping the shape keys. Not
    MPFB's own delete_helpers: it rebuilds the mesh from its targets, which unbakes the body and
    drops the face keys.
    """
    bm = basemesh(body)
    groups = {g.index for g in bm.vertex_groups if g.name in ("HelperGeometry", "JointCubes")}
    mesh = bmesh.new()
    mesh.from_mesh(bm.data)
    deform = mesh.verts.layers.deform.active
    helpers = [v for v in mesh.verts if any(i in v[deform] for i in groups)]
    bmesh.ops.delete(mesh, geom=helpers, context="VERTS")
    mesh.to_mesh(bm.data)
    mesh.free()
    for mod in list(bm.modifiers):
        if mod.type == "MASK":
            bm.modifiers.remove(mod)


def mark_alpha(body):
    """
    Tag each material with how its alpha is drawn, read by the asset build (`alpha` extra): MPFB
    makes every material alpha-blended, which in a game sorts badly (the skin turns see-through in
    patches, the body shows through clothes). Hair, brows and lashes are cut out (`MASK`); the
    rest is opaque, and the skin single-sided.
    """
    spec = BODIES[body]
    cutout = {spec["eyebrows"], spec["eyelashes"]} | {name for kind, name in WEAR.values() if kind == "hair"}
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.name.startswith(f"body-{body}"):
            continue
        asset = obj.name.split(".", 1)[1] if "." in obj.name else None
        for slot in obj.material_slots:
            if slot.material:
                slot.material["alpha"] = "MASK" if asset in cutout else "OPAQUE"
                slot.material["double_sided"] = asset is not None


def export_objects(path, objects, armature):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for obj in bpy.context.view_layer.objects:
        obj.select_set(obj in objects or obj == armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=path,
        use_selection=True,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_morph=True,
        export_morph_normal=False,
        export_attributes=True,
        export_animations=False,
        export_def_bones=False,
        export_image_format="AUTO",
        export_extras=True,
    )


def export(body):
    """Write the body file and one file per wardrobe piece (see the module docstring)."""
    strip_helpers(body)
    mark_hidden(body)
    mark_layers(body)
    mark_alpha(body)
    spec = BODIES[body]
    armature = rig(body)
    whole = [basemesh(body)] + [piece(body, n) for n in (EYES, spec["eyebrows"], spec["eyelashes"], BOOTS)]
    export_objects(os.path.join(EXPORT, f"body-{body}.glb"), whole, armature)
    for wid, (_, name) in WEAR.items():
        export_objects(os.path.join(EXPORT, body, f"{wid}.glb"), [piece(body, name)], armature)


def build_all():
    for body in BODIES:
        build(body)
        export(body)
