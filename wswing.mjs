import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.goto('http://localhost:5188', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.state?.()?.model?.loaded, { timeout: 20000 });
await page.evaluate(() => {
  document.getElementById('panelTitle').style.display = 'none';
  window.__game.cinematic(true);
  window.__game.newGame();
});
await new Promise(r => setTimeout(r, 1200));
// capture mid-swing: trigger attack, screenshot ~35% into the clip
await page.evaluate(() => { window.__game.setCam(-Math.PI / 2.4, 0.15); window.__game.camDist(2.4); });
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => window.__game.attack());
await new Promise(r => setTimeout(r, 280));
await page.screenshot({ path: 'swing2.png' });
// front rest pose
await new Promise(r => setTimeout(r, 900));
await page.evaluate(() => window.__game.setCam(0, 0.12));
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: 'front2.png' });
const s = await page.evaluate(() => window.__game.state());
console.log('anim:', s.model.anim, '| atk:', JSON.stringify(s.atk ?? null));
await browser.close();
