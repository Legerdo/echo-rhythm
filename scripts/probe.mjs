// Dev probe: open the built game, drive it with keys, dump state + console, save screenshots.
// usage: node scripts/probe.mjs "<query>" <seconds> <shotPrefix> [keys...]
import { chromium } from '@playwright/test';

const [query = '', secs = '6', prefix = 'probe', ...keys] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`);
});
await page.goto(`http://127.0.0.1:4173/${query}`);
await page.waitForTimeout(800);
for (const k of keys) {
  if (k.startsWith('wait')) await page.waitForTimeout(Number(k.slice(4)));
  else await page.keyboard.press(k);
  await page.waitForTimeout(250);
}
const total = Number(secs) * 1000;
const shots = 3;
for (let i = 0; i < shots; i++) {
  await page.waitForTimeout(total / shots);
  await page.screenshot({ path: `test-results/${prefix}-${i}.png` });
  console.log(JSON.stringify(await page.evaluate(() => window.__AB?.state())));
}
console.log(logs.slice(-15).join('\n'));
await browser.close();
