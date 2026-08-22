import bpy

# ---- clean scene ----
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.actions, bpy.data.armatures, bpy.data.cameras, bpy.data.lights):
    for d in list(coll):
        coll.remove(d)

def mat(name, color, rough=0.6, metal=0.0, emis=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emis:
        b.inputs["Emission Color"].default_value = (*emis, 1)
        b.inputs["Emission Strength"].default_value = 2.0
    return m

c = 255.0
mBody  = mat("body",  (0x4a/c, 0x6a/c, 0x8a/c))
mLeg   = mat("legs",  (0x37/c, 0x51/c, 0x6b/c))
mArm   = mat("arms",  (0x5a/c, 0x7a/c, 0x9a/c))
mHead  = mat("head",  (0xd8/c, 0xb8/c, 0x9a/c))
mDark  = mat("dark",  (0x2a/c, 0x3a/c, 0x4a/c), rough=0.4)
mVisor = mat("visor", (0.1, 0.9, 0.6), emis=(0.2, 1.0, 0.5))

# parts: (name, center, scale, material, vertgroup)  — character faces -Y
# Joint z-positions (from the armature): ankle .10, knee .50, hip .92, waist 1.10,
# neck 1.48, shoulder 1.34, elbow 1.04, wrist .78.
#
# PASS 2 (joint-flesh): pass-1 overlap (.04-.10u) still opened up at 45-68 deg
# relative bends (walk keyframes flex thigh/calf to -50/+45, arms to +-35/+22).
# Every segment now interpenetrates its neighbors by .10-.19u so even fully
# flexed joints stay covered. Overlaps:
#   hip .92  -> pelvis[.86,1.16] x thigh[.43,1.03]  = .17
#   knee .50 -> thigh[.43,1.03] x calf[.05,.61]     = .18
#   ankle.10 -> calf[.05,.61]  x foot[.00,.18]      = .13
#   neck 1.48-> torso[1.055,1.605] x head[1.45,1.81] = .155
#   shld 1.34-> pad[1.32,1.44] on joint, uarm to 1.43
#   elbow1.04-> uarm[.91,1.43] x larm[.66,1.10]     = .19
#   wrist.78 -> larm[.66,1.10] x hand[.58,.76]      = .10
#
# PASS 3 (joint caps): axial overlap alone can't seal the INNER corner of a
# bend (Attack1 flexes the elbow ~120-180 deg -> visible notch). Add rigid
# "cop" cubes centered ON the joint, weighted to the distal bone: elbow .14,
# knee .12, wrist .10. Hidden inside the overlap at rest, they fill the inner
# corner when the joint flexes. Matches the existing shoulder-pad look.
parts = [
    ("pelvis", (0, 0, 1.01), (0.19, 0.13, 0.30), mBody, "Hips"),
    ("torso",  (0, 0, 1.33), (0.19, 0.13, 0.55), mBody, "Spine1"),
    ("head",   (0, 0, 1.63), (0.16, 0.17, 0.36), mHead, "Head"),
    ("visor",  (0, -0.10, 1.65), (0.13, 0.05, 0.04), mVisor, "Head"),
    ("thighL", (0.10, 0, 0.73), (0.11, 0.11, 0.60), mLeg, "Thigh.L"),
    ("calfL",  (0.10, 0, 0.33), (0.09, 0.09, 0.56), mLeg, "Calf.L"),
    ("kneeL",  (0.10, 0, 0.50), (0.12, 0.12, 0.12), mDark, "Calf.L"),
    ("footL",  (0.10, -0.06, 0.09), (0.10, 0.20, 0.18), mDark, "Foot.L"),
    ("uarmL",  (0.30, 0, 1.17), (0.08, 0.08, 0.52), mArm, "UpperArm.L"),
    ("larmL",  (0.32, 0, 0.88), (0.07, 0.07, 0.44), mArm, "LowerArm.L"),
    ("elbowL", (0.32, 0, 1.04), (0.09, 0.09, 0.09), mDark, "LowerArm.L"),
    ("handL",  (0.32, 0, 0.67), (0.06, 0.07, 0.18), mArm, "Hand.L"),
    ("wristL", (0.32, 0, 0.78), (0.07, 0.07, 0.07), mDark, "LowerArm.L"),
    ("padL",   (0.30, 0, 1.38), (0.12, 0.12, 0.12), mDark, "UpperArm.L"),
]
srcmap = {"thigh": "thighL", "calf": "calfL", "foot": "footL",
          "uarm": "uarmL", "larm": "larmL", "hand": "handL", "pad": "padL",
          "knee": "kneeL", "elbow": "elbowL", "wrist": "wristL"}
for n in ("thighR", "calfR", "footR", "uarmR", "larmR", "handR", "padR",
          "kneeR", "elbowR", "wristR"):
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

bpy.ops.object.select_all(action='DESELECT')
for ob in objs: ob.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
knight = bpy.context.active_object
knight.name = "Knight"

# ---- armature ----
bones = [
    ("Hips",        (0, 0, 0.92), (0, 0, 1.10), None),
    ("Spine",       (0, 0, 1.10), (0, 0, 1.28), "Hips"),
    ("Spine1",      (0, 0, 1.28), (0, 0, 1.48), "Spine"),
    ("Head",        (0, 0, 1.48), (0, 0, 1.74), "Spine1"),
    ("Thigh.L",     (0.10, 0, 0.92), (0.10, 0, 0.50), "Hips"),
    ("Calf.L",      (0.10, 0, 0.50), (0.10, 0, 0.10), "Thigh.L"),
    ("Foot.L",      (0.10, 0, 0.10), (0.10, -0.26, 0.02), "Calf.L"),
    ("Shoulder.L",  (0.06, 0, 1.40), (0.26, 0, 1.40), "Spine1"),
    ("UpperArm.L",  (0.28, 0, 1.34), (0.32, 0, 1.04), "Shoulder.L"),
    ("LowerArm.L",  (0.32, 0, 1.04), (0.33, 0, 0.78), "UpperArm.L"),
    ("Hand.L",      (0.33, 0, 0.78), (0.33, 0, 0.62), "LowerArm.L"),
]
# build .R mirror explicitly
r_bones = []
for (n, h, t, p) in bones:
    if n.endswith(".L"):
        r_bones.append((n.replace(".L", ".R"), (-h[0], h[1], h[2]), (-t[0], t[1], t[2]),
                        (p or "").replace(".L", ".R") or "Hips"))
bones = bones + r_bones

arm = bpy.data.armatures.new("KnightArm")
armob = bpy.data.objects.new("KnightArm", arm)
bpy.context.collection.objects.link(armob)
bpy.context.view_layer.objects.active = armob
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones
created = {}
for (n, h, t, p) in bones:
    b = eb.new(n)
    b.head = h
    b.tail = t
    created[n] = b
for (n, h, t, p) in bones:
    if p:
        created[n].parent = created[p]
bpy.ops.object.mode_set(mode='OBJECT')

# ---- bind ----
bpy.ops.object.select_all(action='DESELECT')
knight.select_set(True)
armob.select_set(True)
bpy.context.view_layer.objects.active = armob
bpy.ops.object.parent_set(type='OBJECT')
mod = knight.modifiers.new("Armature", 'ARMATURE')
mod.object = armob

print("STAGE1 OK:", knight.name, "verts:", len(knight.data.vertices),
      "vgroups:", len(knight.vertex_groups), "bones:", len(arm.bones),
      "mats:", [m.name for m in knight.data.materials])
