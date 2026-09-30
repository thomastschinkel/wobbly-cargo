// Browser end-to-end checks with a local Chrome/Edge (playwright-core, no bundled browser).
// Run `node tools/build.mjs` first. Usage: node tools/e2e.mjs [--only name] [--shots]
// Prints one line per check; screenshots go to test-results/ with --shots.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { serve } from './dev-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const outDir = path.join(root, 'test-results');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const shots = args.includes('--shots');
const PORT = 8123;
const BASE = `http://localhost:${PORT}/`;
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

// Fake CrazyGames SDK v3. Behaviour is chosen with window.__sdkMode (set by an init script).
const MOCK_SDK = `(function(){
  var mode = window.__sdkMode || 'ok';
  var calls = window.__sdkCalls = [];
  function log(n){ calls.push(n); }
  var SDK = {
    environment: mode === 'disabled' ? 'disabled' : 'crazygames',
    init: function(){ log('init');
      if (mode === 'throw') return Promise.reject(new Error('init failed'));
      if (mode === 'hang') return new Promise(function(){});
      return Promise.resolve(); },
    game: {
      settings: { muteAudio: false },
      gameplayStart: function(){ log('gameplayStart'); }, gameplayStop: function(){ log('gameplayStop'); },
      loadingStart: function(){ log('loadingStart'); }, loadingStop: function(){ log('loadingStop'); },
      happytime: function(){ log('happytime'); },
      addSettingsChangeListener: function(f){ window.__sdkSettings = f; }
    },
    ad: {
      hasAdblock: function(){ return Promise.resolve(false); },
      requestAd: function(type, cb){ log('ad:' + type);
        if (mode === 'ads-error') { setTimeout(function(){ cb.adError && cb.adError({ code: 'unfilled', message: 'no fill' }); }, 30); return; }
        if (mode === 'ads-basic') { setTimeout(function(){ cb.adError && cb.adError({ code: 'adsDisabledBasicLaunch' }); }, 30); return; }
        if (mode === 'ads-never') return;
        if (mode === 'ads-throw') throw new Error('ad crash');
        setTimeout(function(){ cb.adStarted && cb.adStarted(); setTimeout(function(){ cb.adFinished && cb.adFinished(); }, 250); }, 30);
      }
    },
    data: {
      getItem: function(k){ return localStorage.getItem('__cg_' + k); },
      setItem: function(k, v){ localStorage.setItem('__cg_' + k, String(v)); }, removeItem: function(k){ localStorage.removeItem('__cg_' + k); }
    }
  };
  window.CrazyGames = { SDK: SDK };
})();`;

const results = [];
const ok = (name, pass, note = '') => { results.push({ name, pass }); console.log(`${pass ? ' ok ' : 'FAIL'} ${name}${note ? '  - ' + note : ''}`); };

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] }); } catch (e) { /* try next */ }
  }
  throw new Error('No local Chrome or Edge found for playwright-core');
}

async function newPage(browser, { mode = 'ok', viewport = { width: 1366, height: 768 }, touch = false, sdk = 'mock', storage = null } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(([m, st]) => {
    window.__sdkMode = m;
    if (st) { try { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.setItem('wobblycargo_save_v1', st); localStorage.setItem('__cg_wobblycargo_save_v1', st); } } catch (e) { /* ignore */ } }
  }, [mode, storage]);
  await page.route(SDK_URL, (route) => (sdk === 'blocked' ? route.abort() : route.fulfill({ status: 200, contentType: 'text/javascript', body: MOCK_SDK })));
  return { ctx, page, errors };
}

const waitMode = (page, modes, timeout = 15000) => page.waitForFunction((ms) => window.__wobbly && ms.includes(window.__wobbly.mode), modes, { timeout });
const gameMode = (page) => page.evaluate(() => window.__wobbly.mode);

// fast-forward the simulation (autopilot drives) until the run ends
async function autoFinish(page, mul = 1.0) {
  return page.evaluate((m) => {
    const g = window.__wobbly;
    g.autoMul = m;
    g.startRun(g.level, true);
    let n = 0;
    while (g.mode === 'play' || g.mode === 'end') { g.step(); if (++n > 60 * 240) break; }
    return { mode: g.mode, delivered: g.sim.delivered, total: g.sim.cargo.length, reason: g.sim.failReason };
  }, mul);
}

async function panelsInside(page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    const bad = [];
    document.querySelectorAll('.panel, .btn, #hud .tl, #hud .tr, #hud .tc, .pedal').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (!r.width) return;
      if (r.left < -1 || r.top < -12 || r.right > W + 1 || r.bottom > H + 1) bad.push(`${e.className} ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
    });
    const small = [];
    document.querySelectorAll('.btn span, .lvl-pill, .timer, .why, .dim, .stat small').forEach((e) => {
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (e.offsetParent && fs < 11.5) small.push(`${e.className || e.tagName}:${fs}`);
    });
    return { bad, small: small.slice(0, 5) };
  });
}

async function shot(page, name) {
  if (!shots) return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, name + '.png') });
}

const tests = {
  // fresh visit goes straight into level 1; keyboard driving moves the truck
  async keyboard(browser) {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(BASE);
    await waitMode(page, ['play']);
    ok('fresh visit starts level 1', (await page.evaluate(() => window.__wobbly.level.id)) === 1);
    const x0 = await page.evaluate(() => window.__wobbly.sim.truck.chassis.getPosition().x);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1600);
    await page.keyboard.up('ArrowRight');
    const x1 = await page.evaluate(() => window.__wobbly.sim.truck.chassis.getPosition().x);
    ok('keyboard gas drives the truck', x1 - x0 > 3, `moved ${(x1 - x0).toFixed(1)} m`);
    const calls = await page.evaluate(() => window.__sdkCalls.join(','));
    ok('sdk init + loading + gameplayStart', /init/.test(calls) && /loadingStart/.test(calls) && /loadingStop/.test(calls) && /gameplayStart/.test(calls), calls.slice(0, 80));
    await page.keyboard.press('KeyP');
    await waitMode(page, ['paused']);
    ok('P pauses and sends gameplayStop', (await page.evaluate(() => window.__sdkCalls.slice(-1)[0])) === 'gameplayStop');
    await page.keyboard.press('Space');
    await waitMode(page, ['play']);
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(100);
    const x2 = await page.evaluate(() => window.__wobbly.sim.truck.chassis.getPosition().x);
    ok('R restarts instantly', x2 < 0.5 && (await gameMode(page)) === 'play');
    ok('no page errors (keyboard)', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  },

  // autopilot playthrough of all 50 levels through the real app state machine, then save/load
  async playthrough(browser) {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(BASE);
    await waitMode(page, ['play']);
    const fails = [];
    for (let id = 1; id <= 50; id++) {
      await page.evaluate((i) => { const g = window.__wobbly; g.level = null; g.playLevel(i); }, id);
      let r = await autoFinish(page, 1.0);
      if (r.mode !== 'result') r = await autoFinish(page, 0.9);
      if (r.mode !== 'result') r = await autoFinish(page, 0.8);
      if (r.mode !== 'result') fails.push(`${id}:${r.reason}`);
      if (id % 10 === 0) await shot(page, `result-${id}`);
    }
    ok('all 50 levels completable in-app', fails.length === 0, fails.join(' '));
    const saved = await page.evaluate(() => { const s = window.__wobbly.S; return { unlocked: s.unlocked, n: Object.keys(s.levels).length, coins: s.coins }; });
    ok('progress stored', saved.unlocked === 50 && saved.n === 50 && saved.coins > 100, JSON.stringify(saved));
    const calls = await page.evaluate(() => window.__sdkCalls.filter((c) => c === 'happytime').length);
    ok('happytime on world completion', calls >= 5, `${calls}x`);
    await page.evaluate(() => window.__wobbly.autoMul = 0);
    await page.reload();
    await waitMode(page, ['title']);
    const after = await page.evaluate(() => { const s = window.__wobbly.S; return { unlocked: s.unlocked, n: Object.keys(s.levels).length, visits: s.visits }; });
    ok('save survives reload (SDK data)', after.unlocked === 50 && after.n === 50 && after.visits >= 2, JSON.stringify(after));
    ok('no page errors (playthrough)', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  },

  // every menu at the CrazyGames reference sizes: nothing clipped, text readable
  async viewports(browser) {
    const save = JSON.stringify({ v: 1, unlocked: 12, coins: 420, levels: { 1: { stars: [1, 1, 1], best: 12 }, 2: { stars: [1, 0, 1], best: 20 } }, runs: 5 });
    const sizes = [[1920, 1080], [1366, 768], [1216, 684], [907, 510], [800, 450]];
    for (const [w, h] of sizes) {
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: w, height: h }, storage: save, sdk: 'blocked' });
      await page.goto(BASE);
      await waitMode(page, ['title']);
      await page.waitForTimeout(300);
      const probs = [];
      const check = async (label) => {
        await page.waitForTimeout(350);
        const r = await panelsInside(page);
        if (r.bad.length) probs.push(`${label}: clipped ${r.bad[0]}`);
        if (r.small.length) probs.push(`${label}: small text ${r.small[0]}`);
        await shot(page, `${w}x${h}-${label}`);
      };
      await check('title');
      await page.evaluate(() => window.__wobbly.openLevels(0)); await check('levels');
      await page.evaluate(() => window.__wobbly.openGarage()); await check('garage');
      await page.evaluate(() => window.__wobbly.openDaily()); await check('daily');
      await page.evaluate(() => window.__wobbly.openSettings('title')); await check('settings');
      await page.evaluate(() => window.__wobbly.playLevel(3)); await page.waitForTimeout(2600); await check('hud');
      await page.evaluate(() => window.__wobbly.pause()); await check('pause');
      await page.evaluate(() => { window.__wobbly.resume(); });
      let r = await autoFinish(page, 1.0);
      await check(r.mode === 'result' ? 'result' : 'end');
      await page.evaluate(() => { const g = window.__wobbly; g.autoMul = 0; g.startRun(g.level, true); g.sim.fail('cargo'); });
      for (let i = 0; i < 90; i++) await page.evaluate(() => window.__wobbly.step());
      await check('fail');
      ok(`layout ${w}x${h}`, probs.length === 0 && errors.length === 0, probs.slice(0, 3).join(' | ') + errors.slice(0, 1).join(''));
      await ctx.close();
    }
  },

  // phones: touch pedals drive, portrait + landscape layout
  async touch(browser) {
    for (const [w, h, label] of [[844, 390, 'landscape'], [390, 844, 'portrait']]) {
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: w, height: h }, touch: true });
      await page.goto(BASE);
      await waitMode(page, ['play']);
      await page.waitForTimeout(500);
      const pedals = await page.locator('.pedal').count();
      const x0 = await page.evaluate(() => window.__wobbly.sim.truck.chassis.getPosition().x);
      const gas = page.locator('.pedal.gas');
      const box = await gas.boundingBox();
      await gas.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: box.x + 20, clientY: box.y + 20 });
      await page.waitForTimeout(1500);
      const held = await page.evaluate(() => window.__wobbly.input.state().gas);
      await gas.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true });
      const x1 = await page.evaluate(() => window.__wobbly.sim.truck.chassis.getPosition().x);
      const released = await page.evaluate(() => window.__wobbly.input.state().gas);
      await shot(page, `touch-${label}`);
      const lay = await panelsInside(page);
      ok(`touch ${label}: pedals drive`, pedals === 2 && held === 1 && released === 0 && x1 - x0 > 2, `pedals ${pedals} moved ${(x1 - x0).toFixed(1)}`);
      ok(`touch ${label}: layout`, lay.bad.length === 0 && errors.length === 0, lay.bad.slice(0, 2).join(' | ') + errors.slice(0, 1).join(''));
      await ctx.close();
    }
  },

  // SDK failure paths: game must boot and stay playable
  async sdkfail(browser) {
    const cases = [['blocked', 'ok', 'sdk script blocked'], ['mock', 'throw', 'init throws'], ['mock', 'hang', 'init never resolves'], ['mock', 'disabled', 'environment disabled']];
    for (const [sdkKind, mode, label] of cases) {
      const { ctx, page, errors } = await newPage(browser, { mode, sdk: sdkKind });
      const t0 = Date.now();
      await page.goto(BASE);
      await waitMode(page, ['play', 'title'], 15000).catch(() => {});
      const m = await page.evaluate(() => window.__wobbly && window.__wobbly.mode).catch(() => null);
      const saved = await page.evaluate(() => { const g = window.__wobbly; g.persist(); return g.store.backend; }).catch(() => '?');
      ok(`${label}: boots (${((Date.now() - t0) / 1000).toFixed(1)}s, save=${saved})`, (m === 'play' || m === 'title') && errors.length === 0, errors.slice(0, 1).join(''));
      if (m === 'play') {
        const r = await autoFinish(page, 1.0);
        const offers = await page.locator('.offer').count();
        ok(`${label}: result without ad offers`, r.mode === 'result' && offers === 0);
        await page.evaluate(() => window.__wobbly.next());
        await waitMode(page, ['play'], 5000).catch(() => {});
        ok(`${label}: next level without ads`, (await gameMode(page)) === 'play');
      }
      await ctx.close();
    }
  },

  // ads: success, error, never-called callbacks, throwing SDK, Basic Launch
  async ads(browser) {
    const save = JSON.stringify({ v: 1, unlocked: 5, coins: 10, runs: 10, levels: { 1: { stars: [1, 1, 1], best: 12 } } });
    for (const mode of ['ok', 'ads-error', 'ads-never', 'ads-throw', 'ads-basic']) {
      const { ctx, page, errors } = await newPage(browser, { mode, storage: save });
      await page.goto(BASE);
      await waitMode(page, ['title']);
      await page.evaluate(() => window.__wobbly.playLevel(2));
      // level 2 is deterministic: the autopilot delivers it at 0.9x pace
      const r = await autoFinish(page, 0.9);
      const coins0 = await page.evaluate(() => window.__wobbly.S.coins);
      const offer = page.locator('.offer .btn');
      const has = (await offer.count()) > 0;
      let coins1 = coins0;
      if (has) {
        await offer.click();
        await page.waitForFunction(() => !window.__wobbly.adBusy, null, { timeout: 15000 }).catch(() => {});
        coins1 = await page.evaluate(() => window.__wobbly.S.coins);
      }
      const doubled = coins1 > coins0;
      const expectDouble = mode === 'ok';
      // midgame happens on Next (runs >= 3); game must continue afterwards in every mode
      await page.evaluate(() => { window.__wobbly.adBusy = false; window.__wobbly.next(); });
      await waitMode(page, ['play'], 15000).catch(() => {});
      const m = await gameMode(page);
      const calls = await page.evaluate(() => window.__sdkCalls.filter((c) => c.startsWith('ad:')).join(','));
      ok(`ads ${mode}: rewarded ${expectDouble ? 'pays' : 'fails gracefully'}, game continues`, r.mode === 'result' && has && doubled === expectDouble && m === 'play' && errors.length === 0, `${calls} ${errors.slice(0, 1).join('')}`);
      if (mode === 'ads-basic') {
        await page.evaluate(() => { const g = window.__wobbly; g.autoMul = 0; });
        const r2 = await autoFinish(page, 1.0);
        ok('ads basic launch: offers hidden after first refusal', r2.mode === 'result' && (await page.locator('.offer').count()) === 0);
      }
      await ctx.close();
    }
  },

  // midgame never interrupts a run
  async nointerrupt(browser) {
    const { ctx, page } = await newPage(browser, { storage: JSON.stringify({ v: 1, unlocked: 3, runs: 10 }) });
    await page.goto(BASE);
    await waitMode(page, ['title']);
    await page.evaluate(() => window.__wobbly.playLevel(1));
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2500);
    await page.keyboard.up('ArrowRight');
    const calls = await page.evaluate(() => window.__sdkCalls.filter((c) => c.startsWith('ad:')).length);
    ok('no ads during a run', calls === 0);
    await ctx.close();
  },

  // embedded in an iframe like on CrazyGames
  async iframe(browser) {
    const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1100, height: 700 } });
    await page.route(BASE + 'host.html', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: `<body style="margin:0;background:#111"><iframe src="${BASE}index.html" style="width:907px;height:510px;border:0" allow="autoplay; fullscreen"></iframe></body>` }));
    await page.goto(BASE + 'host.html');
    const frame = page.frames().find((f) => f.url().includes('index.html')) || (await page.waitForEvent('frameattached'));
    await frame.waitForFunction(() => window.__wobbly && ['play', 'title'].includes(window.__wobbly.mode), null, { timeout: 15000 });
    await page.mouse.click(450, 120);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1200);
    await page.keyboard.up('ArrowRight');
    const scrolled = await page.evaluate(() => window.scrollY);
    const x = await frame.evaluate(() => window.__wobbly.sim.truck.chassis.getPosition().x);
    await shot(page, 'iframe');
    ok('iframe: boots, keys drive, page does not scroll', x > 1 && scrolled === 0 && errors.length === 0, `x ${x.toFixed(1)}`);
    await ctx.close();
  },

  // physics identical regardless of display refresh rate (fixed step + accumulator)
  async refresh(browser) {
    const { ctx, page } = await newPage(browser);
    await page.goto(BASE);
    await waitMode(page, ['play']);
    const res = await page.evaluate(() => {
      const g = window.__wobbly;
      const step = g.step.bind(g);
      let trace = [];
      g.step = () => { step(); trace.push(g.sim.truck.chassis.getPosition().x); };
      const run = (hz) => {
        g.autoMul = 1;
        g.startRun(g.level, true);
        g.last = 0; g.acc = 0;
        trace = [];
        let t = 0;
        const stepMs = 1000 / hz;
        g.frame(0);
        for (let i = 0; trace.length < 361 && i < 5000; i++) { t += stepMs; g.frame(t); }
        return { x: trace[359], n: trace.length };
      };
      const a = run(60), b = run(144), c = run(30);
      g.step = step;
      g.autoMul = 0;
      return { a, b, c };
    });
    // compare after exactly 360 fixed steps (6 s); frame boundaries differ per refresh rate
    const same = res.a.x === res.b.x && res.a.x === res.c.x;
    ok('same physics at 30/60/144 Hz', same, `x60 ${res.a.x.toFixed(3)} x144 ${res.b.x.toFixed(3)} x30 ${res.c.x.toFixed(3)}`);
    await ctx.close();
  },
};

const server = await serve(dist, PORT);
const browser = await launch();
const t0 = Date.now();
try {
  for (const [name, fn] of Object.entries(tests)) {
    if (only && name !== only) continue;
    try { await fn(browser); } catch (e) { ok(name, false, String(e.message).split('\n')[0]); }
  }
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.pass).length;
console.log(`${results.length - failed}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
process.exit(failed ? 1 : 0);
