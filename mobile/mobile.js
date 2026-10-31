/*
 * GTA.js mobile overlay — v1
 *
 * Strategy: the game reads input exclusively through `keydown` / `keyup`
 * listeners on `document`, keyed by `event.code`. This overlay never touches
 * the game bundle: it synthesises KeyboardEvents from touch input.
 *
 *   Left half of the screen  → floating 8-way digital joystick (tank controls:
 *                              ←/→ rotate, ↑ forward, ↓ reverse)
 *   Right side               → FIRE (ControlLeft), ENTER/EXIT (Enter),
 *                              JUMP/HANDBRAKE (Space), RUN (ShiftLeft, lockable)
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
    <div id="gtaStickZone">
      <div id="gtaStick"><div id="gtaStickKnob"></div></div>
    </div>
    <div id="gtaStickHint">MOVE</div>

    <button type="button" class="gta-btn gta-btn-fire" data-key="ControlLeft">Fire</button>
    <button type="button" class="gta-btn gta-btn-enter" data-key="Enter" id="gtaEnter">Enter</button>
    <button type="button" class="gta-btn gta-btn-jump" data-key="Space" id="gtaJump">Jump</button>
    <button type="button" class="gta-btn gta-btn-run" data-key="ShiftLeft" data-lockable id="gtaRun">Run</button>

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

  root.addEventListener('contextmenu', (e) => e.preventDefault());

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
  // Fired on `click`, not `pointerdown`: the game's <dialog closedby="any">
  // light-dismisses on the click that follows a pointerdown outside it, so
  // toggling the menu on pointerdown would open and immediately close it.
  for (const btn of root.querySelectorAll('[data-tap]')) {
    const code = btn.dataset.tap;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('is-down');
    });
    const up = () => btn.classList.remove('is-down');
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('click', () => tap(code));
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

  // ---------- Floating joystick ----------
  const zone = root.querySelector('#gtaStickZone');
  const stick = root.querySelector('#gtaStick');
  const knob = root.querySelector('#gtaStickKnob');
  const RADIUS = 70; // px, matches CSS
  const ENTER = 0.35; // fraction of radius to engage a direction
  const EXIT = 0.2; // fraction to disengage (hysteresis)
  const AXIS_BIAS = 0.45; // diagonal tolerance (tan of half-angle-ish)

  let stickId = null;
  let cx = 0,
    cy = 0;
  const axis = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

  function setAxis(code, on) {
    if (axis[code] === on) return;
    axis[code] = on;
    on ? press(code) : release(code);
  }

  function updateStick(x, y) {
    let dx = x - cx;
    let dy = y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;

    const nx = dx / RADIUS;
    const ny = dy / RADIUS;
    const mag = Math.min(1, dist / RADIUS);

    // Decide per-axis with hysteresis. A direction engages when its component
    // exceeds ENTER and dominates the other axis enough (AXIS_BIAS) to allow
    // diagonals without accidental taps on the orthogonal axis.
    const want = (comp, other, current) => {
      const thr = current ? EXIT : ENTER;
      return comp > thr && comp > other * AXIS_BIAS && mag > (current ? EXIT : ENTER);
    };
    setAxis('ArrowUp', want(-ny, Math.abs(nx), axis.ArrowUp));
    setAxis('ArrowDown', want(ny, Math.abs(nx), axis.ArrowDown));
    setAxis('ArrowLeft', want(-nx, Math.abs(ny), axis.ArrowLeft));
    setAxis('ArrowRight', want(nx, Math.abs(ny), axis.ArrowRight));
  }

  function endStick() {
    stickId = null;
    stick.classList.remove('is-active');
    zone.classList.remove('is-touching');
    knob.style.transform = '';
    for (const code of Object.keys(axis)) setAxis(code, false);
  }

  zone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    e.preventDefault();
    stickId = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    cx = e.clientX;
    cy = e.clientY;
    stick.style.left = `${cx}px`;
    stick.style.top = `${cy}px`;
    stick.classList.add('is-active');
    zone.classList.add('is-touching');
    updateStick(cx, cy);
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
