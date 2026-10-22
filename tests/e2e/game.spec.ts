import { expect, test, type Page } from '@playwright/test';

type State = {
  screen: string;
  floor: number;
  floorId: string | null;
  turn: number;
  hp: number;
  px: number;
  py: number;
  beats: number;
  dead: boolean;
  saved: boolean;
  boss: { hp: number; phase: number } | null;
  running: boolean;
  next: number;
  bpm: number;
  ctxState: string;
};

const errors: string[] = [];

async function open(page: Page, query: string): Promise<void> {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__AB?.screen === 'press', null, { timeout: 15000 });
}

const st = (page: Page): Promise<State> => page.evaluate(() => (window as any).__AB.state());
const waitFor = (page: Page, fn: string, timeout = 30000) => page.waitForFunction(fn, null, { timeout, polling: 100 });

async function toTitle(page: Page): Promise<void> {
  await page.keyboard.press('Enter');
  await waitFor(page, `window.__AB.screen === 'title'`);
}

async function newRun(page: Page): Promise<void> {
  await toTitle(page);
  // "새 런 시작" is the first item unless a saved run exists
  const s = await st(page);
  if (s.saved) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitFor(page, `window.__AB.screen === 'play' && window.__AB.state().running`);
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test('boots, starts audio on a key press, music is audible in the graph, no console errors', async ({ page }) => {
  await open(page, '?seed=3');
  await toTitle(page);
  const s = await st(page);
  expect(s.ctxState).toBe('running');
  await page.waitForTimeout(1500);
  const lvl = await page.evaluate(() => (window as any).__AB.audioLevel());
  expect(lvl).toBeGreaterThan(0.001);
  await page.screenshot({ path: 'test-results/e2e-title.png' });
  expect(errors).toEqual([]);
});

test('beat clock: turns follow the audio clock with no accumulated drift (40s)', async ({ page }) => {
  await open(page, '?seed=3');
  await newRun(page);
  await page.waitForTimeout(3000); // past the count-in
  const samples: { lag: number; next: number; t: number }[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const d = await page.evaluate(() => (window as any).__AB.drift());
    samples.push({ ...d, t: Date.now() });
    await page.waitForTimeout(250);
  }
  const lags = samples.map((s) => s.lag);
  // the next unresolved beat is always within one beat of what is being heard
  expect(Math.max(...lags)).toBeLessThan(1.0);
  expect(Math.min(...lags)).toBeGreaterThan(-1.2);
  const first = samples[0];
  const last = samples[samples.length - 1];
  const s = await st(page);
  const expected = ((last.t - first.t) / 1000) * (s.bpm / 60);
  expect(Math.abs(last.next - first.next - expected)).toBeLessThan(1.5);
  expect(errors).toEqual([]);
});

test('key auto-repeat and mashing never move more than one tile per beat', async ({ page }) => {
  await open(page, '?seed=3');
  await newRun(page);
  await page.waitForTimeout(2600);
  const a = await st(page);
  // hold the key: Playwright sends repeated keydowns with repeat=true
  for (let i = 0; i < 10; i++) await page.keyboard.down('ArrowRight');
  await page.keyboard.up('ArrowRight');
  // mash within ~120ms
  for (let i = 0; i < 6; i++) await page.keyboard.press('KeyD');
  const b = await st(page);
  const beats = b.turn - a.turn;
  expect(b.px - a.px).toBeLessThanOrEqual(Math.max(1, beats));
  expect(b.px - a.px).toBeLessThanOrEqual(2);
});

test('pause freezes turns and audio; resume continues after a count-in; hidden tab auto-pauses', async ({ page }) => {
  await open(page, '?seed=3');
  await newRun(page);
  await page.waitForTimeout(3000);
  await page.keyboard.press('Escape');
  await waitFor(page, `window.__AB.screen === 'pause'`);
  const p0 = await st(page);
  await page.waitForTimeout(2500);
  const p1 = await st(page);
  expect(p1.turn).toBe(p0.turn);
  expect(p1.ctxState).toBe('suspended');
  await page.keyboard.press('Enter');
  await waitFor(page, `window.__AB.screen === 'play'`);
  await page.waitForTimeout(800);
  const r0 = await st(page);
  expect(r0.turn - p1.turn).toBeLessThanOrEqual(1); // still counting in, no burst of turns
  await page.waitForTimeout(4000);
  const r1 = await st(page);
  expect(r1.turn).toBeGreaterThan(r0.turn);
  // emulate tab switch
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitFor(page, `window.__AB.screen === 'pause'`);
  expect(errors).toEqual([]);
});

test('death leads to a game over screen and retry starts a fresh run', async ({ page }) => {
  await open(page, '?seed=8&debug=1&floor=6&hp=1');
  await newRun(page);
  await waitFor(page, `window.__AB.state().dead === true`, 90000);
  await waitFor(page, `window.__AB.screen === 'gameover'`, 10000);
  await page.screenshot({ path: 'test-results/e2e-gameover.png' });
  const s = await st(page);
  expect(s.saved).toBe(false);
  await page.keyboard.press('Enter'); // 같은 시드로 다시
  await waitFor(page, `window.__AB.screen === 'play' && window.__AB.state().running && !window.__AB.state().dead`);
  expect((await st(page)).hp).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('clearing a floor saves the run; reload offers continue at the next floor', async ({ page }) => {
  await open(page, '?seed=4&autoplay=1');
  await newRun(page);
  await waitFor(page, `window.__AB.state().floorId === '1-2' && window.__AB.screen === 'play'`, 120000);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForFunction(() => (window as any).__AB?.screen === 'press');
  await toTitle(page);
  const s = await st(page);
  expect(s.saved).toBe(true);
  await page.screenshot({ path: 'test-results/e2e-continue.png' });
  await page.keyboard.press('Enter'); // 이어하기
  await waitFor(page, `window.__AB.screen === 'play'`);
  expect((await st(page)).floorId).toBe('1-2');
  expect(errors).toEqual([]);
});

test('full run under autoplay: every floor, the boss and the ending through the real input path', async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  await open(page, '?seed=11&autoplay=1');
  await newRun(page);
  const seen = new Set<string>();
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < 18 * 60 * 1000) {
    const s = await st(page);
    if (s.screen === 'play' && s.floorId && !seen.has(s.floorId)) {
      seen.add(s.floorId);
      await page.waitForTimeout(6000);
      await page.screenshot({ path: `test-results/e2e-floor-${s.floorId}.png` });
    }
    const line = `${s.screen} ${s.floorId} hp=${s.hp} boss=${s.boss?.hp ?? '-'}`;
    if (line !== last) {
      console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', line);
      last = line;
    }
    if (s.screen === 'gameover') break;
    if (s.screen === 'ending') {
      await page.waitForTimeout(20000);
      await page.screenshot({ path: 'test-results/e2e-ending-a.png' });
      await page.waitForFunction(() => (window as any).__AB.state().screen === 'ending', null, { timeout: 5000 });
      await page.waitForTimeout(16000);
      await page.screenshot({ path: 'test-results/e2e-ending-b.png' });
      break;
    }
    await page.waitForTimeout(1000);
  }
  const s = await st(page);
  expect([...seen]).toEqual(['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', 'B']);
  expect(s.screen).toBe('ending');
  expect(errors).toEqual([]);
});
