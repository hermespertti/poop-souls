// ground truth: bone world positions, visor centroid vs facing, pre-fix screenshots
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader','--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(2500);
await page.click('#btnNew');
await sleep(1500);
const info = await page.evaluate(() => {
  const g = window.__game;
  const st = g.state();
  if (!st.model || !st.model.loaded) return { loaded: false };
  // find the player group: we need access to internals — use scene traversal via a debug hook?
  // Instead: use state's yaw + a fresh walk to measure: move W, compare pos delta to yaw.
  return { loaded: true, yaw: st.yaw };
});
console.log('model loaded:', JSON.stringify(info));
// bone positions — expose via a temporary evaluate that walks the scene
const bones = await page.evaluate(() => {
  // __game doesn't expose the scene; hack: use the reticle trick — no. Re-read main.ts: scene is module-scoped.
  // Use a different approach: read from the GLB's world positions by walking THREE via the canvas's renderer? Not exposed.
  // So: teleport + walk test instead (world-space ground truth).
  const g = window.__game;
  g.setHp(999); g.teleport(-18, -18); g.clearCombat();
  return { ok: true };
});
console.log(bones);
// GROUND TRUTH 1: walk direction vs facing. Set camera yaw so camera looks along +Z world...
// teleport resets yaw to 0. Character faces yaw=0 => local +Z world. Walk with W: camera-relative!
// setCam(0, 0.32) => camera forward = (sin0, cos0) = +Z. W moves along +Z.
await page.evaluate(() => { window.__game.setCam(0, 0.32); window.__game.clearCombat(); });
await sleep(100);
const p0 = await page.evaluate(() => { const s = window.__game.state(); return { x: s.x ?? null, z: s.z ?? null, yaw: s.yaw }; });
// state may not have x/z — check cam or use pos via new hook? read what state has
console.log('state keys sample:', JSON.stringify(Object.keys(p0)));
await page.keyboard.down('KeyW');
await sleep(400);
const p1 = await page.evaluate(() => { const s = window.__game.state(); return s; });
await page.keyboard.up('KeyW');
console.log('post-walk:', JSON.stringify({ yaw: p1.yaw, cam: p1.cam }));
// SCREENSHOTS: behind (camera yaw 0, char moved +Z so camera behind = yaw 0 looking +Z at char from -Z side)
await page.screenshot({ path: 'diag-behind.png', clip: { x: 450, y: 100, width: 700, height: 800 } });
// and from the FRONT: camera yaw = PI (looking -Z), char at +Z side of it
await page.evaluate(() => { window.__game.setCam(Math.PI, 0.32); });
await sleep(500);
await page.screenshot({ path: 'diag-front.png', clip: { x: 450, y: 100, width: 700, height: 800 } });
console.log('diag done');
await browser.close();
