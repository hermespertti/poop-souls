// POOP SOULS — game data tables: weapons, mobs, bosses, zones.
import { WeaponDef, MobDef, BossDef, ZoneDef } from './types';

export const WEAPONS: WeaponDef[] = [
  {
    id: 'brush', name: 'Toilet Brush', emoji: '🖌',
    desc: 'It is a brush. It is all you have. Swing it with dignity.',
    damage: 8, heavyMult: 1.6, speed: 1.5, arc: 1.9, range: 1.9, staminaCost: 7, color: 0x9fb8c8,
  },
  {
    id: 'seat', name: 'Flanged Seat', emoji: '💺',
    desc: 'A royal seat, sharpened. Hits like a monarchy.',
    damage: 22, heavyMult: 1.9, speed: 0.8, arc: 2.4, range: 2.2, staminaCost: 16, color: 0xd8d4c8,
  },
  {
    id: 'trowel', name: 'Trowel', emoji: '🥄',
    desc: 'Left field. Smears anything it touches.',
    damage: 14, heavyMult: 1.7, speed: 1.1, arc: 2.0, range: 2.0, staminaCost: 11, color: 0xc8a05a,
  },
  {
    id: 'plunger', name: 'The Plunger', emoji: '🪣',
    desc: 'Two hands. One suction. Zero apologies.',
    damage: 30, heavyMult: 2.0, speed: 0.65, arc: 2.2, range: 2.4, staminaCost: 20, color: 0xb0483a,
  },
];

export const MOBS: Record<string, MobDef> = {
  biber: {
    id: 'biber', name: 'Biber', kind: 'swarm',
    hp: 30, damage: 6, speed: 3.2, souls: 12, radius: 0.35,
    color: 0xe8dcc8, scale: 0.7, attackRange: 1.6, attackCd: 1.2, telegraph: 0.5, aggro: 13,
  },
  clog: {
    id: 'clog', name: 'The Clog', kind: 'tank',
    hp: 120, damage: 16, speed: 1.1, souls: 45, radius: 0.6,
    color: 0x8a9a7a, scale: 1.6, attackRange: 2.1, attackCd: 2.2, telegraph: 0.9, aggro: 10,
  },
  fart: {
    id: 'fart', name: 'Mire Fart', kind: 'ranged',
    hp: 26, damage: 9, speed: 2.4, souls: 16, radius: 0.4,
    color: 0x7ab04a, scale: 0.9, attackRange: 9, attackCd: 2.6, telegraph: 0.7, aggro: 14,
  },
  gloop: {
    id: 'gloop', name: 'Gloop', kind: 'slime',
    hp: 40, damage: 9, speed: 2.0, souls: 18, radius: 0.45,
    color: 0x6ab0a0, scale: 1.0, attackRange: 1.5, attackCd: 1.8, telegraph: 0.6, aggro: 12,
  },
  gloop_small: {
    id: 'gloop_small', name: 'Glooplet', kind: 'slime',
    hp: 18, damage: 5, speed: 2.6, souls: 6, radius: 0.3,
    color: 0x6ab0a0, scale: 0.6, attackRange: 1.4, attackCd: 1.6, telegraph: 0.5, aggro: 11,
  },
};

export const BOSSES: Record<string, BossDef> = {
  porcelain_king: {
    id: 'porcelain_king', name: 'The Porcelain King', title: 'Warden of the Seat',
    hp: 600, souls: 250, color: 0xe8e8f0, scale: 2.0,
    attacks: {
      SeatSwing: { damage: 22, telegraph: 0.7, cd: 1.6, range: 3.0 },
      SeatSlam: { damage: 18, telegraph: 1.0, cd: 3.0, range: 4.5 },
      Spin: { damage: 16, telegraph: 0.8, cd: 3.5, range: 3.5 },
    },
    phases: [
      { hpFrac: 0.5, attacks: ['SeatSwing', 'SeatSlam'], cdMult: 1 },
      { hpFrac: 0, attacks: ['SeatSwing', 'SeatSlam', 'Spin'], cdMult: 0.8 },
    ],
  },
  overflow_lord: {
    id: 'overflow_lord', name: 'Lord of the Overflow', title: 'He Who Spills',
    hp: 1000, souls: 400, color: 0x6a8a3a, scale: 2.2,
    attacks: {
      Lurch: { damage: 20, telegraph: 0.6, cd: 1.8, range: 3.0 },
      BodySlam: { damage: 26, telegraph: 1.1, cd: 3.2, range: 5.0 },
      GasCloud: { damage: 12, telegraph: 1.3, cd: 4.0, range: 6.0 },
      BloatCharge: { damage: 30, telegraph: 0.9, cd: 5.0, range: 9.0 },
    },
    phases: [
      { hpFrac: 0.6, attacks: ['Lurch', 'BodySlam'], cdMult: 1 },
      { hpFrac: 0.3, attacks: ['Lurch', 'BodySlam', 'GasCloud'], cdMult: 0.95 },
      { hpFrac: 0, attacks: ['Lurch', 'BodySlam', 'GasCloud', 'BloatCharge'], cdMult: 0.85 },
    ],
  },
  great_stool: {
    id: 'great_stool', name: 'The Great Stool', title: 'The First Filth',
    hp: 1600, souls: 700, color: 0x5a4632, scale: 3.0,
    attacks: {
      SmearSlap: { damage: 24, telegraph: 0.7, cd: 1.8, range: 3.5 },
      MeteorDrop: { damage: 30, telegraph: 1.4, cd: 4.0, range: 7.0 },
      CorePulse: { damage: 14, telegraph: 0.9, cd: 3.0, range: 5.0 },
      WallOfFilth: { damage: 18, telegraph: 1.5, cd: 6.0, range: 10.0 },
      PrimordialRoar: { damage: 10, telegraph: 1.6, cd: 8.0, range: 12.0 },
    },
    phases: [
      { hpFrac: 0.66, attacks: ['SmearSlap', 'MeteorDrop'], cdMult: 1 },
      { hpFrac: 0.33, attacks: ['SmearSlap', 'MeteorDrop', 'CorePulse'], cdMult: 0.9 },
      { hpFrac: 0, attacks: ['SmearSlap', 'MeteorDrop', 'CorePulse', 'WallOfFilth', 'PrimordialRoar'], cdMult: 0.8 },
    ],
  },
};

export const ZONES: ZoneDef[] = [
  {
    id: 'hollow', name: 'The Porcelain Hollow',
    fog: 0x2a3038, fogNear: 8, fogFar: 42,
    floor: 0x9aa0a8, wall: 0x707880, pillar: 0xb8b0a0, accent: 0xffb04a,
    mobs: ['biber', 'biber', 'biber', 'biber', 'biber', 'clog'], mobCount: 6,
    boss: 'porcelain_king', size: 26, bossGrit: 1,
  },
  {
    id: 'marsh', name: 'The Stinking Marsh',
    fog: 0x1a2418, fogNear: 6, fogFar: 34,
    floor: 0x3a4a2a, wall: 0x2a3a22, pillar: 0x4a5a3a, accent: 0xa0ff6a,
    mobs: ['fart', 'fart', 'fart', 'gloop', 'gloop', 'gloop'], mobCount: 6,
    boss: 'overflow_lord', size: 30, bossGrit: 2,
  },
  {
    id: 'throne', name: 'The Grand Throne',
    fog: 0x241a2a, fogNear: 7, fogFar: 40,
    floor: 0x4a3a3a, wall: 0x3a2a3a, pillar: 0x6a5a6a, accent: 0xff6a9a,
    mobs: ['biber', 'biber', 'clog', 'fart', 'fart', 'gloop', 'gloop'], mobCount: 7,
    boss: 'great_stool', size: 34, bossGrit: 3,
  },
];
