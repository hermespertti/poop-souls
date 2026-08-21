import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader','--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(2200);
await page.click('#btnNew');
await sleep(700);
// cinematic hero frame: boss fight, both near death
await page.evaluate(() => { window.__game.startBoss(); });
await sleep(2600);
await page.evaluate(() => {
  window.__game.nearBoss();
  window.__game.setHp(12);        // player wounded — bar at ~17%
  window.__game.setBossHp(210);   // boss at 35%
  window.__game.cinematic(true);
});
await sleep(1200);
await page.screenshot({ path: 'og-raw.png' });
console.log('og-raw.png written');
await browser.close();
