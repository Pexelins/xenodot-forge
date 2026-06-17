# tools/lib/audio_one_shot.gd — play an AudioStreamPlayer that must outlive its owner: reparent it
# to a surviving node so the owner's queue_free() doesn't cut the tail, then free it when it ends.
# This is the canonical implementation of the "despawn SFX" pattern in the godot-audio skill.
class_name AudioOneShot
extends RefCounted


# Reparent `player` to `host` (default: the current scene root) and play it, auto-freeing it on
# finish. Call right before the owner node frees itself (death, projectile impact).
static func play_detached(player: AudioStreamPlayer, host: Node = null) -> void:
	var target: Node = host if host != null else player.get_tree().current_scene
	if target == null:
		return
	player.reparent(target)
	if not player.finished.is_connected(player.queue_free):
		player.finished.connect(player.queue_free)
	player.play()
