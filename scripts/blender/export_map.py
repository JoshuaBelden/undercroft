"""Write art/export/<piece>.glb for every map piece in the kit, headless. Run with
`pnpm asset:export`, which finds Blender and opens art/blender/catacomb-kit.blend with this script
(scripts/export-map.ts). Never saves the .blend. See docs/dev/asset-pipeline.md."""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import rooms  # noqa: E402

exported, missing = [], []
for name in kit.PIECES + rooms.ROOMS:
    if name in bpy.data.collections and name in bpy.data.objects:
        print("  " + os.path.relpath(kit.export_piece(name), kit.REPO))
        exported.append(name)
    else:
        missing.append(name)
if missing:
    print("Not in the .blend, skipped: " + ", ".join(missing))
print(f"Exported {len(exported)} map pieces to {os.path.relpath(kit.EXPORT, kit.REPO)}")
