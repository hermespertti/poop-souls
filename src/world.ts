// POOP SOULS — zone/arena builder. Deterministic layout, primitive floor/walls
// + per-zone Blender prop kits (kit-<zone>.glb) scattered deterministically.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ZONES } from './data';

export interface Interactable {
  pos: THREE.Vector3;
  radius: number;
  kind: 'bonfire' | 'shrine' | 'bossDoor' | 'ladder';
  object: THREE.Object3D;
}

export interface ZoneBuild {
  root: THREE.Group;
  interactables: Interactable[];
  bonfire: THREE.Vector3;
  shrine: THREE.Vector3;
  bossDoor: THREE.Vector3;
  spawn: THREE.Vector3;
  boss: THREE.Vector3;
  pillars: { x: number; z: number }[];
  propColliders: { x: number; z: number; r: number }[];
  // M4: flicker-driven local lights (bonfire, torches, braziers, shrine, door, center)
  dynamic: {
    fire: THREE.PointLight;
    torches: THREE.PointLight[];
    braziers: THREE.PointLight[];
    shrine: THREE.PointLight;
    door: THREE.PointLight;
    center: THREE.PointLight;
  };
  // M5: verticality — elevated walkway ring with drop gaps + ladders
  vertical: {
    walkH: number;          // walkway surface height
    walkIn: number;         // inner radius (ground stays inside this)
    walkOut: number;        // outer radius
    gapCenters: number[];   // drop holes in the ring, radians
    gapHalf: number;        // half angular width of a hole
    corridors: { angle: number; half: number }[]; // ground-level passage openings in the rim
    ladders: { x: number; z: number }[];
  };
  ambient: {
    fog: number; fogNear: number; fogFar: number; background: number;
    hemiSky: number; hemiGround: number; hemiIntensity: number; light: number;
  };
}

// M5 ring geometry — module level so both propLayout and buildZone share it.
// Angle convention: atan2(z, x). North (boss door, -z) is at -PI/2.
// Corridors open the parapet (+ cut the slab) at the three N-side anchors;
// drop holes and ladders sit on the open S/E/W arcs.
export function ringFor(size: number) {
  const walkH = 4.5;
  const walkIn = size - 5.2;
  const walkOut = size - 0.5;
  const bandMid = (walkIn + walkOut) / 2;
  const bandHalf = (walkOut - walkIn) / 2;
  const corridors = [
    { angle: -Math.PI / 4, half: 0.16 },     // NE: shrine corner
    { angle: -Math.PI / 2, half: 0.18 },     // N: boss-door passage (slab cut)
    { angle: -Math.PI * 0.75, half: 0.16 },  // NW: bonfire / spawn corner
  ];
  const holes = [0, Math.PI / 2]; // E and S drop holes
  const holeHalf = 0.14;
  const ladders = [Math.PI / 4, Math.PI * 0.75, Math.PI].map((a) => ({
    x: Math.cos(a) * (walkIn + 1.2), z: Math.sin(a) * (walkIn + 1.2),
  }));
  const inCorr = (a: number) => corridors.some((c) => { let d = Math.abs(a - c.angle); if (d > Math.PI) d = Math.PI * 2 - d; return d < c.half; });
  const inHole = (a: number) => holes.some((c) => { let d = Math.abs(a - c); if (d > Math.PI) d = Math.PI * 2 - d; return d < holeHalf; });
  const inBand = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    if (r < walkIn - 1.5 || r > walkOut + 1.5) return false;
    const a = Math.atan2(z, x);
    return !inCorr(a) && !inHole(a); // corridor/hole ground is open
  };
  return { walkH, walkIn, walkOut, bandMid, bandHalf, corridors, holes, holeHalf, ladders, inCorr, inHole, inBand };
}

// Prop types per zone + their collider radius (0 = purely visual).
const PROP_R: Record<string, number> = {
  hollow_toilet: 0.6, hollow_pipe: 0.4, hollow_urn: 0.4, hollow_basin: 0.6, hollow_drain: 0,
  marsh_reeds: 0.3, marsh_stump: 0.5, marsh_barrel: 0.5, marsh_puddle: 0, marsh_rock: 0.6,
  throne_throne: 1.0, throne_banner: 0.5, throne_filth: 0.6, throne_brazier: 0.4, throne_pedestal: 0.8,
};

export interface PropSpawn { x: number; z: number; r: number; prop: string; rot: number; scale: number; }

// Deterministic prop placement for a zone (same seed => same layout every load).
export function propLayout(zoneIndex: number): PropSpawn[] {
  const zone = ZONES[Math.max(0, Math.min(ZONES.length - 1, zoneIndex))];
  const size = zone.size;
  const ring = ringFor(size);
  const rand = mulberry32(777 + zoneIndex * 131);
  const out: PropSpawn[] = [];
  const anchors: { x: number; z: number; keep: number }[] = [
    { x: 0, z: -size + 8, keep: 6.5 },      // boss arena / platform
    { x: -size + 4, z: -size + 4, keep: 6 }, // bonfire
    { x: -size + 6, z: -size + 6, keep: 7 }, // spawn
    { x: size - 4, z: -size + 4, keep: 6 },  // shrine
    { x: 0, z: -size + 2, keep: 5 },        // boss door
  ];
  const roster: string[] =
    zoneIndex === 0 ? ['hollow_toilet','hollow_pipe','hollow_pipe','hollow_urn','hollow_urn','hollow_basin','hollow_basin','hollow_drain','hollow_drain','hollow_drain','hollow_toilet','hollow_pipe']
    : zoneIndex === 1 ? ['marsh_reeds','marsh_reeds','marsh_reeds','marsh_stump','marsh_stump','marsh_barrel','marsh_barrel','marsh_puddle','marsh_puddle','marsh_puddle','marsh_rock','marsh_rock','marsh_rock','marsh_reeds']
    : ['throne_banner','throne_banner','throne_banner','throne_brazier','throne_brazier','throne_brazier','throne_filth','throne_filth','throne_filth','throne_pedestal','throne_pedestal','throne_banner'];
  // centerpiece: the Grand Throne itself — north wall, east of the boss door,
  // facing the arena (model front is -Z at rot 0, so θ = atan2(tx, tz) points it in)
  if (zoneIndex === 2) {
    const tx = size * 0.45, tz = -size + 3.5;
    out.push({ x: tx, z: tz, r: PROP_R.throne_throne * 1.3, prop: 'throne_throne', rot: Math.atan2(tx, tz), scale: 1.3 });
    anchors.push({ x: tx, z: tz, keep: 10 });
  }
  const minGap = (p: string) => (PROP_R[p] > 0 ? 2.4 : 1.3);
  for (const prop of roster) {
    let placed = false, guard = 0;
    while (!placed && guard < 80) {
      guard++;
      const x = (rand() * 2 - 1) * (size - 2.5);
      const z = (rand() * 2 - 1) * (size - 2.5);
      if (ring.inBand(x, z)) continue; // M5: keep props off the gallery band
      if (anchors.some(a => Math.hypot(a.x - x, a.z - z) < a.keep)) continue;
      if (out.some(q => Math.hypot(q.x - x, q.z - z) < minGap(q.prop) + minGap(prop))) continue;
      out.push({ x, z, r: PROP_R[prop] ?? 0, prop, rot: rand() * Math.PI * 2, scale: 0.85 + rand() * 0.3 });
      placed = true;
    }
  }
  return out;
}

// deterministic PRNG (mulberry32)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lightened(hex: number, f: number): number {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r + (1 - c.r) * f);
  c.g = Math.min(1, c.g + (1 - c.g) * f);
  c.b = Math.min(1, c.b + (1 - c.b) * f);
  return c.getHex();
}
function darkened(hex: number, f: number): number {
  const c = new THREE.Color(hex);
  c.r *= 1 - f; c.g *= 1 - f; c.b *= 1 - f;
  return c.getHex();
}

// ---------------- prop kit loading (async, cached) ----------------
const kitGlts: Record<string, THREE.Group> = {};
export function loadKit(zone: string): Promise<void> {
  return new Promise((resolve) => {
    if (kitGlts[zone]) return resolve();
    new GLTFLoader().load('kit-' + zone + '.glb', (gltf) => {
      kitGlts[zone] = gltf.scene;
      resolve();
    }, undefined, () => resolve()); // missing kit -> zone still works, just fewer props
  });
}

// Clone each placed prop from the zone kit and add it to the zone root.
// Prop objects in the kit are rebased to z=0 and centered at the origin, so
// setting position/rotation/scale on the clone places it exactly.
export function spawnProps(root: THREE.Group, zone: string, zoneIndex: number): void {
  const kit = kitGlts[zone];
  if (!kit) return;
  const layout = propLayout(zoneIndex);
  for (const sp of layout) {
    const src = kit.getObjectByName(sp.prop);
    if (!src) continue;
    const inst = src.clone(true);
    inst.position.set(sp.x, 0, sp.z);
    inst.rotation.y = sp.rot;
    inst.scale.setScalar(sp.scale);
    inst.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    root.add(inst);
  }
}

export function buildZone(zoneIndex: number): ZoneBuild {
  const zone = ZONES[Math.max(0, Math.min(ZONES.length - 1, zoneIndex))];
  const size = zone.size;
  const rand = mulberry32(1234 + zoneIndex * 77);
  const root = new THREE.Group();

  // ---------------- floor ----------------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 2, size * 2),
    new THREE.MeshStandardMaterial({ color: zone.floor, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // ---------------- walls ----------------
  const wallMat = new THREE.MeshStandardMaterial({ color: zone.wall, emissive: zone.wall, emissiveIntensity: 0.15 });
  const wallH = 5, wallT = 0.6;
  const mkWall = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    m.position.set(x, wallH / 2, z);
    m.receiveShadow = true;
    m.castShadow = true;
    root.add(m);
  };
  mkWall(size * 2 + wallT * 2, wallT, 0, -size); // north (boss)
  mkWall(size * 2 + wallT * 2, wallT, 0, size); // south
  mkWall(wallT, size * 2, -size, 0); // west
  mkWall(wallT, size * 2, size, 0); // east

  // ---------------- M5 ring (gallery + drop holes + ladders) ----------------
  const rg = ringFor(size);

  // ---------------- pillar placement ----------------
  const bossAnchor = new THREE.Vector2(0, -size + 8);
  const spawnAnchor = new THREE.Vector2(-size + 6, -size + 6);
  const bonfireAnchor = new THREE.Vector2(-size + 4, -size + 4);
  const shrineAnchor = new THREE.Vector2(size - 4, -size + 4);
  const pillars: { x: number; z: number }[] = [];
  let guard = 0;
  while (pillars.length < 10 && guard < 400) {
    guard++;
    const x = (rand() * 2 - 1) * (size - 3);
    const z = (rand() * 2 - 1) * (size - 3);
    if (rg.inBand(x, z)) continue; // M5: no pillars under the gallery
    const p = new THREE.Vector2(x, z);
    if (p.distanceTo(new THREE.Vector2(0, 0)) < 5) continue;
    if (p.distanceTo(bossAnchor) < 7) continue;
    if (p.distanceTo(spawnAnchor) < 8) continue;
    if (p.distanceTo(bonfireAnchor) < 8) continue;
    if (p.distanceTo(shrineAnchor) < 8) continue;
    if (pillars.some((q) => Math.hypot(q.x - x, q.z - z) < 2.5)) continue;
    pillars.push({ x, z });
  }
  const pillarMat = new THREE.MeshStandardMaterial({ color: zone.pillar, roughness: 0.9 });
  const capMat = new THREE.MeshStandardMaterial({ color: lightened(zone.pillar, 0.12), roughness: 0.9 });
  for (const p of pillars) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 0.8), pillarMat);
    col.position.set(p.x, 2.5, p.z);
    col.castShadow = true;
    col.receiveShadow = true;
    root.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 1.0), capMat);
    cap.position.set(p.x, 5, p.z);
    root.add(cap);
  }

  // ---------------- lighting (M4 dark-but-atmospheric) ----------------
  // No local hemisphere here — the single global dim hemi (main.ts) carries the
  // base, tinted per-zone via the ambient config below. Everything else is local
  // pools of light that the game loop flickers: a center accent, torches, the
  // bonfire, shrine + boss-door glows, and gold braziers in the throne hall.
  const ATMOS: {
    hemiInt: number; fogMul: number;
    center: number; centerInt: number;
    torchInt: number; fireInt: number; shrineInt: number; doorInt: number;
  }[] = [
    // hollow: cold blue mist, warm torchlight pools
    { hemiInt: 0.45, fogMul: 0.72, center: 0xffc878, centerInt: 10, torchInt: 6, fireInt: 16, shrineInt: 6, doorInt: 5 },
    // marsh: near-pitch black, sickly green
    { hemiInt: 0.32, fogMul: 0.62, center: 0x7aff9a, centerInt: 8, torchInt: 5, fireInt: 15, shrineInt: 6, doorInt: 5 },
    // throne: purple gloom, gold + pink — lifted so the hall reads
    { hemiInt: 0.44, fogMul: 0.80, center: 0xffc060, centerInt: 15, torchInt: 8, fireInt: 16, shrineInt: 6, doorInt: 8 },
  ];
  const at = ATMOS[zoneIndex] ?? ATMOS[0];
  const hemiSky = lightened(zone.fog, 0.35);
  const hemiGround = darkened(zone.floor, 0.35);
  const centerLight = new THREE.PointLight(at.center, at.centerInt, 36, 2);
  centerLight.userData.base = at.centerInt;
  centerLight.position.set(0, 7, -size / 2);
  root.add(centerLight);

  // torches: 4 sconces, all with flickering point lights
  const flameMat = new THREE.MeshBasicMaterial({ color: zone.accent });
  const sconceMat = new THREE.MeshStandardMaterial({ color: darkened(zone.wall, 0.4) });
  const torchPos: { x: number; z: number }[] = [
    { x: -size + 0.4, z: -size / 2 },
    { x: size - 0.4, z: -size / 2 },
    { x: -size / 2, z: size - 0.4 },
    { x: size / 2, z: size - 0.4 },
  ];
  const torchLights: THREE.PointLight[] = [];
  for (const tp of torchPos) {
    const g = new THREE.Group();
    const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), sconceMat);
    sconce.position.y = 2.2;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), flameMat);
    flame.position.y = 2.55;
    g.add(sconce, flame);
    g.position.set(tp.x, 0, tp.z);
    root.add(g);
    const pl = new THREE.PointLight(zone.accent, at.torchInt, 13, 2);
    pl.userData.base = at.torchInt;
    pl.position.set(tp.x, 2.5, tp.z);
    root.add(pl);
    torchLights.push(pl);
  }

  // ---------------- bonfire (toilet bonfire) ----------------
  const bonfirePos = new THREE.Vector3(-size + 4, 0, -size + 4);
  const fireGroup = new THREE.Group();
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xf0f0f5, roughness: 0.4 });
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), ceramic);
  tank.position.set(0, 0.65, -0.35);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), ceramic);
  base.position.set(0, 0.2, 0);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.28, 14), ceramic);
  bowl.position.set(0, 0.54, 0);
  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 8, 18), ceramic);
  seat.rotation.x = -Math.PI / 2;
  seat.position.set(0, 0.72, 0);
  fireGroup.add(tank, base, bowl, seat);
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 });
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 8), fireMat);
  f1.position.y = 1.15;
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), fireMat);
  f2.position.y = 1.35;
  fireGroup.add(f1, f2);
  const fireLight = new THREE.PointLight(0xff9030, at.fireInt, 17, 2);
  fireLight.userData.base = at.fireInt;
  fireLight.position.y = 1.3;
  fireGroup.add(fireLight);
  fireGroup.position.copy(bonfirePos);
  root.add(fireGroup);

  // ---------------- shrine ----------------
  const shrinePos = new THREE.Vector3(size - 4, 0, -size + 4);
  const shrineGroup = new THREE.Group();
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.8, 0.5, 14),
    new THREE.MeshStandardMaterial({ color: 0x555a64, roughness: 0.9 }),
  );
  pedestal.position.y = 0.25;
  shrineGroup.add(pedestal);
  const shrineBowlMat = new THREE.MeshStandardMaterial({
    color: zone.pillar, emissive: zone.accent, emissiveIntensity: 0.7, roughness: 0.35,
  });
  const shrineBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 0.35, 18), shrineBowlMat);
  shrineBowl.position.y = 0.68;
  shrineGroup.add(shrineBowl);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.65, 24),
    new THREE.MeshBasicMaterial({ color: zone.accent, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.87;
  shrineGroup.add(ring);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6a6f7a, roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 0.15), postMat);
    post.position.set(Math.cos(a) * 1.6, 0.5, Math.sin(a) * 1.6);
    shrineGroup.add(post);
  }
  shrineGroup.position.copy(shrinePos);
  const shrineLight = new THREE.PointLight(zone.accent, at.shrineInt, 11, 2);
  shrineLight.userData.base = at.shrineInt;
  shrineLight.position.y = 1.3;
  shrineGroup.add(shrineLight);
  shrineGroup.userData.bowlMat = shrineBowlMat;
  root.add(shrineGroup);

  // ---------------- boss door ----------------
  const doorGroup = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: darkened(zone.wall, 0.3), roughness: 0.9 });
  const pL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.5, 1.2), frameMat);
  pL.position.set(-2.2, 2.25, 0);
  const pR = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.5, 1.2), frameMat);
  pR.position.set(2.2, 2.25, 0);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.0, 1.4), frameMat);
  lintel.position.set(0, 5.35, 0); // M5: top 5.85 clears the gallery slab above the door
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 4.0, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x14121a, emissive: zone.accent, emissiveIntensity: 0.55 }),
  );
  slab.position.set(0, 2.0, 0);
  const doorRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.08, 8, 24),
    new THREE.MeshBasicMaterial({ color: zone.accent }),
  );
  doorRing.position.set(0, 2.0, 0.25);
  doorGroup.add(pL, pR, lintel, slab, doorRing);
  doorGroup.position.set(0, 0, -size);
  const doorLight = new THREE.PointLight(zone.accent, at.doorInt, 12, 2);
  doorLight.userData.base = at.doorInt;
  doorLight.position.set(0, 2.2, 1.1);
  doorGroup.add(doorLight);
  root.add(doorGroup);

  // throne hall: gold fire in each brazier — positions come from the prop layout
  // so the glow exists before the GLB kit arrives
  const brazierLights: THREE.PointLight[] = [];
  if (zoneIndex === 2) {
    for (const sp of propLayout(2)) {
      if (sp.prop !== 'throne_brazier') continue;
      const bl = new THREE.PointLight(0xffb050, 7, 10, 2);
      bl.userData.base = 7;
      bl.position.set(sp.x, 1.1 * sp.scale, sp.z);
      root.add(bl);
      brazierLights.push(bl);
    }
  }

  // ---------------- boss platform ----------------
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3.2, 0.3, 20),
    new THREE.MeshStandardMaterial({ color: lightened(zone.floor, 0.15), roughness: 0.9 }),
  );
  platform.position.set(0, 0.15, -size + 8);
  platform.receiveShadow = true;
  root.add(platform);
  // floor plates around the platform
  const plateMat = new THREE.MeshStandardMaterial({ color: lightened(zone.floor, 0.08), roughness: 0.95 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.4), plateMat);
    plate.position.set(Math.cos(a) * 4.6, 0.06, -size + 8 + Math.sin(a) * 4.6);
    root.add(plate);
  }

  // ---------------- M5 verticality: elevated gallery + drop holes + ladders ----------------
  // An elevated walkway ring runs along the arena rim at walkH (4.0u). The player
  // climbs it via ladders (E), walks the rim, and drops back down through the two
  // drop holes. The parapet is open at N (boss-door passage — the slab is cut
  // over it) and at SW/NE (reach the bonfire/spawn and shrine corners), so no
  // ground anchor is walled off. Only the player uses the vertical layer; mobs
  // keep their spawn level.
  const SEG = 192;
  const walkMat = new THREE.MeshStandardMaterial({ color: lightened(zone.floor, 0.06), roughness: 0.92 });
  const parapetMat = new THREE.MeshStandardMaterial({ color: zone.wall, emissive: zone.wall, emissiveIntensity: 0.1 });
  for (let i = 0; i < SEG; i++) {
    const am = ((i + 0.5) / SEG) * Math.PI * 2;
    const hole = rg.inHole(am), corr = rg.inCorr(am);
    // gallery slab (cut over drop holes AND the corridor passages)
    if (!hole && !corr) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(rg.bandHalf * 2, 0.22, 1.1), walkMat);
      seg.position.set(Math.cos(am) * rg.bandMid, rg.walkH - 0.11, Math.sin(am) * rg.bandMid);
      seg.rotation.y = -am;
      seg.receiveShadow = true;
      root.add(seg);
    }
    // inner parapet (open at corridors so the ground floor reaches the nooks)
    if (!hole && !corr) {
      const pw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 1.1), parapetMat);
      pw.position.set(Math.cos(am) * rg.walkIn, rg.walkH + 0.35, Math.sin(am) * rg.walkIn);
      pw.rotation.y = -am;
      pw.castShadow = true;
      root.add(pw);
    }
  }
  // ground-level passage torches: one per corridor opening — a reason to walk
  // the rim and see what's in the dark nook under the gallery
  for (const c of rg.corridors) {
    const passLight = new THREE.PointLight(zone.accent, 5, 9, 2);
    passLight.userData.base = 5;
    passLight.position.set(Math.cos(c.angle) * (size - 2.6), 2.2, Math.sin(c.angle) * (size - 2.6));
    root.add(passLight);
  }
  // ladders: two uprights + rungs, standing on the ground, spanning to the gallery
  const ladMat = new THREE.MeshStandardMaterial({ color: 0x6a5a42, roughness: 0.85 });
  const ladderObjs: THREE.Group[] = [];
  for (const lp of rg.ladders) {
    const lg = new THREE.Group();
    const h = rg.walkH + 0.8;
    for (const s of [-0.35, 0.35]) {
      const up = new THREE.Mesh(new THREE.BoxGeometry(0.09, h, 0.09), ladMat);
      up.position.set(s, h / 2, 0);
      up.castShadow = true;
      lg.add(up);
    }
    for (let r = 0.4; r < h; r += 0.42) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), ladMat);
      rung.position.set(0, r, 0);
      lg.add(rung);
    }
    // face the ladder's plane tangentially (thin axis radial) so it reads as a wall ladder
    lg.rotation.y = Math.PI / 2 - Math.atan2(lp.z, lp.x);
    lg.position.set(lp.x, 0, lp.z);
    root.add(lg);
    ladderObjs.push(lg);
  }
  const vertical = { walkH: rg.walkH, walkIn: rg.walkIn, walkOut: rg.walkOut, gapCenters: rg.holes, gapHalf: rg.holeHalf, corridors: rg.corridors, ladders: rg.ladders };

  // ---------------- ambient ----------------
  const ambient = {
    fog: zone.fog,
    fogNear: zone.fogNear,
    fogFar: zone.fogFar * at.fogMul,
    background: darkened(zone.fog, 0.62),
    hemiSky,
    hemiGround,
    hemiIntensity: at.hemiInt,
    light: at.centerInt,
  };

  const interactables: Interactable[] = [
    { pos: bonfirePos.clone(), radius: 2.2, kind: 'bonfire', object: fireGroup },
    { pos: shrinePos.clone(), radius: 2.4, kind: 'shrine', object: shrineGroup },
    { pos: new THREE.Vector3(0, 0, -size + 3.5), radius: 2.0, kind: 'bossDoor', object: doorGroup },
    // M5: ladders — E climbs between ground and the gallery
    ...rg.ladders.map((lp, i) => ({
      pos: new THREE.Vector3(lp.x, 0, lp.z), radius: 1.6, kind: 'ladder' as const, object: ladderObjs[i],
    })),
  ];

  const propLayoutArr = propLayout(zoneIndex);
  return {
    root,
    interactables,
    bonfire: bonfirePos.clone(),
    shrine: shrinePos.clone(),
    bossDoor: new THREE.Vector3(0, 0, -size + 3.5),
    spawn: new THREE.Vector3(-size + 6, 0, -size + 6),
    boss: new THREE.Vector3(0, 0.35, -size + 8),
    pillars,
    propColliders: propLayoutArr.filter((p) => p.r > 0).map((p) => ({ x: p.x, z: p.z, r: p.r * p.scale })),
    dynamic: { fire: fireLight, torches: torchLights, braziers: brazierLights, shrine: shrineLight, door: doorLight, center: centerLight },
    vertical,
    ambient,
  };
}
