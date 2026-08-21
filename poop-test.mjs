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

console.log('== weapon switching ==');
await page.evaluate(() => window.__game.weapon(1));
await sleepFrames(page);
st = await S(page);
ok('switch to Flanged Seat', st.weaponName === 'Flanged Seat' && st.weapon === 1);
await page.evaluate(() => window.__game.weapon(3));
await sleepFrames(page);
st = await S(page);
ok('switch to The Plunger', st.weaponName === 'The Plunger' && st.weapon === 3);

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

console.log('== zone 2 mobs ==');
st = await S(page);
ok('marsh mobs spawned', st.mobs.length === 6);
ok('marsh has Mire Farts', st.mobs.some((m) => m.id === 'fart'));
ok('marsh has Gloops', st.mobs.some((m) => m.id === 'gloop'));

console.log('== shrine / progression ==');
await page.evaluate(() => window.__game.openShrine());
await sleepFrames(page, 3);
st = await S(page);
ok('shrine opens (mode=shrine)', st.mode === 'shrine');
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

await browser.close();
const realErrors = errors.filter((e) => !e.includes('favicon'));
console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
console.log('page errors:', realErrors.length ? realErrors : 'none');
process.exit(fail > 0 || realErrors.length > 0 ? 1 : 0);
