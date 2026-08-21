// zoomed verification: facing, weapon, shield
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader','--window-size=1200,700'],
});
const page = await browser.newPage();
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(3000);
await page.evaluate(() => {
  document.getElementById('panelTitle').style.display = 'none';
  window.__game.newGame();
  window.__game.killMobs();
  window.__game.teleport(0, 0);
  window.__game.setCam(0, 0.35);
  window.__game.camDist(2.6);
  window.__game.cinematic(true);
});
await sleep(1500);
await page.screenshot({ path: 'zoom-front.png' });
// profile from character's right side
await page.evaluate(() => { window.__game.setCam(Math.PI / 2, 0.15); });
await sleep(600);
await page.screenshot({ path: 'zoom-side.png' });
// back view
await page.evaluate(() => { window.__game.setCam(Math.PI, 0.3); });
await sleep(600);
await page.screenshot({ path: 'zoom-back.png' });
// swing from 3/4 angle
await page.evaluate(() => { window.__game.setCam(0.6, 0.35); });
let saw = false;
for (let i = 0; i < 80 && !saw; i++) {
  await page.evaluate(() => window.__game.attack());
  await sleep(25);
  const a = await page.evaluate(() => window.__game.state().model.anim);
  if (a === 'Attack1') { saw = true; await page.screenshot({ path: 'zoom-swing.png' }); }
}
console.log('swing shot:', saw);
await browser.close();
