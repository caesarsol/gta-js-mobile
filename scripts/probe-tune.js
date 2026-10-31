#!/usr/bin/env node
// Tune panel: open it, bump a stepper, check persistence and the help toggle.
const h = require('./headless');

(async () => {
  const s = await h.launch();
  await h.startGame(s.page);
  // Tune panel: open, bump "Handbrake · hold delay" twice, check persistence
  await s.tap('#gtaTune');
  const before = await s.page.evaluate(() => window.gtaMobile.tune.turnStart);
  const rows = await s.page.$$('.gta-tune-row');
  const idx = (await s.page.evaluate(() => window.gtaMobile.TUNE_DEFS.findIndex((d) => d.k === 'turnStart')));
  const plus = await rows[idx].$('[data-dir="1"]');
  await plus.scrollIntoViewIfNeeded();
  const bb = await plus.boundingBox();
  for (let i = 0; i < 2; i++) { await s.touch('touchStart', [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, id: 5 }]); await s.touch('touchEnd', []); await s.page.waitForTimeout(80); }
  const after = await s.page.evaluate(() => [window.gtaMobile.tune.turnStart, JSON.parse(localStorage.getItem('gtajs-mobile:tune')).turnStart, document.querySelectorAll('.gta-tune-row').length]);
  console.log('tune turnStart', before, '->', JSON.stringify(after));
  await s.tap('.gta-tune-row .gta-tune-label');
  console.log('help shown:', await s.page.evaluate(() => !document.querySelector('.gta-tune-help').hidden), await s.page.evaluate(() => document.querySelector('.gta-tune-help').textContent.slice(0, 40)));
  await s.page.screenshot({ path: 'tune-panel.png' });
  await s.tap('.gta-tune-reset');
  console.log('after reset:', await s.page.evaluate(() => window.gtaMobile.tune.turnStart));
  await s.browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
