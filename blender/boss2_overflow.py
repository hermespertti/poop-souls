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
mBelly = mat("belly", (0x6a/c, 0x8a/c, 0x3a/c), rough=0.85)
mDark  = mat("limbs", (0x4a/c, 0x62/c, 0x28/c), rough=0.9)
mEye   = mat("eye", (0xff/c, 0xe0/c, 0x44/c), emis=(1.0, 0.85, 0.2), estr=3.0)
mDrip  = mat("drip", (0x55/c, 0x70/c, 0x2f/c), rough=0.4)

# (name, center, scale, material, vertgroup)  — faces -Y
parts = [
    ("belly1", (0, 0, 1.15), (0.45, 0.35, 0.30), mBelly, "Spine"),
    ("belly2", (0, 0, 1.40), (0.40, 0.32, 0.26), mBelly, "Spine1"),
    ("lump1",  (0.25, 0.18, 1.20), (0.13, 0.13, 0.13), mBelly, "Spine"),
    ("lump2",  (-0.26, 0.14, 1.35), (0.10, 0.10, 0.10), mBelly, "Spine1"),
    ("lump3",  (0.10, -0.28, 1.30), (0.11, 0.10, 0.11), mBelly, "Spine"),
    ("head",   (0, 0, 1.90), (0.18, 0.16, 0.16), mBelly, "Head"),
    ("snout",  (0, -0.16, 1.84), (0.10, 0.08, 0.06), mDark, "Head"),
    ("eyeL",   (-0.08, -0.13, 1.94), (0.04, 0.03, 0.04), mEye, "Head"),
    ("eyeR",   (0.08, -0.13, 1.94), (0.04, 0.03, 0.04), mEye, "Head"),
    ("drip1",  (0.32, 0.10, 0.95), (0.06, 0.15, 0.06), mDrip, "Spine"),
    ("drip2",  (-0.30, -0.05, 1.00), (0.05, 0.10, 0.05), mDrip, "Spine"),
    ("legL",   (0.35, 0, 0.42), (0.17, 0.17, 0.42), mDark, "Leg.L"),
    ("footL",  (0.35, -0.06, 0.06), (0.18, 0.25, 0.09), mDark, "Leg.L"),
    ("armL",   (0.60, 0, 1.40), (0.13, 0.13, 0.30), mDark, "Arm.L"),
    ("handL",  (0.72, -0.12, 1.05), (0.11, 0.11, 0.15), mDark, "Hand.L"),
]
for n, (px, py, pz), s, m, vg in list(parts):
    if n in ("legL", "footL", "armL", "handL"):
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
lord = bpy.context.active_object
lord.name = "OverflowLord"

# ---- armature ----
bones = [
    ("Hips",   (0, 0, 0.80), (0, 0, 1.05), None),
    ("Spine",  (0, 0, 1.05), (0, 0, 1.45), "Hips"),
    ("Spine1", (0, 0, 1.45), (0, 0, 1.75), "Spine"),
    ("Head",   (0, 0, 1.75), (0, 0, 2.05), "Spine1"),
    ("Leg.L",  (0.35, 0, 0.80), (0.35, 0, 0.05), "Hips"),
    ("Arm.L",  (0.52, 0, 1.50), (0.72, -0.12, 1.10), "Spine1"),
    ("Hand.L", (0.72, -0.12, 1.10), (0.80, -0.18, 0.92), "Arm.L"),
]
r_bones = []
for (n, h, t, p) in bones:
    if n.endswith(".L"):
        r_bones.append((n.replace(".L", ".R"), (-h[0], h[1], h[2]), (-t[0], t[1], t[2]),
                        (p or "").replace(".L", ".R") or "Hips"))
bones = bones + r_bones

arm = bpy.data.armatures.new("LordArm")
armob = bpy.data.objects.new("LordArm", arm)
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
lord.select_set(True); armob.select_set(True)
bpy.context.view_layer.objects.active = armob
bpy.ops.object.parent_set(type='OBJECT')
mod = lord.modifiers.new("Armature", 'ARMATURE')
mod.object = armob

# ---- clips ----
bpy.context.view_layer.objects.active = armob
bpy.ops.object.mode_set(mode='POSE')
for pb in armob.pose.bones:
    pb.rotation_mode = 'XYZ'

REST = {
    "Hips": (0, 0, 0), "Spine": (-2, 0, 0), "Spine1": (3, 0, 0), "Head": (4, 0, 0),
    "Leg.L": (0, 0, 0), "Leg.R": (0, 0, 0),
    "Arm.L": (-18, 0, 8), "Arm.R": (-18, 0, -8),
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

# IDLE (60f loop) - bloat breathing, slow head sway
make("Idle", True, [
    rf(1),
    (30, {"Spine": (2, 0, 0), "Spine1": (0, 0, 0), "Head": (7, 0, 0),
          "Arm.L": (-14, 0, 8), "Arm.R": (-14, 0, -8)},
         {"Hips": (0, 0, 0.02)}),
    (45, {"Spine": (4, 0, 0), "Spine1": (-1, 0, 0), "Head": (3, 0, 6)}, {}),
    rf(60),
])

# WALK (40f loop) - heavy waddle lurch
make("Walk", True, [
    (1,  {"Leg.L": (-28, 0, 0), "Leg.R": (28, 0, 0), "Spine": (-6, 0, 4),
          "Head": (8, 0, -4), "Arm.L": (-8, 0, 14), "Arm.R": (-24, 0, -14)},
         {"Hips": (0, 0, -0.04)}),
    (11, {"Leg.L": (0, 0, 0), "Leg.R": (0, 0, 0), "Spine": (-2, 0, 0),
          "Head": (4, 0, 0), "Arm.L": (-18, 0, 8), "Arm.R": (-18, 0, -8)},
         {"Hips": (0, 0, 0.02)}),
    (21, {"Leg.L": (28, 0, 0), "Leg.R": (-28, 0, 0), "Spine": (-6, 0, -4),
          "Head": (8, 0, 4), "Arm.L": (-24, 0, 14), "Arm.R": (-8, 0, -14)},
         {"Hips": (0, 0, -0.04)}),
    (31, {"Leg.L": (0, 0, 0), "Leg.R": (0, 0, 0), "Spine": (-2, 0, 0),
          "Head": (4, 0, 0), "Arm.L": (-18, 0, 8), "Arm.R": (-18, 0, -8)},
         {"Hips": (0, 0, 0.02)}),
    (41, {"Leg.L": (-28, 0, 0), "Leg.R": (28, 0, 0), "Spine": (-6, 0, 4),
          "Head": (8, 0, -4), "Arm.L": (-8, 0, 14), "Arm.R": (-24, 0, -14)},
         {"Hips": (0, 0, -0.04)}),
])

# LURCH (18f, one-shot) - telegraph 0.6s: sudden lunge forward with both arms
make("Lurch", False, [
    rf(1),
    (7,  {"Spine": (6, 0, 0), "Spine1": (4, 0, 0), "Head": (-4, 0, 0),
          "Leg.L": (-8, 0, 0), "Leg.R": (-8, 0, 0),
          "Arm.L": (10, 0, 6), "Arm.R": (10, 0, -6)}, {"Hips": (0, 0, -0.05)}),
    (14, {"Spine": (-30, 0, 0), "Spine1": (-14, 0, 0), "Head": (-10, 0, 0),
          "Leg.L": (14, 0, 0), "Leg.R": (14, 0, 0),
          "Arm.L": (-70, 0, 4), "Arm.R": (-70, 0, -4)}, {"Hips": (0.12, 0, -0.06)}),
    (18, {"Spine": (-18, 0, 0), "Spine1": (-6, 0, 0), "Head": (-4, 0, 0),
          "Arm.L": (-45, 0, 8), "Arm.R": (-45, 0, -8)}, {"Hips": (0.05, 0, -0.03)}),
])

# BODYSLAM (33f, one-shot) - telegraph 1.1s: swell then slam belly down
make("BodySlam", False, [
    rf(1),
    (10, {"Spine": (8, 0, 0), "Spine1": (6, 0, 0), "Head": (10, 0, 0),
          "Arm.L": (-30, 0, 18), "Arm.R": (-30, 0, -18)}, {"Hips": (0, 0, 0.04)}),
    (17, {"Spine": (14, 0, 0), "Spine1": (10, 0, 0), "Head": (14, 0, 0),
          "Arm.L": (-45, 0, 24), "Arm.R": (-45, 0, -24)}, {"Hips": (0, 0, 0.06)}),
    (27, {"Spine": (-34, 0, 0), "Spine1": (-20, 0, 0), "Head": (-18, 0, 0),
          "Leg.L": (-16, 0, 0), "Leg.R": (-16, 0, 0),
          "Arm.L": (-80, 0, 6), "Arm.R": (-80, 0, -6)}, {"Hips": (0, 0, -0.14)}),
    (33, {"Spine": (-20, 0, 0), "Spine1": (-8, 0, 0), "Head": (-8, 0, 0),
          "Arm.L": (-50, 0, 10), "Arm.R": (-50, 0, -10)}, {"Hips": (0, 0, -0.06)}),
])

# GAS (39f, one-shot) - telegraph 1.3s: inhale swell, puff from mouth
make("Gas", False, [
    rf(1),
    (14, {"Spine": (10, 0, 0), "Spine1": (8, 0, 0), "Head": (18, 0, 0),
          "Leg.L": (-10, 0, 0), "Leg.R": (-10, 0, 0),
          "Arm.L": (20, 0, 20), "Arm.R": (20, 0, -20)}, {"Hips": (0, 0, 0.05)}),
    (24, {"Spine": (16, 0, 0), "Spine1": (14, 0, 0), "Head": (26, 0, 0),
          "Arm.L": (30, 0, 26), "Arm.R": (30, 0, -26)}, {"Hips": (0, 0, 0.07)}),
    (34, {"Spine": (-16, 0, 0), "Spine1": (-8, 0, 0), "Head": (-24, 0, 0),
          "Arm.L": (-30, 0, 12), "Arm.R": (-30, 0, -12)}, {"Hips": (0, 0, -0.02)}),
    rf(39),
])

# BLOAT (27f, one-shot) - telegraph 0.9s: bloat up & rear, then lunge into charge
make("Bloat", False, [
    rf(1),
    (10, {"Spine": (12, 0, 0), "Spine1": (10, 0, 0), "Head": (20, 0, 0),
          "Leg.L": (-6, 0, 0), "Leg.R": (-6, 0, 0),
          "Arm.L": (30, 0, 24), "Arm.R": (30, 0, -24)}, {"Hips": (0, 0, 0.06)}),
    (18, {"Spine": (20, 0, 0), "Spine1": (16, 0, 0), "Head": (28, 0, 0),
          "Arm.L": (40, 0, 28), "Arm.R": (40, 0, -28)}, {"Hips": (0, 0, 0.08)}),
    (24, {"Spine": (-26, 0, 0), "Spine1": (-14, 0, 0), "Head": (-12, 0, 0),
          "Leg.L": (18, 0, 0), "Leg.R": (18, 0, 0),
          "Arm.L": (-60, 0, 8), "Arm.R": (-60, 0, -8)}, {"Hips": (0.10, 0, -0.08)}),
    rf(27),
])

bpy.context.scene.frame_set(1)
bpy.ops.object.mode_set(mode='OBJECT')
print("BOSS2 OK actions:", sorted([a.name for a in bpy.data.actions]))
print("verts:", len(lord.data.vertices), "bones:", len(arm.bones))
