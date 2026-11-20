"""Place the lootable markers of every room in lootables.ROOMS that has none, headless, and save
the .blend. Run with Blender on art/blender/catacomb-kit.blend (see lootables.py), then
`pnpm asset:export` and `pnpm asset:build`. Pass `-- --force` to place every room's again."""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lootables  # noqa: E402

force = "--force" in sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else False
lootables.place_all(force=force)
bpy.ops.wm.save_mainfile()
print("Saved " + bpy.data.filepath)
