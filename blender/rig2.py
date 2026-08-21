import bpy, math
R = math.radians
arm = bpy.data.objects["KnightArm"]
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
for pb in arm.pose.bones:
    pb.rotation_mode = 'XYZ'

# ---- rest pose (baseline) ----
REST = {
    "Hips":       (0, 0, 0),
    "Spine":      (-4, 0, 0),
    "Spine1":     (3, 0, 0),
    "Head":       (1, 0, 0),
    "Thigh.L":    (2, 0, 0),   "Calf.L": (3, 0, 0),   "Foot.L": (-3, 0, 0),
    "UpperArm.L": (-6, -10, 0),"LowerArm.L": (18, 0, 0), "Hand.L": (0, 0, 0),
    "Thigh.R":    (2, 0, 0),   "Calf.R": (3, 0, 0),   "Foot.R": (-3, 0, 0),
    "UpperArm.R": (-6, 10, 0), "LowerArm.R": (18, 0, 0), "Hand.R": (0, 0, 0),
}
HIPS_LOC = {1: (0,0,0)}  # optional per-frame hips offsets handled via locs dict

def K(b, f, x, y, z, loc=None):
    pb = arm.pose.bones[b]
    pb.rotation_euler = (R(x), R(y), R(z))
    if loc is not None:
        pb.location = loc
        pb.keyframe_insert('location', frame=f)
    pb.keyframe_insert('rotation_euler', frame=f)

def all_fcurves(act):
    try:
        return list(act.fcurves)
    except AttributeError:
        fc = []
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    fc.extend(list(cb.fcurves))
        return fc

for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
arm.animation_data_clear()

# Each clip = (name, loop, [ (frame, {bone:(x,y,z)} , {bone:(lx,ly,lz)}), ... ])
# Every frame: unspecified bones filled from REST, unspecified loc from (0,0,0).
def make(name, loop, keys):
    act = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = act
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

def rest_f(f, **over):
    return (f, over, {})

# ================= IDLE (60f loop): breathing =================
make("Idle", True, [
    rest_f(1),
    (30, {"Spine1": (7,0,0), "Head": (-2,0,0), "UpperArm.L": (-9,-11,0),
          "UpperArm.R": (-9,11,0), "Thigh.L": (3,0,0), "Thigh.R": (1,0,0)},
          {"Hips": (0.01, 0, -0.012)}),
    (45, {"Spine1": (1,0,0)}, {"Hips": (0, 0, -0.02)}),
    rest_f(60),
])

# ================= WALK (36f loop, f1==f37) =================
WL = [
    (1,  {"Thigh.L":(-50,0,0),"Calf.L":(18,0,0),"Foot.L":(-8,0,0),
          "Thigh.R":(45,0,0),"Calf.R":(4,0,0),"Foot.R":(-4,0,0),
          "UpperArm.L":(35,0,0),"UpperArm.R":(-35,0,0),"LowerArm.L":(22,0,0),"LowerArm.R":(22,0,0),
          "Spine1":(10,0,0),"Head":(-4,0,0)}, {"Hips":(0.02,0,-0.02)}),
    (10, {"Thigh.L":(-15,0,0),"Calf.L":(45,0,0),"Thigh.R":(15,0,0),"Calf.R":(40,0,0),
          "UpperArm.L":(5,0,0),"UpperArm.R":(5,0,0),"LowerArm.L":(18,0,0),"LowerArm.R":(18,0,0),
          "Spine1":(12,0,0),"Head":(-3,0,0)}, {"Hips":(0,0,0)}),
    (19, {"Thigh.L":(45,0,0),"Calf.L":(4,0,0),"Foot.L":(-4,0,0),
          "Thigh.R":(-50,0,0),"Calf.R":(18,0,0),"Foot.R":(-8,0,0),
          "UpperArm.L":(-35,0,0),"UpperArm.R":(35,0,0),"LowerArm.L":(22,0,0),"LowerArm.R":(22,0,0),
          "Spine1":(10,0,0),"Head":(-4,0,0)}, {"Hips":(-0.02,0,-0.02)}),
    (28, {"Thigh.L":(15,0,0),"Calf.L":(40,0,0),"Thigh.R":(-15,0,0),"Calf.R":(45,0,0),
          "UpperArm.L":(5,0,0),"UpperArm.R":(5,0,0),"LowerArm.L":(18,0,0),"LowerArm.R":(18,0,0),
          "Spine1":(12,0,0),"Head":(-3,0,0)}, {"Hips":(0,0,0)}),
    (37, {"Thigh.L":(-50,0,0),"Calf.L":(18,0,0),"Foot.L":(-8,0,0),
          "Thigh.R":(45,0,0),"Calf.R":(4,0,0),"Foot.R":(-4,0,0),
          "UpperArm.L":(35,0,0),"UpperArm.R":(-35,0,0),"LowerArm.L":(22,0,0),"LowerArm.R":(22,0,0),
          "Spine1":(10,0,0),"Head":(-4,0,0)}, {"Hips":(0.02,0,-0.02)}),
]
make("Walk", True, WL)

# ================= ATTACK1 (24f, one-shot): overhead chop, right arm =================
make("Attack1", False, [
    rest_f(1),
    (5,  {"UpperArm.R":(-120,10,0),"LowerArm.R":(45,0,0),"Spine1":(-12,0,0),
          "Spine":(-8,0,0),"Head":(10,0,0),"UpperArm.L":(-20,-10,0)}, {"Hips":(0,0,-0.02)}),
    (10, {"UpperArm.R":(-135,10,0),"LowerArm.R":(55,0,0),"Spine1":(-14,0,4),
          "Spine":(-10,0,0),"Head":(12,0,0)}, {"Hips":(0,0,-0.03)}),
    (13, {"UpperArm.R":(45,10,0),"LowerArm.R":(20,0,0),"Spine1":(16,0,-6),
          "Spine":(10,0,0),"Head":(-6,0,0),"UpperArm.L":(-25,-10,0)}, {"Hips":(0,0,-0.05)}),
    (17, {"UpperArm.R":(20,10,0),"LowerArm.R":(25,0,0),"Spine1":(8,0,-2),
          "Spine":(4,0,0),"Head":(-2,0,0)}, {"Hips":(0,0,-0.03)}),
    (21, {"UpperArm.R":(-8,10,0),"Spine1":(4,0,0),"Spine":(-2,0,0),"Head":(0,0,0)}, {}),
    rest_f(24),
])

# ================= ATTACK2 (20f, one-shot): horizontal sweep =================
make("Attack2", False, [
    rest_f(1),
    (4,  {"UpperArm.R":(-20,20,-55),"LowerArm.R":(35,0,0),"Spine1":(-6,0,-10),
          "Head":(0,0,-14),"UpperArm.L":(-20,-10,0)}, {"Hips":(0,0,-0.02)}),
    (7,  {"UpperArm.R":(0,20,-70),"LowerArm.R":(40,0,0),"Spine1":(-8,0,-12),
          "Spine":(-4,0,0),"Head":(0,0,-16)}, {"Hips":(0,0,-0.03)}),
    (11, {"UpperArm.R":(35,20,55),"LowerArm.R":(18,0,0),"Spine1":(10,0,10),
          "Spine":(8,0,0),"Head":(0,0,14),"UpperArm.L":(-25,-10,0)}, {"Hips":(0,0,-0.04)}),
    (15, {"UpperArm.R":(15,15,30),"LowerArm.R":(25,0,0),"Spine1":(5,0,5),
          "Head":(0,0,6)}, {"Hips":(0,0,-0.02)}),
    (18, {"UpperArm.R":(-5,10,0),"Spine1":(3,0,0),"Head":(1,0,0)}, {}),
    rest_f(20),
])

# ================= ATTACK3 (22f, one-shot): two-handed heavy slam =================
make("Attack3", False, [
    rest_f(1),
    (5,  {"UpperArm.R":(-110,-10,0),"LowerArm.R":(40,0,0),
          "UpperArm.L":(-100,10,0),"LowerArm.L":(40,0,0),"Spine1":(-14,0,0),
          "Spine":(-10,0,0),"Head":(12,0,0)}, {"Hips":(0,0,-0.03)}),
    (9,  {"UpperArm.R":(-125,-10,0),"LowerArm.R":(55,0,0),
          "UpperArm.L":(-115,10,0),"LowerArm.L":(55,0,0),"Spine1":(-16,0,0),
          "Spine":(-12,0,0),"Head":(14,0,0)}, {"Hips":(0,0,-0.04)}),
    (12, {"UpperArm.R":(50,-10,0),"LowerArm.R":(15,0,0),
          "UpperArm.L":(45,10,0),"LowerArm.L":(15,0,0),"Spine1":(18,0,0),
          "Spine":(14,0,0),"Head":(-8,0,0)}, {"Hips":(0,0,-0.07)}),
    (16, {"UpperArm.R":(25,-10,0),"LowerArm.R":(20,0,0),
          "UpperArm.L":(22,10,0),"LowerArm.L":(20,0,0),"Spine1":(9,0,0),
          "Spine":(6,0,0),"Head":(-3,0,0)}, {"Hips":(0,0,-0.04)}),
    (20, {"UpperArm.R":(-8,-10,0),"LowerArm.R":(20,0,0),
          "UpperArm.L":(-6,10,0),"LowerArm.L":(18,0,0),"Spine1":(3,0,0),
          "Spine":(-2,0,0),"Head":(1,0,0)}, {}),
    rest_f(22),
])

# ================= DODGE (20f, one-shot): crouched 360 spin =================
make("Dodge", False, [
    rest_f(1),
    (5,  {"Hips":(0,0,90),"Spine1":(35,0,0),"Spine":(22,0,0),"Head":(18,0,0),
          "Thigh.L":(-48,0,0),"Thigh.R":(-42,0,0),"Calf.L":(95,0,0),"Calf.R":(90,0,0),
          "Foot.L":(-48,0,0),"Foot.R":(-42,0,0),
          "UpperArm.L":(45,-20,0),"UpperArm.R":(45,20,0),"LowerArm.L":(55,0,0),"LowerArm.R":(55,0,0)},
         {"Hips":(0,0,-0.32)}),
    (11, {"Hips":(0,0,270),"Spine1":(38,0,0),"Spine":(24,0,0),"Head":(20,0,0),
          "Thigh.L":(-45,0,0),"Thigh.R":(-48,0,0),"Calf.L":(92,0,0),"Calf.R":(95,0,0),
          "Foot.L":(-45,0,0),"Foot.R":(-48,0,0),
          "UpperArm.L":(45,-20,0),"UpperArm.R":(45,20,0),"LowerArm.L":(55,0,0),"LowerArm.R":(55,0,0)},
         {"Hips":(0,0,-0.34)}),
    (16, {"Hips":(0,0,340),"Spine1":(20,0,0),"Spine":(12,0,0),"Head":(8,0,0),
          "Thigh.L":(-25,0,0),"Thigh.R":(-20,0,0),"Calf.L":(60,0,0),"Calf.R":(55,0,0),
          "UpperArm.L":(25,-15,0),"UpperArm.R":(25,15,0),"LowerArm.L":(35,0,0),"LowerArm.R":(35,0,0)},
         {"Hips":(0,0,-0.18)}),
    rest_f(20),
])

# ================= BLOCK (30f loop): guard hold w/ sway =================
GUARD = {"UpperArm.L":(-100,-25,0),"LowerArm.L":(95,0,0),
         "UpperArm.R":(-95,-12,0),"LowerArm.R":(90,0,0),
         "Spine1":(14,0,0),"Head":(6,0,0),
         "Thigh.L":(8,0,0),"Thigh.R":(-6,0,0),"Calf.L":(15,0,0),"Calf.R":(12,0,0),
         "Hand.L":(-30,0,0),"Hand.R":(-30,0,0)}
make("Block", True, [
    (1,  GUARD, {"Hips":(0,0,-0.06)}),
    (15, {**GUARD, "Spine1":(11,0,0), "Head":(4,0,0)}, {"Hips":(0,0,-0.075)}),
    (30, GUARD, {"Hips":(0,0,-0.06)}),
])

# ================= HIT (18f, one-shot): recoil =================
make("Hit", False, [
    rest_f(1),
    (3,  {"Spine1":(-16,0,0),"Spine":(-10,0,0),"Head":(-24,0,0),
          "UpperArm.L":(-45,-10,0),"UpperArm.R":(-40,10,0),
          "LowerArm.L":(40,0,0),"LowerArm.R":(35,0,0)}, {"Hips":(0,0,-0.05)}),
    (8,  {"Spine1":(-5,0,0),"Spine":(-3,0,0),"Head":(-8,0,0),
          "UpperArm.L":(-25,-10,0),"UpperArm.R":(-20,10,0)}, {}),
    (13, {"Spine1":(-1,0,0),"Head":(-2,0,0)}, {}),
    rest_f(18),
])

bpy.context.scene.frame_set(1)
bpy.ops.object.mode_set(mode='OBJECT')
print("STAGE2 OK actions:", sorted([a.name for a in bpy.data.actions]))
