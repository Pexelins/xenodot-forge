# tools/lib/node_builder.gd — static helpers to build owned scene nodes (mesh bodies,
# triggers) without repeating the new / name / add_child / set-owner boilerplate.
class_name NodeBuilder
extends RefCounted


# Add `child` under `parent` and set its owner to the scene root so the node persists
# in a programmatically built scene. Root = `parent.owner` (the scene root when
# `parent` is nested) or `parent` itself (when `parent` IS the root). Attach the parent
# before its children so the owner is resolved correctly.
static func attach(child: Node, parent: Node) -> void:
	parent.add_child(child)
	child.owner = parent.owner if parent.owner != null else parent


# A flat-colour BoxMesh MeshInstance3D (visual only, no collision).
static func vis_box(
	parent: Node3D, node_name: String, size: Vector3, pos: Vector3, color: Color
) -> MeshInstance3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = material
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = mesh
	mi.position = pos
	attach(mi, parent)
	return mi


# A StaticBody3D with a BoxMesh MeshInstance3D + matching BoxShape3D collision.
static func box_body(
	parent: Node3D, node_name: String, size: Vector3, pos: Vector3, material: StandardMaterial3D
) -> StaticBody3D:
	return _mesh_body(parent, node_name, size, pos, material, Vector3.ZERO)


# Like box_body, rotated `deg_x` degrees about X (a ramp).
static func ramp_body(
	parent: Node3D,
	node_name: String,
	size: Vector3,
	pos: Vector3,
	deg_x: float,
	material: StandardMaterial3D
) -> StaticBody3D:
	return _mesh_body(parent, node_name, size, pos, material, Vector3(deg_x, 0.0, 0.0))


# An Area3D trigger with a BoxShape3D, monitoring `mask` (default the player layer, 2).
static func trigger(
	parent: Node3D, node_name: String, size: Vector3, pos: Vector3, mask: int = 2
) -> Area3D:
	var area := Area3D.new()
	area.name = node_name
	area.monitoring = true
	area.collision_layer = 0
	area.collision_mask = mask
	attach(area, parent)
	var box := BoxShape3D.new()
	box.size = size
	var shape := CollisionShape3D.new()
	shape.name = node_name + "Shape"
	shape.shape = box
	shape.position = pos
	attach(shape, area)
	return area


static func _mesh_body(
	parent: Node3D,
	node_name: String,
	size: Vector3,
	pos: Vector3,
	material: StandardMaterial3D,
	rot_deg: Vector3
) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = node_name
	attach(body, parent)
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = material
	var mi := MeshInstance3D.new()
	mi.name = node_name + "Mesh"
	mi.mesh = mesh
	mi.position = pos
	mi.rotation_degrees = rot_deg
	attach(mi, body)
	var box := BoxShape3D.new()
	box.size = size
	var shape := CollisionShape3D.new()
	shape.name = node_name + "Collision"
	shape.shape = box
	shape.position = pos
	shape.rotation_degrees = rot_deg
	attach(shape, body)
	return body
