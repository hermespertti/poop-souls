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
const info = await page.evaluate(() => {
  const player = window.__game.playerObj();
  player.updateWorldMatrix(true, true);
  // walk the GLB subtree only (skip the procedural fallback which is now empty)
  const box = { minX: 99, maxX: -99, minY: 99, maxY: -99, minZ: 99, maxZ: -99 };
  const v = player.position.clone();
  player.traverse((o) => {
    if (!o.isMesh) return;
    o.updateWorldMatrix(true, false);
    const attr = o.geometry.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      v.set(attr.getX(i), attr.getY(i), attr.getZ(i)).applyMatrix4(o.matrixWorld);
      box.minX = Math.min(box.minX, v.x); box.maxX = Math.max(box.maxX, v.x);
      box.minY = Math.min(box.minY, v.y); box.maxY = Math.max(box.maxY, v.y);
      box.minZ = Math.min(box.minZ, v.z); box.maxZ = Math.max(box.maxZ, v.z);
    }
  });
  const r = (o) => Object.fromEntries(Object.entries(o).map(([k, val]) => [k, +Number(val).toFixed(3)]));
  return r(box);
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
