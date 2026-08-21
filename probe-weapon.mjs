import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader','--window-size=1200,700'],
});
const page = await browser.newPage();
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(3000);
const info = await page.evaluate(() => {
  document.getElementById('panelTitle').style.display = 'none';
  window.__game.newGame();
  window.__game.killMobs();
  window.__game.teleport(0, 0);
  window.__game.setCam(0, 0.35);
  window.__game.camDist(2.6);
  window.__game.cinematic(true);
  return new Promise((res) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // walk the scene graph for named nodes
      const out = { };
      out.model = window.__game.state().model;
      res(out);
    }));
  });
});
console.log(JSON.stringify(info));
await sleep(800);
const probe = await page.evaluate(() => {
  // re-enter the game scene via the exposed hooks only — but we can reach three objects
  // through the module-scope via a trick: traverse from the player through __game? not exposed.
  return { cam: window.__game.state().cam, pos: window.__game.state().pos };
});
console.log(JSON.stringify(probe));
await browser.close();
