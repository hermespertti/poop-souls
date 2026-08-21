// close-up crops of GLB character: idle / block / swing — with anim state printout
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
// locate character on screen: full shot for reference
await page.screenshot({ path: 'close-idle-full.png' });
const anim = () => page.evaluate(() => window.__game.state().model?.anim);
// 1) BLOCK close-up: hold RMB, confirm clip, crop center
await page.mouse.down({ button: 'right' });
await sleep(700);
console.log('block anim:', await anim());
await page.screenshot({ path: 'close-block.png', clip: { x: 450, y: 100, width: 700, height: 800 } });
await page.mouse.up({ button: 'right' });
await sleep(600);
// 2) SWING close-up: attack, capture at downswing (~0.4s in)
await page.evaluate(() => { window.__game.clearCombat(); });
await sleep(100);
await page.evaluate(() => window.__game.attack());
await sleep(400);
console.log('swing anim:', await anim());
await page.screenshot({ path: 'close-swing.png', clip: { x: 450, y: 100, width: 700, height: 800 } });
console.log('closeups done');
await browser.close();
