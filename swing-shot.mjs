// mid-swing close-up: sample several timestamps, keep the one where anim=Attack1
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader','--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(2500);
await page.click('#btnNew');
await sleep(800);
await page.evaluate(() => { window.__game.setHp(999); window.__game.teleport(-18, -18); window.__game.clearCombat(); });
await sleep(300);
await page.evaluate(() => window.__game.setCam(0.79, 0.32));
await sleep(400);
// idle close-up first
await page.screenshot({ path: 'close-idle.png', clip: { x: 450, y: 100, width: 700, height: 800 } });
// attack, poll anim state, shoot at the moment it flips to Attack1+ and again 120ms later
let fired = false, got = null;
for (let i = 0; i < 30; i++) {
  if (!fired) { await page.evaluate(() => window.__game.attack()); fired = true; }
  const st = await page.evaluate(() => window.__game.state().model?.anim);
  if (st && st.startsWith('Attack')) { got = st; break; }
  await sleep(20);
}
console.log('captured at anim:', got);
await page.screenshot({ path: 'close-swing-a.png', clip: { x: 450, y: 100, width: 700, height: 800 } });
await sleep(120);
console.log('120ms later:', await page.evaluate(() => window.__game.state().model?.anim));
await page.screenshot({ path: 'close-swing-b.png', clip: { x: 450, y: 100, width: 700, height: 800 } });
console.log('swing-crop done');
await browser.close();
