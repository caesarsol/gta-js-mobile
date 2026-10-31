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

    <button type="button" class="gta-pill" id="gtaMenu" data-tap="Slash">?</button>
    <button type="button" class="gta-pill" id="gtaFullscreen">⛶</button>
    <button type="button" class="gta-pill" id="gtaPivot" title="Low-speed pivot in vehicles">Pivot</button>
    <button type="button" class="gta-pill" id="gtaTune" title="Tune controls">Tune</button>
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
  // ---------- Tunables (editable from the "Tune" panel, persisted) ----------
  // Distance from the center picks the speed; reverse is decided by *where the
  // stick points relative to the current facing*, never by distance: if the
  // requested direction is behind you, go backwards toward it instead of
  // U-turning (hysteresis keeps it from flickering when sideways). Holding the
  // finger inside the centre ring (vehicles only) pulls the handbrake.
  const TUNE_KEY = 'gtajs-mobile:tune';
  const TUNE_DEFS = [
    { k: 'ringMove', label: 'Stick · move ring (px)', def: 20, step: 2, min: 6, max: 60 },
    { k: 'ringRun', label: 'Stick · run ring (px)', def: 110, step: 5, min: 40, max: 130 },
    { k: 'turnStart', label: 'Turn · start (°)', def: 8, step: 1, min: 1, max: 30 },
    { k: 'turnStop', label: 'Turn · stop (°)', def: 3, step: 1, min: 0, max: 20 },
    { k: 'revEnter', label: 'Reverse · enter (°)', def: 130, step: 5, min: 90, max: 180 },
    { k: 'revExit', label: 'Reverse · exit (°)', def: 100, step: 5, min: 60, max: 180 },
    { k: 'hbRadius', label: 'Handbrake · centre radius (px)', def: 20, step: 2, min: 0, max: 60 },
    { k: 'hbDelay', label: 'Handbrake · hold delay (ms)', def: 500, step: 100, min: 0, max: 2000 },
    { k: 'pivotOn', label: 'Pivot · on below speed', def: 20, step: 5, min: 0, max: 100 },
    { k: 'pivotOff', label: 'Pivot · off above speed', def: 35, step: 5, min: 0, max: 150 },
    { k: 'pivotSens', label: 'Pivot · sensitivity ×', def: 1, step: 0.1, min: 0.1, max: 3 },
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
  let centreSince = 0; // performance.now() when the finger entered the centre ring (0 = not there)
  const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft'];
  const held = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, ShiftLeft: false, Space: false };

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

    // Handbrake: finger held inside the centre ring (vehicles only).
    const inCentre = pl.inVehicle && stickDist < T.hbRadius;
    if (inCentre) {
      if (!centreSince) centreSince = performance.now();
      setHeld('Space', performance.now() - centreSince >= T.hbDelay);
    } else {
      centreSince = 0;
      setHeld('Space', false);
    }
    stick.dataset.hb = held.Space ? '1' : '0';

    const gear = stickDist >= T.ringRun ? 2 : stickDist >= T.ringMove ? 1 : 0;
    if (gear === 0) {
      for (const code of MOVE_KEYS) setHeld(code, false);
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
    delete stick.dataset.hb;
    knob.style.transform = '';
    turning = 0;
    reversing = false;
    centreSince = 0;
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

  // ---------- Experiment: low-speed pivot in vehicles ----------
  // The engine only yaws a car in proportion to its speed, so against a wall
  // (speed 0) steering does nothing and you are stuck. Handling profiles have
  // a `canPivotInPlace` flag (used by the tank) that yaws even at standstill.
  // We flip it on while the car is (nearly) stopped and restore the original
  // value once it moves, so handling at speed is untouched.
  // Tunables: T.pivotOn (|speed| below → enabled), T.pivotOff (above → restored),
  // T.pivotSens (× steeringSensitivity while patched; engine yaw at standstill is 0.75×).
  const PIVOT_KEY = 'gtajs-mobile:pivot';
  let pivotEnabled = (() => {
    if (location.search.includes('nopivot')) return false;
    try { return localStorage.getItem(PIVOT_KEY) !== '0'; } catch { return true; }
  })();
  let pivotPatched = null; // { profile, canPivotInPlace, steeringSensitivity }

  const pivotBtn = root.querySelector('#gtaPivot');
  function renderPivotBtn() {
    pivotBtn.classList.toggle('is-on', pivotEnabled);
    pivotBtn.setAttribute('aria-pressed', String(pivotEnabled));
  }
  renderPivotBtn();
  pivotBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  pivotBtn.addEventListener('pointerup', () => {
    pivotEnabled = !pivotEnabled;
    try { localStorage.setItem(PIVOT_KEY, pivotEnabled ? '1' : '0'); } catch { /* ignore */ }
    if (!pivotEnabled) unpatchPivot();
    renderPivotBtn();
  });
  function unpatchPivot() {
    if (!pivotPatched) return;
    pivotPatched.profile.canPivotInPlace = pivotPatched.canPivotInPlace;
    pivotPatched.profile.steeringSensitivity = pivotPatched.steeringSensitivity;
    pivotPatched = null;
  }
  function lowSpeedPivotTick(pl) {
    if (!pivotEnabled) return;
    const prof = pl.inVehicle ? pl.handlingProfile : null;
    if (pivotPatched && pivotPatched.profile !== prof) unpatchPivot();
    if (!prof) return;
    const v = Math.abs(pl.vehicleSpeed ?? 0);
    if (!pivotPatched && v < T.pivotOn && !prof.canPivotInPlace) {
      pivotPatched = { profile: prof, canPivotInPlace: prof.canPivotInPlace, steeringSensitivity: prof.steeringSensitivity };
      prof.canPivotInPlace = true;
      prof.steeringSensitivity = prof.steeringSensitivity * T.pivotSens;
    } else if (pivotPatched && v > T.pivotOff) {
      unpatchPivot();
    }
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
      row.innerHTML = `<div class="gta-tune-label">${d.label}</div>
        <button type="button" class="gta-pill" data-dir="-1">−</button>
        <div class="gta-tune-value">${fmtVal(d, T[d.k])}</div>
        <button type="button" class="gta-pill" data-dir="1">+</button>`;
      const valueEl = row.querySelector('.gta-tune-value');
      for (const b of row.querySelectorAll('[data-dir]')) {
        onTap(b, () => {
          const next = Math.min(d.max, Math.max(d.min, T[d.k] + d.step * Number(b.dataset.dir)));
          T[d.k] = Math.round(next * 1000) / 1000;
          valueEl.textContent = fmtVal(d, T[d.k]);
          if (T[d.k] === d.def) valueEl.classList.remove('is-changed'); else valueEl.classList.add('is-changed');
          saveTune();
          applyTuneVisuals();
          unpatchPivot(); // re-patch with the new sensitivity on the next tick
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
    unpatchPivot();
    renderTune();
  });

  (function loop() {
    stickTick();
    updateHeadingIndicator();
    const pl = window.game && window.game.player;
    if (pl) lowSpeedPivotTick(pl);
    requestAnimationFrame(loop);
  })();

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
    const inVehicle = !!(g.player && g.player.inVehicle);
    if (inVehicle !== lastInVehicle) {
      lastInVehicle = inVehicle;
      enterBtn.textContent = inVehicle ? 'Exit' : 'Enter';
      // In vehicles the handbrake comes from holding the stick centre; the
      // button is only needed on foot (jump).
      jumpBtn.hidden = inVehicle;
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
