"""Build the new rooms that aren't in the kit yet (rooms.py), give them their lootable markers
(lootables.py), lay them out past the other pieces, and save the .blend, headless. Run with
Blender on art/blender/catacomb-kit.blend, then `pnpm asset:export` and `pnpm asset:build`.
Pass `-- --force <name>...` to build those rooms again (losing hand edits)."""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import lootables  # noqa: E402
import rooms  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
forced = args[1:] if args[:1] == ["--force"] else []
built = []
for name in rooms.ROOMS:
    if name in forced or name not in bpy.data.collections:
        rooms.BUILDERS[name](force=name in forced)
        built.append(name)
        print(f"  built {name}")
if built:
    kit.layout_pieces(built)
# The new meshes have to be evaluated before the lootable search can see them.
bpy.context.view_layer.update()
for name in built:
    kinds = lootables.ROOMS.get(name, [])
    lootables.clear(name)
    placed = lootables.place(name, kinds)
    print(f"  {name}: {len(placed)} of {len(kinds)} lootables")
bpy.ops.wm.save_mainfile()
print("Saved " + bpy.data.filepath)
