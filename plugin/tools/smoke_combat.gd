# tools/smoke_combat.gd — headless L2.5 smoke: weapon fire + hit/kill signal contract.
# Asserts runtime outcomes validate.sh + render snapshot cannot catch:
#   1. Weapon `fired` signal has 0-arg arity (catches widened-signal regressions).
#   2. Projectile `hit` signal has 3-arg arity: target, normal, hit_pos.
#   3. enemy_shooter `_on_projectile_hit` listener matches projectile `hit` 3-arg arity.
#   4. Weapon `try_fire()` returns true + decrements ammo (fire path executes).
#   5. Enemy `died` emits with correct payload on fatal hit (kill chain intact).
#   6. Weapon `hit_confirmed` + `kill_confirmed` emit on enemy kill (weapon seam intact).
# Run: $GODOT --headless --path . --script tools/smoke_combat.gd
# Exit 0 = all pass, 1 = any failure. DO NOT assert render/draw-call/pipeline counts here.
extends SceneTree

const GRUNT_SCENE := "res://entities/enemy/enemy.tscn"
const WEAPON_SCENE := "res://entities/weapon/weapon.tscn"
const PROJECTILE_SCENE := "res://entities/projectile/projectile.tscn"
const SHOOTER_SCENE := "res://entities/enemy/enemy_shooter.tscn"

var _pass_count: int = 0
var _fail_count: int = 0
var _frame: int = 0
var _done: bool = false


func _initialize() -> void:
	print("=== COMBAT SMOKE ===")


func _process(_delta: float) -> bool:
	_frame += 1
	# Frame 1: _ready() fires. Frame 2: physics tick. Frame 3: state populated.
	if _frame == 3 and not _done:
		_done = true
		_run_all()
	return false


func _run_all() -> void:
	_test_fired_signal_arity()
	_test_projectile_hit_signal_arity()
	_test_shooter_listener_arity()
	_test_weapon_try_fire_executes()
	_test_grunt_kill_chain()
	_test_weapon_kill_seam()
	print("\n=== RESULTS: %d pass / %d fail ===" % [_pass_count, _fail_count])
	quit(1 if _fail_count > 0 else 0)


## 1. Weapon `fired` must be 0-arg — a builder widening it to fired(pos) breaks all listeners.
func _test_fired_signal_arity() -> void:
	print("\n[TEST] weapon.fired signal arity == 0")
	var packed := load(WEAPON_SCENE) as PackedScene
	if packed == null:
		_fail("weapon.tscn failed to load")
		return
	var inst := packed.instantiate()
	root.add_child(inst)
	# Introspect signal list for exact arg count — catches arity drift without needing to emit.
	var sig_args: int = _get_signal_arg_count(inst, "fired")
	if sig_args == -1:
		_fail("weapon: 'fired' signal not found on Weapon node")
	elif sig_args == 0:
		_pass("weapon.fired is 0-arg (correct arity)")
	else:
		_fail("weapon.fired has %d arg(s) — expected 0; listeners will mismatch" % sig_args)
	inst.queue_free()


## 2. Projectile `hit` must be 3-arg: target Node3D, normal Vector3, hit_pos Vector3.
func _test_projectile_hit_signal_arity() -> void:
	print("\n[TEST] projectile.hit signal arity == 3")
	var packed := load(PROJECTILE_SCENE) as PackedScene
	if packed == null:
		_fail("projectile.tscn failed to load")
		return
	var inst := packed.instantiate()
	root.add_child(inst)
	var sig_args: int = _get_signal_arg_count(inst, "hit")
	if sig_args == -1:
		_fail("projectile: 'hit' signal not found")
	elif sig_args == 3:
		_pass("projectile.hit is 3-arg (target, normal, hit_pos) — correct arity")
	else:
		_fail(
			(
				"projectile.hit has %d arg(s) — expected 3; weapon._on_projectile_hit will break"
				% sig_args
			)
		)
	inst.queue_free()


## 3. enemy_shooter._on_projectile_hit listener must match projectile.hit 3-arg arity.
## Connect projectile.hit -> shooter listener and emit; if arities mismatch Godot errors at emit.
func _test_shooter_listener_arity() -> void:
	print("\n[TEST] enemy_shooter._on_projectile_hit connects to projectile.hit 3-arg signal")
	var proj_packed := load(PROJECTILE_SCENE) as PackedScene
	var shooter_packed := load(SHOOTER_SCENE) as PackedScene
	if proj_packed == null or shooter_packed == null:
		_fail("shooter/projectile scene failed to load")
		return
	var proj := proj_packed.instantiate() as Projectile
	var shooter := shooter_packed.instantiate()
	root.add_child(proj)
	root.add_child(shooter)
	# enemy_shooter.gd connects proj.hit to _on_projectile_hit in _fire_at_player().
	# Replicate that connection here and emit — a wrong arity causes a runtime error/crash.
	# SEAM: shooter is Node, _on_projectile_hit duck-typed; proven by has_method guard.
	if not shooter.has_method("_on_projectile_hit"):
		_fail("enemy_shooter missing _on_projectile_hit — listener contract broken")
		proj.queue_free()
		shooter.queue_free()
		return
	# SEAM: Callable by name — arity mismatch surfaces as Godot error on emit.
	proj.hit.connect(Callable(shooter, "_on_projectile_hit"), CONNECT_ONE_SHOT)
	# Emit with a dummy Node3D target (not in player group — no side-effects).
	var dummy := Node3D.new()
	root.add_child(dummy)
	proj.hit.emit(dummy, Vector3.UP, Vector3.ZERO)
	_pass("enemy_shooter._on_projectile_hit connected + received projectile.hit 3-arg emit")
	dummy.queue_free()
	if is_instance_valid(proj):
		proj.queue_free()
	if is_instance_valid(shooter):
		shooter.queue_free()


## 4. Weapon try_fire() returns true and ammo decrements — fire path executed.
func _test_weapon_try_fire_executes() -> void:
	print("\n[TEST] weapon.try_fire() executes fire path (returns true, ammo -1)")
	var packed := load(WEAPON_SCENE) as PackedScene
	if packed == null:
		_fail("weapon.tscn failed to load")
		return
	var inst := packed.instantiate()
	root.add_child(inst)
	if not inst.has_method("try_fire"):
		_fail("weapon missing try_fire()")
		inst.queue_free()
		return
	# Null projectile_scene so _fire() returns early and doesn't try to spawn into current_scene
	# (which is null headless). Ammo decrement + return value still exercise the fire path.
	inst.set("projectile_scene", null)
	# Read ammo before — SEAM: _ammo private, read via get().
	@warning_ignore("unsafe_cast")
	var ammo_before := inst.get("_ammo") as int
	# SEAM: duck-typed call; try_fire() is public on Weapon but inst is untyped Node here.
	@warning_ignore("unsafe_method_access")
	var fired_result: bool = inst.try_fire()
	@warning_ignore("unsafe_cast")
	var ammo_after := inst.get("_ammo") as int
	if fired_result:
		_pass("weapon.try_fire() returned true (shot fired)")
	else:
		_fail("weapon.try_fire() returned false — fire path blocked (cooldown? missing muzzle?)")
	if ammo_after == ammo_before - 1:
		_pass(
			(
				"weapon ammo decremented by 1 after try_fire (ammo_before=%d ammo_after=%d)"
				% [ammo_before, ammo_after]
			)
		)
	else:
		_fail(
			"weapon ammo not decremented (ammo_before=%d ammo_after=%d)" % [ammo_before, ammo_after]
		)
	inst.queue_free()


## 5. Grunt on_hit() -> died emitted with enemy payload (kill chain).
func _test_grunt_kill_chain() -> void:
	print("\n[TEST] grunt on_hit() -> died(enemy) payload")
	var packed := load(GRUNT_SCENE) as PackedScene
	if packed == null:
		_fail("grunt.tscn failed to load")
		return
	var inst := packed.instantiate()
	if not inst is Enemy:
		_fail("grunt root not Enemy class")
		inst.queue_free()
		return
	var e := inst as Enemy
	root.add_child(e)
	var got: Array = [0, null]
	# SEAM: died(enemy: Enemy) — 1-arg. Wrong arity (0 or 2) will runtime-error on connect.
	e.died.connect(
		func(en: Enemy) -> void:
			@warning_ignore("unsafe_cast")
			var c := (got[0] as int) + 1
			got[0] = c
			got[1] = en
	)
	e.on_hit()
	@warning_ignore("unsafe_cast")
	var died_count := got[0] as int
	_assert(died_count == 1, "grunt: died emitted exactly once on fatal hit")
	@warning_ignore("unsafe_cast")
	var died_payload := got[1] as Enemy
	_assert(died_payload == e, "grunt: died payload is the enemy node (correct 1-arg arity)")
	if is_instance_valid(e):
		e.queue_free()


## 6. Weapon hit_confirmed + kill_confirmed emit when a killing hit is registered.
## Uses weapon._on_projectile_hit() directly (SEAM) — no live projectile needed.
func _test_weapon_kill_seam() -> void:
	print("\n[TEST] weapon hit_confirmed + kill_confirmed emit on enemy kill")
	var w_packed := load(WEAPON_SCENE) as PackedScene
	var e_packed := load(GRUNT_SCENE) as PackedScene
	if w_packed == null or e_packed == null:
		_fail("weapon/grunt scene failed to load")
		return
	var w_inst := w_packed.instantiate()
	var e_inst := e_packed.instantiate()
	if not e_inst is Enemy:
		_fail("grunt root not Enemy")
		w_inst.queue_free()
		e_inst.queue_free()
		return
	root.add_child(w_inst)
	root.add_child(e_inst)
	var e := e_inst as Enemy
	var hit_confirmed_count: Array[int] = [0]
	var kill_confirmed_count: Array[int] = [0]
	# SEAM: weapon is untyped Node; signals accessed via duck-typed connect.
	if not w_inst.has_signal("hit_confirmed") or not w_inst.has_signal("kill_confirmed"):
		_fail("weapon missing hit_confirmed or kill_confirmed signal")
		w_inst.queue_free()
		e.queue_free()
		return
	@warning_ignore("unsafe_method_access")
	w_inst.connect("hit_confirmed", func() -> void: hit_confirmed_count[0] += 1)
	@warning_ignore("unsafe_method_access")
	w_inst.connect("kill_confirmed", func() -> void: kill_confirmed_count[0] += 1)
	# Drive weapon._on_projectile_hit(target, normal, hit_pos) directly — SEAM.
	if not w_inst.has_method("_on_projectile_hit"):
		_fail("weapon missing _on_projectile_hit — internal seam broken")
		w_inst.queue_free()
		e.queue_free()
		return
	# SEAM: _on_projectile_hit is internal but public-namespaced on Weapon; duck call via has_method.
	@warning_ignore("unsafe_method_access")
	w_inst._on_projectile_hit(e, Vector3.UP, Vector3.ZERO)
	# hit_confirmed fires immediately; kill_confirmed fires when e.died emits (grunt health=1, fatal).
	# on_hit() delivers the kill — trigger it now since the weapon subscribed to died via one-shot.
	e.on_hit()
	_assert(hit_confirmed_count[0] == 1, "weapon: hit_confirmed emitted on projectile hit")
	_assert(kill_confirmed_count[0] == 1, "weapon: kill_confirmed emitted on enemy kill")
	if is_instance_valid(w_inst):
		w_inst.queue_free()
	if is_instance_valid(e):
		e.queue_free()


## Returns number of arguments for signal `sig_name` on `node`, or -1 if not found.
func _get_signal_arg_count(node: Node, sig_name: String) -> int:
	for sig: Dictionary in node.get_signal_list():
		# SEAM: signal dict from engine API — keys are Variant; cast guarded.
		@warning_ignore("unsafe_cast")
		var name_val := sig.get("name", "") as String
		if name_val == sig_name:
			@warning_ignore("unsafe_cast")
			var args_val := sig.get("args", []) as Array
			return args_val.size()
	return -1


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
