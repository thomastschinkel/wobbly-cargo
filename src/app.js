// Game shell: state machine, fixed-step loop, saving, SDK/ads, audio hookup.
import { Sim } from './game/sim.js';
import { Bot } from './game/bot.js';
import { LEVELS } from './game/levels.js';
import { WORLDS, DT } from './game/constants.js';
import { dailyLevel, todayKey } from './game/daily.js';
import { SKINS, HATS, skinById, hatById } from './game/cosmetics.js';
import { CARGO } from './game/cargoTypes.js';
import { TRUCK } from './game/vehicle.js';
import { Renderer } from './render/renderer.js';
import { audio } from './audio/audio.js';
import { Input } from './input.js';
import { SaveStore } from './save.js';
import { sdk } from './sdk.js';
import { UI } from './ui/ui.js';

const THEME_NAMES = {
  meadow: 'Sunny Meadows', meadowDusk: 'Meadows at Dusk', canyon: 'Dusty Canyon',
  canyonDusk: 'Canyon Sunset', snow: 'Frosty Peaks', snowNight: 'Frosty Night',
  volcano: 'Volcano Valley', volcanoDusk: 'Volcano Night', moon: 'Moon Base', moonDeep: 'Deep Space',
};
const THEME_SONG = {
  meadow: 'meadow', meadowDusk: 'meadow', canyon: 'canyon', canyonDusk: 'canyon', snow: 'snow', snowNight: 'snow',
  volcano: 'volcano', volcanoDusk: 'volcano', moon: 'moon', moonDeep: 'moon',
};
const BREAK_SND = { egg: ['crack', 'splat'], tv: ['shatter'], melon: ['splat'], cake: ['splat'], tnt: ['crack'], vase: ['shatter'], crystal: ['shatter'] };
const DEMO_LEVELS = [3, 7, 11, 14, 21, 5, 16, 25, 8, 26, 32, 36, 42, 45];
const MIDGAME_MIN_RUNS = 3;
const GARAGE_REWARD = 50;
const GARAGE_REWARD_COOLDOWN = 180;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function yesterdayOf(key) {
  const d = new Date(key + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dateLabel(key) {
  const d = new Date(key + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input();
    this.store = new SaveStore(sdk);
    this.ui = new UI(document.getElementById('ui'), this);
    this.mode = 'boot';
    this.sim = null;
    this.level = null;
    this.demo = false;
    this.bot = null;
    this.acc = 0;
    this.last = 0;
    this.endT = 0;
    this.inAd = false;
    this.adBusy = false;
    this.muted = false;
    this.engineOn = false;
    this.touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    this.demoIdx = Math.floor(Math.random() * DEMO_LEVELS.length);
    this.garageRewardAt = -1e9;
    this.frame = this.frame.bind(this);
  }

  get S() { return this.store.data; }

  // ---------- boot ----------
  async boot(progress = () => {}) {
    sdk.onAdStart = () => {
      this.inAd = true;
      audio.setAdMuted(true);
      this.input.enabled = false;
      this.input.clear();
    };
    sdk.onAdEnd = () => {
      this.inAd = false;
      audio.setAdMuted(false);
      this.input.enabled = true;
      this.last = 0;
    };
    sdk.onMuteChange = (m) => audio.setSdkMuted(m);
    progress(0.15);
    await sdk.init();
    sdk.loadingStart();
    audio.setSdkMuted(sdk.muted);
    progress(0.45);
    this.store.load();
    this.store.save();
    this.applySettings();
    this.input.onAction = (a) => this.onAction(a);
    this.bindGlobal();
    this.resize();
    progress(0.7);
    try {
      if (document.fonts && document.fonts.load) await Promise.race([document.fonts.load('20px "Lilita One"'), wait(2500)]);
    } catch (e) { /* font is optional */ }
    progress(1);
    sdk.loadingStop();
    // First visit: straight into the first delivery, the level itself teaches the controls
    const fresh = !Object.keys(this.S.levels).length && this.S.runs === 0;
    if (fresh) this.playLevel(1);
    else this.openTitle();
    requestAnimationFrame(this.frame);
  }

  bindGlobal() {
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      const hidden = document.hidden;
      audio.setHidden(hidden);
      if (hidden && this.mode === 'play') this.pause();
      this.last = 0;
    });
    window.addEventListener('blur', () => { if (this.mode === 'play' && !this.inAd && document.hidden) this.pause(); });
    // browsers only allow audio after a user gesture (touchend included for iOS)
    const unlock = () => { audio.unlock(); this.ensureMusic(); };
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) window.addEventListener(ev, unlock, { capture: true, passive: true });
    // inside the CrazyGames iframe the keyboard only works once the frame has focus
    try { window.focus(); } catch (e) { /* ignore */ }
    window.addEventListener('pointerdown', () => { try { window.focus(); } catch (e) { /* ignore */ } }, { passive: true });
  }

  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const maxPx = 3.4e6;
    if (w * h * dpr * dpr > maxPx) dpr = Math.max(1, Math.sqrt(maxPx / (w * h)));
    this.renderer.resize(w, h, dpr);
    const s = w >= h ? Math.min(w / 1100, h / 620) : Math.min(w / 620, h / 1000);
    document.documentElement.style.setProperty('--s', s.toFixed(3));
    if (this.touch && h > w * 1.1 && this.mode === 'play' && !this.rotHinted) {
      this.rotHinted = true;
      this.ui.rotateHint();
    }
  }

  applySettings() {
    const st = this.S.settings;
    audio.setVolumes(this.muted ? 0 : st.sfx, this.muted ? 0 : st.music);
    this.renderer.shakeOn = !!st.shake;
  }

  ensureMusic() {
    if (!audio.ctx || this.mode === 'boot') return;
    audio.startMusic(this.song ?? 'title');
  }

  setSong(n) {
    this.song = n;
    if (audio.ctx) audio.startMusic(n);
  }

  sfx(name, s = 1, extra) { audio.play(name, s, extra); }

  adsAvailable() { return sdk.canRewarded(); }

  persist() { this.store.save(); }

  // ---------- main loop ----------
  frame(now) {
    requestAnimationFrame(this.frame);
    let dt = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    if (dt < 0) dt = 0;
    if (!this.sim) return;
    this.input.pollPad();
    const running = !this.inAd && (this.mode === 'play' || this.mode === 'title' || this.mode === 'end' || this.mode === 'result' || this.mode === 'fail');
    if (running) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 10) {
        this.step();
        this.acc -= DT;
        n++;
        if (!this.sim) return;
      }
      if (n >= 10) this.acc = 0;
    }
    const alpha = running ? Math.min(1, this.acc / DT) : 1;
    this.renderer.update(running ? dt : 0, alpha);
    this.renderer.render(alpha);
    if (this.mode === 'play' || this.mode === 'end') this.ui.updateHud(this.sim, this.level);
    this.updateEngine();
  }

  step() {
    const sim = this.sim;
    let inp;
    if (this.demo) inp = this.bot.input();
    else if (this.mode === 'play' && this.autoMul) inp = this.bot.input(); // automated tests only
    else if (this.mode === 'play') inp = this.input.state();
    else inp = { gas: 0, brake: 0 };
    sim.step(inp);
    if (sim.events.length) {
      for (const ev of sim.events) this.onEvent(ev);
      sim.events.length = 0;
    }
    if (this.demo) {
      if (sim.state !== 'play' || sim.time > 70) {
        this.demoEnd += DT;
        if (this.demoEnd > 1.6) this.startDemo();
      }
    } else if (this.mode === 'end') {
      this.endT -= DT;
      if (this.endT <= 0) this.showEnd();
    }
  }

  onEvent(ev) {
    this.renderer.handleEvent(ev);
    if (this.demo) return;
    const A = audio;
    switch (ev.type) {
      case 'clunk': A.impact(ev.sound, ev.s); break;
      case 'land': A.play('land', ev.s); break;
      case 'scrape': A.play('scrape', ev.s); break;
      case 'bonk': A.play('bonk', ev.s); break;
      case 'lost':
        if (ev.reason !== 'broken') A.play('lost');
        if (ev.reason === 'fell' && this.renderer.theme.lava) A.play('sizzle');
        this.ui.cargoHit(ev.id);
        break;
      case 'break': for (const n of BREAK_SND[ev.cargo] || ['break']) A.play(n); break;
      case 'explode': A.play('boom'); break;
      case 'coin': A.play('coin', 1, ev.n); break;
      case 'boost': A.play('boost'); break;
      case 'bounce': A.play('bounce'); break;
      case 'rumble': A.play('rumble'); break;
      case 'rockwarn': A.play('rockwarn'); break;
      case 'crumble': A.play('crumble', 0.6); break;
      case 'geyser': A.play('geyser'); break;
      case 'meteor': A.play('meteor'); break;
      case 'piston': A.play('piston'); break;
      case 'warp': A.play('warp'); break;
      case 'start':
        this.ui.ctrlHint(false);
        break;
      case 'stuckhint': this.ui.pulseRetry(true); break;
      case 'finish':
        if (this.mode === 'play') {
          this.mode = 'end';
          this.endT = 1.4;
          this.input.clear();
          sdk.gameplayStop();
          A.play('win');
        }
        break;
      case 'fail':
        if (this.mode === 'play') {
          this.mode = 'end';
          this.endT = 1.0;
          sdk.gameplayStop();
          A.play('fail');
          if (ev.reason === 'fell' && this.renderer.theme.lava) A.play('sizzle');
        }
        break;
      default: break;
    }
  }

  updateEngine() {
    const on = this.mode === 'play' && this.sim && !this.demo && !this.inAd;
    if (on) {
      if (!this.engineOn && audio.ctx) { audio.startEngine(); this.engineOn = true; }
      if (this.engineOn) {
        const w = Math.abs(this.sim.truck.rear.getAngularVelocity()) / TRUCK.maxWheelSpeed;
        audio.updateEngine(Math.min(1, w), this.sim.input.gas || 0, true);
      }
    } else if (this.engineOn) {
      audio.stopEngine();
      this.engineOn = false;
    }
  }

  // ---------- input ----------
  onAction(a) {
    if (this.inAd) return;
    if (a === 'unlock') { audio.unlock(); this.ensureMusic(); return; }
    if (a === 'mute') {
      this.muted = !this.muted;
      this.applySettings();
      this.ui.toast(this.muted ? 'Sound off (M)' : 'Sound on (M)', '', 1200);
      return;
    }
    if (a === 'horn') {
      if (this.mode === 'play' && this.sim) {
        audio.play('quack');
        const p = this.sim.truck.chassis.getPosition();
        this.renderer.float(p.x + 0.9, p.y + 1.7, 'QUACK!', { color: '#ffd23f', size: 22, life: 0.7, vy: 1.5 });
      }
      return;
    }
    if (a === 'drive') {
      if (this.mode === 'play' && this.ctrlHintOn) {
        this.ctrlHintOn = false;
        this.ui.ctrlHint(false);
        this.S.seenTips.controls = 1;
      }
      return;
    }
    if (this.adBusy) return;
    if (this.mode === 'play') {
      if (a === 'restart') this.restart();
      else if (a === 'pause') this.pause();
      return;
    }
    if (this.mode === 'end') {
      if (a === 'restart') this.restart();
      return;
    }
    if (this.mode === 'paused' && a === 'restart') { this.restart(); return; }
    this.ui.key(a);
  }

  // ---------- levels ----------
  totalStars() {
    let n = 0;
    for (const k of Object.keys(this.S.levels)) {
      const r = this.S.levels[k];
      if (r && Array.isArray(r.stars)) n += r.stars.filter(Boolean).length;
    }
    return n;
  }

  worldStars(i) {
    const w = WORLDS[i];
    let n = 0;
    for (let id = w.first; id < w.first + 10; id++) {
      const r = this.S.levels[id];
      if (r && Array.isArray(r.stars)) n += r.stars.filter(Boolean).length;
    }
    return n;
  }

  nextLevelId() {
    const S = this.S;
    for (let id = 1; id <= Math.min(S.unlocked, LEVELS.length); id++) {
      const r = S.levels[id];
      if (!r || !r.stars || !r.stars[0]) return id;
    }
    return Math.min(S.unlocked, LEVELS.length);
  }

  playLevel(id) {
    if (this.adBusy) return;
    id = Math.max(1, Math.min(LEVELS.length, id | 0));
    if (id > this.S.unlocked) return;
    this.sfx('click');
    this.startRun(LEVELS[id - 1], false);
  }

  playDaily() {
    if (this.adBusy) return;
    const key = todayKey();
    const lvl = { ...dailyLevel(key), dateLabel: dateLabel(key) };
    this.sfx('click');
    this.startRun(lvl, false);
  }

  startRun(level, retry) {
    const S = this.S;
    this.ui.clear();
    this.demo = false;
    this.level = level;
    this.sim = new Sim(level);
    this.bot = this.autoMul ? new Bot(this.sim, this.autoMul) : null;
    this.renderer.inputHint = this.touch || this.input.lastDevice === 'touch' ? 'touch' : 'keys';
    this.renderer.menuFrame = false;
    this.renderer.setScene(this.sim, level.theme, skinById(S.skin), hatById(S.hat));
    this.renderer.snapCamera();
    this.acc = 0;
    this.mode = 'play';
    this.input.clear();
    this.ui.buildHud(level, this.sim, { touch: this.touch || this.input.lastDevice === 'touch' });
    if (!retry) this.ui.intro(level);
    this.ctrlHintOn = !S.seenTips.controls && (level.id === 1 || level.id === 'daily');
    if (this.ctrlHintOn) this.ui.ctrlHint(true, this.touch);
    if (!retry) {
      const fresh = [...new Set(level.cargo)].find((t) => !S.seenTips['c_' + t]);
      if (fresh && !(level.id === 1 && fresh === 'crate')) {
        setTimeout(() => { if (this.sim && this.level === level && this.mode === 'play') this.ui.cargoTip(fresh); }, 900);
      }
      for (const t of level.cargo) S.seenTips['c_' + t] = 1;
      this.persist();
    }
    this.setSong(THEME_SONG[level.theme] ?? 'meadow');
    if (this.touch && window.innerHeight > window.innerWidth * 1.1 && !this.rotHinted) {
      this.rotHinted = true;
      this.ui.rotateHint();
    }
    sdk.gameplayStart();
  }

  restart() {
    if (!this.level || this.adBusy) return;
    if (this.mode === 'title') return;
    this.startRun(this.level, true);
  }

  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.input.clear();
    sdk.gameplayStop();
    this.openPause();
  }

  openPause() {
    this.mode = 'paused';
    const l = this.level;
    this.ui.showPause({
      title: l.daily ? 'Daily Delivery' : `Level ${l.id}: ${l.name}`,
      sub: `Deliver ${l.required} of ${l.cargo.length}` + (l.par ? ` · par ${Math.round(l.par)}s` : ''),
      touch: this.touch,
    });
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.ui.clear();
    this.mode = 'play';
    this.last = 0;
    this.input.clear();
    this.sfx('click');
    sdk.gameplayStart();
  }

  showEnd() {
    if (this.sim.state === 'finished') this.onFinish();
    else this.onFail();
  }

  grantAchievements() {
    const S = this.S;
    const stars = this.totalStars();
    const got = [];
    for (const it of SKINS) {
      if (S.skins.includes(it.id)) continue;
      if ((it.stars && stars >= it.stars) || (it.dailies && S.daily.count >= it.dailies)) { S.skins.push(it.id); got.push(it.name); }
    }
    for (const it of HATS) {
      if (S.hats.includes(it.id)) continue;
      if (it.stars && stars >= it.stars) { S.hats.push(it.id); got.push(it.name); }
    }
    return got;
  }

  onFinish() {
    const S = this.S, sim = this.sim, lvl = this.level;
    this.mode = 'result';
    S.runs++;
    const stars = sim.stars().map(Boolean);
    const time = sim.finishTime;
    const delivered = sim.delivered, total = sim.cargo.length;
    let coins = sim.coinsTaken + delivered * 2;
    const r = {
      delivered, total, time, stars, daily: !!lvl.daily, touch: this.touch,
      perfect: stars.every(Boolean), par: lvl.par, hasNext: false, newBest: false,
    };
    if (lvl.daily) {
      const key = lvl.daily;
      const d = S.daily;
      const score = Math.max(0, Math.round(delivered * 250 + sim.coinsTaken * 15 + Math.max(0, 600 - time * 6)));
      const first = d.last !== key;
      if (first) {
        d.streak = d.last === yesterdayOf(key) ? d.streak + 1 : 1;
        d.last = key;
        d.count++;
        coins += 30 + Math.min(50, d.streak * 5);
      }
      const prevBest = d.bestDate === key ? d.best : 0;
      r.newBest = score > prevBest;
      if (r.newBest) { d.best = score; d.bestDate = key; if (!first) sdk.happytime(); }
      r.score = score;
      r.best = Math.max(score, prevBest);
      r.subtitle = first ? `Streak: ${d.streak} day${d.streak > 1 ? 's' : ''}! Come back tomorrow for a new route.` : 'Same route all day. Can you beat your score?';
    } else {
      const rec = S.levels[lvl.id] && Array.isArray(S.levels[lvl.id].stars) ? S.levels[lvl.id] : { stars: [0, 0, 0], best: 0 };
      const firstClear = !rec.stars[0];
      const newStars = stars.filter((s, i) => s && !rec.stars[i]).length;
      coins += newStars * 10;
      rec.stars = rec.stars.map((s, i) => (s || stars[i] ? 1 : 0));
      r.bestTime = rec.best;
      r.newBest = !!rec.best && time < rec.best;
      if (!rec.best || time < rec.best) rec.best = Math.round(time * 100) / 100;
      S.levels[lvl.id] = rec;
      S.fails[lvl.id] = 0;
      if (lvl.id < LEVELS.length) S.unlocked = Math.max(S.unlocked, lvl.id + 1);
      r.hasNext = lvl.id < LEVELS.length;
      r.subtitle = `Level ${lvl.id}: ${lvl.name}`;
      if (firstClear && lvl.id % 10 === 0) {
        sdk.happytime();
        const nw = WORLDS[lvl.id / 10];
        r.unlockMsg = nw ? `${nw.name} unlocked!` : 'All deliveries complete! You are a legend!';
      }
    }
    S.coins += coins;
    S.coinsEarned += coins;
    r.coins = coins;
    this.lastReward = coins;
    this.doubled = false;
    const got = this.grantAchievements();
    this.persist();
    r.canDouble = coins > 0 && sdk.canRewarded();
    this.ui.showResult(r);
    got.forEach((name, i) => setTimeout(() => { this.ui.toast(`Unlocked: <b>${name}</b>! Check the Garage`, 'gold', 3000); this.sfx('unlock'); }, 1400 + i * 600));
  }

  onFail() {
    const S = this.S, lvl = this.level, sim = this.sim;
    this.mode = 'fail';
    S.runs++;
    let skip = null;
    if (!lvl.daily) {
      S.fails[lvl.id] = (S.fails[lvl.id] || 0) + 1;
      const n = S.fails[lvl.id];
      if (lvl.id === S.unlocked && lvl.id < LEVELS.length) {
        if (n >= 3 && sdk.canRewarded()) skip = 'ad';
        else if (n >= 6) skip = 'free';
      }
    }
    this.persist();
    const reason = sim.failReason || 'cargo';
    const fragile = lvl.cargo.some((t) => CARGO[t].fragile);
    let tip = null;
    if (reason === 'cargo' && fragile && sim.cargo.some((c) => c.broken)) tip = 'Fragile cargo smashes on hard landings. Brake before jumps and drops!';
    else if (reason === 'cargo') tip = 'Ease off the gas before bumps and slopes. Cargo hates surprises.';
    else if (reason === 'flip') tip = 'In the air, brake tilts the nose down and gas tilts it up.';
    else if (reason === 'fell') tip = 'Build up speed before gaps, and stop fully on moving platforms.';
    else if (reason === 'stuck') tip = 'Back up with the brake and take another run at it.';
    else if (reason === 'squashed') tip = 'Keep your speed up when the boulder rolls. Only brake where you must.';
    this.ui.showFail({ reason, tip, skip, touch: this.touch });
  }

  async skipLevel(withAd) {
    const lvl = this.level;
    if (!lvl || lvl.daily || this.adBusy) return false;
    if (withAd) {
      this.adBusy = true;
      const r = await sdk.requestAd('rewarded');
      this.adBusy = false;
      if (!r.ok) { this.ui.toast('No video available right now. Try again later!', '', 2200); return false; }
    }
    const S = this.S;
    S.unlocked = Math.max(S.unlocked, lvl.id + 1);
    S.fails[lvl.id] = 0;
    this.persist();
    this.ui.toast('Level skipped. You can come back any time!', '', 2200);
    this.startRun(LEVELS[lvl.id], false);
    return true;
  }

  async doubleCoins() {
    if (this.doubled || this.adBusy) return false;
    this.adBusy = true;
    const r = await sdk.requestAd('rewarded');
    this.adBusy = false;
    if (!r.ok) { this.ui.toast('No video available right now. Try again later!', '', 2200); return false; }
    this.doubled = true;
    this.S.coins += this.lastReward;
    this.S.coinsEarned += this.lastReward;
    this.persist();
    this.sfx('coin', 1, 8);
    this.ui.toast(`+${this.lastReward} bonus coins!`, 'gold', 1800);
    return true;
  }

  // midgame ads only ever run between runs, never during one
  async maybeMidgame(then) {
    if (this.adBusy) return;
    if (this.S.runs >= MIDGAME_MIN_RUNS && sdk.midgameDue()) {
      this.adBusy = true;
      this.input.clear();
      await sdk.requestAd('midgame');
      this.adBusy = false;
    }
    then();
  }

  next() {
    if (!this.level || this.level.daily) { this.toMenu(); return; }
    const id = this.level.id + 1;
    if (id > LEVELS.length) { this.toMenu(); return; }
    this.sfx('click');
    this.maybeMidgame(() => this.startRun(LEVELS[id - 1], false));
  }

  retryFromResult() {
    this.sfx('click');
    this.maybeMidgame(() => this.restart());
  }

  toMenu() {
    if (this.adBusy) return;
    this.sfx('back');
    sdk.gameplayStop();
    if (this.mode === 'result' || this.mode === 'fail') this.maybeMidgame(() => this.openTitle());
    else this.openTitle();
  }

  // ---------- menus ----------
  startDemo() {
    const id = DEMO_LEVELS[this.demoIdx++ % DEMO_LEVELS.length];
    const lvl = LEVELS[id - 1];
    this.level = null;
    this.sim = new Sim(lvl);
    this.bot = new Bot(this.sim, 0.92);
    this.demo = true;
    this.demoEnd = 0;
    this.renderer.inputHint = this.touch ? 'touch' : 'keys';
    this.renderer.menuFrame = true;
    this.renderer.setScene(this.sim, lvl.theme, skinById(this.S.skin), hatById(this.S.hat));
    this.renderer.snapCamera();
    this.acc = 0;
  }

  openTitle() {
    sdk.gameplayStop();
    this.ui.removeHud();
    if (!this.demo) this.startDemo();
    this.mode = 'title';
    this.setSong('title');
    const S = this.S;
    const allDone = LEVELS.every((l) => S.levels[l.id] && S.levels[l.id].stars && S.levels[l.id].stars[0]);
    this.ui.showTitle({
      next: this.nextLevelId(), allDone, coins: S.coins, stars: this.totalStars(),
      dailyNew: S.daily.last !== todayKey(), touch: this.touch,
    });
  }

  openLevels(worldIdx) {
    this.sfx('click');
    const S = this.S;
    if (worldIdx == null) worldIdx = Math.max(0, Math.min(WORLDS.length - 1, Math.floor((this.nextLevelId() - 1) / 10)));
    this.ui.showLevels(worldIdx, {
      unlocked: S.unlocked, levels: S.levels, worldStars: WORLDS.map((w, i) => this.worldStars(i)),
    });
  }

  garageData() {
    const S = this.S;
    if (this.grantAchievements().length) this.persist();
    return {
      coins: S.coins, skins: S.skins, hats: S.hats, skin: S.skin, hat: S.hat,
      canReward: sdk.canRewarded() && performance.now() / 1000 - this.garageRewardAt > GARAGE_REWARD_COOLDOWN,
      rewardAmount: GARAGE_REWARD,
    };
  }

  openGarage() {
    this.sfx('click');
    this.ui.showGarage(this.garageData());
  }

  itemStatus(kind, it) {
    const S = this.S;
    if (it.cost != null) return { can: S.coins >= it.cost, why: `You need ${it.cost - S.coins} more coins` };
    if (it.stars) { const n = this.totalStars(); return { can: n >= it.stars, why: `Collect ${it.stars} stars to unlock (${n}/${it.stars})` }; }
    if (it.dailies) return { can: S.daily.count >= it.dailies, why: `Complete ${it.dailies} Daily Deliveries (${S.daily.count}/${it.dailies})` };
    return { can: false, why: 'Locked' };
  }

  buy(kind, id) {
    const S = this.S;
    const list = kind === 'skins' ? SKINS : HATS;
    const owned = kind === 'skins' ? S.skins : S.hats;
    const it = list.find((x) => x.id === id);
    if (!it || owned.includes(id) || it.cost == null || S.coins < it.cost) { this.sfx('deny'); return; }
    S.coins -= it.cost;
    owned.push(id);
    if (kind === 'skins') S.skin = id; else S.hat = id;
    this.persist();
    this.sfx('unlock');
    this.ui.toast(`<b>${it.name}</b> is yours!`, 'gold', 1800);
    this.ui.showGarage(this.garageData());
    if (this.demo && this.sim) this.renderer.setScene(this.sim, this.sim.level.theme, skinById(S.skin), hatById(S.hat));
  }

  equip(kind, id) {
    const S = this.S;
    if (kind === 'skins') S.skin = id; else S.hat = id;
    this.persist();
    this.sfx(kind === 'hats' ? 'quack' : 'click');
    this.ui.showGarage(this.garageData());
    if (this.demo && this.sim) { this.renderer.skin = skinById(S.skin); this.renderer.hat = hatById(S.hat); }
  }

  async rewardCoins() {
    if (this.adBusy) return;
    this.adBusy = true;
    const r = await sdk.requestAd('rewarded');
    this.adBusy = false;
    if (!r.ok) { this.ui.toast('No video available right now. Try again later!', '', 2200); return; }
    this.garageRewardAt = performance.now() / 1000;
    this.S.coins += GARAGE_REWARD;
    this.S.coinsEarned += GARAGE_REWARD;
    this.persist();
    this.sfx('coin', 1, 8);
    this.ui.toast(`+${GARAGE_REWARD} coins!`, 'gold', 1600);
    this.ui.showGarage(this.garageData());
  }

  openDaily() {
    this.sfx('click');
    const key = todayKey();
    const lvl = dailyLevel(key);
    const d = this.S.daily;
    const alive = d.last === key || d.last === yesterdayOf(key);
    this.ui.showDaily({
      dateLabel: dateLabel(key), themeName: THEME_NAMES[lvl.theme] || 'Mystery Route', cargo: lvl.cargo, required: lvl.required,
      streak: alive ? d.streak : 0, best: d.bestDate === key ? d.best : 0, count: d.count, played: d.last === key,
      reward: 30 + Math.min(50, ((d.last === yesterdayOf(key) ? d.streak : 0) + 1) * 5),
    });
  }

  openSettings(from) {
    this.sfx('click');
    if (from === 'pause') this.mode = 'paused';
    this.ui.showSettings(this.S.settings, from);
  }

  setSetting(k, v) {
    this.S.settings[k] = v;
    this.applySettings();
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => this.persist(), 300);
  }

  resetProgress() {
    const keep = { ...this.S.settings };
    this.store.reset();
    this.store.data.settings = keep;
    this.store.data.visits = 1;
    this.persist();
    this.applySettings();
    this.sfx('back');
    this.openTitle();
    this.ui.toast('Progress reset', '', 1500);
  }
}
