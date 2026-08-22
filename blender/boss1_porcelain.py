import bpy, math
R = math.radians

# ---------- clean scene ----------
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
mPorc = mat("porcelain", (0x8f/c, 0x8f/c, 0x9c/c), rough=0.32)      # body
mPorcD = mat("porcelain_d", (0x74/c, 0x74/c, 0x86/c), rough=0.4)    # limbs
mGold = mat("gold", (0xd8/c, 0xb0/c, 0x4a/c), rough=0.3, metal=0.7) # crown
mEye  = mat("eye", (0x12/c, 0x12/c, 0x16/c), rough=0.3)
mSeat = mat("seat", (0xf2/c, 0xf2/c, 0xf8/c), rough=0.18)           # toilet seat
mGlow = mat("glow", (0.6, 0.9, 1.0), emis=(0.4, 0.8, 1.0), estr=1.5)

# ---------- body parts (character faces -Y) ----------
# (name, center, scale, material, vertgroup)
parts = [
    ("pelvis", (0, 0, 1.02), (0.20, 0.12, 0.14), mPorc, "Hips"),
    ("torso",  (0, 0, 1.32), (0.24, 0.14, 0.28), mPorc, "Spine"),
    ("chest",  (0, 0, 1.52), (0.27, 0.13, 0.10), mPorc, "Spine1"),
    ("head",   (0, 0, 1.80), (0.16, 0.15, 0.16), mPorc, "Head"),
    ("crownBand", (0, 0, 1.98), (0.17, 0.15, 0.05), mGold, "Head"),
    ("crownS1", (0, 0, 2.05), (0.03, 0.03, 0.06), mGold, "Head"),
    ("crownS2", (0.09, -0.06, 2.05), (0.03, 0.03, 0.05), mGold, "Head"),
    ("crownS3", (0.09, 0.06, 2.05), (0.03, 0.03, 0.05), mGold, "Head"),
    ("crownS4", (-0.09, -0.06, 2.05), (0.03, 0.03, 0.05), mGold, "Head"),
    ("crownS5", (-0.09, 0.06, 2.05), (0.03, 0.03, 0.05), mGold, "Head"),
    ("eyeL",   (-0.06, -0.145, 1.82), (0.035, 0.02, 0.03), mEye, "Head"),
    ("eyeR",   (0.06, -0.145, 1.82), (0.035, 0.02, 0.03), mEye, "Head"),
    ("gem",    (0, -0.155, 1.70), (0.025, 0.015, 0.03), mGlow, "Spine1"),
    ("thighL", (0.13, 0, 0.62), (0.10, 0.10, 0.30), mPorcD, "Thigh.L"),
    ("calfL",  (0.13, 0, 0.24), (0.085, 0.085, 0.24), mPorcD, "Calf.L"),
    ("footL",  (0.13, -0.06, 0.06), (0.085, 0.17, 0.06), mPorcD, "Foot.L"),
    ("padL",   (0.33, 0, 1.54), (0.11, 0.11, 0.08), mPorc, "UpperArm.L"),
    ("uarmL",  (0.35, 0, 1.30), (0.07, 0.07, 0.22), mPorcD, "UpperArm.L"),
    ("larmL",  (0.37, 0, 1.03), (0.06, 0.06, 0.18), mPorcD, "LowerArm.L"),
    ("handL",  (0.38, 0, 0.84), (0.06, 0.07, 0.08), mPorcD, "Hand.L"),
]
srcmap = {"thigh": "thighL", "calf": "calfL", "foot": "footL",
          "uarm": "uarmL", "larm": "larmL", "hand": "handL", "pad": "padL"}
for n in ("thighR", "calfR", "footR", "uarmR", "larmR", "handR", "padR"):
    base = n[:-1]
    p = [q for q in parts if q[0] == srcmap[base]][0]
    parts.append((n, (-p[1][0], p[1][1], p[1][2]), p[2], p[3], p[4].replace(".L", ".R")))

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

# signature weapon: giant toilet seat in the RIGHT hand (ring, faces -Y)
bpy.ops.mesh.primitive_torus_add(major_radius=0.24, minor_radius=0.055,
                                 location=(0.42, -0.02, 0.78),
                                 major_segments=16, minor_segments=8)
seat = bpy.context.active_object
seat.name = "seat"
bpy.ops.object.transform_apply(rotation=True)
seat.rotation_euler = (0, R(90), 0)  # ring plane vertical, hole facing -Y/forward
bpy.ops.object.transform_apply(rotation=True)
g = seat.vertex_groups.new(name="Hand.R")
g.add(list(range(len(seat.data.vertices))), 1.0, 'REPLACE')
seat.data.materials.append(mSeat)
objs.append(seat)

bpy.ops.object.select_all(action='DESELECT')
for ob in objs:
    ob.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
king = bpy.context.active_object
king.name = "PorcelainKing"

# ---------- armature ----------
bones = [
    ("Hips",       (0, 0, 0.95), (0, 0, 1.18), None),
    ("Spine",      (0, 0, 1.18), (0, 0, 1.38), "Hips"),
    ("Spine1",     (0, 0, 1.38), (0, 0, 1.62), "Spine"),
    ("Head",       (0, 0, 1.62), (0, 0, 1.94), "Spine1"),
    ("Thigh.L",    (0.13, 0, 0.95), (0.13, 0, 0.42), "Hips"),
    ("Calf.L",     (0.13, 0, 0.42), (0.13, 0, 0.08), "Thigh.L"),
    ("Foot.L",     (0.13, 0, 0.08), (0.13, -0.24, 0.04), "Calf.L"),
    ("UpperArm.L", (0.28, 0, 1.50), (0.36, 0, 1.14), "Spine1"),
    ("LowerArm.L", (0.36, 0, 1.14), (0.39, 0, 0.86), "UpperArm.L"),
    ("Hand.L",     (0.39, 0, 0.86), (0.40, 0, 0.70), "LowerArm.L"),
]
r_bones = []
for (n, h, t, p) in bones:
    if n.endswith(".L"):
        r_bones.append((n.replace(".L", ".R"), (-h[0], h[1], h[2]), (-t[0], t[1], t[2]),
                        (p or "").replace(".L", ".R") or "Hips"))
bones = bones + r_bones

arm = bpy.data.armatures.new("KingArm")
armob = bpy.data.objects.new("KingArm", arm)
bpy.context.collection.objects.link(armob)
bpy.context.view_layer.objects.active = armob
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones
created = {}
for (n, h, t, p) in bones:
    b = eb.new(n); b.head = h; b.tail = t; created[n] = b
for (n, h, t, p) in bones:
    if p:
        created[n].parent = created[p]
bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.object.select_all(action='DESELECT')
king.select_set(True); armob.select_set(True)
bpy.context.view_layer.objects.active = armob
bpy.ops.object.parent_set(type='OBJECT')
mod = king.modifiers.new("Armature", 'ARMATURE')
mod.object = armob

# ---------- clips ----------
bpy.context.view_layer.objects.active = armob
bpy.ops.object.mode_set(mode='POSE')
for pb in armob.pose.bones:
    pb.rotation_mode = 'XYZ'

REST = {
    "Hips": (0, 0, 0), "Spine": (-3, 0, 0), "Spine1": (2, 0, 0), "Head": (0, 0, 0),
    "Thigh.L": (2, 0, 0), "Calf.L": (3, 0, 0), "Foot.L": (-3, 0, 0),
    "Thigh.R": (2, 0, 0), "Calf.R": (3, 0, 0), "Foot.R": (-3, 0, 0),
    # regal ready: right arm holds the seat up and forward
    "UpperArm.L": (-6, -8, 0), "LowerArm.L": (14, 0, 0), "Hand.L": (0, 0, 0),
    "UpperArm.R": (-38, 10, 0), "LowerArm.R": (28, 0, 0), "Hand.R": (0, 0, 0),
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

# IDLE (90f loop) - regal breathing, seat held up
make("Idle", True, [
    rf(1),
    (45, {"Spine1": (5, 0, 0), "Head": (-3, 0, 0),
          "UpperArm.R": (-42, 10, 0), "UpperArm.L": (-9, -8, 0)},
         {"Hips": (0, 0, -0.02)}),
    rf(90),
])

# WALK (40f loop) - heavy stomp march
def stomp(thL, thR, calL, calR, uL, uR, sp, hd):
    return {"Thigh.L": (thL, 0, 0), "Thigh.R": (thR, 0, 0),
            "Calf.L": (calL, 0, 0), "Calf.R": (calR, 0, 0),
            "UpperArm.L": (uL, -8, 0), "UpperArm.R": (uR, 10, 0),
            "Spine1": (sp, 0, 0), "Head": (hd, 0, 0)}
make("Walk", True, [
    (1,  stomp(-38, 34, 14, 6, 26, -38, 8, -3), {}),
    (11, stomp(0, 0, 4, 4, -6, 4, 10, -2), {}),
    (21, stomp(34, -38, 6, 14, -38, 26, 8, -3), {}),
    (31, stomp(0, 0, 4, 4, -6, 4, 10, -2), {}),
    (41, stomp(-38, 34, 14, 6, 26, -38, 8, -3), {}),
])

# SEATSWING (29f, one-shot) - telegraph 0.7s (hit f21), overhead chop
make("SeatSwing", False, [
    rf(1),
    (8,  {"UpperArm.R": (-80, 12, 0), "LowerArm.R": (45, 0, 0), "Spine1": (-8, 0, 0),
          "Spine": (-6, 0, 0), "Head": (6, 0, 0)}, {}),
    (16, {"UpperArm.R": (-140, 10, 0), "LowerArm.R": (55, 0, 0), "Spine1": (-12, 0, 0),
          "Spine": (-9, 0, 0), "Head": (10, 0, 0)}, {"Hips": (0, 0, -0.03)}),
    (21, {"UpperArm.R": (55, 12, 0), "LowerArm.R": (22, 0, 0), "Spine1": (18, 0, -4),
          "Spine": (10, 0, 0), "Head": (-6, 0, 0)}, {"Hips": (0, 0, -0.05)}),
    (25, {"UpperArm.R": (40, 12, 0), "LowerArm.R": (26, 0, 0), "Spine1": (10, 0, -2),
          "Spine": (5, 0, 0), "Head": (-2, 0, 0)}, {}),
    rf(29),
])

# SEATSLAM (38f, one-shot) - telegraph 1.0s (hit f30), two-handed ground slam
make("SeatSlam", False, [
    rf(1),
    (10, {"UpperArm.R": (-70, 12, 0), "LowerArm.R": (40, 0, 0),
          "UpperArm.L": (-65, -10, 0), "LowerArm.L": (40, 0, 0),
          "Spine1": (-8, 0, 0), "Spine": (-6, 0, 0), "Head": (8, 0, 0)}, {}),
    (22, {"UpperArm.R": (-150, 8, 0), "LowerArm.R": (50, 0, 0),
          "UpperArm.L": (-145, -8, 0), "LowerArm.L": (50, 0, 0),
          "Spine1": (-14, 0, 0), "Spine": (-10, 0, 0), "Head": (12, 0, 0)},
         {"Hips": (0, 0, -0.02)}),
    (30, {"UpperArm.R": (60, 14, 0), "LowerArm.R": (15, 0, 0),
          "UpperArm.L": (55, -12, 0), "LowerArm.L": (15, 0, 0),
          "Spine1": (20, 0, 0), "Spine": (14, 0, 0), "Head": (-8, 0, 0),
          "Thigh.L": (-18, 0, 0), "Thigh.R": (-18, 0, 0),
          "Calf.L": (30, 0, 0), "Calf.R": (30, 0, 0)}, {"Hips": (0, 0, -0.10)}),
    (34, {"UpperArm.R": (50, 14, 0), "LowerArm.R": (20, 0, 0),
          "UpperArm.L": (45, -12, 0), "LowerArm.L": (20, 0, 0),
          "Spine1": (14, 0, 0), "Spine": (10, 0, 0), "Head": (-4, 0, 0),
          "Thigh.L": (-12, 0, 0), "Thigh.R": (-12, 0, 0),
          "Calf.L": (22, 0, 0), "Calf.R": (22, 0, 0)}, {"Hips": (0, 0, -0.07)}),
    rf(38),
])

# SPIN (32f, one-shot) - telegraph 0.8s (hit f24), 360 spin w/ seat out
make("Spin", False, [
    rf(1),
    (4,  {"Hips": (0, 0, 20), "UpperArm.R": (-30, 18, 0), "LowerArm.R": (20, 0, 0)},
         {"Hips": (0, 0, -0.02)}),
    (14, {"Hips": (0, 0, 180), "UpperArm.R": (-10, 25, 0), "LowerArm.R": (15, 0, 0),
          "Thigh.L": (-12, 0, 0), "Thigh.R": (12, 0, 0)}, {"Hips": (0, 0, -0.03)}),
    (24, {"Hips": (0, 0, 340), "UpperArm.R": (-30, 18, 0), "LowerArm.R": (20, 0, 0),
          "Thigh.L": (12, 0, 0), "Thigh.R": (-12, 0, 0)}, {"Hips": (0, 0, -0.03)}),
    (28, {"Hips": (0, 0, 360), "UpperArm.R": (-38, 10, 0), "LowerArm.R": (28, 0, 0)},
         {"Hips": (0, 0, -0.01)}),
    rf(32),
])

bpy.context.scene.frame_set(1)
bpy.ops.object.mode_set(mode='OBJECT')
print("BOSS1 OK actions:", sorted([a.name for a in bpy.data.actions]))
print("verts:", len(king.data.vertices), "bones:", len(arm.bones),
      "mats:", [m.name for m in king.data.materials])
