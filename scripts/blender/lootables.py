"""Lootable markers: `lootable-<type>-<n>` empties in the map pieces, where a lootable of one kind
may stand (docs/dev/lootables.md). Like crate markers (props.crate_marker), but sized for their
kind and standing at its own centre: on the floor, back to a wall, its local +Y at the wall.

Run inside Blender (or headless: `blender --background art/blender/catacomb-kit.blend --python
scripts/blender/place_lootables.py`, which saves the .blend):

    import sys, importlib
    sys.path.insert(0, r"D:/Code/undercroft/scripts/blender")
    import kit, lootables; importlib.reload(lootables)
    lootables.place_all()        # every room in ROOMS that has none yet
    lootables.place_all(force=True)  # take each room's lootable markers out and place them again

Then save the .blend, `pnpm asset:export` and `pnpm asset:build`.

Spots are found from the piece's own crate markers: sliding along the same wall a step at a time,
each spot pushed back against the wall and kept only where the wall behind is even, nothing stands
on the floor under it, the floor in front is clear and nothing else is too close.
"""

import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import kit

# Footprint and height (m) of each kind: across (along the wall), high, deep. Must match `size` in
# LOOTABLES (src/lib/content/lootables.ts); a test checks every marker's lootable fits its piece.
SIZES = {
    # A crate marker (crate-<n>), placed the same way: the generic spot any room may have.
    "crate": (0.94, 0.55, 0.64),
    "corpse": (1.3, 0.52, 1.05),
    "trunk": (0.9, 0.73, 0.67),
    "niche": (0.7, 0.45, 0.35),
    "bonePile": (1.0, 0.4, 0.8),
    "sarcophagus": (2.0, 0.8, 0.9),
    "toolChest": (1.0, 0.6, 0.55),
    "locker": (0.6, 1.8, 0.5),
    "satchel": (0.45, 0.3, 0.3),
    "offeringBox": (0.4, 0.5, 0.3),
    "vestryCabinet": (1.0, 1.6, 0.5),
    "ratNest": (0.9, 0.35, 0.8),
    "cocoon": (1.8, 0.6, 0.6),
    "stash": (0.4, 0.3, 0.3),
    "cache": (0.5, 0.35, 0.35),
    "alcove": (0.8, 1.2, 0.4),
    "font": (0.7, 1.0, 0.7),
}

# What each existing room holds, in the order its spots are given out (the handoff's table of
# existing pieces). A room gets as many of these as it has spots for.
ROOMS = {
    "ossuary-hall": ["bonePile", "niche", "niche", "bonePile", "ratNest", "niche", "bonePile", "niche"],
    "quarry-gallery": ["toolChest", "toolChest", "corpse", "toolChest", "toolChest", "toolChest"],
    "gloaming-chapel": [
        "vestryCabinet",
        "sarcophagus",
        "offeringBox",
        "alcove",
        "sarcophagus",
        "vestryCabinet",
        "offeringBox",
        "font",
    ],
    "extraction-gate": ["locker", "locker", "locker"],
    "room-small": ["niche", "offeringBox", "niche"],
    "room-crypt": ["sarcophagus", "niche", "sarcophagus", "niche", "niche"],
    "room-vault": ["bonePile", "ratNest", "cocoon", "bonePile", "cocoon", "bonePile"],
    "room-gallery": ["niche", "niche", "sarcophagus", "niche", "niche", "niche"],
    "hall-side-room": ["niche", "stash", "niche"],
    "hall-dead-end": ["stash", "cache"],
    "drop-hall": ["corpse"],
    "pit": ["corpse"],
    # The new rooms (rooms.py; the handoff's table of new rooms), with a crate or two.
    "vestry": ["vestryCabinet", "vestryCabinet", "offeringBox", "crate", "font"],
    "quarry-lodge": ["toolChest", "locker", "toolChest", "locker", "crate"],
    "smugglers-cellar": ["stash", "stash", "corpse", "stash", "crate"],
    "pump-room": ["locker", "satchel", "locker", "satchel"],
    "rat-warren": ["ratNest", "ratNest", "ratNest"],
    "explorers-camp": ["corpse", "locker", "corpse", "crate", "crate"],
    "survey-station": ["cache"],
    "rockfall": ["stash", "corpse"],
    "family-mausoleum": ["sarcophagus", "trunk", "sarcophagus", "sarcophagus"],
    "webbed-gallery": ["cocoon", "cocoon", "corpse", "cocoon"],
    "plague-pit": ["bonePile", "bonePile", "bonePile", "bonePile", "crate"],
    "drowned-chapel": ["satchel", "satchel", "offeringBox", "satchel", "font"],
    "saints-crypt": ["alcove", "crate"],
    "sinkhole": ["corpse"],
    "broken-stair": ["crate"],
    "sunken-ossuary": ["niche", "sarcophagus", "niche", "niche"],
}

# The floors to look for spots on, where a piece's floor isn't at its origin (a room whose
# entrances are on its upper level), the deepest last. Otherwise those its crate markers stand on.
FLOORS = {
    "pump-room": [4.0, 2.5],
    "drowned-chapel": [4.0, 2.4],
}

STEP = 0.5  # the grid of places tried, over the footprint
GAP = 0.03  # left behind it, against the wall
FRONT = 1.2  # clear floor wanted in front
EVEN = 0.5  # most the wall's distance may vary across its back (arched, uneven rock)
LOW = 0.08  # most anything may stand on the floor under it
SPACE = 0.2  # kept clear between it and any other marker's lootable
SOCKET_CLEAR = 0.9  # kept from doorways (socket markers) and ropes, beyond its own size
WAY_CLEAR = 0.9  # kept from the straight line between any two doorways on a floor, beyond its size
# Kinds that are stepped over, not walked round (solid: false in LOOTABLES): they may stand in the way.
STEPPED_OVER = {"corpse", "bonePile", "satchel", "ratNest", "cocoon", "stash", "cache"}


def _wall_of(empty):
    """Which way an empty's local +Y points, flattened: the wall behind it."""
    d = empty.matrix_local.to_3x3() @ Vector((0, 1, 0))
    d.z = 0
    return d.normalized()


def _yaw_of(direction):
    """The turn about Z that puts local +Y along `direction`."""
    return math.atan2(-direction.x, direction.y)


def probe(tree, at, direction, size):
    """A lootable of `size` started near `at` and pushed back along `direction` to the wall.

    Returns its centre and what was found, or None if there is no wall behind it."""
    w, h, d = size
    side = Vector((-direction.y, direction.x, 0))
    hits = []
    for across in (-w / 2, 0, w / 2):
        for z in (0.08, min(0.3, h * 0.6), min(h * 0.9, 1.2)):
            hit = tree.ray_cast(at + side * across + Vector((0, 0, z)), direction, 4.0)
            if hit[0] is None:
                return None
            hits.append(hit[3])
    centre = at + direction * (min(hits) - d / 2 - GAP)
    under = 0.0
    floor = at.z
    for across in (-w / 2, 0, w / 2):
        for along in (-d / 2, 0, d / 2):
            origin = centre + side * across + direction * along + Vector((0, 0, 0.6))
            hit = tree.ray_cast(origin, Vector((0, 0, -1)), 1.0)
            if hit[0] is None:
                return None  # no floor
            under = max(under, hit[0].z - floor)
    start = centre + Vector((0, 0, 0.4)) - direction * (d / 2 + 0.01)
    front = tree.ray_cast(start, -direction, 6.0)
    # Room at its sides, along the wall.
    sides = []
    for sign in (-1, 1):
        hit = tree.ray_cast(centre + Vector((0, 0, 0.3)), side * sign, w)
        sides.append(hit[3] if hit[0] is not None else w)
    return {
        "centre": Vector((centre.x, centre.y, floor)),
        "spread": max(hits) - min(hits),
        "under": under,
        "front": front[3] if front[0] is not None else 6.0,
        "sides": min(sides),
    }


def _tree(root, colliders_only=False):
    """BVH of what a lootable mustn't go into: the piece's visible meshes and its colliders (the
    col- boxes the game collides with), in the root's space; or only the colliders. Not water."""
    bm = bmesh.new()
    inv = root.matrix_world.inverted()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for child in root.children_recursive:
        if child.type != "MESH" or child.name.startswith("vol-"):
            continue
        if colliders_only and not child.name.startswith("col-"):
            continue
        evaluated = child.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        part = bmesh.new()
        part.from_mesh(mesh)
        bmesh.ops.transform(part, matrix=inv @ child.matrix_world, verts=part.verts)
        copy = bpy.data.meshes.new("tmp-lootable-probe")
        part.to_mesh(copy)
        part.free()
        bm.from_mesh(copy)
        bpy.data.meshes.remove(copy)
        evaluated.to_mesh_clear()
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def _boxes(root):
    """The piece's colliders (col- boxes: unit cubes, scaled and turned), as the inverse of each
    one's matrix in the root's space and its scale: what the game collides with."""
    inv = root.matrix_world.inverted()
    out = []
    for child in root.children_recursive:
        if child.type == "MESH" and child.name.startswith("col-"):
            m = inv @ child.matrix_world
            out.append((m.inverted(), m.to_scale()))
    return out


def _touches(boxes, p, r):
    """Whether a sphere of radius r at p touches any of the boxes (the game's sphereVsBox)."""
    for inverse, scale in boxes:
        q = inverse @ p
        # Back into metres along each axis of the box, from its unit cube.
        dx = max(0.0, abs(q.x) - 0.5) * abs(scale.x)
        dy = max(0.0, abs(q.y) - 0.5) * abs(scale.y)
        dz = max(0.0, abs(q.z) - 0.5) * abs(scale.z)
        if dx * dx + dy * dy + dz * dz <= r * r:
            return True
    return False


def _on_floor(boxes, foot):
    """Whether a foot stands on a collider's top (the game's hasFloor): within a few centimetres
    of the top, and not within 6 cm of its edges, where the game finds the box's side instead."""
    for inverse, scale in boxes:
        q = inverse @ foot
        if (0.5 - abs(q.x)) * abs(scale.x) < 0.06 or (0.5 - abs(q.y)) * abs(scale.y) < 0.06:
            continue
        above = (q.z - 0.5) * abs(scale.z)
        if -0.05 <= above <= 0.1:
            return True
    return False


def fits(tree, colliders, boxes, centre, direction, size):
    """The game's own test (`fits` in src/lib/shared/map/crates.ts): over a grid inside its
    footprint, at two heights, nothing within 8 cm (nor around the point), and collision floor
    under every point of it."""
    w, h, d = size
    side = Vector((-direction.y, direction.x, 0))
    inset, step = 0.12, 0.25
    # Both ways along each axis: the game walks its grid from the other side of the footprint.
    xs = _range(-w / 2 + inset, w / 2 - inset, step)
    xs = sorted(set(xs + [-x for x in xs]))
    zs = _range(-d / 2 + inset, d / 2 - inset, step)
    zs = sorted(set(zs + [-z for z in zs]))
    for x in xs:
        for z in zs:
            foot = centre + side * x + direction * z
            for y in (min(0.25, h / 2), h * 0.75):
                p = foot + Vector((0, 0, y))
                if _touches(boxes, p, 0.08):
                    return False
                near = tree.find_nearest(p, 0.08)
                if near[0] is not None:
                    return False
            if not _on_floor(boxes, foot):
                return False
    return True


def _range(lo, hi, step):
    out = []
    v = lo
    while v <= hi + 1e-6:
        out.append(v)
        v += step
    return out


def _footprint(root):
    """Half the piece's footprint, in metres (markers must stay inside it)."""
    return root["footprint_w"] * kit.CELL / 2, root["footprint_d"] * kit.CELL / 2


def _others(root):
    """Every marker already in the piece that a lootable mustn't crowd: (position, radius)."""
    out = []
    for child in root.children:
        name = child.name.split(".")[0]
        if name.startswith("crate-"):
            out.append((child.location.copy(), 0.5))
        elif name.startswith("lootable-"):
            kind = name.split("-")[1]
            w, _, d = SIZES.get(kind, (1, 1, 1))
            out.append((child.location.copy(), max(w, d) / 2))
        elif name.startswith(("socket-", "door-", "rope-", "anchor-", "altar-", "rite-")):
            out.append((child.location.copy(), SOCKET_CLEAR))
    return out


def _seeds(tree, half_w, half_d, floors):
    """Places to try: every point of a grid over the footprint (on each floor) that has a wall
    within a step of it, with the way to that wall."""
    seeds = []
    directions = [Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0))]
    steps_x = int(half_w * 2 / STEP)
    steps_y = int(half_d * 2 / STEP)
    for z in floors:
        for i in range(steps_x + 1):
            for j in range(steps_y + 1):
                at = Vector((-half_w + i * STEP, -half_d + j * STEP, z))
                down = tree.ray_cast(at + Vector((0, 0, 0.6)), Vector((0, 0, -1)), 1.0)
                if down[0] is None or abs(down[0].z - z) > 0.1:
                    continue
                for direction in directions:
                    hit = tree.ray_cast(at + Vector((0, 0, 0.25)), direction, 1.2)
                    if hit[0] is not None and hit[3] > 0.3:
                        seeds.append((at, direction))
    return seeds


def _ways(root):
    """The straight lines between every two doorways (socket markers) on the same floor: the way
    through a room, which a lootable mustn't stand in."""
    sockets = [c.location.copy() for c in root.children if c.name.startswith("socket-")]
    return [(a, b) for k, a in enumerate(sockets) for b in sockets[k + 1 :] if abs(a.z - b.z) < 0.5]


def _off_ways(ways, c, reach):
    """Whether a lootable at c (reach: half its longest side) stands clear of every way through."""
    for a, b in ways:
        if abs(c.z - a.z) > 0.5:
            continue
        ab = (b - a).to_2d()
        t = max(0.0, min(1.0, (c.to_2d() - a.to_2d()).dot(ab) / max(ab.length_squared, 1e-9)))
        if (a.to_2d() + ab * t - c.to_2d()).length < reach + WAY_CLEAR:
            return False
    return True


def clear(piece):
    """Take a piece's lootable markers out (and its crate markers, where ROOMS places those)."""
    root = bpy.data.objects[piece]
    prefixes = ("lootable-", "crate-") if "crate" in ROOMS.get(piece, []) else ("lootable-",)
    for child in list(root.children):
        if child.name.startswith(prefixes):
            bpy.data.objects.remove(child, do_unlink=True)


def place(piece, kinds):
    """Give a piece lootable markers for `kinds`, in order, where there are spots. Returns them."""
    root = bpy.data.objects[piece]
    coll = bpy.data.collections[piece]
    tree = _tree(root)
    colliders = _tree(root, colliders_only=True)
    boxes = _boxes(root)
    half_w, half_d = _footprint(root)
    # The floors to look on: those its crate markers stand on (a drop's foot), else the ground.
    floors = FLOORS.get(piece) or sorted(
        {round(c.location.z, 2) for c in root.children if c.name.startswith("crate-")}
    )
    seeds = _seeds(tree, half_w, half_d, floors or [0.0])
    ways = _ways(root)
    placed = []
    for kind in kinds:
        size = SIZES[kind]
        w, _, d = size
        reach = max(w, d) / 2
        best = None
        for at, direction in seeds:
            found = probe(tree, at, direction, size)
            if not found:
                continue
            c = found["centre"]
            # Its footprint, turned to the wall: across along it, deep out from it.
            ex, ey = (w / 2, d / 2) if abs(direction.y) > 0.5 else (d / 2, w / 2)
            if abs(c.x) + ex > half_w or abs(c.y) + ey > half_d:
                continue
            if found["spread"] > EVEN or found["under"] > LOW:
                continue
            if found["front"] < FRONT or found["sides"] < w / 2:
                continue
            if any((c - p).length < r + reach + SPACE for p, r in _others(root)):
                continue
            if kind not in STEPPED_OVER and not _off_ways(ways, c, reach):
                continue
            if not fits(tree, colliders, boxes, c, direction, size):
                continue
            # Prefer flat walls and roomy fronts; spread out from what is placed already.
            near = min((c - p).length for p, _ in _others(root)) if _others(root) else 9
            score = found["spread"] * 4 - min(found["front"], 3) * 0.2 - min(near, 4) * 0.3
            if best is None or score < best[0]:
                best = (score, c, direction)
        if best is None:
            print(f"  {piece}: no spot for a {kind}")
            continue
        _, centre, direction = best
        taken = {child.name.split(".")[0] for child in root.children}
        prefix = "crate" if kind == "crate" else f"lootable-{kind}"
        index = next(i for i in range(100) if f"{prefix}-{i}" not in taken)
        empty = kit.marker(coll, root, f"{prefix}-{index}", tuple(centre), display="ARROWS", size=0.45)
        empty.rotation_euler = (0, 0, _yaw_of(direction))
        placed.append(empty.name)
    return placed


def place_all(force=False):
    """Every room in ROOMS: its lootable markers (skipping rooms that have some, unless force)."""
    for piece, kinds in ROOMS.items():
        root = bpy.data.objects.get(piece)
        if root is None:
            print(f"  {piece}: not in the .blend")
            continue
        has = any(c.name.startswith("lootable-") for c in root.children)
        if has and not force:
            print(f"  {piece}: has lootable markers already, skipped")
            continue
        clear(piece)
        names = place(piece, kinds)
        print(f"  {piece}: {len(names)} of {len(kinds)}: {', '.join(names)}")
