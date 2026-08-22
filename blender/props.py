# POOP SOULS — per-zone set-dressing prop kits.
# Builds 5 distinct low-poly props per zone, each rebased to z=0 and centered,
# then exports ONE glb per zone (named props at the origin) to public/.
# Axis convention: Blender Z-up; gltf export_yup=True -> base lands at y=0 in three.js.
import bpy, math

PUB = '/home/lex/.hermes/poop-souls/public/'

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for m in list(bpy.data.materials):
        try: bpy.data.materials.remove(m)
        except Exception: pass
    for m in list(bpy.data.meshes):
        try: bpy.data.meshes.remove(m)
        except Exception: pass

def mat(name, rgb, rough=0.8, emis=None, eint=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1.0)
    b.inputs['Roughness'].default_value = rough
    if alpha < 1.0:
        m.blend_method = 'BLEND'
        b.inputs['Alpha'].default_value = alpha
    if emis is not None:
        b.inputs['Emission Color'].default_value = (*emis, 1.0)
        b.inputs['Emission Strength'].default_value = eint
    return m

def _tag(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)
    return o

def box(name, m, x, y, z, sx, sy, sz, rot=None):
    bpy.ops.mesh.primitive_cube_add(location=(x, y, z))
    o = bpy.context.active_object; o.name = name
    o.scale = (sx/2, sy/2, sz/2)
    if rot: o.rotation_euler = rot
    return _tag(o, m)

def cyl(name, m, x, y, z, r, h, segs=12, rot=None):
    bpy.ops.mesh.primitive_cylinder_add(location=(x, y, z), radius=r, depth=h, vertices=segs)
    o = bpy.context.active_object; o.name = name
    if rot: o.rotation_euler = rot
    return _tag(o, m)

def cone(name, m, x, y, z, r, h, segs=8, rot=None):
    bpy.ops.mesh.primitive_cone_add(location=(x, y, z), radius1=r, depth=h, vertices=segs)
    o = bpy.context.active_object; o.name = name
    if rot: o.rotation_euler = rot
    return _tag(o, m)

def sph(name, m, x, y, z, r, scale=None):
    bpy.ops.mesh.primitive_uv_sphere_add(location=(x, y, z), radius=r, segments=16, ring_count=10)
    o = bpy.context.active_object; o.name = name
    if scale: o.scale = scale
    return _tag(o, m)

def torus(name, m, x, y, z, R, r, rot=None, segs=20):
    bpy.ops.mesh.primitive_torus_add(location=(x, y, z), major_radius=R, minor_radius=r,
                                     major_segments=segs, minor_segments=8)
    o = bpy.context.active_object; o.name = name
    if rot: o.rotation_euler = rot
    return _tag(o, m)

def ico(name, m, x, y, z, r, scale=None):
    bpy.ops.mesh.primitive_ico_sphere_add(location=(x, y, z), radius=r, subdivisions=1)
    o = bpy.context.active_object; o.name = name
    if scale: o.scale = scale
    return _tag(o, m)

def finish(parts, name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    # rebase: min z -> 0, center x/y in world
    vs = [ (o.matrix_world @ v.co) for v in o.data.vertices ]
    minz = min(v.z for v in vs)
    cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2
    cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
    o.location.x -= cx; o.location.y -= cy; o.location.z -= minz
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.location = (0,0,0)
    return o

def export_kit(zone, prop_objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in prop_objs: o.select_set(True)
    bpy.context.view_layer.objects.active = prop_objs[0]
    bpy.ops.export_scene.gltf(
        filepath=PUB + 'kit-%s.glb' % zone,
        export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_animations=False, export_skins=False,
        export_materials='EXPORT', export_image_format='AUTO',
    )
    print('EXPORTED kit-%s.glb with %d props: %s' % (zone, len(prop_objs), [o.name for o in prop_objs]))

# =====================================================================
# ZONE 1 — THE PORCELAIN HOLLOW  (cold white ceramic, pipes, drains)
# =====================================================================
def build_hollow():
    clear_scene()
    porc  = mat('h_porc',  (0.85,0.87,0.90), 0.35)
    porcS = mat('h_porcS', (0.62,0.66,0.72), 0.5)
    metal = mat('h_metal', (0.45,0.50,0.58), 0.4)
    slit  = mat('h_slit',  (0.14,0.15,0.17), 0.9)
    props = []

    # 1. toilet (bowl + tank + seat + base)
    p = [cyl('t_base', porcS, 0,0,0.18, 0.30,0.36,16),
         cyl('t_bowl', porc,  0,0,0.52, 0.34,0.5,16),
         torus('t_seat', porc, 0,0,0.80, 0.30,0.07, rot=(math.pi/2,0,0)),
         box('t_tank', porc, 0,0.34,0.62, 0.34,0.30,0.62),
         box('t_flush', metal, 0,0.52,0.86, 0.10,0.06,0.08)]
    props.append(finish(p, 'hollow_toilet'))

    # 2. tall pipe with flanges
    p = [cyl('p_body', metal, 0,0,1.1, 0.22,2.2,12),
         torus('p_f1', metal, 0,0,0.55, 0.30,0.06, rot=(math.pi/2,0,0)),
         torus('p_f2', metal, 0,0,1.65, 0.30,0.06, rot=(math.pi/2,0,0)),
         cyl('p_cap', metal, 0,0,2.24, 0.26,0.12,12)]
    props.append(finish(p, 'hollow_pipe'))

    # 3. porcelain urn
    p = [sph('u_body', porc, 0,0,0.55, 0.34, scale=(1,1,1.15)),
         cyl('u_neck', porc, 0,0,1.0, 0.18,0.28,12),
         cyl('u_foot', porcS, 0,0,0.06, 0.22,0.12,12)]
    props.append(finish(p, 'hollow_urn'))

    # 4. cracked basin (open bowl on a stand)
    p = [cyl('b_stand', porcS, 0,0,0.35, 0.12,0.7,10),
         cyl('b_basin', porc, 0,0,0.78, 0.42,0.18,16),
         cyl('b_rim', porcS, 0,0,0.88, 0.44,0.06,16),
         cyl('b_hole', slit, 0,0,0.87, 0.24,0.06,16)]
    props.append(finish(p, 'hollow_basin'))

    # 5. floor drain grate
    p = [box('d_frame', metal, 0,0,0.03, 1.2,1.2,0.06)]
    for i in range(-2,3):
        p.append(box('d_slit%d'%i, slit, i*0.2, 0, 0.06, 0.12, 0.9, 0.03))
    props.append(finish(p, 'hollow_drain'))

    export_kit('hollow', props)

# =====================================================================
# ZONE 2 — THE STINKING MARSH  (moss, reeds, water, barrels, rock)
# =====================================================================
def build_marsh():
    clear_scene()
    moss  = mat('m_moss',  (0.26,0.33,0.15), 0.95)
    reed  = mat('m_reed',  (0.42,0.50,0.22), 0.9)
    wet   = mat('m_wet',   (0.16,0.22,0.16), 0.9)
    water = mat('m_water', (0.30,0.52,0.52), 0.15, alpha=0.55)
    rock  = mat('m_rock',  (0.30,0.30,0.24), 0.95)
    wood  = mat('m_wood',  (0.34,0.25,0.15), 0.9)
    props = []

    # 1. reed cluster
    p = []
    for i in range(6):
        a = i/6*6.283; rr = 0.14
        x, y = math.cos(a)*rr, math.sin(a)*rr
        h = 1.0 + (i%3)*0.25
        p.append(cone('r%d'%i, reed, x, y, h/2, 0.035, h, 6))
    p.append(cyl('r_root', moss, 0,0,0.05, 0.16,0.1,10))
    props.append(finish(p, 'marsh_reeds'))

    # 2. mossy stump
    p = [cyl('s_body', wood, 0,0,0.4, 0.3,0.8,10),
         cyl('s_top', moss, 0,0,0.82, 0.31,0.08,10),
         sph('s_m1', moss, 0.2,0.1,0.7, 0.12, scale=(1,1,0.7)),
         sph('s_m2', moss, -0.15,-0.15,0.65, 0.10, scale=(1,1,0.7))]
    props.append(finish(p, 'marsh_stump'))

    # 3. old barrel
    band = mat('m_band', (0.2, 0.2, 0.22), 0.5)
    p = [cyl('b_body', wood, 0,0,0.5, 0.32,1.0,12),
         torus('b_r1', band, 0,0,0.2, 0.34,0.03, rot=(math.pi/2,0,0)),
         torus('b_r2', band, 0,0,0.8, 0.34,0.03, rot=(math.pi/2,0,0))]
    props.append(finish(p, 'marsh_barrel'))

    # 4. puddle (flat translucent disc)
    p = [cyl('w_p', water, 0,0,0.02, 0.9,0.04,20),
         ico('w_r1', rock, 0.35,0.1,0.03, 0.14, scale=(1,1,0.4)),
         ico('w_r2', rock, -0.3,-0.25,0.03, 0.10, scale=(1,1,0.4))]
    props.append(finish(p, 'marsh_puddle'))

    # 5. mossy rock
    p = [ico('k1', rock, 0,0,0.25, 0.45, scale=(1.1,0.9,0.6)),
         ico('k2', rock, 0.35,0.2,0.15, 0.28, scale=(1,1,0.5)),
         sph('k_m', moss, -0.1,0.15,0.42, 0.18, scale=(1.2,1,0.5))]
    props.append(finish(p, 'marsh_rock'))

    export_kit('marsh', props)

# =====================================================================
# ZONE 3 — THE GRAND THRONE  (purple, gold, filth, marble, brazier)
# =====================================================================
def build_throne():
    clear_scene()
    purp   = mat('t_purp',  (0.34,0.22,0.42), 0.7)
    purpD  = mat('t_purpD', (0.20,0.14,0.22), 0.85)
    gold   = mat('t_gold',  (0.80,0.63,0.30), 0.35, emis=(0.8,0.63,0.3), eint=0.25)
    filth  = mat('t_filth', (0.15,0.11,0.08), 0.95)
    marble = mat('t_marb',  (0.55,0.50,0.58), 0.5)
    flame  = mat('t_flame', (1.0,0.55,0.2), 0.5, emis=(1.0,0.5,0.15), eint=2.0, alpha=0.9)
    props = []

    # 1. throne (seat + back + arms + gold trim)
    p = [box('th_seat', purp, 0,0,0.45, 1.0,1.0,0.9),
         box('th_back', purp, 0,-0.45,1.2, 1.0,0.24,1.8),
         box('th_al', purp, 0.5,-0.1,0.8, 0.18,0.9,0.7),
         box('th_ar', purp, -0.5,-0.1,0.8, 0.18,0.9,0.7),
         box('th_crown', gold, 0,-0.55,2.2, 0.5,0.12,0.3),
         box('th_leg1', purpD, 0.4,0.4,0.22, 0.2,0.2,0.44),
         box('th_leg2', purpD, -0.4,0.4,0.22, 0.2,0.2,0.44),
         box('th_leg3', purpD, 0.4,-0.4,0.22, 0.2,0.2,0.44),
         box('th_leg4', purpD, -0.4,-0.4,0.22, 0.2,0.2,0.44)]
    props.append(finish(p, 'throne_throne'))

    # 2. column + banner
    p = [cyl('c_col', marble, 0,0,1.4, 0.28,2.8,12),
         cyl('c_cap', marble, 0,0,2.85, 0.4,0.16,12),
         cyl('c_base', marble, 0,0,0.08, 0.4,0.16,12),
         box('c_banner', purp, 0,0.32,2.1, 0.7,0.05,1.4),
         box('c_btrim', gold, 0,0.36,2.8, 0.74,0.03,0.12)]
    props.append(finish(p, 'throne_banner'))

    # 3. filth pile
    p = [sph('f1', filth, 0,0,0.28, 0.5, scale=(1.2,1,0.55)),
         sph('f2', filth, 0.4,0.25,0.2, 0.3, scale=(1,1,0.6)),
         sph('f3', filth, -0.35,-0.2,0.18, 0.26, scale=(1,1,0.6)),
         sph('f_g', mat('t_glint',(0.4,0.3,0.18),0.5), 0.1,0.1,0.42, 0.08, scale=(1,1,0.6))]
    props.append(finish(p, 'throne_filth'))

    # 4. gold brazier
    p = [cyl('b_post', gold, 0,0,0.8, 0.1,1.6,10),
         cyl('b_bowl', mat('t_bowl',(0.25,0.2,0.25),0.6), 0,0,1.7, 0.4,0.3,14),
         sph('b_f1', flame, 0,0,1.95, 0.22, scale=(1,1,1.3)),
         sph('b_f2', flame, 0.1,0.05,2.05, 0.12, scale=(1,1,1.2))]
    props.append(finish(p, 'throne_brazier'))

    # 5. marble pedestal slab
    p = [box('s_slab', marble, 0,0,0.5, 1.2,1.2,1.0),
         box('s_top', gold, 0,0,1.04, 1.26,1.26,0.08),
         box('s_pile', purpD, 0,0,1.2, 0.7,0.7,0.28)]
    props.append(finish(p, 'throne_pedestal'))

    export_kit('throne', props)

build_hollow()
build_marsh()
build_throne()
print('ALL KITS DONE')
