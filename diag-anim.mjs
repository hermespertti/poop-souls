import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepFrames = async (page, n = 10) =>
  page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
const S = (page) => page.evaluate(() => window.__game.state());
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto('http://localhost:5188/', { waitUntil: 'domcontentloaded' });
await sleep(2500);
await page.evaluate(() => window.__game.newGame());
await sleep(1500);
let st = await S(page);
console.log('T1 model:', JSON.stringify(st.model));
await page.keyboard.down('KeyW');
await sleepFrames(page, 30);
st = await S(page);
console.log('T2 moving: moveAmt-anim:', st.model.anim, 'pos:', JSON.stringify(st.pos));
await page.keyboard.up('KeyW');
await sleepFrames(page, 30);
st = await S(page);
console.log('T3 after stop:', st.model.anim);
await page.evaluate(() => window.__game.attack());
for (let i = 0; i < 8; i++) {
  await sleepFrames(page, 5);
  const s2 = await S(page);
  console.log(`T4 f${i * 5}: atk=${s2.state ? '' : ''}anim=${s2.model.anim} hitstun=${s2.hitstun} mode=${s2.mode}`);
}
console.log('errors:', errors.slice(0, 8));
await browser.close();
