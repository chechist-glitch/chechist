# Blender 4 en modo consola (sin interfaz): todo se construye con Python.
# Física de verdad: 120 aceitunas (cuerpos rígidos) caen sobre un plato de cerámica
# y rebotan entre ellas; se simula y se renderiza con Cycles en CPU.
# Render: blender -b -P olivos.py
import bpy, math, random, os

random.seed(1906)
bpy.ops.wm.read_factory_settings(use_empty=True)
esc = bpy.context.scene
esc.frame_start, esc.frame_end = 1, 72
esc.render.fps = 24
esc.render.engine = "CYCLES"
esc.cycles.device = "CPU"
esc.cycles.samples = int(os.environ.get("SPP", 40))
esc.cycles.use_denoising = False  # el Blender de Ubuntu viene sin OpenImageDenoise
esc.render.resolution_x, esc.render.resolution_y = 640, 360
esc.render.image_settings.file_format = "PNG"
esc.render.filepath = os.path.join(os.environ.get("SALIDA", os.getcwd()), "frames", "f")
esc.view_settings.view_transform = "Filmic" if "Filmic" in [v.identifier for v in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items] else "AgX"

def material(nombre, color, rough=0.4, spec=0.5, sss=0.0, metal=0.0):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if "Subsurface Weight" in b.inputs:
        b.inputs["Subsurface Weight"].default_value = sss
    return m

# Mesa de madera (textura procedural de ondas) y plato
bpy.ops.mesh.primitive_plane_add(size=12)
mesa = bpy.context.object
mm = material("madera", (0.35, 0.18, 0.08), rough=0.5)
nt = mm.node_tree
ondas = nt.nodes.new("ShaderNodeTexWave")
ondas.inputs["Scale"].default_value = 1.6
ondas.inputs["Distortion"].default_value = 6
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (0.18, 0.08, 0.03, 1)
ramp.color_ramp.elements[1].color = (0.45, 0.24, 0.1, 1)
nt.links.new(ondas.outputs["Fac"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
mesa.data.materials.append(mm)
bpy.ops.rigidbody.object_add(type="PASSIVE")

bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=2.0, depth=0.12, location=(0, 0, 0.06))
plato = bpy.context.object
bpy.ops.object.modifier_add(type="BEVEL")
plato.modifiers["Bevel"].width = 0.05
plato.modifiers["Bevel"].segments = 4
plato.data.materials.append(material("ceramica", (0.92, 0.9, 0.84), rough=0.15))
bpy.ops.rigidbody.object_add(type="PASSIVE")
plato.rigid_body.collision_shape = "CYLINDER"
# borde del plato (toro) para que no se escapen todas
bpy.ops.mesh.primitive_torus_add(major_radius=2.0, minor_radius=0.09, location=(0, 0, 0.16))
borde = bpy.context.object
borde.data.materials.append(material("azul", (0.08, 0.22, 0.65), rough=0.15))
bpy.ops.rigidbody.object_add(type="PASSIVE")
borde.rigid_body.collision_shape = "MESH"

# Aceitunas: elipsoides verdes y moradas, con subsurface
verde = material("aceituna_verde", (0.28, 0.36, 0.06), rough=0.25, sss=0.15)
morada = material("aceituna_negra", (0.09, 0.03, 0.06), rough=0.2, sss=0.05)
for i in range(120):
    x, y = random.uniform(-1.2, 1.2), random.uniform(-1.2, 1.2)
    z = 1.2 + i * 0.07 + random.uniform(0, 0.3)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.13, location=(x, y, z))
    a = bpy.context.object
    a.scale = (1, 1, 1.35)
    a.rotation_euler = (random.uniform(0, 3), random.uniform(0, 3), 0)
    bpy.ops.object.shade_smooth()
    a.data.materials.append(verde if random.random() < 0.6 else morada)
    bpy.ops.rigidbody.object_add(type="ACTIVE")
    a.rigid_body.collision_shape = "CONVEX_HULL"
    a.rigid_body.mass = 0.01
    a.rigid_body.restitution = 0.35
    a.rigid_body.friction = 0.6

esc.rigidbody_world.point_cache.frame_end = 72
esc.rigidbody_world.substeps_per_frame = 20

# Luz de ventana (área grande) y relleno
bpy.ops.object.light_add(type="AREA", location=(-4, -3, 6))
luz = bpy.context.object
luz.data.energy = 2200
luz.data.size = 3
luz.rotation_euler = (math.radians(45), math.radians(-30), 0)
bpy.ops.object.light_add(type="AREA", location=(5, 4, 3))
bpy.context.object.data.energy = 400
bpy.context.object.data.size = 5
bpy.context.object.rotation_euler = (math.radians(60), math.radians(40), math.radians(140))
mundo = bpy.data.worlds.new("mundo")
mundo.use_nodes = True
mundo.node_tree.nodes["Background"].inputs["Color"].default_value = (0.12, 0.1, 0.09, 1)
esc.world = mundo

# Cámara con desenfoque y un leve travelling
bpy.ops.object.camera_add(location=(4.6, -4.6, 3.4))
cam = bpy.context.object
esc.camera = cam
objetivo = bpy.data.objects.new("objetivo", None)
esc.collection.objects.link(objetivo)
objetivo.location = (0, 0, 0.3)
c = cam.constraints.new("TRACK_TO")
c.target = objetivo
c.track_axis = "TRACK_NEGATIVE_Z"
c.up_axis = "UP_Y"
cam.data.lens = 50
cam.data.dof.use_dof = True
cam.data.dof.focus_object = objetivo
cam.data.dof.aperture_fstop = 2.8
cam.keyframe_insert("location", frame=1)
cam.location = (3.8, -4.2, 2.8)
cam.keyframe_insert("location", frame=72)

bpy.ops.ptcache.bake_all(bake=True)
bpy.ops.render.render(animation=True)
