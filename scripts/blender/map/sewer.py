"""The way in (#150): the Sewer, the crack, the Storeroom and the First Stair, as one room.

Grey box: flat colours, simple shapes, real collision and markers, to walk in the room viewer
before anything is modelled. Builds art/blender/rooms/sewer.blend (refusing to replace one that
exists: from then on the .blend is the source, edited by hand) and exports
art/export/rooms/sewer.glb. Headless:

    blender -b --factory-startup -P scripts/blender/map/sewer.py            # build, save, export
    blender -b --factory-startup -P scripts/blender/map/sewer.py -- --force # rebuild over hand edits
    blender -b art/blender/rooms/sewer.blend -P scripts/blender/map/sewer.py -- --export

Layout, Blender axes (+Y north, Z up, metres). The tunnel runs west to east along y = 0, its floor
(the walkway) at z = 0, with a bend down to the south near each end:

    grate (west end)  ...  ladder at x = 0 (north side)  ...  crack at x = 17 (south side)  ...  collapse (east end)

The walkway is on the north side, the ladder's; the channel (wadeable) fills the rest. The crack is
a crawl south from the channel to the Storeroom; the Storeroom's locked door, in its south wall,
opens onto the First Stair down to the next door (the seam to the Parish Walk).
"""

import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from common import kit  # noqa: E402

NAME = "sewer"

common.add_materials(
    {
        "mat-sewer-wall": {"color": (0.42, 0.42, 0.40), "roughness": 0.9},
        "mat-sewer-walkway": {"color": (0.55, 0.54, 0.50), "roughness": 0.9},
        "mat-sewer-channel": {"color": (0.24, 0.24, 0.22), "roughness": 0.7},
        "mat-sewer-end": {"color": (0.01, 0.01, 0.01), "roughness": 1.0},
        "mat-iron": {"color": (0.18, 0.12, 0.09), "roughness": 0.6},
        "mat-storeroom-wall": {"color": (0.45, 0.30, 0.24), "roughness": 0.9},
        "mat-storeroom-floor": {"color": (0.30, 0.26, 0.22), "roughness": 0.9},
        "mat-timber": {"color": (0.33, 0.24, 0.16), "roughness": 0.85},
        "mat-drum": {"color": (0.22, 0.26, 0.20), "roughness": 0.6},
        "mat-stair": {"color": (0.50, 0.47, 0.42), "roughness": 0.9},
        "mat-rubble": {"color": (0.36, 0.35, 0.33), "roughness": 1.0},
        "mat-ladder": {"color": (0.15, 0.10, 0.07), "roughness": 0.6},
    }
)

# The tunnel
HALF_W = 2.0  # walls at 2 m either side of the middle: 4 m wide
SPRING = 2.6  # vertical walls to here (the ladder's bay is this high), then the vault...
RISE = 1.4  # ...rising this much more (apex 4 m over the walkway)
WALKWAY_EDGE = -0.4  # lateral, from the middle (+ is south): the walkway is north of this
CHANNEL = -0.35  # the channel's floor: under a step (MOVEMENT.stepHeight 0.4), waded
WATER = -0.05  # the water's surface: 0.3 m deep
PATH = [(-27.0, -2.6), (-21.0, 0.0), (21.0, 0.0), (27.0, -2.6)]
BEND = math.hypot(6.0, 2.6)  # length of each end's bend, before x = -21 and after x = 21
GRATE_AT = 2.5  # m along the tunnel from its west end
WALKWAY_Y = (HALF_W - WALKWAY_EDGE) / 2  # the walkway's middle (north is +y)
WALL_T = 0.5  # collision walls' thickness
WALL_TOP = SPRING + 0.4  # and the walls' height, into the foot of the vault

# The ladder's shaft, off the north wall at x = 0
SHAFT = (-0.6, 0.6)  # x
SHAFT_Y = (HALF_W, HALF_W + 1.0)
SHAFT_TOP = 8.0  # the street

# The crack, in the south wall at x = 17: a crawl south to the Storeroom
CRACK = (16.5, 17.5)  # x
CRACK_H = 1.0  # crawl only (MOVEMENT crawl height 0.7, crouch 1.2)

# The Storeroom
STORE_X = (12.0, 23.0)  # 11 m...
STORE_Y = (-12.8, -4.8)  # ...by 8 m
STORE_H = 4.0
DOOR = (14.0, 16.0)  # x: the doorway in its south wall
DOOR_H = 2.6

# The First Stair, south from the door
STAIR_X = (13.5, 16.5)  # 3 m wide
STAIR_TOP = STORE_Y[0] - 1.8  # y: the top landing runs from the door to here
RISERS, RISE_H, TREAD = 20, 0.2, 0.32
STAIR_FOOT = STAIR_TOP - RISERS * TREAD  # y of the last riser
STAIR_END = STAIR_FOOT - 2.5  # the bottom landing, to the next door
DROP = RISERS * RISE_H  # 4 m down
HEADROOM = 3.2


def along(s):
    """Distance along the tunnel of a point at x on its straight middle."""
    return BEND + 21.0 + s


def profile():
    """The tunnel's cross-section, (lateral, z, material) going round: south wall, vault, north
    wall, walkway, its edge, the channel's floor. Returns it and the segments the holes are in."""
    W = "mat-sewer-wall"
    pts = [(HALF_W, CHANNEL, W), (HALF_W, 0.0, W), (HALF_W, CRACK_H, W), (HALF_W, SPRING, W)]
    for k in range(1, 10):
        a = math.pi * k / 10
        pts.append((HALF_W * math.cos(a), SPRING + RISE * math.sin(a), W))
    bay = len(pts)
    pts.append((-HALF_W, SPRING, W))
    pts.append((-HALF_W, 0.0, "mat-sewer-walkway"))
    pts.append((WALKWAY_EDGE, 0.0, W))
    pts.append((WALKWAY_EDGE, CHANNEL, "mat-sewer-channel"))
    return pts, 1, bay


def vault_height(lateral):
    return SPRING + RISE * math.sqrt(max(0.0, 1 - (lateral / HALF_W) ** 2))


def build():
    common.empty_scene()
    coll, root = common.room_collection(NAME)
    common.emissive_material("mat-daylight", (1.0, 0.95, 0.85), 6.0)
    mb = kit.MeshBuilder(NAME + "-mesh")

    pts, crack_seg, bay_seg = profile()
    shaft_s = (along(SHAFT[0]), along(SHAFT[1]))
    crack_s = (along(CRACK[0]), along(CRACK[1]))
    frames = common.polyline_frames(
        [(x, y, 0.0) for x, y in PATH], breaks=[*shaft_s, *crack_s, GRATE_AT], step=1.0
    )

    def skip(i, seg):
        mid = (frames[i][2] + frames[i + 1][2]) / 2
        if seg == crack_seg:
            return crack_s[0] < mid < crack_s[1]
        if seg == bay_seg:
            return shaft_s[0] < mid < shaft_s[1]
        return False

    rings = common.sweep(mb, pts, frames, skip)
    tunnel(mb, coll, root, frames, rings)
    shaft(mb, coll, root)
    crack(mb, coll, root)
    storeroom(mb, coll, root)
    stair(mb, coll, root)
    mb.finish(coll, root)
    markers(coll, root, frames)
    return coll


def tunnel(mb, coll, root, frames, rings):
    up = Vector((0, 0, 1))
    # The ends: dark where the sewer goes on past the grate, a wall behind the collapse.
    mb.face(rings[0], "mat-sewer-end", facing=frames[1][0] - frames[0][0])
    mb.face(rings[-1], "mat-sewer-wall", facing=frames[-2][0] - frames[-1][0])
    # The water over the channel.
    for (o0, l0, _), (o1, l1, _) in zip(frames, frames[1:]):
        quad = [o0 + l0 * WALKWAY_EDGE, o0 + l0 * HALF_W, o1 + l1 * HALF_W, o1 + l1 * WALKWAY_EDGE]
        mb.face([p + up * WATER for p in quad], "mat-water", facing=(0, 0, 1))

    # The grate, across the whole tunnel: bars a hand apart, two crossbars.
    o, lat, _ = next(f for f in frames if abs(f[2] - GRATE_AT) < 1e-3)
    fwd = lat.cross(up).normalized() * -1
    s = -HALF_W + 0.08
    while s < HALF_W - 0.04:
        foot = CHANNEL if s > WALKWAY_EDGE else 0.0
        top = vault_height(s)
        c = o + lat * s
        mb.box((c.x - 0.025, c.y - 0.025, foot), (c.x + 0.025, c.y + 0.025, top), "mat-iron")
        s += 0.16
    for z in (0.9, 1.9):
        half = math.sqrt(max(0.0, 1 - ((z - SPRING) / RISE) ** 2)) * HALF_W if z > SPRING else HALF_W
        a, b = o + lat * -half + up * z, o + lat * half + up * z
        bar(mb, a, b, fwd, 0.04, "mat-iron")

    # Collision, segment by segment: the walkway, the channel's floor, the walls and the vault.
    for i, ((x0, y0), (x1, y1)) in enumerate(zip(PATH, PATH[1:])):
        a, b = Vector((x0, y0, 0)), Vector((x1, y1, 0))
        d = b - a
        length = d.length + 0.6  # a little past each end, to close the mitres
        yaw = math.atan2(d.y, d.x)
        side = d.normalized().cross(up)  # lateral: to the right, the south

        def box(name, lat_lo, lat_hi, z_lo, z_hi, s_lo=None, s_hi=None):
            s0 = -0.3 if s_lo is None else s_lo
            s1 = d.length + 0.3 if s_hi is None else s_hi
            mid = a + d.normalized() * ((s0 + s1) / 2) + side * ((lat_lo + lat_hi) / 2)
            common.col(
                coll, root, name, (mid.x, mid.y, (z_lo + z_hi) / 2), (s1 - s0, lat_hi - lat_lo, z_hi - z_lo), yaw=yaw
            )

        box(f"col-walkway-{i}", -HALF_W, WALKWAY_EDGE, CHANNEL - 0.3, 0.0)
        box(f"col-channel-{i}", WALKWAY_EDGE, HALF_W, CHANNEL - 0.3, CHANNEL)
        # The vault: over the middle, and lower towards the walls (kept off the shaft, north of them).
        box(f"col-vault-{i}", -HALF_W, HALF_W, SPRING + RISE, SPRING + RISE + 0.4)
        box(f"col-vault-n-{i}", -HALF_W, -0.65 * HALF_W, SPRING + 0.35 * RISE, SPRING + RISE + 0.4)
        box(f"col-vault-s-{i}", 0.65 * HALF_W, HALF_W, SPRING + 0.35 * RISE, SPRING + RISE + 0.4)
        vol = kit.vol_box(coll, root, f"vol-water-{i}", (-0.5, -0.5, -0.5), (0.5, 0.5, 0.5))
        mid = a + d / 2 + side * ((WALKWAY_EDGE + HALF_W) / 2)
        vol.location = (mid.x, mid.y, (CHANNEL + WATER) / 2)
        vol.scale = (d.length + 0.6, HALF_W - WALKWAY_EDGE, WATER - CHANNEL)
        vol.rotation_euler = (0, 0, yaw)
        if i == 1:
            # The straight middle: the shaft's bay in the north wall, the crack in the south.
            n0, n1 = SHAFT[0] - x0, SHAFT[1] - x0
            c0, c1 = CRACK[0] - x0, CRACK[1] - x0
            # Over the bay, nothing: the shaft goes up from it.
            box("col-wall-n-mid-0", -HALF_W - WALL_T, -HALF_W, 0.0, WALL_TOP, None, n0)
            box("col-wall-n-mid-1", -HALF_W - WALL_T, -HALF_W, 0.0, WALL_TOP, n1, None)
            box("col-wall-s-mid-0", HALF_W, HALF_W + WALL_T, CHANNEL, WALL_TOP, None, c0)
            box("col-wall-s-mid-1", HALF_W, HALF_W + WALL_T, CHANNEL, WALL_TOP, c1, None)
            box("col-wall-s-mid-2", HALF_W, HALF_W + WALL_T, CRACK_H, WALL_TOP, c0, c1)
        else:
            box(f"col-wall-n-{i}", -HALF_W - WALL_T, -HALF_W, 0.0, WALL_TOP)
            box(f"col-wall-s-{i}", HALF_W, HALF_W + WALL_T, CHANNEL, WALL_TOP)
    # The grate and the two ends.
    gyaw = math.atan2(fwd.y, fwd.x)
    common.col(coll, root, "col-grate", (o.x, o.y, 1.2), (0.1, 2 * HALF_W, 3.2), yaw=gyaw)
    for name, (p, _, _), (q, _, _) in (("col-end-w", frames[0], frames[1]), ("col-end-e", frames[-1], frames[-2])):
        out = (p - q).normalized()
        c = p + out * 0.25
        common.col(coll, root, name, (c.x, c.y, 1.2), (0.5, 2 * HALF_W + 1, 3.6), yaw=math.atan2(out.y, out.x))
    # The collapse: rock heaped against the east end.
    end, end_lat, _ = frames[-1]
    back = (frames[-2][0] - end).normalized()
    for k, (dist, lat_off, size) in enumerate(
        ((0.6, -1.0, 0.9), (0.7, 0.4, 1.0), (1.4, 1.2, 0.7), (1.5, -0.3, 0.8), (2.2, 0.6, 0.5), (0.5, 1.5, 0.7))
    ):
        p = end + back * dist + end_lat * lat_off
        z = 0.0 if lat_off < WALKWAY_EDGE else CHANNEL
        kit.rubble(mb, p.x, p.y, z, size, seed=3.1 + k, mat="mat-rubble")
    heap = end + back * 1.0
    common.col(coll, root, "col-collapse", (heap.x, heap.y, 0.2), (2.0, 2 * HALF_W, 1.0), yaw=math.atan2(back.y, back.x))


def bar(mb, a, b, normal, thickness, mat):
    """A square bar from a to b."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    n = Vector(normal).normalized() * thickness / 2
    m = d.cross(n).normalized() * thickness / 2
    corners = [n + m, n - m, -n - m, -n + m]
    for k in range(4):
        c0, c1 = corners[k], corners[(k + 1) % 4]
        out = (c0 + c1) / 2
        mb.face([a + c0, a + c1, b + c1, b + c0], mat, facing=out)


def shaft(mb, coll, root):
    """The manhole's shaft, up from a bay in the north wall to the street, the ladder on its far wall."""
    x0, x1 = SHAFT
    y0, y1 = SHAFT_Y
    W = "mat-sewer-wall"
    mb.face([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], "mat-sewer-walkway", facing=(0, 0, 1))
    mb.face([(x0, y0, 0), (x0, y1, 0), (x0, y1, SHAFT_TOP), (x0, y0, SHAFT_TOP)], W, facing=(1, 0, 0))
    mb.face([(x1, y0, 0), (x1, y1, 0), (x1, y1, SHAFT_TOP), (x1, y0, SHAFT_TOP)], W, facing=(-1, 0, 0))
    mb.face([(x0, y1, 0), (x1, y1, 0), (x1, y1, SHAFT_TOP), (x0, y1, SHAFT_TOP)], W, facing=(0, -1, 0))
    mb.face([(x0, y0, SPRING), (x1, y0, SPRING), (x1, y0, SHAFT_TOP), (x0, y0, SHAFT_TOP)], W, facing=(0, 1, 0))
    # Daylight through the manhole's cover holes: the one bright thing in the sewer.
    top = SHAFT_TOP - 0.05
    mb.face([(x0, y0, top), (x1, y0, top), (x1, y1, top), (x0, y1, top)], "mat-daylight", facing=(0, 0, -1))
    # Rungs fixed to the far wall, like a real manhole's.
    rungs(mb, y1, 0.3, SHAFT_TOP - 0.2)
    common.col_span(coll, root, "col-shaft-floor", (x0, y0, -0.3), (x1, y1, 0.0))
    common.col_span(coll, root, "col-shaft-w", (x0 - WALL_T, y0, 0.0), (x0, y1, SHAFT_TOP + 0.5))
    common.col_span(coll, root, "col-shaft-e", (x1, y0, 0.0), (x1 + WALL_T, y1, SHAFT_TOP + 0.5))
    common.col_span(coll, root, "col-shaft-n", (x0 - WALL_T, y1, 0.0), (x1 + WALL_T, y1 + WALL_T, SHAFT_TOP + 0.5))
    common.col_span(coll, root, "col-shaft-s", (x0, y0 - WALL_T, SPRING + RISE), (x1, y0, SHAFT_TOP + 0.5))
    common.col_span(coll, root, "col-shaft-top", (x0, y0, SHAFT_TOP), (x1, y1, SHAFT_TOP + 0.5))


def rungs(mb, wall_y, z0, z1, half_w=0.22, step=0.3):
    """Iron rungs set in a wall (at y = wall_y, facing south), from z0 up to z1, and the two
    stiles they hang between."""
    out = 0.14  # how far they stand off the wall
    for x in (-half_w, half_w):
        mb.box((x - 0.02, wall_y - out - 0.02, 0.0), (x + 0.02, wall_y - out + 0.02, z1), "mat-iron")
    z = z0
    while z <= z1:
        mb.box((-half_w, wall_y - out - 0.02, z - 0.02), (half_w, wall_y - out + 0.02, z + 0.02), "mat-iron")
        z += step


def crack(mb, coll, root):
    """The crawl from the channel's south wall to the Storeroom's north wall."""
    x0, x1 = CRACK
    y0, y1 = STORE_Y[1], -HALF_W
    common.inward_box(mb, (x0, y0, 0.0), (x1, y1, CRACK_H), "mat-sewer-wall", skip={"+y", "-y"})
    common.col_span(coll, root, "col-crack-floor", (x0, y0, -0.3), (x1, y1, 0.0))
    common.col_span(coll, root, "col-crack-w", (x0 - WALL_T, y0, 0.0), (x0, y1, CRACK_H + 0.4))
    common.col_span(coll, root, "col-crack-e", (x1, y0, 0.0), (x1 + WALL_T, y1, CRACK_H + 0.4))
    common.col_span(coll, root, "col-crack-top", (x0, y0, CRACK_H), (x1, y1, CRACK_H + 0.4))


def storeroom(mb, coll, root):
    """Brick and rotting timber: shelves down both side walls, drums, coffin boards."""
    (x0, x1), (y0, y1), h = STORE_X, STORE_Y, STORE_H
    W, F = "mat-storeroom-wall", "mat-storeroom-floor"
    mb.face([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], F, facing=(0, 0, 1))
    mb.face([(x0, y0, h), (x1, y0, h), (x1, y1, h), (x0, y1, h)], W, facing=(0, 0, -1))
    common.wall_with_hole(mb, (x0, y1), (x1, y1), 0, h, W, (0, -1, 0), [(CRACK[0] - x0, CRACK[1] - x0, 0, CRACK_H)])
    common.wall_with_hole(mb, (x0, y0), (x1, y0), 0, h, W, (0, 1, 0), [(DOOR[0] - x0, DOOR[1] - x0, 0, DOOR_H)])
    common.wall_with_hole(mb, (x0, y0), (x0, y1), 0, h, W, (1, 0, 0), [])
    common.wall_with_hole(mb, (x1, y0), (x1, y1), 0, h, W, (-1, 0, 0), [])

    common.col_span(coll, root, "col-store-floor", (x0, y0, -0.3), (x1, y1, 0.0))
    common.col_span(coll, root, "col-store-ceiling", (x0, y0, h), (x1, y1, h + 0.4))
    common.col_span(coll, root, "col-store-w", (x0 - WALL_T, y0, 0), (x0, y1, h))
    common.col_span(coll, root, "col-store-e", (x1, y0, 0), (x1 + WALL_T, y1, h))
    common.col_span(coll, root, "col-store-n-0", (x0, y1, 0), (CRACK[0], y1 + WALL_T, h))
    common.col_span(coll, root, "col-store-n-1", (CRACK[1], y1, 0), (x1, y1 + WALL_T, h))
    common.col_span(coll, root, "col-store-n-2", (CRACK[0], y1, CRACK_H), (CRACK[1], y1 + WALL_T, h))
    common.col_span(coll, root, "col-store-s-0", (x0, y0 - WALL_T, 0), (DOOR[0], y0, h))
    common.col_span(coll, root, "col-store-s-1", (DOOR[1], y0 - WALL_T, 0), (x1, y0, h))
    common.col_span(coll, root, "col-store-s-2", (DOOR[0], y0 - WALL_T, DOOR_H), (DOOR[1], y0, h))

    # Shelves along the east and west walls, solid to the floor for the grey box.
    for name, lo, hi in (
        ("col-shelf-e", (x1 - 0.6, y0 + 0.8, 0), (x1, y1 - 1.2, 2.2)),
        ("col-shelf-w", (x0, y0 + 2.4, 0), (x0 + 0.6, y1 - 1.0, 2.2)),
    ):
        mb.box(lo, hi, "mat-timber", skip={"-z"})
        common.col_span(coll, root, name, lo, hi)
    # Oil drums in a cluster, and coffin boards stacked against the north wall.
    for k, (x, y) in enumerate(((x1 - 1.6, y0 + 0.9), (x1 - 2.3, y0 + 0.7), (x1 - 1.8, y0 + 1.6))):
        lo, hi = (x - 0.3, y - 0.3, 0), (x + 0.3, y + 0.3, 0.9)
        mb.box(lo, hi, "mat-drum", skip={"-z"})
        common.col_span(coll, root, f"col-drum-{k}", lo, hi)
    lo, hi = (x0 + 0.8, y1 - 0.5, 0), (x0 + 2.6, y1 - 0.1, 0.6)
    mb.box(lo, hi, "mat-timber", skip={"-z"})
    common.col_span(coll, root, "col-boards", lo, hi)


def stair(mb, coll, root):
    """The First Stair: a top landing behind the door, a flight down, a landing to the next door."""
    (x0, x1) = STAIR_X
    y_door = STORE_Y[0]
    S = "mat-stair"
    # The wall around the doorway, seen from the stair side.
    common.wall_with_hole(mb, (x0, y_door), (x1, y_door), 0, HEADROOM, S, (0, -1, 0), [(DOOR[0] - x0, DOOR[1] - x0, 0, DOOR_H)])
    # Floors: the landings and the steps.
    mb.face([(x0, STAIR_TOP, 0), (x1, STAIR_TOP, 0), (x1, y_door, 0), (x0, y_door, 0)], S, facing=(0, 0, 1))
    mb.face([(x0, STAIR_END, -DROP), (x1, STAIR_END, -DROP), (x1, STAIR_FOOT, -DROP), (x0, STAIR_FOOT, -DROP)], S, facing=(0, 0, 1))
    for k in range(RISERS):
        y = STAIR_TOP - k * TREAD
        z_hi, z_lo = -k * RISE_H, -(k + 1) * RISE_H
        mb.face([(x0, y, z_lo), (x1, y, z_lo), (x1, y, z_hi), (x0, y, z_hi)], S, facing=(0, -1, 0))
        mb.face([(x0, y - TREAD, z_lo), (x1, y - TREAD, z_lo), (x1, y, z_lo), (x0, y, z_lo)], S, facing=(0, 0, 1))
    # Ceiling: flat over each landing, sloping with the flight.
    top, foot = HEADROOM, HEADROOM - DROP
    mb.face([(x0, STAIR_TOP, top), (x1, STAIR_TOP, top), (x1, y_door, top), (x0, y_door, top)], S, facing=(0, 0, -1))
    mb.face([(x0, STAIR_FOOT, foot), (x1, STAIR_FOOT, foot), (x1, STAIR_TOP, top), (x0, STAIR_TOP, top)], S, facing=(0, 0, -1))
    mb.face([(x0, STAIR_END, foot), (x1, STAIR_END, foot), (x1, STAIR_FOOT, foot), (x0, STAIR_FOOT, foot)], S, facing=(0, 0, -1))
    # Side walls, following the floor and the ceiling.
    outline = [
        (y_door, 0), (STAIR_TOP, 0), (STAIR_FOOT, -DROP), (STAIR_END, -DROP),
        (STAIR_END, foot), (STAIR_FOOT, foot), (STAIR_TOP, top), (y_door, top),
    ]
    mb.face([(x0, y, z) for y, z in outline], S, facing=(1, 0, 0))
    mb.face([(x1, y, z) for y, z in outline], S, facing=(-1, 0, 0))
    # The far end, round the next door: where the Parish Walk joins.
    common.wall_with_hole(
        mb, (x0, STAIR_END), (x1, STAIR_END), -DROP, foot, S, (0, 1, 0), [(DOOR[0] - x0, DOOR[1] - x0, 0, DOOR_H)]
    )

    common.col_span(coll, root, "col-stair-top", (x0, STAIR_TOP, -0.3), (x1, y_door, 0.0))
    common.col_span(coll, root, "col-stair-bottom", (x0, STAIR_END, -DROP - 0.3), (x1, STAIR_FOOT, -DROP))
    run = STAIR_TOP - STAIR_FOOT
    length = math.hypot(run, DROP)
    cy, cz = (STAIR_TOP + STAIR_FOOT) / 2, -DROP / 2
    common.col(coll, root, "col-stair-ramp", ((x0 + x1) / 2, cy, cz), (x1 - x0, length, 0.3), pitch=math.atan2(DROP, run))
    common.col_span(coll, root, "col-stair-w", (x0 - WALL_T, STAIR_END, -DROP), (x0, y_door, HEADROOM))
    common.col_span(coll, root, "col-stair-e", (x1, STAIR_END, -DROP), (x1 + WALL_T, y_door, HEADROOM))
    common.col_span(coll, root, "col-stair-ceiling", (x0, STAIR_TOP, top), (x1, y_door, top + 0.4))
    # Until the Parish Walk is joined on, nothing is past the next door: a wall stands in for it.
    common.col_span(coll, root, "col-seam-0", (x0, STAIR_END - WALL_T, -DROP), (x1, STAIR_END, foot))


def markers(coll, root, frames):
    def m(name, loc, toward=None, **props):
        return common.marker(coll, root, name, loc, toward, **props)

    # Spawns on the walkway either side of the ladder's bay, facing it.
    for k, x in enumerate((-1.2, 1.2, -2.2, 2.2)):
        m(f"spawn-{k}", (x, WALKWAY_Y, 0.0), toward=(-x, 1.2))
    # The way you came in, always open: the foot of the ladder.
    m("extract-0", (0.0, HALF_W + 0.45, 0.0))
    # The Storeroom's door, locked until opened with the key; one of the dead holds it.
    m("door-0", ((DOOR[0] + DOOR[1]) / 2, STORE_Y[0], 0.0), toward=(0, 1), key="key")
    m("door-1", ((DOOR[0] + DOOR[1]) / 2, STAIR_END, -DROP), toward=(0, 1))
    m("socket-door-0", ((DOOR[0] + DOOR[1]) / 2, STAIR_END - 0.25, -DROP))
    (x0, x1), (y0, y1) = STORE_X, STORE_Y
    m("lootable-corpse-0", (18.8, y1 - 0.6, 0.0), toward=(0, 1), holds="key")
    m("lootable-corpse-1", (16.2, -8.0, 0.0), toward=(-1, 0))
    m("lootable-corpse-2", (x0 + 1.2, y0 + 0.6, 0.0), toward=(0, -1))
    m("lootable-crate-0", (x1 - 1.0, y1 - 0.8, 0.0), toward=(1, 0))
    # Rats: in the dark either side, and at the collapse.
    m("creature-0", (-15.0, WALKWAY_Y, 0.0))
    m("creature-1", (11.0, WALKWAY_Y, 0.0))
    end, end_lat, _ = frames[-1]
    back = (frames[-2][0] - end).normalized()
    nest = end + back * 2.8 + end_lat * -1.1
    m("creature-2", tuple(end + back * 3.5 + end_lat * -1.1))
    m("lootable-ratNest-0", tuple(nest), toward=tuple(end_lat.xy * -1))
    m("rubble-0", tuple(end + back * 2.4 + end_lat * 0.6 + Vector((0, 0, CHANNEL))))
    grate, grate_lat, _ = next(f for f in frames if abs(f[2] - GRATE_AT) < 1e-3)
    satchel = grate + (frames[0][0] - grate).normalized() * -1.0 + grate_lat * -1.2
    m("lootable-satchel-0", tuple(satchel), toward=tuple(grate_lat.xy * -1))
    # Sounds (sound-<id>-<n>): what the room needs recorded. Silent until it is.
    m("sound-sewer.flow-0", tuple(grate + Vector((0, 0, 0.3))))
    m("sound-sewer.draught-0", ((CRACK[0] + CRACK[1]) / 2, -HALF_W - 0.1, 0.5))
    m("sound-sewer.street-0", (0.0, HALF_W + 0.5, SHAFT_TOP - 0.5))
    m("sound-sewer.drip-0", (8.0, 0.6, 2.6))
    m("sound-sewer.drip-1", (-12.0, -0.6, 2.6))
    m("sound-storeroom.settle-0", ((x0 + x1) / 2, (y0 + y1) / 2, STORE_H - 0.5))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if "--export" not in args:
        blend = os.path.join(common.BLEND_DIR, NAME + ".blend")
        if os.path.exists(blend) and "--force" not in args:
            # Its hand edits would be lost: rebuild only on purpose.
            raise SystemExit(f"{os.path.relpath(blend, common.REPO)} exists: export it (-- --export), or rebuild with -- --force")
        build()
        print("  " + os.path.relpath(common.save_blend(NAME), common.REPO))
    print("  " + os.path.relpath(common.export_room(NAME), common.REPO))


if __name__ == "__main__":
    main()
