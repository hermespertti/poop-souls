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
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => {
  window.__game.setCam(-Math.PI / 2, 0.12);
  window.__game.camDist(2.2);
});
await new Promise(r => setTimeout(r, 500));
const info = await page.evaluate(() => {
  const player = window.__game.playerObj();
  player.updateWorldMatrix(true, true);
  const out = { playerPos: player.position.toArray().map(v => +v.toFixed(3)), meshes: [] };
  player.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.matrixWorld.elements;
    out.meshes.push({ name: o.name || '(unnamed)', pos: [m[12], m[13], m[14]].map(v => +v.toFixed(3)) });
  });
  return out;
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: 'wp-shot.png' });
await browser.close();
