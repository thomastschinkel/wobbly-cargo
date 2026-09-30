// Seeded daily challenge: the same route for everyone on a given UTC day.
import { mulberry32, hashStr } from '../core/rng.js';

const THEMES = ['meadow', 'canyon', 'snow', 'meadowDusk', 'canyonDusk', 'snowNight', 'volcano', 'volcanoDusk', 'moon', 'moonDeep'];

// world-specific hazards only show up on routes with a matching look
const THEME_PIECES = {
  volcano: [
    (r) => [['flat', 4], ['geyser', 10, 4.2, r()]],
    () => [['flat', 6], ['crumble', 8, 0.6], ['flat', 10]],
  ],
  moon: [
    (r) => [['flat', 4], ['piston', 9, 3.6, r()]],
    () => [['meteors', 8, 20, 6, 0.8], ['flat', 30]],
    (r) => [['lowgrav', 26, 0.55], ['flat', 4], ['hills', 18, 1.2 + r() * 0.6, 1], ['flat', 4]],
  ],
};

// Each piece is a list of ops that starts and ends on flat ground at the same "mood".
// too wild in moon gravity
const boostJump = () => [['boost', 10, 40], ['flat', 4], ['jump', 5, 0.8, -1.2]];

const PIECES = [
  (r) => [['hills', 20 + r() * 8, 1.4 + r() * 1.0, 1]],
  (r) => [['bumps', 12, 0.28 + r() * 0.12, 3]],
  (r) => [['rough', 16 + r() * 6, 0.35 + r() * 0.15]],
  (r) => [['slope', 14, 2 + r()], ['flat', 6], ['slope', 14, -(2 + r())]],
  (r) => [['bridge', 10 + Math.floor(r() * 3) * 2]],
  () => [['seesaw', 12]],
  (r) => [['logs', 10, 2 + Math.floor(r() * 2), 0.26]],
  () => [['rollers', 12, 3]],
  () => [['flat', 9], ['jump', 4.5, 0.8, -1.2]],
  () => [['stack', 3, 2]],
  (r) => [['flat', 6], ['hammer', 12, r(), 3.6]],
  (r) => [['rockfall', 12, 4, 8], ['flat', 10]],
  boostJump,
  () => [['bouncer', 6, 8.6], ['step', 1.6], ['flat', 8], ['slope', 14, -1.6]],
  () => [['ferry', 12, 7]],
  () => [['ice'], ['flat', 10], ['ground']],
  (r) => [['wind', 30, -0.22 - r() * 0.1, 0.03], ['flat', 12]],
];

const CARGO_SETS = [
  ['crate', 'crate', 'box', 'barrel'],
  ['melon', 'crate', 'melon', 'box'],
  ['egg', 'egg', 'crate', 'box'],
  ['tv', 'crate', 'barrel', 'box'],
  ['penguin', 'penguin', 'crate', 'box'],
  ['cake', 'crate', 'box', 'barrel'],
  ['gold', 'gold', 'crate', 'box'],
  ['ball', 'ball', 'crate', 'crate'],
  ['crate', 'melon', 'egg', 'tv'],
  ['jelly', 'vase', 'crate', 'box'],
  ['alien', 'alien', 'crate', 'box'],
];

export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function dailyLevel(key) {
  const seed = hashStr('wobbly-daily-' + key);
  const r = mulberry32(seed);
  const theme = THEMES[Math.floor(r() * THEMES.length)];
  const world = theme.replace(/Dusk|Deep/, '');
  const pieces = PIECES.filter((p) => world !== 'moon' || p !== boostJump).concat(THEME_PIECES[world] || [], THEME_PIECES[world] || []);
  const n = 6 + Math.floor(r() * 2);
  const ops = [['flat', 6]];
  const used = new Map();
  let last = -1;
  for (let i = 0; i < n; i++) {
    let k;
    let tries = 0;
    do {
      k = Math.floor(r() * pieces.length);
      tries++;
    } while ((k === last || (used.get(k) || 0) >= 2) && tries < 20);
    last = k;
    used.set(k, (used.get(k) || 0) + 1);
    ops.push(...pieces[k](r));
    ops.push(['flat', 5]);
    if (i % 2 === 1) ops.push(['coins', 5, 2.2, 1.6]);
  }
  ops.push(['coins', 4, 2.4, 1.6], ['flat', 6], ['finish']);
  // low gravity turns rough ground into a trampoline, so tone it down there
  if (world === 'moon') for (const o of ops) if (o[0] === 'rough') o[2] *= 0.7;
  const hasWind = ops.some((o) => o[0] === 'wind');
  let cargo = CARGO_SETS[Math.floor(r() * CARGO_SETS.length)].slice();
  if (!hasWind && cargo.includes('ball')) cargo = ['crate', 'box', 'barrel', 'crate'];
  return {
    id: 'daily',
    name: 'Daily Delivery',
    theme,
    seed: seed % 100000,
    cargo,
    required: cargo.length - 2,
    par: 0,
    ops,
    grav: world === 'moon' ? 0.6 : 1,
    daily: key,
  };
}
