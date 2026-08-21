// verify fixed facing + weapon/shield visibility
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader','--window-size=1200,700'],
});
const page = await browser.newPage();
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(2500);
await page.evaluate(() => { document.getElementById('panelTitle').style.display = 'none'; window.__game.newGame(); window.__game.killMobs(); window.__game.teleport(0, 0); window.__game.setCam(0, 0.42); window.__game.cinematic(true); });
await sleep(1200);
// front view: camera at yaw 0 sits at -Z looking +Z => we see the +Z side (the face)
await page.screenshot({ path: 'verify-front.png' });
// profile view from the right side (camera +X looking -X)
await page.evaluate(() => window.__game.setCam(Math.PI / 2, 0.35));
await sleep(700);
await page.screenshot({ path: 'verify-side.png' });
// back view: camera at +Z looking -Z
await page.evaluate(() => window.__game.setCam(Math.PI, 0.4));
await sleep(700);
await page.screenshot({ path: 'verify-back.png' });
// swing: poll anim
await page.evaluate(() => window.__game.setCam(0.9, 0.45));
let saw = false;
for (let i = 0; i < 60 && !saw; i++) {
  await page.evaluate(() => window.__game.attack());
  await sleep(30);
  const a = await page.evaluate(() => window.__game.state().model.anim);
  if (a === 'Attack1') { saw = true; await page.screenshot({ path: 'verify-swing.png' }); }
}
// shrine with cursor
await page.evaluate(() => { window.__game.cinematic(false); window.__game.openShrine(); });
await sleep(600);
await page.screenshot({ path: 'verify-shrine.png' });
console.log('saw swing:', saw);
await browser.close();
