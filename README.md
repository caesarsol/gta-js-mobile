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
| `mobile/mobile.js`, `mobile/mobile.css` | **Our touch overlay** — the only thing being developed here |
| `scripts/mirror.sh` | Re-mirror the latest build from gtajs.wtf and update `index.html` |

## How the overlay works

The game reads input only through `keydown`/`keyup` on `document`, keyed by `event.code`
(`ArrowUp/Down/Left/Right`, `ControlLeft` fire, `ShiftLeft` run, `Space` jump/handbrake,
`Enter` enter/exit vehicle, `KeyZ`/`KeyX` weapons, `?` menu). `mobile.js` dispatches synthetic
`KeyboardEvent`s from touch input and never patches the bundle.

- **Left half**: floating 8-way digital joystick (tank controls, with hysteresis).
- **Right**: FIRE, ENTER/EXIT, JUMP/BRAKE, RUN (long-press to lock).
- **Top**: weapon prev/next, `?` menu, fullscreen (+ landscape lock where supported).
- Hidden automatically while the intro/options dialog is open or on game over.
- Desktop: overlay is off; append `?touch` to the URL to force it.

## Deploy (GitHub Pages)

Settings → Pages → *Deploy from a branch* → this branch, folder `/ (root)`.
`.nojekyll` is present so the hashed asset names are served as-is.

On iPhone Safari there is no Fullscreen API: use *Share → Add to Home Screen* for a
chrome-less landscape experience.
