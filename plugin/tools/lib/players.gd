# tools/lib/players.gd — one place to find and reset the player, so the group-lookup
# and the teleport-reset live here instead of being copy-pasted across call sites.
class_name Players
extends RefCounted

const GROUP := "player"


# The active player node (first in the "player" group), or null if none exists.
static func current(tree: SceneTree) -> Node3D:
	return tree.get_first_node_in_group(GROUP) as Node3D


# Teleport `player` to a spawn pose and zero its velocity (if it is a CharacterBody3D).
static func reset_to(player: Node3D, pos: Vector3, rot_y: float) -> void:
	player.global_position = pos
	player.rotation.y = rot_y
	if player is CharacterBody3D:
		(player as CharacterBody3D).velocity = Vector3.ZERO
