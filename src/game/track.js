import { mulberry32, smooth, clamp } from '../core/rng.js';
import { GRAVITY } from './constants.js';

const WALL = 40;

// Builds terrain polylines + object placements from a compact list of ops:
//   ['flat', 12], ['hills', 30, 2, 1], ['jump', 6], ['sign', 'drive'], ...
// Periodic hazards share their timing with the sim and the autopilot.
// geyser: 0 idle, 1 bubbling (warning), 2 erupting
export function geyserState(o, t) {
  const u = (((t / o.period + o.phase) % 1) + 1) % 1;
  const e = GEYSER_ERUPT / o.period, w = GEYSER_WARN / o.period;
  if (u < e) return 2;
  if (u > 1 - w) return 1;
  return 0;
}
export const GEYSER_ERUPT = 1.2;
export const GEYSER_WARN = 1.0;

// piston head height above the road (before any blocking): up, slam, hold, rise
export const PISTON_UP = 5.2;
export function pistonHeight(o, t) {
  const u = ((((t / o.period + o.phase) % 1) + 1) % 1) * o.period;
  const slam = 0.3, hold = 0.45, rise = 1.1;
  if (u < slam) return PISTON_UP * (1 - (u / slam) * (u / slam));
  if (u < slam + hold) return 0;
  if (u < slam + hold + rise) { const k = (u - slam - hold) / rise; return PISTON_UP * k * k * (3 - 2 * k); }
  return PISTON_UP;
}

export class TrackBuilder {
  constructor(seed = 1, grav = 1) {
    this.grav = grav;
    this.rand = mulberry32(seed);
    this.chains = [];
    this.objects = [];
    this.coinSpecs = [];
    this.signs = [];
    this.hints = [];
    this.pits = [];
    this.zones = [];
    this.material = 'ground';
    this.x = -22;
    this.y = 0;
    this.botSpeed = 7;
    this.cur = { pts: [] };
    this.chains.push(this.cur);
    this.cur.pts.push({ x: this.x, y: this.y + 14, m: 'ground' });
    this.cur.pts.push({ x: this.x, y: this.y, m: this.material });
    this.flat(28);
    this.hints.push({ x: -100, v: this.botSpeed });
  }

  pt(x, y) {
    this.cur.pts.push({ x, y, m: this.material });
    this.x = x;
    this.y = y;
  }

  curve(len, fn, step = 0.5) {
    const x0 = this.x, y0 = this.y;
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.pt(x0 + len * t, y0 + fn(t));
    }
  }

  flat(len) {
    const n = Math.max(1, Math.round(len / 4));
    const x0 = this.x;
    for (let i = 1; i <= n; i++) this.pt(x0 + (len * i) / n, this.y);
  }

  slope(len, dy) { this.curve(len, (t) => dy * smooth(t)); }

  hills(len, amp, n = 1) { this.curve(len, (t) => (amp * (1 - Math.cos(Math.PI * 2 * n * t))) / 2); }

  bumps(len, h, n = 3) {
    this.curve(len, (t) => {
      const u = (t * n) % 1;
      if (u < 0.2 || u > 0.8) return 0;
      const s = Math.sin((Math.PI * (u - 0.2)) / 0.6);
      return h * s * s;
    }, 0.25);
  }

  rough(len, amp) {
    const p1 = this.rand() * 6, p2 = this.rand() * 6, p3 = this.rand() * 6;
    this.curve(len, (t) => {
      const x = t * len;
      const env = Math.sin(Math.PI * t);
      return amp * env * (0.55 * Math.sin(x * 0.9 + p1) + 0.3 * Math.sin(x * 1.7 + p2) + 0.15 * Math.sin(x * 3.1 + p3));
    }, 0.35);
  }

  ramp(len, h) { this.curve(len, (t) => h * t * t, 0.4); }

  step(h) {
    // a small ledge with a rounded lip
    this.curve(1.2, (t) => h * smooth(t), 0.2);
  }

  endChain() {
    this.cur.pts.push({ x: this.x, y: this.y - WALL, m: 'ground' });
  }

  startChain(x, y) {
    this.cur = { pts: [] };
    this.chains.push(this.cur);
    this.cur.pts.push({ x, y: y - WALL, m: 'ground' });
    this.cur.pts.push({ x, y, m: this.material });
    this.x = x;
    this.y = y;
  }

  gap(w, dy = 0) {
    const x0 = this.x, y0 = this.y;
    this.endChain();
    this.pits.push({ x0, x1: x0 + w, y0, y1: y0 + dy });
    this.startChain(x0 + w, y0 + dy);
  }

  // kicker ramp -> gap -> downhill landing. Computes the speed the autopilot needs.
  jump(gapW = 5, rampH = 1.0, landDy = -1.2, rampLen = 7) {
    this.flat(2);
    this.ramp(rampLen, rampH);
    const ang = Math.atan((2 * rampH) / rampLen);
    const x0 = this.x, y0 = this.y;
    this.gap(gapW, landDy);
    this.slope(12, -2.2);
    // minimum launch speed so the rear wheel clears the far edge
    const need = (dx, dy) => {
      const c = Math.cos(ang), g = -GRAVITY * this.grav;
      const denom = 2 * c * c * (dx * Math.tan(ang) - dy);
      return denom > 0 ? Math.sqrt((g * dx * dx) / denom) : 14;
    };
    const v = clamp(need(gapW + 3.2, landDy + 0.4) * 1.12, 6, 13.5);
    this.hintRange(x0 - rampLen - 8, x0 + gapW + 10, v);
    // coin arc along the flight path
    const g = -GRAVITY * this.grav;
    for (let i = 1; i <= 4; i++) {
      const dx = (gapW + 2) * (i / 5);
      const t = dx / (v * Math.cos(ang));
      this.coinSpecs.push({ x: x0 + dx, y: y0 + v * Math.sin(ang) * t - 0.5 * g * t * t + 1.6, abs: true });
    }
  }

  hintRange(x0, x1, v) {
    this.hints.push({ x: x0, v });
    this.hints.push({ x: x1, v: this.botSpeed });
  }

  speed(v) {
    this.botSpeed = v;
    this.hints.push({ x: this.x, v });
  }

  bridge(w = 10) {
    const x0 = this.x, y0 = this.y;
    this.gap(w, 0);
    this.pits[this.pits.length - 1].bridge = true;
    this.objects.push({ type: 'bridge', x0, x1: x0 + w, y: y0, n: Math.max(4, Math.round(w / 0.85)) });
    this.hintRange(x0 - 6, x0 + w + 3, Math.min(this.botSpeed, 5.5));
  }

  ferry(w = 12, period = 7) {
    const x0 = this.x, y0 = this.y;
    this.gap(w, 0);
    const pw = 5.2;
    this.objects.push({ type: 'ferry', ax: x0 + pw / 2 + 0.05, bx: x0 + w - pw / 2 - 0.05, y: y0, w: pw, period });
    this.hintRange(x0 - 8, x0 + w + 3, 4.5);
  }

  lift(w = 6, dy = 4, period = 7) {
    const x0 = this.x, y0 = this.y;
    this.gap(w, dy);
    const pw = w - 0.1;
    this.objects.push({ type: 'lift', x: x0 + w / 2, ay: y0, by: y0 + dy, w: pw, period });
    this.hintRange(x0 - 8, x0 + w + 3, 3.5);
  }

  seesaw(len = 10) {
    const x0 = this.x;
    this.flat(len);
    this.objects.push({ type: 'seesaw', x: x0 + len / 2, y: this.y, len: len - 2.2 });
    this.hintRange(x0 - 5, x0 + len + 2, 4.2);
  }

  logs(len = 12, n = 3, r = 0.28) {
    const x0 = this.x;
    this.flat(len);
    for (let i = 0; i < n; i++) {
      this.objects.push({ type: 'log', x: x0 + ((i + 0.5) * len) / n, y: this.y - r * 0.3, r });
    }
    this.hintRange(x0 - 4, x0 + len, Math.min(this.botSpeed, 5));
  }

  rollers(len = 12, n = 3) {
    const x0 = this.x;
    this.flat(len);
    for (let i = 0; i < n; i++) {
      this.objects.push({ type: 'roller', x: x0 + 2 + ((i + 0.5) * (len - 4)) / n, y: this.y + 0.36, r: 0.34 });
    }
  }

  stack(rows = 3, cols = 2) {
    const x0 = this.x;
    this.flat(9);
    this.objects.push({ type: 'stack', x: x0 + 5, y: this.y, rows, cols, size: 0.72 });
  }

  hammer(len = 10, phase = 0, period = 3.6) {
    const x0 = this.x;
    this.flat(len);
    this.objects.push({ type: 'hammer', x: x0 + len / 2, y: this.y, phase, period });
  }

  bouncer(len = 6, power = 9.5) {
    const x0 = this.x;
    this.flat(len);
    this.objects.push({ type: 'bouncer', x: x0 + len / 2, y: this.y, w: 2.4, power });
    this.hintRange(x0 - 5, x0 + len + 4, 6);
  }

  boost(len = 10, power = 55) {
    const x0 = this.x;
    this.flat(len);
    this.objects.push({ type: 'boost', x0: x0 + 1, x1: x0 + len - 1, y: this.y, power });
  }

  wind(len, fx, fy = 0) {
    this.zones.push({ type: 'wind', x0: this.x, x1: this.x + len, fx, fy });
  }

  chase(delay = 0.4, r = 1.3, back = 16) {
    this.objects.push({ type: 'chase', trigger: this.x, dx: -back, r, delay });
  }

  rockfall(ahead = 12, n = 4, spread = 8) {
    this.objects.push({ type: 'rockfall', trigger: this.x, x: this.x + ahead, n, spread });
  }

  // steam vent: throws the truck and its load upwards while erupting
  geyser(len = 10, period = 4.2, phase = 0, power = 1) {
    const x0 = this.x;
    this.flat(len);
    this.objects.push({ type: 'geyser', x: x0 + len / 2, y: this.y, w: 1.9, period, phase, power });
  }

  // stone slabs across a pit that drop shortly after the truck touches them: keep moving!
  crumble(w = 10, delay = 0.55) {
    const x0 = this.x, y0 = this.y;
    this.gap(w, 0);
    this.pits[this.pits.length - 1].crumble = true;
    const n = Math.max(3, Math.round(w / 1.3));
    this.objects.push({ type: 'crumble', x0, x1: x0 + w, y: y0, n, delay });
    this.hintRange(x0 - 7, x0 + w + 2, Math.max(this.botSpeed, 6.5));
  }

  // hydraulic stamp that slams onto the road on a timer
  piston(len = 9, period = 3.4, phase = 0) {
    const x0 = this.x;
    this.flat(len);
    this.objects.push({ type: 'piston', x: x0 + len / 2, y: this.y, w: 2.4, period, phase });
  }

  // meteors rain on a stretch of road ahead once the truck passes this point
  meteors(ahead = 8, len = 24, n = 8, every = 0.75) {
    this.objects.push({ type: 'meteors', trigger: this.x, x: this.x + ahead, len, n, every });
  }

  // anti-gravity field: everything floats more inside
  lowgrav(len, k = 0.35) {
    this.zones.push({ type: 'lowgrav', x0: this.x, x1: this.x + len, k });
  }

  ice() { this.material = 'ice'; }
  ground() { this.material = 'ground'; }

  sign(kind) { this.signs.push({ x: this.x + 2.5, kind }); }

  coins(n = 5, spacing = 2.4, h = 1.7) {
    for (let i = 0; i < n; i++) this.coinSpecs.push({ x: this.x + 2 + i * spacing, h });
  }

  finish() {
    this.speed(Math.min(this.botSpeed, 8));
    this.flat(10);
    this.finishX = this.x + 2;
    this.flat(34);
    this.pt(this.x, this.y + 14);
  }

  groundAt(x) {
    for (const c of this.chains) {
      const p = c.pts;
      if (x < p[1].x || x > p[p.length - 2].x) continue;
      for (let i = 1; i < p.length - 2; i++) {
        const a = p[i], b = p[i + 1];
        if (x >= a.x && x <= b.x && b.x > a.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
      }
    }
    return null;
  }

  result() {
    const coins = [];
    for (const c of this.coinSpecs) {
      if (c.abs) { coins.push({ x: c.x, y: c.y }); continue; }
      const gy = this.groundAt(c.x);
      if (gy != null && c.x < this.finishX) coins.push({ x: c.x, y: gy + c.h });
    }
    let minY = Infinity, maxY = -Infinity;
    for (const c of this.chains) {
      for (let i = 1; i < c.pts.length - 1; i++) {
        minY = Math.min(minY, c.pts[i].y);
        maxY = Math.max(maxY, c.pts[i].y);
      }
    }
    for (const s of this.signs) s.y = this.groundAt(s.x) ?? this.y;
    return {
      chains: this.chains.map((c) => c.pts),
      objects: this.objects,
      coins,
      signs: this.signs,
      hints: this.hints.sort((a, b) => a.x - b.x),
      pits: this.pits,
      zones: this.zones,
      finishX: this.finishX,
      endX: this.x,
      finishY: this.groundAt(this.finishX),
      minY,
      maxY,
      killY: minY - 14,
    };
  }
}

export function buildTrack(ops, seed = 1, grav = 1) {
  const b = new TrackBuilder(seed, grav);
  for (const op of ops) {
    const [name, ...args] = op;
    if (typeof b[name] !== 'function') throw new Error('Unknown track op ' + name);
    b[name](...args);
  }
  if (b.finishX == null) b.finish();
  return b.result();
}
