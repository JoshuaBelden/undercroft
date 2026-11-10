# Raw art (not in git)

Everything in `art/` except this README is gitignored. Back it up yourself (OneDrive, external drive).
Only optimized exports in `static/assets/` are committed.

```
art/
  blender/catacomb-kit.blend   # map kit source: one collection per piece
  textures/<SetName>_4K-JPG/   # raw ambientCG / Poly Haven downloads, untouched
  sfx/*.wav                    # raw sound recordings, input to `pnpm asset:audio`
  export/<piece>.glb           # raw Blender exports (full-res textures), input to `pnpm asset:build`
```

- Keep downloaded texture folders named as downloaded so you can find the source again.
- Use the `_NormalGL` map (glTF uses the OpenGL convention), not `_NormalDX`.
- `pnpm asset:build` downsizes textures to 1024 WebP and writes `static/assets/map/` (pieces as `.gltf` + `.bin`, textures shared in `textures/`).

See `docs/dev/asset-pipeline.md` for the full pipeline.
