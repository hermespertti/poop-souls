// OG final calibration: boss centered, player offset so it doesn't block, strobe peak
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepFrames = async (page, n = 10) => {
  await page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
};
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900'],
});
const page = await browser.newPage();
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(2500);
await page.click('#btnNew');
await sleep(500);
await page.evaluate(() => window.__game.startBoss());
await sleep(2800);
await page.evaluate(() => { window.__game.setHp(30); window.__game.setBossHp(210); window.__game.killMobs(); });

async function take(name, place, yaw, pitch, dist) {
  await page.evaluate((pl, y, p, d) => {
    const g = window.__game;
    const s = g.state();
    const bx = s.boss.x, bz = s.boss.z;
    // player at (bx+pl[0], bz+pl[1]), facing the boss
    g.teleport(bx + pl[0], bz + pl[1]); g.setAlt(0);
    g.yaw = Math.atan2(bx - (bx + pl[0]), bz - (bz + pl[1]));
    g.setCam(y, p); g.camDist(d);
    g.cinematic(true);
  }, place, yaw, pitch, dist);
  await sleep(450);
  await page.evaluate(() => window.__game.bossAttack('SeatSlam'));
  await sleepFrames(page, 50); // 0.83s strobe peak
  await page.evaluate(() => window.__game.attack());
  await sleepFrames(page, 8);
  await page.screenshot({ path: name });
}

// L1: player offset left of the boss line, camera behind player — boss center-right, player left foreground
await take('og-l1.png', [1.5, 5.5], Math.PI, 0.22, 5.5);
// L2: player directly in front, lower pitch so the player is visible in the bottom frame, boss above
await take('og-l2.png', [0, 6], Math.PI, 0.3, 4.5);
// L3: player offset right, slightly further out
await take('og-l3.png', [-1.5, 5.5], Math.PI, 0.22, 5.5);

console.log('og-l1/l2/l3 written');
await browser.close();
