// verify GLB character: walk / swing / dodge / block / boss frames
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader','--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(2500);
await page.click('#btnNew');
await sleep(800);
// reset to clear corner, camera behind
await page.evaluate(() => { window.__game.setHp(999); window.__game.teleport(-18, -18); });
await sleep(300);
// 1) WALK mid-stride
await page.evaluate(() => window.__game.setCam(0.79, 0.32));
await page.keyboard.down('KeyW');
await sleep(240);
await page.screenshot({ path: 'shot-walk.png' });
await page.keyboard.up('KeyW');
await sleep(500);
// 2) SWING backswing
await page.evaluate(() => { window.__game.clearCombat(); window.__game.spawnMob('biber'); window.__game.lock(true); window.__game.snapLocked(); });
await sleep(100);
await page.evaluate(() => window.__game.attack());
await sleep(55);
await page.screenshot({ path: 'shot-swing.png' });
await sleep(300);
// 3) DODGE roll mid-spin
await page.evaluate(() => { window.__game.clearCombat(); window.__game.setCam(0.79, 0.32); });
await sleep(50);
await page.evaluate(() => window.__game.dodge());
await sleep(120);
await page.screenshot({ path: 'shot-dodge.png' });
await sleep(400);
// 4) BLOCK guard pose (hold RMB)
await page.evaluate(() => { window.__game.clearCombat(); window.__game.setCam(0.79, 0.32); window.__game.damagePlayer(1, true); });
await sleep(350); // let hitstun clear
await page.mouse.down({ button: 'right' });
await sleep(400);
await page.screenshot({ path: 'shot-block.png' });
await page.mouse.up({ button: 'right' });
await sleep(300);
// 5) BOSS + lock
await page.evaluate(() => { window.__game.startBoss(); });
await sleep(2600);
await page.evaluate(() => { window.__game.nearBoss(); window.__game.lock(true); window.__game.setCam(Math.PI, 0.35); });
await sleep(900);
await page.screenshot({ path: 'shot-boss-lock.png' });
console.log('glb-shots done');
await browser.close();
