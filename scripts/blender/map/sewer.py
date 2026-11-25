"""The way in (#150): the Sewer, the crack, the Storeroom and the First Stair, as one room.

Builds art/blender/rooms/sewer.blend (refusing to replace one that exists: from then on the .blend
is the source, edited by hand), bakes its lightmap and exports art/export/rooms/sewer.glb for the
room viewer (docs/dev/room-viewer.md). Headless:

    blender -b --factory-startup -P scripts/blender/map/sewer.py            # build, bake, save, export
    blender -b --factory-startup -P scripts/blender/map/sewer.py -- --force # rebuild over hand edits
    blender -b art/blender/rooms/sewer.blend -P scripts/blender/map/sewer.py -- --bake   # bake again, save, export
    blender -b art/blender/rooms/sewer.blend -P scripts/blender/map/sewer.py -- --export # export only

Layout, Blender axes (+Y north, Z up, metres). The tunnel runs west to east along y = 0, its
walkway at z = 0, with a bend down to the south near each end:

    grate (west)  ...  light tube  ...  manhole and ladder (x = 0)  ...  light tube  ...  crack (x = 17)  ...  collapse (east)

Its walls are brick up to a cement ledge, where the tunnel widens by half a metre each side, then
cement up into the vault. The walkway is on the north side, the ladder's; the channel (wadeable)
fills the rest. The manhole and two light tubes rise through the vault to the street, letting the
daylight in. The crack is a squeeze south from the channel to the Storeroom (two rows of tall
metal shelves); its locked door, in a thick stone wall, opens onto the First Stair down to the
next door (the seam to the Parish Walk).
"""

import math
import os
import random
import sys

import bmesh
from mathutils import Euler, Matrix, Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from common import kit  # noqa: E402

NAME = "sewer"

# Texture sets already in art/textures (ambientCG), metres per repeat. The names say what each
# surface is, so a better set later is a change here.
common.add_materials(
    {
        "mat-sewer-wall": {"set": "Road015C", "tile": 3.0},  # cast cement, the ledge and above
        "mat-sewer-brick": {"set": "Bricks073C", "tile": 1.5},  # the walls below the ledge
        "mat-sewer-walkway": {"set": "Road015C", "tile": 2.0},
        "mat-sewer-channel": {"set": "Rock061", "tile": 2.0},  # worn by the water
        "mat-sewer-water": {"color": (0.035, 0.04, 0.03), "roughness": 0.08},  # still, black, opaque
        "mat-sewer-end": {"color": (0.01, 0.01, 0.01), "roughness": 1.0},  # on into the dark
        "mat-crack": {"set": "Rock061", "tile": 1.5},
        "mat-iron": {"set": "MetalPlates013", "tile": 0.5, "metallic": 0.15},  # dark weathered iron, dull
        "mat-rubble": {"set": "Rock061", "tile": 1.5},
        "mat-storeroom-wall": {"set": "PavingStones127", "tile": 1.5},  # dressed stone
        "mat-storeroom-floor": {"set": "Tiles093", "tile": 2.0},
        "mat-storeroom-ceiling": {"set": "Planks025A", "tile": 1.5},  # boards over the joists
        "mat-shelf": {"set": "Metal062C", "tile": 1.0},  # the frame
        "mat-shelf-board": {"set": "Wood035", "tile": 1.0},
        "mat-timber": {"set": "Planks025A", "tile": 1.0},
    }
)

# The tunnel's cross-section (lateral from the middle, + is south; z up from the walkway)
LOW_W = 2.0  # the brick walls, 4 m apart...
LEDGE_Z = 1.4  # ...up to the ledge...
UP_W = 2.5  # ...where it widens to 5 m, cement...
SPRING = 2.6  # ...up to the vault...
RISE = 1.4  # ...rising this much more: the crown 4 m over the walkway
APEX = SPRING + RISE
WALKWAY_EDGE = -0.4  # the walkway is north of this
CHANNEL = -0.35  # the channel's floor: under a step (MOVEMENT.stepHeight 0.4), waded
WATER = -0.05  # its surface: 0.3 m deep
WALKWAY_Y = (LOW_W - WALKWAY_EDGE) / 2  # the walkway's middle (north is +y)
PATH = [(-27.0, -2.6), (-21.0, 0.0), (21.0, 0.0), (27.0, -2.6)]
BEND = math.hypot(6.0, 2.6)  # length of each end's bend, before x = -21 and after x = 21
GRATE_AT = 2.5  # m along the tunnel from its west end
WALL_T = 0.5  # collision walls' thickness
WALL_TOP = SPRING + 0.4  # and the walls' height, into the foot of the vault

# Daylight: the manhole over the walkway, two light tubes over the channel, all up to the street.
SURFACE = 8.0
MANHOLE = ((-0.6, 0.6), (-1.8, -0.6))  # x, lateral
TUBES = [((-12.4, -11.6), (-0.4, 0.4)), ((8.6, 9.4), (-0.4, 0.4))]
TUBE_GRATE = APEX + 1.0  # the grate set across each tube
LADDER_Y = -MANHOLE[1][0] - 0.14  # the rungs, standing off the manhole's north side
LADDER_TOP = SURFACE - 0.2
LADDER_EXIT = 6.0  # climbed this far (feet), you are out at the street
DAYLIGHT = {"manhole": (1800, 45), "tube": (500, 30)}  # bake lamps: watts, spread (degrees)

# The crack: a squeeze from the channel's south wall to the Storeroom, standing, side-on.
CRACK_X = 17.0
CRACK_W = 1.1  # its mouth, the cut (its ragged edges come in up to 0.2 m each side)
CRACK_H = 2.4
CRACK_MIN = 0.8  # never narrower (the capsule is 0.6 across, and the nav grid's 0.5 m lattice has to thread it)
# Straight for its first and last half metre: square-cut sleeves where it meets each wall.
# Its middle wanders no more than 0.1 m off x = 17: the walls are ragged, the way through straight
# enough for the nav grid (0.5 m lattice) to follow.
CRACK_PATH = [(17.0, -UP_W), (17.0, -3.0), (16.9, -3.9), (17.1, -4.9), (16.92, -5.9), (17.0, -6.3), (17.0, -6.55), (17.0, -6.8)]

# The Storeroom
STORE_X = (12.0, 23.0)  # 11 m...
STORE_Y = (-14.8, -6.8)  # ...by 8 m
STORE_H = 4.0
STORE_DOOR = (14.4, 15.6)  # x: the doorway in its south wall, fitted to its door's frame...
STORE_DOOR_H = 2.2  # (simple-wood-door: DOOR_TYPES in src/lib/content/doors.ts)
DOOR_DEPTH = 0.4  # ...through stone this thick
DOOR = (14.0, 16.0)  # x: the doorway at the foot of the stair, the double door's
DOOR_H = 2.6
SHELF_ROWS = ((-9.4, -8.8), (-12.6, -12.0))  # y of each row (front to back): aisles between and outside
SHELF_UNITS = ((13.3, 15.6), (16.4, 18.7), (19.5, 21.8))  # x of each unit, with gaps to cross
SHELF_TOP = 3.4
SHELF_LEVELS = (0.15, 0.85, 1.55, 2.25, 2.95)
PILE = (1.2, 1.0)  # the most a corner's pile of boxes reaches out along each wall

# The First Stair, south from the door
STAIR_X = (13.5, 16.5)  # 3 m wide
STAIR_START = STORE_Y[0] - DOOR_DEPTH  # past the doorway
STAIR_TOP = STAIR_START - 1.8  # y: the top landing runs to here
RISERS, RISE_H, TREAD = 20, 0.2, 0.32
STAIR_FOOT = STAIR_TOP - RISERS * TREAD  # y of the last riser
STAIR_END = STAIR_FOOT - 2.5  # the bottom landing, to the next door
DROP = RISERS * RISE_H  # 4 m down
HEADROOM = 3.2


def along(x):
    """Distance along the tunnel of a point at x on its straight middle."""
    return BEND + 21.0 + x


def vault_z(lateral):
    return SPRING + RISE * math.sqrt(max(0.0, 1 - (lateral / UP_W) ** 2))


def arc_laterals():
    """Where the vault's cross-section has a point: evenly round it, and at every hole's edge."""
    lats = {round(UP_W * math.cos(math.pi * k / 18), 4) for k in range(1, 18)}
    for _, (a, b) in [MANHOLE, *TUBES]:
        lats.update((a, b))
    return sorted(lats, reverse=True)


def profile():
    """The tunnel's cross-section, (lateral, z, material) going round from the channel's south
    corner: brick wall, ledge, cement wall, vault, and back down the north side, the walkway, its
    edge, the channel's floor. Returns it and where its parts are."""
    W, B = "mat-sewer-wall", "mat-sewer-brick"
    pts = [(LOW_W, CHANNEL, B)]
    parts = {"crack-low": len(pts)}
    pts.append((LOW_W, 0.0, B))
    parts["ledge-s"] = len(pts)
    pts.append((LOW_W, LEDGE_Z, W))
    parts["crack-up"] = len(pts)
    pts.append((UP_W, LEDGE_Z, W))
    pts.append((UP_W, CRACK_H, W))
    parts["arc"] = len(pts)
    pts.append((UP_W, SPRING, W))
    for lat in arc_laterals():
        pts.append((lat, vault_z(lat), W))
    pts.append((-UP_W, SPRING, W))
    parts["arc-end"] = len(pts) - 1
    pts.append((-UP_W, LEDGE_Z, W))
    pts.append((-LOW_W, LEDGE_Z, B))
    pts.append((-LOW_W, 0.0, "mat-sewer-walkway"))
    pts.append((WALKWAY_EDGE, 0.0, W))
    pts.append((WALKWAY_EDGE, CHANNEL, "mat-sewer-channel"))
    return pts, parts


def build():
    common.empty_scene()
    coll, root = common.room_collection(NAME)
    common.emissive_material("mat-daylight", (1.0, 0.95, 0.85), 6.0)
    mb = kit.MeshBuilder(NAME + "-mesh")

    pts, parts = profile()
    holes = [MANHOLE, *TUBES]
    crack_x = (CRACK_X - CRACK_W / 2, CRACK_X + CRACK_W / 2)
    breaks = [along(x) for (x0, x1), _ in holes for x in (x0, x1)] + [along(x) for x in crack_x] + [GRATE_AT]
    frames = common.polyline_frames([(x, y, 0.0) for x, y in PATH], breaks=breaks, step=1.0)
    lat = [p[0] for p in pts]

    def skip(i, seg):
        x = (frames[i][2] + frames[i + 1][2]) / 2 - along(0.0)
        if seg in (parts["crack-low"], parts["ledge-s"], parts["crack-up"]):
            return crack_x[0] < x < crack_x[1]
        if parts["arc"] <= seg < parts["arc-end"]:
            lo, hi = sorted((lat[seg], lat[seg + 1]))
            return any(x0 < x < x1 and a - 1e-6 <= lo and hi <= b + 1e-6 for (x0, x1), (a, b) in holes)
        return False

    rings = common.sweep(mb, pts, frames, skip)
    tunnel(mb, coll, root, frames, rings)
    for (x0, x1), (a, b) in holes:
        tube(mb, x0, x1, a, b, grate=(x0, x1) != MANHOLE[0])
    rungs(mb, -MANHOLE[1][0], 0.3, SURFACE - 0.2)
    manhole_cols(coll, root)
    collapse(mb, coll, root, frames)
    crack(mb, coll, root)
    crack_mouth(mb)
    storeroom(mb, coll, root)
    stair(mb, coll, root)
    common.lightmap_uv(mb.finish(coll, root))
    markers(coll, root, frames)
    lights(coll, root)
    return coll


def tunnel(mb, coll, root, frames, rings):
    up = Vector((0, 0, 1))
    # The west end: dark where the sewer goes on past the grate. The east is the collapse's.
    mb.face(rings[0], "mat-sewer-end", facing=frames[1][0] - frames[0][0])
    mb.face(rings[-1], "mat-rubble", facing=frames[-2][0] - frames[-1][0])
    # The water over the channel: one opaque sheet.
    for (o0, l0, _), (o1, l1, _) in zip(frames, frames[1:]):
        quad = [o0 + l0 * WALKWAY_EDGE, o0 + l0 * LOW_W, o1 + l1 * LOW_W, o1 + l1 * WALKWAY_EDGE]
        mb.face([p + up * WATER for p in quad], "mat-sewer-water", facing=(0, 0, 1))

    # The grate, across the whole tunnel: bars a hand apart, standing in the water and on the ledges.
    o, side, _ = next(f for f in frames if abs(f[2] - GRATE_AT) < 1e-3)
    fwd = -side.cross(up).normalized()
    s = -UP_W + 0.08
    while s < UP_W - 0.04:
        foot = LEDGE_Z if abs(s) > LOW_W else (CHANNEL if s > WALKWAY_EDGE else 0.0)
        c = o + side * s
        mb.box((c.x - 0.025, c.y - 0.025, foot), (c.x + 0.025, c.y + 0.025, vault_z(s)), "mat-iron")
        s += 0.16
    for z, half in ((0.9, LOW_W), (2.0, UP_W)):
        common_bar(mb, o + side * -half + up * z, o + side * half + up * z, fwd, 0.04, "mat-iron")

    # Collision, segment by segment.
    crack_x = (CRACK_X - CRACK_W / 2, CRACK_X + CRACK_W / 2)
    for i, ((x0, y0), (x1, y1)) in enumerate(zip(PATH, PATH[1:])):
        a, b = Vector((x0, y0, 0)), Vector((x1, y1, 0))
        d = b - a
        yaw = math.atan2(d.y, d.x)
        lateral = d.normalized().cross(up)

        def box(name, lat_lo, lat_hi, z_lo, z_hi, s_lo=None, s_hi=None):
            s0 = -0.3 if s_lo is None else s_lo
            s1 = d.length + 0.3 if s_hi is None else s_hi
            mid = a + d.normalized() * ((s0 + s1) / 2) + lateral * ((lat_lo + lat_hi) / 2)
            common.col(
                coll, root, name, (mid.x, mid.y, (z_lo + z_hi) / 2), (s1 - s0, lat_hi - lat_lo, z_hi - z_lo), yaw=yaw
            )

        box(f"col-walkway-{i}", -LOW_W, WALKWAY_EDGE, CHANNEL - 0.3, 0.0)
        box(f"col-channel-{i}", WALKWAY_EDGE, LOW_W, CHANNEL - 0.3, CHANNEL)
        # The vault: over the middle, and lower towards the walls. Over the ladder it is open, so
        # a climber goes on up the manhole.
        (mx0, mx1), (ma, mb_) = MANHOLE
        if i == 1:
            m0, m1 = mx0 - x0, mx1 - x0
            for k, (s0, s1) in enumerate(((None, m0), (m1, None))):
                box(f"col-vault-{i}-{k}", -UP_W, UP_W, APEX, APEX + 0.4, s0, s1)
                box(f"col-vault-n-{i}-{k}", -UP_W, -0.65 * UP_W, SPRING + 0.35 * RISE, APEX + 0.4, s0, s1)
            box(f"col-vault-{i}-2", mb_, UP_W, APEX, APEX + 0.4, m0, m1)
            box(f"col-vault-{i}-3", -UP_W, ma, APEX, APEX + 0.4, m0, m1)
            box(f"col-vault-n-{i}-2", -UP_W, ma, SPRING + 0.35 * RISE, APEX + 0.4, m0, m1)
        else:
            box(f"col-vault-{i}", -UP_W, UP_W, APEX, APEX + 0.4)
            box(f"col-vault-n-{i}", -UP_W, -0.65 * UP_W, SPRING + 0.35 * RISE, APEX + 0.4)
        box(f"col-vault-s-{i}", 0.65 * UP_W, UP_W, SPRING + 0.35 * RISE, APEX + 0.4)
        # The brick walls up to the ledge (their tops are the ledges), the cement above.
        box(f"col-brick-n-{i}", -LOW_W - WALL_T, -LOW_W, 0.0, LEDGE_Z)
        box(f"col-cement-n-{i}", -UP_W - WALL_T, -UP_W, LEDGE_Z, WALL_TOP)
        vol = kit.vol_box(coll, root, f"vol-water-{i}", (-0.5, -0.5, -0.5), (0.5, 0.5, 0.5))
        mid = a + d / 2 + lateral * ((WALKWAY_EDGE + LOW_W) / 2)
        vol.location = (mid.x, mid.y, (CHANNEL + WATER) / 2)
        vol.scale = (d.length + 0.6, LOW_W - WALKWAY_EDGE, WATER - CHANNEL)
        vol.rotation_euler = (0, 0, yaw)
        if i == 1:
            # The straight middle: the crack splits the south wall, brick and cement.
            c0, c1 = crack_x[0] - x0, crack_x[1] - x0
            box("col-brick-s-0", LOW_W, LOW_W + WALL_T, CHANNEL, LEDGE_Z, None, c0)
            box("col-brick-s-1", LOW_W, LOW_W + WALL_T, CHANNEL, LEDGE_Z, c1, None)
            box("col-brick-s-2", LOW_W, LOW_W + WALL_T, CHANNEL - 0.3, 0.0, c0, c1)
            box("col-cement-s-0", UP_W, UP_W + WALL_T, LEDGE_Z, WALL_TOP, None, c0)
            box("col-cement-s-1", UP_W, UP_W + WALL_T, LEDGE_Z, WALL_TOP, c1, None)
            box("col-cement-s-2", UP_W, UP_W + WALL_T, CRACK_H, WALL_TOP, c0, c1)
        else:
            box(f"col-brick-s-{i}", LOW_W, LOW_W + WALL_T, CHANNEL, LEDGE_Z)
            box(f"col-cement-s-{i}", UP_W, UP_W + WALL_T, LEDGE_Z, WALL_TOP)
    common.col(coll, root, "col-grate", (o.x, o.y, APEX / 2), (0.1, 2 * UP_W, APEX + 0.2), yaw=math.atan2(fwd.y, fwd.x))
    p, q = frames[0][0], frames[1][0]
    out = (p - q).normalized()
    c = p + out * 0.25
    common.col(coll, root, "col-end-w", (c.x, c.y, APEX / 2), (0.5, 2 * UP_W + 1, APEX + 0.4), yaw=math.atan2(out.y, out.x))


def common_bar(mb, a, b, normal, thickness, mat):
    """A square bar from a to b."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    n = Vector(normal).normalized() * thickness / 2
    m = d.cross(n).normalized() * thickness / 2
    corners = [n + m, n - m, -n - m, -n + m]
    for k in range(4):
        c0, c1 = corners[k], corners[(k + 1) % 4]
        mb.face([a + c0, a + c1, b + c1, b + c0], mat, facing=(c0 + c1) / 2)


def tube(mb, x0, x1, a, b, grate):
    """A shaft up from a hole in the vault to the street (a < b laterally; y = -lateral), daylight
    at its top, and (for a light tube) an iron grate set across it."""
    W = "mat-sewer-wall"
    foot = [(lat, vault_z(lat)) for lat in sorted([a, b, *[p for p in arc_laterals() if a < p < b]])]
    for x, face in ((x0, (1, 0, 0)), (x1, (-1, 0, 0))):
        outline = [(x, -lat, z) for lat, z in foot] + [(x, -b, SURFACE), (x, -a, SURFACE)]
        mb.face(outline, W, facing=face)
    for lat, face in ((a, (0, -1, 0)), (b, (0, 1, 0))):
        z = vault_z(lat)
        mb.face([(x0, -lat, z), (x1, -lat, z), (x1, -lat, SURFACE), (x0, -lat, SURFACE)], W, facing=face)
    top = SURFACE - 0.05
    mb.face([(x0, -b, top), (x1, -b, top), (x1, -a, top), (x0, -a, top)], "mat-daylight", facing=(0, 0, -1))
    if grate:
        z = TUBE_GRATE
        mb.box((x0, -b, z - 0.06), (x1, -b + 0.06, z), "mat-iron", skip={"-y"})
        mb.box((x0, -a - 0.06, z - 0.06), (x1, -a, z), "mat-iron", skip={"+y"})
        x = x0 + 0.1
        while x < x1 - 0.05:
            mb.box((x - 0.02, -b, z - 0.05), (x + 0.02, -a, z), "mat-iron")
            x += 0.1


def manhole_cols(coll, root):
    """The manhole's sides, from the vault up to the street, for the climb up the ladder."""
    (x0, x1), (a, b) = MANHOLE
    y0, y1 = -b, -a
    z0, z1 = vault_z(a) - 0.3, SURFACE + 0.5
    common.col_span(coll, root, "col-manhole-w", (x0 - WALL_T, y0 - WALL_T, z0), (x0, y1 + WALL_T, z1))
    common.col_span(coll, root, "col-manhole-e", (x1, y0 - WALL_T, z0), (x1 + WALL_T, y1 + WALL_T, z1))
    common.col_span(coll, root, "col-manhole-n", (x0, y1, z0), (x1, y1 + WALL_T, z1))
    common.col_span(coll, root, "col-manhole-s", (x0, y0 - WALL_T, z0), (x1, y0, z1))
    common.col_span(coll, root, "col-manhole-top", (x0, y0, SURFACE), (x1, y1, z1))


def rungs(mb, wall_y, z0, z1, half_w=0.22, step=0.3):
    """Iron rungs and their two stiles, standing off the manhole's north side (at y = wall_y) from
    the walkway to the street."""
    out = 0.14
    for x in (-half_w, half_w):
        mb.box((x - 0.02, wall_y - out - 0.02, 0.0), (x + 0.02, wall_y - out + 0.02, z1), "mat-iron")
    z = z0
    while z <= z1:
        mb.box((-half_w, wall_y - out - 0.02, z - 0.02), (half_w, wall_y - out + 0.02, z + 0.02), "mat-iron")
        z += step


def collapse(mb, coll, root, frames):
    """The east end: the roof came down. Two boulders in front, then rock heaped right up into the
    vault, smaller the higher it lies."""
    end, side, _ = frames[-1]
    side = side.normalized()
    back = (frames[-2][0] - end).normalized()
    depth = 4.2  # how far the heap reaches into the tunnel at its foot
    rng = random.Random(7)
    rocks = 0

    def floor_at(lat):
        if abs(lat) > LOW_W:
            return LEDGE_Z
        return CHANNEL if lat > WALKWAY_EDGE else 0.0

    def rock(dist, lat, z, size):
        nonlocal rocks
        boulder(mb, end + back * dist + side * lat, z, size, rng)
        rocks += 1

    # A few huge boulders that came down first, half sunk in the floor and the water.
    rock(depth - 0.7, -1.1, -0.5, 2.0)
    rock(depth - 1.1, 1.0, CHANNEL - 0.4, 1.8)
    rock(depth - 1.9, 0.0, 0.3, 1.6)
    # Only the heap's face shows: rocks up it, smaller the higher, further back the higher, two
    # deep so no gap shows, scattered rather than in rows.
    z, size = 0.0, 1.0
    while z < APEX - 0.1:
        # At this height the heap reaches this far out from the end wall.
        reach = depth * (1 - z / APEX) ** 0.7
        half = UP_W if z >= LEDGE_Z else LOW_W
        for layer, grow in ((0.0, 1.0), (0.7, 1.0), (1.5, 1.8)):
            # The third layer: bigger rocks inside the heap, filling it out behind the face.
            lat = -half + rng.uniform(0.1, 0.5) * size
            while lat < half:
                s = size * grow * rng.uniform(0.6, 1.4)
                base = max(z + rng.uniform(-0.2, 0.15) * size, floor_at(lat))
                if base < vault_z(lat) - s * 0.2:
                    dist = reach - layer * size + rng.uniform(-0.3, 0.3) * size
                    rock(max(0.2, dist), lat + rng.uniform(-0.15, 0.15), base, s)
                lat += size * rng.uniform(0.55, 0.95)
        z += size * 0.5
        size = max(0.22, size * 0.82)
    print(f"  collapse: {rocks} rocks")
    # And behind all of it, a solid core of rock filling the tunnel from the floor to the vault, so
    # no gap between rocks shows the end wall.
    rows = []
    z = CHANNEL
    while True:
        reach = max(0.3, depth * (1 - max(0.0, z) / APEX) ** 0.7 - 1.1)
        if z > SPRING:
            half = UP_W * math.sqrt(max(0.0, 1 - ((z - SPRING) / RISE) ** 2))
        else:
            half = UP_W if z >= LEDGE_Z else LOW_W
        row = []
        for k in range(9):
            lat = -half + 2 * half * k / 8
            p = end + back * reach + side * lat
            row.append(Vector((p.x, p.y, z)))
        rows.append(row)
        if z >= APEX:
            break
        z = min(APEX, z + 0.35)
    for lower, upper in zip(rows, rows[1:]):
        for k in range(8):
            quad = [lower[k], lower[k + 1], upper[k + 1], upper[k]]
            mb.face(quad, "mat-rubble", facing=back)
    near = end + back * 1.5
    common.col(coll, root, "col-collapse", (near.x, near.y, APEX / 2), (3.4, 2 * UP_W + 1, APEX + 0.4), yaw=math.atan2(back.y, back.x))
    foot = end + back * 3.6
    common.col(coll, root, "col-collapse-foot", (foot.x, foot.y, 0.4), (1.2, 2 * UP_W, 1.0), yaw=math.atan2(back.y, back.x))


def boulder(mb, p, z, size, rng, mat="mat-rubble"):
    """A broken lump of rock: lumpy, squashed, turned any way, its foot at z."""
    rb = bmesh.new()
    bmesh.ops.create_icosphere(rb, subdivisions=1, radius=1.0)
    seed = rng.uniform(0, 100)
    for v in rb.verts:
        v.co *= 0.65 + 0.7 * (0.5 + 0.5 * noise.noise(v.co * 1.7 + Vector((seed, seed * 0.7, 0))))
    sx, sy, sz = size * rng.uniform(0.7, 1.2), size * rng.uniform(0.6, 1.0), size * rng.uniform(0.4, 0.7)
    turn = Euler((rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, 2 * math.pi))).to_matrix().to_4x4()
    rb.transform(Matrix.Translation((p.x, p.y, z + sz * 0.5)) @ turn @ Matrix.Diagonal((sx / 2, sy / 2, sz / 2, 1.0)))
    for f in rb.faces:
        mb.face([Vector(loop.vert.co) for loop in f.loops], mat)
    rb.free()


def crack_mouth(mb):
    """Make the crack's mouth ragged: broken edges over the straight cut, in the brick below the
    ledge and the cement above it, and a hairline running on up the cement."""

    def jag(k):
        return 0.5 + 0.5 * math.sin(k * 12.9898) * math.cos(k * 4.1414)

    x0, x1 = CRACK_X - CRACK_W / 2, CRACK_X + CRACK_W / 2
    for y, z0, z1, mat in ((-LOW_W + 0.004, 0.0, LEDGE_Z, "mat-sewer-brick"), (-UP_W + 0.004, LEDGE_Z, CRACK_H, "mat-sewer-wall")):
        steps = max(2, round((z1 - z0) / 0.18))
        upper = z0 >= LEDGE_Z
        for edge, inward, offset in ((x0, 1, 0), (x1, -1, 50)):
            # In the cement the split closes in towards its top, over the squeeze's narrowing.
            def reach(k):
                close = 0.18 * (k / steps) ** 1.5 if upper else 0.0
                return 0.03 + 0.17 * jag(k + offset + z0 * 3) + close

            zig = [(edge + inward * reach(k), z0 + (z1 - z0) * k / steps) for k in range(steps + 1)]
            outline = [(edge, z0), *zig, (edge, z1)] if inward > 0 else [(edge, z1), *reversed(zig), (edge, z0)]
            mb.face([(x, y, z) for x, z in outline], mat, facing=(0, 1, 0))
    # Over the top of the cut in the cement: a ragged lintel, then the hairline up the wall.
    # In front of the edges it overlaps: faces in one plane shade (and bake) black.
    y = -UP_W + 0.012
    across = 6
    zig = [(x0 + (x1 - x0) * k / across, CRACK_H - 0.15 - 0.3 * jag(k + 40)) for k in range(across + 1)]
    mb.face([(x, y, z) for x, z in [(x0, CRACK_H), *zig, (x1, CRACK_H)]][::-1], "mat-sewer-wall", facing=(0, 1, 0))
    line = []
    z, x = CRACK_H - 0.4, CRACK_X  # from inside the ragged top, so the two join
    while z < SPRING + 0.6:
        line.append((x, z))
        z += 0.12
        x += 0.07 * (jag(z * 31) - 0.5)
    width = [0.07 * (1 - k / len(line)) + 0.006 for k in range(len(line))]
    left = [(x - w, z) for (x, z), w in zip(line, width)]
    right = [(x + w, z) for (x, z), w in zip(line, width)]
    y = -UP_W + 0.016  # in front of the lintel
    for k in range(len(line) - 1):
        quad = [left[k], right[k], right[k + 1], left[k + 1]]
        mb.face([(x, y, z) for x, z in quad], "mat-sewer-end", facing=(0, 1, 0))


def crack_profiles(frames):
    """The squeeze's cross-section at each ring: square-cut where it meets a wall, a ragged split
    between, never narrower than CRACK_MIN. 9 points round from the floor's west edge."""

    def jag(i, k):
        return 0.5 + 0.5 * math.sin(i * 12.9898 + k * 78.233) * math.sin(i * 3.7 + k * 1.3)

    shapes = []
    for i in range(len(frames)):
        h = CRACK_H
        # The two rings at each end square-cut: a short sleeve, so the ragged split's faces that
        # turn away from someone looking in have the sleeve behind them, not empty rock.
        if i <= 1 or i >= len(frames) - 2:
            w = CRACK_W / 2
            shapes.append([(-w, 0), (-w, 0.3 * h), (-w, 0.6 * h), (-w, h), (0, h), (w, h), (w, 0.6 * h), (w, 0.3 * h), (w, 0)])
            continue
        lo = CRACK_MIN / 2
        left = [lo + 0.12 * jag(i, k) for k in range(4)]
        right = [lo + 0.12 * jag(i, k + 4) for k in range(4)]
        top = h - 0.25 * jag(i, 9)
        shapes.append(
            [
                (-left[0], 0),
                (-left[1], 0.3 * h),
                (-left[2], 0.6 * h),
                (-0.6 * left[3], 0.86 * h),
                (0.05 * (jag(i, 10) - 0.5), top),
                (0.6 * right[3], 0.86 * h),
                (right[2], 0.6 * h),
                (right[1], 0.3 * h),
                (right[0], 0),
            ]
        )
    return shapes


def crack(mb, coll, root):
    """The crack: the brick split under the ledge, the cement above it, and a ragged squeeze
    through the rock behind, south to the Storeroom."""
    x0, x1 = CRACK_X - CRACK_W / 2, CRACK_X + CRACK_W / 2
    # Through the brick, under the ledge: its floor and its two sides.
    mb.face([(x0, -UP_W, 0), (x1, -UP_W, 0), (x1, -LOW_W, 0), (x0, -LOW_W, 0)], "mat-crack", facing=(0, 0, 1))
    mb.face([(x0, -UP_W, 0), (x0, -LOW_W, 0), (x0, -LOW_W, LEDGE_Z), (x0, -UP_W, LEDGE_Z)], "mat-sewer-brick", facing=(1, 0, 0))
    mb.face([(x1, -UP_W, 0), (x1, -LOW_W, 0), (x1, -LOW_W, LEDGE_Z), (x1, -UP_W, LEDGE_Z)], "mat-sewer-brick", facing=(-1, 0, 0))
    # The squeeze.
    frames = common.polyline_frames([(x, y, 0.0) for x, y in CRACK_PATH], step=0.45)
    shapes = crack_profiles(frames)
    base = [(x, z, "mat-crack") for x, z in shapes[0]]
    common.sweep(mb, base, frames, profiles=shapes)
    up = Vector((0, 0, 1))
    for i, ((ax, ay), (bx, by)) in enumerate(zip(CRACK_PATH, CRACK_PATH[1:])):
        a, b = Vector((ax, ay, 0)), Vector((bx, by, 0))
        d = b - a
        yaw = math.atan2(d.y, d.x)
        side = d.normalized().cross(up)
        mid = (a + b) / 2
        size = d.length + 0.3
        for sign in (-1, 1):
            # Its own length only: past the bend, a side wall would stand across the way on.
            c = mid + side * sign * (CRACK_MIN / 2 + WALL_T / 2)
            common.col(coll, root, f"col-crack-{i}-{'ew'[sign > 0]}", (c.x, c.y, CRACK_H / 2), (d.length, WALL_T, CRACK_H + 0.4), yaw=yaw)
        common.col(coll, root, f"col-crack-top-{i}", (mid.x, mid.y, 0.86 * CRACK_H + 0.2), (size, CRACK_MIN + 0.2, 0.4), yaw=yaw)
        common.col(coll, root, f"col-crack-floor-{i}", (mid.x, mid.y, -0.15), (size, CRACK_MIN + 0.4, 0.3), yaw=yaw)
        vol = kit.vol_box(coll, root, f"vol-squeeze-{i}", (-0.5, -0.5, -0.5), (0.5, 0.5, 0.5))
        vol.location = (mid.x, mid.y, CRACK_H / 2)
        vol.scale = (d.length, CRACK_W + 0.2, CRACK_H)
        vol.rotation_euler = (0, 0, yaw)
    common.col_span(coll, root, "col-crack-mouth", (x0, -UP_W, -0.3), (x1, -LOW_W, 0.0))


def box_stack(mb, coll, root, name, corner_x, corner_y, toward_x, toward_y, rng):
    """Wooden boxes piled in a corner (out from it along `toward`): a few on the floor, smaller
    ones on top, kept within PILE so the walk round the shelf rows stays open. One collision box
    round the pile."""
    reach_x, reach_y = 0.0, 0.0
    x = 0.1
    while x < PILE[0] - 0.4:
        w, d, h = rng.uniform(0.45, 0.7), rng.uniform(0.45, 0.7), rng.uniform(0.4, 0.65)
        w = min(w, PILE[0] - x)
        y = 0.1
        while y < PILE[1] - 0.4:
            d = min(d, PILE[1] - y)
            bx, by = corner_x + toward_x * x, corner_y + toward_y * y
            lo = (min(bx, bx + toward_x * w), min(by, by + toward_y * d), 0.0)
            hi = (max(bx, bx + toward_x * w), max(by, by + toward_y * d), h)
            mb.box(lo, hi, "mat-timber", skip={"-z"})
            if rng.random() < 0.6:
                inset = rng.uniform(0.03, 0.1)
                top = h + rng.uniform(0.25, 0.45)
                mb.box((lo[0] + inset, lo[1] + inset, h), (hi[0] - inset, hi[1] - inset, top), "mat-timber", skip={"-z"})
            reach_x, reach_y = max(reach_x, x + w), max(reach_y, y + d)
            y += d + rng.uniform(0.02, 0.1)
        x += w + rng.uniform(0.02, 0.1)
    xs = sorted((corner_x, corner_x + toward_x * reach_x))
    ys = sorted((corner_y, corner_y + toward_y * reach_y))
    common.col_span(coll, root, name, (xs[0], ys[0], 0.0), (xs[1], ys[1], 1.1))


def shelf_unit(mb, x0, x1, y0, y1, rng):
    """A standing shelf: a steel frame (angle posts at the corners, a rail along the front and back
    under each level, X braces across each end), wooden boards to stand things on, and a few
    boxes left on them."""
    M, B = "mat-shelf", "mat-shelf-board"
    post = 0.05
    for px in (x0, x1 - post):
        for py in (y0, y1 - post):
            # An angle post: two flanges.
            mb.box((px, py, 0), (px + post, py + 0.008, SHELF_TOP), M)
            mb.box((px, py, 0), (px + 0.008, py + post, SHELF_TOP), M)
    for z in (*SHELF_LEVELS, SHELF_TOP - 0.03):
        mb.box((x0 + 0.01, y0 + 0.012, z), (x1 - 0.01, y1 - 0.012, z + 0.025), B)
        mb.box((x0, y0, z - 0.06), (x1, y0 + 0.012, z + 0.01), M, skip={"+z"})
        mb.box((x0, y1 - 0.012, z - 0.06), (x1, y1, z + 0.01), M, skip={"+z"})
    for x in (x0 + 0.02, x1 - 0.02):
        common_bar(mb, (x, y0 + 0.02, 0.1), (x, y1 - 0.02, SHELF_TOP - 0.1), (1, 0, 0), 0.02, M)
        common_bar(mb, (x, y1 - 0.02, 0.1), (x, y0 + 0.02, SHELF_TOP - 0.1), (1, 0, 0), 0.02, M)
    for z in SHELF_LEVELS:
        x = x0 + rng.uniform(0.05, 0.4)
        while x < x1 - 0.35:
            w, d, h = rng.uniform(0.25, 0.55), rng.uniform(0.25, y1 - y0 - 0.1), rng.uniform(0.15, 0.45)
            if rng.random() < 0.6 and x + w < x1 - 0.05:
                y = rng.uniform(y0 + 0.03, y1 - d - 0.03)
                mb.box((x, y, z + 0.025), (x + w, y + d, z + 0.025 + h), "mat-timber", skip={"-z"})
            x += w + rng.uniform(0.05, 0.5)


def storeroom(mb, coll, root):
    """Dressed stone, a boarded ceiling, two rows of tall shelves; in the
    corners: wooden boxes and coffin boards. The doorway goes through a thick wall to the First Stair."""
    (x0, x1), (y0, y1), h = STORE_X, STORE_Y, STORE_H
    W, F, C = "mat-storeroom-wall", "mat-storeroom-floor", "mat-storeroom-ceiling"
    mb.face([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], F, facing=(0, 0, 1))
    mb.face([(x0, y0, h), (x1, y0, h), (x1, y1, h), (x0, y1, h)], C, facing=(0, 0, -1))
    cx = (CRACK_X - CRACK_W / 2 - x0, CRACK_X + CRACK_W / 2 - x0)
    common.wall_with_hole(mb, (x0, y1), (x1, y1), 0, h, W, (0, -1, 0), [(cx[0], cx[1], 0, CRACK_H)])
    common.wall_with_hole(mb, (x0, y0), (x1, y0), 0, h, W, (0, 1, 0), [(STORE_DOOR[0] - x0, STORE_DOOR[1] - x0, 0, STORE_DOOR_H)])
    common.wall_with_hole(mb, (x0, y0), (x0, y1), 0, h, W, (1, 0, 0), [])
    common.wall_with_hole(mb, (x1, y0), (x1, y1), 0, h, W, (-1, 0, 0), [])
    # The doorway's depth: its sides, its lintel and its threshold.
    yd = y0 - DOOR_DEPTH
    mb.face([(STORE_DOOR[0], yd, 0), (STORE_DOOR[0], y0, 0), (STORE_DOOR[0], y0, STORE_DOOR_H), (STORE_DOOR[0], yd, STORE_DOOR_H)], W, facing=(1, 0, 0))
    mb.face([(STORE_DOOR[1], yd, 0), (STORE_DOOR[1], y0, 0), (STORE_DOOR[1], y0, STORE_DOOR_H), (STORE_DOOR[1], yd, STORE_DOOR_H)], W, facing=(-1, 0, 0))
    mb.face([(STORE_DOOR[0], yd, STORE_DOOR_H), (STORE_DOOR[1], yd, STORE_DOOR_H), (STORE_DOOR[1], y0, STORE_DOOR_H), (STORE_DOOR[0], y0, STORE_DOOR_H)], W, facing=(0, 0, -1))
    mb.face([(STORE_DOOR[0], yd, 0), (STORE_DOOR[1], yd, 0), (STORE_DOOR[1], y0, 0), (STORE_DOOR[0], y0, 0)], F, facing=(0, 0, 1))

    common.col_span(coll, root, "col-store-floor", (x0, y0, -0.3), (x1, y1, 0.0))
    common.col_span(coll, root, "col-store-ceiling", (x0, y0, h), (x1, y1, h + 0.4))
    common.col_span(coll, root, "col-store-w", (x0 - WALL_T, y0, 0), (x0, y1, h))
    common.col_span(coll, root, "col-store-e", (x1, y0, 0), (x1 + WALL_T, y1, h))
    c0, c1 = CRACK_X - CRACK_W / 2, CRACK_X + CRACK_W / 2
    common.col_span(coll, root, "col-store-n-0", (x0, y1, 0), (c0, y1 + WALL_T, h))
    common.col_span(coll, root, "col-store-n-1", (c1, y1, 0), (x1, y1 + WALL_T, h))
    common.col_span(coll, root, "col-store-n-2", (c0, y1, CRACK_H), (c1, y1 + WALL_T, h))
    common.col_span(coll, root, "col-store-s-0", (x0, yd, 0), (STORE_DOOR[0], y0, h))
    common.col_span(coll, root, "col-store-s-1", (STORE_DOOR[1], yd, 0), (x1, y0, h))
    common.col_span(coll, root, "col-store-s-2", (STORE_DOOR[0], yd, STORE_DOOR_H), (STORE_DOOR[1], y0, h))
    common.col_span(coll, root, "col-doorway-floor", (STORE_DOOR[0], yd, -0.3), (STORE_DOOR[1], y0, 0.0))

    rng = random.Random(11)
    for r, (ry0, ry1) in enumerate(SHELF_ROWS):
        lo, hi = min(ry0, ry1), max(ry0, ry1)
        for u, (ux0, ux1) in enumerate(SHELF_UNITS):
            shelf_unit(mb, ux0, ux1, lo, hi, rng)
            common.col_span(coll, root, f"col-shelf-{r}-{u}", (ux0, lo, 0), (ux1, hi, SHELF_TOP))
    # Wooden boxes, like the shelves', stacked in three of the corners.
    for k, (x, y, toward_x, toward_y) in enumerate(((x0, y1, 1, -1), (x1, y1, -1, -1), (x1, y0, -1, 1))):
        box_stack(mb, coll, root, f"col-boxes-{k}", x, y, toward_x, toward_y, rng)
    # Coffin boards, stacked flat along the west wall in the south-west corner.
    for k in range(6):
        z = k * 0.035
        lo, hi = (x0 + 0.15, y0 + 0.3 + 0.03 * (k % 2), z), (x0 + 0.65, y0 + 2.3 - 0.04 * (k % 3), z + 0.03)
        mb.box(lo, hi, "mat-timber", skip={"-z"})
    common.col_span(coll, root, "col-boards", (x0 + 0.15, y0 + 0.3, 0), (x0 + 0.65, y0 + 2.3, 0.21))


def stair(mb, coll, root):
    """The First Stair: a top landing past the doorway, a flight down, a landing to the next door."""
    (x0, x1) = STAIR_X
    yd = STAIR_START
    # The Storeroom's stone, floor and boarded ceiling, carried on down.
    W, F, C = "mat-storeroom-wall", "mat-storeroom-floor", "mat-storeroom-ceiling"
    # The wall around the doorway, seen from the stair side.
    common.wall_with_hole(mb, (x0, yd), (x1, yd), 0, HEADROOM, W, (0, -1, 0), [(STORE_DOOR[0] - x0, STORE_DOOR[1] - x0, 0, STORE_DOOR_H)])
    # Floors: the landings and the steps.
    mb.face([(x0, STAIR_TOP, 0), (x1, STAIR_TOP, 0), (x1, yd, 0), (x0, yd, 0)], F, facing=(0, 0, 1))
    mb.face([(x0, STAIR_END, -DROP), (x1, STAIR_END, -DROP), (x1, STAIR_FOOT, -DROP), (x0, STAIR_FOOT, -DROP)], F, facing=(0, 0, 1))
    for k in range(RISERS):
        y = STAIR_TOP - k * TREAD
        z_hi, z_lo = -k * RISE_H, -(k + 1) * RISE_H
        mb.face([(x0, y, z_lo), (x1, y, z_lo), (x1, y, z_hi), (x0, y, z_hi)], F, facing=(0, -1, 0))
        mb.face([(x0, y - TREAD, z_lo), (x1, y - TREAD, z_lo), (x1, y, z_lo), (x0, y, z_lo)], F, facing=(0, 0, 1))
    # Ceiling: flat across the top, so the space opens up overhead as you go down.
    top = HEADROOM
    mb.face([(x0, STAIR_END, top), (x1, STAIR_END, top), (x1, yd, top), (x0, yd, top)], C, facing=(0, 0, -1))
    # Side walls: their foot runs under the treads (through the bottom of each riser), so no gap
    # shows between a step and the wall.
    last_riser = STAIR_TOP - (RISERS - 1) * TREAD
    outline = [
        (yd, 0), (STAIR_TOP, 0), (STAIR_TOP, -RISE_H), (last_riser, -DROP), (STAIR_END, -DROP),
        (STAIR_END, top), (yd, top),
    ]
    mb.face([(x0, y, z) for y, z in outline], W, facing=(1, 0, 0))
    mb.face([(x1, y, z) for y, z in outline], W, facing=(-1, 0, 0))
    # The far end, round the next door: where the Parish Walk joins. Until it does, dark stone
    # just behind the doorway stands in for it.
    common.wall_with_hole(
        mb, (x0, STAIR_END), (x1, STAIR_END), -DROP, top, W, (0, 1, 0), [(DOOR[0] - x0, DOOR[1] - x0, 0, DOOR_H)]
    )
    behind = STAIR_END - DOOR_DEPTH
    mb.face(
        [(DOOR[0], behind, -DROP), (DOOR[1], behind, -DROP), (DOOR[1], behind, -DROP + DOOR_H), (DOOR[0], behind, -DROP + DOOR_H)],
        "mat-sewer-end",
        facing=(0, 1, 0),
    )
    common.inward_box(mb, (DOOR[0], behind, -DROP), (DOOR[1], STAIR_END, -DROP + DOOR_H), W, skip={"+y", "-y"})

    common.col_span(coll, root, "col-stair-top", (x0, STAIR_TOP, -0.3), (x1, yd, 0.0))
    common.col_span(coll, root, "col-stair-bottom", (x0, STAIR_END, -DROP - 0.3), (x1, STAIR_FOOT, -DROP))
    run = STAIR_TOP - STAIR_FOOT
    length = math.hypot(run, DROP)
    cy, cz = (STAIR_TOP + STAIR_FOOT) / 2, -DROP / 2
    common.col(coll, root, "col-stair-ramp", ((x0 + x1) / 2, cy, cz), (x1 - x0, length, 0.3), pitch=math.atan2(DROP, run))
    common.col_span(coll, root, "col-stair-w", (x0 - WALL_T, STAIR_END, -DROP), (x0, yd, HEADROOM))
    common.col_span(coll, root, "col-stair-e", (x1, STAIR_END, -DROP), (x1 + WALL_T, yd, HEADROOM))
    common.col_span(coll, root, "col-stair-ceiling", (x0, STAIR_END, top), (x1, yd, top + 0.4))
    # Until the Parish Walk is joined on, nothing is past the next door: a wall stands in for it.
    common.col_span(coll, root, "col-seam-0", (x0, STAIR_END - WALL_T, -DROP), (x1, STAIR_END, top))


def markers(coll, root, frames):
    def m(name, loc, toward=None, **props):
        return common.marker(coll, root, name, loc, toward, **props)

    # Spawns on the walkway either side of the ladder, facing it.
    for k, x in enumerate((-1.2, 1.2, -2.2, 2.2)):
        m(f"spawn-{k}", (x, WALKWAY_Y, 0.0), toward=(-x, 0.4))
    # The way you came in, always open: up the ladder. It climbs like a rope (rope-<n>, docs/dev/
    # rope.md): grab it at the foot, climb, and LADDER_EXIT up you are out.
    m("rope-0", (0.0, LADDER_Y, LADDER_TOP), length=LADDER_TOP, exit=LADDER_EXIT, ladder=1)
    # The Storeroom's door, locked until opened with the key: the explorer who got this far and no
    # further lies between the shelves, the key on them.
    (x0, x1), (y0, y1) = STORE_X, STORE_Y
    door_x = (DOOR[0] + DOOR[1]) / 2
    size = {"width": DOOR[1] - DOOR[0], "height": DOOR_H}  # the double door, fitted to its doorway
    # A plank door that swings out of the Storeroom (its +Y, the room side, points in).
    store_x = (STORE_DOOR[0] + STORE_DOOR[1]) / 2
    m("door-0", (store_x, y0 - DOOR_DEPTH / 2, 0.0), toward=(0, 1), key="key", type="simple-wood-door")
    m("door-1", (door_x, STAIR_END, -DROP), toward=(0, 1), **size)
    m("socket-door-0", (door_x, STAIR_END - DOOR_DEPTH - 0.05, -DROP))
    m("lootable-corpse-0", (15.2, -10.7, 0.0), toward=(0, 1), holds="key")  # the middle aisle
    m("lootable-crate-0", (18.1, -10.8, 0.0), toward=(0, 1))  # the middle aisle
    m("lootable-crate-1", (17.9, y1 - 0.8, 0.0), toward=(0, 1))  # by the crack
    m("lootable-crate-2", (x0 + 1.3, y0 + 0.6, 0.0), toward=(0, -1))  # by the door
    m("lootable-crate-3", (14.4, y1 - 0.5, 0.0), toward=(0, 1))
    end, side, _ = frames[-1]
    side = side.normalized()
    back = (frames[-2][0] - end).normalized()
    m("lootable-bonePile-0", tuple(end + back * 4.7 + side * -WALKWAY_Y), toward=tuple(back.xy * -1))
    grate, _, _ = next(f for f in frames if abs(f[2] - GRATE_AT) < 1e-3)
    # Sounds (sound-<id>-<n>): what the room needs recorded. Silent until it is.
    m("sound-sewer.flow-0", tuple(grate + Vector((0, 0, 0.3))))
    m("sound-sewer.drip-0", (5.0, 0.6, 3.6))
    m("sound-sewer.drip-1", (-8.0, -0.6, 3.6))


def lights(coll, root):
    """What the bake is lit by (never exported: the game's light is the lightmap): daylight down
    the manhole and the two tubes, a lamp just under each opening, shining down. Everything else
    in the way in is dark: the headlamp's to light."""
    import bpy

    def lamp(name, x0, x1, a, b, watts, spread):
        data = bpy.data.lights.new(name, "AREA")
        data.shape = "RECTANGLE"
        data.size, data.size_y = x1 - x0, b - a
        data.energy = watts
        data.color = (1.0, 0.96, 0.88)
        # Narrow: it comes down from the sky, not sideways into the shaft's walls.
        data.spread = math.radians(spread)
        obj = bpy.data.objects.new(name, data)
        obj.location = ((x0 + x1) / 2, -(a + b) / 2, SURFACE - 0.1)
        coll.objects.link(obj)
        obj.parent = root

    (mx0, mx1), (ma, mb_) = MANHOLE
    lamp("bake-daylight-manhole", mx0, mx1, ma, mb_, *DAYLIGHT["manhole"])
    for k, ((tx0, tx1), (ta, tb)) in enumerate(TUBES):
        lamp(f"bake-daylight-tube-{k}", tx0, tx1, ta, tb, *DAYLIGHT["tube"])


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if "--export" not in args and "--bake" not in args:
        blend = os.path.join(common.BLEND_DIR, NAME + ".blend")
        if os.path.exists(blend) and "--force" not in args:
            # Its hand edits would be lost: rebuild only on purpose.
            raise SystemExit(f"{os.path.relpath(blend, common.REPO)} exists: export it (-- --export), or rebuild with -- --force")
        build()
    if "--bake" in args or "--export" not in args:
        import bpy

        mesh = bpy.data.objects[NAME + "-mesh"]
        path, peak = common.bake_lightmap(mesh, os.path.join(common.EXPORT_DIR, NAME + ".lightmap.png"))
        print(f"  {os.path.relpath(path, common.REPO)} (brightest {peak:.2f})")
        # The light probes, from the lightmap just baked: what lights anything that moves.
        import time

        import probes

        started = time.time()
        lamps = [o for o in bpy.data.objects if o.type == "LIGHT" and o.name.startswith("bake-")]
        probe_path = os.path.join(common.EXPORT_DIR, NAME + ".probes.bin")
        inside, total = probes.bake_probes(mesh, bpy.data.images[mesh.name + "-lightmap"], lamps, probe_path)
        print(f"  {os.path.relpath(probe_path, common.REPO)}: {inside} of {total} probes in the room, {time.time() - started:.0f} s")
    if "--export" not in args:
        print("  " + os.path.relpath(common.save_blend(NAME), common.REPO))
    print("  " + os.path.relpath(common.export_room(NAME), common.REPO))


if __name__ == "__main__":
    main()
