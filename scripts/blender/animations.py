"""Undercroft explorer animations from elsewhere (Mixamo): FBX in, glTF out, one clip per file.

Drop a clip downloaded from Mixamo (FBX, "Without Skin" is enough; any Mixamo-named rig) into
art/export/player/animations/<name>.fbx and run this inside Blender (it clears the scene):

    import sys, importlib
    sys.path.insert(0, r"D:/Code/undercroft/scripts/blender")
    import animations; importlib.reload(animations)
    animations.convert_all()    # every <name>.fbx -> <name>.glb beside it, its clip named <Name>

`pnpm asset:build` then retargets each file's clip onto every explorer body (the same as the
explorer's own clips), under the file's name in TitleCase (`bored.fbx` -> `Bored`). Map it to a
slot in PLAYER_MODEL (src/lib/content/player/model.ts). See docs/dev/asset-pipeline.md#the-explorer.
"""

import glob
import os

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FOLDER = os.path.join(ROOT, "art", "export", "player", "animations")


def clip_name(path):
    """`looking_around.fbx` -> `Looking_Around`: the name the clip goes in under."""
    stem = os.path.splitext(os.path.basename(path))[0]
    return "_".join(part.capitalize() for part in stem.replace("-", "_").split("_"))


def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def convert(path):
    """One FBX to a glTF beside it: the armature and its one clip, named for the file."""
    clear()
    bpy.ops.import_scene.fbx(filepath=path)
    armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    # Only the rig: a mesh that came with the clip (a Mixamo character "With Skin") isn't needed.
    for obj in [o for o in bpy.data.objects if o.type != "ARMATURE"]:
        bpy.data.objects.remove(obj, do_unlink=True)
    actions = list(bpy.data.actions)
    if len(actions) != 1:
        raise ValueError(f"{os.path.basename(path)} has {len(actions)} clips; one per file")
    actions[0].name = clip_name(path)
    for obj in bpy.context.view_layer.objects:
        obj.select_set(obj == armature)
    bpy.context.view_layer.objects.active = armature
    out = os.path.splitext(path)[0] + ".glb"
    bpy.ops.export_scene.gltf(
        filepath=out,
        use_selection=True,
        export_format="GLB",
        export_yup=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_def_bones=False,
        export_skins=True,
    )
    return out


def convert_all():
    return [convert(path) for path in sorted(glob.glob(os.path.join(FOLDER, "*.fbx")))]
