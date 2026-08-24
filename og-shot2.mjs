// OG capture v2 — hero frame: Porcelain King mid-phase-break (red glow peak +
// fog-exempt + accent light), low-angle close camera, HUD hidden for a clean card.
// Order matters: trigger break -> wait to the emissive peak -> hide HUD -> poseBoss
// (final render) -> screenshot.
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader','--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(2500);
await page.click('#btnNew');
await sleep(900);
await page.evaluate(() => { window.__game.killMobs(); window.__game.startBoss(); });
await sleep(2800); // intro + GLB
// trigger the phase break; slow-mo (0.4) stretches the real-time stagger window,
// so the red emissive peak holds for ~2s wall-clock — plenty to frame it
await page.evaluate(() => { window.__game.setBossHp(299); window.__game.setHp(12); });
await sleep(500);
// hide HUD for a clean card (before the final render)
await page.evaluate(() => {
  for (const id of ['vignette', 'hud', 'hudRight', 'bossWrap', 'interact', 'hint', 'toast', 'dreadVeil', 'dmgWrap']) {
    const el = document.getElementById(id); if (el) el.style.visibility = 'hidden';
  }
});
await sleep(200);
const probe = await page.evaluate(() => window.__game.poseBoss(4.5, 6.5, 0.14));
await page.screenshot({ path: 'og-raw.png' });
console.log('og-raw.png written', JSON.stringify(probe));
await browser.close();
