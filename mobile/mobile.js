/*
 * GTA.js mobile overlay — v1
 *
 * Strategy: the game reads input exclusively through `keydown` / `keyup`
 * listeners on `document`, keyed by `event.code`. This overlay never touches
 * the game bundle: it synthesises KeyboardEvents from touch input.
 *
 *   Bottom-left              → fixed joystick, absolute direction of travel;
 *                              distance from center = walk / run; pointing
 *                              behind the current facing = reverse
 *   Right side               → FIRE (ControlLeft), ENTER/EXIT (Enter),
 *                              JUMP/HANDBRAKE (Space)
 *   Top bar                  → ? options, fullscreen, sound, tune (icons)
 *   Top                      → weapon prev/next (KeyZ/KeyX), menu (?), fullscreen
 *
 * The overlay hides itself while the intro/options dialogs are open or the
 * game is over (so a tap on the canvas restarts the game, as on desktop).
 */
(() => {
  'use strict';

  if (!matchMedia('(pointer: coarse)').matches && !/Mobi|Android/i.test(navigator.userAgent)) {
    // Desktop: do nothing unless explicitly requested with ?touch
    if (!location.search.includes('touch')) return;
  }

  // ---------- Synthetic keyboard ----------
  const KEYS = {
    ArrowUp: { key: 'ArrowUp' },
    ArrowDown: { key: 'ArrowDown' },
    ArrowLeft: { key: 'ArrowLeft' },
    ArrowRight: { key: 'ArrowRight' },
    ControlLeft: { key: 'Control' },
    ShiftLeft: { key: 'Shift' },
    Space: { key: ' ' },
    Enter: { key: 'Enter' },
    KeyZ: { key: 'z' },
    KeyX: { key: 'x' },
    Slash: { key: '?', shiftKey: true },
  };
  const down = new Set();

  function emit(type, code) {
    const def = KEYS[code] || { key: code };
    document.dispatchEvent(
      new KeyboardEvent(type, {
        code,
        key: def.key,
        shiftKey: !!def.shiftKey || (type === 'keydown' && down.has('ShiftLeft') && code !== 'ShiftLeft'),
        bubbles: true,
        cancelable: true,
        repeat: false,
      })
    );
  }
  function press(code) {
    if (down.has(code)) return;
    down.add(code);
    emit('keydown', code);
  }
  function release(code) {
    if (!down.has(code)) return;
    down.delete(code);
    emit('keyup', code);
  }
  function tap(code) {
    emit('keydown', code);
    emit('keyup', code);
  }
  function releaseAll() {
    for (const code of [...down]) release(code);
  }

  // ---------- Icons (inline SVG, Material-style, 24px viewBox) ----------
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICONS = {
    fullscreen: svg('M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z'),
    soundOn: svg('M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05A4.47 4.47 0 0016.5 12zM14 3.23v2.06a7 7 0 010 13.42v2.06a9 9 0 000-17.54z'),
    soundOff: svg('M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12a9 9 0 00-7-8.77v2.06A7 7 0 0119 12zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z'),
    gear: svg('M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'),
    save: svg('M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4zm-5 16a3 3 0 110-6 3 3 0 010 6zm3-10H5V5h10v4z'),
    load: svg('M20 6h-8l-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2zm0 12H4V8h16v10z'),
    reload: svg('M17.65 6.35A7.96 7.96 0 0012 4a8 8 0 108 8h-2a6 6 0 11-1.76-4.24L13 11h7V4l-2.35 2.35z'),
  };
  window.gtaIcons = ICONS;

  // ---------- DOM ----------
  const root = document.createElement('div');
  root.id = 'gtaMobile';
  root.innerHTML = `
    <div id="gtaStick">
      <div class="gta-ring gta-ring-run"></div>
      <div class="gta-ring gta-ring-move"></div>
      <div id="gtaHeading">
        <div class="gta-rev-sector"></div>
        <div class="gta-rev-line gta-rev-line-a"></div>
        <div class="gta-rev-line gta-rev-line-b"></div>
        <div class="gta-heading-arrow"></div>
      </div>
      <div id="gtaStickKnob"></div>
    </div>
    <div id="gtaStickZone"></div>

    <button type="button" class="gta-btn gta-btn-fire" data-key="ControlLeft">Fire</button>
    <button type="button" class="gta-btn gta-btn-enter" data-key="Enter" id="gtaEnter">Enter</button>
    <button type="button" class="gta-btn gta-btn-jump" data-key="Space" id="gtaJump">Jump</button>

    <div id="gtaTopBar">
      <button type="button" class="gta-pill" id="gtaMenu" data-tap="Slash" aria-label="Options">?</button>
      <button type="button" class="gta-pill" id="gtaFullscreen" aria-label="Fullscreen">${ICONS.fullscreen}</button>
      <button type="button" class="gta-pill" id="gtaSound" aria-label="Sound on/off">${ICONS.soundOff}</button>
      <button type="button" class="gta-pill" id="gtaTune" aria-label="Tune controls">${ICONS.gear}</button>
    </div>
    <div id="gtaWeapons"></div>
    <div id="gtaTunePanel" class="gta-panel" hidden>
      <div class="gta-panel-title">Tune controls</div>
      <div class="gta-tune-rows"></div>
      <div class="gta-panel-actions">
        <button type="button" class="gta-pill gta-pill--danger gta-tune-reset">Reset defaults</button>
        <button type="button" class="gta-pill gta-pill--primary gta-tune-close">Close</button>
      </div>
    </div>
  `;
  const rotate = document.createElement('div');
  rotate.id = 'gtaRotate';
  rotate.textContent = 'Ruota il telefono in orizzontale ↻';

  const mount = () => {
    document.body.appendChild(root);
    document.body.appendChild(rotate);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  // ---------- Touch hardening ----------
  // Browsers turn touches into gestures we never want in a game: long-press
  // (context menu / iOS callout / text selection), double-tap zoom, pinch
  // zoom, pull-to-refresh, text-selection drag. CSS (touch-action, user-select,
  // touch-callout) covers most of it; the rest needs non-passive listeners.
  // Form controls inside the game's <dialog>s are left alone so the options
  // panel still works.
  // Our scrollable panels are exempt too, so native pan-y scrolling works inside them.
  const isFormControl = (t) =>
    !!t && !!t.closest && !!t.closest('input, textarea, select, label, a, dialog, .gta-panel, #gtaLoadMenu');
  const isGameSurface = (t) =>
    !!t && !!t.closest && (t.tagName === 'CANVAS' || !!t.closest('#gtaMobile'));

  document.addEventListener('contextmenu', (e) => {
    if (!isFormControl(e.target)) e.preventDefault();
  });
  document.addEventListener('selectstart', (e) => {
    if (!isFormControl(e.target)) e.preventDefault();
  });
  document.addEventListener('dblclick', (e) => {
    if (!isFormControl(e.target)) e.preventDefault();
  });
  // Cancelling touchstart on the game surface suppresses the long-press
  // callout, double-tap zoom and the synthesised click; pointer events keep
  // firing, which is all the overlay and the game use.
  const touchOpts = { passive: false, capture: true };
  for (const type of ['touchstart', 'touchmove', 'touchend']) {
    document.addEventListener(
      type,
      (e) => {
        if (isGameSurface(e.target) && !isFormControl(e.target)) e.preventDefault();
      },
      touchOpts
    );
  }
  // iOS pinch-zoom gestures
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), touchOpts);
  }

  // ---------- Buttons (hold) ----------
  for (const btn of root.querySelectorAll('[data-key]')) {
    const code = btn.dataset.key;
    const lockable = 'lockable' in btn.dataset;
    let locked = false;
    let downAt = 0;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      downAt = performance.now();
      if (locked) {
        // tap while locked → unlock
        locked = false;
        btn.classList.remove('is-locked');
      }
      btn.classList.add('is-down');
      press(code);
    });
    const up = (e) => {
      if (!btn.classList.contains('is-down')) return;
      btn.classList.remove('is-down');
      // long-press on a lockable button keeps it held (e.g. RUN)
      if (lockable && performance.now() - downAt > 600) {
        locked = true;
        btn.classList.add('is-locked');
        return;
      }
      release(code);
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }

  // ---------- Pills (tap) ----------
  // Fired on pointerup, deferred one task: the game's <dialog closedby="any">
  // light-dismisses on a pointer sequence / click that ends outside it, so
  // toggling the menu synchronously would open and immediately close it.
  // (No `click` here: touchstart is cancelled above, so none is synthesised.)
  for (const btn of root.querySelectorAll('[data-tap]')) {
    const code = btn.dataset.tap;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('is-down');
    });
    btn.addEventListener('pointerup', () => {
      btn.classList.remove('is-down');
      setTimeout(() => tap(code), 0);
    });
    btn.addEventListener('pointercancel', () => btn.classList.remove('is-down'));
  }

  // ---------- Fullscreen + orientation ----------
  const fsBtn = root.querySelector('#gtaFullscreen');
  if (!document.fullscreenEnabled && !document.documentElement.webkitRequestFullscreen) fsBtn.hidden = true;
  fsBtn.addEventListener('pointerdown', async (e) => {
    e.preventDefault();
    try {
      if (!document.fullscreenElement) {
        await (document.documentElement.requestFullscreen?.() ||
          document.documentElement.webkitRequestFullscreen?.());
        await screen.orientation?.lock?.('landscape').catch(() => {});
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      /* iOS Safari (iPhone) has no Fullscreen API: install as PWA instead */
    }
  });

  // ---------- Fixed joystick, absolute direction ----------
  //
  // The stick direction is the *direction of travel on screen*. The game only
  // has tank controls (←/→ rotate, ↑/↓ move), so a small controller runs every
  // frame: it reads the current heading from window.game and presses ←/→
  // until the character/car faces the right way, while holding ↑ (or ↓).
  //
  // ---------- Tunables (editable from the "Tune" panel, persisted) ----------
  // Distance from the center picks the speed; reverse is decided by *where the
  // stick points relative to the current facing*, never by distance: if the
  // requested direction is behind you, go backwards toward it instead of
  // U-turning (hysteresis keeps it from flickering when sideways).
  const TUNE_KEY = 'gtajs-mobile:tune';
  const TUNE_DEFS = [
    { k: 'ringMove', label: 'Stick · move ring (px)', def: 20, step: 2, min: 6, max: 60,
      help: 'Dead zone radius. Inside it the stick does nothing; beyond it you walk / drive.' },
    { k: 'ringRun', label: 'Stick · run ring (px)', def: 110, step: 5, min: 40, max: 130,
      help: 'Beyond this radius you run (on foot only). Drawn as the dashed ring.' },
    { k: 'turnStart', label: 'Turn · start (°)', def: 1, step: 1, min: 1, max: 30,
      help: 'Start turning when your heading is off the stick direction by more than this. Smaller = snappier but can jitter.' },
    { k: 'turnStop', label: 'Turn · stop (°)', def: 0, step: 1, min: 0, max: 20,
      help: 'Stop turning once the error is within this. Keep it below "Turn · start".' },
    { k: 'revEnter', label: 'Reverse · enter (°)', def: 130, step: 5, min: 90, max: 180,
      help: 'Cars only. If the stick points more than this behind the car, you reverse toward it instead of U-turning. Drawn as the dashed red sector.' },
    { k: 'revExit', label: 'Reverse · exit (°)', def: 100, step: 5, min: 60, max: 180,
      help: 'Leave reverse when the stick comes back within this angle. Keep it below "Reverse · enter" (hysteresis).' },
  ];
  const T = {};
  function loadTune() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(TUNE_KEY) || '{}') || {}; } catch { saved = {}; }
    for (const d of TUNE_DEFS) T[d.k] = typeof saved[d.k] === 'number' ? saved[d.k] : d.def;
  }
  function saveTune() {
    try { localStorage.setItem(TUNE_KEY, JSON.stringify(T)); } catch { /* ignore */ }
  }
  loadTune();
  const KNOB_MAX = 130; // px: knob travel clamp (visual only)
  const deg = (d) => (d * Math.PI) / 180;
  //
  // Engine conventions (verified empirically on the production build):
  //   heading r = sprite.rotation.z; forward in world = (sin r, -cos r)
  //   camera is top-down and axis-aligned: screen-right = +x, screen-up = +y
  //   → screen angle φ = atan2(-dy, dx) (CSS y is down) and r = φ + π/2
  //   ArrowLeft increases r; in a *reversing car* steering is inverted.

  const zone = root.querySelector('#gtaStickZone');
  const stick = root.querySelector('#gtaStick');
  const knob = root.querySelector('#gtaStickKnob');

  let stickId = null;
  let cx = 0,
    cy = 0;
  let stickDx = 0,
    stickDy = 0,
    stickDist = 0;
  let turning = 0; // -1 = pressing ArrowRight, 0 = none, +1 = pressing ArrowLeft
  let reversing = false;
  const held = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, ShiftLeft: false };

  function setHeld(code, on) {
    if (held[code] === on) return;
    held[code] = on;
    on ? press(code) : release(code);
  }

  function wrapAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
  }

  function currentHeading(pl) {
    if (pl.inVehicle && pl.currentVehicle && pl.currentVehicle.sprite) return pl.currentVehicle.sprite.rotation.z;
    return pl.spriteMesh ? pl.spriteMesh.rotation.z : 0;
  }

  function steerInverted(pl) {
    // Mirrors the game's `isReversing` flag used to flip the steering sign.
    if (!pl.inVehicle) return false;
    const v = pl.vehicleSpeed ?? 0;
    return v < -1 || (v <= 0.5 && !!pl.moveBackward);
  }

  function stickTick() {
    const g = window.game;
    const pl = g && g.player;
    if (stickId === null || !pl || root.hidden) return;

    const gear = stickDist >= T.ringRun ? 2 : stickDist >= T.ringMove ? 1 : 0;
    if (gear === 0) {
      for (const code of Object.keys(held)) setHeld(code, false);
      turning = 0;
      reversing = false;
      return;
    }

    // Direction of travel on screen → facing needed to drive forward there.
    const phi = Math.atan2(-stickDy, stickDx);
    const heading = currentHeading(pl);
    const fwdDelta = Math.abs(wrapAngle(phi + Math.PI / 2 - heading));
    // Reverse exists only in vehicles; on foot you always turn and walk forward.
    if (!pl.inVehicle) reversing = false;
    else if (!reversing && fwdDelta > deg(T.revEnter)) reversing = true;
    else if (reversing && fwdDelta < deg(T.revExit)) reversing = false;

    // Reverse: face away from the travel direction and back into it.
    const target = phi + Math.PI / 2 + (reversing ? Math.PI : 0);
    const delta = wrapAngle(target - heading);
    const mag = Math.abs(delta);

    if (turning === 0 && mag > deg(T.turnStart)) turning = delta > 0 ? 1 : -1;
    else if (turning !== 0 && (mag < deg(T.turnStop) || Math.sign(delta) !== turning)) turning = 0;

    const inv = steerInverted(pl) ? -1 : 1;
    setHeld('ArrowLeft', turning * inv === 1);
    setHeld('ArrowRight', turning * inv === -1);
    setHeld('ArrowUp', !reversing);
    setHeld('ArrowDown', reversing);
    setHeld('ShiftLeft', gear === 2 && !reversing);
    stick.dataset.mode = reversing ? 'rev' : 'fwd';
  }

  function updateStick(x, y) {
    let dx = x - cx;
    let dy = y - cy;
    const dist = Math.hypot(dx, dy);
    stickDx = dx;
    stickDy = dy;
    stickDist = dist;
    if (dist > KNOB_MAX) {
      dx = (dx / dist) * KNOB_MAX;
      dy = (dy / dist) * KNOB_MAX;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stick.dataset.gear = dist >= T.ringRun ? 'run' : dist >= T.ringMove ? 'move' : 'idle';
  }

  function endStick() {
    stickId = null;
    stick.classList.remove('is-active');
    delete stick.dataset.gear;
    delete stick.dataset.mode;
    knob.style.transform = '';
    turning = 0;
    reversing = false;
    for (const code of Object.keys(held)) setHeld(code, false);
  }

  // Ring sizes follow the tunables
  function applyTuneVisuals() {
    const move = root.querySelector('.gta-ring-move');
    const run = root.querySelector('.gta-ring-run');
    move.style.width = move.style.height = `${T.ringMove * 2}px`;
    run.style.width = run.style.height = `${T.ringRun * 2}px`;
    const a = root.querySelector('.gta-rev-line-a');
    const b = root.querySelector('.gta-rev-line-b');
    const sec = root.querySelector('.gta-rev-sector');
    a.style.transform = `rotate(${-T.revEnter}deg)`;
    b.style.transform = `rotate(${T.revEnter}deg)`;
    const span = 360 - 2 * T.revEnter;
    sec.style.background = `conic-gradient(from ${T.revEnter}deg, rgba(255, 90, 60, 0.16) 0 ${span}deg, transparent ${span}deg 360deg)`;
  }
  applyTuneVisuals();

  function stickCenter() {
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
  }

  zone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    e.preventDefault();
    stickId = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    stickCenter();
    stick.classList.add('is-active');
    updateStick(e.clientX, e.clientY);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    e.preventDefault();
    updateStick(e.clientX, e.clientY);
  });
  const stickUp = (e) => {
    if (e.pointerId !== stickId) return;
    endStick();
  };
  zone.addEventListener('pointerup', stickUp);
  zone.addEventListener('pointercancel', stickUp);

  // Heading indicator: an arrow showing the current facing on screen, plus
  // (in vehicles) the dashed sector behind you where the stick triggers reverse.
  const headingEl = root.querySelector('#gtaHeading');
  function updateHeadingIndicator() {
    const g = window.game;
    const pl = g && g.player;
    if (!pl || root.hidden) return;
    // facing r: r=π → screen up; CSS rotate is clockwise, so rotate(-(r-π)).
    const deg = (-(currentHeading(pl) - Math.PI) * 180) / Math.PI;
    headingEl.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    headingEl.dataset.vehicle = pl.inVehicle ? '1' : '0';
    stick.dataset.vehicle = pl.inVehicle ? '1' : '0'; // hides the run ring in vehicles
  }

  // ---------- Tune panel: −/+ steppers for every tunable, persisted ----------
  const tunePanel = root.querySelector('#gtaTunePanel');
  const tuneRows = tunePanel.querySelector('.gta-tune-rows');
  const onTap = (el, fn) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('is-down'); });
    el.addEventListener('pointerup', () => { el.classList.remove('is-down'); setTimeout(fn, 0); });
    el.addEventListener('pointercancel', () => el.classList.remove('is-down'));
  };
  const fmtVal = (d, v) => (d.step < 1 ? v.toFixed(1) : String(Math.round(v)));
  function renderTune() {
    tuneRows.innerHTML = '';
    for (const d of TUNE_DEFS) {
      const row = document.createElement('div');
      row.className = 'gta-tune-row';
      row.innerHTML = `<div class="gta-tune-label">${d.label} <span class="gta-tune-q">?</span></div>
        <button type="button" class="gta-pill" data-dir="-1">−</button>
        <div class="gta-tune-value">${fmtVal(d, T[d.k])}</div>
        <button type="button" class="gta-pill" data-dir="1">+</button>
        <div class="gta-tune-help" hidden>${d.help}</div>`;
      const valueEl = row.querySelector('.gta-tune-value');
      const helpEl = row.querySelector('.gta-tune-help');
      onTap(row.querySelector('.gta-tune-label'), () => { helpEl.hidden = !helpEl.hidden; });
      for (const b of row.querySelectorAll('[data-dir]')) {
        onTap(b, () => {
          const next = Math.min(d.max, Math.max(d.min, T[d.k] + d.step * Number(b.dataset.dir)));
          T[d.k] = Math.round(next * 1000) / 1000;
          valueEl.textContent = fmtVal(d, T[d.k]);
          if (T[d.k] === d.def) valueEl.classList.remove('is-changed'); else valueEl.classList.add('is-changed');
          saveTune();
          applyTuneVisuals();
        });
      }
      if (T[d.k] !== d.def) valueEl.classList.add('is-changed');
      tuneRows.appendChild(row);
    }
  }
  onTap(root.querySelector('#gtaTune'), () => { renderTune(); tunePanel.hidden = false; });
  onTap(tunePanel.querySelector('.gta-tune-close'), () => { tunePanel.hidden = true; });
  onTap(tunePanel.querySelector('.gta-tune-reset'), () => {
    for (const d of TUNE_DEFS) T[d.k] = d.def;
    saveTune();
    applyTuneVisuals();
    renderTune();
  });

  (function loop() {
    stickTick();
    updateHeadingIndicator();
    requestAnimationFrame(loop);
  })();

  // ---------- Sound pill (default off) ----------
  // Browsers only start audio inside a user gesture, and autostart.js presses
  // PLAY programmatically, so the engine's AudioContext stays suspended (its
  // own retry is a one-shot on pointerdown, which iOS does not count as a
  // gesture). The pill's pointerup is a real gesture: unlock + unmute there.
  // A looping silent <audio> makes iOS treat the page as "playing media" so
  // Web Audio is not killed by the ringer/silent switch.
  const SOUND_KEY = 'gtajs-mobile:sound';
  let soundOn = (() => { try { return localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; } })();
  const soundBtn = root.querySelector('#gtaSound');
  const silence = new Audio('mobile/silence.wav');
  silence.loop = true;
  silence.volume = 0.05;
  silence.setAttribute('playsinline', '');
  silence.preload = 'auto';

  const soundManager = () => window.game && window.game.soundManager;
  const audioRunning = () => { const sm = soundManager(); return !!(sm && sm.audioContext && sm.audioContext.state === 'running'); };
  let soundApplied = false;
  function applySound(fromGesture) {
    const sm = soundManager();
    if (!sm) return;
    soundApplied = true;
    if (soundOn) {
      if (fromGesture) {
        try { sm.unlockAudio(); } catch { /* ignore */ }
        if (sm.audioContext && sm.audioContext.state !== 'running') sm.audioContext.resume().catch(() => {});
        silence.play().catch(() => {});
      }
      sm.setMuted(false);
    } else {
      sm.setMuted(true);
      silence.pause();
    }
    renderSoundBtn();
  }
  function renderSoundBtn() {
    const pending = soundOn && !audioRunning();
    soundBtn.classList.toggle('is-on', soundOn && !pending);
    soundBtn.classList.toggle('is-pending', pending);
    soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
    soundBtn.title = soundOn ? (pending ? 'Sound on — tap anywhere to resume' : 'Sound on') : 'Sound off';
  }
  let soundRendered = '';
  renderSoundBtn();
  soundBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  soundBtn.addEventListener('pointerup', () => {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch { /* ignore */ }
    applySound(true);
  });
  // Sound saved as "on" from a previous visit: it can only resume inside a
  // gesture, so finish the job on the next touch/key anywhere.
  const resumeOnGesture = () => { if (soundOn && !audioRunning()) applySound(true); };
  for (const type of ['touchend', 'pointerup', 'keydown']) window.addEventListener(type, resumeOnGesture, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) silence.pause();
    else if (soundOn) silence.play().catch(() => {});
  });

  // ---------- Weapon list (right side) ----------
  // Shows the weapons you own; the active one is white. Ammo in parentheses
  // (∞ during a Kill Frenzy). Tap a row to select it.
  const WEAPON_NAMES = ['Fist', 'Pistol', 'Machine Gun', 'Rocket Launcher', 'Flamethrower'];
  const weaponsEl = root.querySelector('#gtaWeapons');
  let weaponsSig = '';
  function syncWeapons(pl) {
    const frenzy = !!pl.killFrenzyActive;
    const rows = [];
    for (let i = 0; i < WEAPON_NAMES.length; i++) {
      const owned = i === 0 || (frenzy && i === 2) || (pl.ammo && (pl.ammo[i] ?? -1) >= 0);
      if (!owned) continue;
      let detail = '';
      if (i > 0) detail = frenzy && i === 2 ? ' (∞)' : ` (${pl.ammo[i]})`;
      rows.push({ i, label: WEAPON_NAMES[i] + detail, active: pl.weapon === i, empty: i > 0 && !frenzy && pl.ammo[i] === 0 });
    }
    const sig = rows.map((r) => `${r.i}:${r.label}:${r.active}:${r.empty}`).join('|');
    if (sig === weaponsSig) return;
    weaponsSig = sig;
    weaponsEl.innerHTML = '';
    for (const r of rows) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gta-pill' + (r.active ? ' is-on' : '') + (r.empty ? ' gta-pill--dim' : '');
      b.textContent = r.label;
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('pointerup', () => {
        const p2 = window.game && window.game.player;
        if (p2) p2.selectWeapon(r.i);
      });
      weaponsEl.appendChild(b);
    }
  }

  // ---------- Visibility / game state sync ----------
  const enterBtn = root.querySelector('#gtaEnter');
  const jumpBtn = root.querySelector('#gtaJump');
  const topBar = root.querySelector('#gtaTopBar');
  let lastInVehicle = null;

  function syncWithGame() {
    const g = window.game;
    if (!g) return;
    // Dialog wrappers differ: some expose isOpen(), others only the <dialog> element.
    const isOpen = (d) =>
      !!d && (typeof d.isOpen === 'function' ? d.isOpen() : !!(d.dialog && d.dialog.open));
    const dialogOpen = isOpen(g.introDialog) || isOpen(g.gameDialog) || isOpen(g.missionErrorDialog);
    const hide = dialogOpen || !g.player || !!g.isGameOver;
    if (hide !== root.hidden) {
      root.hidden = hide;
      if (hide) releaseAll();
    }
    if (g.player && !hide) syncWeapons(g.player);
    if (!soundApplied && g.soundManager) applySound(false); // default: muted until the pill is tapped
    const soundSig = `${soundOn}:${audioRunning()}`;
    if (soundSig !== soundRendered) { soundRendered = soundSig; renderSoundBtn(); }
    // boot.js mounts the reload pill outside the overlay: adopt it into the top bar with an icon.
    const reloadEl = document.getElementById('gtaReload');
    if (reloadEl && reloadEl.parentElement !== topBar) { reloadEl.innerHTML = ICONS.reload; reloadEl.setAttribute('aria-label', 'Reload'); topBar.appendChild(reloadEl); }
    const inVehicle = !!(g.player && g.player.inVehicle);
    if (inVehicle !== lastInVehicle) {
      lastInVehicle = inVehicle;
      enterBtn.textContent = inVehicle ? 'Exit' : 'Enter';
      jumpBtn.textContent = inVehicle ? 'Brake' : 'Jump';
    }
  }
  root.hidden = true;
  setInterval(syncWithGame, 200);

  // Safety: release everything when the page loses focus / is hidden
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });

  // Expose for debugging from the console
  window.gtaMobile = { press, release, tap, releaseAll, root, tune: T, TUNE_DEFS };
})();
