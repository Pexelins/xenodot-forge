# Screen-effects layer 1 — Fullscreen Post-Process Quad (rig)

Rig a quad so a spatial shader runs over every screen pixel with access to depth/normal textures (CompositorEffects and CanvasItem shaders cannot do this as simply). Source of truth: Godot docs "Advanced post-processing".

## Requirements

- Godot **4.3+** (reversed-Z depth; see Error table for 4.0–4.2).
- An active `Camera3D` in the scene. If the project uses the SubViewport pixelation setup (skill `godot-3d-pixelation`), the camera — and therefore this quad — lives **inside the SubViewport**, so the effect is applied _before_ upscaling. That is the correct order for pixel-art outlines.
- No shader knowledge needed for this layer; it produces a working stub.

## Project conventions

- Shader file: `res://shaders/post/post_process.gdshader` (rename per effect later). If a post-process shader already exists in the project, extend it instead of creating a second quad — **only one fullscreen quad per camera**; stacking them multiplies fragment cost and breaks depth reads.
- Node name: `PostProcessQuad`, direct child of the active `Camera3D`.

## Steps

1. Add `MeshInstance3D` named `PostProcessQuad` as a **child of the Camera3D**.
2. Set its Mesh to a new `QuadMesh`. In the QuadMesh resource set **Size = 2 × 2** (so vertex XY coordinates span −1..1, matching NDC).
3. On the QuadMesh, enable **Flip Faces** (the quad must face the camera).
4. On the MeshInstance3D, set **GeometryInstance3D → Extra Cull Margin** to the maximum (`16384`). Without it the frustum culler discards the quad because its AABB is "behind" the camera.
5. Create `res://shaders/post/post_process.gdshader` with exactly:

```glsl
shader_type spatial;
// Unshaded + no fog: post-process output must not be re-lit or fogged.
render_mode unshaded, fog_disabled;

void vertex() {
	// Snap the quad to the full screen at the near plane (reversed-Z, Godot 4.3+).
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

void fragment() {
	// Stub: solid magenta proves the rig works. Replace in later layers.
	ALBEDO = vec3(1.0, 0.0, 1.0);
}
```

6. Assign the shader: MeshInstance3D → **Surface Material Override [0]** → new `ShaderMaterial` → this shader.

## Verification checklist

- [ ] Entire editor viewport and the running game are solid magenta — no scene visible, no gaps at screen edges.
- [ ] Rotating/moving the camera changes nothing (still fully magenta). If scene peeks through at any angle → cull margin or POSITION line is wrong.
- [ ] Scene tree shows `Camera3D/PostProcessQuad`; reparenting it elsewhere breaks editor preview.

After verifying, leave the rig in place; the buffer-access layer (reference/screen-textures.md) and edge-detection effects replace only the `fragment()` body.

## Error → Fix

| Symptom                                    | Fix                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Small magenta square floating in the world | `POSITION` line missing from `vertex()`, or shader not assigned to Surface Material Override                                                      |
| Quad invisible entirely                    | Flip Faces is off, **or** Godot 4.0–4.2: reversed-Z doesn't exist there, use `POSITION = vec4(VERTEX.xy, 0.0, 1.0);` and prefer upgrading to 4.3+ |
| Effect disappears when camera rotates      | Extra Cull Margin not set to max                                                                                                                  |
| Magenta only covers part of screen         | QuadMesh Size is not 2×2                                                                                                                          |
| Output looks lit/fogged/washed out         | `render_mode unshaded, fog_disabled;` missing                                                                                                     |
| Works in game but not in editor viewport   | Quad is not a child of the _editor-previewed_ camera; check the camera preview toggle                                                             |
