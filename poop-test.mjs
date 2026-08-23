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
await page.evaluate(() => window.__game.dodge());
await sleepFrames(page, 6);
st = await S(page);
ok('dodge clip on dodge', st.model && st.model.anim === 'Dodge');
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
await page.evaluate(() => window.__game.startBoss());
await sleepFrames(page, 5);
st = await S(page);
ok('boss active: The Porcelain King', st.boss && st.boss.name === 'The Porcelain King' && st.boss.active === true);
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

await browser.close();
// a real asset 404 shows as a non-favicon URL; favicon noise drops with its console line
const nonFavicon404 = [...notFound].filter((u) => !u.includes('favicon'));
const realErrors = errors.filter((e) => !(e.startsWith('console:') && e.includes('404') && nonFavicon404.length === 0));
console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
console.log('page errors:', realErrors.length ? realErrors : 'none');
console.log('404 urls:', nonFavicon404.length ? nonFavicon404 : '(favicon only)');
process.exit(fail > 0 || realErrors.length > 0 || nonFavicon404.length > 0 ? 1 : 0);
