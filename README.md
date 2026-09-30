# Wobbly Cargo

A 2D physics delivery game for CrazyGames. Drive a little truck over hills, jumps, ferries and hammers
without dropping the wobbly cargo. The game includes:

- 50 levels in 5 worlds. Each world adds new hazards and new cargo:
  - **Sunny Meadows (1–10):** hills, seesaws, logs, bridges, first jumps and bouncers.
  - **Dusty Canyon (11–20):** eggs, falling rocks, boost pads, hammers, ferries, wind and a runaway boulder that flattens a slow truck.
  - **Frosty Peaks (21–30):** ice, snowball chases, lifts, ski jumps, penguins and a piano with TNT.
  - **Volcano Valley (31–40):** lava pits, geysers, crumbling slabs, lava rain, jelly and vases.
  - **Moon Base (41–50):** low gravity, meteor showers, pistons, low-gravity zones, aliens and crystals.
- 3 optional stars per level.
- A garage with cosmetic paint jobs and hats.
- A seeded daily challenge.

The game runs on keyboard, touch and gamepad, on desktop and mobile.

## Requirements

- Node.js 18 or newer
- For `npm test`: a locally installed Google Chrome or Microsoft Edge (Playwright uses the system browser, nothing is downloaded)

## Commands

```bash
npm install          # once
npm run dev          # dev server at http://localhost:8080 (rebuilds on page reload)
npm run build        # production build -> dist/ and wobbly-cargo.zip
npm run validate     # headless bot drives all 50 levels + 40 daily seeds
npm test             # build + validate + browser end-to-end tests
```

`node tools/e2e.mjs --shots` also saves screenshots of every screen and viewport to `test-results/`.
`--only <name>` runs a single group (keyboard, playthrough, viewports, touch, sdkfail, ads, nointerrupt, iframe, refresh).

## Upload to CrazyGames

1. Run `npm run build`.
2. In the CrazyGames Developer Portal, create an HTML5 game and upload **`wobbly-cargo.zip`** from the project root.
   The zip contains `index.html` at its root, plus `game.js`, `style.css` and `assets/lilita-one.woff2`, about 110 KB in total.
   You can also upload the contents of `dist/`.
3. Suggested settings:
   - Orientation: landscape. Portrait works, and a rotate hint is shown.
   - Mobile: supported.
   - Engine: HTML5 / custom JS.
4. Use the portal preview to check the ads and the SDK flow before you submit.

Do not upload after `npm run dev`: it leaves an unminified build in `dist/`. Run `npm run build` again first.

Covers, thumbnails and preview videos are not part of this project. You create them yourself.

## CrazyGames SDK v3 integration (`src/sdk.js`)

- The SDK is loaded from `https://sdk.crazygames.com/crazygames-sdk-v3.js`. This is the only external request.
- `init()` has a 6 s timeout. If the SDK is missing, blocked, throws, hangs, or its environment is `disabled`, the game runs normally without it:
  - no ads;
  - saves go to `localStorage`, or to memory if storage is blocked.
- `loadingStart` / `loadingStop` wrap the boot.
- `gameplayStart` is called when a run starts or resumes.
- `gameplayStop` is called on:
  - pause;
  - finishing or failing a run;
  - opening a menu;
  - while an ad plays.
- `happytime` is called on a new daily best and on world completion.
- **Midgame ads** play only on the result/fail break, and only when all of these hold:
  - at least 3 runs have been played;
  - at least 185 s have passed since the last midgame ad;
  - the player chose to continue.

  A run is never interrupted.
- **Rewarded ads** are always optional:
  - skip a level after 3 fails;
  - double the coins on the result screen;
  - +50 coins in the garage.

  If the environment is Basic Launch, has adblock, or the ad reports an error, the offers disappear and the game continues.
- Every ad callback is guarded:
  - 10 s start timeout;
  - 120 s maximum length;
  - audio is muted and input is disabled while an ad plays;
  - an SDK exception never blocks the game.
- Progress is saved with the SDK `data` module (cloud save for logged-in players). `localStorage` is the fallback.
- The CrazyGames `muteAudio` setting is respected.

## Controls

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Gas | → / D / ↑ / W | GAS pedal (right) | RT / A / stick right |
| Brake / reverse | ← / A / ↓ / S | BRAKE pedal (left) | LT / stick left |
| Restart | R | ↻ button | Y |
| Pause | P / Esc | ❚❚ button | Start |
| Horn | H | – | X |
| Mute | M | settings | – |

## Project structure

```
src/
  main.js, app.js        boot, game state machine, progression, rewards, ads flow
  sdk.js, save.js        CrazyGames SDK wrapper, save data (SDK data / localStorage / memory)
  input.js               keyboard, touch pedals, gamepad
  game/                  deterministic physics sim (planck.js, fixed 60 Hz step), levels, daily generator, truck, bot
  render/                canvas renderer, parallax themes, truck/cargo drawing, particles
  audio/                 synthesized sound effects and music (WebAudio, no audio files)
  ui/                    DOM menus/HUD, SVG icons
  style.css, index.html
tools/
  build.mjs              esbuild bundle + CSS minify + zip
  dev-server.mjs         local server
  validate-levels.mjs    headless bot playthrough of every level and daily seed
  e2e.mjs                browser tests
```

The physics steps at a fixed 1/60 s with an accumulator, so the game plays the same at 30, 60, 144 Hz or more.
The e2e test checks that the truck position is bit-identical across refresh rates.

## What the tests cover

- Autopilot plays all 50 levels in the real app.
- Keyboard driving, pause, and instant restart.
- Touch pedals in phone landscape and portrait.
- Save survives a reload.
- Layout at 1920×1080, 1366×768, 1216×684, 907×510 and 800×450: nothing clipped, text readable.
- Running inside an iframe.
- SDK failure paths: blocked, init throws, init hangs, disabled.
- Ad outcomes: success, unfilled, callbacks never fire, requestAd throws, Basic Launch.
- No ad ever starts during a run.
