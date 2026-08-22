import bpy, math
R = math.radians
OUT = '/home/lex/.hermes/poop-souls/public/'

def clean():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.cameras, bpy.data.lights, bpy.data.actions):
        for d in list(coll):
            coll.remove(d)

def mat(name, color, rough=0.6, metal=0.0, alpha=1.0, emis=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.blend_method = 'BLEND'
        m.show_transparent_back = False
    if emis:
        b.inputs["Emission Color"].default_value = (*emis, 1)
        b.inputs["Emission Strength"].default_value = 1.2
    return m

C = 255.0
def hx(h): return ((h >> 16 & 255)/C, (h >> 8 & 255)/C, (h & 255)/C)

def sphere(loc, scale, m, seg=16, ring=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, location=loc)
    ob = bpy.context.active_object; ob.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(m); return ob

def box(loc, scale, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object; ob.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(m); return ob

def cyl(loc, r, depth, m, verts=12, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.data.materials.append(m); return ob

def eye_pair(y, z, xoff=0.11, r=0.045, m=None):
    if m is None: m = mat("eye", (0.06,0.06,0.07), rough=0.3)
    a = sphere(( xoff, y, z), (r,r,r), m, 10, 8)
    b = sphere((-xoff, y, z), (r,r,r), m, 10, 8)
    return [a,b]

def build_and_export(name, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    final = bpy.context.view_layer.objects.active
    final.name = name
    bpy.ops.object.select_all(action='DESELECT')
    final.select_set(True)
    bpy.context.view_layer.objects.active = final
    bpy.ops.export_scene.gltf(
        filepath=OUT + name + '.glb', use_selection=True, export_format='GLB',
        export_animations=False, export_skins=False, export_yup=True, export_apply=True,
    )
    print('EXPORTED', name, 'verts', len(final.data.vertices))

# ============ BIBER (small beaver/rodent critter, faces -Y) ============
clean()
cream  = mat("biber_body", hx(0xe8dcc8), 0.5)
cream2 = mat("biber_belly", hx(0xf4ecd9), 0.5)
pink   = mat("biber_nose", (0.9,0.55,0.5), 0.4)
white  = mat("biber_teeth", (0.98,0.97,0.92), 0.3)
tail   = mat("biber_tail", (0.45,0.34,0.26), 0.6)
o = []
o.append(sphere((0,0.02,0.30),(0.26,0.30,0.28), cream))                 # body
o.append(sphere((0,-0.02,0.26),(0.20,0.22,0.22), cream2))              # belly
o.append(sphere((0,-0.10,0.56),(0.17,0.15,0.15), cream))               # head
o.append(sphere((0,-0.235,0.52),(0.035,0.03,0.03), pink))              # nose
o += eye_pair(-0.20, 0.60, xoff=0.075, r=0.035)                         # eyes
o.append(box(( 0.035,-0.20,0.455),(0.028,0.02,0.05), white))          # tooth L
o.append(box((-0.035,-0.20,0.455),(0.028,0.02,0.05), white))          # tooth R
o.append(sphere(( 0.11,-0.06,0.70),(0.05,0.03,0.06), cream))          # ear L
o.append(sphere((-0.11,-0.06,0.70),(0.05,0.03,0.06), cream))          # ear R
o.append(sphere((0,0.30,0.24),(0.06,0.16,0.045), tail))               # flat tail
build_and_export("mob-biber", o)

# ============ CLOG (tank: big mossy clogged plug, faces -Y) ============
clean()
moss   = mat("clog_body", hx(0x8a9a7a), 0.85)
mossD  = mat("clog_moss", (0.35,0.48,0.28), 0.9)
plug   = mat("clog_plug", (0.30,0.26,0.22), 0.7)
stone  = mat("clog_stone", (0.5,0.48,0.42), 0.8)
o = []
o.append(sphere((0,0,0.52),(0.52,0.52,0.50), moss))                    # body
o.append(sphere((0,-0.05,0.98),(0.34,0.30,0.22), moss))               # dome head
o.append(cyl((0,-0.20,1.16), 0.14, 0.34, plug, 10, (R(20),0,0)))      # drain spout
# ring of clog protrusions (lumps) around the body
import random
random.seed(7)
for i in range(9):
    a = i/9*6.283
    x, z = math.cos(a)*0.46, 0.52 + math.sin(a)*0.42
    o.append(sphere((x, math.sin(a+1)*0.05, z), (0.10,0.10,0.12), mossD, 10, 8))
# face
o += eye_pair(-0.42, 0.96, xoff=0.12, r=0.05)
o.append(box(( 0.12,-0.44,1.02),(0.10,0.02,0.03), plug))             # brow L
o.append(box((-0.12,-0.44,1.02),(0.10,0.02,0.03), plug))             # brow R
o.append(cyl((0,-0.50,0.60), 0.10, 0.06, stone, 10, (R(90),0,0)))     # clog mouth plug
build_and_export("mob-clog", o)

# ============ FART (ranged: translucent green gas blob, faces -Y) ============
clean()
gas    = mat("fart_body", hx(0x7ab04a), 0.4, alpha=0.72)
gas2   = mat("fart_puff", hx(0x9adf5a), 0.4, alpha=0.55)
o = []
o.append(sphere((0,-0.02,0.5),(0.40,0.40,0.38), gas))                 # main gas
o.append(sphere(( 0.22,-0.10,0.62),(0.16,0.16,0.16), gas2))          # puff
o.append(sphere((-0.20,-0.12,0.42),(0.14,0.14,0.14), gas2))
o.append(sphere(( 0.05,-0.18,0.78),(0.12,0.12,0.12), gas2))
o += eye_pair(-0.34, 0.56, xoff=0.11, r=0.05)                         # eyes
o.append(sphere((0,-0.40,0.46),(0.09,0.05,0.06), gas2))              # gas mouth
build_and_export("mob-fart", o)

# ============ GLOOP (slime: teal blob, faces -Y) ============
clean()
slime  = mat("gloop_body", hx(0x6ab0a0), 0.3, alpha=0.92)
slime2 = mat("gloop_drip", hx(0x8fd0c0), 0.3, alpha=0.85)
o = []
o.append(sphere((0,0,0.34),(0.36,0.34,0.30), slime))                  # squashed body
o.append(sphere(( 0.16,-0.10,0.50),(0.12,0.12,0.14), slime2))        # drip
o.append(sphere((-0.18, 0.02,0.44),(0.10,0.10,0.10), slime2))
o += eye_pair(-0.28, 0.40, xoff=0.10, r=0.05)                         # eyes
build_and_export("mob-gloop", o)

# ============ GLOOPLET (small slime, brighter) ============
clean()
slime  = mat("glooplet_body", (0.55,0.85,0.72), 0.3, alpha=0.92)
slime2 = mat("glooplet_drip", (0.72,0.93,0.82), 0.3, alpha=0.85)
o = []
o.append(sphere((0,0,0.30),(0.30,0.28,0.26), slime))
o.append(sphere(( 0.14,-0.08,0.42),(0.10,0.10,0.11), slime2))
o += eye_pair(-0.24, 0.36, xoff=0.09, r=0.045)
build_and_export("mob-gloop_small", o)

print("ALL MOBS DONE")
