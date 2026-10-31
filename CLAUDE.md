# CLAUDE.md — GTA.js Mobile

Personal test harness that makes [GTA.js](https://gtajs.wtf/) (Bramus' TypeScript/Three.js
reimplementation of GTA 1997) playable on phones. Live at
https://caesarsol.github.io/gta-js-mobile/ (GitHub Pages from `main`).

## How we work

- **Proposals first, then work.** When asked for options, write them *before* doing anything,
  and then only do the approved work. Never do the work first and propose after.
- Answer in the order of effort: things needing no commands first, then read-only checks,
  then edits.
- Every step: verify in headless Chromium, **commit and push to `main`**. The user tests on a
  real phone right after.
- Chat in Italian; code, comments, commit messages and docs in English.
- The branch is `main`. Do not create `claude/*` branches.

## Architecture (do not break)

- `assets/` + `sw.js`: **unmodified mirror** of the production build from gtajs.wtf (no source,
  no license published). Never patch the bundle. `scripts/mirror.sh` re-mirrors it.
- `index.html`: the `/play` page with relative paths. Loads only `mobile/boot.js?v=N`.
- `mobile/boot.js`: cache-busting loader (`?v=<timestamp>` for our files), version label,
  reload pill. Changing it costs up to 10 min of Pages CDN cache → avoid; add logic to the
  other files instead. If you must, bump `?v=N` in `index.html`.
- `mobile/mobile.js` + `mobile.css`: touch overlay (joystick, buttons, top-bar icon pills, weapon
  list, Tune panel, sound pill). Icons are inline SVG in `ICONS` (also `window.gtaIcons`).
- `mobile/save.js`: save/load (manual + autosave on tab hide, auto-load on first start,
  New game).
- `mobile/autostart.js`: skips the intro dialog (downloads the demo ZIP if not cached,
  presses PLAY).
- Everything we do goes through `window.game` (exposed by the bundle) and runtime
  monkey-patching of instances. Property names survive minification; local vars don't.

## UI component rule

One component for every tappable control: `.gta-pill` with modifiers `is-on` (white =
active/selected), `is-down`, `--primary` (yellow), `--danger`, `--dim`, `--block`.
Positioning by id only. Round action buttons are `.gta-btn` with the same tokens. Size by
padding, never fixed width/height. Keep the reset on the component classes, not on
`#gtaMobile button` (boot.js mounts the reload pill outside `#gtaMobile`).

## Engine facts (verified empirically on the production build)

- Input: only `keydown`/`keyup` on `document`, keyed by `e.code`. Arrows, `ShiftLeft` run,
  `ControlLeft` fire, `Space` jump/handbrake, `Enter` enter/exit, `KeyZ`/`KeyX` weapons,
  `?` (`Slash`+shift) options dialog. Synthetic `KeyboardEvent`s work.
- Camera: top-down, axis-aligned, follows the player. Screen-right = world +x, screen-up = +y.
- Heading `r = sprite.rotation.z` (vehicle: `currentVehicle.sprite.rotation.z`). Forward in
  world = `(sin r, −cos r)`. `r = π` faces screen-up. `ArrowLeft` increases `r`.
- Cars yaw in proportion to speed (`pl()`), zero at standstill unless the handling profile
  has `canPivotInPlace`. Steering sign is **inverted while reversing**.
  (Tried and **rejected** by the user: a low-speed pivot patch, and a handbrake from holding
  the stick centre. Don't propose them again.)
- Player position: `player.position` (Three.js) + `physicsBody` (planck, world/10, y flipped).
  `teleportTo()` snaps to block centres; set both directly for exact positions.
- `styleData.cars` is an **object** keyed by model index (no `.length`/`indexOf`).
  A vehicle's model is `vehicle.type`.
- `missionEngine.isInitialStartupPhase` means "no mission taken yet", not "booting".
- Crates (`isBox`, solid) break only by driving over them or by projectiles/explosions;
  fists do nothing. Breaking spawns a pickup you walk over. Powerup types: 1 pistol,
  2 MG, 3 rockets, 4 flamethrower, 9 coin, 10 armor, 11 extra life, 12 key, 13/15 heart.
- The game's `<dialog closedby="any">` light-dismisses on a click/pointer sequence outside
  it: act on `pointerup` deferred with `setTimeout(…, 0)`. We cancel `touchstart` on the game
  surface, so **no `click` is synthesised** on the overlay — use pointer events.
- Audio needs a user gesture. The engine's own retry is a **one-shot** on `pointerdown`/`keydown`;
  iOS does not count touch `pointerdown` as a gesture and we cancel `touchstart` (no `click`), so
  with autostart the context would stay suspended forever. The **Sound pill** (default off)
  unlocks on its `pointerup`; a saved-on state resumes on the next `touchend`/`pointerup`/`keydown`.
  iOS also mutes Web Audio with the ringer switch unless an `<audio>` element is playing →
  we loop `mobile/silence.wav` while sound is on.

## Testing (headless)

```bash
cd /home/user && nohup python3 -m http.server 8123 --bind 127.0.0.1 >/dev/null 2>&1 &
node scripts/headless.js            # smoke: start, enter car at spawn, drive, screenshot
```

`scripts/headless.js` exports helpers (`launch`, `startGame`, `key`, `touch`, `enterCarAtSpawn`,
`state`). Playwright + Chromium are preinstalled; use `--use-gl=swiftshader`. Device:
iPhone 13, viewport 844×390 (landscape), `hasTouch`. Touches via CDP
`Input.dispatchTouchEvent`. The demo ZIP (9.5 MB, archive.org) is downloaded once per browser
context; `autostart.js` handles the intro.

**Tip from the user:** at spawn there is a car right next to you — press `Enter` (or tap
ENTER) immediately to get in and test driving. Don't bother with `spawnVehicleNearPlayer`.

## Gotchas met so far

- A reset rule with higher specificity (`#id button`) silently zeroes component padding.
- Fixed-position elements have `offsetParent === null` (filters in tests).
- Pages `index.html`/`boot.js` can lag 10 min; everything under `mobile/` is instant thanks
  to the timestamped loader.

## Probes in `scripts/`

- `headless.js` — helpers + smoke test (enter the spawn car, drive).
- `probe-tune.js` — Tune panel steppers, persistence and help toggle.
All tunables live in `TUNE_DEFS` (mobile.js) and are reachable as `window.gtaMobile.tune`.
