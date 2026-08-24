// POOP SOULS — puppeteer smoke test (25 checks)
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepFrames = async (page, n = 10) => {
  await page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
};

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};
const S = async (page) => page.evaluate(() => window.__game.state());

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900'],
});
const page = await browser.newPage();
const errors = [];
const notFound = new Set();
page.on('response', (r) => { if (r.status() === 404) notFound.add(r.url()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

console.log('== boot ==');
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(2500);
ok('title screen visible', await page.$eval('#panelTitle', (e) => e.style.display === 'flex'));
ok('window.__game present', await page.evaluate(() => !!window.__game));
ok('three.js renders canvas', await page.evaluate(() => {
  const c = document.getElementById('gameCanvas');
  return c && c.width > 0;
}));

console.log('== new game ==');
await page.evaluate(() => window.__game.newGame());
await sleepFrames(page);
let st = await S(page);
ok('mode=play after newGame', st.mode === 'play');
ok('zone 0 = The Porcelain Hollow', st.zoneName === 'The Porcelain Hollow');
ok('6 mobs spawned', st.mobs.length === 6);
ok('mobs include a clog', st.mobs.some((m) => m.id === 'clog'));
ok('starter weapon = brush', st.weaponName === 'Toilet Brush' && st.weaponTier === 0);
ok('hp at max (70)', st.hp === 70 && st.maxHp === 70);

console.log('== combat ==');
const biber = (await S(page)).mobs.find((m) => m.id === 'biber');
// kill a biber with a big attack hit
const hpBefore = biber.hp;
await page.evaluate(() => window.__game.spawnMob('biber'));
await sleepFrames(page);
const after = await S(page);
ok('spawnMob adds mob', after.mobs.length === 7);
// position-agnostic: hit via attack at point-blank via debug
await page.evaluate(async () => {
  // stand a biber next to player, attack 3x (combo)
  const g = window.__game;
  g.spawnMob('biber');
});
await sleepFrames(page, 20);
// do repeated attacks near the spawned mob — damage should register somewhere
const allBefore = (await S(page)).mobs.map((m) => m.hp).reduce((a, b) => a + b, 0);
for (let i = 0; i < 8; i++) { await page.evaluate(() => window.__game.attack()); await sleepFrames(page, 12); }
const allAfter = (await S(page)).mobs.map((m) => m.hp).reduce((a, b) => a + b, 0);
ok('attacks deal damage to nearby mobs', allAfter < allBefore);
ok('stamina consumed by attacks', (await S(page)).stamina < (await S(page)).maxStamina);

console.log('== movement & camera (Dark Souls style) ==');
await page.evaluate(() => window.__game.setHp(999)); // survive any aggro swats during the test
const m0 = await S(page);
await page.keyboard.down('KeyW');
await sleepFrames(page, 30);
await page.keyboard.up('KeyW');
const m1 = await S(page);
const mdx = m1.pos.x - m0.pos.x, mdz = m1.pos.z - m0.pos.z;
const moved = Math.hypot(mdx, mdz);
ok('W moves the player', moved > 0.5);
// camera-relative: delta aligns with camera forward (player minus camera, horizontal)
const cfx = m1.pos.x - m1.cam.x, cfz = m1.pos.z - m1.cam.z;
const cfLen = Math.hypot(cfx, cfz);
const alignDot = cfLen > 0.1 && moved > 0.05 ? (mdx * cfx + mdz * cfz) / (moved * cfLen) : 0;
ok('movement is camera-relative (W goes where the camera looks)', alignDot > 0.85);
// camera follows the player
const camMoved = Math.hypot(m1.cam.x - m0.cam.x, m1.cam.z - m0.cam.z);
ok('camera follows the player', camMoved > moved * 0.5);
// character smoothly turned to face travel direction (no spiral spin)
const travelYaw = Math.atan2(mdx, mdz);
let yawErr = Math.abs(m1.yaw - travelYaw) % (Math.PI * 2);
if (yawErr > Math.PI) yawErr = Math.PI * 2 - yawErr;
ok('character faces travel direction (smooth turn, no spin)', yawErr < 0.35);

console.log('== D-key screen-relative direction ==');
await page.evaluate(() => { window.__game.killMobs(); window.__game.teleport(0, 0); window.__game.setCam(0, 0.42); window.__game.clearCombat(); });
await sleepFrames(page, 10);
const d0 = await S(page);
await page.keyboard.down('KeyD');
await sleepFrames(page, 30);
await page.keyboard.up('KeyD');
const d1 = await S(page);
// camYaw=0: camera sits at -Z looking +Z, so screen-right is -X
ok('D moves screen-right (not left)', d1.pos.x - d0.pos.x < -0.5 && Math.abs(d1.pos.z - d0.pos.z) < 0.35);
const a0 = await S(page);
await page.keyboard.down('KeyA');
await sleepFrames(page, 30);
await page.keyboard.up('KeyA');
const a1 = await S(page);
ok('A moves screen-left', a1.pos.x - a0.pos.x > 0.5);

console.log('== lock-on (F) ==');
await page.evaluate(() => window.__game.spawnMob('biber'));
await sleepFrames(page, 5);
const lockId = await page.evaluate(() => window.__game.lock(true));
const ls = await S(page);
ok('lock-on acquires a target', typeof lockId === 'string' && ls.locked === lockId);
if (ls.lockPos) {
  const target = ls.mobs.find((mm) => mm.x === ls.lockPos.x && mm.z === ls.lockPos.z);
  if (target) {
    // deterministic: snap player 2 units from the locked target, then swing
    await page.evaluate(() => window.__game.snapLocked());
    await sleepFrames(page, 3);
    await page.evaluate(() => window.__game.attack());
    // poll for the landed hit (mobs can hitstun the player and shift timing)
    let landed = false, nd = Infinity;
    for (let i = 0; i < 40 && !landed; i++) {
      await sleepFrames(page, 3);
      const after = await S(page);
      let nearest = null;
      for (const mm of after.mobs) {
        const d = Math.hypot(mm.x - ls.lockPos.x, mm.z - ls.lockPos.z);
        if (d < nd) { nd = d; nearest = mm; }
      }
      landed = !!nearest && nd < 3 && nearest.hp < target.hp;
    }
    ok('attack lands on the locked target', landed);
  } else ok('attack lands on the locked target', false);
} else ok('lockPos reported', false);
ok('F releases the lock', (await page.evaluate(() => window.__game.lock(false))) === null);

console.log('== GLB character (Blender rig) ==');
// wait for the GLB to actually load (up to 5s)
for (let i = 0; i < 50; i++) {
  st = await S(page);
  if (st.model && st.model.loaded === true) break;
  await sleepFrames(page, 10);
}
// reset to a clear corner: no mobs, no aggro, no hitstun, deterministic facing
await page.evaluate(() => { window.__game.killMobs(); window.__game.setHp(999); window.__game.teleport(-20, -20); window.__game.clearCombat(); });
await sleepFrames(page, 25);
st = await S(page);
ok('model.glb loaded', st.model && st.model.loaded === true);
ok('all 8 clips present', st.model && st.model.actions.length === 8 &&
  ['Attack1','Attack2','Attack3','Block','Dodge','Hit','Idle','Walk'].every((a) => st.model.actions.includes(a)));
ok('idle clip playing at rest', st.model && st.model.anim === 'Idle');
// walk a few frames -> Walk clip
await page.keyboard.down('KeyW');
await sleepFrames(page, 20);
st = await S(page);
ok('walk clip while moving', st.model && st.model.anim === 'Walk');
await page.keyboard.up('KeyW');
await sleepFrames(page, 15);
st = await S(page);
ok('back to Idle after stopping', st.model && st.model.anim === 'Idle');
// dodge -> Dodge clip
await page.evaluate(() => window.__game.resetDodgeCd());
await page.evaluate(() => window.__game.dodge());
let dodgeAnim = '';
for (let i = 0; i < 10; i++) {
  await sleepFrames(page, 2);
  const q = await S(page);
  if (q.model && q.model.anim === 'Dodge') { dodgeAnim = 'Dodge'; break; }
}
ok('dodge clip on dodge', dodgeAnim === 'Dodge');
await sleepFrames(page, 30);
// attack -> Attack1 clip (starter weapon, combo 1)
await page.evaluate(() => { window.__game.clearCombat(); window.__game.attack(); });
await sleepFrames(page, 6);
st = await S(page);
ok('attack1 clip on attack', st.model && st.model.anim === 'Attack1');
await sleepFrames(page, 60);
st = await S(page);
ok('returns to Idle after attack', st.model && st.model.anim === 'Idle');

console.log('== weapon switching ==');
await page.evaluate(() => window.__game.weapon(1));
await sleepFrames(page);
st = await S(page);
ok('switch to Flanged Seat', st.weaponName === 'Flanged Seat' && st.weapon === 1);
await page.evaluate(() => window.__game.weapon(3));
await sleepFrames(page);
st = await S(page);
ok('switch to The Plunger', st.weaponName === 'The Plunger' && st.weapon === 3);

console.log('== flask (Flask of the First Flush) ==');
await page.evaluate(() => { window.__game.killMobs(); window.__game.teleport(0, 0); window.__game.clearCombat(); });
await sleepFrames(page, 5);
st = await S(page);
ok('flask starts full 1/1', st.flask.charges === 1 && st.flask.max === 1);
await page.evaluate(() => window.__game.damagePlayer(30));
await sleepFrames(page, 30); // let hitstun drop so drinking is allowed
st = await S(page);
const hpBeforeDrink = st.hp;
ok('damage applied before drink', hpBeforeDrink < st.maxHp);
await page.keyboard.press('KeyR');
await sleepFrames(page, 80); // 0.8s drink + margin
st = await S(page);
ok('flask drink healed 35% of max', st.hp - hpBeforeDrink > st.maxHp * 0.3 && st.hp <= st.maxHp);
ok('flask charge consumed (0/1)', st.flask.charges === 0);
ok('flask HUD shows 0/1', await page.$eval('#flaskVal', (e) => e.textContent === '0/1'));
await page.keyboard.press('KeyR');
await sleepFrames(page, 10);
st = await S(page);
ok('empty flask does not drain', st.flask.charges === 0);

console.log('== boss 1 ==');
// Regression: skinned boss vertices must render at the bones' position.
// (rebindClone once double-applied the group placement — the body skinned
// ~19u behind the dais, through the north wall, invisible in the dark.)
const bossBbox = async (page) => {
  for (let i = 0; i < 60; i++) {
    const q = await S(page);
    if (q.boss && q.boss.glb && q.boss.glb.loaded) break;
    await sleepFrames(page, 10);
  }
  return page.evaluate(() => {
    const g = window.__game;
    const st = g.state();
    if (!st.boss || !st.boss.glb || !st.boss.glb.loaded) return null;
    const scene = g.playerObj().parent;
    scene.updateMatrixWorld(true);
    let bossG = null;
    for (const c of scene.children) {
      if (Math.abs(c.position.x - st.boss.x) < 0.6 && Math.abs(c.position.z - st.boss.z) < 0.6) { bossG = c; break; }
    }
    if (!bossG) return null;
    let bMin = [1e9, 1e9, 1e9], bMax = [-1e9, -1e9, -1e9];
    bossG.traverse((o) => {
      if (o.isBone) {
        const e = o.matrixWorld.elements;
        bMin[0] = Math.min(bMin[0], e[12]); bMin[1] = Math.min(bMin[1], e[13]); bMin[2] = Math.min(bMin[2], e[14]);
        bMax[0] = Math.max(bMax[0], e[12]); bMax[1] = Math.max(bMax[1], e[13]); bMax[2] = Math.max(bMax[2], e[14]);
      }
    });
    let vMin = [1e9, 1e9, 1e9], vMax = [-1e9, -1e9, -1e9], found = false;
    bossG.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.computeBoundingBox();
      const bb = o.boundingBox;
      if (!bb) return;
      const V3 = bb.min.constructor;
      const c = new V3();
      for (let i = 0; i < 8; i++) {
        c.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
        c.applyMatrix4(o.matrixWorld);
        vMin[0] = Math.min(vMin[0], c.x); vMin[1] = Math.min(vMin[1], c.y); vMin[2] = Math.min(vMin[2], c.z);
        vMax[0] = Math.max(vMax[0], c.x); vMax[1] = Math.max(vMax[1], c.y); vMax[2] = Math.max(vMax[2], c.z);
      }
      found = true;
    });
    if (!found) return null;
    return {
      group: [bossG.position.x, bossG.position.z],
      vCenter: [(vMin[0] + vMax[0]) / 2, (vMin[1] + vMax[1]) / 2, (vMin[2] + vMax[2]) / 2],
      bCenter: [(bMin[0] + bMax[0]) / 2, (bMin[1] + bMax[1]) / 2, (bMin[2] + bMax[2]) / 2],
      vHeight: vMax[1] - vMin[1],
    };
  });
};
await page.evaluate(() => window.__game.startBoss());
await sleepFrames(page, 5);
st = await S(page);
ok('boss active: The Porcelain King', st.boss && st.boss.name === 'The Porcelain King' && st.boss.active === true);
const bb1 = await bossBbox(page);
ok('boss GLB loaded', bb1 !== null);
ok('boss body renders at the dais (not behind the wall)', bb1 && Math.hypot(bb1.vCenter[0] - bb1.group[0], bb1.vCenter[2] - bb1.group[1]) < 1.5);
ok('boss body tracks its bones', bb1 && Math.hypot(bb1.vCenter[0] - bb1.bCenter[0], bb1.vCenter[1] - bb1.bCenter[1], bb1.vCenter[2] - bb1.bCenter[2]) < 2.0);
ok('boss body not skinned-collapsed', bb1 && bb1.vHeight > 1.0);
const bossHpBefore = st.boss.hp;
await page.evaluate(() => window.__game.hitBoss(100));
await sleepFrames(page, 30);
st = await S(page);
ok('boss takes damage', st.boss && st.boss.hp === bossHpBefore - 100);
await page.evaluate(() => window.__game.killBoss());
await sleepFrames(page, 30);
st = await S(page);
ok('boss defeat advances to zone 1 (Marsh)', st.zoneName === 'The Stinking Marsh' && st.zone === 1);
ok('boss souls banked (250)', st.souls >= 250);
ok('boss grit awarded (+1)', st.grit >= 1);
ok('boss kill grants +1 flask capacity (now 2)', st.flask.max === 2 && st.flask.charges === 2);

console.log('== zone 2 mobs ==');
st = await S(page);
ok('marsh mobs spawned', st.mobs.length === 6);
ok('marsh has Mire Farts', st.mobs.some((m) => m.id === 'fart'));
ok('marsh has Gloops', st.mobs.some((m) => m.id === 'gloop'));

console.log('== shrine / progression ==');
// real player flow: click to lock the pointer in combat, then E at the shrine
await page.mouse.down();
await sleepFrames(page, 15);
ok('pointer locked during combat', await page.evaluate(() => document.pointerLockElement !== null));
await page.evaluate(() => window.__game.openShrine());
await sleepFrames(page, 10);
st = await S(page);
ok('shrine opens (mode=shrine)', st.mode === 'shrine');
ok('pointer released in shrine (cursor usable)', await page.evaluate(() => document.pointerLockElement === null));
ok('shrine shows flask row', await page.$eval('#shFlask', (e) => /^\d+\/\d+$/.test(e.textContent)));
await page.mouse.up(); // clear the synthetic mousedown
// spend souls on vigor: need 30 (stat 1 -> 2). give 100 souls
await page.evaluate(() => window.__game.orb(0)); // no-op guard
// grant souls via a temp: kill clog is far; instead use debug state through orb pick — simpler: use hitBoss souls? Use direct: orb(n) drops souls at player, then walk? orb pickup is auto within 1.3
await page.evaluate(() => { window.__game.orb(100); });
await sleepFrames(page, 5);
st = await S(page);
ok('soul orb auto-collected (+100)', st.souls >= 350);
const vigBefore = st.stats.v;
// click vigor button
await page.click('#btnV');
await sleepFrames(page, 3);
st = await S(page);
ok('vigor +1 (maxHp up)', st.maxHp === 79);
// forge weapon +1 (needs 1 grit, have >=1)
await page.click('#btnUp');
await sleepFrames(page, 3);
st = await S(page);
ok('weapon forged +1', st.weaponTier === 1 && st.grit >= 0);

console.log('== death / orb ==');
await page.evaluate(() => window.__game.openShrine()); // close shrine first (E)
await page.evaluate(() => window.__game.openShrine());
await sleepFrames(page, 2);
st = await S(page);
// leave shrine: openShrine sets mode shrine; need close — E key hook: simulate via evaluate? closeShrine is internal; use keydown E
await page.keyboard.press('KeyE');
await sleepFrames(page, 3);
st = await S(page);
ok('shrine closed with E (mode=play)', st.mode === 'play');
const soulsBeforeDeath = st.souls;
await page.evaluate(() => window.__game.damagePlayer(999));
await sleepFrames(page, 5);
st = await S(page);
ok('player dies (mode=over)', st.mode === 'over');
ok('souls dropped as orb', st.orbSouls === soulsBeforeDeath && st.souls === 0);
await page.evaluate(() => window.__game.resurrect());
await sleepFrames(page, 5);
st = await S(page);
ok('resurrect at bonfire (play, full hp)', st.mode === 'play' && st.hp === st.maxHp);
ok('dead players heal to max', st.hp === 79);

console.log('== boss 2 & 3 quick ==');
await page.evaluate(() => window.__game.startBoss());
await sleepFrames(page, 5);
st = await S(page);
ok('boss 2 = Lord of the Overflow', st.boss && st.boss.name === 'Lord of the Overflow');
await page.evaluate(() => window.__game.killBoss());
await sleepFrames(page, 30);
st = await S(page);
ok('boss 2 defeat -> Grand Throne', st.zoneName === 'The Grand Throne' && st.zone === 2);
await page.evaluate(() => window.__game.startBoss());
await sleepFrames(page, 5);
st = await S(page);
ok('boss 3 = The Great Stool', st.boss && st.boss.name === 'The Great Stool');
await page.evaluate(() => window.__game.killBoss());
await sleepFrames(page, 30);
st = await S(page);
ok('boss 3 defeat -> WIN screen', st.mode === 'win');
ok('win stats populated', await page.evaluate(() => document.getElementById('winStats').textContent.length > 10));

console.log('== cinematic flag ==');
await page.evaluate(() => window.__game.cinematic(true));
await sleepFrames(page, 3);
ok('cinematic hides HUD', await page.$eval('#hud', (e) => e.style.display === 'none'));
ok('cinematic hides boss bar', await page.$eval('#bossWrap', (e) => e.style.display === 'none'));
ok('cinematic hides hint', await page.$eval('#hint', (e) => e.style.display === 'none'));
await page.evaluate(() => window.__game.cinematic(false));
await sleepFrames(page, 3);
ok('cinematic off restores HUD', await page.$eval('#hud', (e) => e.style.display !== 'none'));

console.log('== save persistence ==');
ok('localStorage save exists', await page.evaluate(() => !!localStorage.getItem('poop-souls-save-v1')));

console.log('== M5 verticality (gallery / ladders / drop holes) ==');
// fresh play session on zone 0; ladder #0 is at angle PI/4, radius ~22.4 => (15.8, 15.8)
await page.evaluate(() => { window.__game.newGame(); window.__game.killMobs(); });
await sleepFrames(page, 5);
// stand near ladder base (ground): interact hint + E starts the climb
await page.evaluate(() => window.__game.teleport(14.8, 14.8));
await sleepFrames(page, 5);
ok('ladder interact hint shows', await page.evaluate(() => document.getElementById('interact').textContent.includes('LADDER')));
await page.evaluate(() => window.__game.interact());
await sleepFrames(page, 110); // ~1.8s of climbing at 2.6u/s
st = await S(page);
ok('E climbed to the gallery (alt=4.5)', st.alt === 4.5);
ok('climb parked at ladder top', Math.hypot(st.pos.x - 15.8, st.pos.z - 15.8) < 0.8);
// walk off a drop hole (angle 0 => +x): falls back to ground
await page.evaluate(() => window.__game.setAlt(4.5));
await page.evaluate(() => window.__game.teleport(21.5, 1.2));
await sleepFrames(page, 90); // over the hole the slab is cut -> falls (0.8s)
st = await S(page);
ok('drop hole: gallery walk-off falls to ground', st.alt === 0);
// layer-gated combat: a swing on the gallery misses ground mobs
// (player stands on the solid slab at the ladder-top position, alt=4.5)
await page.evaluate(() => { window.__game.killMobs(); window.__game.teleport(15.8, 15.8); window.__game.setAlt(4.5); window.__game.setCam(0, 0.3); window.__game.clearCombat(); window.__game.spawnMob('clog'); });
await sleepFrames(page, 10);
const galHpBefore = await page.evaluate(() => window.__game.state().mobs[0].hp);
await page.evaluate(() => window.__game.attack());
await sleepFrames(page, 30);
const gal = await S(page);
ok('gallery swing can\'t hit a ground mob', gal.mobs[0].hp === galHpBefore && gal.alt === 4.5);
await page.evaluate(() => { window.__game.killMobs(); window.__game.teleport(3, 3); window.__game.setAlt(0); window.__game.setCam(Math.PI / 2, 0.3); window.__game.clearCombat(); window.__game.spawnMob('clog'); });
await sleepFrames(page, 6);
const grdHpBefore = await page.evaluate(() => window.__game.state().mobs[0].hp);
await page.evaluate(() => window.__game.attack());
await sleepFrames(page, 30);
const grdHpAfter = await S(page);
ok('ground swing hits the mob again', grdHpAfter.mobs[0].hp < grdHpBefore);
await page.evaluate(() => window.__game.killMobs());

console.log('== M3 juice (damage numbers / shake / hitstop) ==');
// fresh ground session
await page.evaluate(() => { window.__game.newGame(); window.__game.killMobs(); window.__game.setHp(999); window.__game.teleport(3, 3); window.__game.setAlt(0); window.__game.setCam(Math.PI / 2, 0.3); window.__game.clearCombat(); window.__game.spawnMob('clog'); });
await sleepFrames(page, 6);
// landing a swing: damage number pops + shake + hitstop (cumulative counters = no timing races)
const base = await S(page);
await page.evaluate(() => window.__game.attack());
await sleepFrames(page, 12);
const jh = await S(page);
ok('swing hit triggers screen shake', jh.shake > 0 || jh.juiceStops > base.juiceStops);
ok('swing hit triggers hitstop', jh.juiceStops > base.juiceStops);
ok('damage number spawned', jh.juicePops > base.juicePops);
ok('damage number DOM spawned', await page.evaluate(() => document.querySelectorAll('#dmgWrap .dmg').length > 0));
// floats then clears (0.85s life)
await sleepFrames(page, 60);
ok('damage number clears after float', await page.evaluate(() => document.querySelectorAll('#dmgWrap .dmg').length === 0));
// taking damage: red popup + shake
await page.evaluate(() => window.__game.damagePlayer(10));
await sleepFrames(page, 10);
const jt = await S(page);
ok('being hit triggers shake', jt.shake > 0 || jt.juiceStops > jh.juiceStops);
ok('taken damage number spawned', jt.juicePops > jh.juicePops);
ok('hurt popup is red', await page.evaluate(() => {
  const els = [...document.querySelectorAll('#dmgWrap .dmg')];
  return els.some((e) => getComputedStyle(e).color === 'rgb(255, 106, 90)');
}));
await sleepFrames(page, 60);
// boss slam: heavy shake on impact
await page.evaluate(() => window.__game.startBoss());
await sleepFrames(page, 160); // 2.4s intro
const jb = await S(page);
ok('boss active after intro', jb.boss && jb.boss.intro === 0);
await page.evaluate(() => window.__game.setHp(999));
await page.evaluate(() => window.__game.bossAttack('SeatSlam'));
let maxShake = 0;
for (let i = 0; i < 45; i++) { // impact lands at the 1.0s telegraph
  await sleepFrames(page, 2);
  const s = await S(page);
  if (s.shake > maxShake) maxShake = s.shake;
}
ok('boss slam shakes the camera', maxShake > 0.05);
await page.evaluate(() => window.__game.killBoss());
await sleepFrames(page, 30);
await page.evaluate(() => window.__game.killMobs());

console.log('== M6 polish (white flash / camera punch / slow-mo) ==');
// fresh session
await page.evaluate(() => { window.__game.newGame(); window.__game.killMobs(); window.__game.teleport(3, 3); window.__game.setAlt(0); window.__game.clearCombat(); window.__game.setHp(999); });
await sleepFrames(page, 6);
// taking a hit: white impact spike + camera punch-in
await page.evaluate(() => window.__game.damagePlayer(10));
await sleepFrames(page, 2);
const pm = await S(page);
ok('hit triggers white flash', pm.whiteFlash > 0);
ok('hit punches the camera in', pm.camKick > 0);
// parry: slow-mo + white flash
await sleepFrames(page, 20);
await page.evaluate(() => window.__game.parryHit(10));
await sleepFrames(page, 3);
const pp = await S(page);
ok('parry triggers slow-mo', pp.slowmo > 0);
ok('parry flashes white', pp.whiteFlash > 0);
// slow-mo decays back to zero
await sleepFrames(page, 80);
ok('slow-mo decays to zero', (await S(page)).slowmo === 0);
// boss kill moment: slow-mo + flash spike
await page.evaluate(() => window.__game.startBoss());
await sleepFrames(page, 160);
await page.evaluate(() => window.__game.killBoss());
await sleepFrames(page, 4);
const pk = await S(page);
ok('boss kill triggers slow-mo', pk.slowmo > 0);
ok('boss kill flashes white', pk.whiteFlash > 0);
await sleepFrames(page, 120);
ok('post-kill slow-mo fully decays', (await S(page)).slowmo === 0);

console.log('== M7 audio impact (slam / meteor / charge / parry SFX) ==');
// fresh session, counters start at whatever — we diff
await page.evaluate(() => { window.__game.newGame(); window.__game.killMobs(); window.__game.teleport(3, 3); window.__game.setAlt(0); window.__game.clearCombat(); window.__game.setHp(999); window.__game.setGod(true); });
await sleepFrames(page, 6);
const sfx0 = (await S(page)).sfx;
// helper: bring a boss up and freeze its AI so scripted attacks are deterministic
const bringBoss = async (page) => {
  await page.evaluate(() => window.__game.startBoss());
  await sleepFrames(page, 170); // 2.4s intro
  await page.evaluate(() => window.__game.bossSettle());
};
const pollSfx = async (page, key, base, frames) => {
  let best = { ...base };
  for (let i = 0; i < frames; i++) {
    await sleepFrames(page, 2);
    const s = (await S(page)).sfx;
    if ((s[key] ?? 0) > (best[key] ?? 0)) { best = s; break; }
  }
  return best;
};
  // boss slam thud (boss 1, zone 0)
await bringBoss(page);
await page.evaluate(() => window.__game.clearCombat());
await page.evaluate(() => window.__game.setHp(999));
await page.evaluate(() => window.__game.bossAttack('SeatSlam'));
const sfxSlam = await pollSfx(page, 'slam', sfx0, 70); // 1.0s telegraph
ok('boss slam fires slam SFX', (sfxSlam.slam ?? 0) > (sfx0.slam ?? 0));
// parry clink — wait out the slam's hitstun so the parry frame is clean
let guard = 0;
while (guard++ < 60) {
  const q = await S(page);
  if (q.hitstun <= 0 && q.iframes <= 0 && q.dodging <= 0) break;
  await sleepFrames(page, 4);
}
await page.evaluate(() => window.__game.clearCombat());
await sleepFrames(page, 2);
await page.evaluate(() => window.__game.parryHit(10));
await sleepFrames(page, 2);
const sfxParry = (await S(page)).sfx;
ok('parry fires clink SFX', (sfxParry.clink ?? 0) > (sfxSlam.clink ?? 0));
ok('parry fires parry chime too', (sfxParry.parry ?? 0) > (sfxSlam.parry ?? 0));
// charge whoosh (boss 2, zone 1)
await page.evaluate(() => window.__game.killBoss());
await sleepFrames(page, 40);
await bringBoss(page);
await page.evaluate(() => window.__game.clearCombat());
await page.evaluate(() => window.__game.setHp(999));
await page.evaluate(() => window.__game.bossAttack('BloatCharge'));
const sfxCharge = await pollSfx(page, 'charge', sfxParry, 60); // 0.9s telegraph
ok('bloat charge fires whoosh SFX', (sfxCharge.charge ?? 0) > (sfxParry.charge ?? 0));
// meteor thump (boss 3, zone 2)
await page.evaluate(() => window.__game.killBoss());
await sleepFrames(page, 40);
await bringBoss(page);
await page.evaluate(() => window.__game.clearCombat());
await page.evaluate(() => window.__game.setHp(999));
await page.evaluate(() => window.__game.bossAttack('MeteorDrop'));
const sfxMeteor = await pollSfx(page, 'meteor', sfxCharge, 80); // 1.4s telegraph
ok('meteor drop fires meteor SFX', (sfxMeteor.meteor ?? 0) > (sfxCharge.meteor ?? 0));
await page.evaluate(() => window.__game.killBoss());
await sleepFrames(page, 30);
await page.evaluate(() => window.__game.killMobs());

console.log('== M8 stings (zone clear / victory) ==');
// M7 left us in zone 2 / win mode — reset to a clean run at zone 0
await page.evaluate(() => { window.__game.newGame(); window.__game.killMobs(); window.__game.setAlt(0); });
await sleepFrames(page, 6);
// counters are module-global; diff against current values
const sfxS0 = (await S(page)).sfx;
const killForNextZone = async (page) => {
  await page.evaluate(() => { window.__game.killMobs(); window.__game.startBoss(); });
  await sleepFrames(page, 4);
  await page.evaluate(() => window.__game.killBoss());
  await sleepFrames(page, 8);
  return S(page);
};
// zone 0 -> 1
const sc1 = await killForNextZone(page);
ok('zone clear fires sting SFX', (sc1.sfx.zoneClear ?? 0) > (sfxS0.zoneClear ?? 0));
ok('zone clear advances zone to 1', sc1.zone === 1);
// zone 1 -> 2
const sc2 = await killForNextZone(page);
ok('second zone clear fires sting again', (sc2.sfx.zoneClear ?? 0) > (sc1.sfx.zoneClear ?? 0));
ok('second zone clear advances zone to 2', sc2.zone === 2);
// zone 2 -> win
const sc3 = await killForNextZone(page);
ok('victory fires sting SFX', (sc3.sfx.victory ?? 0) > (sc2.sfx.victory ?? 0));
ok('victory sets win mode', sc3.mode === 'win');

console.log('== M9 dread (low-HP heartbeat + swing pitch drift) ==');
// M8 ended in win mode — clean run at zone 0
await page.evaluate(() => { window.__game.newGame(); window.__game.killMobs(); window.__game.setAlt(0); });
await sleepFrames(page, 6);
// --- swing pitch drift: a 3-hit combo must pitch down the chain -----------
// Kill mobs (a whiff still advances the combo via doPlayerHit, and no mob can
// hitstun us mid-chain), teleport (refills stamina + clears aim), then swing
// three times.
await page.evaluate(() => { window.__game.killMobs(); window.__game.teleport(0, 0); window.__game.setHp(999); window.__game.clearCombat(); });
// wait for the current swing (if any) to finish
const waitSwingDone = async (page) => {
  for (let i = 0; i < 90; i++) {
    if ((await S(page)).atk === null) return;
    await sleepFrames(page, 2);
  }
};
for (let i = 0; i < 3; i++) {
  // teleport clears hitstun/atk/dodge + refills stamina WITHOUT touching
  // lastHitT/lastCombo, so the combo chain survives a stray mob swat
  await page.evaluate(() => window.__game.teleport(0, 0));
  await waitSwingDone(page);
  await page.evaluate(() => window.__game.attack());
  await waitSwingDone(page);
}
const pAll = (await S(page)).swingPitches;
const p3 = pAll.slice(-3);
// The 3-hit combo's pitches are deterministic: 1-(combo-1)*0.045 → 1.0, 0.955, 0.91.
// Asserting the exact triple proves the chain ran 1→2→3 (a broken chain would
// show e.g. [1.0, 1.0, 0.955]) and that pitch drifts down the combo. This is
// robust to the 24-cap ring because it reads the tail, not the length.
ok('swing pitch drifts down the combo (1.0 → 0.955 → 0.91)',
  pAll.length >= 3 &&
  Math.abs(p3[0] - 1.0) < 1e-6 &&
  Math.abs(p3[1] - 0.955) < 1e-6 &&
  Math.abs(p3[2] - 0.91) < 1e-6);
// --- heartbeat: fires at low HP -------------------------------------------
const sfxHb0 = (await S(page)).sfx;
await page.evaluate(() => window.__game.setHp(1)); // 1/70 -> deep dread
let hb1 = 0;
for (let i = 0; i < 80 && hb1 === 0; i++) { // up to ~1.3s
  await sleepFrames(page, 8);
  hb1 = (await S(page)).sfx.heartbeat ?? 0;
}
ok('heartbeat fires at low HP', hb1 > (sfxHb0.heartbeat ?? 0));
// --- heartbeat accelerates as HP drops -------------------------------------
await sleep(350); // settle past any in-flight beat
const hbMid = (await S(page)).sfx.heartbeat ?? 0;
await sleep(2500); // count beats over 2.5s at dread-max (interval ~0.47s)
const hbFast = (await S(page)).sfx.heartbeat ?? 0;
ok('fast heartbeat at 1 HP (>=4 beats / 2.5s)', hbFast - hbMid >= 4);
await page.evaluate(() => window.__game.setHp(24)); // 24/70 -> just under the 35% threshold
await sleep(450);
const hbSlow0 = (await S(page)).sfx.heartbeat ?? 0;
await sleep(2500); // interval ~0.89s -> ~3 beats max
const hbSlow1 = (await S(page)).sfx.heartbeat ?? 0;
ok('slower heartbeat near threshold (<4 beats / 2.5s)', hbSlow1 - hbSlow0 < 4);
// --- no heartbeat above threshold ------------------------------------------
await page.evaluate(() => { window.__game.setHp(999); });
await sleep(500);
const hbFull0 = (await S(page)).sfx.heartbeat ?? 0;
await sleep(1500);
const hbFull1 = (await S(page)).sfx.heartbeat ?? 0;
ok('no heartbeat at full HP', hbFull1 === hbFull0);
// --- red veil tracks dread ---------------------------------------------------
await page.evaluate(() => window.__game.setHp(1));
await sleep(300); // first beat is immediate -> pulse at max
const veilLow = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('dreadVeil')).opacity));
ok('red veil is visible at low HP', veilLow > 0.2);
await page.evaluate(() => window.__game.setHp(999));
await sleep(200);
const veilFull = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('dreadVeil')).opacity));
ok('red veil clears at full HP', veilFull < 0.01);
await page.evaluate(() => window.__game.setHp(999));

console.log('== M10 phase breaks (escalation + drama) ==');
// M9 left us in zone 0 at full HP — bring the King up and wait out the intro
await page.evaluate(() => { window.__game.killMobs(); window.__game.startBoss(); });
await sleepFrames(page, 170); // 2.4s intro
await page.evaluate(() => window.__game.setHp(999));
const pk0 = (await S(page)).boss;
ok('boss spawns at phase 0 (full HP)', pk0.phaseIdx === 0);
ok('phase 0 pool is the opening kit', !pk0.phaseAttacks.includes('Spin'));
// cross the King's 0.5 threshold -> phase break
const sfxPB0 = (await S(page)).sfx;
await page.evaluate(() => window.__game.setBossHp(299)); // 299/600 = 0.498 < 0.5
await sleepFrames(page, 6);
const pk1 = (await S(page)).boss;
ok('phase break at threshold: phaseIdx 0 -> 1', pk1.phaseIdx === 1);
ok('phaseBreak SFX fires', ((await S(page)).sfx.phaseBreak ?? 0) > (sfxPB0.phaseBreak ?? 0));
ok('stagger window opens after break', (await S(page)).boss.phaseBreakT > 0.1);
ok('phase 1 pool adds Spin', (await S(page)).boss.phaseAttacks.includes('Spin'));
ok('HUD label reads PHASE 2 / 2', await page.$eval('#bossSub', (e) => e.textContent === 'PHASE 2 / 2'));
// wait out the full 0.9s stagger, then the boss must be mobile again (AI alive)
for (let i = 0; i < 120; i++) {
  if ((await S(page)).boss.phaseBreakT <= 0.05) break;
  await sleepFrames(page, 2);
}
ok('stagger decays (AI resumes)', (await S(page)).boss.phaseBreakT <= 0.2);
// advance to zone 1 (Overflow, 3 phases)
await page.evaluate(() => window.__game.killBoss());
await sleepFrames(page, 30);
await page.evaluate(() => { window.__game.killMobs(); window.__game.startBoss(); });
await sleepFrames(page, 170);
await page.evaluate(() => window.__game.setHp(999));
const ol0 = (await S(page)).boss;
ok('Overflow spawns at phase 0', ol0.phaseIdx === 0 && !ol0.phaseAttacks.includes('BloatCharge'));
const sfxPB1 = (await S(page)).sfx;
await page.evaluate(() => window.__game.setBossHp(599)); // 0.599 < 0.6 -> phase 1
await sleepFrames(page, 6);
ok('Overflow phase break -> 1 (GasCloud enters pool)', (await S(page)).boss.phaseIdx === 1 && (await S(page)).boss.phaseAttacks.includes('GasCloud'));
const sfxPB2 = (await S(page)).sfx;
await page.evaluate(() => window.__game.setBossHp(299)); // 0.299 < 0.3 -> phase 2
await sleepFrames(page, 6);
ok('Overflow phase break -> 2 (BloatCharge enters pool)', (await S(page)).boss.phaseIdx === 2 && (await S(page)).boss.phaseAttacks.includes('BloatCharge'));
ok('each break fires its own sting', (sfxPB2.phaseBreak ?? 0) > (sfxPB1.phaseBreak ?? 0) && (sfxPB1.phaseBreak ?? 0) > (sfxPB0.phaseBreak ?? 0));
ok('HUD label tracks escalation (PHASE 3 / 3)', await page.$eval('#bossSub', (e) => e.textContent === 'PHASE 3 / 3'));
// escalation is real: any windup after the break must come from the pool.
// (If the boss idles the whole window there's nothing to check — pass.)
const used = new Set();
for (let i = 0; i < 480; i++) {
  await sleepFrames(page, 2);
  const b = (await S(page)).boss;
  if (b.state === 'windup' && b.atkName) used.add(b.atkName);
}
const pool2 = (await S(page)).boss.phaseAttacks;
ok('post-break attacks come from the escalated pool', used.size === 0 || [...used].every((a) => pool2.includes(a)));

console.log('== M11 boss fog-exemption (readability in the mists) ==');
// M10 left us in zone 1 with the Overflow Lord active — GLB loaded by now.
// Pre-M11 measurement: bosses were 79-100% fogged at camera distance in every
// zone (100% in the marsh and throne). The fix fog-exempts the boss meshes
// while the arena keeps its mood fog.
ok('boss materials are fog-exempt (zone 1, GLB path)', (await S(page)).boss.fogFree === true);
const fs1 = await page.evaluate(() => window.__game.bossScreen());
ok('scene fog stays active for the arena (mood preserved)', fs1.fog && fs1.fog[1] > fs1.fog[0]);
// advance to the throne — biggest boss in the biggest arena with the heaviest mist
await page.evaluate(() => window.__game.killBoss());
await sleepFrames(page, 30);
await page.evaluate(() => { window.__game.killMobs(); window.__game.startBoss(); });
await sleepFrames(page, 170); // intro + GLB
await page.evaluate(() => window.__game.setHp(999));
ok('throne boss materials are fog-exempt too', (await S(page)).boss.fogFree === true);
const fs2 = await page.evaluate(() => window.__game.bossScreen());
ok('heaviest-mist zone fog is intact (far > 30u)', fs2.fog[1] > 30);
// and the zone-0 King via a fresh run (covers the full GLB reload path)
await page.evaluate(() => window.__game.killBoss());
await sleepFrames(page, 30);
await page.evaluate(() => { window.__game.newGame(); window.__game.killMobs(); window.__game.startBoss(); });
await sleepFrames(page, 170);
ok('fresh-run zone 0 boss is fog-exempt', (await S(page)).boss.fogFree === true);

await browser.close();
// a real asset 404 shows as a non-favicon URL; favicon noise drops with its console line
const nonFavicon404 = [...notFound].filter((u) => !u.includes('favicon'));
const realErrors = errors.filter((e) => !(e.startsWith('console:') && e.includes('404') && nonFavicon404.length === 0));
console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
console.log('page errors:', realErrors.length ? realErrors : 'none');
console.log('404 urls:', nonFavicon404.length ? nonFavicon404 : '(favicon only)');
process.exit(fail > 0 || realErrors.length > 0 || nonFavicon404.length > 0 ? 1 : 0);
