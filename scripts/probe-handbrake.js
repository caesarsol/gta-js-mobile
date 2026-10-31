#!/usr/bin/env node
// Handbrake from the stick centre: enter the car, accelerate, then hold the
// finger at the stick centre; Space must be pressed only after hbDelay and only
// in vehicles. Also exercises the Tune panel steppers.
const h = require('./headless');

(async () => {
  const s = await h.launch();
  await h.startGame(s.page);
  const centre = await s.page.evaluate(() => { const r = document.getElementById('gtaStick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const hb = () => s.page.evaluate(() => ({ space: !!window.game.player.handbrake, hbAttr: document.getElementById('gtaStick').dataset.hb ?? null, v: +(window.game.player.vehicleSpeed || 0).toFixed(0), jumpHidden: document.getElementById('gtaJump').hidden }));

  // On foot: centre hold must do nothing
  await s.touch('touchStart', [{ x: centre.x + 3, y: centre.y - 2, id: 1 }]);
  await s.page.waitForTimeout(900);
  console.log('on foot, centre held 0.9s:', JSON.stringify(await hb()), 'jumping:', await s.page.evaluate(() => window.game.player.isJumping));
  await s.touch('touchEnd', []);

  console.log('entered car:', await h.enterCarAtSpawn(s));
  await s.hold('ArrowUp', 1500);
  console.log('after gas:', JSON.stringify(await hb()));
  // Centre hold in vehicle: before delay → no handbrake; after → handbrake
  await s.touch('touchStart', [{ x: centre.x + 4, y: centre.y + 3, id: 1 }]);
  await s.page.waitForTimeout(250);
  console.log('centre @250ms:', JSON.stringify(await hb()));
  await s.page.waitForTimeout(500);
  console.log('centre @750ms:', JSON.stringify(await hb()));
  // Move the finger out to the move ring → handbrake released, car drives
  await s.touch('touchMove', [{ x: centre.x + 60, y: centre.y, id: 1 }]);
  await s.page.waitForTimeout(400);
  console.log('moved out:', JSON.stringify(await hb()));
  await s.touch('touchEnd', []);
  await s.page.waitForTimeout(200);
  console.log('released:', JSON.stringify(await hb()));

  // Tune panel: open, bump "Handbrake · hold delay" twice, check persistence
  await s.tap('#gtaTune');
  const before = await s.page.evaluate(() => window.gtaMobile.tune.hbDelay);
  const rows = await s.page.$$('.gta-tune-row');
  const idx = (await s.page.evaluate(() => window.gtaMobile.TUNE_DEFS.findIndex((d) => d.k === 'hbDelay')));
  const plus = await rows[idx].$('[data-dir="1"]');
  await plus.scrollIntoViewIfNeeded();
  const bb = await plus.boundingBox();
  for (let i = 0; i < 2; i++) { await s.touch('touchStart', [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, id: 5 }]); await s.touch('touchEnd', []); await s.page.waitForTimeout(80); }
  const after = await s.page.evaluate(() => [window.gtaMobile.tune.hbDelay, JSON.parse(localStorage.getItem('gtajs-mobile:tune')).hbDelay, document.querySelectorAll('.gta-tune-row').length]);
  console.log('tune hbDelay', before, '->', JSON.stringify(after));
  await s.page.screenshot({ path: 'tune-panel.png' });
  await s.tap('.gta-tune-reset');
  console.log('after reset:', await s.page.evaluate(() => window.gtaMobile.tune.hbDelay));
  await s.browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
