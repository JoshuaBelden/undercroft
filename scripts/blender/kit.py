"""Undercroft catacomb kit builder.

Bootstraps the modular map pieces procedurally inside Blender. After the first build, the
.blend file (art/blender/catacomb-kit.blend) is the source of truth and pieces are edited
by hand. Building never overwrites an existing piece collection unless force=True.

Run inside Blender (Text Editor or the Blender MCP):

    import sys, importlib
    sys.path.insert(0, r"D:/Code/undercroft/scripts/blender")
    import kit; importlib.reload(kit)
    kit.build_all()                     # build only pieces that don't exist yet
    kit.build_stairwell(force=True)     # DESTRUCTIVE: regenerate one piece, losing hand edits
    kit.export_all()                    # write art/export/<piece>.glb (non-destructive)

Conventions (see docs/dev/asset-pipeline.md):
- 1 unit = 1 m, grid cell 4 m, level height 4 m. Blender +Y is north.
- Each piece lives in a collection named after it, under a root empty of the same name with
  custom properties footprint_w / footprint_d / levels.
- Marker empties: socket-<type>-<n>, spawn-<n>, extract-<n>. Collision boxes: col-*.
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ART = os.path.join(REPO, "art")
TEXTURES = os.path.join(ART, "textures")
EXPORT = os.path.join(ART, "export")

CELL = 4.0
LEVEL = 4.0
WALL_INSET = 0.25  # room inner wall faces sit this far inside the footprint boundary

# Standard `hall` opening: 2 m wide, vertical sides to the springline, semicircular arch.
HALL_HALF_W = 1.0
HALL_SPRING = 1.8  # apex = 2.8 m

# Material name -> texture set (art/textures/<set>_4K-JPG) and metres per texture repeat.
MATERIALS = {
    "mat-floor-start": {"set": "Tiles133D", "tile": 2.0},
    "mat-floor-tunnel": {"set": "Tiles093", "tile": 2.0},
    "mat-wall-tunnel": {"set": "Rock061", "tile": 2.5},
    "mat-floor-ossuary": {"set": "PavingStones127", "tile": 2.0},
    "mat-wall-ossuary": {"set": "Road015C", "tile": 2.5},
    "mat-trim-marble": {"set": "Marble023", "tile": 1.5},
    "mat-door-metal": {"set": "MetalPlates013", "tile": 2.0},
    "mat-bone": {"color": (0.66, 0.58, 0.45), "roughness": 0.8, "vertex_color": True},
    "mat-wall-start": {"set": "Rock061", "tile": 2.5},
    "mat-floor-quarry": {"set": "Rock061", "tile": 3.5},
    "mat-wall-quarry": {"set": "Rock061", "tile": 3.0},
    "mat-floor-cistern": {"set": "PavingStones127", "tile": 2.0},
    "mat-wall-cistern": {"set": "Road015C", "tile": 2.5},
    "mat-basin": {"set": "Rock061", "tile": 2.5},
    "mat-column-marble": {"set": "Marble023", "tile": 1.5},
    "mat-water": {"color": (0.015, 0.035, 0.035), "roughness": 0.04, "alpha": 0.88},
    "mat-floor-chapel": {"set": "Marble023", "tile": 2.0},
    "mat-wall-chapel": {"set": "Road015C", "tile": 2.5},
}

PIECES = [
    "hall-straight",
    "hall-corner",
    "hall-tee",
    "hall-cross",
    "hall-dead-end",
    "hall-stairs-down",
    "hall-crawl",
    "hall-squeeze",
    "hall-side-room",
    "room-small",
    "room-crypt",
    "cap-hall",
    "stairwell",
    "ossuary-hall",
    "quarry-gallery",
    "cistern",
    "gloaming-chapel",
]


# ---------------------------------------------------------------------------
# Materials


def _image(path, colorspace):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def get_material(name):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    spec = MATERIALS[name]
    mat = bpy.data.materials.new(name)
    # Single-sided: exports as doubleSided=false, and lets you see into pieces from outside.
    mat.use_backface_culling = True
    if hasattr(mat, "use_nodes") and not mat.use_nodes:
        mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.location = (300, 0)

    if "set" in spec:
        base = os.path.join(TEXTURES, f"{spec['set']}_4K-JPG", f"{spec['set']}_4K-JPG_")

        def tex(kind, colorspace, y):
            path = base + kind + ".jpg"
            if not os.path.exists(path):
                return None
            node = nt.nodes.new("ShaderNodeTexImage")
            node.image = _image(path, colorspace)
            node.location = (-400, y)
            return node

        color = tex("Color", "sRGB", 300)
        if color:
            nt.links.new(color.outputs["Color"], bsdf.inputs["Base Color"])
        rough = tex("Roughness", "Non-Color", 0)
        if rough:
            nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
        metal = tex("Metalness", "Non-Color", -300)
        if metal:
            nt.links.new(metal.outputs["Color"], bsdf.inputs["Metallic"])
        else:
            bsdf.inputs["Metallic"].default_value = 0.0
        normal = tex("NormalGL", "Non-Color", -600)
        if normal:
            nmap = nt.nodes.new("ShaderNodeNormalMap")
            nmap.location = (0, -600)
            nt.links.new(normal.outputs["Color"], nmap.inputs["Color"])
            nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        bsdf.inputs["Base Color"].default_value = (*spec["color"], 1.0)
        bsdf.inputs["Roughness"].default_value = spec["roughness"]
        bsdf.inputs["Metallic"].default_value = 0.0
        if "alpha" in spec:
            bsdf.inputs["Alpha"].default_value = spec["alpha"]
            # Exported as alphaMode BLEND.
            for attr, value in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
                try:
                    setattr(mat, attr, value)
                except (AttributeError, TypeError):
                    pass
        if spec.get("vertex_color"):
            attr = nt.nodes.new("ShaderNodeVertexColor")
            attr.layer_name = "Color"
            attr.location = (-400, 300)
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.location = (-100, 300)
            mix.inputs["Factor"].default_value = 1.0
            mix.inputs["A"].default_value = (*spec["color"], 1.0)
            nt.links.new(attr.outputs["Color"], mix.inputs["B"])
            nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    return mat


def tile_of(mat_name):
    return MATERIALS[mat_name].get("tile", 1.0)


# ---------------------------------------------------------------------------
# Mesh building


class MeshBuilder:
    """Accumulates faces with per-face material and UVs, then welds into one object."""

    def __init__(self, name, colors=False):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.color = self.bm.loops.layers.color.new("Color") if colors else None
        self.materials = []

    def _mat_index(self, mat_name):
        if mat_name not in self.materials:
            self.materials.append(mat_name)
        return self.materials.index(mat_name)

    def face(self, pts, mat, facing=None, uvs=None, smooth=False, color=None):
        """Add a polygon. `facing` is an approximate desired normal; the face flips to match."""
        pts = [Vector(p) for p in pts]
        if facing is not None:
            n = _polygon_normal(pts)
            if n.dot(Vector(facing)) < 0:
                pts.reverse()
                if uvs:
                    uvs = list(reversed(uvs))
        verts = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(verts)
        f.material_index = self._mat_index(mat)
        f.smooth = smooth
        if uvs is None:
            uvs = box_uvs(pts, _polygon_normal(pts), tile_of(mat))
        for loop, uv in zip(f.loops, uvs):
            loop[self.uv].uv = uv
            if self.color is not None:
                loop[self.color] = color or (1.0, 1.0, 1.0, 1.0)
        return f

    def box(self, lo, hi, mat, skip=(), color=None, inward=False):
        """Axis-aligned box. skip: subset of {'-x','+x','-y','+y','-z','+z'}.

        Faces point outward, or into the box with inward=True (recesses, niches).
        """
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        quads = {
            "-x": ([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0)),
            "+x": ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
            "-y": ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
            "+y": ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
            "-z": ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1)),
            "+z": ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
        }
        for key, (pts, n) in quads.items():
            if key not in skip:
                facing = tuple(-c for c in n) if inward else n
                self.face(pts, mat, facing=facing, color=color)

    def finish(self, collection, parent, smooth_angle=40.0):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=0.0005)
        ngons = [f for f in self.bm.faces if len(f.verts) > 4]
        if ngons:
            bmesh.ops.triangulate(self.bm, faces=ngons, quad_method="BEAUTY", ngon_method="EAR_CLIP")
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for m in self.materials:
            mesh.materials.append(get_material(m))
        if hasattr(mesh, "set_sharpness_by_angle"):
            mesh.set_sharpness_by_angle(angle=math.radians(smooth_angle))
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        obj.parent = parent
        return obj


def _polygon_normal(pts):
    n = Vector((0.0, 0.0, 0.0))
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n.normalized() if n.length > 1e-9 else Vector((0, 0, 1))


def box_uvs(pts, normal, tile):
    """World-space box projection: 1 texture repeat per `tile` metres."""
    ax = max(range(3), key=lambda i: abs(normal[i]))
    if ax == 2:
        return [(p.x / tile, p.y / tile) for p in pts]
    if ax == 0:
        return [(p.y / tile, p.z / tile) for p in pts]
    return [(p.x / tile, p.z / tile) for p in pts]


# ---------------------------------------------------------------------------
# Profiles and sweeps


def arch_profile(half_w, spring, rise, segments=12):
    """Arched opening outline in (lateral, up), from floor-left over the arch to floor-right.

    Every arch profile with the same `segments` has the same point count, so they can morph.
    """
    pts = [(-half_w, 0.0), (-half_w, spring * 0.5), (-half_w, spring)]
    for i in range(1, segments):
        a = math.pi - math.pi * i / segments
        pts.append((half_w * math.cos(a), spring + rise * math.sin(a)))
    pts += [(half_w, spring), (half_w, spring * 0.5), (half_w, 0.0)]
    return pts


def hall_profile(segments=12):
    """Standard `hall` opening: 2 m wide, 1.8 m to the springline, 2.8 m apex."""
    return arch_profile(HALL_HALF_W, HALL_SPRING, HALL_HALF_W, segments)


def crawl_profile():
    """Crawlspace: 1.2 m wide, about 1.05 m high."""
    return arch_profile(0.6, 0.6, 0.45)


def squeeze_profile():
    """Squeeze: a 0.7 m slot, 1.95 m high."""
    return arch_profile(0.35, 1.6, 0.35)


def morph(a, b, t):
    return [(ax + (bx - ax) * t, az + (bz - az) * t) for (ax, az), (bx, bz) in zip(a, b)]


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def door_profile(half_w=0.6, h=2.1):
    return [(-half_w, 0.0), (-half_w, h), (half_w, h), (half_w, 0.0)]


def straight_frames(a, b, steps):
    a, b = Vector(a), Vector(b)
    d = b - a
    length = d.length
    fwd = d.normalized()
    lateral = fwd.cross(Vector((0, 0, 1))).normalized()  # right-hand side when walking a -> b
    return [(a + d * (i / steps), lateral, length * i / steps) for i in range(steps + 1)]


def arc_frames(center, radius, a0, a1, steps):
    """Frames along a horizontal arc from angle a0 to a1 (radians)."""
    c = Vector(center)
    frames = []
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * i / steps
        p = c + Vector((math.cos(a), math.sin(a), 0)) * radius
        tangent = Vector((-math.sin(a), math.cos(a), 0)) * (1 if a1 > a0 else -1)
        lateral = tangent.cross(Vector((0, 0, 1))).normalized()
        frames.append((p, lateral, radius * abs(a - a0)))
    return frames


def sweep(mb, profile, frames, wall_mat, floor_mat=None, jitter=0.0, seed=0.0, profiles=None):
    """Extrude `profile` along `frames`, faces pointing into the passage.

    jitter pushes interior rings' wall vertices outward (never inward) for a hand-cut look;
    the first and last rings stay exact so seams between pieces match.
    profiles: optional per-frame profiles (same point count) to morph the cross-section.
    """
    up = Vector((0, 0, 1))
    arclen = [0.0]
    for i in range(1, len(profile)):
        (x0, z0), (x1, z1) = profile[i - 1], profile[i]
        arclen.append(arclen[-1] + math.hypot(x1 - x0, z1 - z0))
    wall_tile = tile_of(wall_mat)
    top = max(z for _, z in profile)
    rings = []
    for i, (origin, lateral, _dist) in enumerate(frames):
        ring = []
        interior = 0 < i < len(frames) - 1
        for x, z in profiles[i] if profiles else profile:
            p = origin + lateral * x + up * z
            if jitter and interior and z > 0.01:
                axis = origin + up * min(z, top - HALL_HALF_W)
                out = p - axis
                if out.length > 1e-6:
                    n = noise.noise(p * 0.9 + Vector((seed, seed * 2, 0)))
                    # Fade in from the floor so the floor edge stays straight.
                    fade = min(1.0, z / 0.6)
                    p = p + out.normalized() * (0.5 + 0.5 * n) * jitter * fade
            ring.append(p)
        rings.append(ring)

    for i in range(len(rings) - 1):
        o0, _, d0 = frames[i]
        o1, _, d1 = frames[i + 1]
        mid_axis = (o0 + o1) * 0.5 + up * (top * 0.5)
        for j in range(len(profile) - 1):
            quad = [rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]]
            center = sum(quad, Vector()) / 4
            # u runs along the passage so texture strata stay horizontal on the walls.
            uvs = [
                (d0 / wall_tile, arclen[j] / wall_tile),
                (d0 / wall_tile, arclen[j + 1] / wall_tile),
                (d1 / wall_tile, arclen[j + 1] / wall_tile),
                (d1 / wall_tile, arclen[j] / wall_tile),
            ]
            mb.face(quad, wall_mat, facing=mid_axis - center, uvs=uvs, smooth=True)
        if floor_mat:
            quad = [rings[i][0], rings[i][-1], rings[i + 1][-1], rings[i + 1][0]]
            mb.face(quad, floor_mat, facing=(0, 0, 1))
    return rings


def wall(mb, a, b, z0, z1, mat, facing, notches=(), top=None):
    """Vertical wall from a to b (xy), z0..z1, with notches cut up from the bottom edge.

    notches: list of (s_center, profile) where s is distance along a->b.
    top: optional list of (s, z) points replacing the straight top edge, ordered from b back to a.
    """
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    along = (b - a).normalized()
    length = (b - a).length
    outline = [(0.0, z0)]
    for s_c, prof in sorted(notches, key=lambda n: n[0]):
        for x, z in prof:
            outline.append((s_c + x, z0 + z))
    outline.append((length, z0))
    outline += top if top else [(length, z1), (0.0, z1)]
    pts = [a + along * s + Vector((0, 0, z)) for s, z in outline]
    mb.face(pts, mat, facing=facing)


def throat(mb, center, outward, inner, outer, profile, wall_mat, floor_mat, z0=0.0):
    """Short passage through a room wall from the inner face to the footprint boundary."""
    c = Vector((center[0], center[1], z0))
    o = Vector((outward[0], outward[1], 0))
    sweep(mb, profile, straight_frames(c + o * inner, c + o * outer, 1), wall_mat, floor_mat)


# ---------------------------------------------------------------------------
# Pieces: scaffolding


class PieceExists(Exception):
    """Raised instead of overwriting a piece that may have hand edits."""


def piece_collection(name, force=False):
    """Fresh (emptied) collection for a piece, linked under the scene root.

    Refuses to touch an existing collection unless force=True, so hand edits are never lost.
    """
    coll = bpy.data.collections.get(name)
    if coll and not force:
        raise PieceExists(f"'{name}' already exists; pass force=True to overwrite it (loses hand edits)")
    if coll:
        for obj in list(coll.objects):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if isinstance(data, bpy.types.Mesh) and data.users == 0:
                bpy.data.meshes.remove(data)
    else:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def root_empty(coll, name, w, d, levels=1, **props):
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "PLAIN_AXES"
    root["footprint_w"] = w
    root["footprint_d"] = d
    root["levels"] = levels
    for k, v in props.items():
        root[k] = v
    coll.objects.link(root)
    return root


def marker(coll, parent, name, loc, display="SINGLE_ARROW", size=0.5):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = display
    e.empty_display_size = size
    e.location = loc
    coll.objects.link(e)
    e.parent = parent
    return e


def socket(coll, parent, kind, index, loc):
    """Socket marker. The arrow points outward; the build script derives the edge from position."""
    e = marker(coll, parent, f"socket-{kind}-{index}", loc)
    x, y = loc[0], loc[1]
    # Point the arrow (local +Z) outward along whichever axis the socket sits on.
    if abs(abs(x) - max(abs(x), abs(y))) < 1e-6 and abs(x) > abs(y):
        e.rotation_euler = (0, math.copysign(math.pi / 2, x), 0)
    else:
        e.rotation_euler = (-math.copysign(math.pi / 2, y), 0, 0)
    return e


def col_box(coll, parent, name, lo, hi, rot_x=0.0):
    """Collision box (exported, hidden in game). Optional pitch around X for ramps."""
    lo, hi = Vector(lo), Vector(hi)
    size = hi - lo
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = (lo + hi) / 2
    obj.scale = size
    obj.rotation_euler = (rot_x, 0, 0)
    obj.display_type = "WIRE"
    obj.hide_render = True
    coll.objects.link(obj)
    obj.parent = parent
    return obj


def wall_cols(coll, parent, prefix, a, b, z0, z1, thickness, outward, openings=()):
    """Collision boxes for a straight wall with openings (s_center, half_width, height)."""
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    along = (b - a).normalized()
    length = (b - a).length
    o = Vector((outward[0], outward[1], 0)) * thickness
    spans = []
    cursor = 0.0
    for s_c, hw, h in sorted(openings):
        spans.append((cursor, s_c - hw, z0, z1))
        spans.append((s_c - hw, s_c + hw, z0 + h, z1))
        cursor = s_c + hw
    spans.append((cursor, length, z0, z1))
    for i, (s0, s1, za, zb) in enumerate(spans):
        if s1 - s0 < 1e-3 or zb - za < 1e-3:
            continue
        p0 = a + along * s0
        p1 = a + along * s1 + o
        lo = (min(p0.x, p1.x), min(p0.y, p1.y), za)
        hi = (max(p0.x, p1.x), max(p0.y, p1.y), zb)
        col_box(coll, parent, f"col-{prefix}-{i}", lo, hi)


# ---------------------------------------------------------------------------
# Pieces


def build_hall_straight(force=False):
    name = "hall-straight"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 1, 1)
    mb = MeshBuilder(name + "-mesh")
    sweep(mb, hall_profile(), straight_frames((0, -2, 0), (0, 2, 0), 8), "mat-wall-tunnel", "mat-floor-tunnel", jitter=0.18, seed=1.3)
    mb.finish(coll, root)
    socket(coll, root, "hall", 0, (0, 2, 0))
    socket(coll, root, "hall", 1, (0, -2, 0))
    col_box(coll, root, "col-floor", (-1.5, -2, -0.2), (1.5, 2, 0))
    col_box(coll, root, "col-wall-w", (-1.5, -2, 0), (-1.0, 2, 3.0))
    col_box(coll, root, "col-wall-e", (1.0, -2, 0), (1.5, 2, 3.0))
    col_box(coll, root, "col-ceiling", (-1.5, -2, 2.8), (1.5, 2, 3.2))
    return coll


def build_hall_corner(force=False):
    name = "hall-corner"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 1, 1)
    mb = MeshBuilder(name + "-mesh")
    # South edge centre (0,-2) heading north, curving to the east edge centre (2,0).
    frames = arc_frames((2, -2, 0), 2.0, math.pi, math.pi / 2, 8)
    sweep(mb, hall_profile(), frames, "mat-wall-tunnel", "mat-floor-tunnel", jitter=0.18, seed=4.1)
    mb.finish(coll, root)
    socket(coll, root, "hall", 0, (0, -2, 0))
    socket(coll, root, "hall", 1, (2, 0, 0))
    col_box(coll, root, "col-floor", (-2, -2, -0.2), (2, 2, 0))
    col_box(coll, root, "col-ceiling", (-2, -2, 2.8), (2, 2, 3.2))
    # Outer wall (radius 3 around the SE corner) and inner wall (radius 1) as box segments.
    for i in range(4):
        a = math.pi - (math.pi / 2) * (i + 0.5) / 4
        for label, r, half in (("outer", 3.2, 0.2), ("inner", 0.8, 0.2)):
            cx, cy = 2 + math.cos(a) * r, -2 + math.sin(a) * r
            seg = 2 * r * math.sin(math.pi / 16) + 0.1
            obj = col_box(coll, root, f"col-{label}-{i}", (cx - half, cy - seg / 2, 0), (cx + half, cy + seg / 2, 3.0))
            obj.rotation_euler = (0, 0, a)
    return coll


def build_cap_hall(force=False):
    """Seals an unused hall opening. Origin at the socket; the cap fills the -Y side (inside the
    piece being capped), so it is placed at the socket facing outward."""
    name = "cap-hall"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 0, 0, cap=1)
    mb = MeshBuilder(name + "-mesh")
    prof = hall_profile()
    # Collapsed rock face: fan from a point bulging back into the passage to the opening outline.
    hub = Vector((0.1, -0.35, 1.1))
    outline = [Vector((x, 0.0, z)) for x, z in prof]
    for i in range(len(outline) - 1):
        a, b = outline[i], outline[i + 1]
        mid_a = a.lerp(hub, 0.5) + Vector((0, -0.08 * math.sin(i), 0))
        mid_b = b.lerp(hub, 0.5) + Vector((0, -0.08 * math.sin(i + 1), 0))
        mb.face([a, b, mid_b, mid_a], "mat-wall-tunnel", facing=(0, -1, 0), smooth=True)
        mb.face([mid_a, mid_b, hub], "mat-wall-tunnel", facing=(0, -1, 0), smooth=True)
    # Floor-level closure of the fan
    mb.face([outline[-1], outline[0], outline[0].lerp(hub, 0.5), outline[-1].lerp(hub, 0.5)], "mat-wall-tunnel", facing=(0, -1, 0))
    obj = mb.finish(coll, root)
    obj.name = name + "-mesh"
    # Rubble spill
    for i, (x, y, s) in enumerate([(-0.5, -0.45, 0.32), (0.35, -0.55, 0.26), (0.0, -0.8, 0.2), (-0.15, -0.3, 0.38), (0.6, -0.3, 0.3)]):
        rb = bmesh.new()
        bmesh.ops.create_icosphere(rb, subdivisions=1, radius=1.0)
        for v in rb.verts:
            v.co *= 0.8 + 0.4 * (0.5 + 0.5 * noise.noise(v.co * 2 + Vector((i, 0, 0))))
        rb.transform(Matrix.Diagonal((s, s * 0.9, s * 0.6, 1.0)))
        rb.transform(Matrix.Translation((x, y, s * 0.35)))
        rmesh = bpy.data.meshes.new(f"{name}-rubble-{i}")
        uv = rb.loops.layers.uv.new("UVMap")
        for f in rb.faces:
            for loop, uvv in zip(f.loops, box_uvs([l.vert.co for l in f.loops], f.normal, tile_of("mat-wall-tunnel"))):
                loop[uv].uv = uvv
        rb.to_mesh(rmesh)
        rb.free()
        rmesh.materials.append(get_material("mat-wall-tunnel"))
        robj = bpy.data.objects.new(f"{name}-rubble-{i}", rmesh)
        coll.objects.link(robj)
        robj.parent = root
    socket(coll, root, "hall", 0, (0, 0, 0))
    col_box(coll, root, "col-plug", (-1.0, -0.4, 0), (1.0, 0, 2.8))
    return coll


def _bone_stack(mb, x0, x1, wall_y, depth, height, inward, seed):
    """Paris-style wall of stacked long bones (ends facing out) topped with a marble cap and skulls."""
    face_y = wall_y + inward * depth
    dark = (0.35, 0.3, 0.24, 1.0)
    lo = (x0, min(wall_y, face_y), 0)
    hi = (x1, max(wall_y, face_y), height)
    mb.box(lo, hi, "mat-bone", skip=("-z", "+y" if inward < 0 else "-y"), color=dark)
    # Bone ends: 6-sided stubs protruding from the stack face.
    r, spacing, sides = 0.045, 0.12, 6
    cols = int((x1 - x0 - 0.04) / spacing)
    rows = int((height - 0.06) / spacing)
    for row in range(rows):
        z = 0.08 + row * spacing
        offset = (spacing / 2) if row % 2 else 0
        for c in range(cols):
            x = x0 + 0.06 + c * spacing + offset
            if x > x1 - 0.05:
                continue
            n = noise.noise(Vector((x * 3.1, z * 2.7, seed)))
            tint = 0.75 + 0.25 * n
            col = (tint, tint * 0.97, tint * 0.9, 1.0)
            rr = r * (0.85 + 0.25 * noise.noise(Vector((x * 7.0, z * 5.0, seed + 3))))
            out = 0.03 + 0.03 * (0.5 + 0.5 * n)
            ring_in, ring_out = [], []
            for s in range(sides):
                a = 2 * math.pi * s / sides
                px, pz = x + math.cos(a) * rr, z + math.sin(a) * rr
                ring_in.append(Vector((px, face_y, pz)))
                ring_out.append(Vector((px, face_y + inward * out, pz)))
            for s in range(sides):
                q = [ring_in[s], ring_in[(s + 1) % sides], ring_out[(s + 1) % sides], ring_out[s]]
                ctr = Vector((x, face_y, z))
                mb.face(q, "mat-bone", facing=(sum(q, Vector()) / 4) - ctr, smooth=True, color=col)
            mb.face(ring_out, "mat-bone", facing=(0, inward, 0), color=col)
    # Marble capstone and a row of skulls
    cap_lo = (x0, min(wall_y, face_y - inward * 0.04), height)
    cap_hi = (x1, max(wall_y, face_y - inward * 0.04 + inward * 0.08), height + 0.08)
    cap_lo, cap_hi = (cap_lo[0], min(cap_lo[1], cap_hi[1]), cap_lo[2]), (cap_hi[0], max(cap_lo[1], cap_hi[1]), cap_hi[2])
    mb.box(cap_lo, cap_hi, "mat-trim-marble", skip=("-z",))
    skull_spacing = 0.2
    count = int((x1 - x0 - 0.1) / skull_spacing)
    for k in range(count):
        x = x0 + 0.15 + k * skull_spacing
        n = noise.noise(Vector((x * 2.3, seed, 1.7)))
        tint = 0.8 + 0.2 * n
        _skull(mb, Vector((x, face_y - inward * 0.1, height + 0.08 + 0.085)), inward, (tint, tint * 0.96, tint * 0.88, 1.0))


def _skull(mb, center, inward, color):
    seg, rings = 7, 5
    sx, sy, sz = 0.075, 0.09, 0.085
    verts = []
    for ri in range(rings + 1):
        phi = math.pi * ri / rings
        row = []
        for si in range(seg):
            th = 2 * math.pi * si / seg
            v = Vector((math.sin(phi) * math.cos(th) * sx, math.sin(phi) * math.sin(th) * sy, math.cos(phi) * sz))
            row.append(center + v)
        verts.append(row)
    for ri in range(rings):
        for si in range(seg):
            a, b = verts[ri][si], verts[ri][(si + 1) % seg]
            c, d = verts[ri + 1][(si + 1) % seg], verts[ri + 1][si]
            q = [a, b, c, d] if ri not in (0, rings - 1) else ([a, c, d] if ri == 0 else [a, b, c])
            ctr = sum(q, Vector()) / len(q)
            # Darken the eye-socket band on the face side.
            face_side = (ctr - center).y * inward > 0.03 and 1 <= ri <= 2
            col = (color[0] * 0.25, color[1] * 0.22, color[2] * 0.2, 1.0) if face_side and ri == 2 else color
            mb.face(q, "mat-bone", facing=ctr - center, smooth=True, color=col)


def build_ossuary_hall(force=False):
    """3x2 cells. Barrel-vaulted hall lined with bone stacks; 4 hall sockets."""
    name = "ossuary-hall"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 3, 2, levels=2)  # vault apex 6.35 m
    W, F = "mat-wall-ossuary", "mat-floor-ossuary"
    ix, iy = 6.0 - WALL_INSET, 4.0 - WALL_INSET  # 5.75, 3.75
    spring = 2.6
    hall = hall_profile()
    mb = MeshBuilder(name + "-mesh")

    mb.face([(-ix, -iy, 0), (ix, -iy, 0), (ix, iy, 0), (-ix, iy, 0)], F, facing=(0, 0, 1))
    # Long walls (north/south) to the springline, sockets at x=0.
    wall(mb, (-ix, iy), (ix, iy), 0, spring, W, (0, -1, 0), notches=[(ix, hall)])
    wall(mb, (-ix, -iy), (ix, -iy), 0, spring, W, (0, 1, 0), notches=[(ix, hall)])
    # End walls follow the vault. s runs south->north (y from -iy to iy).
    segs = 16
    arch_top = []
    for k in range(segs + 1):
        a = math.pi * k / segs  # 0 at north (s = 2*iy) to pi at south (s = 0)
        arch_top.append((iy + iy * math.cos(a), spring + iy * math.sin(a)))
    wall(mb, (-ix, -iy), (-ix, iy), 0, spring, W, (1, 0, 0), notches=[(-2 + iy, hall)], top=arch_top)
    wall(mb, (ix, -iy), (ix, iy), 0, spring, W, (-1, 0, 0), notches=[(2 + iy, hall)], top=arch_top)
    # Barrel vault along X
    vault = [(iy * math.cos(math.pi - math.pi * k / segs), iy * math.sin(math.pi - math.pi * k / segs)) for k in range(segs + 1)]
    frames = [(Vector((x, 0, spring)), Vector((0, -1, 0)), x + ix) for x in [-ix + (2 * ix) * t / 6 for t in range(7)]]
    sweep(mb, vault, frames, W)

    throat(mb, (0, iy), (0, 1), 0, WALL_INSET, hall, W, F)
    throat(mb, (0, -iy), (0, -1), 0, WALL_INSET, hall, W, F)
    throat(mb, (-ix, -2), (-1, 0), 0, WALL_INSET, hall, W, F)
    throat(mb, (ix, 2), (1, 0), 0, WALL_INSET, hall, W, F)
    # Marble plinth in the centre: a landmark
    mb.box((-0.7, -0.35, 0), (0.7, 0.35, 0.9), "mat-trim-marble", skip=("-z",))
    mb.finish(coll, root)

    bones = MeshBuilder(name + "-bones", colors=True)
    for side, wall_y, inward in (("n", iy, -1), ("s", -iy, 1)):
        for x0, x1 in ((-ix + 0.2, -1.4), (1.4, ix - 0.2)):
            _bone_stack(bones, x0, x1, wall_y, 0.3, 1.2, inward, seed=x0 + wall_y)
    bones.finish(coll, root, smooth_angle=60)

    socket(coll, root, "hall", 0, (0, 4, 0))
    socket(coll, root, "hall", 1, (0, -4, 0))
    socket(coll, root, "hall", 2, (-6, -2, 0))
    socket(coll, root, "hall", 3, (6, 2, 0))

    col_box(coll, root, "col-floor", (-6, -4, -0.2), (6, 4, 0))
    t = WALL_INSET
    top = spring + iy
    wall_cols(coll, root, "wall-n", (-6, iy), (6, iy), 0, top, t, (0, 1), openings=[(6.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-s", (-6, -iy), (6, -iy), 0, top, t, (0, -1), openings=[(6.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-w", (-ix, -4), (-ix, 4), 0, top, t, (-1, 0), openings=[(2.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-e", (ix, -4), (ix, 4), 0, top, t, (1, 0), openings=[(6.0, 1.0, 2.8)])
    for side, y0, y1 in (("n", iy - 0.34, iy), ("s", -iy, -iy + 0.34)):
        col_box(coll, root, f"col-bones-{side}-w", (-ix + 0.2, y0, 0), (-1.4, y1, 1.45))
        col_box(coll, root, f"col-bones-{side}-e", (1.4, y0, 0), (ix - 0.2, y1, 1.45))
    col_box(coll, root, "col-plinth", (-0.7, -0.35, 0), (0.7, 0.35, 0.9))
    return coll


# ---------------------------------------------------------------------------
# Shared room helpers

SIDES = {
    # side: (outward direction, wall-normal facing into the room)
    "n": ((0, 1), (0, -1, 0)),
    "s": ((0, -1), (0, 1, 0)),
    "e": ((1, 0), (-1, 0, 0)),
    "w": ((-1, 0), (1, 0, 0)),
}
NICHE_DEPTH = 0.5


def _wall_ends(side, x0, x1, y0, y1):
    """Wall endpoints for a side of a rectangle; s runs along +X (n/s) or +Y (e/w)."""
    return {
        "n": ((x0, y1), (x1, y1)),
        "s": ((x0, y0), (x1, y0)),
        "e": ((x1, y0), (x1, y1)),
        "w": ((x0, y0), (x0, y1)),
    }[side]


def wall_with_holes(mb, a, b, z0, z1, mat, facing, holes):
    """Plain vertical wall with rectangular holes (s0, s1, zb, zt), built as horizontal bands."""
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    along = (b - a).normalized()
    length = (b - a).length
    zs = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes]})
    zs = [z for z in zs if z0 <= z <= z1]
    for za, zb in zip(zs, zs[1:]):
        cut = sorted((h[0], h[1]) for h in holes if h[2] <= za + 1e-6 and h[3] >= zb - 1e-6)
        cursor = 0.0
        for s0, s1 in cut + [(length, length)]:
            if s0 - cursor > 1e-4:
                p0, p1 = a + along * cursor, a + along * s0
                mb.face([p0 + Vector((0, 0, za)), p1 + Vector((0, 0, za)), p1 + Vector((0, 0, zb)), p0 + Vector((0, 0, zb))], mat, facing=facing)
            cursor = max(cursor, s1)


def chamber(mb, x0, x1, y0, y1, height, wall_mat, floor_mat, ceil_mat, openings=None, niches=None, z0=0.0, niche_mat=None):
    """Flat-ceilinged box room. openings: side -> [(s_center, profile)]; niches: side -> [(s0, s1, zb, zt)].

    A side can have openings or niches, not both. Niches recess NICHE_DEPTH behind the wall.
    """
    openings = openings or {}
    niches = niches or {}
    mb.face([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], floor_mat, facing=(0, 0, 1))
    top = z0 + height
    mb.face([(x0, y0, top), (x1, y0, top), (x1, y1, top), (x0, y1, top)], ceil_mat, facing=(0, 0, -1))
    for side, ((ox, oy), facing) in SIDES.items():
        a, b = _wall_ends(side, x0, x1, y0, y1)
        if side in niches:
            holes = [(s0, s1, z0 + zb, z0 + zt) for s0, s1, zb, zt in niches[side]]
            wall_with_holes(mb, a, b, z0, top, wall_mat, facing, holes)
            along = Vector((b[0] - a[0], b[1] - a[1], 0)).normalized()
            for s0, s1, zb, zt in holes:
                p0 = Vector((a[0], a[1], 0)) + along * s0
                p1 = Vector((a[0], a[1], 0)) + along * s1 + Vector((ox, oy, 0)) * NICHE_DEPTH
                lo = (min(p0.x, p1.x), min(p0.y, p1.y), zb)
                hi = (max(p0.x, p1.x), max(p0.y, p1.y), zt)
                skip = {"n": "-y", "s": "+y", "e": "-x", "w": "+x"}[side]
                mb.box(lo, hi, niche_mat or wall_mat, skip=(skip,), inward=True)
        else:
            wall(mb, a, b, z0, top, wall_mat, facing, notches=openings.get(side, ()))


def niche_grid(length, cols, rows, w=0.9, h=0.5, z_first=0.45, z_gap=0.35, margin=0.3):
    """Evenly spaced burial niches along a wall of `length`."""
    out = []
    span = length - 2 * margin
    step = span / cols
    for c in range(cols):
        sc = margin + step * (c + 0.5)
        for r in range(rows):
            zb = z_first + r * (h + z_gap)
            out.append((sc - w / 2, sc + w / 2, zb, zb + h))
    return out


def junction(mb, cx, cy, open_sides, wall_mat, floor_mat, arm_ends=None, z0=0.0):
    """Hall crossing: a groin-vaulted 2x2 m centre at (cx, cy) plus a hall arm per open side.

    Closed sides get a wall in the hall profile. arm_ends: side -> distance from the centre
    where that arm stops (default 2.0, the cell edge).
    """
    arm_ends = arm_ends or {}
    r, S = HALL_HALF_W, HALL_SPRING
    prof = hall_profile()
    xs = sorted({round(x, 6) for x, _ in prof})  # arch sample positions, so edges match the arms
    c = Vector((cx, cy, z0))

    def ceil_z(x, y):
        m = min(x * x, y * y) / (r * r)
        return z0 + S + r * math.sqrt(max(0.0, 1.0 - m))

    for i in range(len(xs) - 1):
        for j in range(len(xs) - 1):
            pts = []
            for x, y in ((xs[i], xs[j]), (xs[i + 1], xs[j]), (xs[i + 1], xs[j + 1]), (xs[i], xs[j + 1])):
                pts.append(Vector((cx + x, cy + y, ceil_z(x, y))))
            mb.face(pts, wall_mat, facing=(0, 0, -1), smooth=True)
    mb.face([(cx - r, cy - r, z0), (cx + r, cy - r, z0), (cx + r, cy + r, z0), (cx - r, cy + r, z0)], floor_mat, facing=(0, 0, 1))

    for side, ((ox, oy), facing) in SIDES.items():
        o = Vector((ox, oy, 0))
        lateral = o.cross(Vector((0, 0, 1)))
        if side in open_sides:
            end = arm_ends.get(side, 2.0)
            steps = max(1, round((end - r) / 0.5))
            sweep(mb, prof, straight_frames(c + o * r, c + o * end, steps), wall_mat, floor_mat)
        else:
            pts = [c + o * r + lateral * x + Vector((0, 0, z)) for x, z in prof]
            mb.face(pts, wall_mat, facing=facing)


def junction_cols(coll, root, cx, cy, open_sides, prefix="j"):
    """Collision for a junction cell centred at (cx, cy)."""
    col_box(coll, root, f"col-{prefix}-floor", (cx - 2, cy - 2, -0.2), (cx + 2, cy + 2, 0))
    col_box(coll, root, f"col-{prefix}-ceiling", (cx - 2, cy - 2, 2.8), (cx + 2, cy + 2, 3.2))
    for sx in (-1, 1):
        for sy in (-1, 1):
            lo = (cx + min(sx, 2 * sx), cy + min(sy, 2 * sy), 0)
            hi = (cx + max(sx, 2 * sx), cy + max(sy, 2 * sy), 3.0)
            col_box(coll, root, f"col-{prefix}-corner-{sx}{sy}", lo, hi)
    closed = {"n": ((-1, 1), (1, 2)), "s": ((-1, -2), (1, -1)), "e": ((1, -1), (2, 1)), "w": ((-2, -1), (-1, 1))}
    for side, ((ax, ay), (bx, by)) in closed.items():
        if side not in open_sides:
            col_box(coll, root, f"col-{prefix}-wall-{side}", (cx + ax, cy + ay, 0), (cx + bx, cy + by, 3.0))


def hall_cols(coll, root, y0, y1, half_w=1.0, height=2.8, prefix="hall", cx=0.0):
    """Collision for a straight N-S passage segment."""
    col_box(coll, root, f"col-{prefix}-floor", (cx - 1.5, y0, -0.2), (cx + 1.5, y1, 0))
    col_box(coll, root, f"col-{prefix}-wall-w", (cx - 1.5, y0, 0), (cx - half_w, y1, 3.0))
    col_box(coll, root, f"col-{prefix}-wall-e", (cx + half_w, y0, 0), (cx + 1.5, y1, 3.0))
    col_box(coll, root, f"col-{prefix}-ceiling", (cx - 1.5, y0, height), (cx + 1.5, y1, height + 0.4))


def rubble(mb, x, y, z, size, seed, mat="mat-wall-tunnel"):
    """A lumpy rock merged into a MeshBuilder."""
    rb = bmesh.new()
    bmesh.ops.create_icosphere(rb, subdivisions=1, radius=1.0)
    for v in rb.verts:
        v.co *= 0.75 + 0.5 * (0.5 + 0.5 * noise.noise(v.co * 2.0 + Vector((seed, seed * 0.7, 0))))
    rb.transform(Matrix.Diagonal((size, size * 0.85, size * 0.6, 1.0)))
    rb.transform(Matrix.Translation((x, y, z + size * 0.3)))
    for f in rb.faces:
        mb.face([Vector(l.vert.co) for l in f.loops], mat, smooth=True)
    rb.free()


def rock_plug(mb, prof, y_plane, toward, mat, z0=0.0):
    """Collapsed rock face filling an opening outline at y=y_plane, bulging toward -toward (the viewer side)."""
    hub = Vector((0.1, y_plane - toward * 0.35, z0 + 1.1))
    outline = [Vector((x, y_plane, z0 + z)) for x, z in prof]
    facing = (0, -toward, 0)
    for i in range(len(outline) - 1):
        a, b = outline[i], outline[i + 1]
        ma = a.lerp(hub, 0.5) + Vector((0, -toward * 0.08 * math.sin(i), 0))
        mbp = b.lerp(hub, 0.5) + Vector((0, -toward * 0.08 * math.sin(i + 1), 0))
        mb.face([a, b, mbp, ma], mat, facing=facing, smooth=True)
        mb.face([ma, mbp, hub], mat, facing=facing, smooth=True)
    mb.face([outline[-1], outline[0], outline[0].lerp(hub, 0.5), outline[-1].lerp(hub, 0.5)], mat, facing=facing)


def vol_box(coll, parent, name, lo, hi):
    """Gameplay volume (e.g. vol-water-0): a unit cube scaled into place, stripped from the shipped model."""
    obj = col_box(coll, parent, name, lo, hi)
    obj.display_type = "BOUNDS"
    return obj


def vault_room(mb, x0, x1, iy, z0, spring, wall_mat, vault_mat, notches=None, end_walls=("w", "e"), segs=16):
    """Barrel vault along X: walls at y=+-iy from z0 up to the springline, semicircular vault of radius iy.

    notches: side -> [(s_center, profile)], s from x0 (n/s walls) or from -iy (e/w walls).
    """
    notches = notches or {}
    zs = z0 + spring
    wall(mb, (x0, iy), (x1, iy), z0, zs, wall_mat, (0, -1, 0), notches=notches.get("n", ()))
    wall(mb, (x0, -iy), (x1, -iy), z0, zs, wall_mat, (0, 1, 0), notches=notches.get("s", ()))
    arch_top = []
    for k in range(segs + 1):
        a = math.pi * k / segs
        arch_top.append((iy + iy * math.cos(a), zs + iy * math.sin(a)))
    if "w" in end_walls:
        wall(mb, (x0, -iy), (x0, iy), z0, zs, wall_mat, (1, 0, 0), notches=notches.get("w", ()), top=arch_top)
    if "e" in end_walls:
        wall(mb, (x1, -iy), (x1, iy), z0, zs, wall_mat, (-1, 0, 0), notches=notches.get("e", ()), top=arch_top)
    vault = [(iy * math.cos(math.pi - math.pi * k / segs), iy * math.sin(math.pi - math.pi * k / segs)) for k in range(segs + 1)]
    steps = max(2, round((x1 - x0) / 2))
    frames = [(Vector((x0 + (x1 - x0) * t / steps, 0, zs)), Vector((0, -1, 0)), (x1 - x0) * t / steps) for t in range(steps + 1)]
    sweep(mb, vault, frames, vault_mat)


# ---------------------------------------------------------------------------
# Hall pieces (1-cell connectors)


def build_hall_tee(force=False):
    name = "hall-tee"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 1, 1)
    mb = MeshBuilder(name + "-mesh")
    junction(mb, 0, 0, {"n", "s", "e"}, "mat-wall-tunnel", "mat-floor-tunnel")
    mb.finish(coll, root)
    socket(coll, root, "hall", 0, (0, 2, 0))
    socket(coll, root, "hall", 1, (0, -2, 0))
    socket(coll, root, "hall", 2, (2, 0, 0))
    junction_cols(coll, root, 0, 0, {"n", "s", "e"})
    return coll


def build_hall_cross(force=False):
    name = "hall-cross"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 1, 1)
    mb = MeshBuilder(name + "-mesh")
    junction(mb, 0, 0, {"n", "s", "e", "w"}, "mat-wall-tunnel", "mat-floor-tunnel")
    mb.finish(coll, root)
    for i, loc in enumerate([(0, 2, 0), (2, 0, 0), (0, -2, 0), (-2, 0, 0)]):
        socket(coll, root, "hall", i, loc)
    junction_cols(coll, root, 0, 0, {"n", "s", "e", "w"})
    return coll


def build_hall_dead_end(force=False):
    """Hall that ends in a collapse. Socket on the south edge."""
    name = "hall-dead-end"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 1, 1)
    mb = MeshBuilder(name + "-mesh")
    end_y = 0.9
    sweep(mb, hall_profile(), straight_frames((0, -2, 0), (0, end_y, 0), 6), "mat-wall-tunnel", "mat-floor-tunnel", jitter=0.16, seed=7.7)
    rock_plug(mb, hall_profile(), end_y, 1, "mat-wall-tunnel")
    for i, (x, y, s) in enumerate([(-0.45, 0.4, 0.35), (0.4, 0.3, 0.3), (0.0, -0.1, 0.22), (0.55, -0.4, 0.18)]):
        rubble(mb, x, y, 0, s, seed=i + 11)
    mb.finish(coll, root)
    socket(coll, root, "hall", 0, (0, -2, 0))
    hall_cols(coll, root, -2, end_y)
    col_box(coll, root, "col-end", (-1.5, end_y - 0.3, 0), (1.5, 2, 3.0))
    return coll


def build_hall_stairs_down(force=False):
    """1x2 cells, 2 levels: hall at the top (north, level 1) descending to the bottom (south, level 0)."""
    name = "hall-stairs-down"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 1, 2, levels=2)
    W, F = "mat-wall-tunnel", "mat-floor-tunnel"
    mb = MeshBuilder(name + "-mesh")
    rise, run, risers = 0.2, 0.3, 20
    top_y = 3.0  # top landing spans y 3..4
    # Wall base follows the line through the riser bottoms so the walls tuck under the treads.
    line_top = top_y + run  # z = LEVEL at y = 3.3
    bottom_y = top_y - (risers - 1) * run  # last riser at y = -2.7, z = 0
    path = [(0, 4, LEVEL), (0, line_top, LEVEL)]
    slope_steps = 10
    for k in range(1, slope_steps + 1):
        t = k / slope_steps
        path.append((0, line_top + (bottom_y - line_top) * t, LEVEL * (1 - t)))
    path.append((0, -4, 0))
    frames = []
    dist = 0.0
    for i, p in enumerate(path):
        p = Vector(p)
        if i:
            dist += (p - Vector(path[i - 1])).length
        frames.append((p, Vector((-1, 0, 0)), dist))
    sweep(mb, hall_profile(), frames, W, None, jitter=0.14, seed=5.5)
    # Landings and treads (solid steps)
    hw = HALL_HALF_W
    mb.face([(-hw, top_y, LEVEL), (hw, top_y, LEVEL), (hw, 4, LEVEL), (-hw, 4, LEVEL)], F, facing=(0, 0, 1))
    mb.face([(-hw, -4, 0), (hw, -4, 0), (hw, bottom_y, 0), (-hw, bottom_y, 0)], F, facing=(0, 0, 1))
    for k in range(1, risers + 1):
        y = top_y - (k - 1) * run
        z_hi = LEVEL - (k - 1) * rise
        z_lo = LEVEL - k * rise
        mb.face([(-hw, y, z_lo), (hw, y, z_lo), (hw, y, z_hi), (-hw, y, z_hi)], F, facing=(0, -1, 0))
        if k < risers:
            mb.face([(-hw, y - run, z_lo), (hw, y - run, z_lo), (hw, y, z_lo), (-hw, y, z_lo)], F, facing=(0, 0, 1))
    mb.finish(coll, root)
    socket(coll, root, "hall", 0, (0, 4, LEVEL))
    socket(coll, root, "hall", 1, (0, -4, 0))
    # Collision: landings, a ramp over the steps, walls
    col_box(coll, root, "col-landing-top", (-1.5, top_y, LEVEL - 0.3), (1.5, 4, LEVEL))
    col_box(coll, root, "col-landing-bottom", (-1.5, -4, -0.3), (1.5, bottom_y, 0))
    length = math.hypot(top_y - bottom_y, LEVEL)
    angle = math.atan2(LEVEL, top_y - bottom_y)
    cy, cz = (top_y + bottom_y) / 2, LEVEL / 2
    ramp = col_box(coll, root, "col-stairs", (-1.5, cy - length / 2, cz - 0.15), (1.5, cy + length / 2, cz + 0.15))
    ramp.rotation_euler = (angle, 0, 0)
    col_box(coll, root, "col-wall-w", (-1.5, -4, 0), (-hw, 4, LEVEL + 3.0))
    col_box(coll, root, "col-wall-e", (hw, -4, 0), (1.5, 4, LEVEL + 3.0))
    return coll


def _build_narrow_hall(name, footprint_d, target, ease, jitter, seed, force):
    """Hall whose middle narrows to `target` profile and opens back out. Hall sockets at both ends."""
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 1, footprint_d)
    half = footprint_d * CELL / 2
    steps = int(footprint_d * 8)
    frames = straight_frames((0, -half, 0), (0, half, 0), steps)
    total = 2 * half
    hall = hall_profile()
    profiles = []
    for _, _, d in frames:
        f = smoothstep(ease[0], ease[1], d) * smoothstep(ease[0], ease[1], total - d)
        profiles.append(morph(hall, target, f))
    mb = MeshBuilder(name + "-mesh")
    sweep(mb, hall, frames, "mat-wall-tunnel", "mat-floor-tunnel", jitter=jitter, seed=seed, profiles=profiles)
    mb.finish(coll, root)
    socket(coll, root, "hall", 0, (0, half, 0))
    socket(coll, root, "hall", 1, (0, -half, 0))
    return coll, root, half, total


def build_hall_crawl(force=False):
    """2 cells: the hall drops to a ~1 m crawlspace through the middle."""
    coll, root, half, total = _build_narrow_hall("hall-crawl", 2, crawl_profile(), (0.4, 2.2), 0.07, 9.1, force)
    tight = half - 2.2
    col_box(coll, root, "col-floor", (-1.5, -half, -0.2), (1.5, half, 0))
    hall_cols(coll, root, -half, -tight, prefix="end-s")
    hall_cols(coll, root, tight, half, prefix="end-n")
    col_box(coll, root, "col-crawl-ceiling", (-1.5, -tight, 1.05), (1.5, tight, 3.0))
    col_box(coll, root, "col-crawl-wall-w", (-1.5, -tight, 0), (-0.6, tight, 1.05))
    col_box(coll, root, "col-crawl-wall-e", (0.6, -tight, 0), (1.5, tight, 1.05))
    return coll


def build_hall_squeeze(force=False):
    """1 cell: the hall pinches to a 0.7 m slot in the middle."""
    coll, root, half, total = _build_narrow_hall("hall-squeeze", 1, squeeze_profile(), (0.15, 1.3), 0.05, 12.4, force)
    tight = half - 1.3
    col_box(coll, root, "col-floor", (-1.5, -half, -0.2), (1.5, half, 0))
    hall_cols(coll, root, -half, -tight, prefix="end-s")
    hall_cols(coll, root, tight, half, prefix="end-n")
    col_box(coll, root, "col-squeeze-wall-w", (-1.5, -tight, 0), (-0.35, tight, 3.0))
    col_box(coll, root, "col-squeeze-wall-e", (0.35, -tight, 0), (1.5, tight, 3.0))
    return coll


def _niche_props(props, x0, x1, y0, y1, niches, seed):
    """Skulls resting in some niches."""
    k = 0
    for side, holes in niches.items():
        (ox, oy), _ = SIDES[side]
        a, b = _wall_ends(side, x0, x1, y0, y1)
        along = Vector((b[0] - a[0], b[1] - a[1], 0)).normalized()
        for s0, s1, zb, zt in holes:
            k += 1
            if noise.noise(Vector((k * 1.7, seed, 0.3))) < -0.15:
                continue
            centre = Vector((a[0], a[1], 0)) + along * ((s0 + s1) / 2) + Vector((ox, oy, 0)) * (NICHE_DEPTH * 0.55)
            centre.z = zb + 0.085
            n = noise.noise(Vector((k * 3.1, seed, 1.0)))
            tint = 0.78 + 0.2 * n
            # Face the skull back into the room.
            inward = -oy if oy else 0
            _skull(props, centre, inward if inward else 1, (tint, tint * 0.96, tint * 0.88, 1.0))


def build_room_small(force=False):
    """1 cell burial room the hall passes straight through (N-S), with niches on both side walls."""
    name = "room-small"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 1, 1)
    W, F = "mat-wall-tunnel", "mat-floor-tunnel"
    x0, x1, y0, y1, h = -1.4, 1.4, -1.75, 1.75, 3.0
    hall = hall_profile()
    niches = {"e": niche_grid(y1 - y0, 2, 2), "w": niche_grid(y1 - y0, 2, 2)}
    mb = MeshBuilder(name + "-mesh")
    chamber(mb, x0, x1, y0, y1, h, W, F, W, openings={"n": [(1.4, hall)], "s": [(1.4, hall)]}, niches=niches)
    throat(mb, (0, y1), (0, 1), 0, 2 - y1, hall, W, F)
    throat(mb, (0, y0), (0, -1), 0, 2 + y0, hall, W, F)
    mb.finish(coll, root)
    props = MeshBuilder(name + "-bones", colors=True)
    _niche_props(props, x0, x1, y0, y1, niches, seed=3.0)
    props.finish(coll, root, smooth_angle=60)
    socket(coll, root, "hall", 0, (0, 2, 0))
    socket(coll, root, "hall", 1, (0, -2, 0))
    col_box(coll, root, "col-floor", (-2, -2, -0.2), (2, 2, 0))
    col_box(coll, root, "col-ceiling", (-2, -2, h), (2, 2, h + 0.4))
    col_box(coll, root, "col-wall-w", (-2, -2, 0), (x0, 2, h))
    col_box(coll, root, "col-wall-e", (x1, -2, 0), (2, 2, h))
    for side, y_a, y_b in (("n", y1, 2), ("s", -2, y0)):
        col_box(coll, root, f"col-{side}-l", (x0, y_a, 0), (-1, y_b, h))
        col_box(coll, root, f"col-{side}-r", (1, y_a, 0), (x1, y_b, h))
    return coll


def build_hall_side_room(force=False):
    """2x1 cells: a N-S hall (west cell) with a small burial chamber opening off it to the east."""
    name = "hall-side-room"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 2, 1)
    W, F = "mat-wall-tunnel", "mat-floor-tunnel"
    cx0, cx1, cy0, cy1, h = 0.6, 3.4, -1.4, 1.4, 3.0
    hall = hall_profile()
    mb = MeshBuilder(name + "-mesh")
    junction(mb, -2, 0, {"n", "s", "e"}, W, F, arm_ends={"e": 2 + cx0})
    niches = {"e": niche_grid(cy1 - cy0, 2, 2), "n": niche_grid(cx1 - cx0, 2, 2), "s": niche_grid(cx1 - cx0, 2, 2)}
    chamber(mb, cx0, cx1, cy0, cy1, h, W, F, W, openings={"w": [(1.4, hall)]}, niches=niches)
    mb.finish(coll, root)
    props = MeshBuilder(name + "-bones", colors=True)
    _niche_props(props, cx0, cx1, cy0, cy1, niches, seed=8.0)
    for i, (x, y, s) in enumerate([(2.9, -0.9, 0.3), (2.6, 0.95, 0.22)]):
        rubble(props, x, y, 0, s, seed=i + 40)
    props.finish(coll, root, smooth_angle=60)
    socket(coll, root, "hall", 0, (-2, 2, 0))
    socket(coll, root, "hall", 1, (-2, -2, 0))
    junction_cols(coll, root, -2, 0, {"n", "s", "e"})
    col_box(coll, root, "col-room-floor", (0, -2, -0.2), (4, 2, 0))
    col_box(coll, root, "col-room-ceiling", (0, -2, h), (4, 2, h + 0.4))
    col_box(coll, root, "col-room-e", (cx1, -2, 0), (4, 2, h))
    col_box(coll, root, "col-room-n", (0, cy1, 0), (4, 2, h))
    col_box(coll, root, "col-room-s", (0, -2, 0), (4, cy0, h))
    return coll


def build_room_crypt(force=False):
    """2x2 cells: a crypt with a central pillar, two sarcophagi and an opening on every side."""
    name = "room-crypt"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 2, 2)
    W, F = "mat-wall-tunnel", "mat-floor-tunnel"
    i, h = 3.4, 3.4
    hall = hall_profile()
    span = 2 * i
    # s is measured from x0/y0 = -3.4, so cell centres +-2 are at s = 1.4 and 5.4
    openings = {"n": [(5.4, hall)], "s": [(1.4, hall)], "w": [(5.4, hall)], "e": [(1.4, hall)]}
    mb = MeshBuilder(name + "-mesh")
    chamber(mb, -i, i, -i, i, h, W, F, W, openings=openings)
    throat(mb, (2, i), (0, 1), 0, 4 - i, hall, W, F)
    throat(mb, (-2, -i), (0, -1), 0, 4 - i, hall, W, F)
    throat(mb, (-i, 2), (-1, 0), 0, 4 - i, hall, W, F)
    throat(mb, (i, -2), (1, 0), 0, 4 - i, hall, W, F)
    mb.box((-0.5, -0.5, 0), (0.5, 0.5, h), W, skip=("-z", "+z"))
    for sx in (-1, 1):
        x = sx * 2.0
        mb.box((x - 0.45, -1.1, 0), (x + 0.45, 1.1, 0.75), "mat-trim-marble", skip=("-z",))
        mb.box((x - 0.5, -1.15, 0.75), (x + 0.5, 1.15, 0.87), "mat-trim-marble", skip=("-z",))
    for k, (x, y, s) in enumerate([(-2.8, -2.9, 0.3), (2.9, 2.6, 0.25), (-0.9, 2.8, 0.2)]):
        rubble(mb, x, y, 0, s, seed=k + 60)
    mb.finish(coll, root)
    socket(coll, root, "hall", 0, (2, 4, 0))
    socket(coll, root, "hall", 1, (-2, -4, 0))
    socket(coll, root, "hall", 2, (-4, 2, 0))
    socket(coll, root, "hall", 3, (4, -2, 0))
    t = 4 - i
    col_box(coll, root, "col-floor", (-4, -4, -0.2), (4, 4, 0))
    col_box(coll, root, "col-ceiling", (-4, -4, h), (4, 4, h + 0.4))
    wall_cols(coll, root, "wall-n", (-4, i), (4, i), 0, h, t, (0, 1), openings=[(6.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-s", (-4, -i), (4, -i), 0, h, t, (0, -1), openings=[(2.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-w", (-i, -4), (-i, 4), 0, h, t, (-1, 0), openings=[(6.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-e", (i, -4), (i, 4), 0, h, t, (1, 0), openings=[(2.0, 1.0, 2.8)])
    col_box(coll, root, "col-pillar", (-0.5, -0.5, 0), (0.5, 0.5, h))
    for sx in (-1, 1):
        col_box(coll, root, f"col-sarcophagus-{sx}", (sx * 2 - 0.5, -1.15, 0), (sx * 2 + 0.5, 1.15, 0.87))
    return coll


# ---------------------------------------------------------------------------
# Major rooms


def build_stairwell(force=False):
    """Start room: a 2x1 cellar under the surface. The sealed surface door is the extraction point;
    the single hall opening always leads to a hall-stairs-down (see the generator's kit data)."""
    name = "stairwell"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 2, 1)
    W, F = "mat-wall-start", "mat-floor-start"
    ix, iy, spring = 4 - WALL_INSET, 2 - WALL_INSET, 2.0
    hall, door = hall_profile(), door_profile()
    mb = MeshBuilder(name + "-mesh")
    mb.face([(-ix, -iy, 0), (ix, -iy, 0), (ix, iy, 0), (-ix, iy, 0)], F, facing=(0, 0, 1))
    vault_room(mb, -ix, ix, iy, 0, spring, W, W, notches={"e": [(iy, hall)], "w": [(iy, door)]})
    throat(mb, (ix, 0), (1, 0), 0, WALL_INSET, hall, W, F)
    throat(mb, (-ix, 0), (-1, 0), 0, WALL_INSET - 0.05, door, W, W)
    for k, (x, y, s) in enumerate([(-3.2, 1.3, 0.35), (-2.7, 1.45, 0.25), (3.0, -1.3, 0.3)]):
        rubble(mb, x, y, 0, s, seed=k + 80, mat=W)
    mb.finish(coll, root)
    dm = MeshBuilder(name + "-door")
    dx = -4.0 + 0.05
    dm.face([(dx, -0.6, 0), (dx, 0.6, 0), (dx, 0.6, 2.1), (dx, -0.6, 2.1)], "mat-door-metal", facing=(1, 0, 0),
            uvs=[(0, 0), (0.6, 0), (0.6, 1.05), (0, 1.05)])
    dm.finish(coll, root)
    socket(coll, root, "hall", 0, (4, 0, 0))
    marker(coll, root, "spawn-0", (-1.5, 0, 0), display="CONE", size=0.4)
    marker(coll, root, "extract-0", (-3.2, 0, 0), display="SPHERE", size=0.6)
    top = spring + iy
    t = WALL_INSET
    col_box(coll, root, "col-floor", (-4, -2, -0.2), (4, 2, 0))
    col_box(coll, root, "col-ceiling", (-4, -2, top), (4, 2, min(top + 0.4, LEVEL)))  # stay inside the piece's level
    wall_cols(coll, root, "wall-n", (-4, iy), (4, iy), 0, top, t, (0, 1))
    wall_cols(coll, root, "wall-s", (-4, -iy), (4, -iy), 0, top, t, (0, -1))
    wall_cols(coll, root, "wall-w", (-ix, -2), (-ix, 2), 0, top, t, (-1, 0))
    wall_cols(coll, root, "wall-e", (ix, -2), (ix, 2), 0, top, t, (1, 0), openings=[(2.0, 1.0, 2.8)])
    return coll


def build_quarry_gallery(force=False):
    """3x3 cells: a rough-cut quarry cavern with rock pillars left to hold up an uneven ceiling."""
    name = "quarry-gallery"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 3, 3, levels=2)  # ceiling up to ~6.6 m
    W, F = "mat-wall-quarry", "mat-floor-quarry"
    i = 6 - WALL_INSET
    wall_h = 4.0
    hall = hall_profile()
    mb = MeshBuilder(name + "-mesh")

    def ceil_z(x, y):
        fx, fy = 1 - (x / i) ** 2, 1 - (y / i) ** 2
        n = noise.noise(Vector((x * 0.35, y * 0.35, 2.2)))
        return wall_h + max(0.0, fx * fy) * (1.6 + 0.9 * n)

    mb.face([(-i, -i, 0), (i, -i, 0), (i, i, 0), (-i, i, 0)], F, facing=(0, 0, 1))
    grid = 14
    for gx in range(grid):
        for gy in range(grid):
            xa, xb = -i + 2 * i * gx / grid, -i + 2 * i * (gx + 1) / grid
            ya, yb = -i + 2 * i * gy / grid, -i + 2 * i * (gy + 1) / grid
            pts = [Vector((x, y, ceil_z(x, y))) for x, y in ((xa, ya), (xb, ya), (xb, yb), (xa, yb))]
            mb.face(pts, W, facing=(0, 0, -1), smooth=True)
    # Walls (s from x0/y0 = -5.75): N socket at x=-4, S at x=4, W at y=0, E at y=-4
    for side, s_list in (("n", [i - 4]), ("s", [i + 4]), ("w", [i]), ("e", [i - 4])):
        a, b = _wall_ends(side, -i, i, -i, i)
        wall(mb, a, b, 0, wall_h, W, SIDES[side][1], notches=[(s, hall) for s in s_list])
    throat(mb, (-4, i), (0, 1), 0, WALL_INSET, hall, W, F)
    throat(mb, (4, -i), (0, -1), 0, WALL_INSET, hall, W, F)
    throat(mb, (-i, 0), (-1, 0), 0, WALL_INSET, hall, W, F)
    throat(mb, (i, -4), (1, 0), 0, WALL_INSET, hall, W, F)
    # Pillars: irregular octagonal columns into the ceiling
    pillars = [(-2.6, -2.2), (2.4, 2.7), (2.9, -2.6), (-2.2, 2.9)]
    for pi, (px, py) in enumerate(pillars):
        sides, rings = 8, 4
        top = ceil_z(px, py) + 0.3
        prev = None
        for r in range(rings + 1):
            z = top * r / rings
            ring = []
            for s in range(sides):
                a = 2 * math.pi * s / sides
                rad = 0.75 + 0.18 * noise.noise(Vector((px + math.cos(a), py + math.sin(a), z * 0.6 + pi)))
                ring.append(Vector((px + math.cos(a) * rad, py + math.sin(a) * rad, z)))
            if prev:
                for s in range(sides):
                    q = [prev[s], prev[(s + 1) % sides], ring[(s + 1) % sides], ring[s]]
                    ctr = sum(q, Vector()) / 4
                    mb.face(q, W, facing=ctr - Vector((px, py, ctr.z)), smooth=True)
            prev = ring
    for k, (x, y, s) in enumerate([(-5.0, -4.9, 0.5), (-4.4, -5.1, 0.35), (5.0, 4.6, 0.45), (4.9, 1.5, 0.3), (-5.0, 3.6, 0.4), (0.6, 5.0, 0.3), (-1.0, -0.4, 0.25), (1.9, 0.3, 0.2)]):
        rubble(mb, x, y, 0, s, seed=k + 100, mat=W)
    mb.finish(coll, root)
    socket(coll, root, "hall", 0, (-4, 6, 0))
    socket(coll, root, "hall", 1, (4, -6, 0))
    socket(coll, root, "hall", 2, (-6, 0, 0))
    socket(coll, root, "hall", 3, (6, -4, 0))
    t = WALL_INSET
    top = wall_h + 2.6
    col_box(coll, root, "col-floor", (-6, -6, -0.2), (6, 6, 0))
    col_box(coll, root, "col-ceiling", (-6, -6, top), (6, 6, top + 0.4))
    wall_cols(coll, root, "wall-n", (-6, i), (6, i), 0, top, t, (0, 1), openings=[(2.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-s", (-6, -i), (6, -i), 0, top, t, (0, -1), openings=[(10.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-w", (-i, -6), (-i, 6), 0, top, t, (-1, 0), openings=[(6.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-e", (i, -6), (i, 6), 0, top, t, (1, 0), openings=[(2.0, 1.0, 2.8)])
    for pi, (px, py) in enumerate(pillars):
        col_box(coll, root, f"col-pillar-{pi}", (px - 0.7, py - 0.7, 0), (px + 0.7, py + 0.7, top))
    return coll


def build_cistern(force=False):
    """3x2 cells, 2 levels: a flooded vaulted cistern. A walkway runs round the walls at level 1;
    marble columns stand in a sunken basin. vol-water-0 marks the swimmable water."""
    name = "cistern"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 3, 2, levels=3)  # basin below the walkway, vault to ~10.4 m
    W, F, B = "mat-wall-cistern", "mat-floor-cistern", "mat-basin"
    ix, iy = 6 - WALL_INSET, 4 - WALL_INSET
    walk = LEVEL  # walkway floor height
    bx, by = 4.4, 2.4  # basin half extents
    basin_floor, water = walk - 2.0, walk - 0.45
    # 8 steps of 0.25 m from the basin floor to the walkway, x 0.5..2.5 (clear of the columns).
    STEP_RUN, STEP_WIDTH = 0.25, 1.0
    BASIN_STEPS = [(0.5 + STEP_RUN * k, basin_floor + 0.25 * (k + 1)) for k in range(8)]
    spring = 2.6
    hall = hall_profile()
    mb = MeshBuilder(name + "-mesh")
    # Walkway: ring between the walls and the basin
    mb.face([(-ix, -iy, walk), (ix, -iy, walk), (ix, -by, walk), (-ix, -by, walk)], F, facing=(0, 0, 1))
    mb.face([(-ix, by, walk), (ix, by, walk), (ix, iy, walk), (-ix, iy, walk)], F, facing=(0, 0, 1))
    mb.face([(-ix, -by, walk), (-bx, -by, walk), (-bx, by, walk), (-ix, by, walk)], F, facing=(0, 0, 1))
    mb.face([(bx, -by, walk), (ix, -by, walk), (ix, by, walk), (bx, by, walk)], F, facing=(0, 0, 1))
    # Basin
    mb.box((-bx, -by, basin_floor), (bx, by, walk), B, skip=("+z",), inward=True)
    # Stone steps up the south side of the basin, between the columns: every water volume needs an
    # obvious way out (see docs/dev/asset-pipeline.md). Steps climb toward +X onto the walkway.
    for sx0, sh in BASIN_STEPS:
        mb.box((sx0, -by, basin_floor), (sx0 + STEP_RUN, -by + STEP_WIDTH, sh), F, skip=("-y", "-z"))
    # Walls + vault above the walkway. s from -ix (n/s) or -iy (e/w).
    notches = {"n": [(ix - 4, hall)], "s": [(ix + 4, hall)], "w": [(iy + 2, hall)], "e": [(iy - 2, hall)]}
    vault_room(mb, -ix, ix, iy, walk, spring, W, W, notches=notches)
    throat(mb, (-4, iy), (0, 1), 0, WALL_INSET, hall, W, F, z0=walk)
    throat(mb, (4, -iy), (0, -1), 0, WALL_INSET, hall, W, F, z0=walk)
    throat(mb, (-ix, 2), (-1, 0), 0, WALL_INSET, hall, W, F, z0=walk)
    throat(mb, (ix, -2), (1, 0), 0, WALL_INSET, hall, W, F, z0=walk)
    mb.finish(coll, root)
    # Columns rise from the basin floor into the vault
    cm = MeshBuilder(name + "-columns")
    columns = [(x, y) for x in (-3.0, 0.0, 3.0) for y in (-1.2, 1.2)]

    def column_top(cyp):
        # Vault height over the capital edge furthest from the centreline
        return walk + spring + math.sqrt(iy * iy - (abs(cyp) + 0.42) ** 2)

    for cxp, cyp in columns:
        col_top = column_top(cyp)
        sides = 12
        r = 0.28
        ring_lo = [Vector((cxp + math.cos(2 * math.pi * s / sides) * r, cyp + math.sin(2 * math.pi * s / sides) * r, basin_floor)) for s in range(sides)]
        ring_hi = [v + Vector((0, 0, col_top - 0.3 - basin_floor)) for v in ring_lo]
        for s in range(sides):
            q = [ring_lo[s], ring_lo[(s + 1) % sides], ring_hi[(s + 1) % sides], ring_hi[s]]
            ctr = sum(q, Vector()) / 4
            u0, u1 = s / sides * 2 * math.pi * r / 1.5, (s + 1) / sides * 2 * math.pi * r / 1.5
            v0, v1 = 0.0, (col_top - basin_floor) / 1.5
            cm.face(q, "mat-column-marble", facing=ctr - Vector((cxp, cyp, ctr.z)), uvs=[(u0, v0), (u1, v0), (u1, v1), (u0, v1)], smooth=True)
        cm.box((cxp - 0.42, cyp - 0.42, col_top - 0.3), (cxp + 0.42, cyp + 0.42, col_top + 0.25), "mat-column-marble", skip=("+z",))
        cm.box((cxp - 0.38, cyp - 0.38, basin_floor), (cxp + 0.38, cyp + 0.38, basin_floor + 0.25), "mat-column-marble", skip=("-z",))
    cm.finish(coll, root)
    # Water surface
    wm = MeshBuilder(name + "-water")
    wm.face([(-bx, -by, water), (bx, -by, water), (bx, by, water), (-bx, by, water)], "mat-water", facing=(0, 0, 1))
    wm.finish(coll, root)
    vol_box(coll, root, "vol-water-0", (-bx, -by, basin_floor), (bx, by, water))
    socket(coll, root, "hall", 0, (-4, 4, walk))
    socket(coll, root, "hall", 1, (4, -4, walk))
    socket(coll, root, "hall", 2, (-6, 2, walk))
    socket(coll, root, "hall", 3, (6, -2, walk))
    t = WALL_INSET
    top = walk + spring + iy
    col_box(coll, root, "col-basin-floor", (-bx, -by, basin_floor - 0.3), (bx, by, basin_floor))
    for k, (sx0, sh) in enumerate(BASIN_STEPS):
        col_box(coll, root, f"col-basin-step-{k}", (sx0, -by, basin_floor - 0.3), (sx0 + STEP_RUN, -by + STEP_WIDTH, sh))
    # Walkways are solid down to the basin floor: they also form the basin walls.
    col_box(coll, root, "col-walk-n", (-6, by, basin_floor - 0.3), (6, 4, walk))
    col_box(coll, root, "col-walk-s", (-6, -4, basin_floor - 0.3), (6, -by, walk))
    col_box(coll, root, "col-walk-w", (-6, -by, basin_floor - 0.3), (-bx, by, walk))
    col_box(coll, root, "col-walk-e", (bx, -by, basin_floor - 0.3), (6, by, walk))
    wall_cols(coll, root, "wall-n", (-6, iy), (6, iy), walk, top, t, (0, 1), openings=[(2.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-s", (-6, -iy), (6, -iy), walk, top, t, (0, -1), openings=[(10.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-w", (-ix, -4), (-ix, 4), walk, top, t, (-1, 0), openings=[(6.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-e", (ix, -4), (ix, 4), walk, top, t, (1, 0), openings=[(2.0, 1.0, 2.8)])
    for k, (cxp, cyp) in enumerate(columns):
        col_box(coll, root, f"col-column-{k}", (cxp - 0.35, cyp - 0.35, basin_floor), (cxp + 0.35, cyp + 0.35, column_top(cyp)))
    return coll


def build_gloaming_chapel(force=False):
    """3x3 cells: the deepest room. A vaulted nave runs north to an apse with a raised dais and the
    altar where the rite is performed (rite-0). Entrances: south, and west/east near the south end."""
    name = "gloaming-chapel"
    coll = piece_collection(name, force)
    root = root_empty(coll, name, 3, 3, levels=2)  # vault apex 7.75 m
    W, F, M = "mat-wall-chapel", "mat-floor-chapel", "mat-trim-marble"
    hx = 3.75  # nave half width
    y0 = -6 + WALL_INSET  # south wall
    ya = 2.0  # apse starts here; apse radius = hx reaches y = 5.75
    spring, segs = 4.0, 16
    hall = hall_profile()
    mb = MeshBuilder(name + "-mesh")
    # Floor: nave rectangle + apse fan
    mb.face([(-hx, y0, 0), (hx, y0, 0), (hx, ya, 0), (-hx, ya, 0)], F, facing=(0, 0, 1))
    apse_n = segs // 2
    apse = [(hx * math.cos(math.pi * j / apse_n), ya + hx * math.sin(math.pi * j / apse_n)) for j in range(apse_n + 1)]
    for j in range(apse_n):
        (xa, ya_), (xb, yb) = apse[j], apse[j + 1]
        mb.face([(0, ya, 0), (xa, ya_, 0), (xb, yb, 0)], F, facing=(0, 0, 1))
    # Nave walls (to the springline) with side entrances at y=-4, south wall with the main entrance
    s_side = -4 - y0  # distance from the south end along the side walls
    wall(mb, (-hx, y0), (-hx, ya), 0, spring, W, (1, 0, 0), notches=[(s_side, hall)])
    wall(mb, (hx, y0), (hx, ya), 0, spring, W, (-1, 0, 0), notches=[(s_side, hall)])
    arch_top = [(hx + hx * math.cos(math.pi * k / segs), spring + hx * math.sin(math.pi * k / segs)) for k in range(segs + 1)]
    wall(mb, (-hx, y0), (hx, y0), 0, spring, W, (0, 1, 0), notches=[(hx, hall)], top=arch_top)
    # Side throats run from the nave wall out to the footprint edge (2.25 m)
    throat(mb, (-hx, -4), (-1, 0), 0, 6 - hx, hall, W, F)
    throat(mb, (hx, -4), (1, 0), 0, 6 - hx, hall, W, F)
    throat(mb, (0, y0), (0, -1), 0, WALL_INSET, hall, W, F)
    # Barrel vault over the nave (along Y)
    vault = [(hx * math.cos(math.pi - math.pi * k / segs), hx * math.sin(math.pi - math.pi * k / segs)) for k in range(segs + 1)]
    steps = 6
    frames = [(Vector((0, y0 + (ya - y0) * t / steps, spring)), Vector((1, 0, 0)), (ya - y0) * t / steps) for t in range(steps + 1)]
    sweep(mb, vault, frames, W)
    # Apse walls and half dome
    for j in range(apse_n):
        (xa, ya_), (xb, yb) = apse[j], apse[j + 1]
        wall(mb, (xa, ya_), (xb, yb), 0, spring, W, (-(xa + xb) / 2, ya - (ya_ + yb) / 2, 0))
    rings = 8
    centre = Vector((0, ya, spring))
    for r in range(rings):
        p0, p1 = (math.pi / 2) * r / rings, (math.pi / 2) * (r + 1) / rings
        for j in range(apse_n):
            t0, t1 = math.pi * j / apse_n, math.pi * (j + 1) / apse_n
            def pt(phi, th):
                return centre + Vector((hx * math.cos(phi) * math.cos(th), hx * math.cos(phi) * math.sin(th), hx * math.sin(phi)))
            q = [pt(p0, t0), pt(p0, t1), pt(p1, t1), pt(p1, t0)]
            ctr = sum(q, Vector()) / 4
            mb.face(q, W, facing=centre - ctr, smooth=True)
    # Dais: raised step across the apse, altar on top
    dais_h, dais_y = 0.35, 1.0
    dais_outline = [(-hx, dais_y), (hx, dais_y), (hx, ya)] + [apse[j] for j in range(1, apse_n)] + [(-hx, ya)]
    mb.face([(x, y, dais_h) for x, y in dais_outline], M, facing=(0, 0, 1))
    mb.face([(-hx, dais_y, 0), (hx, dais_y, 0), (hx, dais_y, dais_h), (-hx, dais_y, dais_h)], M, facing=(0, -1, 0))
    mb.box((-0.9, 3.0, dais_h), (0.9, 3.8, dais_h + 1.0), M, skip=("-z",))
    mb.box((-1.0, 2.95, dais_h + 1.0), (1.0, 3.85, dais_h + 1.1), M, skip=())
    # Pilasters along the nave walls and stone benches
    for y in (-3.0, -0.5, ya):
        for sx in (-1, 1):
            x_in = sx * (hx - 0.25)
            mb.box((min(x_in, sx * hx), y - 0.3, 0), (max(x_in, sx * hx), y + 0.3, spring), M, skip=("-z", "+x" if sx > 0 else "-x"))
    for row in range(4):
        y = -4.6 + row * 1.25
        for sx in (-1, 1):
            xa, xb = sorted((sx * 0.7, sx * 2.9))
            mb.box((xa, y, 0), (xb, y + 0.45, 0.45), "mat-wall-tunnel", skip=("-z",))
    mb.finish(coll, root)
    socket(coll, root, "hall", 0, (0, -6, 0))
    socket(coll, root, "hall", 1, (-6, -4, 0))
    socket(coll, root, "hall", 2, (6, -4, 0))
    marker(coll, root, "rite-0", (0, 2.4, dais_h), display="SPHERE", size=0.6)
    top = spring + hx
    t = WALL_INSET
    col_box(coll, root, "col-floor", (-6, -6, -0.2), (6, 6, 0))
    col_box(coll, root, "col-ceiling", (-6, -6, top), (6, 6, min(top + 0.4, 2 * LEVEL)))  # stay inside the piece's 2 levels
    wall_cols(coll, root, "wall-s", (-6, y0), (6, y0), 0, top, t, (0, -1), openings=[(6.0, 1.0, 2.8)])
    col_box(coll, root, "col-side-w", (-6, -6, 0), (-hx, -5, top))
    col_box(coll, root, "col-side-w2", (-6, -3, 0), (-hx, 6, top))
    col_box(coll, root, "col-side-e", (hx, -6, 0), (6, -5, top))
    col_box(coll, root, "col-side-e2", (hx, -3, 0), (6, 6, top))
    col_box(coll, root, "col-side-w-lintel", (-6, -5, 2.8), (-hx, -3, top))
    col_box(coll, root, "col-side-e-lintel", (hx, -5, 2.8), (6, -3, top))
    col_box(coll, root, "col-apse", (-hx, ya + 2.6, 0), (hx, 6, top))
    col_box(coll, root, "col-dais", (-hx, dais_y, 0), (hx, ya + 2.6, dais_h))
    col_box(coll, root, "col-altar", (-1.0, 2.95, dais_h), (1.0, 3.85, dais_h + 1.1))
    for row in range(4):
        y = -4.6 + row * 1.25
        col_box(coll, root, f"col-bench-{row}-w", (-2.9, y, 0), (-0.7, y + 0.45, 0.45))
        col_box(coll, root, f"col-bench-{row}-e", (0.7, y, 0), (2.9, y + 0.45, 0.45))
    return coll


BUILDERS = {
    "hall-straight": build_hall_straight,
    "hall-corner": build_hall_corner,
    "hall-tee": build_hall_tee,
    "hall-cross": build_hall_cross,
    "hall-dead-end": build_hall_dead_end,
    "hall-stairs-down": build_hall_stairs_down,
    "hall-crawl": build_hall_crawl,
    "hall-squeeze": build_hall_squeeze,
    "hall-side-room": build_hall_side_room,
    "room-small": build_room_small,
    "room-crypt": build_room_crypt,
    "cap-hall": build_cap_hall,
    "stairwell": build_stairwell,
    "ossuary-hall": build_ossuary_hall,
    "quarry-gallery": build_quarry_gallery,
    "cistern": build_cistern,
    "gloaming-chapel": build_gloaming_chapel,
}


# ---------------------------------------------------------------------------
# Reference, layout preview, export


def build_reference(force=False):
    """Non-exported helpers: player-height capsule and opening gauge."""
    coll = piece_collection("_reference", force)
    mb = MeshBuilder("gauge-opening-hall")
    mb.face([Vector((x, 0, z)) for x, z in hall_profile()], "mat-wall-tunnel", facing=(0, -1, 0))
    g = mb.finish(coll, None)
    g.display_type = "WIRE"
    g.location = (0, -6, 0)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=1.8, location=(1.5, -6, 0.9))
    cap = bpy.context.active_object
    cap.name = "ref-player-1.8m"
    for c in cap.users_collection:
        c.objects.unlink(cap)
    coll.objects.link(cap)
    coll.hide_render = True
    return coll


def layout_pieces(names=None, spacing=14.0):
    """Spread piece collections out along X in the viewport so they don't overlap (roots only)."""
    for idx, name in enumerate(PIECES):
        root = bpy.data.objects.get(name)
        if root and (names is None or name in names):
            root.location = (idx * spacing, 0, 0)


def reset_layout():
    for name in PIECES:
        root = bpy.data.objects.get(name)
        if root:
            root.location = (0, 0, 0)


def build_all():
    """Build pieces that don't exist yet. Existing (possibly hand-edited) pieces are skipped."""
    built = []
    for name in PIECES:
        try:
            BUILDERS[name]()
            built.append(name)
        except PieceExists:
            print(f"skip {name}: already exists")
    try:
        build_reference()
    except PieceExists:
        pass
    if built:
        layout_pieces(built)
    return built


def export_piece(name):
    os.makedirs(EXPORT, exist_ok=True)
    coll = bpy.data.collections[name]
    root = bpy.data.objects[name]
    saved = root.location.copy()
    root.location = (0, 0, 0)
    layer = _find_layer_collection(bpy.context.view_layer.layer_collection, name)
    bpy.context.view_layer.active_layer_collection = layer
    path = os.path.join(EXPORT, name + ".glb")
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
        export_image_format="JPEG",  # raw intermediate; asset:build re-encodes to WebP
        export_vertex_color="MATERIAL",
    )
    root.location = saved
    return path


def export_all():
    return [export_piece(name) for name in PIECES]


def _find_layer_collection(layer, name):
    if layer.name == name:
        return layer
    for child in layer.children:
        found = _find_layer_collection(child, name)
        if found:
            return found
    return None
