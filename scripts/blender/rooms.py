"""The new rooms of the gear, crafting and loot round (docs/handoff-gear-crafting-loot.md#new-rooms):
thirteen connector rooms and dead ends, and three rooms that are only reached on a rope. Built
like the rest of the kit (kit.py), into art/blender/catacomb-kit.blend.

Run inside Blender (or headless: `blender --background art/blender/catacomb-kit.blend --python
scripts/blender/build_rooms.py`, which saves the .blend):

    import sys, importlib
    sys.path.insert(0, r"D:/Code/undercroft/scripts/blender")
    import kit, rooms; importlib.reload(rooms)
    rooms.build_all()             # rooms that don't exist yet
    rooms.build_vestry(force=True)  # DESTRUCTIVE: build one again, losing hand edits

Then the lootable markers (lootables.place_all), `pnpm asset:export` and `pnpm asset:build`. Their
gameplay (levels, banners, weights) is in src/lib/content/map/kit.ts.

What isn't built yet stands open: the webs of the Webbed Gallery, the Rockfall's rubble wall, the
Mausoleum's gate, the fonts. The rope rooms have a rope post until there are climbing pitons.
"""

import math

import bpy

import kit
from kit import (
    CELL,
    LEVEL,
    WALL_INSET,
    MeshBuilder,
    col_box,
    marker,
    rubble,
    socket,
    throat,
    vol_box,
    wall_cols,
)

# The rope rooms' drop: two levels, the floor of the way in 8 m over the foot.
ROPE_DROP = 2 * LEVEL

# Materials only these rooms use (added to kit.MATERIALS when the module loads).
kit.MATERIALS.setdefault("mat-wall-lime", {"color": (0.72, 0.70, 0.62), "roughness": 0.95})
kit.MATERIALS.setdefault("mat-web", {"color": (0.82, 0.81, 0.76), "roughness": 0.9})
kit.MATERIALS.setdefault("mat-iron", {"color": (0.08, 0.075, 0.07), "roughness": 0.6})
kit.MATERIALS.setdefault("mat-cloth", {"color": (0.22, 0.16, 0.12), "roughness": 1.0})
kit.MATERIALS.setdefault("mat-paper", {"color": (0.62, 0.56, 0.42), "roughness": 0.95})

ROOMS = [
    "vestry",
    "quarry-lodge",
    "smugglers-cellar",
    "pump-room",
    "rat-warren",
    "explorers-camp",
    "survey-station",
    "rockfall",
    "family-mausoleum",
    "webbed-gallery",
    "plague-pit",
    "drowned-chapel",
    "saints-crypt",
    "sinkhole",
    "broken-stair",
    "sunken-ossuary",
    # Rumors (the tutorial Affliction): the walk in and the training vault.
    "rumors-walk",
    "rumors-vault",
]


class Room:
    """A flat-ceilinged room of w x d cells with hall openings (sockets) where it says, and its
    colliders: floor, ceiling, walls with the openings cut. Dress it with `mb` (stone, the room's
    own mesh) and `props`, add solid things with `solid`, then `finish`.

    doors: (side, at): an opening on that side, `at` metres along it from the middle (x for n/s,
    y for e/w), on a cell's centre so it meets a hall.
    """

    def __init__(self, name, w, d, h, wall_mat, floor_mat, doors, force=False, niches=None, z0=0.0, levels=1, ceil_mat=None):
        self.name = name
        self.coll = kit.piece_collection(name, force)
        self.root = kit.root_empty(self.coll, name, w, d, levels=levels)
        self.hw, self.hd = w * CELL / 2, d * CELL / 2
        self.ix, self.iy = self.hw - WALL_INSET, self.hd - WALL_INSET
        self.h, self.z0 = h, z0
        self.wall, self.floor = wall_mat, floor_mat
        hall = kit.hall_profile()
        openings = {}
        for side, at in doors:
            s = at + (self.ix if side in "ns" else self.iy)
            openings.setdefault(side, []).append((s, hall))
        self.mb = MeshBuilder(name + "-mesh")
        self.props = MeshBuilder(name + "-props", colors=True)
        kit.chamber(self.mb, -self.ix, self.ix, -self.iy, self.iy, h, wall_mat, floor_mat, ceil_mat or wall_mat, openings=openings, niches=niches, z0=z0)
        self.niches = niches or {}
        for k, (side, at) in enumerate(doors):
            (ox, oy), _ = kit.SIDES[side]
            centre = (at, oy * self.iy) if side in "ns" else (ox * self.ix, at)
            throat(self.mb, centre, (ox, oy), 0, WALL_INSET, hall, wall_mat, floor_mat, z0=z0)
            edge = (at, oy * self.hd, z0) if side in "ns" else (ox * self.hw, at, z0)
            socket(self.coll, self.root, "hall", k, edge)
        hw, hd, t = self.hw, self.hd, WALL_INSET
        col_box(self.coll, self.root, "col-floor", (-hw, -hd, z0 - 0.2), (hw, hd, z0))
        col_box(self.coll, self.root, "col-ceiling", (-hw, -hd, z0 + h), (hw, hd, z0 + h + 0.4))
        cut = lambda side: [(at + (hw if side in "ns" else hd), 1.0, 2.8) for s, at in doors if s == side]
        wall_cols(self.coll, self.root, "wall-n", (-hw, self.iy), (hw, self.iy), z0, z0 + h, t, (0, 1), openings=cut("n"))
        wall_cols(self.coll, self.root, "wall-s", (-hw, -self.iy), (hw, -self.iy), z0, z0 + h, t, (0, -1), openings=cut("s"))
        wall_cols(self.coll, self.root, "wall-w", (-self.ix, -hd), (-self.ix, hd), z0, z0 + h, t, (-1, 0), openings=cut("w"))
        wall_cols(self.coll, self.root, "wall-e", (self.ix, -hd), (self.ix, hd), z0, z0 + h, t, (1, 0), openings=cut("e"))
        self._solids = 0

    def solid(self, lo, hi, mat, props=False, skip=("-z",)):
        """A box that stands in the way: drawn, and a collider."""
        (self.props if props else self.mb).box(lo, hi, mat, skip=skip)
        col_box(self.coll, self.root, f"col-solid-{self._solids}", lo, hi)
        self._solids += 1

    def creatures(self, points):
        for k, (x, y) in enumerate(points):
            marker(self.coll, self.root, f"creature-{k}", (x, y, self.z0), display="CONE", size=0.4)

    def rubble_markers(self, points):
        for k, (x, y) in enumerate(points):
            marker(self.coll, self.root, f"rubble-{k}", (x, y, self.z0), display="SPHERE", size=0.3)

    def finish(self):
        if self.niches:
            kit._niche_props(self.props, -self.ix, self.ix, -self.iy, self.iy, self.niches, seed=len(self.name))
        self.mb.finish(self.coll, self.root)
        if self.props.bm.faces:
            self.props.finish(self.coll, self.root, smooth_angle=60)
        else:
            self.props.bm.free()
        return self.coll


def _shelf(room, x0, x1, y, depth, z, mat="mat-prop-planks"):
    """A plank shelf along a wall at height z (y is the wall's face; depth out into the room)."""
    y0, y1 = sorted((y, y - depth if y > 0 else y + depth))
    room.props.box((x0, y0, z), (x1, y1, z + 0.04), mat)


def _hooks(room, x0, x1, y, z, count, mat="mat-cloth"):
    """Robes (or coats) hanging from pegs along a north or south wall."""
    inward = -1 if y > 0 else 1
    for k in range(count):
        x = x0 + (x1 - x0) * (k + 0.5) / count
        room.props.box((x - 0.04, y, z), (x + 0.04, y + inward * 0.12, z + 0.04), "mat-prop-planks")
        room.props.box((x - 0.22, y + inward * 0.02, z - 1.15), (x + 0.22, y + inward * 0.16, z), mat)


def _barrel(room, x, y, r=0.3, h=0.85, mat="mat-prop-planks", solid=True):
    """A barrel (an octagonal prism)."""
    segs = 8
    pts = [(x + r * math.cos(2 * math.pi * k / segs), y + r * math.sin(2 * math.pi * k / segs)) for k in range(segs)]
    z0, z1 = room.z0, room.z0 + h
    for k in range(segs):
        a, b = pts[k], pts[(k + 1) % segs]
        room.props.face([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], mat, facing=(a[0] + b[0] - 2 * x, a[1] + b[1] - 2 * y, 0))
    room.props.face([(px, py, z1) for px, py in pts], mat, facing=(0, 0, 1))
    if solid:
        col_box(room.coll, room.root, f"col-barrel-{room._solids}", (x - r, y - r, z0), (x + r, y + r, z1))
        room._solids += 1


# ---------------------------------------------------------------------------
# Connector rooms


def build_vestry(force=False):
    """2x1 cells: a small sacristy the hall passes through east to west. Robes on pegs along the
    north wall, a vesting table, candle shelves on the south wall."""
    room = Room("vestry", 2, 1, 3.2, "mat-wall-chapel", "mat-floor-chapel", [("w", 0), ("e", 0)], force=force)
    _hooks(room, -2.6, -0.6, room.iy, 2.0, 4)
    for z in (1.1, 1.6, 2.1):
        _shelf(room, 1.2, 3.2, -room.iy, 0.3, z)
    # The vesting table against the south wall, out of the way through.
    room.solid((-0.9, -room.iy, 0), (0.9, -room.iy + 0.6, 0.85), "mat-prop-planks", props=True)
    room.mb.box((-3.75, 1.45, 2.9), (3.75, 1.75, 3.2), "mat-trim-marble", skip=("+z",))
    room.creatures([(-2.5, 0.0), (2.5, 0.6)])
    return room.finish()


def build_quarry_lodge(force=False):
    """2x2 cells: the quarrymen's lodge. Benches, a cold iron stove, picks racked on the wall.
    Openings to the north, south and east."""
    room = Room("quarry-lodge", 2, 2, 3.4, "mat-wall-quarry", "mat-floor-quarry", [("n", 2), ("s", -2), ("e", 2)], force=force)
    # Benches by the west wall, clear of the way between the doors.
    for x in (-3.3, -2.3):
        room.solid((x - 0.25, -1.6, 0), (x + 0.25, 1.0, 0.45), "mat-prop-planks", props=True)
    room.solid((2.4, -3.3, 0), (3.4, -2.5, 0.9), "mat-iron", props=True)
    room.props.box((2.8, -2.95, 0.9), (3.0, -2.75, 3.4), "mat-iron", skip=("-z", "+z"))
    for k in range(5):
        x = -3.2 + k * 0.45
        room.props.box((x, room.iy - 0.08, 0.9), (x + 0.06, room.iy - 0.02, 2.1), "mat-prop-planks")
        room.props.box((x - 0.15, room.iy - 0.1, 1.95), (x + 0.21, room.iy - 0.04, 2.05), "mat-iron")
    room.creatures([(-2.5, -2.5), (1.5, 2.5)])
    return room.finish()


def build_smugglers_cellar(force=False):
    """2x1 cells: an old wine cellar used for contraband. Racks along the north wall, barrels, a
    trapdoor's worth of junk. The hall passes through east to west."""
    room = Room("smugglers-cellar", 2, 1, 2.9, "mat-wall-cistern", "mat-floor-cistern", [("w", 0), ("e", 0)], force=force)
    room.solid((-3.4, room.iy - 0.5, 0), (-0.4, room.iy, 2.0), "mat-prop-planks", props=True)
    for x, y in ((1.6, 1.2), (2.3, 1.2), (3.0, 1.0)):
        _barrel(room, x, y)
    room.creatures([(-2.8, -0.6), (2.6, -0.8)])
    return room.finish()


def build_explorers_camp(force=False):
    """2x2 cells: an abandoned camp. A cold fire ring in the middle, bedrolls, a stack of gear.
    Openings to the north, south and west."""
    room = Room("explorers-camp", 2, 2, 3.2, "mat-wall-tunnel", "mat-floor-tunnel", [("n", -2), ("s", 2), ("w", -2)], force=force)
    for k in range(8):
        a = 2 * math.pi * k / 8
        rubble(room.mb, 0.55 * math.cos(a), 0.55 * math.sin(a), 0, 0.12, seed=k + 600)
    room.props.box((-0.3, -0.05, 0.02), (0.3, 0.05, 0.1), "mat-prop-planks")
    room.props.box((-0.05, -0.3, 0.06), (0.05, 0.3, 0.14), "mat-prop-planks")
    for x, y, along in ((-2.6, 1.8, "x"), (2.2, 2.8, "x"), (2.9, -0.2, "y")):
        lo, hi = ((x - 0.95, y - 0.38), (x + 0.95, y + 0.38)) if along == "x" else ((x - 0.38, y - 0.95), (x + 0.38, y + 0.95))
        room.props.box((lo[0], lo[1], 0), (hi[0], hi[1], 0.12), "mat-cloth", skip=("-z",))
    room.solid((-3.4, -3.4, 0), (-2.4, -2.6, 0.7), "mat-prop-planks", props=True)
    room.creatures([(-1.8, -1.8), (2.2, 1.2)])
    return room.finish()


def build_family_mausoleum(force=False):
    """2x2 cells: a family's vault behind a locked iron gate (gate-0, a key or lockpicks). An
    antechamber to the south, the tombs beyond the gate's line to the north."""
    room = Room("family-mausoleum", 2, 2, 3.6, "mat-wall-chapel", "mat-floor-chapel", [("s", -2), ("e", -2)], force=force)
    # The gate's frame across the room: posts each side of an opening, a lintel over it.
    for x0, x1 in ((-3.75, -1.0), (1.0, 3.75)):
        room.solid((x0, 0.0, 0), (x1, 0.3, 3.6), "mat-trim-marble")
    room.mb.box((-1.0, 0.0, 2.6), (1.0, 0.3, 3.6), "mat-trim-marble", skip=("+z",))
    col_box(room.coll, room.root, "col-lintel", (-1.0, 0.0, 2.6), (1.0, 0.3, 3.6))
    # The gate itself is the game's (gate-0: a locked door, key or lockpicks). At yaw 0 its leaves
    # swing south, into the antechamber.
    kit.marker(room.coll, room.root, "gate-0", (0, 0.15, 0), display="ARROWS", size=0.6)
    room.creatures([(0.0, -2.2), (-2.0, 2.0)])
    return room.finish()


def build_webbed_gallery(force=False):
    """3x1 cells: a burial gallery spiders have taken over. Niches down both long walls, sheets of
    web across the corners (not yet in the way: cutting webs comes later)."""
    niches = {"n": kit.niche_grid(2 * 5.75, 6, 2), "s": kit.niche_grid(2 * 5.75, 6, 2)}
    room = Room("webbed-gallery", 3, 1, 3.2, "mat-wall-tunnel", "mat-floor-tunnel", [("w", 0), ("e", 0)], force=force, niches=niches)
    ix, iy = room.ix, room.iy
    for cx, cy in ((-ix, iy), (ix, iy), (-ix, -iy), (ix, -iy)):
        sx, sy = (1 if cx < 0 else -1), (1 if cy < 0 else -1)
        room.props.face([(cx, cy, 3.2), (cx + sx * 1.4, cy, 3.2), (cx, cy + sy * 1.1, 1.6)], "mat-web", facing=(sx, sy, -0.4))
    room.props.face([(-1.5, iy, 3.2), (1.5, iy, 3.2), (0.0, iy - 0.6, 2.2)], "mat-web", facing=(0, -1, -1))
    room.creatures([(-4.0, 0.0), (4.0, 0.0)])
    return room.finish()


def build_plague_pit(force=False):
    """2x2 cells: a mass grave under a lime-washed vault. Bones heaped in the middle, lime in drifts
    against the walls. Openings to the north and south."""
    room = Room("plague-pit", 2, 2, 3.6, "mat-wall-lime", "mat-floor-ossuary", [("n", 2), ("s", -2)], force=force)
    for k in range(9):
        a = k * 2.4
        r = 0.6 + 0.12 * k
        rubble(room.props, r * math.cos(a) * 0.9, r * math.sin(a) * 0.6, 0, 0.32 - 0.02 * k, seed=k + 700, mat="mat-bone")
    col_box(room.coll, room.root, "col-heap", (-1.3, -0.9, 0), (1.3, 0.9, 0.5))
    for k, (x, y, s) in enumerate([(-3.2, 3.1, 0.4), (3.1, -3.2, 0.45), (-3.3, -2.0, 0.3)]):
        rubble(room.mb, x, y, 0, s, seed=k + 720, mat="mat-wall-lime")
    room.creatures([(-2.4, 0.0), (2.4, 0.4)])
    return room.finish()


def build_saints_crypt(force=False):
    """2x1 cells: a small, rich crypt, all marble. A saint's tomb in the middle and a reliquary
    alcove in a wall. The hall passes through east to west. Rare."""
    room = Room("saints-crypt", 2, 1, 3.4, "mat-trim-marble", "mat-floor-chapel", [("w", 0), ("e", 0)], force=force)
    room.solid((-1.1, 0.6, 0), (1.1, 1.5, 0.9), "mat-column-marble")
    room.mb.box((-1.2, 0.5, 0.9), (1.2, 1.6, 1.0), "mat-trim-marble", skip=("-z",))
    for x in (-2.8, 2.8):
        kit._pillar(room.mb, x, -1.2, 0.22, 3.4, "mat-column-marble")
        col_box(room.coll, room.root, f"col-pillar-{x:+.0f}", (x - 0.34, -1.54, 0), (x + 0.34, -0.86, 3.4))
    room.creatures([(-2.6, 0.4)])
    return room.finish()


def build_pump_room(force=False):
    """2x2 cells, 2 levels: old waterworks, half flooded. A walkway round the walls at the
    entrances' level (level 1); the middle is a sunken basin, its water a little below the walkway.
    Rusted pumps on the walls. Openings to the north and south."""
    z = LEVEL
    room = Room("pump-room", 2, 2, 3.6, "mat-wall-cistern", "mat-floor-cistern", [("n", -2), ("s", 2)], force=force, z0=z, levels=2)
    _sunken_basin(room, (-2.2, 2.2, -1.6, 1.6), depth=1.5, water=1.3, mat="mat-basin")
    # In the corners away from the doors, so the walkway goes all the way round.
    for x, y in ((3.2, 3.2), (-3.2, -3.2)):
        room.solid((x - 0.35, y - 0.35, z), (x + 0.35, y + 0.35, z + 1.4), "mat-iron", props=True)
        room.props.box((x - 0.06, y - 0.06, z + 1.4), (x + 0.06, y + 0.06, z + 3.6), "mat-iron", skip=("-z", "+z"))
    room.creatures([(-3.0, 2.6), (3.0, -2.6)])
    return room.finish()


def build_drowned_chapel(force=False):
    """2x2 cells, 2 levels: a small chapel flooded to the pews. Walkways along the north, south and
    west walls at the entrances' level (dry all the way round, so nothing has to swim to get
    through); the nave is under water, pews and all, with the altar standing out of it at the east
    end. Openings to the north and south."""
    z = LEVEL
    room = Room("drowned-chapel", 2, 2, 3.6, "mat-wall-chapel", "mat-floor-chapel", [("n", -2), ("s", 2)], force=force, z0=z, levels=2)
    nave = (-2.3, 3.75, -2.2, 2.2)
    _sunken_basin(room, nave, depth=1.6, water=1.35, mat="mat-floor-chapel")
    floor = z - 1.6
    for y in (-1.3, -0.3, 0.7, 1.6):
        room.props.box((-1.9, y - 0.2, floor), (0.9, y + 0.2, floor + 0.5), "mat-prop-planks", skip=("-z",))
    room.solid((2.2, -0.9, floor), (3.3, 0.9, z + 0.9), "mat-trim-marble")
    room.creatures([(-2.6, 3.0), (2.6, -3.0)])
    return room.finish()


def _sunken_basin(room, rect, depth, water, mat):
    """A basin sunk into a room's floor (x0, x1, y0, y1): its floor `depth` below, water `water`
    deep in it. The room's floor collider is replaced round it."""
    x0, x1, y0, y1 = rect
    z = room.z0
    low = z - depth
    mb = room.mb
    # The room's floor face was drawn whole by chamber(): cover the basin's part with its walls and
    # floor below (the floor face above stays as the walkway, with the hole cut by colliders only
    # would show it, so lay the walkway again in four strips and drop the whole one).
    _drop_floor(mb, z)
    ix, iy = room.ix, room.iy
    for pts in (
        [(-ix, -iy), (ix, -iy), (ix, y0), (-ix, y0)],
        [(-ix, y1), (ix, y1), (ix, iy), (-ix, iy)],
        [(-ix, y0), (x0, y0), (x0, y1), (-ix, y1)],
        [(x1, y0), (ix, y0), (ix, y1), (x1, y1)],
    ):
        if abs(pts[0][0] - pts[1][0]) > 1e-3 and abs(pts[1][1] - pts[2][1]) > 1e-3:
            mb.face([(px, py, z) for px, py in pts], room.floor, facing=(0, 0, 1))
    mb.face([(x0, y0, low), (x1, y0, low), (x1, y1, low), (x0, y1, low)], mat, facing=(0, 0, 1))
    for (a, b), facing in (
        (((x0, y0), (x1, y0)), (0, 1, 0)),
        (((x0, y1), (x1, y1)), (0, -1, 0)),
        (((x0, y0), (x0, y1)), (1, 0, 0)),
        (((x1, y0), (x1, y1)), (-1, 0, 0)),
    ):
        kit.wall(mb, a, b, low, z, mat, facing)
    surface = low + water
    room.props.face([(x0, y0, surface), (x1, y0, surface), (x1, y1, surface), (x0, y1, surface)], "mat-water", facing=(0, 0, 1))
    vol_box(room.coll, room.root, "vol-water-0", (x0, y0, low), (x1, y1, surface))
    # Colliders: the floor round it, the basin's own floor and walls. The walkways are solid down to
    # the basin's floor, so they are its walls too (as in the Cistern): a swimmer at the edge has
    # something to mantle up, and nothing can swim under them out of the water.
    for obj in [o for o in room.root.children if o.name.split(".")[0] == "col-floor"]:
        bpy.data.objects.remove(obj, do_unlink=True)
    hw, hd = room.hw, room.hd
    col_box(room.coll, room.root, "col-walk-s", (-hw, -hd, low - 0.2), (hw, y0, z))
    col_box(room.coll, room.root, "col-walk-n", (-hw, y1, low - 0.2), (hw, hd, z))
    col_box(room.coll, room.root, "col-walk-w", (-hw, y0, low - 0.2), (x0, y1, z))
    col_box(room.coll, room.root, "col-walk-e", (x1, y0, low - 0.2), (hw, y1, z))
    col_box(room.coll, room.root, "col-basin-floor", (x0, y0, low - 0.2), (x1, y1, low))


def _drop_floor(mb, z):
    """Take out the whole floor face chamber() laid at height z (a basin replaces it)."""
    for f in list(mb.bm.faces):
        if all(abs(v.co.z - z) < 1e-4 for v in f.verts) and f.calc_area() > 20:
            mb.bm.faces.remove(f)


# ---------------------------------------------------------------------------
# A crawl variant


def build_rat_warren(force=False):
    """1x2 cells: low tunnels chewed into soft rock. The hall eases down into a wide, low warren
    (1.3 m high: crouch) and back out. Hall sockets at both ends."""
    name = "rat-warren"
    low = kit.arch_profile(1.5, 0.75, 0.55)
    ease = (0.5, 2.0)
    coll, root, half, total = kit._build_narrow_hall(name, 2, low, ease, 0.05, 13.7, force)
    tight = half - ease[1]
    col_box(coll, root, "col-floor", (-2, -tight, -0.2), (2, tight, 0))
    kit.narrow_end_cols(coll, root, kit.hall_profile(), low, ease, half, tight, total)
    col_box(coll, root, "col-warren-ceiling", (-2, -tight, 1.3), (2, tight, 3.0))
    col_box(coll, root, "col-warren-wall-w", (-2, -tight, 0), (-1.5, tight, 1.3))
    col_box(coll, root, "col-warren-wall-e", (1.5, -tight, 0), (2, tight, 1.3))
    for k, (x, y) in enumerate([(0.0, -1.2), (0.3, 1.4)]):
        marker(coll, root, f"creature-{k}", (x, y, 0), display="CONE", size=0.4)
    return coll


# ---------------------------------------------------------------------------
# Dead ends


def build_survey_station(force=False):
    """1x1 cell, a dead end: the old mapping crews' table, and their maps pinned on the walls. The
    Surveyor's haunt. Socket on the south edge."""
    room = Room("survey-station", 1, 1, 3.0, "mat-wall-tunnel", "mat-floor-tunnel", [("s", 0)], force=force)
    room.solid((-0.8, 0.4, 0), (0.8, 1.2, 0.8), "mat-prop-planks", props=True)
    room.props.box((-0.6, 0.6, 0.8), (0.3, 1.1, 0.81), "mat-paper")
    for x, z in ((-1.4, 1.5), (-0.5, 1.8), (0.7, 1.4)):
        room.props.box((x, room.iy - 0.02, z), (x + 0.6, room.iy, z + 0.45), "mat-paper")
    for y, z in ((-0.6, 1.6), (0.5, 1.3)):
        room.props.box((room.ix - 0.02, y, z), (room.ix, y + 0.5, z + 0.4), "mat-paper")
    room.creatures([(0.0, -0.8)])
    return room.finish()


def build_rockfall(force=False):
    """1x2 cells, a dead end: a passage that has fallen in. Rubble heaped against the collapse
    (a pickaxe will open a way through it, later), bricks to pick up. Socket on the south edge."""
    room = Room("rockfall", 1, 2, 3.0, "mat-wall-tunnel", "mat-floor-tunnel", [("s", 0)], force=force)
    iy = room.iy
    kit.rock_plug(room.mb, [(x * 1.7, z) for x, z in kit.hall_profile()], iy - 0.05, 1, "mat-wall-tunnel")
    heap = [(-1.0, iy - 0.7, 0.55), (0.6, iy - 0.6, 0.5), (0.0, iy - 1.3, 0.35), (1.2, iy - 1.6, 0.28), (-1.3, iy - 1.9, 0.25)]
    for k, (x, y, s) in enumerate(heap):
        rubble(room.mb, x, y, 0, s, seed=k + 800)
    col_box(room.coll, room.root, "col-heap", (-1.75, iy - 1.0, 0), (1.75, iy, 1.2))
    room.rubble_markers([(0.0, iy - 1.6), (-1.0, iy - 2.2)])
    room.creatures([(0.0, -2.0)])
    return room.finish()


# ---------------------------------------------------------------------------
# Rope rooms: down a drop on a rope (a post until there are climbing pitons), staying on the level
# they hang from. Never on the main route (kit.ts: needsRope).


def build_sinkhole(force=False):
    """2x2 cells, 3 levels: the floor gave way. The way in is on a rim round a ragged hole
    (level 2, north); 8 m below, a rubble-strewn chamber with the way on (level 0, south). A rope
    tied at the post on the rim is the way down."""
    return _rope_room("sinkhole", hole=(-1.6, 1.6, -2.0, 1.2), ragged=True, force=force)


def build_broken_stair(force=False):
    """2x2 cells, 3 levels: a stair that ends in air. From the way in (level 2, north) a stair goes
    down along the east wall and stops halfway; the rest is a 4 m drop to the floor and the way on
    (level 0, south). A rope tied at the post at the stair's broken end is the way down."""
    return _rope_room("broken-stair", hole=(-3.4, 3.4, -3.4, 1.0), ragged=False, force=force, post=(2.1, -2.2, ROPE_DROP / 2))


def _rope_room(name, hole, ragged, force, post=None):
    coll = kit.piece_collection(name, force)
    root = kit.root_empty(coll, name, 2, 2, levels=3)
    W, F = "mat-wall-tunnel", "mat-floor-tunnel"
    i, t = 3.4, 0.6
    top = ROPE_DROP
    H = top + 3.4
    hx0, hx1, hy0, hy1 = hole
    hall = kit.hall_profile()
    mb = MeshBuilder(name + "-mesh")
    up, down = (0, 0, 1), (0, 0, -1)
    # The rim: the top floor round the hole.
    for pts in (
        [(-i, hy1), (i, hy1), (i, i), (-i, i)],
        [(-i, -i), (i, -i), (i, hy0), (-i, hy0)],
        [(-i, hy0), (hx0, hy0), (hx0, hy1), (-i, hy1)],
        [(hx1, hy0), (i, hy0), (i, hy1), (hx1, hy1)],
    ):
        if abs(pts[1][0] - pts[0][0]) > 1e-3 and abs(pts[2][1] - pts[1][1]) > 1e-3:
            mb.face([(x, y, top) for x, y in pts], F, facing=up)
            mb.face([(x, y, top - 0.4) for x, y in pts], W, facing=down)
    mb.face([(-i, -i, H), (i, -i, H), (i, i, H), (-i, i, H)], W, facing=down)
    mb.face([(-i, -i, 0), (i, -i, 0), (i, i, 0), (-i, i, 0)], F, facing=up)
    for side, ((_ox, _oy), facing) in kit.SIDES.items():
        a, b = kit._wall_ends(side, -i, i, -i, i)
        if side == "n":
            kit.wall(mb, a, b, 0, top, W, facing)
            kit.wall(mb, a, b, top, H, W, facing, notches=[(5.4, hall)])
        elif side == "s":
            kit.wall(mb, a, b, 0, H, W, facing, notches=[(1.4, hall)])
        else:
            kit.wall(mb, a, b, 0, H, W, facing)
    # The hole's edges.
    for (a, b), facing in (
        (((hx0, hy0), (hx1, hy0)), (0, 1, 0)),
        (((hx0, hy1), (hx1, hy1)), (0, -1, 0)),
        (((hx0, hy0), (hx0, hy1)), (1, 0, 0)),
        (((hx1, hy0), (hx1, hy1)), (-1, 0, 0)),
    ):
        # Only the edges out in the room, not those along its walls.
        inside = abs(a[1]) < i - 1e-3 if a[1] == b[1] else abs(a[0]) < i - 1e-3
        if inside:
            kit.wall(mb, a, b, top - 0.4, top, W, facing)
    throat(mb, (2, i), (0, 1), 0, 4 - i, hall, W, F, z0=top)
    throat(mb, (-2, -i), (0, -1), 0, 4 - i, hall, W, F)
    if ragged:
        for k in range(10):
            a = 2 * math.pi * k / 10
            x = (hx0 + hx1) / 2 + (hx1 - hx0) / 2 * math.cos(a) * 1.05
            y = (hy0 + hy1) / 2 + (hy1 - hy0) / 2 * math.sin(a) * 1.05
            rubble(mb, x, y, top - 0.25, 0.22, seed=k + 900)
        for k, (x, y, s) in enumerate([(-2.6, -2.6, 0.5), (2.4, -1.8, 0.45), (0.2, 0.6, 0.6), (-2.2, 1.0, 0.4), (1.5, 2.6, 0.35)]):
            rubble(mb, x, y, 0, s, seed=k + 920)
        col_box(coll, root, "col-fall", (-0.5, 0.0, 0), (0.9, 1.2, 0.6))
    else:
        _stair(mb, coll, root, F, top)
    px, py, pz = post if post else (0.0, hy1 + 0.1, top)
    kit.rope_post(mb, coll, root, px, py, pz)
    mb.finish(coll, root)
    socket(coll, root, "hall", 0, (2, 4, top))
    socket(coll, root, "hall", 1, (-2, -4, 0))
    kit.drop_crate(coll, root, "crate-0", 3.0, -2.2, "e")
    for k, (x, y) in enumerate([(-2.0, -2.0), (2.0, 0.0)]):
        marker(coll, root, f"creature-{k}", (x, y, 0), display="CONE", size=0.4)
    # Colliders: the rim round the hole, walls (the way in cut at the top), floor and ceiling.
    lip = top - 0.4
    col_box(coll, root, "col-rim-n", (-4, hy1, lip), (4, 4, top))
    if hy0 > -4 + 1e-3 and hy0 > -i:
        col_box(coll, root, "col-rim-s", (-4, -4, lip), (4, hy0, top))
    if hx0 > -i:
        col_box(coll, root, "col-rim-w", (-4, hy0, lip), (hx0, hy1, top))
    if hx1 < i:
        col_box(coll, root, "col-rim-e", (hx1, hy0, lip), (4, hy1, top))
    col_box(coll, root, "col-floor", (-4, -4, -0.2), (4, 4, 0))
    col_box(coll, root, "col-ceiling", (-4, -4, H), (4, 4, H + 0.4))
    wall_cols(coll, root, "wall-n-low", (-4, i), (4, i), 0, lip, t, (0, 1))
    wall_cols(coll, root, "wall-n", (-4, i), (4, i), top, H, t, (0, 1), openings=[(6.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-s", (-4, -i), (4, -i), 0, H, t, (0, -1), openings=[(2.0, 1.0, 2.8)])
    wall_cols(coll, root, "wall-w", (-i, -4), (-i, 4), 0, H, t, (-1, 0))
    wall_cols(coll, root, "wall-e", (i, -4), (i, 4), 0, H, t, (1, 0))
    return coll


def _stair(mb, coll, root, F, top):
    """The broken stair: from the rim at the north-east down the east wall, steep steps of 0.25 m,
    stopping halfway down (at top / 2) on a landing over the drop."""
    x0, x1 = 1.2, 3.4
    steps = int((top / 2) / 0.25)
    y = 1.0
    for k in range(steps):
        z = top - (k + 1) * 0.25
        y0 = y - 0.16
        mb.box((x0, y0, z - 0.3), (x1, y, z), F, skip=())
        col_box(coll, root, f"col-step-{k}", (x0, y0, z - 0.3), (x1, y, z))
        y = y0
    # The landing where it breaks off.
    mb.box((x0, y - 0.8, top / 2 - 0.3), (x1, y, top / 2), F, skip=())
    col_box(coll, root, "col-landing", (x0, y - 0.8, top / 2 - 0.3), (x1, y, top / 2))


def build_sunken_ossuary(force=False):
    """1x1 cell, 3 levels: a hall (level 2, north to south) with a grate open in its floor, and
    8 m below it a sealed bone chamber nobody has been into: niches and a sarcophagus, untouched.
    Only reached on a rope from the post beside the grate (never on the main route)."""
    name = "sunken-ossuary"
    coll = kit.piece_collection(name, force)
    root = kit.root_empty(coll, name, 1, 1, levels=3)
    W, F = "mat-wall-ossuary", "mat-floor-ossuary"
    top = ROPE_DROP
    g = 0.7  # half the grate's opening
    mb = MeshBuilder(name + "-mesh")
    up, down = (0, 0, 1), (0, 0, -1)
    hall = kit.hall_profile()
    # The hall on top: walls and vault along the cell, its floor round the grate.
    kit.sweep(mb, hall, kit.straight_frames((0, -2, top), (0, 2, top), 8), W, None)
    for pts in ([(-1, g), (1, g), (1, 2), (-1, 2)], [(-1, -2), (1, -2), (1, -g), (-1, -g)], [(-1, -g), (-g, -g), (-g, g), (-1, g)], [(g, -g), (1, -g), (1, g), (g, g)]):
        mb.face([(x, y, top) for x, y in pts], F, facing=up)
    for k in range(-3, 4):
        x = k * 0.2
        mb.box((x - 0.03, -g, top - 0.05), (x + 0.03, -g + 0.08, top), "mat-iron")
    # The shaft down, and the chamber.
    for (a, b), facing in ((((-g, g), (g, g)), (0, -1, 0)), (((-g, -g), (g, -g)), (0, 1, 0)), (((-g, -g), (-g, g)), (1, 0, 0)), (((g, -g), (g, g)), (-1, 0, 0))):
        kit.wall(mb, a, b, 3.2, top, W, facing)
    i, h = 1.75, 3.2
    niches = {"e": kit.niche_grid(2 * i, 2, 2), "w": kit.niche_grid(2 * i, 2, 2), "n": kit.niche_grid(2 * i, 2, 2)}
    kit.chamber(mb, -i, i, -i, i, h, W, F, W, niches=niches)
    _drop_ceiling_hole(mb, h, g)
    mb.finish(coll, root)
    props = MeshBuilder(name + "-bones", colors=True)
    kit._niche_props(props, -i, i, -i, i, niches, seed=21.0)
    props.finish(coll, root, smooth_angle=60)
    post_mb = MeshBuilder(name + "-post")
    kit.rope_post(post_mb, coll, root, 0.0, g + 0.1, top)
    post_mb.finish(coll, root)
    socket(coll, root, "hall", 0, (0, 2, top))
    socket(coll, root, "hall", 1, (0, -2, top))
    marker(coll, root, "creature-0", (0.0, -1.0, 0), display="CONE", size=0.4)
    # Colliders: the hall on top (its floor round the grate), the shaft, the chamber.
    lip = top - 0.3
    col_box(coll, root, "col-top-n", (-1.5, g, lip), (1.5, 2, top))
    col_box(coll, root, "col-top-s", (-1.5, -2, lip), (1.5, -g, top))
    col_box(coll, root, "col-top-w", (-1.5, -g, lip), (-g, g, top))
    col_box(coll, root, "col-top-e", (g, -g, lip), (1.5, g, top))
    col_box(coll, root, "col-hall-wall-w", (-1.5, -2, top), (-1.0, 2, top + 3.0))
    col_box(coll, root, "col-hall-wall-e", (1.0, -2, top), (1.5, 2, top + 3.0))
    col_box(coll, root, "col-hall-ceiling", (-1.5, -2, top + 2.8), (1.5, 2, top + 3.2))
    s = 0.3
    col_box(coll, root, "col-shaft-n", (-g - s, g, h), (g + s, g + s, lip))
    col_box(coll, root, "col-shaft-s", (-g - s, -g - s, h), (g + s, -g, lip))
    col_box(coll, root, "col-shaft-w", (-g - s, -g, h), (-g, g, lip))
    col_box(coll, root, "col-shaft-e", (g, -g, h), (g + s, g, lip))
    col_box(coll, root, "col-floor", (-2, -2, -0.2), (2, 2, 0))
    for side, lo, hi in (("n", (-g, g, h), (2, 2, h + 0.4)), ("s", (-2, -2, h), (g, -g, h + 0.4)), ("w", (-2, -g, h), (-g, 2, h + 0.4)), ("e", (g, -2, h), (2, g, h + 0.4))):
        col_box(coll, root, f"col-ceiling-{side}", lo, hi)
    col_box(coll, root, "col-wall-n", (-2, i, 0), (2, 2, h))
    col_box(coll, root, "col-wall-s", (-2, -2, 0), (2, -i, h))
    col_box(coll, root, "col-wall-w", (-2, -i, 0), (-i, i, h))
    col_box(coll, root, "col-wall-e", (i, -i, 0), (2, i, h))
    return coll


def _drop_ceiling_hole(mb, h, g):
    """Cut the shaft's opening out of the chamber's ceiling face chamber() laid whole at height h."""
    for f in list(mb.bm.faces):
        if all(abs(v.co.z - h) < 1e-4 for v in f.verts) and f.calc_area() > 4:
            mb.bm.faces.remove(f)
    i = 1.75
    for pts in ([(-i, g), (i, g), (i, i), (-i, i)], [(-i, -i), (i, -i), (i, -g), (-i, -g)], [(-i, -g), (-g, -g), (-g, g), (-i, g)], [(g, -g), (i, -g), (i, g), (g, g)]):
        mb.face([(x, y, h) for x, y in pts], "mat-wall-ossuary", facing=(0, 0, -1))


def _retype_socket(room, index, kind):
    """A Room's socket-hall-<index> becomes socket-<kind>-0: an opening only its own kind meets."""
    for child in room.root.children:
        if child.name.split(".")[0] == f"socket-hall-{index}":
            child.name = f"socket-{kind}-0"
            return
    raise RuntimeError(f"{room.name}: no socket-hall-{index}")


def _spot(room, name, x, y, yaw=0.0):
    """A named spot (spot-<name>): where Rumors puts a thing, or a tutorial step is told."""
    e = marker(room.coll, room.root, f"spot-{name}", (x, y, room.z0), display="PLAIN_AXES", size=0.35)
    e.rotation_euler = (0, 0, yaw)
    return e


def _crate(room, index, x, y, yaw):
    """A crate marker (crate-<n>) against a wall: its back along local +Y, toward the wall."""
    e = marker(room.coll, room.root, f"crate-{index}", (x, y, room.z0), display="ARROWS", size=0.45)
    e.rotation_euler = (0, 0, yaw)
    return e


def build_rumors_walk(force=False):
    """1x4 cells: the tutorial walk, in from the start (south, a hall socket) to the training vault
    (north, a vault socket, so it is always walked this way). Along it, in order: a crate of rags,
    the field crafting kit on the floor, a crate of wax, chalk and a bare wall to mark. Each stop
    has a spot-step-<n> where Rumors says what to do there."""
    room = Room("rumors-walk", 1, 4, 3.2, "mat-wall-tunnel", "mat-floor-tunnel", [("s", 0), ("n", 0)], force=force)
    _retype_socket(room, 1, "vault")
    ix, iy = room.ix, room.iy
    east = -math.pi / 2
    _crate(room, 0, ix - 0.33, -iy + 3.0, east)
    _spot(room, "step-crate", 0.0, -iy + 2.4)
    _spot(room, "kit", -ix + 0.5, -iy + 6.0)
    _spot(room, "step-kit", 0.0, -iy + 5.6)
    _crate(room, 1, ix - 0.33, -iy + 9.0, east)
    _spot(room, "step-recipe", 0.0, -iy + 8.4)
    _spot(room, "chalk", -ix + 0.5, -iy + 12.0)
    _spot(room, "step-chalk", 0.0, -iy + 11.6)
    return room.finish()


def build_rumors_vault(force=False):
    """3x12 cells: the training vault. In from the walk at the south end (a vault socket), an arch
    off each side near it (a web across one, rubble in the other: dead ends, in the game's data), a
    ledge to hammer a piton into.
    Dummies down the long room at 5, 10, 20 and 40 m from where you stand (spot-range), one on a
    track off to the side, bricks by the door, and the way out up a ladder at the far end."""
    room = Room(
        "rumors-vault",
        3,
        12,
        5.0,
        "mat-wall-chapel",
        "mat-floor-chapel",
        [("s", 0), ("w", -22.0), ("e", -22.0)],
        force=force,
    )
    _retype_socket(room, 0, "vault")
    # Taller than a level, for room to stand on the piton ledge: only ever in the training map,
    # where nothing is built over it.
    room.root["headroom"] = 1.4
    ix, iy = room.ix, room.iy
    stand = -iy + 3.5
    _spot(room, "range", 0.0, stand)
    _spot(room, "step-vault", 0.0, -iy + 1.5)
    for metres in (5, 10, 20, 40):
        _spot(room, f"dummy-{metres}", -2.0, stand + metres, math.pi)
    _spot(room, "track", 3.0, stand + 15.0, math.pi)
    # The track the moving dummy runs along: a rail across the floor.
    room.props.box((0.2, stand + 14.9, 0.0), (ix - 0.2, stand + 15.1, 0.06), "mat-iron")
    room.rubble_markers([(-ix + 1.0, -iy + 1.2), (-ix + 1.6, -iy + 2.0)])
    _piton_ledge(room, stand + 24.0)
    # The way out: a ladder up the far wall.
    xm = MeshBuilder("rumors-vault-ladder")
    kit.extraction_ladder(xm, 0.0, iy - 0.14, 0.0, 3.6, axis="x", half_w=0.22)
    xm.finish(room.coll, room.root)
    marker(room.coll, room.root, "extract-0", (0.0, iy - 0.7, 0.0), display="SPHERE", size=0.6)
    _spot(room, "step-out", 0.0, iy - 3.0)
    return room.finish()


def _piton_ledge(room, y0):
    """The vault's ledge to practise climbing pitons on: 2.2 m up against the east wall, with
    nothing to tie a rope to, and steps up to it from the south along the wall. Its north and west
    edges are sheer drops: a piton goes in there. The pitons and a rope lie on it (spot-pitons);
    Rumors says how at the foot of the steps (spot-step-piton)."""
    top, rise, tread, steps = 2.2, 0.275, 0.4, 8
    x0, x1, y1 = room.ix - 2.6, room.ix, y0 + 5.0
    room.solid((x0, y0, 0.0), (x1, y1, top), "mat-floor-chapel", skip=())
    stair_w = 1.2
    for k in range(1, steps):
        room.solid((x1 - stair_w, y0 - tread * (steps - k), 0.0), (x1, y0, rise * k), "mat-floor-chapel", skip=())
    _spot(room, "pitons", x0 + 1.0, y1 - 1.2).location.z = top
    _spot(room, "step-piton", x1 - 1.6, y0 - tread * steps - 0.8)


BUILDERS = {
    "rumors-walk": build_rumors_walk,
    "rumors-vault": build_rumors_vault,
    "vestry": build_vestry,
    "quarry-lodge": build_quarry_lodge,
    "smugglers-cellar": build_smugglers_cellar,
    "pump-room": build_pump_room,
    "rat-warren": build_rat_warren,
    "explorers-camp": build_explorers_camp,
    "survey-station": build_survey_station,
    "rockfall": build_rockfall,
    "family-mausoleum": build_family_mausoleum,
    "webbed-gallery": build_webbed_gallery,
    "plague-pit": build_plague_pit,
    "drowned-chapel": build_drowned_chapel,
    "saints-crypt": build_saints_crypt,
    "sinkhole": build_sinkhole,
    "broken-stair": build_broken_stair,
    "sunken-ossuary": build_sunken_ossuary,
}


def build_all(force=False):
    """Build every room that doesn't exist yet (all of them again with force: loses hand edits)."""
    built = []
    for name in ROOMS:
        try:
            BUILDERS[name](force=force)
            built.append(name)
        except kit.PieceExists:
            print(f"skip {name}: already exists")
    return built
