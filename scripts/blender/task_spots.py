"""Room tasks' spots (docs/dev/quests.md#room-tasks): a `spot-<name>` empty in each task's room,
where its object stands: on the floor, back to a wall, its local +Y at the wall. Found the way
lootable markers are (lootables.place: an even wall behind, clear floor in front, off the ways
between doorways, clear of every other marker), sized for the object.

Headless, saving the .blend (then `pnpm asset:export` and `pnpm asset:build`):

    blender --background art/blender/catacomb-kit.blend --python scripts/blender/task_spots.py

Pass `-- --force` to place them again where they already are. Keep TASKS in sync with
src/lib/content/tasks.ts (`room`, `spot`, and the placeholder's size).
"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lootables  # noqa: E402

# Spot name: the room it is in, and the object's size (across along the wall, high, deep).
TASKS = {
    "oath": ("ossuary-hall", (1.2, 0.8, 0.3)),
    "bell": ("quarry-gallery", (0.8, 1.0, 0.8)),
    "winch": ("cistern", (1.0, 1.1, 0.8)),
    "niche": ("saints-crypt", (1.0, 1.4, 0.3)),
}

# Looser tries, in order: how uneven the wall behind may be, clear floor in front, what may lie
# under it, and the room kept from other markers (a hall full of lootables).
RELAXED = [(0.9, 1.0, 0.15, 0.2), (1.4, 0.8, 0.3, 0.0), (2.5, 0.6, 0.5, -0.3)]

# Floors to look on where a room has no crate markers to say (the Cistern's walkway, over its basin).
lootables.FLOORS.setdefault("cistern", [4.0])


def place(name, room, size, force):
    root = bpy.data.objects.get(room)
    if root is None:
        print(f"  {room}: not in the .blend")
        return False
    existing = [c for c in root.children if c.name.split(".")[0] == f"spot-{name}"]
    if existing and not force:
        print(f"  {room}: spot-{name} already there")
        return True
    for child in existing:
        bpy.data.objects.remove(child, do_unlink=True)
    kind = f"task{name.capitalize()}"
    lootables.SIZES[kind] = size
    placed = lootables.place(room, [kind])
    # Bone walls and wet floors: looser, a step at a time, before giving up.
    for even, front, low, space in RELAXED:
        if placed:
            break
        saved = (lootables.EVEN, lootables.FRONT, lootables.LOW, lootables.SPACE)
        lootables.EVEN, lootables.FRONT, lootables.LOW, lootables.SPACE = even, front, low, space
        try:
            placed = lootables.place(room, [kind])
        finally:
            lootables.EVEN, lootables.FRONT, lootables.LOW, lootables.SPACE = saved
    if not placed:
        print(f"  {room}: no spot for {name}")
        return False
    empty = bpy.data.objects[placed[0]]
    empty.name = f"spot-{name}"
    empty.empty_display_type = "PLAIN_AXES"
    print(f"  {room}: spot-{name} at {tuple(round(v, 2) for v in empty.location)}")
    return True


args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
force = "--force" in args
bpy.context.view_layer.update()
ok = all([place(name, room, size, force) for name, (room, size) in TASKS.items()])
bpy.ops.wm.save_mainfile()
print("Saved " + bpy.data.filepath)
if not ok:
    sys.exit(1)
