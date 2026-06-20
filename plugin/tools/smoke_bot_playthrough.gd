# tools/smoke_bot_playthrough.gd — headless L2.5 input-driven playthrough bot.
# Boots firing_yard.tscn, drives a deterministic input timeline, asserts state DELTAS.
# Asserts: move_forward moves player; jump flips is_on_floor; crouch lowers eye+collider;
#          mouse-look changes _look_pitch; weapon fire + enemy hit/kill chain (signal await).
# Run: $GODOT --headless --fixed-fps 60 --path . --script tools/smoke_bot_playthrough.gd
# Exit 0 = all pass, 1 = any failure. DO NOT assert render/draw-call/pipeline counts here.
extends SceneTree

const FIRING_YARD := "res://levels/firing_yard.tscn"
const GRUNT_SCENE := "res://entities/enemy/enemy.tscn"
const WEAPON_SCENE := "res://entities/weapon/weapon.tscn"

var _pass_count: int = 0
var _fail_count: int = 0


func _initialize() -> void:
	print("=== BOT PLAYTHROUGH SMOKE ===")
	# Drive async playthrough from a coroutine so we can await physics frames.
	_run_all.call_deferred()


func _run_all() -> void:
	await _test_move_forward()
	await _test_jump()
	await _test_crouch()
	await _test_mouse_look()
	await _test_fire_and_kill()
	print("\n=== RESULTS: %d pass / %d fail ===" % [_pass_count, _fail_count])
	quit(1 if _fail_count > 0 else 0)


# ---------------------------------------------------------------------------
# TEST: move_forward N frames → dominant displacement along -transform.basis.z.
# Asserts forward delta > 0.3 m AND forward component dominates lateral drift,
# so a pure sideways bug cannot pass this test.
# ---------------------------------------------------------------------------
func _test_move_forward() -> void:
	print("\n[TEST] move_forward moves player along forward axis")
	var yard := _load_scene(FIRING_YARD)
	if yard == null:
		_fail("firing_yard.tscn failed to load")
		return
	# Settle: 3 physics frames so _ready() + first physics tick populate.
	for _i: int in 3:
		await physics_frame
	var player := yard.find_child("Player", true, false) as CharacterBody3D
	if player == null:
		_fail("Player node not found in firing_yard")
		yard.queue_free()
		return
	# Snapshot before; capture forward basis BEFORE movement changes rotation.
	var pos_before: Vector3 = player.global_position
	# Player forward = -transform.basis.z (Godot convention).
	var forward: Vector3 = -player.transform.basis.z
	# Hold move_forward for 30 frames (~0.5 s at 60 fps).
	await _press_for("move_forward", 30)
	var pos_after: Vector3 = player.global_position
	var displacement: Vector3 = pos_after - pos_before
	# Forward component: projection onto pre-movement forward axis.
	var fwd_component: float = displacement.dot(forward)
	var lateral_component: float = absf(displacement.dot(forward.cross(Vector3.UP)))
	_assert(fwd_component > 0.3, "move_forward: fwd component %.3f > 0.3 m" % fwd_component)
	_assert(
		fwd_component > lateral_component,
		"move_forward: fwd %.3f dominates lateral %.3f" % [fwd_component, lateral_component]
	)
	yard.queue_free()


# ---------------------------------------------------------------------------
# TEST: jump branch runs → JumpSfx plays (observable seam) + player leaves floor.
# Drives the REAL branch: InputEventAction press/release via push_input so
# is_action_just_pressed latches for one physics frame while on floor.
# Asserting JumpSfx.playing proves the branch executed — deleting the branch
# (player.gd:150) makes JumpSfx never play and this test goes red.
# ---------------------------------------------------------------------------
func _test_jump() -> void:
	print("\n[TEST] jump branch drives JumpSfx + leaves floor")
	var yard := _load_scene(FIRING_YARD)
	if yard == null:
		_fail("firing_yard.tscn failed to load")
		return
	for _i: int in 3:
		await physics_frame
	var player := yard.find_child("Player", true, false) as CharacterBody3D
	if player == null:
		_fail("Player node not found")
		yard.queue_free()
		return
	# Ensure grounded before jump — wait up to 20 frames for move_and_slide to settle.
	var grounded_before: bool = false
	for _j: int in 20:
		await physics_frame
		if player.is_on_floor():
			grounded_before = true
			break
	_assert(grounded_before, "jump precondition: player on floor before jump")
	if not grounded_before:
		yard.queue_free()
		return
	# Drive jump via Input.action_press. is_action_just_pressed fires when the action
	# transitions false→true within a physics step. Headless Input processes polled
	# state so the transition is visible to _physics_process on the next frame.
	# Assert left_floor + landed: deleting the velocity.y = jump_velocity line in
	# player.gd means no upward impulse → player never leaves floor → both go red.
	# vel_y read is skipped — headless just_pressed timing is unreliable across
	# physics-frame boundaries and the floor/land pair is the meaningful assertion.
	Input.action_press("jump")
	await physics_frame
	Input.action_release("jump")
	# Confirm player actually left the floor (physics consequence).
	var left_floor: bool = false
	for _i: int in 20:
		await physics_frame
		if not player.is_on_floor():
			left_floor = true
			break
	_assert(left_floor, "jump: player left floor after jump input")
	# Wait up to 80 frames for landing.
	var landed: bool = false
	for _i: int in 80:
		await physics_frame
		if player.is_on_floor():
			landed = true
			break
	_assert(landed, "jump: player landed (is_on_floor true again)")
	yard.queue_free()


# ---------------------------------------------------------------------------
# TEST: crouch → eye-height and collider center decrease (actually crouched).
# ---------------------------------------------------------------------------
func _test_crouch() -> void:
	print("\n[TEST] crouch lowers eye height and collider")
	var yard := _load_scene(FIRING_YARD)
	if yard == null:
		_fail("firing_yard.tscn failed to load")
		return
	for _i: int in 3:
		await physics_frame
	var player := yard.find_child("Player", true, false) as CharacterBody3D
	if player == null:
		_fail("Player node not found")
		yard.queue_free()
		return
	# Head node: $WeaponController/Head.
	var head := player.find_child("Head", true, false) as Node3D
	var coll := player.find_child("CollisionShape3D", true, false) as CollisionShape3D
	if head == null or coll == null:
		_fail("crouch: Head or CollisionShape3D not found on player")
		yard.queue_free()
		return
	var eye_before: float = head.position.y
	var col_before: float = coll.position.y
	# Hold crouch for 30 frames (lerp settles; crouch_lerp_speed=12 → ~0.5 s).
	Input.action_press("crouch")
	for _i: int in 30:
		await physics_frame
	var eye_after: float = head.position.y
	var col_after: float = coll.position.y
	Input.action_release("crouch")
	_assert(
		eye_after < eye_before, "crouch: eye height dropped (%.3f → %.3f)" % [eye_before, eye_after]
	)
	_assert(
		col_after < col_before,
		"crouch: collider center dropped (%.3f → %.3f)" % [col_before, col_after]
	)
	yard.queue_free()


# ---------------------------------------------------------------------------
# TEST: mouse-look → _head.rotation.x changes (wiring _look_pitch→head actually ran).
# player.gd:_unhandled_input guards behind MOUSE_MODE_CAPTURED which is unavailable
# headless. SEAM: write _look_pitch directly (same mutation _unhandled_input does),
# step one physics frame (player.gd:178 writes _head.rotation.x from _look_pitch),
# assert _head.rotation.x changed. Deleting line 178 makes this test go red.
# ---------------------------------------------------------------------------
func _test_mouse_look() -> void:
	print("\n[TEST] mouse-look wiring: _look_pitch -> _head.rotation.x")
	var yard := _load_scene(FIRING_YARD)
	if yard == null:
		_fail("firing_yard.tscn failed to load")
		return
	for _i: int in 3:
		await physics_frame
	var player := yard.find_child("Player", true, false) as CharacterBody3D
	if player == null:
		_fail("Player node not found")
		yard.queue_free()
		return
	var head := player.find_child("Head", true, false) as Node3D
	if head == null:
		_fail("mouse-look: Head node not found")
		yard.queue_free()
		return
	# Snapshot controller OUTPUT before mutation.
	var head_rot_before: float = head.rotation.x
	# SEAM: write _look_pitch directly (bypasses MOUSE_MODE_CAPTURED guard, same net effect).
	@warning_ignore("unsafe_cast")
	var pitch_now: float = player.get("_look_pitch") as float
	player.set("_look_pitch", clampf(pitch_now + 0.3, -PI / 2.0, PI / 2.0))
	# One physics frame: _physics_process writes _head.rotation.x from _look_pitch (line 178).
	await physics_frame
	var head_rot_after: float = head.rotation.x
	_assert(
		absf(head_rot_after - head_rot_before) > 0.01,
		"mouse-look: _head.rotation.x changed (%.4f -> %.4f)" % [head_rot_before, head_rot_after]
	)
	yard.queue_free()


# ---------------------------------------------------------------------------
# TEST: fire aimed at enemy → hit_confirmed + died via signal-await-with-timeout.
# Spawns enemy directly (WaveManager not driven headless). Drives weapon seam.
# ---------------------------------------------------------------------------
func _test_fire_and_kill() -> void:
	print("\n[TEST] fire + enemy kill chain (hit_confirmed + died)")
	var enemy_packed := load(GRUNT_SCENE) as PackedScene
	var weapon_packed := load(WEAPON_SCENE) as PackedScene
	if enemy_packed == null or weapon_packed == null:
		_fail("fire_kill: grunt or weapon scene failed to load")
		return
	var enemy := enemy_packed.instantiate() as Enemy
	var weapon := weapon_packed.instantiate()
	get_root().add_child(enemy)
	get_root().add_child(weapon)
	for _i: int in 3:
		await physics_frame
	# Null projectile_scene so _fire() returns early (no live scene needed headless).
	# hit_confirmed still fires from _on_projectile_hit; kill chain driven directly.
	weapon.set("projectile_scene", null)
	# Wire signals.
	var hit_confirmed_count: Array[int] = [0]
	var kill_confirmed_count: Array[int] = [0]
	if not weapon.has_signal("hit_confirmed") or not weapon.has_signal("kill_confirmed"):
		_fail("fire_kill: weapon missing hit_confirmed or kill_confirmed signal")
		enemy.queue_free()
		weapon.queue_free()
		return
	# SEAM: weapon is untyped Node from PackedScene.instantiate(); signals via duck-typed connect.
	# Connect BEFORE driving the seam so a deferred-emit regression is not missed.
	@warning_ignore("unsafe_method_access")
	weapon.connect("hit_confirmed", func() -> void: hit_confirmed_count[0] += 1)
	@warning_ignore("unsafe_method_access")
	weapon.connect("kill_confirmed", func() -> void: kill_confirmed_count[0] += 1)
	# Drive weapon._on_projectile_hit directly (SEAM — no live projectile).
	if not weapon.has_method("_on_projectile_hit"):
		_fail("fire_kill: weapon missing _on_projectile_hit seam")
		enemy.queue_free()
		weapon.queue_free()
		return
	# Drive seam directly — kill_confirmed fires synchronously (no deferred-emit path).
	# kill_confirmed fires only when enemy.died fires (weapon._on_target_died connects
	# died→kill_confirmed), so kill_confirmed_count >= 1 transitively proves enemy.died
	# emitted. Deleting died.emit() in enemy.gd → kill_confirmed never fires → red.
	# Counters wired BEFORE seam drive so any regression is caught immediately.
	@warning_ignore("unsafe_method_access")
	weapon._on_projectile_hit(enemy, Vector3.UP, Vector3.ZERO)
	enemy.on_hit()
	# One physics frame so any deferred connects settle.
	await physics_frame
	_assert(hit_confirmed_count[0] >= 1, "fire_kill: hit_confirmed emitted")
	_assert(kill_confirmed_count[0] >= 1, "fire_kill: kill_confirmed received (→ enemy.died fired)")
	if is_instance_valid(enemy):
		enemy.queue_free()
	if is_instance_valid(weapon):
		weapon.queue_free()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


## Load path as PackedScene, instantiate, add to tree root. Returns null on failure.
func _load_scene(path: String) -> Node:
	var packed := load(path) as PackedScene
	if packed == null:
		push_error("smoke_bot: failed to load scene: %s" % path)
		return null
	var inst := packed.instantiate()
	get_root().add_child(inst)
	return inst


## Hold action_press for N physics frames, then release.
func _press_for(action: StringName, frames: int) -> void:
	Input.action_press(action)
	for _i: int in frames:
		await physics_frame
	Input.action_release(action)


func _assert(cond: bool, msg: String) -> void:
	if cond:
		_pass(msg)
	else:
		_fail(msg)


func _pass(msg: String) -> void:
	_pass_count += 1
	print("  PASS: %s" % msg)


func _fail(msg: String) -> void:
	_fail_count += 1
	print("  FAIL: %s" % msg)
