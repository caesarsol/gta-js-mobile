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

  // ---------- DOM ----------
  const root = document.createElement('div');
  root.id = 'gtaMobile';
  root.innerHTML = `
    <div id="gtaStick">
      <div class="gta-ring gta-ring-run"></div>
      <div class="gta-ring gta-ring-move"></div>
      <div id="gtaStickKnob"></div>
    </div>
    <div id="gtaStickZone"></div>

    <button type="button" class="gta-btn gta-btn-fire" data-key="ControlLeft">Fire</button>
    <button type="button" class="gta-btn gta-btn-enter" data-key="Enter" id="gtaEnter">Enter</button>
    <button type="button" class="gta-btn gta-btn-jump" data-key="Space" id="gtaJump">Jump</button>

    <button type="button" class="gta-pill" id="gtaWeaponPrev" data-tap="KeyZ">&lt; W</button>
    <button type="button" class="gta-pill" id="gtaWeaponNext" data-tap="KeyX">W &gt;</button>
    <button type="button" class="gta-pill" id="gtaMenu" data-tap="Slash">?</button>
    <button type="button" class="gta-pill" id="gtaFullscreen">⛶</button>
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
  const isFormControl = (t) =>
    !!t && !!t.closest && !!t.closest('input, textarea, select, label, a, dialog');
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
  root.querySelector('#gtaFullscreen').addEventListener('pointerdown', async (e) => {
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
  // Distance from the center picks the speed (tune these):
  const RING_MOVE = 20; // px: beyond this → move
  const RING_RUN = 90; // px: beyond this → run (Shift)
  const KNOB_MAX = 130; // px: knob travel clamp (visual only)
  const TURN_START = (8 * Math.PI) / 180; // start turning when off by more than this
  const TURN_STOP = (3 * Math.PI) / 180; // stop turning once within this (hysteresis)
  //
  // Reverse is decided by *where the stick points relative to the current
  // facing*, never by distance: if the requested direction is behind you, go
  // backwards toward it instead of U-turning. Hysteresis keeps it from
  // flickering when the stick is sideways.
  const REV_ENTER = (130 * Math.PI) / 180; // |angle to travel dir| above this → reverse
  const REV_EXIT = (100 * Math.PI) / 180; // … and below this → back to forward
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

    const gear = stickDist >= RING_RUN ? 2 : stickDist >= RING_MOVE ? 1 : 0;
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
    if (!reversing && fwdDelta > REV_ENTER) reversing = true;
    else if (reversing && fwdDelta < REV_EXIT) reversing = false;

    // Reverse: face away from the travel direction and back into it.
    const target = phi + Math.PI / 2 + (reversing ? Math.PI : 0);
    const delta = wrapAngle(target - heading);
    const mag = Math.abs(delta);

    if (turning === 0 && mag > TURN_START) turning = delta > 0 ? 1 : -1;
    else if (turning !== 0 && (mag < TURN_STOP || Math.sign(delta) !== turning)) turning = 0;

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
    stick.dataset.gear = dist >= RING_RUN ? 'run' : dist >= RING_MOVE ? 'move' : 'idle';
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

  (function loop() {
    stickTick();
    requestAnimationFrame(loop);
  })();

  // ---------- Visibility / game state sync ----------
  const enterBtn = root.querySelector('#gtaEnter');
  const jumpBtn = root.querySelector('#gtaJump');
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
  window.gtaMobile = { press, release, tap, releaseAll, root };
})();
