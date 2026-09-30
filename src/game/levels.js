// 50 hand-built delivery routes in five worlds; every world brings new hazards and cargo.
// ops are TrackBuilder calls: [name, ...args]. `par` = seconds for the time star
// (tuned with tools/validate-levels.mjs: close to a clean run, so the third star takes real skill).
// ['speed', v] only steers the autopilot (the demo/validator bot), players judge speed themselves.

const L = (name, theme, cargo, required, par, ops, extra = {}) => ({ name, theme, cargo, required, par, ops, ...extra });
const MOON = { grav: 0.58 };

const RAW = [
  // ---------------- SUNNY MEADOWS ----------------
  L('First Delivery', 'meadow', ['crate', 'crate', 'box', 'crate'], 3, 26, [
    ['sign', 'drive'], ['flat', 8], ['coins', 5, 2.2, 1.5], ['hills', 24, 2.2, 1], ['flat', 4],
    ['bumps', 12, 0.35, 3], ['coins', 4, 2.4, 1.6], ['hills', 30, 3.2, 1], ['flat', 4], ['slope', 12, -2.6],
    ['speed', 5.5], ['bumps', 12, 0.38, 3], ['speed', 7], ['flat', 4], ['sign', 'home'], ['flat', 4], ['finish'],
  ]),
  L('Bumpy Road', 'meadow', ['crate', 'box', 'crate', 'box'], 3, 32, [
    ['sign', 'slow'], ['flat', 6], ['speed', 5], ['bumps', 14, 0.5, 3], ['speed', 7], ['flat', 4], ['coins', 5, 2.3, 1.6],
    ['hills', 26, 2.8, 1], ['sign', 'brake'], ['flat', 2], ['slope', 14, -3.5], ['speed', 4.5], ['bumps', 12, 0.55, 3],
    ['flat', 3], ['bumps', 10, 0.45, 3], ['speed', 7], ['coins', 4, 2.4, 1.5], ['rough', 18, 0.35], ['flat', 4],
    ['step', -0.9], ['flat', 6], ['finish'],
  ]),
  L('Rolling Barrels', 'meadow', ['barrel', 'barrel', 'barrel'], 2, 24, [
    ['sign', 'careful'], ['flat', 6], ['slope', 14, 3.5], ['flat', 4], ['coins', 4, 2.2, 1.6], ['slope', 12, -3.4],
    ['speed', 5], ['bumps', 12, 0.4, 3], ['speed', 7], ['flat', 4], ['step', 0.6], ['flat', 5],
    ['step', -0.9], ['flat', 3], ['coins', 5, 2.2, 1.6], ['slope', 14, 2.6], ['flat', 2], ['slope', 12, -2.6],
    ['speed', 5], ['rough', 16, 0.34], ['speed', 7], ['flat', 6], ['finish'],
  ]),
  L('Seesaw Hill', 'meadow', ['crate', 'box', 'barrel', 'box'], 3, 37, [
    ['sign', 'seesaw'], ['flat', 6], ['seesaw', 12], ['flat', 4], ['coins', 5, 2.2, 1.6], ['hills', 26, 2.8, 1],
    ['slope', 12, 2.4], ['seesaw', 12], ['seesaw', 12], ['slope', 12, -2.4], ['speed', 5], ['bumps', 12, 0.45, 3],
    ['speed', 7], ['coins', 4, 2.4, 1.6], ['slope', 12, 2], ['seesaw', 14], ['step', -0.8], ['flat', 6], ['finish'],
  ]),
  L('Melon Patch', 'meadow', ['melon', 'melon', 'melon'], 2, 30, [
    ['sign', 'fragile'], ['flat', 6], ['hills', 22, 2, 1], ['coins', 5, 2.2, 1.6], ['flat', 4], ['step', -1.0],
    ['flat', 6], ['speed', 5], ['bumps', 14, 0.4, 3], ['speed', 7], ['slope', 16, 3.2], ['speed', 5], ['flat', 3],
    ['coins', 4, 2.4, 1.6], ['slope', 20, -2.8], ['speed', 4.5], ['rough', 18, 0.42], ['speed', 7], ['flat', 3],
    ['step', -0.9], ['flat', 4], ['hills', 20, 1.8, 1], ['flat', 4], ['finish'],
  ]),
  L('Log Jam', 'meadow', ['crate', 'box', 'crate', 'melon'], 3, 42, [
    ['sign', 'logs'], ['flat', 6], ['logs', 12, 3, 0.3], ['flat', 4], ['coins', 5, 2.2, 1.6],
    ['hills', 24, 2.4, 1], ['rollers', 14, 4], ['flat', 4], ['flat', 3], ['logs', 12, 3, 0.3],
    ['flat', 4], ['slope', 14, -2.4], ['speed', 5], ['bumps', 12, 0.45, 3], ['speed', 7], ['coins', 4, 2.4, 1.6], ['rollers', 12, 3],
    ['flat', 3], ['logs', 10, 2, 0.3], ['flat', 6], ['finish'],
  ]),
  L('Wobbly Bridge', 'meadow', ['box', 'box', 'melon', 'crate'], 3, 37, [
    ['sign', 'bridge'], ['flat', 6], ['bridge', 14], ['flat', 4], ['coins', 5, 2.2, 1.6], ['hills', 26, 2.6, 1],
    ['slope', 10, 2], ['bridge', 18], ['flat', 2], ['speed', 5], ['bumps', 12, 0.45, 3], ['speed', 7],
    ['slope', 12, -2.6], ['bridge', 14], ['coins', 4, 2.4, 1.6], ['flat', 3], ['step', -0.9], ['flat', 3],
    ['bridge', 20], ['flat', 3], ['seesaw', 12], ['speed', 5], ['rough', 14, 0.4], ['speed', 7], ['flat', 6], ['finish'],
  ]),
  L('First Flight', 'meadowDusk', ['crate', 'crate', 'barrel', 'box'], 3, 32, [
    ['sign', 'tilt'], ['flat', 10], ['sign', 'jump'], ['flat', 4], ['jump', 5, 1.0, -1.0], ['flat', 4],
    ['coins', 5, 2.2, 1.6], ['hills', 26, 2.6, 1], ['flat', 2], ['jump', 6.5, 1.1, -1.4], ['flat', 3],
    ['speed', 5], ['bumps', 12, 0.45, 3], ['speed', 7], ['slope', 14, 2.6], ['flat', 2], ['jump', 7, 1.2, -2.2],
    ['flat', 3], ['coins', 4, 2.4, 1.6], ['rough', 14, 0.35], ['flat', 6], ['finish'],
  ]),
  L('Bounce House', 'meadowDusk', ['box', 'crate', 'box', 'barrel'], 3, 35, [
    ['sign', 'bounce'], ['flat', 8], ['bouncer', 6, 8.6], ['step', 1.6], ['flat', 8], ['coins', 5, 2.2, 1.6],
    ['sign', 'stack'], ['stack', 3, 2], ['flat', 4], ['slope', 14, -1.6], ['speed', 5], ['bumps', 12, 0.45, 3],
    ['speed', 7], ['hills', 22, 2.4, 1], ['bouncer', 6, 8.6], ['step', 1.6], ['flat', 4], ['stack', 4, 2],
    ['flat', 4], ['coins', 4, 2.4, 1.6], ['slope', 16, -2.2], ['bouncer', 6, 8.6], ['step', 1.6], ['flat', 4],
    ['slope', 14, -1.6], ['flat', 6], ['finish'],
  ]),
  L('Meadow Finale', 'meadowDusk', ['melon', 'crate', 'box', 'crate'], 3, 52, [
    ['flat', 6], ['speed', 5], ['bumps', 12, 0.35, 3], ['speed', 7], ['bridge', 12], ['flat', 4], ['coins', 5, 2.2, 1.6],
    ['rollers', 12, 3], ['flat', 2], ['speed', 5.5], ['hills', 26, 2.8, 1], ['speed', 7], ['logs', 12, 3, 0.3], ['flat', 6],
    ['jump', 5.5, 1.0, -1.2], ['flat', 4], ['stack', 3, 2], ['flat', 3], ['coins', 5, 2.2, 1.6],
    ['slope', 14, 3], ['flat', 3], ['logs', 10, 2, 0.28], ['slope', 14, -3], ['speed', 4.5], ['rough', 16, 0.45], ['speed', 7],
    ['logs', 10, 2, 0.28], ['bridge', 16], ['sign', 'home'], ['flat', 4], ['step', -0.9], ['flat', 6], ['finish'],
  ]),

  // ---------------- DUSTY CANYON ----------------
  L('Canyon Express', 'canyon', ['tv', 'crate', 'crate', 'box'], 3, 31, [
    ['flat', 6], ['speed', 5], ['rough', 26, 0.55], ['speed', 7], ['coins', 5, 2.2, 1.6], ['hills', 24, 2.8, 1],
    ['flat', 4], ['slope', 16, 4], ['flat', 3], ['slope', 16, -4], ['speed', 4.5], ['bumps', 14, 0.5, 3],
    ['speed', 7], ['coins', 4, 2.4, 1.6], ['step', -1.1], ['flat', 4], ['speed', 5], ['rough', 18, 0.5],
    ['speed', 7], ['flat', 6], ['finish'],
  ]),
  L('Egg Run', 'canyon', ['egg', 'egg', 'egg', 'egg', 'egg'], 4, 32, [
    ['sign', 'fragile'], ['flat', 6], ['hills', 20, 1.8, 1], ['step', -0.8], ['flat', 6], ['coins', 5, 2.2, 1.6],
    ['speed', 4.5], ['rough', 22, 0.5], ['speed', 7], ['slope', 14, 3], ['flat', 4], ['slope', 16, -3],
    ['speed', 4.5], ['bumps', 12, 0.4, 3], ['speed', 7], ['coins', 4, 2.4, 1.6], ['step', -0.9], ['flat', 4],
    ['hills', 22, 2.2, 1], ['speed', 5], ['bumps', 10, 0.35, 3], ['speed', 7], ['flat', 6], ['finish'],
  ]),
  L('Falling Rocks', 'canyon', ['crate', 'tv', 'box', 'crate'], 3, 31, [
    ['flat', 4], ['sign', 'rocks'], ['flat', 6], ['rockfall', 14, 5, 8], ['flat', 10], ['hills', 22, 2.4, 1],
    ['coins', 5, 2.2, 1.6], ['flat', 4], ['rockfall', 12, 6, 10], ['slope', 16, 3], ['flat', 8], ['slope', 16, -3],
    ['speed', 5], ['bumps', 12, 0.45, 3], ['speed', 7], ['rockfall', 10, 5, 9], ['flat', 10],
    ['coins', 4, 2.4, 1.6], ['speed', 5], ['rough', 16, 0.45], ['speed', 7], ['step', -1.0], ['flat', 4],
    ['rockfall', 10, 4, 6], ['hills', 20, 2.2, 1], ['flat', 6], ['finish'],
  ]),
  L('Boost Canyon', 'canyon', ['crate', 'crate', 'barrel', 'box'], 3, 29, [
    ['sign', 'boost'], ['flat', 6], ['boost', 10, 55], ['flat', 4], ['jump', 6.5, 1.0, -1.2], ['flat', 4],
    ['coins', 5, 2.2, 1.6], ['hills', 24, 2.6, 1], ['boost', 10, 55], ['slope', 18, 4.5], ['flat', 4],
    ['jump', 6, 0.9, -2.6], ['flat', 3], ['speed', 5], ['bumps', 12, 0.45, 3], ['speed', 7], ['boost', 10, 50],
    ['jump', 7.5, 1.1, -1.6], ['flat', 3], ['coins', 4, 2.4, 1.6], ['flat', 6], ['finish'],
  ]),
  L('Hammer Time', 'canyon', ['box', 'tv', 'crate', 'box'], 3, 37, [
    ['sign', 'hammer'], ['flat', 6], ['hammer', 12, 0, 3.8], ['flat', 4], ['coins', 5, 2.2, 1.6],
    ['hills', 22, 2.4, 1], ['flat', 4], ['hammer', 12, 0.5, 3.6], ['flat', 6], ['hammer', 12, 0.1, 3.6],
    ['speed', 5], ['bumps', 12, 0.45, 3], ['speed', 7], ['flat', 8], ['hammer', 12, 0.7, 3.4],
    ['coins', 4, 2.4, 1.6], ['flat', 6], ['finish'],
  ]),
  L('Ferry Crossing', 'canyon', ['crate', 'egg', 'crate', 'barrel'], 3, 49, [
    ['sign', 'ferry'], ['flat', 8], ['ferry', 12, 7], ['flat', 6], ['coins', 5, 2.2, 1.6], ['hills', 24, 2.6, 1],
    ['flat', 4], ['ferry', 16, 8], ['flat', 4], ['speed', 5], ['bumps', 12, 0.4, 3], ['speed', 7],
    ['slope', 12, 2.4], ['ferry', 14, 7], ['flat', 3], ['coins', 4, 2.4, 1.6], ['slope', 12, -2.4],
    ['speed', 5], ['rough', 16, 0.45], ['speed', 7], ['flat', 6], ['finish'],
  ]),
  L('Windy Mesa', 'canyon', ['ball', 'crate', 'ball', 'box'], 3, 27, [
    ['sign', 'wind'], ['flat', 6], ['wind', 40, -0.36, 0.05], ['flat', 10], ['hills', 24, 2.2, 1],
    ['coins', 5, 2.2, 1.6], ['flat', 6], ['slope', 14, 2.4], ['flat', 4], ['wind', 36, -0.3, 0.06],
    ['hills', 18, 1.6, 1], ['flat', 6], ['slope', 14, -2.4], ['wind', 30, 0.3, 0.05],
    ['coins', 4, 2.4, 1.6], ['hills', 20, 2, 1], ['speed', 5], ['bumps', 12, 0.38, 3], ['speed', 7],
    ['wind', 24, -0.4, 0.08], ['flat', 10], ['finish'],
  ]),
  L('Runaway Boulder', 'canyonDusk', ['crate', 'box', 'crate', 'box'], 3, 23, [
    ['flat', 4], ['sign', 'boulder'], ['flat', 6], ['chase', 0.2, 1.4, 15], ['speed', 8], ['flat', 6],
    ['slope', 20, -3], ['coins', 5, 2.4, 1.6], ['hills', 22, 2.2, 1], ['bumps', 12, 0.35, 3], ['slope', 18, -3],
    ['flat', 4], ['hills', 20, 2, 1], ['coins', 4, 2.6, 1.6], ['bumps', 12, 0.35, 3], ['flat', 6],
    ['slope', 14, -2], ['flat', 6], ['finish'],
  ]),
  L('Long Haul', 'canyonDusk', ['cake', 'crate', 'tv', 'box'], 3, 44, [
    ['flat', 6], ['speed', 5], ['rough', 18, 0.38], ['speed', 7], ['bridge', 12], ['flat', 4], ['coins', 5, 2.2, 1.6],
    ['hills', 24, 2.2, 1], ['rockfall', 12, 5, 8], ['flat', 12], ['hammer', 12, 0.3, 3.6], ['flat', 4],
    ['slope', 14, 3], ['flat', 4], ['coins', 4, 2.4, 1.6], ['slope', 14, -3], ['logs', 12, 3, 0.3],
    ['flat', 4], ['ferry', 13, 7], ['flat', 4], ['speed', 4.5], ['bumps', 12, 0.45, 3], ['speed', 7],
    ['wind', 24, -0.3, 0.04], ['flat', 8], ['step', -1.0], ['flat', 6], ['finish'],
  ]),
  L('Canyon Finale', 'canyonDusk', ['tv', 'egg', 'egg', 'crate', 'cake'], 4, 44, [
    ['flat', 6], ['boost', 10, 50], ['jump', 6, 0.9, -1.2], ['flat', 10], ['hammer', 12, 0.2, 3.6],
    ['coins', 5, 2.2, 1.6], ['flat', 4], ['ferry', 14, 7], ['flat', 4], ['rockfall', 12, 6, 9], ['hills', 24, 2.4, 1],
    ['flat', 6], ['wind', 28, -0.4, 0], ['speed', 4.5], ['bumps', 14, 0.4, 3], ['speed', 7], ['flat', 8], ['hammer', 12, 0.6, 3.4],
    ['speed', 5], ['rough', 16, 0.45], ['speed', 7], ['coins', 4, 2.4, 1.6], ['sign', 'home'], ['flat', 8], ['finish'],
  ]),

  // ---------------- FROSTY PEAKS ----------------
  L('Slippery Slopes', 'snow', ['penguin', 'penguin', 'crate', 'penguin'], 3, 28, [
    ['sign', 'ice'], ['flat', 6], ['ice'], ['flat', 12], ['ground'], ['hills', 22, 2.2, 1], ['coins', 5, 2.2, 1.6],
    ['ice'], ['slope', 16, -3], ['flat', 10], ['ground'], ['slope', 14, 3], ['flat', 4], ['ice'],
    ['speed', 5], ['bumps', 12, 0.35, 3], ['speed', 7], ['flat', 6], ['slope', 14, -2.6], ['ground'],
    ['coins', 4, 2.4, 1.6], ['hills', 20, 2, 1], ['ice'], ['flat', 10], ['ground'], ['flat', 6], ['finish'],
  ]),
  L('Snowball Chase', 'snow', ['crate', 'penguin', 'box', 'penguin'], 3, 23, [
    ['flat', 4], ['sign', 'boulder'], ['flat', 6], ['chase', 0.2, 1.6, 15], ['speed', 8], ['flat', 6],
    ['slope', 20, -3], ['coins', 5, 2.4, 1.6], ['hills', 20, 1.8, 1], ['ice'], ['flat', 10], ['ground'],
    ['bumps', 12, 0.35, 3], ['slope', 20, -3], ['coins', 4, 2.6, 1.6], ['ice'], ['hills', 20, 2, 1], ['ground'],
    ['flat', 6], ['slope', 14, -2], ['flat', 6], ['finish'],
  ]),
  L('Icy Bridge', 'snow', ['egg', 'penguin', 'crate', 'box'], 3, 28, [
    ['flat', 6], ['bridge', 14], ['flat', 4], ['coins', 5, 2.2, 1.6], ['ice'], ['flat', 10], ['ground'],
    ['hills', 22, 2.4, 1], ['flat', 2], ['bridge', 18], ['flat', 4], ['ice'], ['slope', 14, -2.6], ['ground'],
    ['speed', 5], ['bumps', 12, 0.4, 3], ['speed', 7], ['coins', 4, 2.4, 1.6], ['ice'], ['bridge', 16], ['ground'],
    ['flat', 4], ['step', -0.9], ['flat', 6], ['finish'],
  ]),
  L('Blizzard', 'snow', ['ball', 'cake', 'box', 'penguin'], 3, 27, [
    ['sign', 'wind'], ['flat', 6], ['wind', 60, -0.38, 0.05], ['flat', 8], ['hills', 22, 2.2, 1],
    ['coins', 5, 2.2, 1.6], ['ice'], ['flat', 10], ['ground'], ['slope', 14, 2.6], ['flat', 4],
    ['wind', 40, 0.42, 0.05], ['slope', 14, -2.6], ['speed', 5], ['bumps', 12, 0.4, 3], ['speed', 7],
    ['coins', 4, 2.4, 1.6], ['wind', 30, -0.36, 0.06], ['ice'], ['hills', 20, 2, 1], ['ground'], ['flat', 8], ['finish'],
  ]),
  L('Ski Jump', 'snowNight', ['gold', 'gold', 'crate', 'gold'], 3, 39, [
    ['sign', 'jump'], ['flat', 6], ['slope', 18, 5], ['flat', 4], ['slope', 14, -3], ['jump', 7, 0.8, -3.5, 7],
    ['flat', 4], ['coins', 5, 2.2, 1.6], ['hills', 22, 2.4, 1], ['flat', 2], ['jump', 6, 1.0, -1.5], ['flat', 4],
    ['ice'], ['slope', 16, 3.5], ['ground'], ['flat', 3], ['jump', 7.5, 1.1, -2.4], ['flat', 3],
    ['coins', 4, 2.4, 1.6], ['speed', 5], ['bumps', 12, 0.4, 3], ['speed', 7], ['flat', 6], ['finish'],
  ]),
  L('Going Up', 'snow', ['crate', 'tv', 'penguin', 'box'], 3, 43, [
    ['sign', 'lift'], ['flat', 8], ['lift', 6.2, 3.5, 7], ['flat', 6], ['coins', 5, 2.2, 1.6], ['hills', 20, 2.2, 1],
    ['flat', 4], ['lift', 6.2, 4, 8], ['flat', 4], ['ice'], ['slope', 18, -3.5], ['ground'], ['coins', 4, 2.4, 1.6],
    ['flat', 4], ['lift', 6.2, 4.5, 8], ['flat', 4], ['speed', 5], ['bumps', 12, 0.4, 3], ['speed', 7],
    ['slope', 16, -3], ['flat', 6], ['finish'],
  ]),
  L('Avalanche', 'snowNight', ['egg', 'crate', 'penguin', 'box'], 3, 21, [
    ['flat', 4], ['sign', 'rocks'], ['flat', 6], ['rockfall', 14, 6, 9], ['flat', 12], ['hills', 20, 2, 1],
    ['coins', 5, 2.2, 1.6], ['rockfall', 10, 5, 8], ['flat', 8], ['sign', 'boulder'], ['flat', 6],
    ['chase', 0.3, 1.6, 15], ['speed', 8], ['flat', 4], ['slope', 20, -3], ['ice'], ['flat', 10], ['ground'],
    ['bumps', 12, 0.3, 3], ['coins', 4, 2.6, 1.6], ['slope', 18, -3], ['flat', 10], ['finish'],
  ]),
  L('Penguin Parade', 'snowNight', ['penguin', 'penguin', 'penguin', 'crate', 'box'], 4, 39, [
    ['flat', 6], ['ice'], ['flat', 10], ['ground'], ['seesaw', 12], ['flat', 4], ['coins', 5, 2.2, 1.6],
    ['hills', 22, 2.4, 1], ['ice'], ['slope', 14, -2.4], ['ground'], ['bridge', 14], ['flat', 4],
    ['bouncer', 6, 8.6], ['step', 1.6], ['flat', 6], ['speed', 5], ['bumps', 12, 0.4, 3], ['speed', 7],
    ['coins', 4, 2.4, 1.6], ['slope', 16, -2.4], ['ice'], ['seesaw', 12], ['ground'], ['flat', 6], ['finish'],
  ]),
  L('Glacier Gauntlet', 'snowNight', ['tnt', 'crate', 'melon', 'gold'], 3, 47, [
    ['sign', 'tnt'], ['flat', 6], ['bumps', 12, 0.35, 3], ['flat', 8], ['hammer', 12, 0.25, 3.8], ['flat', 4], ['ice'], ['flat', 10],
    ['ground'], ['coins', 5, 2.2, 1.6], ['lift', 6.2, 3.5, 7], ['flat', 6], ['slope', 14, -3.5], ['bridge', 14],
    ['flat', 4], ['wind', 30, -0.5, 0], ['hills', 22, 2.2, 1], ['jump', 5.5, 1.0, -1.2], ['flat', 8],
    ['hammer', 12, 0.6, 3.6], ['coins', 4, 2.4, 1.6], ['ice'], ['slope', 14, -2], ['ground'], ['flat', 8], ['finish'],
  ]),
  L('Summit Delivery', 'snowNight', ['piano', 'tnt', 'tnt', 'crate'], 3, 49, [
    ['sign', 'tnt'], ['flat', 8], ['hills', 20, 1.8, 1], ['bridge', 14], ['flat', 4], ['coins', 5, 2.2, 1.6],
    ['ice'], ['flat', 10], ['ground'], ['slope', 16, 3], ['flat', 6], ['hammer', 12, 0.3, 3.8], ['slope', 16, -3],
    ['ferry', 14, 7], ['flat', 4], ['speed', 5], ['bumps', 12, 0.35, 3], ['speed', 7], ['coins', 4, 2.4, 1.6],
    ['lift', 6.2, 3.5, 7], ['flat', 4], ['ice'], ['slope', 14, -2.4], ['ground'], ['sign', 'home'], ['flat', 8], ['finish'],
  ]),

  // ---------------- VOLCANO VALLEY ----------------
  L('Lava Leap', 'volcano', ['crate', 'crate', 'box', 'barrel'], 3, 36, [
    ['sign', 'lava'], ['flat', 10], ['jump', 5, 1.0, -1.0], ['flat', 4], ['coins', 5, 2.2, 1.6],
    ['hills', 24, 2.4, 1], ['flat', 2], ['jump', 6.5, 1.1, -1.4], ['flat', 3], ['speed', 5], ['bumps', 12, 0.4, 3],
    ['speed', 7], ['slope', 14, 2.6], ['flat', 2], ['jump', 7.5, 1.2, -2.4], ['flat', 3], ['coins', 4, 2.4, 1.6],
    ['speed', 5], ['rough', 14, 0.4], ['speed', 7], ['flat', 10], ['jump', 5.5, 1.0, -1.4], ['flat', 6], ['finish'],
  ]),
  L('Hot Springs', 'volcano', ['crate', 'box', 'crate', 'tv'], 3, 32, [
    ['sign', 'geyser'], ['flat', 10], ['geyser', 10, 4.2, 0], ['flat', 6], ['coins', 5, 2.2, 1.6],
    ['hills', 22, 2.2, 1], ['flat', 8], ['geyser', 10, 3.8, 0.5], ['flat', 4], ['speed', 5], ['bumps', 12, 0.4, 3],
    ['speed', 7], ['flat', 8], ['geyser', 10, 3.6, 0.2], ['geyser', 10, 3.6, 0.75], ['flat', 4],
    ['coins', 4, 2.4, 1.6], ['slope', 14, -2.4], ['jump', 6, 1.0, -1.2], ['flat', 6], ['finish'],
  ]),
  L('Jelly Jiggle', 'volcano', ['jelly', 'jelly', 'jelly', 'crate'], 3, 31, [
    ['sign', 'careful'], ['flat', 8], ['speed', 5], ['bumps', 12, 0.35, 3], ['hills', 22, 2.2, 1], ['speed', 7],
    ['coins', 5, 2.2, 1.6], ['step', -1.0], ['flat', 8], ['jump', 5, 0.9, -1.0], ['flat', 6],
    ['geyser', 10, 4.0, 0.3], ['flat', 2], ['speed', 5], ['rough', 16, 0.4], ['speed', 7], ['slope', 14, 2.6],
    ['flat', 2], ['coins', 4, 2.4, 1.6], ['slope', 14, -2.6], ['step', -0.9], ['flat', 4],
    ['speed', 5], ['bumps', 10, 0.35, 3], ['speed', 7], ['flat', 6], ['finish'],
  ]),
  L('Crumbling Path', 'volcano', ['crate', 'jelly', 'box', 'crate'], 3, 27, [
    ['sign', 'crumble'], ['flat', 10], ['crumble', 8, 0.6], ['flat', 6], ['coins', 5, 2.2, 1.6],
    ['hills', 22, 2.2, 1], ['flat', 4], ['crumble', 10, 0.55], ['flat', 4], ['speed', 5], ['bumps', 12, 0.4, 3],
    ['speed', 7], ['flat', 6], ['crumble', 12, 0.5], ['flat', 10], ['jump', 5.5, 1.0, -1.4], ['flat', 4],
    ['coins', 4, 2.4, 1.6], ['crumble', 10, 0.45], ['flat', 3], ['step', -0.9], ['flat', 6], ['finish'],
  ]),
  L('Lava Rain', 'volcanoDusk', ['crate', 'tv', 'jelly', 'box'], 3, 31, [
    ['flat', 4], ['sign', 'rocks'], ['flat', 6], ['rockfall', 14, 5, 8], ['flat', 12], ['crumble', 8, 0.6],
    ['flat', 4], ['coins', 5, 2.2, 1.6], ['rockfall', 12, 6, 10], ['hills', 22, 2.2, 1], ['flat', 8],
    ['geyser', 10, 4.0, 0.4], ['flat', 4], ['rockfall', 10, 5, 8], ['flat', 10], ['speed', 5],
    ['bumps', 12, 0.4, 3], ['speed', 7], ['coins', 4, 2.4, 1.6], ['rockfall', 10, 4, 6], ['flat', 12],
    ['jump', 5.5, 1.0, -1.4], ['flat', 6], ['finish'],
  ]),
  L('Vase Valley', 'volcano', ['vase', 'vase', 'crate', 'vase'], 3, 31, [
    ['sign', 'fragile'], ['flat', 8], ['hills', 20, 1.8, 1], ['step', -0.8], ['flat', 6], ['coins', 5, 2.2, 1.6],
    ['speed', 4.5], ['rough', 18, 0.4], ['speed', 7], ['flat', 6], ['geyser', 10, 4.2, 0.6], ['flat', 4],
    ['slope', 14, 2.6], ['flat', 3], ['slope', 16, -2.6], ['speed', 4.5], ['bumps', 12, 0.35, 3], ['speed', 7],
    ['coins', 4, 2.4, 1.6], ['crumble', 8, 0.6], ['flat', 4], ['step', -0.8], ['flat', 4],
    ['hills', 20, 1.8, 1], ['flat', 6], ['finish'],
  ]),
  L('Magma Chase', 'volcanoDusk', ['crate', 'jelly', 'box', 'crate'], 3, 27, [
    ['flat', 4], ['sign', 'boulder'], ['flat', 6], ['chase', 0.2, 1.5, 15], ['speed', 8], ['flat', 6],
    ['slope', 20, -3], ['coins', 5, 2.4, 1.6], ['crumble', 8, 0.5], ['flat', 4], ['hills', 20, 1.8, 1],
    ['bumps', 12, 0.3, 3], ['slope', 18, -3], ['jump', 6, 0.9, -1.2], ['flat', 4], ['crumble', 10, 0.5],
    ['coins', 4, 2.6, 1.6], ['slope', 16, -2.4], ['hills', 18, 1.6, 1], ['flat', 10], ['finish'],
  ]),
  L('Geyser Gauntlet', 'volcanoDusk', ['vase', 'jelly', 'crate', 'tv'], 3, 38, [
    ['flat', 10], ['geyser', 10, 3.8, 0], ['geyser', 10, 3.8, 0.5], ['flat', 8], ['hammer', 12, 0.3, 3.6],
    ['flat', 10], ['coins', 5, 2.2, 1.6], ['crumble', 10, 0.5], ['flat', 4], ['speed', 5], ['bumps', 12, 0.35, 3],
    ['speed', 7], ['flat', 8], ['geyser', 10, 3.4, 0.2], ['flat', 8], ['hammer', 12, 0.7, 3.6], ['flat', 4],
    ['coins', 4, 2.4, 1.6], ['geyser', 10, 3.6, 0.6], ['geyser', 10, 3.6, 0.1], ['flat', 6], ['finish'],
  ]),
  L('Ember Express', 'volcanoDusk', ['jelly', 'vase', 'tnt', 'gold'], 3, 51, [
    ['sign', 'tnt'], ['flat', 8], ['ferry', 13, 7], ['flat', 6], ['coins', 5, 2.2, 1.6], ['geyser', 10, 4.0, 0.3],
    ['flat', 4], ['rockfall', 12, 5, 8], ['hills', 22, 2.2, 1], ['flat', 6], ['lift', 6.2, 3.5, 7], ['flat', 4],
    ['speed', 5], ['bumps', 12, 0.35, 3], ['speed', 7], ['slope', 14, -3.5], ['crumble', 10, 0.5], ['flat', 12],
    ['coins', 4, 2.4, 1.6], ['ferry', 14, 7], ['flat', 14], ['jump', 5.5, 1.0, -1.4], ['flat', 6], ['finish'],
  ]),
  L('Volcano Finale', 'volcanoDusk', ['vase', 'jelly', 'tv', 'crate'], 3, 49, [
    ['flat', 10], ['jump', 5.5, 1.0, -1.2], ['flat', 6], ['geyser', 10, 3.8, 0.4], ['flat', 6], ['crumble', 10, 0.5], ['flat', 4],
    ['coins', 5, 2.2, 1.6], ['rockfall', 12, 5, 9], ['hills', 22, 2.2, 1], ['flat', 8], ['hammer', 12, 0.5, 3.6],
    ['flat', 4], ['speed', 5], ['rough', 16, 0.4], ['speed', 7], ['ferry', 13, 7], ['flat', 4],
    ['geyser', 10, 3.6, 0.1], ['geyser', 10, 3.6, 0.6], ['flat', 4], ['coins', 4, 2.4, 1.6], ['sign', 'boulder'],
    ['flat', 4], ['chase', 0.3, 1.5, 16], ['speed', 8], ['slope', 20, -3], ['crumble', 10, 0.5], ['flat', 8],
    ['jump', 5.5, 1.0, -1.6], ['flat', 4], ['slope', 16, -2.4], ['sign', 'home'], ['flat', 8], ['finish'],
  ]),

  // ---------------- MOON BASE ----------------
  L('One Small Step', 'moon', ['crate', 'box', 'crate', 'box'], 3, 39, [
    ['sign', 'moon'], ['flat', 10], ['hills', 24, 2, 1], ['coins', 5, 2.4, 2.2], ['flat', 4], ['jump', 6, 1.0, -1.0],
    ['flat', 4], ['speed', 5], ['bumps', 12, 0.3, 3], ['speed', 6.5], ['slope', 16, 3], ['flat', 3],
    ['slope', 16, -3], ['coins', 4, 2.6, 2.2], ['jump', 8, 1.1, -1.6], ['flat', 4], ['speed', 5],
    ['rough', 14, 0.35], ['speed', 6.5], ['hills', 22, 2, 1], ['flat', 6], ['finish'],
  ], MOON),
  L('Floaty Fields', 'moon', ['crate', 'box', 'barrel', 'crate'], 3, 30, [
    ['sign', 'lowgrav'], ['flat', 8], ['lowgrav', 30, 0.45], ['flat', 6], ['hills', 24, 1.6, 1], ['coins', 5, 2.4, 2.4],
    ['flat', 6], ['speed', 5], ['bumps', 12, 0.3, 3], ['speed', 6.5], ['flat', 6], ['lowgrav', 34, 0.4],
    ['flat', 4], ['jump', 7, 1.0, -1.2], ['flat', 8], ['coins', 4, 2.6, 2.2], ['slope', 14, -2.4],
    ['lowgrav', 24, 0.5], ['hills', 24, 1.6, 1], ['flat', 6], ['finish'],
  ], MOON),
  L('Alien Pickup', 'moon', ['alien', 'alien', 'alien', 'alien'], 3, 40, [
    ['sign', 'careful'], ['flat', 8], ['speed', 5], ['bumps', 12, 0.3, 3], ['speed', 6.5], ['hills', 22, 2, 1],
    ['coins', 5, 2.4, 2.2], ['flat', 4], ['jump', 6, 1.0, -1.0], ['flat', 6], ['lowgrav', 26, 0.5],
    ['hills', 26, 1.8, 1], ['step', -0.9], ['flat', 4], ['coins', 4, 2.6, 2.2], ['speed', 5], ['rough', 14, 0.35],
    ['speed', 6.5], ['slope', 14, 2.4], ['flat', 2], ['slope', 14, -2.4], ['flat', 6], ['finish'],
  ], MOON),
  L('Meteor Shower', 'moon', ['crate', 'box', 'crate', 'tv'], 3, 41, [
    ['sign', 'meteors'], ['flat', 6], ['meteors', 8, 24, 7, 0.8], ['flat', 30], ['coins', 5, 2.4, 2.2],
    ['hills', 22, 2, 1], ['flat', 4], ['meteors', 6, 26, 8, 0.7], ['flat', 6], ['speed', 5], ['bumps', 12, 0.3, 3],
    ['speed', 6.5], ['flat', 12], ['jump', 6, 1.0, -1.0], ['flat', 4], ['coins', 4, 2.6, 2.2],
    ['meteors', 6, 24, 8, 0.65], ['hills', 26, 1.8, 1], ['flat', 10], ['finish'],
  ], MOON),
  L('Piston Press', 'moonDeep', ['crate', 'box', 'crate', 'box'], 3, 32, [
    ['sign', 'piston'], ['flat', 10], ['piston', 9, 3.4, 0], ['flat', 6], ['coins', 5, 2.4, 2.2],
    ['hills', 22, 2, 1], ['flat', 8], ['piston', 9, 3.2, 0.5], ['piston', 9, 3.2, 0.1], ['flat', 4],
    ['speed', 5], ['bumps', 12, 0.3, 3], ['speed', 6.5], ['flat', 8], ['piston', 9, 3.0, 0.3], ['flat', 4],
    ['coins', 4, 2.6, 2.2], ['jump', 6, 1.0, -1.0], ['flat', 8], ['piston', 9, 3.0, 0.8], ['flat', 6], ['finish'],
  ], MOON),
  L('Crystal Caves', 'moonDeep', ['crystal', 'crystal', 'crystal', 'crystal'], 3, 33, [
    ['sign', 'fragile'], ['flat', 8], ['hills', 20, 1.6, 1], ['step', -0.7], ['flat', 6], ['coins', 5, 2.4, 2.2],
    ['speed', 4.5], ['rough', 16, 0.35], ['speed', 6.5], ['flat', 6], ['lowgrav', 24, 0.5], ['hills', 24, 1.8, 1],
    ['flat', 6], ['piston', 9, 3.4, 0.4], ['flat', 4], ['speed', 4.5], ['bumps', 12, 0.3, 3], ['speed', 6.5],
    ['coins', 4, 2.6, 2.2], ['slope', 14, -2.2], ['step', -0.7], ['flat', 4], ['hills', 20, 1.6, 1], ['flat', 6], ['finish'],
  ], MOON),
  L('Crater Hopper', 'moon', ['crate', 'alien', 'crate'], 2, 48, [
    ['sign', 'jump'], ['flat', 12], ['jump', 5, 0.9, -1.0], ['flat', 4], ['coins', 5, 2.4, 2.2],
    ['meteors', 8, 24, 7, 0.75], ['flat', 36], ['jump', 5.5, 1.0, -1.4], ['flat', 6], ['lowgrav', 30, 0.5],
    ['hills', 30, 2, 1], ['flat', 4], ['speed', 5], ['bumps', 12, 0.3, 3], ['speed', 6.5], ['flat', 4],
    ['coins', 4, 2.6, 2.2], ['flat', 10], ['jump', 6, 1.1, -2.0], ['flat', 6], ['slope', 14, -2], ['flat', 6], ['finish'],
  ], MOON),
  L('Deep Space', 'moonDeep', ['crystal', 'alien', 'crate', 'box'], 3, 49, [
    ['flat', 10], ['piston', 9, 3.2, 0.2], ['flat', 6], ['meteors', 8, 24, 8, 0.7], ['flat', 12],
    ['coins', 5, 2.4, 2.2], ['ferry', 14, 7], ['flat', 6], ['lowgrav', 28, 0.45], ['hills', 28, 2, 1],
    ['flat', 8], ['piston', 9, 3.0, 0.6], ['piston', 9, 3.0, 0.2], ['flat', 4], ['speed', 5], ['bumps', 12, 0.25, 3],
    ['speed', 6.5], ['coins', 4, 2.6, 2.2], ['flat', 12], ['jump', 5, 0.9, -1.0], ['flat', 6], ['bridge', 14], ['flat', 6], ['finish'],
  ], MOON),
  L('Zero-G Gauntlet', 'moonDeep', ['jelly', 'alien', 'crystal', 'egg'], 3, 46, [
    ['flat', 12], ['lowgrav', 20, 0.45], ['speed', 5], ['bumps', 12, 0.25, 3], ['speed', 6.5], ['flat', 12],
    ['piston', 9, 3.2, 0.4], ['flat', 4], ['coins', 5, 2.4, 2.2], ['meteors', 8, 26, 8, 0.7], ['hills', 26, 2, 1],
    ['flat', 8], ['piston', 9, 3.0, 0.5], ['flat', 4], ['seesaw', 12], ['flat', 4], ['lowgrav', 26, 0.45],
    ['hills', 26, 1.6, 1], ['flat', 8], ['coins', 4, 2.6, 2.2], ['lift', 6.2, 3.5, 7], ['flat', 4],
    ['slope', 16, -3.5], ['flat', 6], ['finish'],
  ], MOON),
  L('Moon Base Finale', 'moonDeep', ['crystal', 'alien', 'vase', 'egg'], 3, 65, [
    ['flat', 8], ['hills', 22, 1.8, 1], ['flat', 8], ['piston', 9, 3.2, 0.3], ['flat', 4],
    ['meteors', 8, 26, 8, 0.7], ['hills', 26, 2, 1], ['flat', 6], ['coins', 5, 2.4, 2.2], ['ferry', 14, 7],
    ['flat', 6], ['lowgrav', 28, 0.45], ['speed', 5], ['bumps', 12, 0.3, 3], ['speed', 6.5], ['flat', 8], ['crumble', 10, 0.5],
    ['flat', 8], ['hammer', 12, 0.6, 3.6], ['flat', 4], ['piston', 9, 3.0, 0.1], ['piston', 9, 3.0, 0.6],
    ['flat', 4], ['coins', 4, 2.6, 2.2], ['meteors', 6, 24, 8, 0.65], ['hills', 24, 1.8, 1], ['flat', 4],
    ['speed', 5], ['rough', 14, 0.3], ['speed', 6.5], ['flat', 4], ['sign', 'home'], ['flat', 8], ['finish'],
  ], MOON),
];

export const LEVELS = RAW.map((l, i) => ({ ...l, id: i + 1, seed: 1000 + i * 37 }));

export function worldOf(id) {
  return Math.floor((id - 1) / 10);
}
