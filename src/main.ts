// POOP SOULS — game spine: input, camera, player, combat, mobs, bosses, progression, shrine, save.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SFX } from './audio';
import { WEAPONS, MOBS, BOSSES, ZONES } from './data';
import {
  MobDef, BossDef, SaveData, SAVE_KEY,
  MAX_TIER, STAT_MAX, hpFor, staminaFor, dmgFor, blockFor, statCost, tierBonus, gritForTier,
  PARRY_WINDOW, DODGE_IFRAMES, DODGE_CD, BACKSTAB_MULT, HITSTUN, PLAYER_HITSTUN,
  FLASK_HEAL_FRAC, FLASK_TIME, FLASK_MAX_CAP,
} from './types';
import { buildZone, ZoneBuild } from './world';

declare global {
  interface Window { __game: Record<string, unknown> }
}

// ============================== state ==============================
type Mode = 'title' | 'play' | 'shrine' | 'over' | 'win';

interface Attack { combo: number; t: number; dur: number; hitDone: boolean; }
interface Mob {
  def: MobDef; group: THREE.Group; mat: THREE.MeshStandardMaterial; mats: THREE.MeshStandardMaterial[];
  hp: number; home: THREE.Vector3; cd: number; telegraph: number; telegraphTotal: number;
  hitstun: number; phase: number; aggroed: boolean; dead: boolean; hasSplit: boolean; baseY: number;
  stunFrom: THREE.Vector3 | null;
}
interface Boss {
  def: BossDef; group: THREE.Group; mat: THREE.MeshStandardMaterial; hp: number;
  state: 'idle' | 'windup'; cds: Record<string, number>; current: string; telegraph: number;
  hitstop: number; idle: number; charge: { dir: THREE.Vector3; t: number; dmg: number } | null;
  lunge: { dir: THREE.Vector3; t: number } | null; targetPos: THREE.Vector3 | null;
  baseY: number; phase: number;
  // Blender GLB (optional — null mixer = procedural fallback)
  mats: THREE.MeshStandardMaterial[];
  mixer: THREE.AnimationMixer | null;
  actions: Record<string, THREE.AnimationAction>;
  curAnim: string;
  clipUntil: number; // G.time at which the current one-shot attack clip ends
}
interface Particle { obj: THREE.Mesh; vel: THREE.Vector3; life: number; max: number; grav: number; }
interface Proj { obj: THREE.Mesh; dir: THREE.Vector3; speed: number; life: number; dmg: number; radius: number; }
interface Hazard { obj: THREE.Object3D; pos: THREE.Vector3; r: number; life: number; dmg: number; tick: number; kind: 'cloud' | 'wall'; rot: number; }
interface Orb { obj: THREE.Mesh; pos: THREE.Vector3; souls: number; }
interface GritDrop { obj: THREE.Mesh; pos: THREE.Vector3; n: number; }

function defaultSave(): SaveData {
  return { level: 1, stats: { v: 1, e: 1, s: 1, c: 1 }, souls: 0, grit: 0, weaponTiers: [0, 0, 0, 0], zone: 0, bossesDefeated: [false, false, false], flaskCharges: 1, flaskMax: 1 };
}

const G = {
  mode: 'title' as Mode,
  save: defaultSave(),
  zone: 0,
  zoneBuild: null as ZoneBuild | null,
  // player
  pos: new THREE.Vector3(),
  yaw: 0,
  hp: 1, stamina: 1,
  atk: null as Attack | null,
  lastCombo: 1,
  lastHitT: -9,
  blockHeld: false, blockStart: -9,
  dodging: 0, dodgeCd: 0, dodgeDir: new THREE.Vector3(0, 0, 1),
  iframes: 0, hitstun: 0, hurtFlash: 0, blockChipT: 0,
  weaponIdx: 0,
  // world
  mobs: [] as Mob[],
  boss: null as Boss | null,
  bossActive: false, bossIntro: 0,
  projectiles: [] as Proj[],
  hazards: [] as Hazard[],
  parts: [] as Particle[],
  orb: null as Orb | null,
  gritDrops: [] as GritDrop[],
  // meta
  time: 0, runT: 0, kills: 0, deaths: 0, soulsEarned: 0,
  camYaw: 0.8, camPitch: 0.42, camYawT: 0.8, camPitchT: 0.42, camDist: 7, camDistT: 7,
  cinematic: false,
  flaskDrinking: 0, // seconds of drinking left
  locked: null as (Mob | Boss) | null,
  animPhase: 0,
  moveAmt: 0,
};

const hpMax = () => hpFor(G.save.stats.v);
const stMax = () => staminaFor(G.save.stats.e);
const levelOf = () => (G.save.stats.v - 1) + (G.save.stats.e - 1) + (G.save.stats.s - 1) + (G.save.stats.c - 1) + 1;

// ============================== dom ==============================
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const canvas = $('gameCanvas') as HTMLCanvasElement ?? document.createElement('canvas');
const elHp = $('hpBar').firstElementChild as HTMLElement;
const elHpVal = $('hpVal');
const elSt = $('stBar').firstElementChild as HTMLElement;
const elStVal = $('stVal');
const elLvl = $('lvlVal');
const elSouls = $('soulsVal');
const elGrit = $('gritVal');
const elFlask = $('flaskVal');
const elWeapon = $('weaponName');
const elZone = $('zoneName');
const elBossWrap = $('bossWrap');
const elBossName = $('bossName');
const elBossBar = $('bossBar').firstElementChild as HTMLElement;
const elBossSub = $('bossSub');
const elInteract = $('interact');
const elHint = $('hint');
const elToast = $('toast');
const elHud = $('hud');
const elHudRight = $('hudRight');
const panelTitle = $('panelTitle');
const panelShrine = $('panelShrine');
const panelOver = $('panelOver');
const panelWin = $('panelWin');

let toastTimer = 0;
function toast(text: string, dur = 1.8) {
  elToast.textContent = text;
  elToast.style.opacity = '1';
  toastTimer = dur;
}

// ============================== three setup ==============================
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101318);
scene.fog = new THREE.Fog(0x101318, 8, 40);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
const hemi = new THREE.HemisphereLight(0xffffff, 0x333344, 0.9);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xfff0e0, 0.5);
keyLight.position.set(6, 10, 4);
scene.add(keyLight);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================== player model ==============================
const player = new THREE.Group();
const bodyRoot = new THREE.Group();
player.add(bodyRoot);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a6a8a, roughness: 0.6 });
const legL = new THREE.Group();
const legR = new THREE.Group();
const armL = new THREE.Group();
const armR = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 10), bodyMat);
  body.position.y = 0.78;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd8b89a, roughness: 0.7 }));
  head.position.y = 1.45;
  const eyeGeo = new THREE.SphereGeometry(0.035, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.08, 1.48, 0.18);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.08, 1.48, 0.18);
  // limbs — pivots at hip/shoulder so the walk cycle can swing them
  const legGeo = new THREE.CapsuleGeometry(0.1, 0.42, 4, 8);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x37516b, roughness: 0.7 });
  const mkLeg = (pivot: THREE.Group, sx: number) => {
    const m = new THREE.Mesh(legGeo, legMat); m.position.y = -0.31;
    pivot.add(m); pivot.position.set(0.13 * sx, 0.55, 0); bodyRoot.add(pivot);
  };
  mkLeg(legL, -1); mkLeg(legR, 1);
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.34, 4, 8);
  const armMat = new THREE.MeshStandardMaterial({ color: 0x5a7a9a, roughness: 0.7 });
  const mkArm = (pivot: THREE.Group, sx: number) => {
    const m = new THREE.Mesh(armGeo, armMat); m.position.y = -0.27;
    pivot.add(m); pivot.position.set(0.34 * sx, 1.06, 0); bodyRoot.add(pivot);
  };
  mkArm(armL, -1); mkArm(armR, 1);
  bodyRoot.add(body, head, eyeL, eyeR);
}
const weaponPivot = new THREE.Group();
weaponPivot.position.set(0.02, -0.34, 0.16); // right hand (fallback)
armR.add(weaponPivot);
scene.add(player);

// ---------------- GLB character (Blender-rigged, 8 clips) ----------------
let mixer: THREE.AnimationMixer | null = null;
let actions: Record<string, THREE.AnimationAction> = {};
let currentAnim = '';
let lastAtkSeq = 0;
let atkSeq = 0;
let modelLoaded = false;
const tintMats: THREE.MeshStandardMaterial[] = [];
function setAnim(name: string, loop = false, speed = 1, restart = false) {
  if (!mixer || !actions[name]) return;
  const next = actions[name];
  if (name === currentAnim) {
    next.timeScale = speed;
    if (restart) { next.reset(); next.paused = false; }
    return;
  }
  next.reset();
  next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  next.timeScale = speed;
  next.clampWhenFinished = true;
  next.play();
  if (currentAnim && actions[currentAnim] !== next) actions[currentAnim].crossFadeTo(next, 0.12, false);
  currentAnim = name;
}
new GLTFLoader().load('model.glb', (gltf) => {
  modelLoaded = true;
  const root = gltf.scene;
  // rig faces +Z in glTF space (visor at +Z) — the game's yaw=0 also faces +Z, no flip needed
  bodyRoot.clear();
  bodyRoot.add(root);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat && mat.emissive && !tintMats.includes(mat)) {
        mat.userData.baseEmissive = mat.emissive.clone();
        mat.userData.baseIntensity = mat.emissiveIntensity;
        tintMats.push(mat);
      }
    }
  });
  // The rig's hand-bone local frames are Blender-convention (local -Y ≈ world up),
  // so parent-held items must be re-aimed into the player's world frame:
  // pivot world orientation = player world orientation -> local +Y up, +Z forward.
  player.updateWorldMatrix(true, true);
  const qHand = new THREE.Quaternion(), qPlayer = new THREE.Quaternion();
  const aimAtPlayer = (obj: THREE.Object3D, parent: THREE.Object3D) => {
    parent.getWorldQuaternion(qHand);
    player.getWorldQuaternion(qPlayer);
    obj.quaternion.copy(qHand).invert().multiply(qPlayer);
  };
  const findBone = (names: string[]) => { for (const n of names) { const b = root.getObjectByName(n); if (b) return b; } return null; };
  const hand = findBone(['Hand.R', 'HandR']);
  if (hand) {
    weaponPivot.removeFromParent();
    weaponPivot.position.set(0, 0, 0.02);
    aimAtPlayer(weaponPivot, hand);
    weaponPivot.scale.setScalar(1.5); // readable at third-person distance
    hand.add(weaponPivot);
  }
  // off-hand: porcelain toilet-lid shield (equipment to wear)
  const handL = findBone(['Hand.L', 'HandL']);
  if (handL) {
    const shMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.35, metalness: 0.1 });
    const shieldRoot = new THREE.Group();
    shieldRoot.position.set(-0.02, -0.02, 0.04);
    aimAtPlayer(shieldRoot, handL);
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 14), shMat);
    shield.rotation.x = Math.PI / 2; // face normal -> +Z (player forward)
    shield.position.set(0, 0, 0);
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 8), shMat);
    boss.rotation.x = Math.PI / 2;
    boss.position.set(0, 0, 0.055);
    shieldRoot.add(shield, boss);
    handL.add(shieldRoot);
    shield.castShadow = true;
    tintMats.push(shMat);
  }
  mixer = new THREE.AnimationMixer(root);
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  currentAnim = '';
  setAnim('Idle', true);
}, undefined, (err) => console.warn('model.glb failed, procedural fallback', err));

function buildWeaponMesh(idx: number): THREE.Group {
  const w = WEAPONS[idx];
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 });
  if (w.id === 'brush') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.7, 8), wood);
    handle.position.y = 0.35;
    const bristles = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.15, 10), new THREE.MeshStandardMaterial({ color: 0x9fb8c8 }));
    bristles.position.y = 0.78;
    g.add(handle, bristles);
  } else if (w.id === 'seat') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.12, 10, 18), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, emissive: 0x2a2a20 }));
    ring.position.y = 0.8;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 6), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6 }));
    spike.position.set(0.36, 0.8, 0); spike.rotation.z = -Math.PI / 2;
    g.add(ring, spike);
  } else if (w.id === 'trowel') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.55, 8), wood);
    handle.position.y = 0.3;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.42), new THREE.MeshStandardMaterial({ color: 0xc8a05a, metalness: 0.5, roughness: 0.4 }));
    blade.position.y = 0.66;
    g.add(handle, blade);
  } else {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.8, 8), wood);
    handle.position.y = 0.4;
    const cup = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.18, 12), new THREE.MeshStandardMaterial({ color: 0xb0483a, roughness: 0.5 }));
    cup.position.y = 0.86; cup.rotation.x = Math.PI;
    g.add(handle, cup);
  }
  return g;
}
function setWeaponMesh() {
  weaponPivot.clear();
  weaponPivot.add(buildWeaponMesh(G.weaponIdx));
}
setWeaponMesh();

// ============================== zone load ==============================
function clearZoneEntities() {
  for (const m of G.mobs) scene.remove(m.group);
  G.mobs = [];
  if (G.boss) { scene.remove(G.boss.group); G.boss = null; }
  G.bossActive = false; G.bossIntro = 0;
  for (const p of G.projectiles) scene.remove(p.obj);
  G.projectiles = [];
  for (const h of G.hazards) scene.remove(h.obj);
  G.hazards = [];
  for (const p of G.parts) scene.remove(p.obj);
  G.parts = [];
  if (G.orb) { scene.remove(G.orb.obj); G.orb = null; }
  for (const d of G.gritDrops) scene.remove(d.obj);
  G.gritDrops = [];
}

function loadZone(i: number) {
  G.zone = i; G.save.zone = i;
  if (G.zoneBuild) scene.remove(G.zoneBuild.root);
  clearZoneEntities();
  const zb = buildZone(i);
  G.zoneBuild = zb;
  scene.add(zb.root);
  const a = zb.ambient;
  scene.fog = new THREE.Fog(a.fog, a.fogNear, a.fogFar);
  (scene.background as THREE.Color).setHex(a.background);
  hemi.color.setHex(a.hemiSky);
  hemi.groundColor.setHex(a.hemiGround);
  hemi.intensity = a.hemiIntensity;
  // spawn mobs
  const zd = ZONES[i];
  const n = zd.mobs.length;
  for (let k = 0; k < n; k++) {
    const def = MOBS[zd.mobs[k]];
    const ang = (k / n) * Math.PI * 2 + 0.5;
    const r = zd.size * 0.5 + (k % 3) * 2;
    const pos = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r - zd.size * 0.2);
    spawnMob(def, pos);
  }
  G.pos = zb.spawn.clone();
  const toCenter = new THREE.Vector3(0, 0, 0).sub(G.pos);
  G.yaw = Math.atan2(toCenter.x, toCenter.z);
  G.camYaw = G.camYawT = G.yaw; G.camPitch = G.camPitchT = 0.42; G.camDist = G.camDistT = 7;
  G.hp = hpMax(); G.stamina = stMax();
  G.atk = null; G.blockHeld = false; G.dodging = 0; G.hitstun = 0; G.iframes = 0;
  elZone.textContent = ZONES[G.zone].name;
  save();
}

// ============================== mobs ==============================
function makeMobGroup(def: MobDef): { group: THREE.Group; mat: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 });
  let body: THREE.Mesh;
  if (def.kind === 'tank') {
    body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.1, 12), mat);
    body.position.y = 0.55;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    top.position.y = 1.05;
    g.add(top);
  } else if (def.kind === 'ranged') {
    mat.transparent = true; mat.opacity = 0.75;
    body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat);
    body.position.y = 0.5;
  } else if (def.kind === 'slime') {
    mat.transparent = true; mat.opacity = 0.9;
    body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat);
    body.scale.y = 0.75;
    body.position.y = 0.35;
  } else {
    body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.4, 4, 8), mat);
    body.position.y = 0.5;
  }
  g.add(body);
  // eyes: higher on the front for tanks, standard for the rest
  const eyeY = def.kind === 'tank' ? 1.18 : 0.72;
  const eyeZ = def.kind === 'tank' ? 0.42 : 0.3;
  const eyeGeo = new THREE.SphereGeometry(0.05, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x141414 });
  const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.12, eyeY, eyeZ);
  const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set(0.12, eyeY, eyeZ);
  g.add(eL, eR);
  g.scale.setScalar(def.scale);
  return { group: g, mat };
}

function spawnMob(def: MobDef, pos: THREE.Vector3): Mob {
  const { group, mat } = makeMobGroup(def);
  group.position.copy(pos);
  scene.add(group);
  const m: Mob = {
    def, group, mat, mats: [mat], hp: def.hp, home: pos.clone(), cd: 0.5 + Math.random() * 1.5,
    telegraph: 0, telegraphTotal: 1, hitstun: 0, phase: Math.random() * 6.28,
    aggroed: false, dead: false, hasSplit: false, baseY: 0, stunFrom: null,
  };
  G.mobs.push(m);
  // GLB swap (async, cached). Root stays UNIT scale — the group carries def.scale
  // + the squash/stretch from updateMobs. Ground-normalized so the base sits at
  // the group origin. Materials are cloned per mob so each instance flashes
  // its own telegraph independently of other same-type mobs.
  if (def.glb) {
    loadCharacterGltf('mob:' + def.id, def.glb).then(() => {
      if (m.dead) return;
      const glt = charGlts['mob:' + def.id];
      if (!glt) return;
      const root = glt.scene.clone(true);
      root.position.set(0, 0, 0); root.scale.setScalar(1);
      scene.add(root); root.updateMatrixWorld(true);
      const gMin = new THREE.Box3().setFromObject(root).min.y;
      scene.remove(root);
      m.group.clear();
      m.group.add(root);
      root.position.y = -gMin;
      const mats: THREE.MeshStandardMaterial[] = [];
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          const src = mesh.material as THREE.Material;
          const nm = (src as THREE.MeshStandardMaterial).clone();
          mesh.material = nm;
          if (nm.emissive && !mats.includes(nm)) {
            nm.userData.baseEmissive = nm.emissive.clone();
            nm.userData.baseIntensity = nm.emissiveIntensity;
            mats.push(nm);
          }
        }
      });
      m.mats = mats.length ? mats : m.mats;
      m.mat = m.mats[0];
    });
  }
  return m;
}

function killMob(m: Mob) {
  m.dead = true;
  scene.remove(m.group);
  burst(m.group.position, m.def.color, 18, 4, 0.7, 0.1);
  SFX.hitEnemy();
  G.kills++;
  if (m.def.id !== 'gloop_small') dropSouls(m.group.position, m.def.souls);
  else dropSouls(m.group.position, m.def.souls);
  if (m.def.id === 'clog') dropGrit(m.group.position, 1);
  // gloop splits once
  if (m.def.id === 'gloop' && !m.hasSplit && G.zone >= 1) {
    for (let i = 0; i < 2; i++) {
      const small = MOBS['gloop_small'];
      const off = new THREE.Vector3(i === 0 ? -0.5 : 0.5, 0, 0);
      spawnMob(small, m.group.position.clone().add(off));
    }
  }
}

function updateMobs(dt: number) {
  const size = ZONES[G.zone].size;
  for (let i = G.mobs.length - 1; i >= 0; i--) {
    const m = G.mobs[i];
    if (m.dead) { G.mobs.splice(i, 1); continue; }
    const dx = G.pos.x - m.group.position.x;
    const dz = G.pos.z - m.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (m.hitstun > 0) {
      if (!m.stunFrom) m.stunFrom = m.group.position.clone();
      m.hitstun -= dt;
      const f = 1 - m.hitstun / HITSTUN;
      // flinch: kick away from player + stagger spin, springs back to where it stood
      const away = m.group.position.clone().sub(G.pos).setY(0).normalize();
      m.group.position.copy(m.stunFrom.clone().addScaledVector(away, Math.sin(Math.PI * f) * 0.55));
      m.group.rotation.y += dt * 6;
      if (m.hitstun <= 0) m.stunFrom = null;
      continue;
    }
    // aggro latch
    if (!m.aggroed && dist < m.def.aggro) m.aggroed = true;
    if (!m.aggroed) {
      // idle wobble at home
      m.group.position.x = m.home.x + Math.sin(G.time * 0.8 + m.phase) * 0.4;
      m.group.position.z = m.home.z + Math.cos(G.time * 0.6 + m.phase) * 0.4;
      continue;
    }
    // face player
    m.group.rotation.y = Math.atan2(dx, dz);
    // telegraph / attack
    if (m.telegraph > 0) {
      m.telegraph -= dt;
      const f = 1 - m.telegraph / m.telegraphTotal;
      for (const matx of m.mats) { matx.emissive.setHex(0xff4444); matx.emissiveIntensity = 0.2 + f * 0.9; }
      if (m.telegraph <= 0) {
        for (const matx of m.mats) matx.emissiveIntensity = 0;
        m.cd = m.def.attackCd;
        if (m.def.kind === 'ranged') {
          if (dist < m.def.attackRange * 1.25) {
            const dir = new THREE.Vector3(dx, 0, dz).normalize();
            spawnProj(m.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), dir, 6.5, m.def.damage, 0x9adf5a, 0.42);
          }
        } else if (dist < m.def.attackRange * 1.15) {
          damagePlayer(m.def.damage, true);
        }
      }
    } else {
      for (const matx of m.mats) matx.emissiveIntensity = 0;
      m.cd -= dt;
      const isRanged = m.def.kind === 'ranged';
      const keep = isRanged ? m.def.attackRange * 0.7 : m.def.attackRange * 0.8;
      if (dist > keep) {
        // chase with wobble
        const wob = Math.sin(G.time * 3 + m.phase) * 0.3;
        const dirX = dx / (dist || 1), dirZ = dz / (dist || 1);
        const px = -dirZ * wob, pz = dirX * wob;
        m.group.position.x += (dirX + px) * m.def.speed * dt;
        m.group.position.z += (dirZ + pz) * m.def.speed * dt;
      }
      if (m.cd <= 0 && dist < m.def.attackRange && m.telegraph <= 0) {
        m.telegraph = m.def.telegraph;
        m.telegraphTotal = m.def.telegraph;
      }
    }
    // idle wobble / breathing anim — squash & stretch per creature type
    const t = G.time * 6 + m.phase;
    if (m.def.kind === 'slime' || m.def.kind === 'ranged') {
      m.group.scale.x = m.def.scale * (1 - Math.sin(t) * 0.07);
      m.group.scale.z = m.def.scale * (1 - Math.sin(t) * 0.07);
      m.group.scale.y = m.def.scale * (1 + Math.sin(t) * 0.12);
    } else {
      // walkers: body bob + weight shift
      m.group.position.y = Math.abs(Math.sin(t)) * 0.07;
      m.group.rotation.z = Math.sin(t * 0.5) * 0.04;
      m.group.scale.setScalar(m.def.scale);
    }
    // arena clamp
    m.group.position.x = THREE.MathUtils.clamp(m.group.position.x, -size + 1, size - 1);
    m.group.position.z = THREE.MathUtils.clamp(m.group.position.z, -size + 1, size - 1);
  }
}

// ============================== projectiles & hazards ==============================
function spawnProj(pos: THREE.Vector3, dir: THREE.Vector3, speed: number, dmg: number, color: number, radius: number) {
  const obj = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  obj.position.copy(pos);
  scene.add(obj);
  G.projectiles.push({ obj, dir: dir.clone().normalize(), speed, life: 4, dmg, radius });
}

function spawnCloud(pos: THREE.Vector3, r: number, life: number, dmg: number) {
  const obj = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), new THREE.MeshBasicMaterial({ color: 0x7ab04a, transparent: true, opacity: 0.3 }));
  obj.position.copy(pos).add(new THREE.Vector3(0, r * 0.5, 0));
  scene.add(obj);
  G.hazards.push({ obj, pos: pos.clone(), r, life, dmg, tick: 0, kind: 'cloud', rot: 0 });
}

function spawnWall(pos: THREE.Vector3, rot: number, life: number, dmg: number) {
  const obj = new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 1.2), new THREE.MeshBasicMaterial({ color: 0x8a5a3a, transparent: true, opacity: 0.8 }));
  obj.position.copy(pos).add(new THREE.Vector3(0, 1.3, 0));
  obj.rotation.y = rot;
  scene.add(obj);
  G.hazards.push({ obj, pos: pos.clone(), r: 4, life, dmg, tick: 0, kind: 'wall', rot });
}

function updateProjectiles(dt: number) {
  const size = ZONES[G.zone].size;
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    p.obj.position.addScaledVector(p.dir, p.speed * dt);
    p.life -= dt;
    const d = p.obj.position.distanceTo(G.pos.clone().setY(p.obj.position.y));
    let dead = p.life <= 0 || Math.abs(p.obj.position.x) > size - 0.4 || Math.abs(p.obj.position.z) > size - 0.4;
    if (d < p.radius + 0.5) { damagePlayer(p.dmg, false); dead = true; }
    if (dead) { scene.remove(p.obj); G.projectiles.splice(i, 1); }
  }
}

function updateHazards(dt: number) {
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i];
    h.life -= dt;
    h.tick -= dt;
    const mat = (h.obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
    mat.opacity = Math.min(0.85, h.life * 0.5);
    let hit = false;
    if (h.kind === 'cloud') {
      hit = G.pos.distanceTo(h.pos) < h.r + 0.4;
    } else {
      const dx = G.pos.x - h.pos.x, dz = G.pos.z - h.pos.z;
      const cos = Math.cos(-h.rot), sin = Math.sin(-h.rot);
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      hit = Math.abs(lx) < 4.2 && Math.abs(lz) < 0.9;
    }
    if (hit && h.tick <= 0) { damagePlayer(h.dmg, false); h.tick = 0.8; }
    if (h.life <= 0) { scene.remove(h.obj); G.hazards.splice(i, 1); }
  }
}

// ============================== particles ==============================
function burst(pos: THREE.Vector3, color: number, n: number, speed = 4, life = 0.6, size = 0.09, grav = 7) {
  for (let i = 0; i < n; i++) {
    const obj = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 5), new THREE.MeshBasicMaterial({ color, transparent: true }));
    obj.position.copy(pos);
    scene.add(obj);
    const vel = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5)).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
    G.parts.push({ obj, vel, life: life * (0.6 + Math.random() * 0.6), max: life, grav });
  }
}
function updateParticles(dt: number) {
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.life -= dt;
    p.vel.y -= p.grav * dt;
    p.obj.position.addScaledVector(p.vel, dt);
    if (p.obj.position.y < 0.05) { p.obj.position.y = 0.05; p.vel.y *= -0.4; p.vel.x *= 0.8; p.vel.z *= 0.8; }
    (p.obj.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.max);
    if (p.life <= 0) { scene.remove(p.obj); G.parts.splice(i, 1); }
  }
}

// ============================== souls & grit ==============================
function makeOrbMesh(): THREE.Mesh {
  const obj = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7fb8ff, transparent: true, opacity: 0.95 }));
  scene.add(obj);
  return obj;
}
function dropSouls(pos: THREE.Vector3, souls: number) {
  if (G.orb) { G.orb.souls += souls; }
  else {
    const obj = makeOrbMesh();
    G.orb = { obj, pos: pos.clone().setY(0.4), souls };
  }
}
function makeGritMesh(): THREE.Mesh {
  const obj = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: 0xd8a24a }));
  scene.add(obj);
  return obj;
}
function dropGrit(pos: THREE.Vector3, n: number) {
  const obj = makeGritMesh();
  obj.position.copy(pos).setY(0.5);
  G.gritDrops.push({ obj, pos: pos.clone().setY(0.5), n });
}
function updateDrops(dt: number) {
  if (G.orb) {
    G.orb.obj.position.y = G.orb.pos.y + Math.sin(G.time * 3) * 0.12;
    G.orb.obj.position.x = G.orb.pos.x;
    G.orb.obj.position.z = G.orb.pos.z;
    if ((G.mode === 'play' || G.mode === 'shrine') && G.pos.distanceTo(G.orb.pos) < 1.3) {
      G.save.souls += G.orb.souls;
      G.soulsEarned += G.orb.souls;
      burst(G.orb.pos, 0x7fb8ff, 14, 3, 0.5, 0.07);
      SFX.soulPickup();
      toast(`+${G.orb.souls} SOULS`);
      scene.remove(G.orb.obj);
      G.orb = null;
      save();
    }
  }
  for (let i = G.gritDrops.length - 1; i >= 0; i--) {
    const d = G.gritDrops[i];
    d.obj.rotation.y += dt * 3;
    d.obj.position.y = d.pos.y + Math.sin(G.time * 2.5 + i) * 0.1;
    if ((G.mode === 'play' || G.mode === 'shrine') && G.pos.distanceTo(d.pos) < 1.3) {
      G.save.grit += d.n;
      burst(d.pos, 0xd8a24a, 10, 3, 0.5, 0.06);
      SFX.soulPickup();
      toast(`+${d.n} GRIT`);
      scene.remove(d.obj);
      G.gritDrops.splice(i, 1);
      save();
    }
  }
}

// ============================== combat: player ==============================
const facing = () => new THREE.Vector3(Math.sin(G.yaw), 0, Math.cos(G.yaw));

// angle-damped turn toward a target yaw (no wrap-around spin)
const dampAngle = (cur: number, target: number, rate: number) => {
  let dy = target - cur;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  return cur + dy * Math.min(1, rate);
};

// nearest lock candidate: mobs + active boss, prefers the camera-forward cone
function pickLockTarget(): Mob | Boss | null {
  const camFwd = new THREE.Vector3(Math.sin(G.camYaw), 0, Math.cos(G.camYaw));
  const cands: (Mob | Boss)[] = [];
  for (const m of G.mobs) if (!m.dead) cands.push(m);
  if (G.boss && G.bossActive && G.bossIntro <= 0) cands.push(G.boss);
  let best: (Mob | Boss) | null = null;
  let bestScore = -Infinity;
  for (const t of cands) {
    const to = t.group.position.clone().sub(G.pos);
    const d = to.length();
    if (d > 16) continue;
    const ang = Math.acos(THREE.MathUtils.clamp(to.normalize().dot(camFwd), -1, 1));
    const score = (ang < 1.3 ? 1000 : 0) - d;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

// aim assist (no F lock): nearest target that the current swing would plausibly hit
function aimAssistTarget(range: number): Mob | Boss | null {
  const dir = facing();
  const cands: (Mob | Boss)[] = [];
  for (const m of G.mobs) if (!m.dead) cands.push(m);
  if (G.boss && G.bossActive && G.bossIntro <= 0) cands.push(G.boss);
  let best: (Mob | Boss) | null = null;
  let bestD = Infinity;
  for (const t of cands) {
    const to = t.group.position.clone().sub(G.pos);
    const d = to.length();
    if (d > range * 1.6) continue;
    const ang = Math.acos(THREE.MathUtils.clamp(to.normalize().dot(dir), -1, 1));
    if (ang < 1.4 && d < bestD) { bestD = d; best = t; }
  }
  return best;
}

function startAttack() {
  if (G.atk || G.mode !== 'play' || G.hitstun > 0 || G.dodging > 0) return;
  const w = WEAPONS[G.weaponIdx];
  if (G.stamina < w.staminaCost) return;
  G.stamina -= w.staminaCost;
  const sinceLast = G.time - G.lastHitT;
  const combo = sinceLast < 0.9 ? Math.min(3, G.lastCombo + 1) : 1;
  G.atk = { combo, t: 0, dur: 0.5 / w.speed, hitDone: false };
  atkSeq++;
  // aim: locked target > aim-assist nearest target in the swing window > camera forward
  const lk = G.locked;
  if (lk) {
    const to = lk.group.position.clone().sub(G.pos); to.y = 0;
    if (to.lengthSq() > 0.01) G.yaw = Math.atan2(to.x, to.z);
  } else {
    const assist = aimAssistTarget(w.range);
    if (assist) {
      const to = assist.group.position.clone().sub(G.pos); to.y = 0;
      if (to.lengthSq() > 0.01) G.yaw = Math.atan2(to.x, to.z);
    } else if (document.pointerLockElement === canvas) {
      G.yaw = Math.atan2(Math.sin(G.camYaw), Math.cos(G.camYaw));
    }
  }
  SFX.swing(combo === 3);
}

function doPlayerHit() {
  const w = WEAPONS[G.weaponIdx];
  const tier = G.save.weaponTiers[G.weaponIdx];
  const base = w.damage * (G.atk!.combo === 3 ? w.heavyMult : 1) * tierBonus(tier) * dmgFor(G.save.stats.s);
  const dir = facing();
  const targets: { obj: THREE.Object3D; hp: number; setHp: (n: number) => void; radius: number; isBoss: boolean; behind: boolean }[] = [];
  for (const m of G.mobs) {
    if (m.dead) continue;
    const to = m.group.position.clone().sub(G.pos);
    const d = to.length();
    if (d < w.range + m.def.radius) {
      const ang = Math.acos(THREE.MathUtils.clamp(to.normalize().dot(dir), -1, 1));
      if (ang < w.arc / 2 + m.def.radius) {
        targets.push({ obj: m.group, hp: m.hp, setHp: (n) => { m.hp = n; }, radius: m.def.radius, isBoss: false, behind: to.clone().normalize().dot(dir) < -0.4 });
      }
    }
  }
  if (G.boss && G.bossActive && G.bossIntro <= 0) {
    const to = G.boss.group.position.clone().sub(G.pos);
    const d = to.length();
    if (d < w.range + G.boss.def.scale * 0.9) {
      const ang = Math.acos(THREE.MathUtils.clamp(to.normalize().dot(dir), -1, 1));
      if (ang < w.arc / 2 + G.boss.def.scale * 0.5) {
        targets.push({ obj: G.boss.group, hp: G.boss.hp, setHp: (n) => { G.boss!.hp = n; }, radius: G.boss.def.scale * 0.6, isBoss: true, behind: to.clone().normalize().dot(dir) < -0.4 });
      }
    }
  }
  for (const t of targets) {
    let dmg = base;
    if (t.behind) { dmg *= BACKSTAB_MULT; toast('BACKSTAB', 0.9); }
    t.setHp(t.hp - dmg);
    const hitPos = (t.obj.position as THREE.Vector3).clone().setY(1);
    burst(hitPos, t.isBoss ? 0xffffff : 0xd8d4c8, 8, 3.5, 0.4, 0.07);
    if (t.isBoss) { SFX.bossHit(); G.boss!.hitstop = 0.12; } else SFX.hitEnemy();
    if (!t.isBoss) {
      const m = G.mobs.find((mm) => mm.group === t.obj);
      if (m) {
        m.hitstun = HITSTUN;
        const kb = hitPos.clone().sub(G.pos).setY(0).normalize().multiplyScalar(1.6);
        m.group.position.add(kb);
        if (m.hp <= 0) killMob(m);
      }
    } else if (G.boss!.hp <= 0) {
      bossDefeated();
    }
  }
  G.lastCombo = G.atk ? G.atk.combo : 1;
  G.lastHitT = G.time;
}

function damagePlayer(raw: number, melee: boolean) {
  if (G.iframes > 0 || G.hitstun > 0 || G.mode !== 'play') return;
  let dmg = raw;
  if (G.blockHeld && melee) {
    const sinceBlock = G.time - G.blockStart;
    if (sinceBlock < PARRY_WINDOW) {
      SFX.parry();
      G.stamina = Math.max(0, G.stamina - 10);
      toast('PARRY', 0.8);
      burst(G.pos.clone().setY(1.2), 0xffffff, 12, 4, 0.4, 0.06);
      // stagger nearest
      for (const m of G.mobs) {
        if (!m.dead && G.pos.distanceTo(m.group.position) < 3.5) { m.hitstun = 0.9; }
      }
      if (G.boss && G.bossActive && G.bossIntro <= 0 && G.pos.distanceTo(G.boss.group.position) < 4.5) G.boss.hitstop = 0.8;
      return;
    }
    const red = blockFor(G.save.stats.c);
    // gate chip damage so continuous contact (charge, wall) doesn't drain at 60fps
    if (G.time - G.blockChipT < 0.45) return;
    G.blockChipT = G.time;
    dmg = raw * (1 - red);
    G.stamina = Math.max(0, G.stamina - raw * 0.5);
    SFX.block();
    if (G.stamina <= 0) { G.hitstun = 0.5; }
  } else {
    G.hitstun = PLAYER_HITSTUN;
    SFX.hitPlayer();
  }
  G.hurtFlash = 0.4;
  G.hp -= dmg;
  if (G.hp <= 0) { G.hp = 0; die(); }
}

function die() {
  SFX.death();
  G.deaths++;
  // drop orb (replace any old orb — those souls are gone, classic)
  if (G.orb) scene.remove(G.orb.obj);
  const obj = makeOrbMesh();
  obj.position.copy(G.pos).setY(0.4);
  G.orb = { obj, pos: G.pos.clone().setY(0.4), souls: G.save.souls };
  G.save.souls = 0;
  burst(G.pos.clone().setY(1), 0x4a6a8a, 24, 4, 0.9, 0.1);
  G.mode = 'over';
  const sub = G.orb.souls > 0 ? `${G.orb.souls} souls dropped at the scene of the crime. Die again before you grab them and they're gone.` : 'No souls to lose. At least something.';
  $('overSub').textContent = sub;
  save();
}

function resurrect() {
  const zb = G.zoneBuild;
  if (!zb) return;
  G.hp = hpMax(); G.stamina = stMax();
  G.pos = zb.bonfire.clone().add(new THREE.Vector3(1.5, 0, 1.5));
  G.hitstun = 0; G.iframes = 1; G.atk = null; G.dodging = 0;
  G.mode = 'play';
  SFX.bonfire();
  save();
}

function switchWeapon(i: number) {
  if (i < 0 || i >= WEAPONS.length || i === G.weaponIdx) return;
  G.weaponIdx = i;
  setWeaponMesh();
  SFX.equip();
  const w = WEAPONS[i];
  toast(`${w.emoji} ${w.name} +${G.save.weaponTiers[i]}`, 1.2);
}

// ============================== flask (Flask of the First Flush) ==============================
function drinkFlask() {
  if (G.mode !== 'play' || G.hitstun > 0 || G.dodging > 0 || G.flaskDrinking > 0) return;
  if (G.save.flaskCharges <= 0) { toast('EMPTY. GO REST.', 1.1); SFX.ui(); return; }
  if (G.hp >= hpMax()) { toast('ALREADY FULL. WASTEFUL.', 1.1); SFX.ui(); return; }
  G.flaskDrinking = FLASK_TIME;
  G.blockHeld = false;
  SFX.drink();
}

// ============================== player update ==============================
const keys: Record<string, boolean> = {};
let spaceQueued = false;

function updatePlayer(dt: number) {
  // timers
  G.dodgeCd = Math.max(0, G.dodgeCd - dt);
  G.iframes = Math.max(0, G.iframes - dt);
  G.hurtFlash = Math.max(0, G.hurtFlash - dt);
  G.blockChipT = Math.max(0, G.blockChipT - dt);
  if (G.flaskDrinking > 0) {
    G.flaskDrinking -= dt;
    if (G.flaskDrinking <= 0) {
      G.flaskDrinking = 0;
      G.save.flaskCharges = Math.max(0, G.save.flaskCharges - 1);
      G.hp = Math.min(hpMax(), G.hp + hpMax() * FLASK_HEAL_FRAC);
      burst(G.pos.clone().setY(1.2), 0x6ab8ff, 10, 2.5, 0.5, 0.06);
      toast('THE FIRST FLUSH RESTORES YOU', 1.2);
      save();
    }
  }
  const w = WEAPONS[G.weaponIdx];

  // lock-on (F): validate the sticky lock; F is the only way to (re)acquire
  if (G.locked) {
    const l = G.locked;
    if (l.hp <= 0 || l.group.position.distanceTo(G.pos) > 26) G.locked = null;
  }
  if (G.locked) {
    // aim (and walk) toward the locked target; attacks stay locked
    const to = G.locked.group.position.clone().sub(G.pos);
    if (to.lengthSq() > 0.01) G.yaw = Math.atan2(to.x, to.z);
  }

  let moving = false;
  const mv = new THREE.Vector3();
  if (G.hitstun > 0) {
    G.hitstun -= dt;
  } else if (G.dodging > 0) {
    G.dodging -= dt;
    G.pos.addScaledVector(G.dodgeDir, 9 * dt);
  } else {
    // movement — DARK SOULS STYLE: WASD is camera-relative, character turns to travel
    const cf = new THREE.Vector3(Math.sin(G.camYaw), 0, Math.cos(G.camYaw));
    const cr = new THREE.Vector3(-Math.cos(G.camYaw), 0, Math.sin(G.camYaw)); // screen-right
    if (G.flaskDrinking > 0) {
      // drinking commits you to the spot
    } else {
      if (keys['w']) mv.add(cf);
      if (keys['s']) mv.sub(cf);
      if (keys['d']) mv.add(cr);
      if (keys['a']) mv.sub(cr);
    }
    moving = mv.lengthSq() > 0;
    if (moving) {
      mv.normalize();
      const speed = G.blockHeld ? 2.6 : 5.4;
      G.pos.addScaledVector(mv, speed * dt);
      if (!G.locked) G.yaw = dampAngle(G.yaw, Math.atan2(mv.x, mv.z), 1 - Math.exp(-14 * dt));
    }
    // block
    if (G.blockHeld && G.time - G.blockStart > 0.02) {
      G.stamina = Math.max(0, G.stamina - 10 * dt);
    }
    // dodge
    if (spaceQueued) {
      if (G.dodgeCd <= 0 && G.stamina >= 20) {
        G.dodging = 0.32;
        G.iframes = DODGE_IFRAMES;
        G.dodgeCd = DODGE_CD;
        G.stamina -= 20;
        G.dodgeDir = moving ? mv.clone() : facing().clone();
        SFX.dodge();
      }
    }
    // attack
    if (mouseDown) startAttack();
  }
  spaceQueued = false;
  G.moveAmt = moving ? 1 : 0;
  // stamina regen
  if (!G.blockHeld && !G.atk) G.stamina = Math.min(stMax(), G.stamina + 26 * dt);
  // arena clamp
  const size = ZONES[G.zone].size;
  G.pos.x = THREE.MathUtils.clamp(G.pos.x, -size + 0.8, size - 0.8);
  G.pos.z = THREE.MathUtils.clamp(G.pos.z, -size + 0.8, size - 0.8);
  // pillar collision
  const zb = G.zoneBuild;
  if (zb) {
    for (const p of zb.pillars) {
      const dx = G.pos.x - p.x, dz = G.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const min = 0.7 + 0.45;
      if (d < min && d > 0.001) {
        G.pos.x = p.x + (dx / d) * min;
        G.pos.z = p.z + (dz / d) * min;
      }
    }
  }
  // attack progression (swing visuals live in updateAnim)
  if (G.atk) {
    G.atk.t += dt;
    if (!G.atk.hitDone && G.atk.t / G.atk.dur >= 0.45) {
      G.atk.hitDone = true;
      doPlayerHit();
    }
    if (G.atk.t >= G.atk.dur) G.atk = null;
  }
  // apply transform
  player.position.copy(G.pos);
  player.rotation.y = G.yaw;
  // hurt tint
  bodyMat.emissive.setHex(G.hurtFlash > 0 ? 0xaa2222 : 0x000000);
  bodyMat.emissiveIntensity = G.hurtFlash * 2;
  if (modelLoaded) for (const m of tintMats) {
    m.emissive.setHex(G.hurtFlash > 0 ? 0xaa2222 : 0x000000);
    m.emissiveIntensity = G.hurtFlash * 1.5;
  }
}

// ============================== player animation ==============================
// mixer durations in seconds (30fps source)
const CLIP_DUR: Record<string, number> = { Idle: 2.0, Walk: 1.23, Attack1: 0.8, Attack2: 0.66, Attack3: 0.73, Dodge: 0.66, Block: 1.0, Hit: 0.6 };
function updateAnim(dt: number) {
  if (modelLoaded && mixer) {
    // state -> clip (one-shots restart on each new state entry)
    let name = 'Idle'; let loop = true; let speed = 1;
    if (G.hitstun > 0) { name = 'Hit'; loop = false; }
    else if (G.atk) {
      name = `Attack${G.atk.combo}`; loop = false;
      // weapon speed sets the combat window; the clip plays near-natural (capped) so swings are readable
      speed = Math.min((CLIP_DUR[name] || 0.8) / G.atk.dur, 1.6);
    } else if (G.dodging > 0) { name = 'Dodge'; loop = false; speed = (CLIP_DUR.Dodge || 0.66) / 0.32; }
    else if (G.blockHeld) { name = 'Block'; }
    else if (G.moveAmt > 0) { name = 'Walk'; }
    const restart = !loop && name === currentAnim && (name.startsWith('Attack') ? atkSeq !== lastAtkSeq : false);
    if (restart) lastAtkSeq = atkSeq;
    if (name !== currentAnim || restart || (loop && speed !== 1)) setAnim(name, loop, speed, restart);
    mixer.update(dt);
    return;
  }
  const ph = G.animPhase;
  const swingAmp = 0.85 * (G.moveAmt ? 1 : 0.2);
  // walk cycle (limbs exist on the player only — mobs are blobs)
  legL.rotation.x = Math.sin(ph) * swingAmp;
  legR.rotation.x = Math.sin(ph + Math.PI) * swingAmp;
  armL.rotation.x = Math.sin(ph + Math.PI) * swingAmp * 0.6;
  // weapon arm: walk swing when idle, attack pose overrides.
  // Pose axes: pivot.x = chop (weapon head back-over-front), pivot.z = lateral, armR.x = arm drive.
  if (G.atk) {
    const f = THREE.MathUtils.clamp(G.atk.t / G.atk.dur, 0, 1);
    const c = G.atk.combo;
    const back = 1.0 + c * 0.15; // cock height (over the shoulder)
    const fwd = 1.15 + c * 0.12; // slash drive (down across the body)
    let armX: number, pX: number, pZ: number;
    if (f < 0.3) { // anticipation: wind up over the right shoulder
      const u = f / 0.3; const e = u * u;
      armX = THREE.MathUtils.lerp(0, 0.75, e);
      pX = THREE.MathUtils.lerp(0.1, -back, e);
      pZ = THREE.MathUtils.lerp(-0.2, -0.5, e);
    } else if (f < 0.5) { // the chop: overhead down to the front
      const u = (f - 0.3) / 0.2; const e = u * (2 - u);
      armX = THREE.MathUtils.lerp(0.75, -0.95, e);
      pX = THREE.MathUtils.lerp(-back, fwd, e);
      pZ = THREE.MathUtils.lerp(-0.5, 0.4, e);
    } else { // recovery: ease back to the guard
      const u = (f - 0.5) / 0.5; const e = 1 - (1 - u) * (1 - u);
      armX = THREE.MathUtils.lerp(-0.95, 0, e);
      pX = THREE.MathUtils.lerp(fwd, 0.1, e);
      pZ = THREE.MathUtils.lerp(0.4, -0.2, e);
    }
    armR.rotation.x = armX;
    weaponPivot.rotation.x = pX;
    weaponPivot.rotation.z = pZ;
    bodyRoot.rotation.x = -Math.sin(Math.PI * Math.min(1, f * 1.6)) * 0.18; // lean into the strike
  } else {
    armR.rotation.x = Math.sin(ph) * swingAmp * 0.4;
    weaponPivot.rotation.x = G.blockHeld ? 1.3 : 0.1;
    weaponPivot.rotation.z = G.blockHeld ? -0.4 : -0.25; // guard / rest tilt
    bodyRoot.rotation.x = 0;
  }
  // dodge roll: tuck + spin
  if (G.dodging > 0) {
    const f = 1 - G.dodging / 0.32;
    bodyRoot.rotation.x = -Math.sin(Math.PI * f) * 1.1;
    bodyRoot.position.y = Math.sin(Math.PI * f) * 0.22;
  } else {
    bodyRoot.rotation.x = THREE.MathUtils.lerp(bodyRoot.rotation.x, 0, 1 - Math.exp(-12 * dt));
    bodyRoot.position.y = THREE.MathUtils.lerp(bodyRoot.position.y, 0, 1 - Math.exp(-12 * dt));
  }
  // idle bob + breathing + step bob
  bodyRoot.position.y += Math.sin(G.time * 2.2) * 0.012;
  bodyRoot.position.y += Math.abs(Math.sin(ph)) * 0.05 * G.moveAmt;
}

// ============================== boss ==============================
// Blender GLB characters — parsed once per id, re-bonded clone per instance.
// SkinnedMesh.copy shares the SOURCE skeleton object, and the cached original
// scene is never added to the scene graph — its bones' matrixWorld never
// updates, so a raw clone would be skinned by stale (identity) transforms and
// render as a crumpled, near-invisible lump. rebindClone() re-points each
// skinned mesh's skeleton at the clone's own (in-graph) bones.
const charGlts: Record<string, { scene: THREE.Group; animations: THREE.AnimationClip[] }> = {};
function loadCharacterGltf(id: string, file: string): Promise<void> {
  return new Promise((resolve) => {
    if (charGlts[id]) return resolve();
    new GLTFLoader().load(file, (gltf) => {
      charGlts[id] = { scene: gltf.scene, animations: gltf.animations };
      resolve();
    }, undefined, () => resolve()); // failed load -> procedural fallback
  });
}
function rebindClone(root: THREE.Object3D) {
  // must run AFTER the clone's final position/scale are set — the bind matrix
  // is captured from the mesh's current world matrix
  scene.updateMatrixWorld(true);
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) {
      const src = sm.skeleton;
      const bones = src.bones.map((b) => (root.getObjectByName(b.name) as THREE.Bone) || b);
      sm.bindMode = 'attached';
      sm.bind(new THREE.Skeleton(bones, src.boneInverses), new THREE.Matrix4().copy(sm.matrixWorld));
    }
  });
}
function bossSetAnim(b: Boss, name: string, loop: boolean, speed = 1) {
  if (!b.mixer || !b.actions[name]) return;
  const next = b.actions[name];
  if (name === b.curAnim) { next.timeScale = speed; return; }
  const prev = b.curAnim ? b.actions[b.curAnim] : null;
  next.reset();
  next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  next.timeScale = speed;
  next.clampWhenFinished = true;
  next.play();
  if (prev) prev.crossFadeTo(next, 0.2, false);
  b.curAnim = name;
}
function startBoss() {
  const zb = G.zoneBuild;
  if (!zb || G.bossActive || G.boss) return;
  const zd = ZONES[G.zone];
  const def = BOSSES[zd.boss];
  const { group, mat } = makeBossGroup(def); // procedural base (also the fallback)
  group.position.copy(zb.boss);
  scene.add(group);
  const newBoss: Boss = {
    def, group, mat, hp: def.hp, state: 'idle',
    cds: {}, current: '', telegraph: 0, hitstop: 0, idle: 0.55,
    charge: null, lunge: null, targetPos: null, baseY: zb.boss.y, phase: Math.random() * 6.28,
    mats: [mat], mixer: null, actions: {}, curAnim: '', clipUntil: 0,
  };
  for (const a of Object.keys(def.attacks)) newBoss.cds[a] = 1;
  G.boss = newBoss;
  G.bossActive = true;
  G.bossIntro = 2.4;
  SFX.bossRoar();
  toast(`${def.name} — ${def.title}`, 2.6);
  if (def.glb) {
    const ms = def.modelScale ?? 1;
    loadCharacterGltf(def.id, def.glb).then(() => {
      if (G.boss !== newBoss) return;
      const glt = charGlts[def.id];
      if (!glt) return;
      const root = glt.scene.clone(true);
      newBoss.group.clear();
      newBoss.group.add(root);
      root.scale.setScalar(ms);
      // ground-normalize: bind-pose bbox may not sit at y=0 (stool floats, porcelain dips)
      const bbox = new THREE.Box3().setFromObject(root);
      root.position.y = -bbox.min.y;
      rebindClone(root); // after final transform — bind matrix is captured from world matrix
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          const mm = m.material as THREE.MeshStandardMaterial;
          if (mm && mm.emissive && !newBoss.mats.includes(mm)) {
            mm.userData.baseEmissive = mm.emissive.clone();
            mm.userData.baseIntensity = mm.emissiveIntensity;
            newBoss.mats.push(mm);
          }
        }
      });
      newBoss.mixer = new THREE.AnimationMixer(root);
      for (const clip of glt.animations) newBoss.actions[clip.name] = newBoss.mixer.clipAction(clip);
      bossSetAnim(newBoss, 'Idle', true);
    });
  }
}

function makeBossGroup(def: BossDef): { group: THREE.Group; mat: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.5, emissive: def.color, emissiveIntensity: 0.08 });
  if (def.id === 'porcelain_king') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.9, 4, 10), mat);
    body.position.y = 1.3;
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 8, 14), new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.7 }));
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 2.15;
    // giant seat
    const seat = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.14, 10, 18), new THREE.MeshStandardMaterial({ color: 0xf0f0f5 }));
    seat.position.set(0.9, 1.4, 0.4);
    const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.16, 1.75, 0.42);
    const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set(0.16, 1.75, 0.42);
    g.add(body, crown, seat, eL, eR);
  } else if (def.id === 'overflow_lord') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 12), mat);
    body.scale.set(1, 1.35, 1);
    body.position.y = 1.3;
    const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff88 });
    const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.25, 1.9, 0.75);
    const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set(0.25, 1.9, 0.75);
    const drip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 8), mat);
    drip.position.set(0.4, 0.55, 0); drip.rotation.x = Math.PI;
    g.add(body, eL, eR, drip);
  } else {
    // the great stool: stacked primordial blobs
    for (let i = 0; i < 3; i++) {
      const s = 1.5 - i * 0.35;
      const blob = new THREE.Mesh(new THREE.SphereGeometry(s, 14, 10), mat);
      blob.position.y = 0.8 + i * 1.15;
      blob.scale.y = 0.62;
      g.add(blob);
    }
    const eyeGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff6a9a });
    const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.4, 3.0, 1.1);
    const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set(0.4, 3.0, 1.1);
    g.add(eL, eR);
  }
  g.scale.setScalar(def.scale * 0.55);
  return { group: g, mat };
}

function bossDefeated() {
  if (!G.boss) return;
  const b = G.boss;
  SFX.bossDefeat();
  burst(b.group.position.clone().setY(1.5), b.def.color, 40, 6, 1.2, 0.14);
  burst(b.group.position.clone().setY(1.5), 0xffffff, 24, 5, 0.9, 0.1);
  scene.remove(b.group);
  G.save.souls += b.def.souls;
  G.soulsEarned += b.def.souls;
  G.save.grit += ZONES[G.zone].bossGrit;
  G.save.bossesDefeated[G.zone] = true;
  G.save.flaskMax = Math.min(FLASK_MAX_CAP, G.save.flaskMax + 1); // +1 flask capacity per boss
  G.save.flaskCharges = G.save.flaskMax;
  G.kills++;
  G.boss = null;
  G.bossActive = false;
  if (G.zone < 2) {
    toast('ZONE CLEARED', 2.4);
    loadZone(G.zone + 1);
  } else {
    G.mode = 'win';
    const m = Math.floor(G.runT / 60), s = Math.floor(G.runT % 60);
    $('winStats').innerHTML = `Level ${levelOf()} · ${G.kills} foes slain · ${G.deaths} deaths<br>${G.soulsEarned} souls earned · ${m}m ${s}s<br>The Throne is clean. You may, at last, sit.`;
    save();
  }
}

function updateBoss(dt: number) {
  const b = G.boss;
  if (!b || !G.bossActive) return;
  const hasGlb = !!b.mixer;
  const glbScale = b.def.modelScale ?? 1;
  if (G.bossIntro > 0) {
    G.bossIntro -= dt;
    // GLB: root child carries modelScale, keep the group at 1 (avoid double-scaling)
    b.group.scale.setScalar((hasGlb ? 1 : b.def.scale * 0.55) * (1 + Math.sin(G.time * 30) * 0.04));
    return;
  }
  if (b.hitstop > 0) { b.hitstop -= dt; return; }
  const maxHp = b.def.hp;
  const frac = b.hp / maxHp;
  const phase = b.def.phases.find((p) => p.hpFrac >= frac) ?? b.def.phases[b.def.phases.length - 1];
  const size = ZONES[G.zone].size;
  // face player
  const dx = G.pos.x - b.group.position.x;
  const dz = G.pos.z - b.group.position.z;
  const dist = Math.hypot(dx, dz);
  b.group.rotation.y = Math.atan2(dx, dz);
  // breathing anim (procedural scale only — GLB breathes via its Idle clip)
  if (!hasGlb) b.group.scale.setScalar(b.def.scale * 0.55 * (1 + Math.sin(G.time * 2 + b.phase) * 0.03));
  b.mixer?.update(dt);

  if (b.charge) {
    b.charge.t -= dt;
    b.group.position.addScaledVector(b.charge.dir, 9 * dt);
    b.group.position.x = THREE.MathUtils.clamp(b.group.position.x, -size + 1.5, size - 1.5);
    b.group.position.z = THREE.MathUtils.clamp(b.group.position.z, -size + 1.5, size - 1.5);
    if (dist < 1.9 + b.def.scale * 0.4) damagePlayer(b.charge.dmg, true);
    if (b.charge.t <= 0) b.charge = null;
    return;
  }
  if (b.lunge) {
    b.lunge.t -= dt;
    b.group.position.addScaledVector(b.lunge.dir, 16 * dt);
    b.group.position.x = THREE.MathUtils.clamp(b.group.position.x, -size + 1.5, size - 1.5);
    b.group.position.z = THREE.MathUtils.clamp(b.group.position.z, -size + 1.5, size - 1.5);
    if (b.lunge.t <= 0) b.lunge = null;
  }
  if (b.state === 'windup') {
    b.telegraph -= dt;
    const atk = b.def.attacks[b.current];
    const f = atk.telegraph > 0 ? 1 - b.telegraph / atk.telegraph : 1;
    for (const m of b.mats) {
      m.emissive.setHex(0xff5544);
      m.emissiveIntensity = (m.userData.baseIntensity ?? 0.08) * 0.3 + f * 0.7;
    }
    if (!hasGlb) {
      // procedural fallback: crouch + lean before the strike lands
      const melee = b.current === 'SeatSwing' || b.current === 'Lurch' || b.current === 'SmearSlap';
      b.group.position.y = b.baseY - (melee ? f * 0.15 : f * 0.4);
      b.group.rotation.x = melee ? f * 0.12 : -f * 0.18;
    }
    if (b.telegraph <= 0) {
      for (const m of b.mats) {
        m.emissive.copy(m.userData.baseEmissive ?? new THREE.Color(b.def.color));
        m.emissiveIntensity = m.userData.baseIntensity ?? 0.08;
      }
      b.group.position.y = b.baseY;
      b.group.rotation.x = 0;
      executeBossAttack(b, atk.damage, atk.range);
      b.cds[b.current] = atk.cd * phase.cdMult;
      b.state = 'idle';
      b.current = '';
      b.idle = 0.35;
      if (hasGlb) b.clipUntil = G.time + (atk.cd * phase.cdMult) * 0.7; // follow-through window
    }
    return;
  }
  // idle: walk toward player + pick attacks
  const walkSpd = 2.8;
  const walking = dist > 2.2 && !b.lunge;
  if (walking) {
    b.group.position.add(new THREE.Vector3(dx / (dist || 1), 0, dz / (dist || 1)).multiplyScalar(walkSpd * dt));
    if (!hasGlb) {
      // heavy-footed walk: bob + side-to-side sway (GLB plays its Walk clip)
      b.group.position.y = b.baseY + Math.abs(Math.sin(G.time * 7 + b.phase)) * 0.16;
      b.group.rotation.z = Math.sin(G.time * 3.5 + b.phase) * 0.05;
    }
  } else {
    b.group.position.y = THREE.MathUtils.lerp(b.group.position.y, b.baseY, 1 - Math.exp(-8 * dt));
    b.group.rotation.z = THREE.MathUtils.lerp(b.group.rotation.z, 0, 1 - Math.exp(-8 * dt));
  }
  // GLB locomotion anim (attack clip holds until clipUntil, then resume)
  if (hasGlb && b.state === 'idle' && G.time > b.clipUntil && b.curAnim !== (walking ? 'Walk' : 'Idle')) {
    bossSetAnim(b, walking ? 'Walk' : 'Idle', true, walking ? 0.85 : 1);
  }
  for (const a of Object.keys(b.cds)) b.cds[a] -= dt;
  b.idle -= dt;
  const avail = phase.attacks.filter((a) => b.cds[a] <= 0);
  if (b.idle <= 0 && avail.length > 0) {
    // prefer attacks whose range covers the player; else any
    const inRange = avail.filter((a) => b.def.attacks[a].range >= dist * 0.85);
    const pool = inRange.length > 0 ? inRange : avail;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    b.state = 'windup';
    b.current = pick;
    b.telegraph = b.def.attacks[pick].telegraph;
    b.idle = 0.55;
    if (pick === 'MeteorDrop') b.targetPos = G.pos.clone();
    // GLB: time the attack clip so its authored hit frame lands exactly at telegraph end
    if (hasGlb && b.actions[pick]) {
      const a2 = b.def.attacks[pick];
      const speed = a2.hitF ? (a2.hitF - 1) / 30 / a2.telegraph : 1;
      bossSetAnim(b, pick, false, speed);
      b.clipUntil = G.time + a2.telegraph + 0.6; // hold pose a beat past the hit
    }
  }
}

function executeBossAttack(b: Boss, dmg: number, range: number) {
  const atk = b.current;
  const dist = b.group.position.distanceTo(G.pos);
  const p = b.group.position;
  if (atk === 'SeatSwing' || atk === 'Lurch' || atk === 'SmearSlap') {
    if (dist < range) damagePlayer(dmg, true);
    // follow-through lunge — the swing commits forward, reads as a real attack
    const dir = new THREE.Vector3(G.pos.x - p.x, 0, G.pos.z - p.z).normalize();
    b.lunge = { dir, t: 0.18 };
    burst(p.clone().setY(1.4), b.def.color, 10, 4, 0.4, 0.1);
  } else if (atk === 'SeatSlam' || atk === 'BodySlam' || atk === 'CorePulse') {
    if (dist < range) damagePlayer(dmg, true);
    burst(p.clone().setY(0.5), b.def.color, 20, 6, 0.6, 0.12);
  } else if (atk === 'Spin') {
    if (dist < range + 0.6) damagePlayer(dmg, true);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      burst(p.clone().add(new THREE.Vector3(Math.cos(a) * 1.4, 1.2, Math.sin(a) * 1.4)), b.def.color, 3, 5, 0.5, 0.08);
    }
  } else if (atk === 'MeteorDrop') {
    if (b.targetPos && G.pos.distanceTo(b.targetPos) < 2.4) damagePlayer(dmg, false);
    burst((b.targetPos ?? p).clone().setY(0.5), 0x5a4632, 26, 6, 0.8, 0.16);
    b.targetPos = null;
  } else if (atk === 'GasCloud') {
    spawnCloud(p, 3, 4, dmg);
  } else if (atk === 'BloatCharge') {
    const dir = new THREE.Vector3(G.pos.x - p.x, 0, G.pos.z - p.z).normalize();
    b.charge = { dir, t: 1.1, dmg };
  } else if (atk === 'WallOfFilth') {
    const rot = Math.atan2(b.group.position.x - G.pos.x, b.group.position.z - G.pos.z);
    const wallPos = G.pos.clone().add(new THREE.Vector3(0, 0, 0));
    spawnWall(wallPos, rot, 2.6, dmg);
  } else if (atk === 'PrimordialRoar') {
    if (dist < range) damagePlayer(dmg, false);
    burst(p.clone().setY(2), b.def.color, 30, 8, 0.7, 0.14);
    SFX.bossRoar();
  }
}

// ============================== interact / shrine ==============================
function nearestInteractable(): { kind: string; d: number } | null {
  const zb = G.zoneBuild;
  if (!zb) return null;
  let best: { kind: string; d: number } | null = null;
  for (const it of zb.interactables) {
    const d = G.pos.distanceTo(it.pos);
    if (d < it.radius && (!best || d < best.d)) best = { kind: it.kind, d };
  }
  return best;
}

function doInteract() {
  const hit = nearestInteractable();
  if (!hit) return;
  if (hit.kind === 'bonfire') {
    G.hp = hpMax();
    G.stamina = stMax();
    G.save.flaskCharges = G.save.flaskMax; // bonfire refills the flask
    SFX.bonfire();
    toast('RESTED. FULLY CLEANSED.', 1.4);
    const zb = G.zoneBuild!;
    const fire = zb.interactables.find((i) => i.kind === 'bonfire');
    if (fire) burst(fire.pos.clone().setY(1.4), 0xffa030, 16, 3, 0.7, 0.08);
    save();
  } else if (hit.kind === 'shrine') {
    openShrine();
  } else if (hit.kind === 'bossDoor') {
    if (!G.bossActive && !G.boss && !G.save.bossesDefeated[G.zone]) startBoss();
    else if (G.save.bossesDefeated[G.zone]) toast('The door is open. The way ahead is cleared.', 1.6);
  }
}

function openShrine() {
  G.mode = 'shrine';
  G.save.flaskCharges = G.save.flaskMax; // shrine refills the flask
  SFX.ui();
  renderShrine();
}
function closeShrine() {
  G.mode = 'play';
  SFX.ui();
}
function renderShrine() {
  const s = G.save.stats;
  const set = (idV: string, idC: string, idB: string, val: number, key: 'v' | 'e' | 's' | 'c') => {
    $(idV).textContent = String(val);
    const cost = statCost(val);
    const can = val < STAT_MAX && G.save.souls >= cost;
    $(idC).textContent = val >= STAT_MAX ? 'MAX' : `${cost} souls`;
    ($(idB) as HTMLButtonElement).disabled = !can;
    ($(idB) as HTMLButtonElement).onclick = () => {
      if (val < STAT_MAX && G.save.souls >= cost) {
        G.save.souls -= cost;
        G.save.stats[key] = val + 1;
        G.hp = Math.min(G.hp + (key === 'v' ? 9 : 0), hpMax());
        G.stamina = Math.min(G.stamina + (key === 'e' ? 5 : 0), stMax());
        SFX.levelUp();
        toast('STAT RAISED', 1);
        renderShrine();
        save();
      }
    };
  };
  set('vVal', 'vCost', 'btnV', s.v, 'v');
  set('eVal', 'eCost', 'btnE', s.e, 'e');
  set('sVal', 'sCost', 'btnS', s.s, 's');
  set('cVal', 'cCost', 'btnC', s.c, 'c');
  // forge
  const w = WEAPONS[G.weaponIdx];
  const tier = G.save.weaponTiers[G.weaponIdx];
  $('upName').textContent = `${w.emoji} ${w.name}`;
  $('upTier').textContent = `+${tier}${tier >= MAX_TIER ? '' : ' → +' + (tier + 1)}`;
  const gcost = gritForTier(tier);
  const canForge = tier < MAX_TIER && G.save.grit >= gcost;
  $('upCost').textContent = tier >= MAX_TIER ? 'MAX' : `${gcost} grit`;
  ($('btnUp') as HTMLButtonElement).disabled = !canForge;
  ($('btnUp') as HTMLButtonElement).onclick = () => {
    if (tier < MAX_TIER && G.save.grit >= gcost) {
      G.save.grit -= gcost;
      G.save.weaponTiers[G.weaponIdx] = tier + 1;
      SFX.levelUp();
      toast(`FORGED +${tier + 1}`, 1.2);
      renderShrine();
      save();
    }
  };
  $('shSouls').textContent = String(G.save.souls);
  $('shGrit').textContent = String(G.save.grit);
  $('shFlask').textContent = `${G.save.flaskCharges}/${G.save.flaskMax}`;
}

// ============================== save / load ==============================
function save() {
  try {
    G.save.level = levelOf();
    localStorage.setItem(SAVE_KEY, JSON.stringify(G.save));
  } catch { /* ignore */ }
}
function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SaveData;
    if (typeof s.souls !== 'number' || !s.stats) return null;
    // migrate pre-flask saves
    if (typeof s.flaskCharges !== 'number') s.flaskCharges = 1;
    if (typeof s.flaskMax !== 'number') s.flaskMax = 1;
    return s;
  } catch { return null; }
}
function newGame() {
  G.save = defaultSave();
  G.kills = 0; G.deaths = 0; G.soulsEarned = 0; G.runT = 0;
  SFX.unlock();
  loadZone(0);
  G.mode = 'play';
  toast('THE PORCELAIN HOLLOW', 2);
}
function continueGame() {
  const s = loadSave();
  if (!s) return;
  G.save = s;
  SFX.unlock();
  loadZone(s.zone);
  G.mode = 'play';
  toast(ZONES[s.zone].name.toUpperCase(), 2);
}
function refreshTitle() {
  const s = loadSave();
  const btn = $('btnContinue') as HTMLButtonElement;
  const info = $('contInfo');
  if (s) {
    btn.disabled = false;
    const done = s.bossesDefeated.filter(Boolean).length;
    info.textContent = `LV ${levelOfFromSave(s)} · ${ZONES[s.zone].name} · ${done}/3 bosses`;
  } else {
    btn.disabled = true;
    info.textContent = 'No previous ascension found.';
  }
}
function levelOfFromSave(s: SaveData): number {
  return (s.stats.v - 1) + (s.stats.e - 1) + (s.stats.s - 1) + (s.stats.c - 1) + 1;
}

// ============================== input ==============================
let mouseDown = false;
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') { spaceQueued = true; e.preventDefault(); }
  keys[k] = true;
  if (k === 'e') {
    if (G.mode === 'play') doInteract();
    else if (G.mode === 'shrine') closeShrine();
    else if (G.mode === 'over') resurrect();
  }
  if (k === 'q') {
    if (G.mode === 'play') switchWeapon((G.weaponIdx + 1) % WEAPONS.length);
  }
  if (k === 'f') {
    if (G.mode === 'play') G.locked = G.locked ? null : pickLockTarget();
  }
  if (k === 'r') {
    if (G.mode === 'play') drinkFlask();
  }
  if (['1', '2', '3', '4'].includes(k)) {
    if (G.mode === 'play') switchWeapon(parseInt(k, 10) - 1);
  }
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    mouseDown = true;
    if (G.mode === 'play' && document.pointerLockElement !== canvas) {
      const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => { /* not-adopted etc. */ });
    }
  }
  if (e.button === 2) {
    if (G.mode === 'play') {
      G.blockHeld = true;
      G.blockStart = G.time;
    }
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) G.blockHeld = false;
});
window.addEventListener('contextmenu', (e) => { if (G.mode === 'play') e.preventDefault(); });
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    G.camYawT -= e.movementX * 0.0026;
    G.camPitchT = THREE.MathUtils.clamp(G.camPitchT + e.movementY * 0.0022, 0.12, 1.15);
  }
});
window.addEventListener('wheel', (e) => {
  if (document.pointerLockElement === canvas) {
    G.camDistT = THREE.MathUtils.clamp(G.camDistT + e.deltaY * 0.005, 4, 11);
  }
});

// buttons
($('btnNew') as HTMLButtonElement).onclick = () => { panelTitle.style.display = 'none'; newGame(); };
($('btnContinue') as HTMLButtonElement).onclick = () => { const s = loadSave(); if (s) { panelTitle.style.display = 'none'; continueGame(); } };
($('btnRespawn') as HTMLButtonElement).onclick = () => { panelOver.style.display = 'none'; resurrect(); };
($('btnCloseShrine') as HTMLButtonElement).onclick = () => { panelShrine.style.display = 'none'; closeShrine(); };
($('btnAgain') as HTMLButtonElement).onclick = () => { panelWin.style.display = 'none'; panelTitle.style.display = 'none'; newGame(); refreshTitle(); };

// pointer-lock ↔ UI mode sync: menus need a real cursor, combat uses pointer lock
function syncPointerLock() {
  const el = document.pointerLockElement as HTMLElement | null;
  if (G.mode !== 'play' && el === canvas) {
    // release: menu needs the cursor back. (Promise rejects if no user gesture left — harmless.)
    const r = document.exitPointerLock() as unknown as Promise<void> | undefined;
    if (r && typeof r.catch === 'function') r.catch(() => { /* no-activation rejection */ });
  } else if (G.mode === 'play' && el === null && mouseDown) {
    const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (r && typeof r.catch === 'function') r.catch(() => { /* not-adopted / double-request */ });
  }
}

// ============================== HUD sync ==============================
function syncUI(dt: number) {
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) elToast.style.opacity = '0';
  }
  if (G.cinematic) {
    elHud.style.display = 'none';
    elHudRight.style.display = 'none';
    elInteract.style.display = 'none';
    elHint.style.display = 'none';
    // boss bar stays — it's the signature
    if (G.boss && G.bossActive) {
      elBossWrap.style.display = 'block';
      elBossName.textContent = `${G.boss.def.name} — ${G.boss.def.title}`;
      elBossBar.style.width = `${Math.max(0, G.boss.hp / G.boss.def.hp) * 100}%`;
    } else elBossWrap.style.display = 'none';
    return;
  }
  elHud.style.display = '';
  elHudRight.style.display = '';
  const hpF = Math.max(0, G.hp / hpMax());
  elHp.style.width = `${hpF * 100}%`;
  elHpVal.textContent = String(Math.ceil(G.hp));
  const stF = Math.max(0, G.stamina / stMax());
  elSt.style.width = `${stF * 100}%`;
  elStVal.textContent = String(Math.ceil(G.stamina));
  elLvl.textContent = String(levelOf());
  elSouls.textContent = String(G.save.souls);
  elGrit.textContent = String(G.save.grit);
  elFlask.textContent = `${G.save.flaskCharges}/${G.save.flaskMax}`;
  const w = WEAPONS[G.weaponIdx];
  elWeapon.textContent = `${w.emoji} ${w.name} +${G.save.weaponTiers[G.weaponIdx]}`;
  elZone.textContent = ZONES[G.zone].name;
  // boss bar
  if (G.boss && G.bossActive) {
    elBossWrap.style.display = 'block';
    elBossName.textContent = `${G.boss.def.name} — ${G.boss.def.title}`;
    elBossBar.style.width = `${Math.max(0, G.boss.hp / G.boss.def.hp) * 100}%`;
    const frac = G.boss.hp / G.boss.def.hp;
    const phase = G.boss.def.phases.find((p) => p.hpFrac >= frac);
    const idx = G.boss.def.phases.indexOf(phase ?? G.boss.def.phases[0]);
    elBossSub.textContent = `PHASE ${G.boss.def.phases.length - idx} / ${G.boss.def.phases.length}`;
  } else {
    elBossWrap.style.display = 'none';
  }
  // interact hint
  if (G.mode === 'play') {
    const hit = nearestInteractable();
    if (hit) {
      elInteract.style.display = 'block';
      elInteract.textContent = hit.kind === 'bonfire' ? 'E — REST AT BONFIRE' : hit.kind === 'shrine' ? 'E — SHRINE OF THE GREAT FLUSH' : (!G.save.bossesDefeated[G.zone] && !G.bossActive ? 'E — FACE THE BOSS' : '');
      if (!elInteract.textContent) elInteract.style.display = 'none';
    } else elInteract.style.display = 'none';
  } else elInteract.style.display = 'none';
  // panels
  panelShrine.style.display = G.mode === 'shrine' ? 'flex' : 'none';
  panelOver.style.display = G.mode === 'over' ? 'flex' : 'none';
  panelWin.style.display = G.mode === 'win' ? 'flex' : 'none';
}

// ============================== camera ==============================
const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
reticle.scale.setScalar(0.16);
reticle.visible = false;
scene.add(reticle);
function updateCamera(dt: number) {
  if (G.mode === 'title') G.camYawT += dt * 0.12;
  const t = 1 - Math.exp(-9 * dt);
  G.camYaw += (G.camYawT - G.camYaw) * t;
  G.camPitch += (G.camPitchT - G.camPitch) * t;
  G.camDist += (G.camDistT - G.camDist) * t;
  const eye = G.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
  const off = new THREE.Vector3(
    -Math.sin(G.camYaw) * Math.cos(G.camPitch),
    Math.sin(G.camPitch),
    -Math.cos(G.camYaw) * Math.cos(G.camPitch),
  ).multiplyScalar(G.camDist);
  const target = eye.clone().add(off);
  target.y = Math.max(0.4, target.y);
  camera.position.copy(target);
  camera.lookAt(G.pos.clone().add(new THREE.Vector3(0, 1.3, 0)));
  // aim reticle over the locked target (height from the model's actual scale)
  if (G.locked && G.mode === 'play' && !G.cinematic) {
    const p = G.locked.group.position;
    const s = G.locked.group.scale.y;
    const isBoss = 'title' in G.locked.def;
    reticle.position.set(p.x, s * (isBoss ? 2.4 : 1.1) + 0.25, p.z);
    reticle.visible = true;
  } else reticle.visible = false;
}

// ============================== debug hooks ==============================
window.__game = {
  state: () => ({
    mode: G.mode,
    hp: G.hp, maxHp: hpMax(), stamina: G.stamina, maxStamina: stMax(),
    souls: G.save.souls, grit: G.save.grit,
    zone: G.zone, zoneName: ZONES[G.zone].name,
    weapon: G.weaponIdx, weaponTier: G.save.weaponTiers[G.weaponIdx],
    weaponName: WEAPONS[G.weaponIdx].name,
    kills: G.kills, deaths: G.deaths, level: levelOf(),
    mobs: G.mobs.map((m) => ({ id: m.def.id, hp: Math.round(m.hp), x: Math.round(m.group.position.x * 10) / 10, z: Math.round(m.group.position.z * 10) / 10, tg: Math.round(m.telegraph * 100) / 100 })),
    yaw: Math.round(G.yaw * 100) / 100,
    cam: { x: Math.round(camera.position.x * 10) / 10, z: Math.round(camera.position.z * 10) / 10 },
    lockPos: G.locked ? { x: Math.round(G.locked.group.position.x * 10) / 10, z: Math.round(G.locked.group.position.z * 10) / 10 } : null,
    boss: G.boss ? {
      active: G.bossActive, name: G.boss.def.name, hp: Math.round(G.boss.hp), maxHp: G.boss.def.hp,
      state: G.boss.state, intro: Math.round(G.bossIntro * 10) / 10,
      x: Math.round(G.boss.group.position.x * 10) / 10, z: Math.round(G.boss.group.position.z * 10) / 10,
      glb: G.boss.mixer ? { loaded: true, anim: G.boss.curAnim } : { loaded: false, anim: 'procedural' },
    } : null,
    orbSouls: G.orb ? G.orb.souls : 0,
    flask: { charges: G.save.flaskCharges, max: G.save.flaskMax, drinking: Math.round(G.flaskDrinking * 100) / 100 },
    gritDrops: G.gritDrops.length,
    iframes: G.iframes, hitstun: G.hitstun, dodging: G.dodging,
    locked: G.locked ? G.locked.def.id : null,
    model: modelLoaded ? { loaded: true, anim: currentAnim, actions: Object.keys(actions).sort() } : { loaded: false, anim: 'procedural' },
    stats: { ...G.save.stats },
    pos: { x: Math.round(G.pos.x * 10) / 10, z: Math.round(G.pos.z * 10) / 10 },
  }),
  newGame,
  continueGame,
  loadZone,
  weapon: (i: number) => switchWeapon(i),
  attack: () => startAttack(),
  dodge: () => { spaceQueued = true; updatePlayer(0.016); },
  damagePlayer: (n: number, melee = true) => damagePlayer(n, melee),
  parryHit: (n: number) => { G.blockHeld = true; G.blockStart = G.time; damagePlayer(n, true); G.blockHeld = false; },
  orb: (n: number) => { dropSouls(G.pos.clone().add(new THREE.Vector3(0.8, 0, 0)), n); },
  grit: (n: number) => dropGrit(G.pos.clone().add(new THREE.Vector3(-0.8, 0, 0)), n),
  spawnMob: (id: string) => {
    const def = MOBS[id];
    if (def) spawnMob(def, G.pos.clone().add(new THREE.Vector3(2.5, 0, 0)));
  },
  killMobs: () => {
    for (const m of G.mobs) { if (!m.dead) { m.dead = true; scene.remove(m.group); } }
    G.mobs.length = 0;
    G.locked = null;
  },
  startBoss,
  hitBoss: (n: number) => { if (G.boss) { G.boss.hp -= n; if (G.boss.hp <= 0) bossDefeated(); } },
  killBoss: () => { if (G.boss) { G.boss.hp = 0.001; } if (G.boss) bossDefeated(); },
  nearBoss: () => {
    if (G.boss) {
      const p = G.boss.group.position;
      G.pos.set(p.x, 0, p.z + 5);
      G.yaw = Math.atan2(-G.pos.x + p.x, -G.pos.z + p.z);
      G.hitstun = 0; G.atk = null;
    }
  },
  lock: (v?: boolean) => {
    if (v === undefined) return G.locked ? G.locked.def.id : null;
    G.locked = v ? pickLockTarget() : null;
    return G.locked ? G.locked.def.id : null;
  },
  setCam: (yaw: number, pitch?: number) => {
    G.camYaw = G.camYawT = yaw;
    if (pitch !== undefined) G.camPitch = G.camPitchT = pitch;
  },
  camDist: (d: number) => { G.camDist = G.camDistT = Math.max(2, Math.min(12, d)); },
  playerObj: () => player,
  snapLocked: () => {
    const l = G.locked;
    if (l) {
      const p = l.group.position;
      const dx = G.pos.x - p.x, dz = G.pos.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      G.pos.set(p.x + (dx / d) * 2, 0, p.z + (dz / d) * 2);
      G.yaw = Math.atan2(-dx / d, -dz / d);
      G.hitstun = 0; G.atk = null; G.dodging = 0;
    }
  },
  setHp: (n: number) => { G.hp = Math.max(1, Math.min(hpMax(), n)); },
  clearCombat: () => { G.hitstun = 0; G.atk = null; G.dodging = 0; G.blockHeld = false; G.moveAmt = 0; G.lastHitT = 0; G.lastCombo = 0; },
  teleport: (x: number, z: number) => {
    const size = ZONES[G.zone].size;
    G.pos.set(THREE.MathUtils.clamp(x, -size + 1.2, size - 1.2), 0, THREE.MathUtils.clamp(z, -size + 1.2, size - 1.2));
    G.yaw = G.camYaw = G.camYawT = 0;
    G.hitstun = 0; G.atk = null; G.dodging = 0; G.blockHeld = false; G.locked = null;
    G.stamina = stMax();
  },
  setBossHp: (n: number) => { if (G.boss) G.boss.hp = Math.max(1, Math.min(G.boss.def.hp, n)); },
  bossGlow: (on: boolean) => {
    if (!G.boss) return false;
    for (const m of G.boss.mats) {
      if (on) { m.emissive.setHex(0xffffff); m.emissiveIntensity = 0.9; }
      else { m.emissive.copy(m.userData.baseEmissive ?? new THREE.Color(G.boss.def.color)); m.emissiveIntensity = m.userData.baseIntensity ?? 0.08; }
    }
    return true;
  },
  bossBox: () => {
    if (!G.boss) return null;
    const box = new THREE.Box3().setFromObject(G.boss.group);
    const s = box.getSize(new THREE.Vector3());
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      min: [r(box.min.x), r(box.min.y), r(box.min.z)],
      max: [r(box.max.x), r(box.max.y), r(box.max.z)],
      size: [r(s.x), r(s.y), r(s.z)],
      groupScale: r(G.boss.group.scale.x),
      childScale: G.boss.group.children[0] ? r(G.boss.group.children[0].scale.x) : -1,
      pos: [r(G.boss.group.position.x), r(G.boss.group.position.y), r(G.boss.group.position.z)],
    };
  },
  bossAttack: (name: string) => {
    if (G.boss && G.boss.def.attacks[name] && G.bossIntro <= 0) {
      const b = G.boss;
      b.state = 'windup';
      b.current = name;
      b.telegraph = b.def.attacks[name].telegraph;
      b.idle = 0;
      if (name === 'MeteorDrop') b.targetPos = G.pos.clone();
      // same clip wiring as the natural idle->windup transition
      if (b.mixer && b.actions[name]) {
        const a2 = b.def.attacks[name];
        const speed = a2.hitF ? (a2.hitF - 1) / 30 / a2.telegraph : 1;
        bossSetAnim(b, name, false, speed);
        b.clipUntil = G.time + a2.telegraph + 0.6;
      }
    }
    return G.boss ? G.boss.state : null;
  },
  bossAnim: (name: string) => { if (G.boss && G.boss.mixer && G.boss.actions[name]) { bossSetAnim(G.boss, name, false, 1); return G.boss.curAnim; } return G.boss ? G.boss.curAnim : null; },
  resurrect,
  openShrine,
  cinematic: (v: boolean) => { G.cinematic = v; },
  bossScreen: () => {
    // where does the boss's head render on screen? (NDC -> pixels)
    if (!G.boss) return null;
    const box = new THREE.Box3().setFromObject(G.boss.group);
    const head = box.getCenter(new THREE.Vector3());
    const v = head.project(camera);
    const s = box.getSize(new THREE.Vector3());
    const dist = camera.position.distanceTo(head);
    const fog = scene.fog as THREE.Fog;
    return { ndc: [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100], screen: { x: Math.round((v.x + 1) / 2 * 1280), y: Math.round((1 - v.y) / 2 * 720) }, hWorld: Math.round(s.y * 100) / 100, dist: Math.round(dist * 10) / 10, fog: fog ? [fog.near, fog.far] : null };
  },
  setFog: (near: number, far: number) => { if (scene.fog) { const f = scene.fog as THREE.Fog; f.near = near; f.far = far; } },
  poseBoss: (gap = 6, camD = 5, pitch = 0.25) => {
    if (!G.boss) return null;
    const aiFrozen = G.boss.state;
    (G.boss as any).state = 'dead'; // suspends AI wander (group + mixer still run)
    renderer.render(scene, camera);
    const bp = G.boss.group.position;
    G.pos.set(bp.x, 0, bp.z + gap);
    G.yaw = Math.PI;
    G.camYaw = G.camYawT = Math.PI;
    G.camPitch = G.camPitchT = pitch;
    G.camDist = G.camDistT = camD;
    G.locked = null; G.atk = null; G.dodging = 0;
    renderer.render(scene, camera);
    const sc = (window.__game as any).bossScreen();
    G.boss.state = aiFrozen;
    return sc;
  },
  jointPix: () => {
    // project each bone's world position to screen px (for gap measurement)
    if (!mixer) return null;
    renderer.render(scene, camera);
    const out: Record<string, [number, number]> = {};
    (mixer.getRoot() as THREE.Object3D).traverse((o: THREE.Object3D) => {
      if ((o as THREE.Bone).isBone) {
        const v = (o as THREE.Bone).getWorldPosition(new THREE.Vector3()).project(camera);
        out[o.name] = [Math.round((v.x + 1) / 2 * 1280), Math.round((1 - v.y) / 2 * 720)];
      }
    });
    return out;
  },
  px: (x: number, y: number) => {
    const c = renderer.domElement;
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext;
    const pr = renderer.getPixelRatio();
    const gx = Math.round(x * pr), gy = Math.round(c.height - y * pr);
    const buf = new Uint8Array(4);
    gl.readPixels(gx, gy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return [buf[0], buf[1], buf[2]];
  },
  playerShot: (anim = 'Idle', yaw = 0, dist = 2.6, pitch = 0.15) => {
    // deterministic player close-up: face the camera, play the given clip from t=0.
    if (actions[anim]) setAnim(anim, true, 1, true);
    G.yaw = G.camYaw = G.camYawT = yaw;
    G.camPitch = G.camPitchT = pitch;
    G.camDist = G.camDistT = dist;
    G.atk = null; G.dodging = 0; G.hitstun = 0; G.moveAmt = 0;
    renderer.render(scene, camera);
    return currentAnim;
  },
};

// ============================== main loop ==============================
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  if (G.mode === 'play') G.runT += dt;
  if (G.mode === 'play') {
    updatePlayer(dt);
    updateMobs(dt);
    updateBoss(dt);
    updateProjectiles(dt);
    updateHazards(dt);
    // shrine bowl pulse
    const zb = G.zoneBuild;
    if (zb) {
      const shrine = zb.interactables.find((i) => i.kind === 'shrine');
      if (shrine && shrine.object.userData.bowlMat) {
        (shrine.object.userData.bowlMat as THREE.MeshStandardMaterial).emissiveIntensity = 0.7 + Math.sin(G.time * 2) * 0.25;
      }
    }
  }
  updateParticles(dt);
  updateDrops(dt);
  if (G.mode === 'play') G.animPhase += dt * (G.dodging > 0 ? 4 : G.moveAmt > 0 ? 10.5 : 1.5);
  updateAnim(dt);
  updateCamera(dt);
  syncPointerLock();
  syncUI(dt);
  renderer.render(scene, camera);
}

// ============================== boot ==============================
function boot() {
  // title: build zone 0 behind the menu, sim paused
  loadZone(0);
  G.mode = 'title';
  panelTitle.style.display = 'flex';
  refreshTitle();
  frame();
}
boot();
