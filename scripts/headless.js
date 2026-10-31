#!/usr/bin/env node
/*
 * Headless harness for GTA.js Mobile (Playwright + preinstalled Chromium).
 *
 *   node scripts/headless.js [url]     → smoke test: start, enter the car at spawn, drive
 *   const h = require('./scripts/headless'); → reuse helpers in ad-hoc probes
 *
 * Serve the repo first, e.g. from the parent folder so the Pages sub-path matches:
 *   cd .. && python3 -m http.server 8123 --bind 127.0.0.1
 */
const { chromium, devices } = require('playwright');

const DEFAULT_URL = 'http://127.0.0.1:8123/gta-js-mobile/';

async function launch() {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], isMobile: true, hasTouch: true, viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const tap = async (selector) => {
    const el = await page.waitForSelector(selector, { state: 'visible', timeout: 15000 });
    const bb = await el.boundingBox();
    await touch('touchStart', [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, id: 9 }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(100);
  };
  const key = (type, code) =>
    page.evaluate(([t, c]) => document.dispatchEvent(new KeyboardEvent(t, { code: c, key: c, bubbles: true })), [type, code]);
  const hold = async (code, ms) => { await key('keydown', code); await page.waitForTimeout(ms); await key('keyup', code); };
  return { browser, ctx, page, cdp, touch, tap, key, hold };
}

// Navigate and wait until the player exists and the intro dialog is closed
// (autostart.js downloads the demo ZIP on first run and presses PLAY).
async function startGame(page, url = DEFAULT_URL, timeoutMs = 180000) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await page.waitForTimeout(500);
    const ready = await page.evaluate(() => !!(window.game && window.game.player) && !(window.game.introDialog && window.game.introDialog.dialog && window.game.introDialog.dialog.open));
    if (ready) break;
  }
  await page.waitForTimeout(1500);
}

function state(page) {
  return page.evaluate(() => {
    const g = window.game, pl = g.player;
    const r = pl.inVehicle && pl.currentVehicle ? pl.currentVehicle.sprite.rotation.z : pl.spriteMesh.rotation.z;
    return {
      x: +pl.position.x.toFixed(1), y: +pl.position.y.toFixed(1), r: +r.toFixed(3),
      inVehicle: !!pl.inVehicle, vehicleSpeed: +(pl.vehicleSpeed || 0).toFixed(1),
      weapon: pl.weapon, ammo: { ...pl.ammo }, score: g.hud.score, lives: g.hud.lives,
      keys: { up: pl.moveForward, down: pl.moveBackward, left: pl.turnLeft, right: pl.turnRight },
    };
  });
}

// There is a car right next to the spawn point: Enter gets you in within ~1.5s.
async function enterCarAtSpawn(h) {
  await h.key('keydown', 'Enter'); await h.key('keyup', 'Enter');
  for (let i = 0; i < 10; i++) {
    await h.page.waitForTimeout(500);
    if ((await state(h.page)).inVehicle) return true;
  }
  return false;
}

module.exports = { DEFAULT_URL, launch, startGame, state, enterCarAtSpawn };

if (require.main === module) {
  (async () => {
    const h = await launch();
    await startGame(h.page, process.argv[2] || DEFAULT_URL);
    console.log('spawn', JSON.stringify(await state(h.page)));
    console.log('entered car:', await enterCarAtSpawn(h));
    await h.hold('ArrowUp', 2000);
    console.log('after 2s gas', JSON.stringify(await state(h.page)));
    await h.page.screenshot({ path: 'headless.png' });
    await h.browser.close();
  })().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
}
