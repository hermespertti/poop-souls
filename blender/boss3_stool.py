import bpy, math
R = math.radians

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.actions,
             bpy.data.armatures, bpy.data.cameras, bpy.data.lights):
    for d in list(coll):
        coll.remove(d)

def mat(name, color, rough=0.6, metal=0.0, emis=None, estr=2.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emis:
        b.inputs["Emission Color"].default_value = (*emis, 1)
        b.inputs["Emission Strength"].default_value = estr
    return m

c = 255.0
mMud   = mat("mud", (0x5a/c, 0x46/c, 0x32/c), rough=0.9)
mMudD  = mat("mud_d", (0x45/c, 0x34/c, 0x26/c), rough=0.95)
mMudL  = mat("mud_l", (0x6e/c, 0x56/c, 0x3e/c), rough=0.85)
mEye   = mat("eye", (0xff/c, 0x6a/c, 0x9a/c), emis=(1.0, 0.4, 0.6), estr=3.0)
mCore  = mat("core", (0xff/c, 0x9a/c, 0x3a/c), emis=(1.0, 0.6, 0.2), estr=4.0)

# (name, center, scale, material, vertgroup) — faces -Y
parts = [
    ("blob1", (0, 0, 0.62), (0.62, 0.52, 0.40), mMud, "Blob1"),
    ("blob2", (0, 0, 1.42), (0.48, 0.42, 0.36), mMudL, "Blob2"),
    ("headb", (0, 0, 2.05), (0.36, 0.34, 0.34), mMud, "Blob3"),
    ("horn1", (-0.20, 0.10, 2.32), (0.06, 0.06, 0.16), mMudD, "Blob3"),
    ("horn2", (0.20, 0.10, 2.32), (0.06, 0.06, 0.16), mMudD, "Blob3"),
    ("horn3", (0, -0.20, 2.38), (0.06, 0.06, 0.18), mMudD, "Blob3"),
    ("eyeL", (-0.13, -0.28, 2.12), (0.06, 0.05, 0.07), mEye, "Blob3"),
    ("eyeR", (0.13, -0.28, 2.12), (0.06, 0.05, 0.07), mEye, "Blob3"),
    ("maw", (0, -0.30, 1.92), (0.14, 0.05, 0.05), mMudD, "Blob3"),
    ("core", (0, -0.34, 1.42), (0.09, 0.06, 0.10), mCore, "Blob2"),
    ("armL", (0.58, 0, 1.30), (0.20, 0.20, 0.26), mMudD, "Arm.L"),
    ("handL", (0.82, -0.10, 1.02), (0.18, 0.22, 0.24), mMudD, "Hand.L"),
    ("lump1", (0.40, 0.30, 0.80), (0.16, 0.16, 0.16), mMudD, "Blob1"),
    ("lump2", (-0.36, -0.30, 1.05), (0.12, 0.12, 0.12), mMudL, "Blob1"),
]
for n, (px, py, pz), s, m, vg in list(parts):
    if n in ("armL", "handL"):
        parts.append((n[:-1] + "R", (-px, py, pz), s, m, vg.replace(".L", ".R")))

objs = []
for (name, center, scale, m, vg) in parts:
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    g = ob.vertex_groups.new(name=vg)
    g.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    ob.data.materials.append(m)
    objs.append(ob)

bpy.ops.object.select_all(action='DESELECT')
for ob in objs: ob.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
stool = bpy.context.active_object
stool.name = "GreatStool"

# ---- armature ----
bones = [
    ("Hips",   (0, 0, 0.20), (0, 0, 0.60), None),
    ("Blob1",  (0, 0, 0.60), (0, 0, 1.10), "Hips"),
    ("Blob2",  (0, 0, 1.10), (0, 0, 1.70), "Blob1"),
    ("Blob3",  (0, 0, 1.70), (0, 0, 2.20), "Blob2"),
    ("Arm.L",  (0.45, 0, 1.35), (0.80, -0.10, 1.05), "Blob2"),
    ("Hand.L", (0.80, -0.10, 1.05), (0.95, -0.18, 0.85), "Arm.L"),
]
r_bones = []
for (n, h, t, p) in bones:
    if n.endswith(".L"):
        r_bones.append((n.replace(".L", ".R"), (-h[0], h[1], h[2]), (-t[0], t[1], t[2]),
                        (p or "").replace(".L", ".R") or "Hips"))
bones = bones + r_bones

arm = bpy.data.armatures.new("StoolArm")
armob = bpy.data.objects.new("StoolArm", arm)
bpy.context.collection.objects.link(armob)
bpy.context.view_layer.objects.active = armob
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones
created = {}
for (n, h, t, p) in bones:
    b = eb.new(n); b.head = h; b.tail = t; created[n] = b
for (n, h, t, p) in bones:
    if p: created[n].parent = created[p]
bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.object.select_all(action='DESELECT')
stool.select_set(True); armob.select_set(True)
bpy.context.view_layer.objects.active = armob
bpy.ops.object.parent_set(type='OBJECT')
mod = stool.modifiers.new("Armature", 'ARMATURE')
mod.object = armob

# ---- clips ----
bpy.context.view_layer.objects.active = armob
bpy.ops.object.mode_set(mode='POSE')
for pb in armob.pose.bones:
    pb.rotation_mode = 'XYZ'

REST = {
    "Hips": (0, 0, 0), "Blob1": (0, 0, 0), "Blob2": (2, 0, 0), "Blob3": (-3, 0, 0),
    "Arm.L": (-12, 0, 10), "Arm.R": (-12, 0, -10),
    "Hand.L": (0, 0, 0), "Hand.R": (0, 0, 0),
}

def K(b, f, x, y, z, loc=None):
    pb = armob.pose.bones[b]
    pb.rotation_euler = (R(x), R(y), R(z))
    if loc is not None:
        pb.location = loc
        pb.keyframe_insert('location', frame=f)
    pb.keyframe_insert('rotation_euler', frame=f)

def all_fcurves(act):
    fc = []
    try:
        return list(act.fcurves)
    except AttributeError:
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    fc.extend(list(cb.fcurves))
        return fc

def make(name, loop, keys):
    act = bpy.data.actions.new(name)
    armob.animation_data_create()
    armob.animation_data.action = act
    for (f, pose, locs) in keys:
        for b in REST:
            x, y, z = pose.get(b, REST[b])
            loc = locs.get(b, (0, 0, 0))
            K(b, f, x, y, z, loc=loc)
    for fc in all_fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.easing = 'EASE_IN_OUT'
    act.use_cyclic = loop
    return act

def rf(f, **over):
    return (f, over, {})

# IDLE (72f loop) - slow primordial breathing, blobs sway
make("Idle", True, [
    rf(1),
    (24, {"Blob1": (3, 0, 0), "Blob2": (-2, 0, 2), "Blob3": (2, 0, -2),
          "Arm.L": (-8, 0, 10), "Arm.R": (-8, 0, -10)}, {"Hips": (0, 0, 0.03)}),
    (48, {"Blob1": (-3, 0, 0), "Blob2": (2, 0, -2), "Blob3": (-2, 0, 2),
          "Arm.L": (-16, 0, 12), "Arm.R": (-16, 0, -12)}, {"Hips": (0, 0, -0.02)}),
    rf(72),
])

# WALK (48f loop) - massive shuffling lurch
make("Walk", True, [
    (1,  {"Hips": (0, 0, 30), "Blob1": (4, 0, 0), "Blob2": (-6, 0, -4),
          "Blob3": (4, 0, 6), "Arm.L": (-6, 0, 14), "Arm.R": (-20, 0, -14)},
         {"Hips": (0, 0, -0.05)}),
    (13, {"Hips": (0, 0, 60), "Blob1": (-2, 0, 0), "Blob2": (2, 0, 2),
          "Blob3": (-2, 0, -2)}, {"Hips": (0, 0, 0.02)}),
    (25, {"Hips": (0, 0, 90), "Blob1": (-4, 0, 0), "Blob2": (6, 0, 4),
          "Blob3": (-4, 0, -6), "Arm.L": (-20, 0, 14), "Arm.R": (-6, 0, -14)},
         {"Hips": (0, 0, -0.05)}),
    (37, {"Hips": (0, 0, 120), "Blob1": (2, 0, 0), "Blob2": (-2, 0, -2),
          "Blob3": (2, 0, 2)}, {"Hips": (0, 0, 0.02)}),
    (49, {"Hips": (0, 0, 30), "Blob1": (4, 0, 0), "Blob2": (-6, 0, -4),
          "Blob3": (4, 0, 6), "Arm.L": (-6, 0, 14), "Arm.R": (-20, 0, -14)},
         {"Hips": (0, 0, -0.05)}),
])

# SLEAP (21f, one-shot) - telegraph 0.7s (hit f15): right blob-arm smear slap
make("SmearSlap", False, [
    rf(1),
    (7,  {"Arm.R": (-60, 0, -25), "Hand.R": (15, 0, 0), "Blob2": (-8, 0, -6),
          "Blob3": (6, 0, 4)}, {"Hips": (0, 0, -0.03)}),
    (15, {"Arm.R": (35, 0, 20), "Hand.R": (-20, 0, 0), "Blob2": (14, 0, 8),
          "Blob3": (-8, 0, -6), "Hips": (0, 0, -10)}, {"Hips": (0.10, 0, -0.08)}),
    (21, {"Arm.R": (15, 0, 12), "Hand.R": (-10, 0, 0), "Blob2": (6, 0, 4),
          "Blob3": (-3, 0, -2), "Hips": (0, 0, -4)}, {"Hips": (0.04, 0, -0.04)}),
])

# METEOR (42f, one-shot) - telegraph 1.4s (hit f34): raise both blobs high, then crash
make("MeteorDrop", False, [
    rf(1),
    (14, {"Arm.L": (-80, 0, 20), "Arm.R": (-80, 0, -20),
          "Hand.L": (30, 0, 0), "Hand.R": (30, 0, 0),
          "Blob2": (-10, 0, 0), "Blob3": (-8, 0, 0)}, {"Hips": (0, 0, 0.02)}),
    (30, {"Arm.L": (-110, 0, 25), "Arm.R": (-110, 0, -25),
          "Hand.L": (45, 0, 0), "Hand.R": (45, 0, 0),
          "Blob2": (-14, 0, 0), "Blob3": (-12, 0, 0)}, {"Hips": (0, 0, 0.05)}),
    (34, {"Arm.L": (60, 0, 10), "Arm.R": (60, 0, -10),
          "Hand.L": (-15, 0, 0), "Hand.R": (-15, 0, 0),
          "Blob2": (24, 0, 0), "Blob3": (20, 0, 0),
          "Hips": (-8, 0, 0)}, {"Hips": (0, 0, -0.12)}),
    (42, {"Arm.L": (40, 0, 12), "Arm.R": (40, 0, -12),
          "Blob2": (16, 0, 0), "Blob3": (12, 0, 0), "Hips": (-4, 0, 0)},
         {"Hips": (0, 0, -0.06)}),
])

# PULSE (27f, one-shot) - telegraph 0.9s (hit f21): core charges, body expands outward
make("CorePulse", False, [
    rf(1),
    (12, {"Blob2": (4, 0, 0), "Blob3": (2, 0, 0),
          "Arm.L": (10, 0, 18), "Arm.R": (10, 0, -18),
          "Hand.L": (20, 0, 0), "Hand.R": (20, 0, 0)}, {"Hips": (0, 0, 0.04)}),
    (20, {"Blob2": (8, 0, 0), "Blob3": (4, 0, 0),
          "Arm.L": (20, 0, 26), "Arm.R": (20, 0, -26),
          "Hand.L": (30, 0, 0), "Hand.R": (30, 0, 0)}, {"Hips": (0, 0, 0.06)}),
    (21, {"Blob2": (-18, 0, 0), "Blob3": (-10, 0, 0),
          "Arm.L": (-60, 0, 8), "Arm.R": (-60, 0, -8),
          "Hand.L": (-20, 0, 0), "Hand.R": (-20, 0, 0),
          "Hips": (-6, 0, 0)}, {"Hips": (0, 0, -0.10)}),
    (27, {"Blob2": (-8, 0, 0), "Blob3": (-4, 0, 0),
          "Arm.L": (-30, 0, 12), "Arm.R": (-30, 0, -12)}, {"Hips": (0, 0, -0.04)}),
])

# WALL (45f, one-shot) - telegraph 1.5s (hit f37): inhale filth, belch a wall forward
make("WallOfFilth", False, [
    rf(1),
    (16, {"Blob2": (6, 0, 0), "Blob3": (8, 0, 0),
          "Arm.L": (16, 0, 20), "Arm.R": (16, 0, -20)}, {"Hips": (0, 0, 0.04)}),
    (30, {"Blob2": (12, 0, 0), "Blob3": (14, 0, 0),
          "Arm.L": (26, 0, 28), "Arm.R": (26, 0, -28),
          "Hand.L": (25, 0, 0), "Hand.R": (25, 0, 0)}, {"Hips": (0, 0, 0.06)}),
    (37, {"Blob2": (-30, 0, 0), "Blob3": (-22, 0, 0),
          "Arm.L": (-70, 0, 6), "Arm.R": (-70, 0, -6),
          "Hand.L": (-25, 0, 0), "Hand.R": (-25, 0, 0),
          "Hips": (-10, 0, 0)}, {"Hips": (0.12, 0, -0.08)}),
    (45, {"Blob2": (-16, 0, 0), "Blob3": (-8, 0, 0),
          "Arm.L": (-35, 0, 10), "Arm.R": (-35, 0, -10)}, {"Hips": (0.05, 0, -0.03)}),
])

# ROAR (48f, one-shot) - telegraph 1.6s (hit f40): head rears back, primordial roar
make("PrimordialRoar", False, [
    rf(1),
    (14, {"Blob3": (20, 0, 0), "Blob2": (8, 0, 0),
          "Arm.L": (14, 0, 22), "Arm.R": (14, 0, -22)}, {"Hips": (0, 0, 0.03)}),
    (30, {"Blob3": (38, 0, 0), "Blob2": (14, 0, 0), "Blob1": (6, 0, 0),
          "Arm.L": (30, 0, 30), "Arm.R": (30, 0, -30),
          "Hand.L": (30, 0, 0), "Hand.R": (30, 0, 0)}, {"Hips": (0, 0, 0.06)}),
    (40, {"Blob3": (-24, 0, 0), "Blob2": (-14, 0, 0), "Blob1": (-8, 0, 0),
          "Arm.L": (-55, 0, 8), "Arm.R": (-55, 0, -8),
          "Hand.L": (-20, 0, 0), "Hand.R": (-20, 0, 0),
          "Hips": (-8, 0, 0)}, {"Hips": (0, 0, -0.10)}),
    (48, {"Blob3": (-10, 0, 0), "Blob2": (-6, 0, 0),
          "Arm.L": (-25, 0, 14), "Arm.R": (-25, 0, -14)}, {"Hips": (0, 0, -0.04)}),
])

bpy.context.scene.frame_set(1)
bpy.ops.object.mode_set(mode='OBJECT')
print("BOSS3 OK actions:", sorted([a.name for a in bpy.data.actions]))
print("verts:", len(stool.data.vertices), "bones:", len(arm.bones))
