# Godot 4 · Movie Maker: el motor de juegos simula física real y graba cada fotograma
# sin tirones aunque el ordenador vaya lento. 260 fichas de dominó en espiral caen en cadena
# hasta tirar una torre de cajas; la cámara sigue a la ficha que va cayendo.
extends Node3D

var fichas: Array[RigidBody3D] = []
var camara: Camera3D
var t := 0.0

func material(c: Color, rugoso := 0.6) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rugoso
	return m

func _ready() -> void:
	var entorno := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.09, 0.08, 0.12)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.45, 0.42, 0.5)
	env.ambient_light_energy = 0.6
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_light_color = Color(0.09, 0.08, 0.12)
	env.fog_density = 0.02
	entorno.environment = env
	add_child(entorno)

	var sol := DirectionalLight3D.new()
	sol.rotation_degrees = Vector3(-55, 35, 0)
	sol.light_energy = 1.4
	sol.shadow_enabled = true
	add_child(sol)

	# suelo
	var suelo := StaticBody3D.new()
	var forma := CollisionShape3D.new()
	forma.shape = BoxShape3D.new()
	forma.shape.size = Vector3(60, 1, 60)
	suelo.add_child(forma)
	var malla := MeshInstance3D.new()
	malla.mesh = BoxMesh.new()
	malla.mesh.size = Vector3(60, 1, 60)
	malla.material_override = material(Color(0.62, 0.42, 0.27), 0.9)
	suelo.add_child(malla)
	suelo.position.y = -0.5
	add_child(suelo)

	# dominó en espiral de Arquímedes
	var colores := [Color(0.85, 0.12, 0.18), Color(0.95, 0.93, 0.88), Color(0.1, 0.3, 0.75), Color(0.98, 0.7, 0.1)]
	var ang := 0.0
	for i in 260:
		var r := 1.6 + ang * 0.42
		var p := Vector3(cos(ang) * r, 0.5, sin(ang) * r)
		var f := RigidBody3D.new()
		var cs := CollisionShape3D.new()
		cs.shape = BoxShape3D.new()
		cs.shape.size = Vector3(0.12, 1.0, 0.5)
		f.add_child(cs)
		var mi := MeshInstance3D.new()
		mi.mesh = BoxMesh.new()
		mi.mesh.size = Vector3(0.12, 1.0, 0.5)
		mi.material_override = material(colores[i % 4], 0.35)
		f.add_child(mi)
		f.position = p
		f.rotation.y = -ang
		f.mass = 0.2
		add_child(f)
		fichas.append(f)
		ang += 0.55 / r
	# torre de cajas al final
	var ultima := fichas[-1].position
	for piso in 6:
		for k in 3:
			var c := RigidBody3D.new()
			var cs2 := CollisionShape3D.new()
			cs2.shape = BoxShape3D.new()
			cs2.shape.size = Vector3(0.7, 0.7, 0.7)
			c.add_child(cs2)
			var m2 := MeshInstance3D.new()
			m2.mesh = BoxMesh.new()
			m2.mesh.size = Vector3(0.7, 0.7, 0.7)
			m2.material_override = material(Color.from_hsv(0.08 + piso * 0.03, 0.7, 0.9), 0.5)
			c.add_child(m2)
			c.position = ultima + ultima.normalized() * 1.2 + Vector3(0, 0.36 + piso * 0.72, (k - 1) * 0.72)
			c.mass = 0.3
			add_child(c)
	# empujón a la primera ficha
	fichas[0].apply_impulse(Vector3(0, 0, 0.6), Vector3(0, 0.45, 0))

	camara = Camera3D.new()
	camara.fov = 50
	add_child(camara)

	var rotulo := Label.new()
	rotulo.text = "Godot 4 · Movie Maker · física de cuerpos rígidos"
	rotulo.position = Vector2(22, 680)
	rotulo.add_theme_font_size_override("font_size", 18)
	rotulo.modulate = Color(1, 1, 1, 0.7)
	add_child(rotulo)

func _physics_process(delta: float) -> void:
	t += delta
	# la cámara mira a la primera ficha que sigue de pie
	var foco := fichas[-1].global_position
	for f in fichas:
		if f.global_transform.basis.y.y > 0.8:
			foco = f.global_position
			break
	var objetivo := Vector3(0, 0, 0).lerp(foco, 0.7)
	var desde := objetivo + Vector3(cos(t * 0.15) * 9, 6.5 + t * 0.12, sin(t * 0.15) * 9)
	if camara.position == Vector3.ZERO:
		camara.position = desde
	camara.position = camara.position.lerp(desde, 0.04)
	camara.look_at(objetivo, Vector3.UP)
