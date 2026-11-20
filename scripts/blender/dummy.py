"""A training dummy for Rumors (a placeholder until the art lands): a post in a heavy base, a
crossbar for arms, a stuffed sack for a body and a smaller one for a head, about 1.8 m tall,
standing on its origin and facing -Y (the game turns it to +Z). Built in a scratch scene and
exported to art/export/creatures/dummy.glb, headless:

    blender --background --python scripts/blender/dummy.py

then `pnpm asset:build`. It isn't kept in the kit .blend: the script is its source.
"""
import os

import bpy

OUT = os.path.join(os.getcwd(), "art", "export", "creatures", "dummy.glb")


def material(name, color, roughness=0.9):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def add(obj, mat):
    obj.data.materials.append(mat)
    return obj


bpy.ops.wm.read_factory_settings(use_empty=True)
wood = material("dummy-wood", (0.26, 0.17, 0.09))
sack = material("dummy-sack", (0.55, 0.46, 0.32), 1.0)
rope = material("dummy-rope", (0.42, 0.33, 0.2), 1.0)

parts = []
bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=0.12, location=(0, 0, 0.06))
parts.append(add(bpy.context.object, wood))
bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=1.7, location=(0, 0, 0.85))
parts.append(add(bpy.context.object, wood))
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.35))
bar = bpy.context.object
bar.scale = (0.9, 0.08, 0.08)
parts.append(add(bar, wood))
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.26, location=(0, 0, 1.05), segments=16, ring_count=10)
body = bpy.context.object
body.scale = (1.0, 0.75, 1.45)
parts.append(add(body, sack))
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.15, location=(0, 0, 1.62), segments=12, ring_count=8)
parts.append(add(bpy.context.object, sack))
bpy.ops.mesh.primitive_torus_add(major_radius=0.2, minor_radius=0.02, location=(0, 0, 0.95))
parts.append(add(bpy.context.object, rope))

for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.shade_smooth()
bpy.ops.object.join()
bpy.context.object.name = "dummy"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True)
print("Exported " + OUT)
