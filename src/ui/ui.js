// DOM user interface: menus, HUD, result screens, toasts. Pure view layer; the app
// passes data in and receives user intent through the `app` callbacks.
import { ICON } from './icons.js';
import { LEVELS } from '../game/levels.js';
import { WORLDS } from '../game/constants.js';
import { CARGO } from '../game/cargoTypes.js';
import { SKINS, HATS, skinById, hatById } from '../game/cosmetics.js';
import { drawCargoIcon, drawCargo } from '../render/draw-cargo.js';
import { drawTruckBack, drawTruckFront, drawWheel, drawDuck } from '../render/draw-truck.js';
import { TRUCK } from '../game/vehicle.js';

const CARGO_TIPS = {
  crate: 'Sturdy and heavy. The perfect first delivery.',
  box: 'Light as a feather, so it bounces around a lot.',
  barrel: 'Round, so it LOVES to roll off. Stay level!',
  melon: 'Fragile! A hard landing makes a juicy mess.',
  egg: 'Super fragile! Treat every bump like a cliff.',
  tv: 'Fragile screen. No big jumps, please.',
  ball: 'So light the wind can blow it away!',
  gold: 'Heavy and slippery. It slides on slopes.',
  penguin: 'Slippery little guys. They slide around the bed.',
  cake: 'Fragile and delicious. Smooth driving only!',
  piano: 'Huge and heavy. Your truck will feel it.',
  tnt: 'Explodes on hard hits. Handle with care!',
};

const FAIL_TEXT = {
  cargo: ['Too much cargo lost!', 'The customer wanted that!'],
  fell: ['Down the hole!', 'That was a long way down.'],
  flip: ['Upside down!', 'Wheels go on the bottom.'],
  stuck: ['Stuck!', 'Your truck needs a push.'],
  squashed: ['Flattened!', 'The boulder was faster.'],
};

const TIPS = [
  'Ease off the gas before bumps. Cargo hates surprises.',
  'Tap the brake gently instead of slamming it.',
  'In the air: gas tilts back, brake tilts forward.',
  'Slow and steady keeps the cargo on board.',
  'Stop completely on lifts and ferries. They start by themselves.',
  'Coins buy new paint jobs and hats in the Garage.',
  'Round cargo rolls. Keep the truck level!',
  'Press R (or tap the retry button) for an instant restart.',
];

export function fmtTime(t) {
  if (!isFinite(t) || t <= 0) return '0:00.0';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function btn(label, cls, onClick, icon) {
  const b = el('button', 'btn ' + (cls || ''));
  b.type = 'button';
  b.innerHTML = (icon || '') + (label ? `<span>${label}</span>` : '');
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.closest('.screen')) b.blur(); // HUD buttons must not keep keyboard focus while driving
    onClick && onClick(e);
  });
  return b;
}

const iconCache = new Map();
export function cargoIconURL(type) {
  if (iconCache.has(type)) return iconCache.get(type);
  const c = document.createElement('canvas');
  c.width = c.height = 72;
  const ctx = c.getContext('2d');
  drawCargoIcon(ctx, type, CARGO[type], 72);
  const url = c.toDataURL();
  iconCache.set(type, url);
  return url;
}

function cargoImg(type) {
  const i = new Image();
  i.src = cargoIconURL(type);
  i.alt = CARGO[type].name;
  i.draggable = false;
  return i;
}

// Truck preview used by the garage (y-up world units drawn into a 2D canvas)
export function drawTruckPreview(canvas, skin, hat, t = 0, withCrate = true) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const s = Math.min(w / 4.6, h / 3.2);
  const bob = Math.sin(t * 3) * 0.02;
  ctx.save();
  ctx.translate(w / 2 + s * 0.05, h * 0.66);
  ctx.scale(s, -s);
  // soft ground shadow
  ctx.fillStyle = 'rgba(42,31,61,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, -1.1, 2.2, 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(0, bob);
  drawTruckBack(ctx, skin, hat, { time: t, bobX: 0, bobY: Math.sin(t * 5) * 0.015 });
  if (withCrate) {
    ctx.save();
    ctx.translate(-0.85, 0.31);
    drawCargo(ctx, 'crate', CARGO.crate, { pupils: [{ x: 0.2, y: -0.2 }, { x: 0.2, y: -0.2 }], mood: 'happy', blink: (t % 3.1) < 0.12 }, t);
    ctx.restore();
  }
  drawTruckFront(ctx, skin, { time: t });
  ctx.restore();
  drawWheel(ctx, TRUCK.rear.x, TRUCK.rear.y, -t * 0.6, skin);
  drawWheel(ctx, TRUCK.front.x, TRUCK.front.y, -t * 0.6, skin);
  ctx.restore();
}

function drawSkinSwatch(canvas, skin) {
  drawTruckPreview(canvas, skin, null, 0, false);
}

function drawHatSwatch(canvas, hat) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const s = h / 0.95;
  ctx.save();
  ctx.translate(w / 2 - s * 0.05, h * 0.6);
  ctx.scale(s, -s);
  drawDuck(ctx, 0, 0, 0.2, hat.id === 'none' ? null : hat, 0);
  ctx.restore();
}

export class UI {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.screen = null;
    this.hud = null;
    this.toasts = el('div', 'passthru');
    this.toasts.id = 'toasts';
    root.appendChild(this.toasts);
    this.garageTab = 'skins';
    this.previewRAF = 0;
  }

  // ---------- screens ----------
  clear() {
    cancelAnimationFrame(this.previewRAF);
    this.previewRAF = 0;
    if (this.screen) this.screen.remove();
    this.screen = null;
    this.onKey = null;
  }

  mount(node, onKey = null) {
    this.clear();
    this.toasts.querySelectorAll('.tipcard').forEach((t) => t.remove());
    this.screen = node;
    this.onKey = onKey;
    this.root.insertBefore(node, this.toasts);
    const first = node.querySelector('.btn.primary');
    if (first && this.app.input.lastDevice !== 'touch') setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 50);
    return node;
  }

  coinsPill(n) {
    return `<div class="wood"><span class="coin-i"></span><span class="cv">${n}</span></div>`;
  }

  // ---- title ----
  showTitle(info) {
    const s = el('div', 'screen passthru');
    s.id = 'title';
    const letters = (w) => [...w].map((ch, i) => `<span class="l" style="animation-delay:${-i * 0.18}s">${ch}</span>`).join('');
    const logo = el('div', 'logo nopoint', `<span class="w">${letters('WOBBLY')}</span><span class="c">${letters('CARGO')}</span><span class="sub">Deliver it. Don't drop it!</span>`);
    s.appendChild(logo);
    const menu = el('div', 'menu-btns');
    const play = btn(info.allDone ? 'PLAY' : `PLAY <small style="opacity:.85;font-size:.6em">LV ${info.next}</small>`, 'big primary', () => this.app.playLevel(info.next), ICON.play);
    menu.appendChild(play);
    const row = el('div', 'row');
    row.appendChild(btn('Levels', 'blue sq', () => this.app.openLevels(), ICON.map));
    row.appendChild(btn('Garage', 'pink sq', () => this.app.openGarage(), ICON.truck));
    const daily = btn('Daily', 'orange sq', () => this.app.openDaily(), ICON.calendar);
    if (info.dailyNew) daily.appendChild(el('span', 'badge', 'NEW'));
    row.appendChild(daily);
    menu.appendChild(row);
    s.appendChild(menu);
    const top = el('div', 'topbar');
    const tl = el('div', 'grp', `<div class="wood">${ICON.star(true).replace('<svg', '<svg class="star-i"')}<span>${info.stars}/${LEVELS.length * 3}</span></div>`);
    const tr = el('div', 'grp', this.coinsPill(info.coins));
    tr.appendChild(btn('', 'icon purple', () => this.app.openSettings('title'), ICON.gear));
    top.append(tl, tr);
    s.appendChild(top);
    s.appendChild(el('div', 'title-foot nopoint', info.touch ? 'Hold the pedals to drive' : 'Arrow keys / WASD to drive'));
    const onKey = (a) => { if (a === 'confirm') this.app.playLevel(info.next); };
    return this.mount(s, onKey);
  }

  // ---- level select ----
  showLevels(worldIdx, data) {
    const s = el('div', 'screen dim-bg');
    const p = el('div', 'panel levels-panel');
    p.appendChild(el('div', 'ribbon blue', 'Choose a Level'));
    const tabs = el('div', 'tabs');
    WORLDS.forEach((w, i) => {
      const locked = data.unlocked < w.first;
      const stars = data.worldStars[i];
      const t = el('button', 'tab' + (i === worldIdx ? ' on' : '') + (locked ? ' locked' : ''), `<span>${locked ? ICON.lock : ''}${w.name}</span><small>${stars}/30★</small>`);
      t.type = 'button';
      t.querySelector('svg') && (t.querySelector('svg').style.cssText = 'width:1em;height:1em');
      t.addEventListener('click', () => { this.app.sfx('click'); this.showLevels(i, data); });
      tabs.appendChild(t);
    });
    p.appendChild(tabs);
    p.style.paddingTop = '2em';
    const w = WORLDS[worldIdx];
    const grid = el('div', 'lv-grid');
    for (let id = w.first; id < w.first + 10; id++) {
      const lvl = LEVELS[id - 1];
      const rec = data.levels[id];
      const locked = id > data.unlocked;
      const cls = locked ? 'locked' : rec && rec.stars && rec.stars.some(Boolean) ? 'done' : id === data.unlocked ? 'cur' : '';
      const b = el('button', 'lv ' + cls);
      b.type = 'button';
      b.title = lvl.name;
      if (locked) b.innerHTML = ICON.lock.replace('<svg', '<svg class="lock"');
      else {
        const st = (rec && rec.stars) || [0, 0, 0];
        b.innerHTML = `<span class="n">${id}</span><span class="st">${st.map((x) => ICON.star(!!x)).join('')}</span>`;
        b.addEventListener('click', () => this.app.playLevel(id));
      }
      if ((id - w.first) === 9) b.appendChild(el('span', 'boss', 'FINALE'));
      grid.appendChild(b);
    }
    p.appendChild(grid);
    const foot = el('div', 'btn-row');
    foot.style.marginTop = '1em';
    foot.appendChild(btn('Back', 'grey small', () => this.app.openTitle(), ICON.back));
    p.appendChild(foot);
    s.appendChild(p);
    s.addEventListener('click', (e) => { if (e.target === s) this.app.openTitle(); });
    const onKey = (a) => { if (a === 'confirm') this.app.playLevel(Math.min(data.unlocked, w.first + 9) >= w.first ? Math.min(data.unlocked, w.first + 9) : w.first); };
    return this.mount(s, onKey);
  }

  // ---- garage ----
  showGarage(data) {
    const s = el('div', 'screen dim-bg');
    const p = el('div', 'panel garage-panel');
    p.style.paddingTop = '2em';
    p.appendChild(el('div', 'ribbon purple', 'Garage'));
    const prev = el('div', 'garage-prev');
    const cv = document.createElement('canvas');
    cv.width = 460; cv.height = 300;
    const nm = el('div', 'nm');
    prev.append(cv, nm);
    const coinsRow = el('div', 'row');
    coinsRow.innerHTML = this.coinsPill(data.coins);
    prev.appendChild(coinsRow);
    if (data.canReward) {
      const rb = btn(`+${data.rewardAmount} <span class="ad">${ICON.video}</span>`, 'yellow small', () => this.app.rewardCoins(), '<span class="coin-i"></span>');
      prev.appendChild(rb);
    }
    const right = el('div', 'garage-list');
    const tabs = el('div', 'tabs');
    tabs.style.marginBottom = '0';
    for (const [k, label] of [['skins', 'Paint Jobs'], ['hats', 'Hats']]) {
      const t = el('button', 'tab' + (this.garageTab === k ? ' on' : ''), label);
      t.type = 'button';
      t.addEventListener('click', () => { this.garageTab = k; this.app.sfx('click'); this.showGarage(this.app.garageData()); });
      tabs.appendChild(t);
    }
    right.appendChild(tabs);
    const items = el('div', 'items scroll');
    const list = this.garageTab === 'skins' ? SKINS : HATS;
    const owned = this.garageTab === 'skins' ? data.skins : data.hats;
    const cur = this.garageTab === 'skins' ? data.skin : data.hat;
    let previewSkin = skinById(data.skin), previewHat = hatById(data.hat);
    const setPreview = (item) => {
      if (this.garageTab === 'skins') previewSkin = item; else previewHat = item;
      nm.textContent = item.name;
    };
    setPreview(this.garageTab === 'skins' ? previewSkin : previewHat);
    for (const it of list) {
      const has = owned.includes(it.id);
      const b = el('button', 'item' + (it.id === cur ? ' on' : '') + (has ? '' : ' locked'));
      b.type = 'button';
      const c = document.createElement('canvas');
      c.width = 136; c.height = 104;
      if (this.garageTab === 'skins') drawSkinSwatch(c, it); else drawHatSwatch(c, it);
      b.appendChild(c);
      let label;
      if (has) label = it.id === cur ? `<span class="ok">Equipped</span>` : 'Owned';
      else if (it.cost != null) label = `<span class="price"><span class="coin-i"></span>${it.cost}</span>`;
      else if (it.stars) label = `<span class="price">${ICON.star(true).replace('<svg', '<svg style="width:1em;height:1em"')}${it.stars}</span>`;
      else if (it.dailies) label = `<span class="price">${it.dailies} dailies</span>`;
      const status = this.app.itemStatus(this.garageTab, it);
      if (!has && !status.can) b.classList.add('cant');
      b.appendChild(el('span', '', label));
      b.addEventListener('click', () => {
        setPreview(it);
        if (has) { this.app.equip(this.garageTab, it.id); return; }
        if (b.dataset.armed) { this.app.buy(this.garageTab, it.id); return; }
        if (status.can && it.cost != null) {
          items.querySelectorAll('[data-armed]').forEach((x) => { delete x.dataset.armed; x.lastChild.innerHTML = x.dataset.label; });
          b.dataset.armed = '1';
          b.dataset.label = label;
          b.lastChild.innerHTML = '<span class="ok">Buy?</span>';
          this.app.sfx('click');
        } else {
          this.app.sfx('deny');
          this.toast(status.why, '', 1600);
        }
      });
      items.appendChild(b);
    }
    right.appendChild(items);
    const foot = el('div', 'btn-row');
    foot.appendChild(btn('Back', 'grey small', () => this.app.openTitle(), ICON.back));
    right.appendChild(foot);
    p.append(prev, right);
    s.appendChild(p);
    s.addEventListener('click', (e) => { if (e.target === s) this.app.openTitle(); });
    this.mount(s);
    const t0 = performance.now();
    const loop = () => {
      drawTruckPreview(cv, previewSkin, previewHat.id === 'none' ? null : previewHat, (performance.now() - t0) / 1000);
      this.previewRAF = requestAnimationFrame(loop);
    };
    loop();
    return s;
  }

  // ---- daily ----
  showDaily(d) {
    const s = el('div', 'screen dim-bg');
    const p = el('div', 'panel daily-panel');
    p.appendChild(el('div', 'ribbon', 'Daily Delivery'));
    const card = el('div', 'daily-card');
    card.appendChild(el('div', 'date', d.dateLabel));
    card.appendChild(el('div', 'dim', `${d.themeName} &middot; same route for everyone today`));
    const cg = el('div', 'cargo');
    d.cargo.forEach((t) => cg.appendChild(cargoImg(t)));
    card.appendChild(cg);
    card.appendChild(el('div', 'dim', `Deliver at least ${d.required} of ${d.cargo.length}`));
    p.appendChild(card);
    const stats = el('div', 'stats');
    stats.innerHTML = `<div class="stat"><b>${ICON.fire.replace('<svg', '<svg style="width:1.1em;height:1.1em"')}${d.streak}</b><small>day streak</small></div>
      <div class="stat ${d.best ? 'best' : ''}"><b>${d.best || '-'}</b><small>today's best</small></div>
      <div class="stat"><b>${d.count}</b><small>dailies done</small></div>`;
    p.appendChild(stats);
    p.appendChild(el('p', 'dim', d.played ? 'Beat your score! A new route arrives at midnight (UTC).' : `First delivery today: <b>+${d.reward}</b> coins`));
    const row = el('div', 'btn-row');
    row.appendChild(btn('Back', 'grey', () => this.app.openTitle(), ICON.back));
    row.appendChild(btn(d.played ? 'Play Again' : 'Play', 'big primary orange', () => this.app.playDaily(), ICON.play));
    p.appendChild(row);
    s.appendChild(p);
    s.addEventListener('click', (e) => { if (e.target === s) this.app.openTitle(); });
    const onKey = (a) => { if (a === 'confirm') this.app.playDaily(); };
    return this.mount(s, onKey);
  }

  // ---- settings (from title or pause) ----
  showSettings(st, from) {
    const s = el('div', 'screen dim-bg');
    const p = el('div', 'panel settings-panel');
    p.appendChild(el('div', 'ribbon purple', 'Settings'));
    const slider = (label, key) => {
      const r = el('div', 'set-row', `<span>${label}</span>`);
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = '0'; inp.max = '1'; inp.step = '0.05'; inp.value = String(st[key]);
      inp.addEventListener('input', () => this.app.setSetting(key, Number(inp.value)));
      inp.addEventListener('change', () => this.app.sfx('click'));
      r.appendChild(inp);
      return r;
    };
    p.appendChild(slider('Sound', 'sfx'));
    p.appendChild(slider('Music', 'music'));
    const tg = el('div', 'set-row', '<span>Screen shake</span>');
    const t = el('button', 'toggle' + (st.shake ? ' on' : ''));
    t.type = 'button';
    t.setAttribute('aria-label', 'Screen shake');
    t.addEventListener('click', () => { const v = !t.classList.contains('on'); t.classList.toggle('on', v); this.app.setSetting('shake', v); this.app.sfx('click'); });
    tg.appendChild(t);
    p.appendChild(tg);
    const row = el('div', 'btn-row');
    row.style.marginTop = '1em';
    if (from === 'title') {
      const reset = btn('Reset progress', 'red small', () => {
        if (!reset.dataset.armed) { reset.dataset.armed = '1'; reset.querySelector('span').textContent = 'Tap again to erase all'; this.app.sfx('deny'); return; }
        this.app.resetProgress();
      });
      row.appendChild(reset);
    }
    row.appendChild(btn('Done', 'primary', () => (from === 'pause' ? this.app.openPause() : this.app.openTitle()), ICON.check));
    p.appendChild(row);
    p.appendChild(el('div', 'credits', 'Wobbly Cargo &middot; physics by Planck.js<br>Keys: Arrows/WASD drive &middot; R retry &middot; P pause &middot; H honk &middot; M mute'));
    s.appendChild(p);
    const onKey = (a) => { if (a === 'confirm') (from === 'pause' ? this.app.openPause() : this.app.openTitle()); };
    return this.mount(s, onKey);
  }

  // ---- pause ----
  showPause(info) {
    const s = el('div', 'screen dim-bg');
    const p = el('div', 'panel result-panel');
    p.appendChild(el('div', 'ribbon blue', 'Paused'));
    p.appendChild(el('div', '', `<div style="font-size:1.3em">${info.title}</div><div class="dim">${info.sub}</div>`));
    const row = el('div', 'btn-row');
    row.style.marginTop = '1.1em';
    row.appendChild(btn('', 'icon grey', () => this.app.toMenu(), ICON.home));
    row.appendChild(btn('', 'icon purple', () => this.app.openSettings('pause'), ICON.gear));
    row.appendChild(btn('', 'icon blue', () => this.app.restart(), ICON.retry));
    row.appendChild(btn('Resume', 'big primary', () => this.app.resume(), ICON.play));
    p.appendChild(row);
    p.appendChild(el('div', 'keyhint', info.touch ? '' : 'P or Space to resume &middot; R to restart'));
    s.appendChild(p);
    const onKey = (a) => { if (a === 'confirm' || a === 'pause') this.app.resume(); };
    return this.mount(s, onKey);
  }

  // ---- result ----
  showResult(r) {
    const s = el('div', 'screen dim-bg');
    const p = el('div', 'panel result-panel');
    p.appendChild(el('div', 'ribbon green', r.daily ? 'Daily Complete!' : r.perfect ? 'Perfect Delivery!' : 'Delivered!'));
    p.appendChild(el('div', 'dim', r.subtitle));
    if (!r.daily) {
      const stars = el('div', 'stars');
      const labels = ['Delivered', `All cargo<br>(${r.delivered}/${r.total})`, `Under ${fmtTime(r.par).replace(/\.0$/, '')}`];
      r.stars.forEach((on, i) => {
        const st = el('div', 's' + (on ? ' got' : ' off'), ICON.star(!!on) + `<span class="lbl">${labels[i]}</span>`);
        stars.appendChild(st);
        if (on) setTimeout(() => { st.classList.add('pop'); this.app.sfx('star', 1, i); }, 350 + i * 330);
      });
      p.appendChild(stars);
    }
    const stats = el('div', 'stats');
    const cargoStat = `<div class="stat"><b>${r.delivered}/${r.total}</b><small>cargo</small></div>`;
    const timeStat = `<div class="stat ${r.newBest ? 'best' : ''}"><b>${fmtTime(r.time)}</b><small>${r.newBest ? 'new best!' : r.bestTime ? 'best ' + fmtTime(r.bestTime) : 'time'}</small></div>`;
    const coinStat = `<div class="stat"><b><span class="coin-i"></span><span class="earn">+${r.coins}</span></b><small>coins</small></div>`;
    const scoreStat = r.daily ? `<div class="stat ${r.newBest ? 'best' : ''}"><b>${r.score}</b><small>${r.newBest ? 'new best!' : 'best ' + r.best}</small></div>` : '';
    stats.innerHTML = (r.daily ? scoreStat : '') + cargoStat + timeStat + coinStat;
    p.appendChild(stats);
    if (r.unlockMsg) p.appendChild(el('div', '', `<span class="newbest">${r.unlockMsg}</span>`)).style.marginBottom = '0.8em';
    const row = el('div', 'btn-row');
    row.appendChild(btn('', 'icon grey', () => this.app.toMenu(), ICON.home));
    row.appendChild(btn('', 'icon blue', () => this.app.retryFromResult(), ICON.retry));
    if (r.hasNext) row.appendChild(btn('Next', 'big primary', () => this.app.next(), ICON.next));
    else row.appendChild(btn(r.daily ? 'Done' : 'Menu', 'big primary', () => this.app.toMenu(), ICON.home));
    p.appendChild(row);
    if (r.canDouble) {
      const offer = el('div', 'offer');
      const b = btn(`Double coins <span class="ad">${ICON.video}</span>`, 'yellow small', async () => {
        b.disabled = true;
        const ok = await this.app.doubleCoins();
        if (ok) { p.querySelector('.earn').textContent = '+' + r.coins * 2; b.remove(); } else if (!this.app.adsAvailable()) b.remove(); else b.disabled = false;
      }, '<span class="coin-i"></span>');
      offer.appendChild(b);
      p.appendChild(offer);
    }
    p.appendChild(el('div', 'keyhint', r.touch ? '' : `${r.hasNext ? 'Space: next' : 'Space: continue'} &middot; R: retry`));
    s.appendChild(p);
    const onKey = (a) => { if (a === 'confirm') (r.hasNext ? this.app.next() : this.app.toMenu()); else if (a === 'restart') this.app.retryFromResult(); };
    return this.mount(s, onKey);
  }

  // ---- fail ----
  showFail(f) {
    const s = el('div', 'screen dim-bg');
    const p = el('div', 'panel fail-panel');
    const [why, quip] = FAIL_TEXT[f.reason] || FAIL_TEXT.cargo;
    p.appendChild(el('div', 'ribbon red', 'Oops!'));
    p.appendChild(el('div', 'why', why));
    p.appendChild(el('div', 'dim', quip));
    p.appendChild(el('p', 'tip', 'Tip: ' + (f.tip || TIPS[Math.floor(Math.random() * TIPS.length)])));
    const row = el('div', 'btn-row');
    row.appendChild(btn('', 'icon grey', () => this.app.toMenu(), ICON.home));
    row.appendChild(btn('Retry', 'big primary', () => this.app.restart(), ICON.retry));
    p.appendChild(row);
    if (f.skip) {
      const offer = el('div', 'offer');
      const b = btn(f.skip === 'ad' ? `Skip level <span class="ad">${ICON.video}</span>` : 'Skip this level', 'purple small', async () => {
        b.disabled = true;
        const ok = await this.app.skipLevel(f.skip === 'ad');
        if (!ok && !this.app.adsAvailable()) b.remove(); else if (!ok) b.disabled = false;
      }, ICON.skip);
      offer.appendChild(b);
      p.appendChild(offer);
    }
    p.appendChild(el('div', 'keyhint', f.touch ? '' : 'Space or R: retry'));
    s.appendChild(p);
    const onKey = (a) => { if (a === 'confirm' || a === 'restart') this.app.restart(); };
    return this.mount(s, onKey);
  }

  // ---------- HUD ----------
  buildHud(level, sim, opts) {
    this.removeHud();
    const h = el('div', '');
    h.id = 'hud';
    const tl = el('div', 'tl');
    const r1 = el('div', 'row');
    r1.appendChild(btn('', 'icon orange', () => this.app.pause(), ICON.pause));
    const rb = btn('', 'icon blue', () => this.app.restart(), ICON.retry);
    r1.appendChild(rb);
    tl.appendChild(r1);
    const cr = el('div', 'cargo-row');
    this.cargoEls = sim.cargo.map((c) => {
      const d = el('div', 'cg');
      d.appendChild(cargoImg(c.type));
      cr.appendChild(d);
      return d;
    });
    const need = el('span', 'need-lbl');
    cr.appendChild(need);
    tl.appendChild(cr);
    const tc = el('div', 'tc');
    tc.appendChild(el('div', 'lvl-pill', level.daily ? `Daily &middot; ${level.dateLabel}` : `${level.id}. ${level.name}`));
    const prog = el('div', 'progress', `<i></i><span class="dot"></span>${ICON.flag.replace('<svg', '<svg class="flag"')}`);
    tc.appendChild(prog);
    const tr = el('div', 'tr');
    tr.innerHTML = this.coinsPill(0) + `<div class="timer"><span class="tv">0:00.0</span>${level.par ? `<small>par ${fmtTime(level.par).replace(/\.0$/, '')}</small>` : ''}</div>`;
    h.append(tl, tc, tr);
    if (opts.touch) {
      const pd = el('div', 'pedals');
      const br = el('div', 'pedal brake', ICON.brake + '<span>BRAKE</span>');
      const gs = el('div', 'pedal gas', ICON.gas + '<span>GAS</span>');
      pd.append(br, gs);
      h.appendChild(pd);
      this.app.input.bindPedal(br, 'brake');
      this.app.input.bindPedal(gs, 'gas');
      this.gasPedal = gs;
    } else this.gasPedal = null;
    this.root.insertBefore(h, this.root.firstChild);
    this.hud = h;
    this.hudEls = { need, bar: prog.querySelector('i'), dot: prog.querySelector('.dot'), coins: tr.querySelector('.cv'), time: tr.querySelector('.tv'), timer: tr.querySelector('.timer'), retry: rb };
    this.hudState = { lost: sim.cargo.map(() => false), coins: -1, t: -1, req: level.required };
    this.updateHud(sim, level);
    return h;
  }

  removeHud() {
    if (this.hud) this.hud.remove();
    this.hud = null;
    this.gasPedal = null;
  }

  updateHud(sim, level) {
    if (!this.hud) return;
    const E = this.hudEls, S = this.hudState;
    const lost = sim.cargo.map((c) => c.lost);
    let left = 0;
    lost.forEach((l, i) => {
      if (!l) left++;
      if (l !== S.lost[i]) {
        S.lost[i] = l;
        this.cargoEls[i].classList.toggle('lost', l);
      }
    });
    const reqLeft = level.required;
    E.need.textContent = left >= reqLeft ? `need ${reqLeft}` : 'too few!';
    const pr = sim.progress();
    E.bar.style.width = (pr * 100).toFixed(1) + '%';
    E.dot.style.left = (pr * 100).toFixed(1) + '%';
    if (sim.coinsTaken !== S.coins) { S.coins = sim.coinsTaken; E.coins.textContent = String(S.coins); }
    const t = Math.floor(sim.runTime * 10);
    if (t !== S.t) {
      S.t = t;
      E.time.textContent = fmtTime(sim.runTime);
      if (level.par) E.timer.classList.toggle('over', sim.runTime > level.par);
    }
  }

  cargoHit(i) {
    const e = this.cargoEls && this.cargoEls[i];
    if (!e) return;
    e.classList.remove('hit');
    void e.offsetWidth;
    e.classList.add('hit');
  }

  pulseRetry(on) {
    if (this.hudEls) this.hudEls.retry.classList.toggle('pulse', on);
    if (this.hudEls && on) this.hudEls.retry.style.animation = 'pulse 0.8s ease-in-out infinite';
  }

  intro(level) {
    if (!this.hud) return;
    const d = el('div', 'intro', level.daily
      ? `<div class="a">DAILY DELIVERY</div><div class="b">${level.dateLabel}</div><div class="c">Deliver ${level.required}+ of ${level.cargo.length}</div>`
      : `<div class="a">LEVEL ${level.id}</div><div class="b">${level.name}</div><div class="c">Deliver ${level.required} of ${level.cargo.length}</div>`);
    this.hud.appendChild(d);
    setTimeout(() => d.remove(), 2300);
  }

  ctrlHint(show, touch) {
    if (this.ctrlEl) { this.ctrlEl.remove(); this.ctrlEl = null; }
    if (this.gasPedal) this.gasPedal.classList.toggle('hint', !!show);
    if (!show || !this.hud || touch) return;
    this.ctrlEl = el('div', 'ctrl-hint', `<span><span class="key">&rarr;</span> <span class="key">D</span> drive</span><span><span class="key">&larr;</span> <span class="key">A</span> brake</span>`);
    this.hud.appendChild(this.ctrlEl);
  }

  // ---------- toasts ----------
  toast(html, cls = '', ms = 2200) {
    const t = el('div', 'toast ' + cls, html);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, ms);
    return t;
  }

  cargoTip(type) {
    const d = CARGO[type];
    const t = el('div', 'tipcard');
    t.appendChild(cargoImg(type));
    t.appendChild(el('div', '', `<div class="t1">NEW CARGO</div><div class="t2">${d.name}</div><div class="t3">${CARGO_TIPS[type] || ''}</div>`));
    this.toasts.appendChild(t);
    setTimeout(() => { t.classList.add('out'); t.style.animation = 'toastOut 0.25s forwards'; setTimeout(() => t.remove(), 260); }, 4200);
  }

  rotateHint() {
    const r = el('div', 'rotate-hint', ICON.phone + '<span>Turn your phone sideways for a wider view</span>');
    this.root.appendChild(r);
    setTimeout(() => r.remove(), 4000);
  }

  key(action) {
    if (this.onKey) { this.onKey(action); return true; }
    return false;
  }
}
