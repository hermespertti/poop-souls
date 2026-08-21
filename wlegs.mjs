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
  const v = new (player.position.constructor)();
  let minY = 99, maxY = -99;
  const boneY = {};
  player.traverse((o) => {
    if (o.isBone && /Foot|Calf|Thigh|Hips/i.test(o.name)) {
      o.getWorldPosition(v); boneY[o.name] = +v.y.toFixed(3);
    }
    if (o.isMesh && o.geometry?.position) {
      o.geometry.attributes.position.toArray(); // ensure computed
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
    }
  });
  return { minY: +minY.toFixed(3), maxY: +maxY.toFixed(3), boneY };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
