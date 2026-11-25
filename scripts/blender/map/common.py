"""Shared helpers for the fixed map's rooms (docs/dev/room-viewer.md, docs/handoff-pivot.md).

Each room is its own .blend (art/blender/rooms/<room>.blend), built once by its script in this
folder and then edited by hand, and exported to art/export/rooms/<room>.glb for the room viewer.
Markers follow the kit's conventions (docs/dev/asset-pipeline.md#conventions-1); rooms are not on
the generator's grid, so there is no footprint and no sockets on a cell edge.

Builds reuse the kit's mesh tools (kit.py: MeshBuilder, col_box, marker...). Grey-box materials
are flat colours named by use (mat-sewer-wall), so texturing a room later is a change to its
material, not to its geometry.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import kit  # noqa: E402

REPO = kit.REPO
BLEND_DIR = os.path.join(kit.ART, "blender", "rooms")
EXPORT_DIR = os.path.join(kit.EXPORT, "rooms")


def add_materials(specs):
    """Register a room's materials with the kit's (`kit.get_material` reads them)."""
    kit.MATERIALS.update(specs)


def emissive_material(name, colour, strength):
    """A surface that gives light (daylight down a shaft): for the bake, and seen as bright in game."""
    kit.MATERIALS.setdefault(name, {"color": colour, "roughness": 1.0})
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_backface_culling = True
    if hasattr(mat, "use_nodes") and not mat.use_nodes:
        mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Emission Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def empty_scene():
    """Start from nothing: the factory scene's cube, camera and light go."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)


def room_collection(name):
    coll = bpy.data.collections.get(name)
    if coll:
        raise RuntimeError(f"'{name}' is already in this file; build into a new file")
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "PLAIN_AXES"
    coll.objects.link(root)
    return coll, root


def facing(direction):
    """The turn about Z that points an empty's local +Y (the game's facing) along (dx, dy)."""
    dx, dy = direction
    return math.atan2(-dx, dy)


def marker(coll, root, name, loc, toward=None, **props):
    """A marker empty, turned to face `toward` (a 2D direction) when it faces a way."""
    e = kit.marker(coll, root, name, loc)
    if toward is not None:
        e.rotation_euler = (0, 0, facing(toward))
    for key, value in props.items():
        e[key] = value
    return e


def col(coll, root, name, centre, size, yaw=0.0, pitch=0.0):
    """A collision box: centre, full size, turned `yaw` about Z and `pitch` about X (a ramp)."""
    cx, cy, cz = centre
    sx, sy, sz = size
    obj = kit.col_box(coll, root, name, (-sx / 2, -sy / 2, -sz / 2), (sx / 2, sy / 2, sz / 2))
    obj.location = (cx, cy, cz)
    obj.rotation_euler = (pitch, 0, yaw)
    return obj


def col_span(coll, root, name, lo, hi):
    return kit.col_box(coll, root, name, lo, hi)


def sweep(mb, profile, frames, skip=lambda ring, seg: False, profiles=None):
    """Extrude a closed cross-section along frames, faces pointing into the passage.

    profile: [(lateral, z, material)], each point starting a segment that runs to the next (the
    last runs back to the first). Lateral is to the right of the way the frames run. `skip(ring,
    seg)` leaves out the quad between rings `ring` and `ring + 1` on segment `seg`: a hole in a
    wall, for a doorway or a shaft. `profiles`: one [(lateral, z)] per frame, the same number of
    points as `profile` (whose materials they keep), for a cross-section that changes as it goes
    (a crack, narrowing and widening).
    """
    up = Vector((0, 0, 1))
    n = len(profile)
    lengths = [0.0]
    for j in range(n):
        (x0, z0, _), (x1, z1, _) = profile[j], profile[(j + 1) % n]
        lengths.append(lengths[-1] + math.hypot(x1 - x0, z1 - z0))
    axis_z = sum(z for _, z, _ in profile) / n
    shapes = profiles or [[(x, z) for x, z, _ in profile]] * len(frames)
    rings = [[o + lat * x + up * z for x, z in shapes[i]] for i, (o, lat, _) in enumerate(frames)]
    for i in range(len(frames) - 1):
        o0, _, d0 = frames[i]
        o1, _, d1 = frames[i + 1]
        axis = (o0 + o1) / 2 + up * axis_z
        for j in range(n):
            if skip(i, j):
                continue
            k = (j + 1) % n
            mat = profile[j][2]
            tile = kit.tile_of(mat)
            quad = [rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]]
            centre = sum(quad, Vector()) / 4
            uvs = [
                (d0 / tile, lengths[j] / tile),
                (d0 / tile, lengths[j + 1] / tile),
                (d1 / tile, lengths[j + 1] / tile),
                (d1 / tile, lengths[j] / tile),
            ]
            mb.face(quad, mat, facing=axis - centre, uvs=uvs)
    return rings


def polyline_frames(points, breaks=(), step=1.0):
    """Frames along a horizontal polyline, a ring at least every `step` m and at every distance
    in `breaks` (measured along it), so a hole's edges fall on rings."""
    pts = [Vector(p) for p in points]
    total = sum((pts[i + 1] - pts[i]).length for i in range(len(pts) - 1))
    stops = {0.0, total}
    at = 0.0
    for i in range(len(pts) - 1):
        seg = (pts[i + 1] - pts[i]).length
        count = max(1, math.ceil(seg / step))
        for k in range(count + 1):
            stops.add(round(at + seg * k / count, 4))
        at += seg
    stops.update(b for b in breaks if 0 < b < total)
    frames = []
    for s in sorted(stops):
        frames.append(_frame_at(pts, s))
    return frames


def _frame_at(pts, s):
    """The point `s` m along the polyline, its right-hand lateral (mitred at corners), and s."""
    up = Vector((0, 0, 1))
    at = 0.0
    for i in range(len(pts) - 1):
        seg = (pts[i + 1] - pts[i]).length
        if s <= at + seg + 1e-6 or i == len(pts) - 2:
            t = 0.0 if seg == 0 else min(1.0, (s - at) / seg)
            p = pts[i].lerp(pts[i + 1], t)
            fwd = (pts[i + 1] - pts[i]).normalized()
            # On a corner, the mitre: halfway between the two directions, longer to keep the width.
            if t >= 1.0 - 1e-6 and i + 2 < len(pts):
                nxt = (pts[i + 2] - pts[i + 1]).normalized()
                mid = (fwd + nxt).normalized()
                lateral = mid.cross(up).normalized() / max(0.5, fwd.dot(mid))
            elif t <= 1e-6 and i > 0:
                prv = (pts[i] - pts[i - 1]).normalized()
                mid = (prv + fwd).normalized()
                lateral = mid.cross(up).normalized() / max(0.5, fwd.dot(mid))
            else:
                lateral = fwd.cross(up).normalized()
            return (p, lateral, s)
        at += seg
    raise ValueError("past the end of the polyline")


def inward_box(mb, lo, hi, mat, skip=()):
    """A room or passage as a box seen from inside: every face points in."""
    mb.box(lo, hi, mat, skip=skip, inward=True)


def wall_with_hole(mb, a, b, z0, z1, mat, inside, holes):
    """A vertical wall from a to b (xy) seen from the `inside` side, with rectangular holes
    [(s0, s1, h0, h1)] measured along it from a and up from z0."""
    a = Vector((a[0], a[1], 0))
    b = Vector((b[0], b[1], 0))
    along = (b - a).normalized()
    length = (b - a).length
    cuts = sorted({0.0, length, *[h[0] for h in holes], *[h[1] for h in holes]})
    for s0, s1 in zip(cuts, cuts[1:]):
        bands = [(z0, z1)]
        for h in holes:
            if h[0] <= s0 + 1e-6 and s1 <= h[1] + 1e-6:
                bands = [(z0, z0 + h[2]), (z0 + h[3], z1)]
        for za, zb in bands:
            if zb - za < 1e-6:
                continue
            p0, p1 = a + along * s0, a + along * s1
            pts = [p0 + Vector((0, 0, za)), p1 + Vector((0, 0, za)), p1 + Vector((0, 0, zb)), p0 + Vector((0, 0, zb))]
            mb.face(pts, mat, facing=inside)


def save_blend(name):
    os.makedirs(BLEND_DIR, exist_ok=True)
    path = os.path.join(BLEND_DIR, name + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=path)
    return path


LIGHTMAP_UV = "Lightmap"
# Textures at the size the game ships them (`pnpm asset:build`'s map pieces): the export is small
# and the room viewer shows what players will see.
EXPORT_TEXTURE = 1024


def lightmap_uv(obj, margin=0.004):
    """A second UV map for the baked light: every face its own place on the page (Smart UV
    Project), apart enough that light doesn't bleed between them. The first stays the textures'."""
    mesh = obj.data
    if LIGHTMAP_UV not in mesh.uv_layers:
        mesh.uv_layers.new(name=LIGHTMAP_UV)
    mesh.uv_layers.active = mesh.uv_layers[LIGHTMAP_UV]
    mesh.uv_layers[0].active_render = True
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=margin, area_weight=1.0)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake_lightmap(obj, path, size=1024, samples=1024):
    """Bake the light falling on `obj` (direct and bounced, without its colour) into its
    lightmap UV, and save it as a PNG at `path`. The game multiplies it by each surface's colour
    (Three.js `lightMap`, docs/dev/room-viewer.md#lightmaps). Lights, emissive surfaces and the
    world light it; colliders and markers don't render, so they don't shade it."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    # No sky: underground, the only light is the room's own lamps and glowing surfaces.
    if scene.world is None:
        scene.world = bpy.data.worlds.new("underground")
    scene.world.use_nodes = True
    background = next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND")
    background.inputs["Strength"].default_value = 0.0
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 8
    image = bpy.data.images.get(obj.name + "-lightmap") or bpy.data.images.new(
        obj.name + "-lightmap", size, size, float_buffer=True
    )
    if tuple(image.size) != (size, size):
        image.scale(size, size)
    mesh = obj.data
    mesh.uv_layers.active = mesh.uv_layers[LIGHTMAP_UV]
    added = []
    for mat in mesh.materials:
        nodes = mat.node_tree.nodes
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        nodes.active = node
        added.append((mat, node))
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True)
    for mat, node in added:
        mat.node_tree.nodes.remove(node)
    mesh.uv_layers.active = mesh.uv_layers[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    pixels = image.pixels[:]
    # The brightest light (not alpha): over 1 is clipped in the PNG, so keep the bake under it.
    peak = max(max(pixels[0::4]), max(pixels[1::4]), max(pixels[2::4]))
    return path, peak


def export_room(name):
    """art/export/rooms/<room>.glb, with custom properties as extras (rope lengths, keys...) and
    both UV maps (textures, then the lightmap's)."""
    for image in bpy.data.images:
        w, h = image.size
        if image.source == "FILE" and max(w, h) > EXPORT_TEXTURE:
            # Only in this session: the .blend keeps the full-size files it points at.
            image.scale(min(w, EXPORT_TEXTURE), min(h, EXPORT_TEXTURE))
    os.makedirs(EXPORT_DIR, exist_ok=True)
    layer = kit._find_layer_collection(bpy.context.view_layer.layer_collection, name)
    bpy.context.view_layer.active_layer_collection = layer
    path = os.path.join(EXPORT_DIR, name + ".glb")
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
