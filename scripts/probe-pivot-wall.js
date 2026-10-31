#!/usr/bin/env node
// Drive the spawn car into a wall, then compare standstill steering with and
// without the low-speed pivot patch (?nopivot).
const h = require('./headless');

async function run(query) {
  const s = await h.launch();
  await h.startGame(s.page, h.DEFAULT_URL + query);
  if (!(await h.enterCarAtSpawn(s))) throw new Error('could not enter car');
  // Drive forward until the car stops moving (blocked by something).
  await s.key('keydown', 'ArrowUp');
  let last = await h.state(s.page);
  let stuck = 0;
  for (let i = 0; i < 60; i++) {
    await s.page.waitForTimeout(250);
    const now = await h.state(s.page);
    const moved = Math.hypot(now.x - last.x, now.y - last.y);
    last = now;
    if (i > 4 && moved < 1 && Math.abs(now.vehicleSpeed) < 3) { if (++stuck >= 3) break; } else stuck = 0;
  }
  const atWall = await h.state(s.page);
  const pivotNow = await s.page.evaluate(() => window.game.player.handlingProfile.canPivotInPlace);
  console.log(`${query || '(pivot on)'} stuck at`, JSON.stringify({ x: atWall.x, y: atWall.y, r: atWall.r, v: atWall.vehicleSpeed, pivot: pivotNow }));
  // Keep ArrowUp held (as the stick controller would) and steer left for 1s.
  await s.key('keydown', 'ArrowLeft');
  await s.page.waitForTimeout(1000);
  await s.key('keyup', 'ArrowLeft');
  const turned = await h.state(s.page);
  console.log(`  ArrowUp+ArrowLeft 1s against the wall: dRot = ${(turned.r - atWall.r).toFixed(3)} rad, moved = ${Math.hypot(turned.x - atWall.x, turned.y - atWall.y).toFixed(1)}`);
  // Now release ArrowUp and steer alone.
  await s.key('keyup', 'ArrowUp');
  const r0 = await h.state(s.page);
  await s.hold('ArrowLeft', 1000);
  const r1 = await h.state(s.page);
  console.log(`  ArrowLeft alone 1s: dRot = ${(r1.r - r0.r).toFixed(3)} rad`);
  await s.page.screenshot({ path: `pivot-wall${query ? '-nopivot' : ''}.png` });
  await s.browser.close();
}

(async () => { await run(''); await run('?nopivot'); })().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
