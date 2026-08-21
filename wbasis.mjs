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
  const out = {};
  // find the weaponPivot: the Group parent of a CylinderGeometry mesh under HandR
  const handR = player.getObjectByName('HandR');
  const handL = player.getObjectByName('HandL');
  const basis = (obj) => {
    obj.updateWorldMatrix(true, false);
    const e = obj.matrixWorld.elements;
    return {
      pos: [e[12], e[13], e[14]].map(v => +v.toFixed(3)),
      colX: [+e[0].toFixed(2), +e[1].toFixed(2), +e[2].toFixed(2)],
      colY: [+e[4].toFixed(2), +e[5].toFixed(2), +e[6].toFixed(2)],
      colZ: [+e[8].toFixed(2), +e[9].toFixed(2), +e[10].toFixed(2)],
    };
  };
  out.handR = basis(handR);
  out.handL = basis(handL);
  if (handR.children.length) out.handRChild = basis(handR.children[0]);
  if (handL.children.length) out.handLChild = basis(handL.children[0]);
  // player frame
  out.player = basis(player);
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
