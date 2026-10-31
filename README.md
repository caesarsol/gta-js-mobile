# GTA.js — mobile test harness

Personal, unlisted test bed for adding **touch controls** to [GTA.js](https://gtajs.wtf/)
(Bramus' reimplementation of the 1997 Grand Theft Auto engine in TypeScript + Three.js).

> **Status / legal note.** GTA.js has not published its source code or a license.
> `assets/` is an unmodified mirror of the production build served by gtajs.wtf
> (only the CSS `url(/assets/…)` paths are rewritten to relative). It is here solely so
> the touch overlay can be tested on real phones; it is not meant for redistribution.
> The goal is to contribute the overlay upstream once the author shares the source.
> Original 1997 GTA demo assets © DMA Design / Rockstar Games — they are **not** in this
> repo: the game downloads the shareware demo ZIP from archive.org into the browser cache.

## Layout

| Path | What |
|---|---|
| `index.html` | The `/play` page from gtajs.wtf with relative asset paths + our overlay |
| `assets/` | Mirrored build (`play-*.js`, `play-*.css`, polyfill, screenshot) |
| `sw.js` | Mirrored service worker (serves cached game data) |
| `mobile/boot.js` | Cache-busting loader: loads our files with `?v=<timestamp>`, shows a version label and a ↻ pill |
| `mobile/mobile.js`, `mobile/mobile.css` | **Our touch overlay** |
| `mobile/save.js` | **Save / load** (manual slot + autosave, see below) |
| `mobile/autostart.js` | Skips the intro dialog: downloads the demo ZIP if not cached, then presses PLAY |
| `scripts/mirror.sh` | Re-mirror the latest build from gtajs.wtf and update `index.html` |

## How the overlay works

The game reads input only through `keydown`/`keyup` on `document`, keyed by `event.code`
(`ArrowUp/Down/Left/Right`, `ControlLeft` fire, `ShiftLeft` run, `Space` jump/handbrake,
`Enter` enter/exit vehicle, `KeyZ`/`KeyX` weapons, `?` menu). `mobile.js` dispatches synthetic
`KeyboardEvent`s from touch input and never patches the bundle.

- **Bottom-left**: fixed joystick with **absolute direction**: the stick points where you
  want to go on screen; a per-frame controller reads the heading from `window.game` and
  presses ←/→ until the character/car faces that way (steering sign is flipped while a car
  is reversing, as the engine does). Distance from the center picks the speed:
  `< 20px` idle · `20–110px` walk/drive · `> 110px` run (on foot; the ring is hidden in vehicles). A yellow arrow on the base shows
  the current facing. **Reverse exists only in vehicles** and is by direction, not
  distance: if the stick points into the dashed sector behind the car (beyond 130°, with
  hysteresis back to 100°) you back up toward it instead of U-turning; the knob turns red
  while reversing. On foot you always turn and walk forward. Thresholds are constants at
  the top of `mobile.js`.
- **Right**: FIRE, ENTER/EXIT, JUMP/BRAKE.
- **Top**: `?` menu, fullscreen (+ landscape lock where supported); **Pivot** toggle on the left (white = on); on the right the list of owned weapons with ammo in parentheses, active one in white, tap to select.
- Hidden automatically while the intro/options dialog is open or on game over.
- Desktop: overlay is off; append `?touch` to the URL to force it.

## Save / load

Userspace, through `window.game` — the bundle is not patched. Pills **SAVE** / **LOAD**
top-left. Autosave when the tab goes to the background / the page is left; on the first
start of each page load the most recent slot is loaded automatically. The LOAD menu lists
both slots and a **New game** entry (two taps: clears the slots and restarts).

- **Always**: position + heading, weapons/ammo, score/lives/multiplier/armor/jail key/
  wanted level, vehicle model if driving (respawned next to you; you load on foot).
- **Between missions** (experimental): `MISSION.INI` engine state — processes, trigger
  flags, counters, collected/destroyed sets, phones, doors, completed count. Captured
  only when no mission entity is alive (peds, timer, kill frenzy, pending vehicles);
  otherwise the save is player-only and the toast says so. The load menu also offers
  "Player only" for any slot.
- Saves are keyed by the bundle hash: after re-mirroring a new build, old saves are
  ignored rather than loaded into an incompatible engine.

## Deploy (GitHub Pages)

Settings → Pages → *Deploy from a branch* → this branch, folder `/ (root)`.
`.nojekyll` is present so the hashed asset names are served as-is.

On iPhone Safari there is no Fullscreen API: use *Share → Add to Home Screen* for a
chrome-less landscape experience.
