// verify the new feel v2: walk / swing / boss-lock frames with controlled camera
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader','--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(2200);
await page.click('#btnNew');
await sleep(600);
// 1) WALK: camera set behind, hold W, capture mid-stride
await page.evaluate(() => window.__game.setCam(0.79, 0.32));
await page.keyboard.down('KeyW');
await sleep(240);
await page.screenshot({ path: 'shot-walk.png' });
await page.keyboard.up('KeyW');
await sleep(500);
// 2) SWING: spawn biber in front, lock, snap 2u away, camera set, start attack, capture the backswing (f~0.25 => ~35ms into 0.33s brush swing)
await page.evaluate(() => { window.__game.spawnMob('biber'); window.__game.lock(true); window.__game.snapLocked(); });
await sleep(100);
await page.evaluate(() => { window.__game.attack(); });
await sleep(55); // mid anticipation->chop transition
await page.screenshot({ path: 'shot-swing.png' });
await sleep(300);
// 2b) capture the follow-through chop (f~0.45 => hit moment)
await page.evaluate(() => window.__game.attack());
await sleep(130);
await page.screenshot({ path: 'shot-swing2.png' });
// 3) BOSS + LOCK reticle: camera behind player looking at boss
await page.evaluate(() => { window.__game.startBoss(); });
await sleep(2600);
await page.evaluate(() => { window.__game.nearBoss(); window.__game.lock(true); window.__game.setCam(Math.PI, 0.35); });
await sleep(900);
await page.screenshot({ path: 'shot-boss-lock.png' });
console.log('feels-shots v2 done');
await browser.close();
