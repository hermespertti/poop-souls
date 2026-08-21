import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader','--window-size=1600,900'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('https://hermespertti.github.io/poop-souls/', { waitUntil: 'domcontentloaded' });
await sleep(3000);
const r = {
  title: (await page.title()).includes('POOP SOULS'),
  canvas: await page.evaluate(() => !!document.getElementById('gameCanvas')),
  game: await page.evaluate(() => !!window.__game),
  og: await page.evaluate(async () => { try { const res = await fetch('/og-image.png'); return res.ok; } catch { return false; } }),
};
await page.evaluate(() => window.__game.newGame());
await sleep(800);
r.play = (await page.evaluate(() => window.__game.state().mode)) === 'play';
console.log(JSON.stringify(r));
console.log('errors:', errors.filter(e => !e.includes('favicon')).length ? errors : 'none');
await browser.close();
