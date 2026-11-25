"""Light probes for a room (docs/dev/fixed-map.md#light-probes): the baked light, for what moves.

The room's surfaces are lit by their lightmap; anything that moves (an explorer, a crate, a door's
leaves) isn't in it. These probes are what lights them: a grid through the room, each the light
reaching it from every way, as order-1 spherical harmonics. Baked after the lightmap, from it.
"""

import math
import os
import struct

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform, intersect_point_tri

PROBE_SPACING = (1.5, 1.0)  # m between probes: across (x and z), and up (y)
PROBE_RAYS = 96
# Order-1 spherical harmonics (the first four of Three.js's nine), of radiance.
SH_Y0 = 0.282095
SH_Y1 = 0.488603
# Where on each lamp its light is checked for: its middle and four points round it (in quarters).
LAMP_POINTS = ((0, 0), (-1, -1), (1, -1), (-1, 1), (1, 1))
# The six ways out a probe looks, to tell the room from the rock round it.
AXES = [Vector(d) for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]


def fibonacci_sphere(n):
    """`n` directions spread evenly over the sphere (game axes)."""
    golden = math.pi * (3 - math.sqrt(5))
    out = []
    for i in range(n):
        y = 1 - (i + 0.5) * 2 / n
        r = math.sqrt(max(0.0, 1 - y * y))
        a = i * golden
        out.append(Vector((math.cos(a) * r, y, math.sin(a) * r)))
    return out


def _bsdf(mat):
    if not mat or not mat.node_tree:
        return None
    return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def albedo(mat):
    """A material's average colour: its base colour texture's (a sparse sample), or its colour."""
    bsdf = _bsdf(mat)
    if bsdf is None:
        return (0.5, 0.5, 0.5)
    link = next(iter(bsdf.inputs["Base Color"].links), None)
    if link and link.from_node.type == "TEX_IMAGE" and link.from_node.image:
        px = np.array(link.from_node.image.pixels[:], dtype=np.float32).reshape(-1, 4)[::97]
        return tuple(float(v) for v in px[:, :3].mean(axis=0))
    c = bsdf.inputs["Base Color"].default_value
    return (c[0], c[1], c[2])


def emission(mat):
    """The radiance a glowing material gives off (emission colour times strength), or None."""
    bsdf = _bsdf(mat)
    if bsdf is None or bsdf.inputs["Emission Strength"].default_value <= 0:
        return None
    c = bsdf.inputs["Emission Color"].default_value
    s = bsdf.inputs["Emission Strength"].default_value
    return (c[0] * s, c[1] * s, c[2] * s)


def bake_probes(obj, lightmap, lamps, path):
    """Bake a grid of probes over `obj` (the room's mesh, lit by `lightmap`, the baked image) into
    `path`. The light comes two ways. Each of `lamps` (the bake's area lamps, shining down) is
    added straight: its radiance (power over area and pi) over the solid angle it fills, as much of
    it as the probe can see (LAMP_POINTS across it, so a grate or a shaft's walls shade it in part).
    Too small for rays to find reliably (a manhole is a few hundredths of the sky). Then PROBE_RAYS
    rays gather what the surfaces give back: each the lightmap where it lands times the surface's
    colour (a glowing surface, the lamps' own, is left to them). Probes
    inside the rock are filled from their neighbours, so sampling between probes near a wall
    doesn't pull in black.

    Game axes (+Y up; Blender's +Y is -Z). Written as little-endian float32: nx, ny, nz, the
    origin's x, y, z, the spacing across and up, a spare; then nx*ny*nz probes of 12 numbers (four
    coefficients, red green blue each), x fastest, then z, then y. Returns how many probes are in
    the room, and how many in all."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    tree = BVHTree.FromObject(obj, depsgraph)
    uv = mesh.uv_layers["Lightmap"].data
    w, h = lightmap.size
    pixels = np.array(lightmap.pixels[:], dtype=np.float32).reshape(h, w, 4)
    colours = [albedo(m) for m in mesh.materials]
    glows = [emission(m) for m in mesh.materials]
    sources = []
    for lamp in lamps:
        sx_, sy_ = lamp.data.size, lamp.data.size_y
        radiance = [lamp.data.energy / (sx_ * sy_ * math.pi) * k for k in lamp.data.color]
        c = lamp.matrix_world.translation
        points = [c + Vector((u * sx_ / 4, v * sy_ / 4, 0)) for u, v in LAMP_POINTS]
        sources.append((radiance, sx_ * sy_, points))

    def light_at(face, hit):
        """The light leaving the surface at `hit` on polygon `face`."""
        mat = mesh.polygons[face].material_index
        if glows[mat] is not None:
            # The lamps' own glow: added straight, below.
            return (0.0, 0.0, 0.0)
        loops = list(mesh.polygons[face].loop_indices)
        verts = [mesh.vertices[mesh.loops[i].vertex_index].co for i in loops]
        for k in range(1, len(loops) - 1):
            a, b, c = verts[0], verts[k], verts[k + 1]
            if k < len(loops) - 2 and not intersect_point_tri(hit, a, b, c):
                continue
            ua, ub, uc = uv[loops[0]].uv, uv[loops[k]].uv, uv[loops[k + 1]].uv
            p = barycentric_transform(hit, a, b, c, ua.to_3d(), ub.to_3d(), uc.to_3d())
            e = pixels[min(h - 1, max(0, int(p.y * h))), min(w - 1, max(0, int(p.x * w)))]
            al = colours[mat]
            return (float(e[0]) * al[0], float(e[1]) * al[1], float(e[2]) * al[2])
        return (0.0, 0.0, 0.0)

    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    zs = [v.co.z for v in mesh.vertices]
    across, up = PROBE_SPACING
    origin = (min(xs), min(zs), -max(ys))  # game x, y (Blender z), z (Blender -y)
    nx = int(math.ceil((max(xs) - min(xs)) / across)) + 1
    ny = int(math.ceil((max(zs) - min(zs)) / up)) + 1
    nz = int(math.ceil((max(ys) - min(ys)) / across)) + 1
    dirs = fibonacci_sphere(PROBE_RAYS)
    data = np.zeros((ny, nz, nx, 12), dtype=np.float32)
    valid = np.zeros((ny, nz, nx), dtype=bool)
    for iy in range(ny):
        for iz in range(nz):
            for ix in range(nx):
                gx, gy, gz = origin[0] + ix * across, origin[1] + iy * up, origin[2] + iz * across
                p = Vector((gx, -gz, gy))
                # Inside the room every way out meets a face from its front (they point in).
                inside = True
                for d in AXES:
                    loc, normal, _, _ = tree.ray_cast(p, d)
                    if loc is None or normal.dot(d) >= 0:
                        inside = False
                        break
                if not inside:
                    continue
                sh = np.zeros(12, dtype=np.float32)
                for d in dirs:
                    bd = Vector((d.x, -d.z, d.y))
                    loc, normal, face, _ = tree.ray_cast(p, bd)
                    if loc is None or normal.dot(bd) >= 0:
                        continue
                    L = light_at(face, loc)
                    basis = (SH_Y0, SH_Y1 * d.y, SH_Y1 * d.z, SH_Y1 * d.x)
                    for c in range(4):
                        for k in range(3):
                            sh[c * 3 + k] += L[k] * basis[c]
                sh *= 4 * math.pi / PROBE_RAYS
                for radiance, area, points in sources:
                    for q in points:
                        v = q - p
                        r = v.length
                        d = v / r
                        # Shining down: how square on to the probe the lamp is.
                        facing = d.z
                        if facing <= 0:
                            continue
                        loc, _, _, dist = tree.ray_cast(p, d, r)
                        if loc is not None and dist < r - 0.15:
                            continue  # something in the way (a grate bar, the shaft's wall)
                        solid = area * facing / (r * r) / len(points)
                        g = (d.x, d.z, -d.y)  # into game axes
                        basis = (SH_Y0, SH_Y1 * g[1], SH_Y1 * g[2], SH_Y1 * g[0])
                        for c in range(4):
                            for k in range(3):
                                sh[c * 3 + k] += radiance[k] * solid * basis[c]
                data[iy, iz, ix] = sh
                valid[iy, iz, ix] = True
    inside_count = int(np.count_nonzero(valid))
    # The probes in the rock, filled from their neighbours in the room, a few steps out.
    steps = ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))
    for _ in range(3):
        grown = valid.copy()
        for iy, iz, ix in zip(*np.nonzero(~valid)):
            near = [
                data[iy + dy, iz + dz, ix + dx]
                for dy, dz, dx in steps
                if 0 <= iy + dy < ny and 0 <= iz + dz < nz and 0 <= ix + dx < nx and valid[iy + dy, iz + dz, ix + dx]
            ]
            if near:
                data[iy, iz, ix] = np.mean(near, axis=0)
                grown[iy, iz, ix] = True
        valid = grown
    evaluated.to_mesh_clear()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(struct.pack("<9f", nx, ny, nz, *origin, across, up, 0.0))
        f.write(data.astype("<f4").tobytes())
    return inside_count, nx * ny * nz
