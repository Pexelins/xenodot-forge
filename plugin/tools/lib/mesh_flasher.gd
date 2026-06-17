# tools/lib/mesh_flasher.gd — flash every MeshInstance3D under a node to a colour (albedo +
# emission) via one parallel tween, duplicating a unique material per part so shared material
# resources aren't tinted globally. Returns the Tween (back in sequential mode) so the caller can
# chain a finish step — `.tween_callback(queue_free)` for a death flash, or a tint-restore.
class_name MeshFlasher
extends RefCounted


static func flash(host: Node, mesh_root: Node3D, color: Color, dur: float = 0.06) -> Tween:
	var tw: Tween = host.create_tween()
	tw.set_parallel(true)
	for mi: MeshInstance3D in _collect(mesh_root):
		var base: StandardMaterial3D = mi.get_active_material(0) as StandardMaterial3D
		if base == null:
			continue
		var flash_mat: StandardMaterial3D = base.duplicate() as StandardMaterial3D
		mi.set_surface_override_material(0, flash_mat)
		flash_mat.emission_enabled = true
		tw.tween_property(flash_mat, "albedo_color", color, dur)
		tw.tween_property(flash_mat, "emission", color, dur)
	tw.set_parallel(false)
	return tw


static func _collect(mesh_root: Node3D) -> Array[MeshInstance3D]:
	var out: Array[MeshInstance3D] = []
	for child: Node in mesh_root.find_children("*", "MeshInstance3D", true, false):
		if child is MeshInstance3D:
			out.append(child as MeshInstance3D)
	return out
