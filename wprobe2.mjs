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
const info = await page.evaluate(() => {
  const player = window.__game.playerObj();
  player.updateWorldMatrix(true, true);
  const out = { handR: null, handL: null, allMeshes: [], nonBone: [] };
  const handR = player.getObjectByName('Hand.R');
  const handL = player.getObjectByName('Hand.L');
  out.handR = handR ? { children: handR.children.map(c => c.type + ':' + (c.name || c.geometry?.type || '?')) } : null;
  out.handL = handL ? { children: handL.children.map(c => c.type + ':' + (c.name || c.geometry?.type || '?')) } : null;
  player.traverse((o) => {
    if (o.isMesh) {
      const m = o.matrixWorld.elements;
      out.allMeshes.push({ n: o.name || o.geometry?.type || '?', p: [m[12], m[13], m[14]].map(v => +v.toFixed(2)) });
    }
  });
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
