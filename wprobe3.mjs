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
await new Promise(r => setTimeout(r, 1000));
const info = await page.evaluate(() => {
  const player = window.__game.playerObj();
  player.updateWorldMatrix(true, true);
  const out = { playerType: player.type, tree: [], hands: [] };
  player.traverse((o) => {
    out.tree.push(o.type + '|' + o.name + '|mesh:' + !!o.isMesh + '|bone:' + !!o.isBone);
    if (/hand/i.test(o.name || '')) {
      o.updateWorldMatrix(true, false);
      const m = o.matrixWorld.elements;
      out.hands.push({ name: o.name, type: o.type, pos: [m[12], m[13], m[14]].map(v => +v.toFixed(3)), children: o.children.length });
    }
  });
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
