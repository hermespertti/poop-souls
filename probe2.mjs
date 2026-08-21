import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader','--window-size=1200,700'],
});
const page = await browser.newPage();
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(3000);
await page.evaluate(() => {
  document.getElementById('panelTitle').style.display = 'none';
  window.__game.newGame(); window.__game.killMobs();
  window.__game.teleport(0, 0); window.__game.setCam(0, 0.35);
  window.__game.camDist(2.6); window.__game.cinematic(true);
});
await sleep(2000);
const info = await page.evaluate(() => {
  const p = window.__game.playerObj();
  const V = (o, n) => { const v = new (o.position.constructor)(); o.getWorldPosition(v); return { n, x:+v.x.toFixed(2), y:+v.y.toFixed(2), z:+v.z.toFixed(2), vis: o.visible }; };
  const out = { player: V(p, 'player'), children: [] };
  const visit = (o, d) => {
    if (d > 4) return;
    if (o.name) out.children.push({ n: o.name, d, wp: (o.position && o.isObject3D) ? (() => { const v = new p.position.constructor(); o.getWorldPosition(v); return { x:+v.x.toFixed(2), z:+v.z.toFixed(2), y:+v.y.toFixed(2) }; })() : null });
    for (const c of o.children) visit(c, d + 1);
  };
  visit(p, 0);
  // find visor mesh by material name
  const meshes = [];
  p.traverse((o) => { if (o.isMesh) { const m = o.material; const v = new p.position.constructor(); o.getWorldPosition(v); const bb = new (o.geometry.constructor)(); meshes.push({ name: o.name, mat: m && m.name, x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) }); } });
  out.meshes = meshes;
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
