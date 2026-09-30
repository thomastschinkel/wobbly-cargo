import { TRUCK } from './vehicle.js';
import { geyserState, pistonHeight } from './track.js';

// Simple autopilot: follows the track's speed hints and levels the truck in the air.
// Used for the title-screen demo and to prove every level can be delivered.
export class Bot {
  constructor(sim, speedMul = 1) {
    this.sim = sim;
    this.mul = speedMul;
    this.hi = 0;
    this.holdT = 0;
    this.holdX = -1e9;
    this.forceUntil = -1;
  }

  // waiting at a timed hazard: if no safe window shows up for a long while, just go for it
  hold(r) {
    const s = this.sim;
    if (s.time < this.forceUntil) return { gas: 1, brake: 0 };
    if (!r) return r;
    const x = s.truck.chassis.getPosition().x;
    if (x > this.holdX + 0.5) { this.holdX = x; this.holdT = 0; return r; }
    this.holdT += 1 / 60;
    if (this.holdT > 9) { this.holdT = 0; this.forceUntil = s.time + 3; }
    return r;
  }

  targetSpeed(x) {
    const h = this.sim.track.hints;
    let v = 7;
    for (let i = 0; i < h.length; i++) {
      if (h[i].x <= x) v = h[i].v; else break;
    }
    // look ahead a little so it slows before obstacles
    for (let i = 0; i < h.length; i++) {
      if (h[i].x > x && h[i].x < x + 7 && h[i].v < v) v = h[i].v;
    }
    v *= this.mul;
    // never dawdle on crumbling slabs
    for (const pit of this.sim.track.pits) {
      if (pit.crumble && x + TRUCK.front.x > pit.x0 - 1.5 && x + TRUCK.rear.x < pit.x1 + 0.5) v = Math.max(v, 6.5);
    }
    return v;
  }

  input() {
    const s = this.sim;
    const ch = s.truck.chassis;
    const p = ch.getPosition();
    const fwd = s.fwdSpeed();
    const angle = ch.getAngle();
    let gas = 0, brake = 0;
    if (!s.grounded && s.airT > 0.1) {
      const v = ch.getLinearVelocity();
      // average the ground slope ahead (steps/edges would otherwise read as walls)
      let land = 0;
      for (let i = 0; i < 5; i++) land += s.slopeAt(p.x + v.x * (0.2 + i * 0.1)) / 5;
      land = Math.max(-0.35, Math.min(0.35, land));
      const err = angle - land;
      const w = ch.getAngularVelocity();
      const pred = err + w * 0.25;
      if (pred > 0.16) brake = 1; else if (pred < -0.16) gas = 1;
      return { gas, brake };
    }
    // timed hazards: wait for the first one that says no, otherwise drive through
    let go = null;
    const timed = (r) => { if (r && !r.gas) return r; if (r) go = r; return null; };
    for (const o of s.objs) {
      if (o.type !== 'geyser') continue;
      const r = timed(this.hold(this.timedCheck(o.x, o.w / 2 + 0.35, (t) => geyserState(o, t) === 2, p.x, fwd)));
      if (r) return r;
    }
    for (const k of s.kinematics) {
      if (k.type !== 'piston') continue;
      const r = timed(this.hold(this.timedCheck(k.x, k.w / 2 + 0.15, (t) => pistonHeight(k, t) < 3.3, p.x, fwd)));
      if (r) return r;
    }
    const m = this.meteorCheck(p.x, fwd);
    if (m) return m;
    for (const k of s.kinematics) {
      if (k.type === 'piston') continue;
      if (k.type === 'hammer') {
        const r = this.hold(this.hammerCheck(k, p.x, fwd));
        if (r) return r;
        continue;
      }
      const bp = k.body.getPosition();
      const left = bp.x - k.w / 2;
      const front = p.x + TRUCK.front.x + TRUCK.wheelR;
      const far = k.type === 'ferry' ? k.bx + k.w / 2 : k.x + k.w / 2;
      if (p.x + TRUCK.rear.x > far + 0.5) continue; // already past
      const startEdge = k.type === 'ferry' ? k.ax - k.w / 2 : k.x - k.w / 2;
      if (front < startEdge - 9) continue; // not there yet
      if (s.truckOn(k)) {
        if (k.st === 'B') return { gas: 1, brake: 0 };
        const rel = p.x - 0.35 - bp.x;
        const vr = fwd - k.body.getLinearVelocity().x;
        if (k.st === 'A' && rel < -0.3 && vr < 1) return { gas: 0.6, brake: 0 };
        if (vr > 0.5) return { gas: 0, brake: 1 };
        return { gas: 0, brake: 0 };
      }
      if (front < startEdge + 0.5) {
        // approach: only when the platform is waiting at our side
        const ready = k.st === 'A' && Math.abs(bp.x - (k.type === 'ferry' ? k.ax : k.x)) < 0.05;
        const dist = startEdge - front;
        if (!ready) return { gas: 0, brake: fwd > 0.1 || dist < 2 ? 1 : 0 };
        return { gas: fwd < 2.6 ? 1 : 0, brake: fwd > 3.2 ? 1 : 0 };
      }
      // partially on: crawl forward
      if (left < p.x && k.st === 'A') return { gas: fwd < 1.8 ? 0.7 : 0, brake: fwd > 2.4 ? 1 : 0 };
    }
    if (go) return go;
    const target = this.targetSpeed(p.x);
    if (fwd < target - 0.25) gas = 1;
    else if (fwd > target + 1.3) brake = 1;
    // avoid wheelies that would dump the cargo
    if (angle > 0.5 && gas) gas = 0;
    return { gas, brake };
  }
}

// Predict whether driving on now gets us past the swinging ball.
Bot.prototype.hammerCheck = function hammerCheck(k, x, fwd) {
  const s = this.sim;
  const c = k.x;
  const rearX = x + TRUCK.rear.x - 0.9, frontX = x + TRUCK.front.x + 0.7;
  if (rearX > c + 4.5 || frontX < c - 16) return null;
  const gy = s.groundAt(c) ?? 0;
  const w = (Math.PI * 2) / k.period;
  const vmax = 7.5, acc = 4.5 * s.gripK;
  const safeAt = (x0, v0, delay) => {
    for (let t = 0; t < 4.5; t += 0.05) {
      let xx;
      if (t < delay) xx = x0 + v0 * t;
      else {
        const tt = t - delay;
        const tv = Math.max(0, (vmax - v0) / acc);
        xx = x0 + v0 * delay + (tt < tv ? v0 * tt + 0.5 * acc * tt * tt : v0 * tv + 0.5 * acc * tv * tv + vmax * (tt - tv));
      }
      const ang = k.amp * Math.sin(w * (s.time + t) + k.phase * Math.PI * 2);
      const bx = c + 5.7 * Math.sin(ang);
      const by = gy + 8.3 - 5.7 * Math.cos(ang) - 0.72;
      const r0 = xx + TRUCK.rear.x - 0.9, f0 = xx + TRUCK.front.x + 0.7;
      if (by < gy + 2.9 && bx + 0.72 > r0 && bx - 0.72 < f0) return false;
      if (r0 > c + 4.5) return true;
    }
    return true;
  };
  if (safeAt(x, Math.max(0, fwd), 0)) return { gas: fwd < vmax ? 1 : 0, brake: 0 };
  // hold position well outside the swing
  const waitX = c - 9.5 - TRUCK.front.x;
  if (x < waitX - 0.3) return { gas: fwd < 3 && x < waitX - 3 ? 1 : 0, brake: fwd > 0.3 && x > waitX - 3 ? 1 : 0 };
  if (x > c - 2) return { gas: 1, brake: 0 }; // committed, get through
  // too close to time a run from standstill: back up to the waiting spot
  if (x > waitX + 0.6) return { gas: 0, brake: 1 };
  return { gas: 0, brake: fwd > 0.3 ? 1 : 0 };
};

// Full gas from here: position after t seconds.
function gasX(x, v0, t, acc = 4.5) {
  const vmax = 7.5;
  const tv = Math.max(0, (vmax - v0) / acc);
  return x + (t < tv ? v0 * t + 0.5 * acc * t * t : v0 * tv + 0.5 * acc * tv * tv + vmax * (t - tv));
}

// Periodic hazard over [c - half, c + half]: go if full gas clears it before a dangerous moment, else wait outside.
Bot.prototype.timedCheck = function timedCheck(c, half, danger, x, fwd) {
  const s = this.sim;
  const rOff = TRUCK.rear.x - 0.9, fOff = TRUCK.front.x + 0.7;
  if (x + rOff > c + half || x + fOff < c - half - 14) return null;
  const v0 = Math.max(0, fwd);
  let safe = true;
  for (let t = 0; t < 5; t += 0.04) {
    const xx = gasX(x, v0, t, 4.5 * s.gripK);
    if (xx + rOff > c + half) break;
    if (xx + fOff > c - half && danger(s.time + t)) { safe = false; break; }
  }
  if (safe) return { gas: fwd < 7.5 ? 1 : 0, brake: 0 };
  if (x + fOff > c - half + 0.4) return { gas: 1, brake: 0 }; // already underneath: get through
  const waitX = c - half - 2.2 - fOff;
  if (x < waitX - 0.3) return { gas: fwd < 3 && x < waitX - 3 ? 1 : 0, brake: fwd > 0.3 && x > waitX - 3 ? 1 : 0 };
  if (x > waitX + 0.6) return { gas: 0, brake: 1 };
  return { gas: 0, brake: fwd > 0.3 ? 1 : 0 };
};

// Incoming meteors fly in straight lines: brake if driving on would meet one.
Bot.prototype.meteorCheck = function meteorCheck(x, fwd) {
  const s = this.sim;
  const v0 = Math.max(0, fwd);
  const rOff = TRUCK.rear.x - 0.5, fOff = TRUCK.front.x + 0.5;
  const hits = (plan) => {
    for (const tr of s.triggers) {
      if (tr.type !== 'meteors') continue;
      for (const b of tr.bodies) {
        const u = b.getFixtureList().getUserData();
        if (u.dieAt) continue;
        const p = b.getPosition(), v = b.getLinearVelocity();
        for (let t = 0; t < 2; t += 0.04) {
          const mx = p.x + v.x * t, my = p.y + v.y * t;
          if (my < u.gy) break;
          const xx = plan(t);
          const gy = s.groundAt(xx) ?? u.gy;
          if (mx + u.r > xx + rOff && mx - u.r < xx + fOff && my - u.r < gy + 2.7) return true;
        }
      }
    }
    return false;
  };
  const acc = 4.5 * s.gripK, dec = 7 * s.gripK;
  if (!hits((t) => gasX(x, v0, t, acc))) return null;
  const stop = (t) => { const ts = Math.min(t, v0 / dec); return x + v0 * ts - 0.5 * dec * ts * ts; };
  if (!hits(stop)) return { gas: 0, brake: fwd > 0.2 ? 1 : 0 };
  return null;
};

export function runBot(sim, speedMul = 1, maxTime = 150) {
  const bot = new Bot(sim, speedMul);
  let steps = 0;
  while (sim.state === 'play' && sim.time < maxTime) {
    sim.step(bot.input());
    sim.events.length = 0;
    steps++;
  }
  return {
    state: sim.state,
    reason: sim.failReason,
    delivered: sim.state === 'finished' ? sim.delivered : sim.remaining(),
    total: sim.cargo.length,
    time: sim.state === 'finished' ? sim.finishTime : sim.runTime,
    x: sim.truck.chassis.getPosition().x,
    finishX: sim.track.finishX,
    coins: sim.coinsTaken,
    totalCoins: sim.coins.length,
    steps,
  };
}
