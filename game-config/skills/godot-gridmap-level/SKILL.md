---
name: godot-gridmap-level
description: Build a tile-based 3D level from a drawn grid (levels/drawn/current.json) with GridMap + MeshLibrary so geometry is computed and grid-snapped, not hand-authored. Use for any Draw-level brief citing current.json, a level with more than ~10 wall/floor pieces, or when hand-typed Transform3D walls clip, mis-size, or drift off their colliders. Covers MeshLibrary tile authoring, the @tool grid importer, the GridMap+instanced-props hybrid, and verify additions. NOT for a tiny hand-built blockout of a few boxes.
---

# godot-gridmap-level — grid-snapped levels via GridMap + MeshLibrary

## Why this exists

`levels/blockout_01.tscn` (7 boxes, clean round-number transforms) renders correctly. `levels/shared_apartment.tscn` (~40 hand-authored nodes) does not: on the hard runs the agent nudged the **mesh and the collider separately, by eye**, and they drifted —

- `WallCorrMBDiv`: the visible wall mesh is scaled to 0.55 and shifted **+6.1 m** off its collider — you collide with a wall that isn't where it's drawn.
- `WallIntSharedBedBath` / `WallSBSouthStub`: mesh and collider given different scales and offsets.

Hand-authoring dozens of `Transform3D` matrices is the failure mode. **GridMap fixes the bug class structurally**: cells snap to a grid, and each cell's mesh _and_ its collision come from one MeshLibrary item — they cannot drift apart. This is the build method for any level that comes from the drawn grid.

## When to use

- The brief cites `levels/drawn/current.json` (the Draw-level pipeline). **Always** use GridMap.
- Any level with more than ~10 wall/floor pieces.
- A hand-authored level whose walls clip or whose colliders no longer match the meshes.

**When NOT to use:** a small hand-built blockout (≲10 primitives, no grid) — the hand-authored `StaticBody3D` + `MeshInstance3D` + `CollisionShape3D` pattern (skill: godot-verify "Hand-authoring .tscn rules") is fine there.

## The grid → world contract

`levels/drawn/current.json` = `{ width, height, cell_size, cells, items, rooms }`, row-major. Structure codes: **0 floor · 1 wall · 2 door · 3 window · 4 item**. `items` = `{ id, x, y }` (same id = the same item); `rooms` = `{ id, x, y }` grouping cells into numbered room regions (same id = one room → a per-zone wall colour / tile variant). The file's `cell_size` is a hint only — the **metres-per-cell and wall height come from the level-designer brief**.

Cell `(col, row)` → GridMap cell `Vector3i(col, 0, row)`. `set_cell_item` places the item at the cell centre (see `cell_center_*` properties); model each tile with its **origin at the tile centre** so it sits correctly. World position of a cell is `cell * cell_size`. **There is no by-eye step.**

## Method

### 1. MeshLibrary of structure tiles (the part that can't drift)

Build a tile source scene — root `Node3D`, one child per tile:

- a `MeshInstance3D` (the visual), and
- a `StaticBody3D` with a `CollisionShape3D` child (the collision).

Then `Scene → Export As… → MeshLibrary…` and save a `.tres` (project convention: resources live in `resources/`, e.g. `resources/apartment_tiles.meshlib.tres`). One item per tile id you need:

- **floor** (thin slab filling the cell footprint) — or skip and use one big floor slab (see step 3),
- **wall** — a solid box filling the cell: `Vector3(cell_size.x, wall_height, cell_size.z)`. In a grid blockout a wall **cell** is a solid block, not a thin plane between cells — this removes all thin-wall edge ambiguity and is why nothing clips.
- **door-frame**, **window-sill** (short wall) — as needed.

Gotchas:

- **Materials must live on the MESH, not the node.** Godot's MeshLibrary export uses only the mesh's own material; a `surface_material_override` on the node is ignored. For **per-zone wall colours**, make a separate tile item per colour (`wall_cool`, `wall_cream`, `wall_grey`), each with its colour baked into its mesh material. The importer maps a **room id** (from the `rooms` list) → wall tile id.
- Collision shape comes from the tile's `StaticBody3D`/`CollisionShape3D` child and is welded to that item — **mesh and collider are one unit, forever in sync.**
- **Sub-cell-height tiles (window sills, low walls, counters):** a tile shorter than `wall_height` must be Y-shifted so it seats on the floor, not floating at the cell centre. Set the `MeshInstance3D` origin to `Vector3(0, -(wall_height - tile_height) / 2, 0)` inside the tile source scene before exporting. Without this, a 1.5 m sill in a 3 m cell floats 0.75 m off the floor.
- **Layered tiles (sill + glass pane):** a window tile can carry two `BoxMesh` surfaces in one MeshLibrary item — a solid sill (opaque `StandardMaterial3D`) and a taller glass pane (transparent `StandardMaterial3D`, `albedo_color.a ≈ 0.3`, `transparency = BaseMaterial3D.TRANSPARENCY_ALPHA`). Share the item's single `StaticBody3D`/`CollisionShape3D` sized to the sill — the glass pane is visual only. This is standard MeshLibrary authoring, not a GridMap limitation.

### 2. GridMap node + cell size

Add a `GridMap` to the level scene, assign the `.tres` MeshLibrary, and set
`cell_size = Vector3(metres_per_cell, wall_height, metres_per_cell)` (footprint × wall height, from the brief).

### 3. Hybrid — structure in the GridMap, the floor and props outside it

- **Floor:** simplest is **one `StaticBody3D` floor slab** (a single `BoxMesh` + `BoxShape3D`) sized to the grid extent (`width*cell_size.x` × thin × `height*cell_size.z`), not a per-cell floor tile. (One slab beats hundreds of floor cells and never seams.)
- **Furniture / items (code 4 + the `items` list ids):** beds span two cells, a nightstand is 0.5 m inside a 1.5 m cell — these do **not** fit uniform cells. Group item cells by id (same id = same prop) and instance small **prop scenes** (or plain `MeshInstance3D` nodes) at **computed** world positions (`Vector3(col*cell_size.x, y, row*cell_size.z)` + a fixed offset), as direct children of the root. Computed, never eyeballed — same discipline as the GridMap.

### 4. The importer (`@tool`, author-time only)

A small `@tool` script populates the GridMap from the grid **in the editor**, then you **save the scene** — GridMap serialises its cells into the `.tscn`. At runtime nothing reads the JSON (honours the "grid is a reference, not a runtime source" rule).

Shape (typed GDScript — load `godot-code-rules` before writing it):

> **SEAM:** `JSON.parse_string` returns untyped `Variant`. This project's strict config (`unsafe_cast=2`) requires a type-guard (`if not parsed is Dictionary`) plus `@warning_ignore("unsafe_cast")` on every subsequent cast. The bare `var grid: Dictionary = JSON.parse_string(...)` pattern fails `tools/validate.sh` on first try.

```gdscript
@tool
extends GridMap
## Author-time importer. Set rebuild = true in the inspector to repopulate from the grid,
## then save the scene. Never reads the grid at runtime.

@export var rebuild: bool = false:
	set(value):
		if value and Engine.is_editor_hint():
			_build_from_grid()

func _build_from_grid() -> void:
	var file: FileAccess = FileAccess.open("res://levels/drawn/current.json", FileAccess.READ)
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if not parsed is Dictionary:
		push_error("gridmap importer: grid JSON is not a Dictionary")
		return
	# SEAM: JSON.parse_string returns Variant; strict config (unsafe_cast=2) requires explicit casts.
	@warning_ignore("unsafe_cast")
	var grid: Dictionary = parsed as Dictionary
	@warning_ignore("unsafe_cast")
	var w: int = int(grid["width"] as float)
	@warning_ignore("unsafe_cast")
	var cells: Array = grid["cells"] as Array
	clear()
	for i: int in range(cells.size()):
		@warning_ignore("unsafe_cast")  # SEAM: Array element is Variant
		var code: int = int(cells[i] as float)
		var col: int = i % w
		@warning_ignore("integer_division")  # SEAM: intentional integer division
		var row: int = i / w
		var item: int = _item_for(code, col, row)  # zone → tile id (incl. per-zone colour)
		if item >= 0:
			set_cell_item(Vector3i(col, 0, row), item)
```

`_item_for()` maps tile code (and zone, for per-zone colour) to a MeshLibrary item id; returns `-1` for floor/door/empty (door = passable gap; place a separate frame mesh if the brief wants one). Keep it deterministic.

### 4b. Headless build path (no editor open)

When the scene must be generated without an editor session — the normal case for a Draw-level godot-dev dispatch — write a `@tool extends SceneTree` script under `tools/build_<name>.gd` instead:

```gdscript
@tool
extends SceneTree

func _init() -> void:
	var root: Node3D = Node3D.new()
	root.name = "LevelName"
	var grid_map: GridMap = GridMap.new()
	grid_map.name = "LevelMap"
	grid_map.mesh_library = load("res://resources/your_tiles.meshlib.tres")
	grid_map.cell_size = Vector3(cell_x, wall_height, cell_z)
	grid_map.cell_center_x = false
	grid_map.cell_center_y = false
	grid_map.cell_center_z = false
	_populate_from_grid(grid_map)  # use the SEAM casting pattern from step 4
	root.add_child(grid_map)
	grid_map.owner = root
	# add floor slab, DirectionalLight3D, WorldEnvironment, Player...
	var packed: PackedScene = PackedScene.new()
	packed.pack(root)
	ResourceSaver.save(packed, "res://levels/level_name.tscn")
	quit()
```

Run headlessly: `$GODOT --headless --path . --script tools/build_<name>.gd`

**Rule: pick one build path per scene.** Do not author both a headless builder and an editor `@tool` importer for the same scene — they duplicate the JSON-parsing logic and diverge over time.

- **Editor path (step 4):** attach the `@tool extends GridMap` script, flip `rebuild = true` in the inspector, save, commit the baked `.tscn`. Best when iterating in the editor.
- **Headless path (step 4b):** write `tools/build_<name>.gd`, run once to generate the `.tscn`, keep for future rebuilds. Best for agent-driven builds with no editor open.

## Verify additions (on top of godot-verify)

After building, in addition to the standard 3-layer godot-verify:

1. The GridMap has a MeshLibrary assigned and **non-empty** cells (`get_used_cells()` not empty) — an unassigned library renders nothing silently.
2. `cell_size` matches the brief's metres-per-cell × wall height.
3. The scene was **saved after** the importer ran (cells are baked into the `.tscn`); confirm no `@tool` build runs at runtime.
4. Floor slab present and covers the grid extent; props sit at sensible scale.
5. Walk it in an F5 run under `Main/LevelHost`: no wall clips, and a collider matches every visible wall (the `shared_apartment` 6 m gap must be impossible).

## Loading & style (unchanged)

A GridMap level is just another `.tscn`: it loads under `Main/LevelHost` like every level (skill: godot-main-scene) and registers in `main.gd`'s `_levels`. It renders normally inside the orthographic SubViewport pixelation rig; keep the flat `StandardMaterial3D` pixel-art look on the tile meshes, and the level's `DirectionalLight3D` + `WorldEnvironment` (Sky) exactly as blockout levels do (skills: godot-pixel-lighting, godot-3d-pixelation).
