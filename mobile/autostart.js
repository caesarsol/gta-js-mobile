/*
 * Skip the intro dialog: when the game data is already cached press PLAY,
 * otherwise press "Download to browser-cache" first (its progress bar stays
 * visible) and press PLAY once the download has finished. If the download
 * errors out, the dialog is left alone for manual recovery.
 *
 * Audio note: browsers only let an AudioContext start from a user gesture; the
 * engine already re-arms the unlock on the first pointerdown/keydown, so sound
 * kicks in with the first touch.
 */
(() => {
  'use strict';
  if (location.search.includes('nointro')) return; // escape hatch for debugging

  let downloadClicked = false;
  let done = false;

  const visible = (el) => !!el && !el.hidden && !el.disabled && el.offsetParent !== null;

  const tick = setInterval(() => {
    if (done) return clearInterval(tick);
    const g = window.game;
    const intro = g && g.introDialog;
    const dlg = intro && intro.dialog;
    if (!dlg || !dlg.open) return;

    // Error shown → leave it to the user.
    if (visible(intro.errorEl) && (intro.errorEl.textContent || '').trim()) return;

    const play = [...dlg.querySelectorAll('button')].find((b) => /play/i.test(b.textContent || ''));
    if (visible(play)) {
      done = true;
      play.click();
      return;
    }
    if (!downloadClicked && visible(intro.downloadCacheButton)) {
      downloadClicked = true;
      intro.downloadCacheButton.click();
    }
  }, 200);
})();
