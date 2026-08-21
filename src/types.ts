// POOP SOULS — shared contract between modules (audio, data, world, combat, game).
// All modules build against THIS file. Do not add fields without updating all consumers.

export type Vec3 = [number, number, number];

// ---------- Weapons ----------
export interface WeaponDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  damage: number;      // base light-attack damage at tier 0
  heavyMult: number;   // 3rd combo hit damage = damage * heavyMult
  speed: number;       // attack rate factor (higher = faster)
  arc: number;         // hit arc in radians
  range: number;       // hit range from player
  staminaCost: number; // per light attack
  color: number;
}

// ---------- Mobs ----------
export type MobKind = 'swarm' | 'tank' | 'ranged' | 'slime';

export interface MobDef {
  id: string;
  name: string;
  kind: MobKind;
  hp: number;
  damage: number;
  speed: number;       // units/sec
  souls: number;       // dropped on death
  radius: number;      // body radius (hitbox / aggro size)
  color: number;
  scale: number;       // model scale
  attackRange: number;
  attackCd: number;    // seconds between attacks
  telegraph: number;   // windup time (visible flash) before hit lands
  aggro: number;       // aggro distance
}

// ---------- Bosses ----------
export interface BossAttack {
  damage: number;
  telegraph: number;   // windup seconds (visible)
  cd: number;          // seconds
  range: number;       // hit range from boss
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  hp: number;
  souls: number;       // souls on defeat
  color: number;
  scale: number;
  attacks: Record<string, BossAttack>;
  // phases evaluated top-down: first phase whose hpFrac >= current HP fraction wins.
  phases: { hpFrac: number; attacks: string[]; cdMult: number }[];
}

// ---------- Zones ----------
export interface ZoneDef {
  id: string;
  name: string;
  fog: number;
  fogNear: number;
  fogFar: number;
  floor: number;
  wall: number;
  pillar: number;
  accent: number;      // torch / flame color
  mobs: string[];      // mob ids present in this zone
  mobCount: number;
  boss: string;        // boss id
  size: number;        // arena half-extent
  bossGrit: number;    // grit shards dropped by the boss
}

// ---------- Progression math (single source of truth) ----------
export const MAX_TIER = 5;
export const STAT_MAX = 40;

export const hpFor = (vigor: number) => 61 + vigor * 9;
export const staminaFor = (endurance: number) => 60 + endurance * 5;
export const dmgFor = (strength: number) => 1 + strength * 0.05;
export const blockFor = (composure: number) => Math.min(0.9, 0.5 + composure * 0.01); // fraction of damage REDUCED
export const statCost = (statValue: number) => statValue * 30; // souls for +1 of that stat
export const tierBonus = (tier: number) => 1 + tier * 0.25;   // weapon damage multiplier
export const gritForTier = (tier: number) => tier + 1;         // grit to go from tier `tier` to `tier+1` (tier 0..4)

// ---------- Save ----------
export interface SaveData {
  level: number;
  stats: { v: number; e: number; s: number; c: number };
  souls: number;         // banked (unspent) souls — lost on death unless orb is retrieved
  grit: number;
  weaponTiers: number[]; // 4 entries, 0..MAX_TIER
  zone: number;          // 0..2
  bossesDefeated: boolean[];
}

export const SAVE_KEY = 'poop-souls-save-v1';

// ---------- Combat shared ----------
export const PARRY_WINDOW = 0.22;      // seconds of block that count as a parry
export const DODGE_IFRAMES = 0.25;     // invincibility seconds during a roll
export const DODGE_CD = 0.5;
export const BACKSTAB_MULT = 1.6;
export const HITSTUN = 0.28;           // seconds an enemy locks in after being hit
export const PLAYER_HITSTUN = 0.25;
