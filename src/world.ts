// POOP SOULS — zone/arena builder. Deterministic layout, primitive floor/walls
// + per-zone Blender prop kits (kit-<zone>.glb) scattered deterministically.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ZONES } from './data';

export interface Interactable {
  pos: THREE.Vector3;
  radius: number;
  kind: 'bonfire' | 'shrine' | 'bossDoor';
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
  ambient: {
    fog: number; fogNear: number; fogFar: number; background: number;
    hemiSky: number; hemiGround: number; hemiIntensity: number; light: number;
  };
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
  const rand = mulberry32(777 + zoneIndex * 131);
  const out: PropSpawn[] = [];
  // keep props off the key functional anchors
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
  root.add(floor);

  // ---------------- walls ----------------
  const wallMat = new THREE.MeshStandardMaterial({ color: zone.wall, emissive: zone.wall, emissiveIntensity: 0.15 });
  const wallH = 5, wallT = 0.6;
  const mkWall = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    m.position.set(x, wallH / 2, z);
    root.add(m);
  };
  mkWall(size * 2 + wallT * 2, wallT, 0, -size); // north (boss)
  mkWall(size * 2 + wallT * 2, wallT, 0, size); // south
  mkWall(wallT, size * 2, -size, 0); // west
  mkWall(wallT, size * 2, size, 0); // east

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
    root.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 1.0), capMat);
    cap.position.set(p.x, 5, p.z);
    root.add(cap);
  }

  // ---------------- lighting ----------------
  const hemiSky = lightened(zone.fog, 0.4);
  const hemiGround = darkened(zone.floor, 0.3);
  const hemi = new THREE.HemisphereLight(hemiSky, hemiGround, 0.9);
  root.add(hemi);
  const centerLight = new THREE.PointLight(zone.accent, 12, 34, 2);
  centerLight.position.set(0, 7, -size / 2);
  root.add(centerLight);

  // torches: 4 sconces, 2 with point lights
  const flameMat = new THREE.MeshBasicMaterial({ color: zone.accent });
  const sconceMat = new THREE.MeshStandardMaterial({ color: darkened(zone.wall, 0.4) });
  const torchPos: { x: number; z: number; ly: boolean }[] = [
    { x: -size + 0.4, z: -size / 2, ly: true },
    { x: size - 0.4, z: -size / 2, ly: true },
    { x: -size / 2, z: size - 0.4, ly: false },
    { x: size / 2, z: size - 0.4, ly: false },
  ];
  for (const tp of torchPos) {
    const g = new THREE.Group();
    const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), sconceMat);
    sconce.position.y = 2.2;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), flameMat);
    flame.position.y = 2.55;
    g.add(sconce, flame);
    g.position.set(tp.x, 0, tp.z);
    root.add(g);
    if (tp.ly) {
      const pl = new THREE.PointLight(zone.accent, 6, 12, 2);
      pl.position.set(tp.x, 2.5, tp.z);
      root.add(pl);
    }
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
  const fireLight = new THREE.PointLight(0xff9030, 10, 14, 2);
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
  lintel.position.set(0, 5, 0);
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
  root.add(doorGroup);

  // ---------------- boss platform ----------------
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3.2, 0.3, 20),
    new THREE.MeshStandardMaterial({ color: lightened(zone.floor, 0.15), roughness: 0.9 }),
  );
  platform.position.set(0, 0.15, -size + 8);
  root.add(platform);
  // floor plates around the platform
  const plateMat = new THREE.MeshStandardMaterial({ color: lightened(zone.floor, 0.08), roughness: 0.95 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.4), plateMat);
    plate.position.set(Math.cos(a) * 4.6, 0.06, -size + 8 + Math.sin(a) * 4.6);
    root.add(plate);
  }

  // ---------------- ambient ----------------
  const ambient = {
    fog: zone.fog,
    fogNear: zone.fogNear,
    fogFar: zone.fogFar,
    background: darkened(zone.fog, 0.4),
    hemiSky,
    hemiGround,
    hemiIntensity: 0.9,
    light: 12,
  };

  const interactables: Interactable[] = [
    { pos: bonfirePos.clone(), radius: 2.2, kind: 'bonfire', object: fireGroup },
    { pos: shrinePos.clone(), radius: 2.4, kind: 'shrine', object: shrineGroup },
    { pos: new THREE.Vector3(0, 0, -size + 3.5), radius: 2.0, kind: 'bossDoor', object: doorGroup },
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
    ambient,
  };
}
