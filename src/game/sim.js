import { World, Vec2, Box, Circle, Polygon, Chain, RevoluteJoint } from 'planck';
import { DT, GRAVITY, VEL_ITERS, POS_ITERS, CAT, MATERIALS } from './constants.js';
import { CARGO, OUTLINES } from './cargoTypes.js';
import { TRUCK, createTruck } from './vehicle.js';
import { buildTrack, geyserState, pistonHeight, PISTON_UP } from './track.js';
import { mulberry32, clamp } from '../core/rng.js';

const GROUNDISH = new Set(['ground', 'plank', 'platform', 'log', 'roller', 'rock', 'junk', 'boulder', 'bouncer', 'seesaw', 'slab']);

function ud(f) { return f.getUserData() || {}; }

// Deterministic, DOM-free simulation of one delivery run. Used by the game, the title
// screen demo and the headless level validator.
export class Sim {
  constructor(level, opts = {}) {
    this.level = level;
    this.grav = level.grav || 1;
    this.g = GRAVITY * this.grav;
    this.gripK = 0.45 + 0.55 * this.grav;
    this.track = level.track || buildTrack(level.ops, level.seed || 1, this.grav);
    this.rand = mulberry32((level.seed || 1) * 7 + 3);
    this.world = new World({ gravity: Vec2(0, this.g) });
    this.warped = new Set();
    this.events = [];
    this.time = 0;
    this.runTime = 0;
    this.started = false;
    this.state = 'play';
    this.failReason = null;
    this.failTimer = -1;
    this.flipT = 0;
    this.stuckT = 0;
    this.airT = 0;
    this.grounded = true;
    this.throttle = 0;
    this.cmd = 0;
    this.input = { gas: 0, brake: 0 };
    this.coinsTaken = 0;
    this.maxAir = 0;
    this.kinematics = [];
    this.triggers = [];
    this.dynamic = [];
    this.pendingBreaks = [];
    this.pendingBounce = null;
    this.bounceCool = 0;
    this.shakeHint = 0;
    this.delivered = 0;
    this.finishTime = 0;
    this.quiet = true;

    this.buildGround();
    this.buildObjects();
    const spawnX = 0;
    const gy = this.groundAt(spawnX) ?? 0;
    this.truck = createTruck(this.world, spawnX, gy + TRUCK.wheelR - TRUCK.rear.y + 0.02);
    this.dynamic.push(this.truck.chassis, this.truck.rear, this.truck.front);
    this.spawnCargo(level.cargo);
    this.coins = this.track.coins.map((c, i) => ({ id: i, x: c.x, y: c.y, taken: false }));
    this.hookContacts();

    // settle springs and cargo so the run starts calm
    for (let i = 0; i < 45; i++) this.step({ gas: 0, brake: 0 }, true);
    this.events.length = 0;
    this.time = 0;
    this.quiet = false;
    this.snapshot();
  }

  // ---------- construction ----------
  buildGround() {
    const g = this.world.createBody({ type: 'static' });
    this.groundBody = g;
    for (const pts of this.track.chains) {
      const clean = [];
      for (const p of pts) {
        const last = clean[clean.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.02) clean.push(p);
      }
      // split into runs of equal material so ice can have its own friction
      let start = 0;
      for (let i = 1; i <= clean.length - 1; i++) {
        const endRun = i === clean.length - 1 || clean[i].m !== clean[start].m;
        if (!endRun) continue;
        const verts = clean.slice(start, i + 1).map((p) => Vec2(p.x, p.y));
        if (verts.length >= 2) {
          const shape = new Chain(verts, false);
          if (start > 0) shape.setPrevVertex(Vec2(clean[start - 1].x, clean[start - 1].y));
          if (i + 1 < clean.length) shape.setNextVertex(Vec2(clean[i + 1].x, clean[i + 1].y));
          const mat = MATERIALS[clean[start].m] || MATERIALS.ground;
          g.createFixture({
            shape, friction: mat.friction, restitution: 0,
            filterCategoryBits: CAT.GROUND, userData: { kind: 'ground', mat: clean[start].m },
          });
        }
        start = i;
      }
    }
  }

  groundAt(x) {
    for (const p of this.track.chains) {
      if (x < p[1].x || x > p[p.length - 2].x) continue;
      let lo = 1, hi = p.length - 2;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (p[mid].x <= x) lo = mid; else hi = mid;
      }
      for (let i = Math.max(1, lo - 1); i < Math.min(p.length - 2, lo + 2); i++) {
        const a = p[i], b = p[i + 1];
        if (x >= a.x && x <= b.x && b.x > a.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
      }
    }
    return null;
  }

  slopeAt(x) {
    const a = this.groundAt(x - 0.8), b = this.groundAt(x + 0.8);
    if (a == null || b == null) return 0;
    return Math.atan2(b - a, 1.6);
  }

  objFixture(body, shape, opt, kind) {
    return body.createFixture({
      shape, density: 1, friction: 0.9, restitution: 0.05,
      filterCategoryBits: CAT.OBJ, ...opt, userData: { kind, ...(opt.userData || {}) },
    });
  }

  buildObjects() {
    const w = this.world;
    this.objs = [];
    for (const o of this.track.objects) {
      const rec = { ...o, bodies: [] };
      this.objs.push(rec);
      if (o.type === 'bridge') {
        const pw = (o.x1 - o.x0) / o.n;
        let prev = this.groundBody;
        for (let i = 0; i < o.n; i++) {
          const b = w.createBody({ type: 'dynamic', position: Vec2(o.x0 + (i + 0.5) * pw, o.y - 0.13), angularDamping: 0.4, linearDamping: 0.05 });
          this.objFixture(b, new Box(pw / 2 - 0.03, 0.13), { density: 2.2, friction: 1.0 }, 'plank');
          w.createJoint(new RevoluteJoint({}, prev, b, Vec2(o.x0 + i * pw, o.y - 0.05)));
          prev = b;
          rec.bodies.push(b);
          this.dynamic.push(b);
        }
        w.createJoint(new RevoluteJoint({}, prev, this.groundBody, Vec2(o.x1, o.y - 0.05)));
      } else if (o.type === 'ferry' || o.type === 'lift') {
        const b = w.createBody({ type: 'kinematic', position: Vec2(o.type === 'ferry' ? o.ax : o.x, (o.type === 'ferry' ? o.y : o.ay) - 0.22) });
        this.objFixture(b, new Box(o.w / 2, 0.22), { friction: 1.0 }, 'platform');
        rec.bodies.push(b);
        rec.body = b;
        this.kinematics.push(rec);
        this.dynamic.push(b);
      } else if (o.type === 'seesaw') {
        const h = 0.66, th = 0.14, half = o.len / 2;
        const a = Math.asin((h - th) / half);
        const b = w.createBody({ type: 'dynamic', position: Vec2(o.x, o.y + h), angle: a, angularDamping: 0.6 });
        this.objFixture(b, new Box(half, th), { density: 1.4, friction: 1.0 }, 'seesaw');
        // referenceAngle 0: limits are absolute (plank rests on either end), not relative to the tilted start pose
        w.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: -a, upperAngle: a, referenceAngle: 0 }, this.groundBody, b, Vec2(o.x, o.y + h)));
        rec.bodies.push(b);
        rec.pivotY = o.y + h;
        this.dynamic.push(b);
      } else if (o.type === 'log') {
        this.groundBody.createFixture({ shape: new Circle(Vec2(o.x, o.y), o.r), friction: 0.9, filterCategoryBits: CAT.GROUND, userData: { kind: 'log' } });
      } else if (o.type === 'roller') {
        const b = w.createBody({ type: 'dynamic', position: Vec2(o.x, o.y), angularDamping: 0.8, linearDamping: 0.1 });
        this.objFixture(b, new Circle(o.r), { density: 0.9, friction: 0.9 }, 'roller');
        rec.bodies.push(b);
        this.dynamic.push(b);
      } else if (o.type === 'stack') {
        for (let r = 0; r < o.rows; r++) {
          for (let c = 0; c < o.cols; c++) {
            const b = w.createBody({ type: 'dynamic', position: Vec2(o.x + c * (o.size + 0.02), o.y + o.size / 2 + r * (o.size + 0.005)) });
            this.objFixture(b, new Box(o.size / 2, o.size / 2), { density: 0.16, friction: 0.6 }, 'junk');
            rec.bodies.push(b);
            this.dynamic.push(b);
          }
        }
      } else if (o.type === 'hammer') {
        const piv = Vec2(o.x, o.y + 8.3);
        const b = w.createBody({ type: 'kinematic', position: piv });
        this.objFixture(b, new Circle(Vec2(0, -5.7), 0.72), { friction: 0.4, restitution: 0.2 }, 'hammer');
        rec.bodies.push(b);
        rec.body = b;
        rec.amp = 0.82;
        this.kinematics.push(rec);
        this.dynamic.push(b);
      } else if (o.type === 'bouncer') {
        this.groundBody.createFixture({ shape: new Box(o.w / 2, 0.1, Vec2(o.x, o.y + 0.04), 0), friction: 0.9, filterCategoryBits: CAT.GROUND, userData: { kind: 'bouncer', power: o.power } });
      } else if (o.type === 'chase' || o.type === 'rockfall' || o.type === 'meteors') {
        this.triggers.push(rec);
      } else if (o.type === 'crumble') {
        const pw = (o.x1 - o.x0) / o.n;
        const idx = this.objs.length - 1;
        rec.slabs = [];
        for (let i = 0; i < o.n; i++) {
          const b = w.createBody({ type: 'kinematic', position: Vec2(o.x0 + (i + 0.5) * pw, o.y - 0.2) });
          this.objFixture(b, new Box(pw / 2 - 0.025, 0.2), { density: 2, friction: 1.0, userData: { slab: i, obj: idx } }, 'slab');
          rec.slabs.push({ body: b, fallAt: 0, fell: false });
          rec.bodies.push(b);
          this.dynamic.push(b);
        }
      } else if (o.type === 'piston') {
        rec.h = PISTON_UP;
        const b = w.createBody({ type: 'kinematic', position: Vec2(o.x, o.y + PISTON_UP + 0.55) });
        this.objFixture(b, new Box(o.w / 2, 0.55), { friction: 0.6 }, 'piston');
        rec.body = b;
        rec.bodies.push(b);
        this.kinematics.push(rec);
        this.dynamic.push(b);
      } else if (o.type === 'geyser') {
        rec.st = 0;
      }
    }
  }

  spawnCargo(list) {
    this.cargo = [];
    const bed0 = TRUCK.bed.x0 + 0.03, bed1 = TRUCK.bed.x1 - 0.03;
    const L = bed1 - bed0;
    // round and odd-shaped things go on the floor, flat-topped boxes can ride on top
    const rank = (d) => (d.shape === 'circle' ? 0 : d.shape === 'egg' || d.shape === 'capsule' ? 1 : d.shape === 'box' || d.shape === 'trap' ? 3 : 2);
    const items = list.map((t, i) => {
      const d = CARGO[t];
      const w = d.shape === 'circle' ? d.r * 2 : d.w;
      const h = d.shape === 'circle' ? d.r * 2 : d.h;
      return { t, d, w, h, i, boxy: d.shape === 'box' || d.shape === 'trap' };
    }).sort((a, b) => rank(a.d) - rank(b.d) || a.i - b.i);
    const rows = [];
    let row = [], rowW = 0;
    for (const it of items) {
      if (row.length && rowW + it.w + 0.04 > L) { rows.push(row); row = []; rowW = 0; }
      row.push(it);
      rowW += it.w + 0.04;
    }
    if (row.length) rows.push(row);
    const ch = this.truck.chassis.getPosition();
    let base = 0.004;
    let id = 0;
    let below = null;
    for (const r of rows) {
      const sumW = r.reduce((s, it) => s + it.w, 0);
      const gap = (L - sumW) / (r.length + 1);
      let x = bed0 + gap;
      let maxH = 0;
      const placed = [];
      // upper rows sit centred on boxy items of the row below when possible
      const supports = below ? below.filter((b) => b.boxy).sort((a, b) => b.lx - a.lx) : [];
      // no flat top left: nestle into the grooves between round things instead of balancing on one
      const low = below ? below.map((b) => b.lx).sort((a, b) => b - a) : [];
      const grooves = low.slice(1).map((v, i) => (v + low[i]) / 2);
      for (const it of r) {
        let lx = x + it.w / 2;
        x += it.w + gap;
        if (below) {
          const sup = supports.shift();
          if (sup) lx = sup.lx;
          else if (grooves.length) lx = grooves.shift();
        }
        const ly = base + it.h / 2;
        maxH = Math.max(maxH, it.h);
        placed.push({ ...it, lx });
        this.cargo.push(this.makeCargo(id++, it.t, ch.x + lx, ch.y + ly));
      }
      below = placed;
      base += maxH + 0.004;
    }
  }

  makeCargo(id, type, x, y) {
    const d = CARGO[type];
    const b = this.world.createBody({
      type: 'dynamic', position: Vec2(x, y), bullet: true, allowSleep: false,
      angularDamping: d.angularDamping ?? 0.2, linearDamping: d.linearDamping ?? 0.02,
    });
    let shape;
    if (d.shape === 'box') shape = new Box(d.w / 2, d.h / 2);
    else if (d.shape === 'circle') shape = new Circle(d.r);
    else if (d.shape === 'trap') shape = new Polygon([Vec2(-d.w / 2, -d.h / 2), Vec2(d.w / 2, -d.h / 2), Vec2(d.w * 0.36, d.h / 2), Vec2(-d.w * 0.36, d.h / 2)]);
    else if (d.shape === 'egg') {
      const v = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
        const s = Math.sin(a);
        v.push(Vec2((d.w / 2) * Math.cos(a) * (s > 0 ? 1 - 0.18 * s : 1), (d.h / 2) * s));
      }
      shape = new Polygon(v);
    } else if (OUTLINES[d.shape]) {
      shape = new Polygon(OUTLINES[d.shape].map(([px, py]) => Vec2(px * d.w, py * d.h)));
    } else if (d.shape === 'capsule') {
      const W = d.w, H = d.h;
      shape = new Polygon([[-0.36, -0.5], [0.36, -0.5], [0.5, -0.18], [0.46, 0.2], [0.28, 0.48], [-0.28, 0.48], [-0.46, 0.2], [-0.5, -0.18]].map(([px, py]) => Vec2(px * W, py * H)));
    }
    b.createFixture({
      shape, density: d.density, friction: d.friction, restitution: d.restitution,
      filterCategoryBits: CAT.CARGO, userData: { kind: 'cargo', id },
    });
    b.setUserData({ kind: 'cargo', id });
    const size = d.shape === 'circle' ? d.r * 2 : Math.max(d.w, d.h);
    const c = { id, type, def: d, body: b, lost: false, broken: false, outT: 0, ground: 0, lastHit: 0, area: size * size * 0.8, size, lostT: 0 };
    this.dynamic.push(b);
    return c;
  }

  hookContacts() {
    this.world.on('begin-contact', (contact) => {
      const fa = contact.getFixtureA(), fb = contact.getFixtureB();
      const a = ud(fa), b = ud(fb);
      this.onBegin(a, b, fa, fb, contact);
      this.onBegin(b, a, fb, fa, contact);
    });
    this.world.on('end-contact', (contact) => {
      const a = ud(contact.getFixtureA()), b = ud(contact.getFixtureB());
      if (a.kind === 'cargo' && GROUNDISH.has(b.kind)) this.cargo[a.id].ground--;
      if (b.kind === 'cargo' && GROUNDISH.has(a.kind)) this.cargo[b.id].ground--;
    });
    this.world.on('post-solve', (contact, imp) => {
      const n = contact.getManifold().pointCount;
      let j = 0;
      for (let i = 0; i < n; i++) j += imp.normalImpulses[i];
      if (j < 0.05) return;
      const fa = contact.getFixtureA(), fb = contact.getFixtureB();
      this.onImpulse(ud(fa), ud(fb), fa, fb, j, contact);
      this.onImpulse(ud(fb), ud(fa), fb, fa, j, contact);
    });
  }

  onBegin(a, b, fa, fb) {
    if (a.kind === 'cargo' && GROUNDISH.has(b.kind)) this.cargo[a.id].ground++;
    if (a.kind === 'rock' && (b.kind === 'ground' || b.kind === 'plank' || b.kind === 'log' || b.kind === 'slab') && !a.dieAt) a.dieAt = this.time + 0.35;
    if (a.kind === 'meteor' && b.kind !== 'meteor' && !a.dieAt) a.dieAt = this.time + (b.kind === 'ground' || b.kind === 'slab' ? 0.02 : 0.1);
    if (a.kind === 'slab' && (b.kind === 'wheel' || b.kind === 'truck')) {
      const o = this.objs[a.obj], sl = o.slabs[a.slab];
      if (!sl.fallAt) sl.fallAt = this.time + o.delay;
    }
    // a runaway boulder that catches up flattens the truck
    if (a.kind === 'boulder' && (b.kind === 'wheel' || b.kind === 'truck') && this.state === 'play') {
      const bv = fa.getBody().getLinearVelocity().x, tv = this.truck.chassis.getLinearVelocity().x;
      if (bv - tv > 1.2) this.squashed = true;
    }
    if ((a.kind === 'wheel' || a.kind === 'truck') && b.kind === 'bouncer' && this.bounceCool <= 0) {
      this.pendingBounce = b.power;
    }
  }

  onImpulse(a, b, fa, fb, j) {
    if (this.quiet) return;
    if (a.kind === 'cargo') {
      const c = this.cargo[a.id];
      if (!c || c.broken) return;
      const m = c.body.getMass();
      const dv = j / m;
      if (dv > 1.4 && this.time - c.lastHit > 0.12) {
        c.lastHit = this.time;
        const p = c.body.getPosition();
        this.events.push({ type: 'clunk', cargo: c.type, sound: c.def.sound, x: p.x, y: p.y, s: clamp(dv / 8, 0.1, 1), id: c.id });
      }
    } else if ((a.kind === 'wheel' || a.kind === 'truck') && GROUNDISH.has(b.kind)) {
      const s = j / 9.5;
      if (s > 0.55 && this.time - (this._lastLand || 0) > 0.18) {
        this._lastLand = this.time;
        const body = fa.getBody();
        const p = body.getPosition();
        this.events.push({ type: a.kind === 'truck' ? 'scrape' : 'land', x: p.x, y: p.y - (a.kind === 'wheel' ? TRUCK.wheelR : 0.4), s: clamp(s / 3, 0.15, 1) });
      }
    } else if (a.kind === 'hammer' && (b.kind === 'truck' || b.kind === 'cargo') && j > 1) {
      if (this.time - (this._lastBonk || 0) > 0.3) {
        this._lastBonk = this.time;
        const p = fb.getBody().getPosition();
        this.events.push({ type: 'bonk', x: p.x, y: p.y, s: clamp(j / 10, 0.3, 1) });
      }
    }
  }

  // ---------- per-step logic ----------
  snapshot() {
    for (const b of this.dynamic) {
      const p = b.getPosition();
      b.px = p.x; b.py = p.y; b.pa = b.getAngle();
    }
  }

  fwdSpeed() {
    const ch = this.truck.chassis;
    const v = ch.getLinearVelocity();
    const a = ch.getAngle();
    return v.x * Math.cos(a) + v.y * Math.sin(a);
  }

  wheelGrounded(w) {
    for (let ce = w.getContactList(); ce; ce = ce.next) {
      const c = ce.contact;
      if (!c.isTouching()) continue;
      const other = ce.other.getUserData();
      const fa = ud(c.getFixtureA()), fb = ud(c.getFixtureB());
      const k = fa.kind === 'wheel' ? fb.kind : fa.kind;
      if (GROUNDISH.has(k) || k === 'hammer') return true;
      if (other && other.kind === 'cargo') continue;
    }
    return false;
  }

  applyDrive(dt) {
    const T = TRUCK;
    const inp = this.input;
    const gas = this.state === 'play' ? inp.gas : 0;
    const brake = this.state === 'finished' ? 1 : this.state === 'play' ? inp.brake : 0.4;
    if (gas > 0) this.throttle = Math.min(1, this.throttle + T.throttleRise * dt);
    else this.throttle = Math.max(0, this.throttle - T.throttleFall * dt);
    const fwd = this.fwdSpeed();
    if (!(gas > 0)) this.cmd = Math.max(0, fwd);
    if (!(brake > 0)) this.brakeCmd = Math.max(0, fwd);
    let speed, torque;
    const vmax = T.maxWheelSpeed * T.wheelR;
    if (gas > 0 && this.grounded) {
      // commanded speed ramps at a limited rate so a loaded truck pulls away smoothly;
      // on climbs the command stays just ahead of the real speed and full torque applies
      // less grip in low gravity: gentler pull-away and braking so the load doesn't slide straight off
      const acc = T.accel * (0.45 + 0.55 * this.throttle) * gas * this.gripK;
      this.cmd = Math.max(this.cmd, fwd - 0.3);
      this.cmd = Math.min(this.cmd + acc * dt, Math.max(fwd, 0) + T.slipLead, vmax);
      speed = -this.cmd / T.wheelR;
      torque = T.driveTorque * gas;
    } else if (gas > 0) {
      this.cmd = Math.max(0, fwd);
      speed = -T.maxWheelSpeed;
      torque = T.driveTorque * 0.35 * gas;
    } else if (brake > 0) {
      if (fwd > 0.7 || this.state !== 'play') {
        // progressive braking: wheels slow at a capped rate instead of locking instantly
        this.brakeCmd = Math.max(0, Math.min(this.brakeCmd ?? fwd, fwd + 0.3) - T.brakeDecel * brake * this.gripK * dt);
        speed = this.grounded ? -this.brakeCmd / T.wheelR : 0;
        torque = T.brakeTorque * brake;
      }
      else { speed = T.reverseSpeed; torque = T.reverseTorque * brake; }
    } else {
      // coasting; nearly stopped -> parking hold so platforms and slopes don't drag it away
      speed = 0;
      torque = Math.abs(fwd) < 0.8 && this.grounded ? T.holdTorque : T.idleTorque;
    }
    for (const j of [this.truck.rearJoint, this.truck.frontJoint]) {
      j.setMotorSpeed(speed);
      j.setMaxMotorTorque(torque);
    }
    const rg = this.wheelGrounded(this.truck.rear), fg = this.wheelGrounded(this.truck.front);
    this.grounded = rg || fg;
    this.rearGrounded = rg;
    this.frontGrounded = fg;
    if (this.grounded) this.airT = 0; else this.airT += dt;
    if (this.airT > 0.06 && this.state === 'play') {
      const dir = (gas > 0 ? 1 : 0) - (brake > 0 ? 1 : 0);
      const ch = this.truck.chassis;
      const w = ch.getAngularVelocity();
      if (dir !== 0 && (Math.sign(w) !== dir || Math.abs(w) < T.airMaxSpin)) ch.applyTorque(dir * T.airTorque, true);
      // gentle air assist: damp spin and ease the truck towards level so casual jumps land wheels-first
      const a = ch.getAngle();
      ch.applyTorque(-(a * T.airLevel + w * T.airDamp) * (dir !== 0 ? 0.35 : 1), true);
    }
  }

  updateKinematics(t) {
    for (const k of this.kinematics) {
      const b = k.body;
      if (k.type === 'hammer') {
        const w = (Math.PI * 2) / k.period;
        const ang = k.amp * Math.sin(w * (t + DT) + k.phase * Math.PI * 2);
        const cur = b.getAngle();
        b.setAngularVelocity((ang - cur) / DT);
        continue;
      }
      if (k.type === 'piston') { this.updatePiston(k, t); continue; }
      const f = this.platformPhase(k);
      let tx, ty;
      if (k.type === 'ferry') { tx = k.ax + (k.bx - k.ax) * f; ty = k.y - 0.22; }
      else { tx = k.x; ty = k.ay + (k.by - k.ay) * f - 0.22; }
      const p = b.getPosition();
      b.setLinearVelocity(Vec2((tx - p.x) / DT, (ty - p.y) / DT));
    }
  }

  // The stamp never crushes anything into the road: it stops on whatever is underneath and flings the load.
  updatePiston(k, t) {
    let h = pistonHeight(k, t + DT);
    // after a hit the head springs back up a little so the flung load can fly clear
    if (k.reboundT > t) h = Math.min(PISTON_UP, k.h + 7 * DT);
    else if (h < k.h - 1e-4) {
      const top = this.topUnder(k.x - k.w / 2, k.x + k.w / 2) - k.y;
      if (top > h - 0.02) {
        h = Math.min(k.h, top + 0.02);
        if (!k.hit && !this.quiet) { k.hit = true; k.reboundT = t + 0.3; this.pistonHit(k); }
      }
      if (h <= 0.001 && !this.quiet) this.nearEvent({ type: 'piston', x: k.x, y: k.y });
    }
    if (h > PISTON_UP - 0.05) k.hit = false;
    const p = k.body.getPosition();
    k.h = h;
    k.body.setLinearVelocity(Vec2(0, (k.y + h + 0.55 - p.y) / DT));
  }

  topUnder(x0, x1) {
    const t = this.truck;
    const bodies = [t.chassis, t.rear, t.front];
    for (const c of this.cargo) if (!c.broken) bodies.push(c.body);
    let top = -1e9;
    for (const b of bodies) {
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        const bb = f.getAABB(0);
        if (bb.upperBound.x < x0 || bb.lowerBound.x > x1) continue;
        top = Math.max(top, bb.upperBound.y);
      }
    }
    return top;
  }

  pistonHit(k) {
    for (const c of this.cargo) {
      if (c.lost) continue;
      const p = c.body.getPosition();
      if (Math.abs(p.x - k.x) > k.w / 2 + 0.4) continue;
      const v = c.body.getLinearVelocity();
      const dir = p.x < k.x ? -1 : 1;
      c.body.setLinearVelocity(Vec2(v.x + dir * 3.4, Math.max(v.y, 0) + 3.8));
      c.body.setAngularVelocity(-dir * 4);
    }
    const ch = this.truck.chassis;
    const p = ch.getPosition();
    ch.setAngularVelocity(ch.getAngularVelocity() + (p.x < k.x ? 1 : -1));
    this.events.push({ type: 'bonk', x: k.x, y: k.y + k.h, s: 1 });
  }

  // sounds from hazards far off-screen would just be noise
  nearEvent(ev) {
    if (Math.abs(ev.x - this.truck.chassis.getPosition().x) < 22) this.events.push(ev);
  }

  // Platforms wait for the truck, carry it across, then return once it has left.
  truckOn(k) {
    const pos = k.body.getPosition();
    const half = k.w / 2;
    const top = pos.y + 0.22;
    const ws = [this.truck.rear.getPosition(), this.truck.front.getPosition()];
    return ws.every((w) => w.x > pos.x - half + 0.15 && w.x < pos.x + half - 0.15 && Math.abs(w.y - TRUCK.wheelR - top) < 0.35);
  }

  platformPhase(k) {
    if (!k.st) { k.st = 'A'; k.f = 0; k.hold = 0; }
    const travel = k.type === 'ferry' ? Math.max(2.4, Math.abs(k.bx - k.ax) * 0.42) : Math.max(2.4, Math.abs(k.by - k.ay) * 0.62);
    const on = this.truckOn(k);
    const cx = this.truck.chassis.getPosition().x;
    const far = k.type === 'ferry' ? k.bx + k.w / 2 : k.x + k.w / 2;
    if (k.st === 'A') {
      k.hold = on && this.fwdSpeed() < 1.5 ? k.hold + DT : 0;
      if (k.hold > 0.45) { k.st = 'go'; k.hold = 0; }
    } else if (k.st === 'go') {
      k.f = Math.min(1, k.f + DT / travel);
      if (k.f >= 1) k.st = 'B';
    } else if (k.st === 'B') {
      const gone = !on && cx + TRUCK.rear.x - TRUCK.wheelR > far + 0.3;
      const fell = !on && this.truck.chassis.getPosition().y < (k.type === 'ferry' ? k.y : k.by) - 2;
      k.hold = gone || fell ? k.hold + DT : 0;
      if (k.hold > 1.2) { k.st = 'back'; k.hold = 0; }
    } else if (k.st === 'back') {
      k.f = Math.max(0, k.f - DT / travel);
      if (k.f <= 0) k.st = 'A';
    }
    // if the truck fell off mid-ride, still finish the move then come back
    return smoothstep(k.f);
  }

  updateTriggers() {
    const cx = this.truck.chassis.getPosition().x;
    for (const tr of this.triggers) {
      if (tr.fired) continue;
      if (tr.type === 'chase' && cx > tr.trigger) {
        tr.fired = true;
        tr.at = this.time + tr.delay;
      } else if (tr.type === 'rockfall' && cx > tr.trigger) {
        tr.fired = true;
        tr.at = this.time;
      } else if (tr.type === 'meteors' && cx > tr.trigger) {
        tr.fired = true;
        tr.at = this.time + 0.2;
        tr.count = 0;
      }
    }
    for (const tr of this.triggers) {
      if (tr.type === 'meteors') { if (tr.fired) this.meteorShower(tr); continue; }
      if (!tr.fired || tr.spawned || this.time < tr.at) continue;
      tr.spawned = true;
      if (tr.type === 'chase') {
        const x = tr.trigger + tr.dx;
        const gy = this.groundAt(x) ?? 0;
        const b = this.world.createBody({ type: 'dynamic', position: Vec2(x, gy + tr.r + 0.4), angularDamping: 0.05, linearDamping: 0 });
        this.objFixture(b, new Circle(tr.r), { density: 1.1, friction: 0.9, restitution: 0.1 }, 'boulder');
        b.setLinearVelocity(Vec2(7.5, 0));
        b.setAngularVelocity(-7.5 / tr.r);
        tr.bodies.push(b);
        this.dynamic.push(b);
        b.px = b.getPosition().x; b.py = b.getPosition().y; b.pa = 0;
        this.events.push({ type: 'rumble', x, y: gy });
      } else {
        for (let i = 0; i < tr.n; i++) {
          const x = tr.x + (tr.spread * i) / Math.max(1, tr.n - 1) + (this.rand() - 0.5);
          const gy = this.groundAt(x) ?? 0;
          const r = 0.28 + this.rand() * 0.22;
          const verts = [];
          const k = 6;
          for (let v = 0; v < k; v++) {
            const a = (v / k) * Math.PI * 2 + this.rand() * 0.4;
            const rr = r * (0.8 + this.rand() * 0.3);
            verts.push(Vec2(Math.cos(a) * rr, Math.sin(a) * rr));
          }
          const b = this.world.createBody({ type: 'dynamic', position: Vec2(x, gy + 10 + i * 1.6), angle: this.rand() * 6, angularVelocity: (this.rand() - 0.5) * 4 });
          this.objFixture(b, new Polygon(verts), { density: 1.4, friction: 0.8 }, 'rock');
          tr.bodies.push(b);
          this.dynamic.push(b);
          b.px = b.getPosition().x; b.py = b.getPosition().y; b.pa = b.getAngle();
        }
        this.events.push({ type: 'rockwarn', x: tr.x, y: this.groundAt(tr.x) ?? 0 });
      }
    }
  }

  meteorShower(tr) {
    if (tr.count >= tr.n || this.time < tr.at) return;
    tr.at = this.time + tr.every;
    // golden-ratio spread: impacts cover the whole stretch without clumping
    const tx = tr.x + tr.len * ((tr.count * 0.618 + 0.13) % 1);
    tr.count++;
    const gy = this.groundAt(tx) ?? 0;
    const r = 0.36 + this.rand() * 0.1;
    const sx = tx + 6, sy = gy + 15, d = Math.hypot(6, 15 - r);
    const b = this.world.createBody({ type: 'dynamic', position: Vec2(sx, sy), bullet: true, gravityScale: 0, angularVelocity: 3 });
    this.objFixture(b, new Circle(r), { density: 3, friction: 0.5, restitution: 0.1, userData: { tx, gy, r } }, 'meteor');
    b.setLinearVelocity(Vec2((-6 / d) * METEOR_SPEED, (-(15 - r) / d) * METEOR_SPEED));
    b.px = sx; b.py = sy; b.pa = 0;
    tr.bodies.push(b);
    this.dynamic.push(b);
  }

  // small shock wave: near misses still rattle the load
  meteorBlast(x, y) {
    const R = 2.3;
    for (const c of this.cargo) {
      if (c.lost) continue;
      const p = c.body.getPosition();
      const dx = p.x - x, dy = p.y - y;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;
      const f = (1 - d / R) * 6.5;
      const v = c.body.getLinearVelocity();
      c.body.setLinearVelocity(Vec2(v.x + (dx / (d || 1)) * f, v.y + Math.max(0.4, dy / (d || 1)) * f));
    }
  }

  applyZones() {
    const ch = this.truck.chassis;
    const cp = ch.getPosition();
    for (const z of this.track.zones) {
      if (z.type !== 'wind') continue;
      const gust = 0.5 + 0.5 * Math.sin(this.time * 1.25 + z.x0 * 0.1);
      const k = 0.35 + 0.65 * gust;
      for (const c of this.cargo) {
        if (c.lost) continue;
        const p = c.body.getPosition();
        if (p.x < z.x0 || p.x > z.x1) continue;
        c.body.applyForceToCenter(Vec2(z.fx * c.area * k, z.fy * c.area * k), true);
      }
      if (cp.x > z.x0 && cp.x < z.x1) ch.applyForceToCenter(Vec2(z.fx * 1.2 * k, z.fy * 1.2 * k), true);
    }
    const t = this.truck;
    const movers = [t.chassis, t.rear, t.front];
    for (const c of this.cargo) if (!c.lost) movers.push(c.body);
    for (const z of this.track.zones) {
      if (z.type !== 'lowgrav') continue;
      if (cp.x > z.x0 && cp.x < z.x1 && !this.warped.has(z)) { this.warped.add(z); this.events.push({ type: 'warp', x: cp.x, y: cp.y }); }
      for (const b of movers) {
        const p = b.getPosition();
        if (p.x > z.x0 && p.x < z.x1) b.applyForceToCenter(Vec2(0, -this.g * (1 - z.k) * b.getMass()), true);
      }
    }
    for (const o of this.objs) {
      if (o.type !== 'geyser') continue;
      const st = geyserState(o, this.time);
      if (st === 2 && o.st !== 2) this.nearEvent({ type: 'geyser', x: o.x, y: o.y });
      o.st = st;
      if (st !== 2) continue;
      movers.forEach((b, i) => {
        const p = b.getPosition();
        const hgt = Math.max(0, p.y - o.y);
        if (Math.abs(p.x - o.x) > o.w / 2 + 0.3 || hgt > 9) return;
        // loose cargo gets a touch more lift than the truck, so the jet unsettles the load
        const k = i < 3 ? 1 : 1.15;
        b.applyForceToCenter(Vec2(0, -this.g * 1.75 * o.power * k * (1 - hgt / 9) * b.getMass()), true);
      });
    }
    for (const o of this.objs) {
      if (o.type !== 'boost') continue;
      if (cp.x > o.x0 && cp.x < o.x1 && this.grounded && this.state === 'play') {
        const a = ch.getAngle();
        ch.applyForceToCenter(Vec2(Math.cos(a) * o.power, Math.sin(a) * o.power), true);
        if (!o.on) { o.on = true; this.events.push({ type: 'boost', x: cp.x, y: cp.y }); }
      } else o.on = false;
    }
  }

  doBounce(power) {
    this.bounceCool = 0.6;
    const t = this.truck;
    const bodies = [t.chassis, t.rear, t.front];
    for (const c of this.cargo) if (!c.lost && this.inZone(c)) bodies.push(c.body);
    // launcher pad: fixed up + forward kick so the landing spot doesn't depend on approach speed
    const vx = Math.max(t.chassis.getLinearVelocity().x, this.bounceVx ?? 6.2);
    const cvx = t.chassis.getLinearVelocity().x;
    bodies.forEach((b, i) => {
      const v = b.getLinearVelocity();
      // cargo gets a little less lift so it stays settled on the bed through the arc
      const k = i < 3 ? 1 : 0.82;
      b.setLinearVelocity(Vec2(vx + (v.x - cvx) * 0.3, (Math.max(v.y, 0) * 0.3 + power) * k));
    });
    // pads launch level: no inherited spin, so the bed doesn't tip its load backwards
    t.chassis.setAngularVelocity(t.chassis.getAngularVelocity() * 0.2);
    const p = t.chassis.getPosition();
    this.events.push({ type: 'bounce', x: p.x, y: p.y - 1 });
  }

  inZone(c) {
    const lp = this.truck.chassis.getLocalPoint(c.body.getPosition());
    const z = TRUCK.zone;
    return lp.x > z.x0 && lp.x < z.x1 && lp.y > z.y0 && lp.y < z.y1;
  }

  loseCargo(c, reason) {
    if (c.lost) return;
    c.lost = true;
    c.lostReason = reason;
    c.lostT = this.time;
    const p = c.body.getPosition();
    this.events.push({ type: 'lost', id: c.id, cargo: c.type, reason, x: p.x, y: p.y });
  }

  breakCargo(c) {
    if (c.broken) return;
    const p = c.body.getPosition();
    const v = c.body.getLinearVelocity();
    c.broken = true;
    c.bx = p.x; c.by = p.y; c.ba = c.body.getAngle();
    this.events.push({ type: 'break', id: c.id, cargo: c.type, x: p.x, y: p.y, vx: v.x, vy: v.y });
    this.loseCargo(c, 'broken');
    this.world.destroyBody(c.body);
    this.dynamic.splice(this.dynamic.indexOf(c.body), 1);
    if (c.def.explosive) this.explode(p.x, p.y);
  }

  explode(x, y) {
    const R = 5.5;
    this.events.push({ type: 'explode', x, y });
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (!b.isDynamic()) continue;
      const p = b.getPosition();
      const dx = p.x - x, dy = p.y - y + 0.6;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;
      const f = 1 - d / R;
      const u = b.getUserData() || {};
      const dvMax = u.kind === 'truck' || u.kind === 'wheel' ? 7 : 13;
      const nx = d > 0.01 ? dx / d : 0, ny = d > 0.01 ? dy / d : 1;
      b.applyLinearImpulse(Vec2(nx * dvMax * f * b.getMass(), (ny * 0.7 + 0.5) * dvMax * f * b.getMass()), p, true);
      if (u.kind === 'truck') b.applyAngularImpulse((dx > 0 ? -1 : 1) * 6 * f, true);
    }
    for (const c of this.cargo) {
      if (c.lost) continue;
      const p = c.body.getPosition();
      if (Math.hypot(p.x - x, p.y - y) < R * 0.8) this.loseCargo(c, 'boom');
    }
  }

  step(input, settling = false) {
    if (input) this.input = input;
    if (!this.started && !settling && (this.input.gas > 0 || this.input.brake > 0)) {
      this.started = true;
      this.events.push({ type: 'start' });
    }
    this.snapshot();
    this.applyDrive(DT);
    this.updateKinematics(this.time);
    if (!settling) {
      this.updateTriggers();
      this.applyZones();
    }
    if (this.pendingBounce != null) {
      this.doBounce(this.pendingBounce);
      this.pendingBounce = null;
    }
    if (this.bounceCool > 0) this.bounceCool -= DT;

    for (const c of this.cargo) {
      if (c.broken) continue;
      const v = c.body.getLinearVelocity();
      c.vx0 = v.x; c.vy0 = v.y;
    }
    this.world.step(DT, VEL_ITERS, POS_ITERS);
    this.time += DT;
    if (!settling && this.time > 0.25) {
      for (const c of this.cargo) {
        if (c.broken || !c.def.fragile) continue;
        const v = c.body.getLinearVelocity();
        const dv = Math.hypot(v.x - c.vx0, v.y - c.vy0 - this.g * DT);
        c.jolt = Math.max(c.jolt || 0, dv);
        if (dv > c.def.fragile) this.pendingBreaks.push(c);
      }
    }
    if (this.started && this.state === 'play') this.runTime += DT;

    if (this.pendingBreaks.length) {
      const list = this.pendingBreaks;
      this.pendingBreaks = [];
      for (const c of list) this.breakCargo(c);
    }
    if (settling) return;
    this.crumbleRocks();
    this.checkCargo();
    this.checkCoins();
    this.checkEnd();
  }

  crumbleRocks() {
    for (const tr of this.triggers) {
      if (tr.type !== 'rockfall') continue;
      for (let i = tr.bodies.length - 1; i >= 0; i--) {
        const b = tr.bodies[i];
        const u = b.getFixtureList().getUserData();
        if (!u.dieAt || this.time < u.dieAt) continue;
        const p = b.getPosition();
        this.events.push({ type: 'crumble', x: p.x, y: p.y });
        this.world.destroyBody(b);
        tr.bodies.splice(i, 1);
        this.dynamic.splice(this.dynamic.indexOf(b), 1);
      }
    }
    for (const tr of this.triggers) {
      if (tr.type !== 'meteors') continue;
      for (let i = tr.bodies.length - 1; i >= 0; i--) {
        const b = tr.bodies[i];
        const u = b.getFixtureList().getUserData();
        const p = b.getPosition();
        if (!(u.dieAt && this.time >= u.dieAt) && p.y > u.gy - 3) continue;
        this.nearEvent({ type: 'meteor', x: p.x, y: p.y - u.r * 0.5 });
        this.meteorBlast(p.x, p.y);
        this.world.destroyBody(b);
        tr.bodies.splice(i, 1);
        this.dynamic.splice(this.dynamic.indexOf(b), 1);
      }
    }
    for (const o of this.objs) {
      if (o.type !== 'crumble') continue;
      for (const sl of o.slabs) {
        if (sl.gone || !sl.fallAt || this.time < sl.fallAt) continue;
        if (!sl.fell) {
          sl.fell = true;
          sl.body.setType('dynamic');
          sl.body.setAngularVelocity((this.rand() - 0.5) * 1.5);
          const p = sl.body.getPosition();
          this.nearEvent({ type: 'crumble', x: p.x, y: p.y, slab: true });
        } else if (this.time > sl.fallAt + 4) {
          sl.gone = true;
          this.world.destroyBody(sl.body);
          o.bodies.splice(o.bodies.indexOf(sl.body), 1);
          this.dynamic.splice(this.dynamic.indexOf(sl.body), 1);
        }
      }
    }
    // knocked-over junk boxes poof once they've been shoved far away, so they can't jam platforms
    for (const o of this.objs) {
      if (o.type !== 'stack') continue;
      for (let i = o.bodies.length - 1; i >= 0; i--) {
        const b = o.bodies[i];
        const p = b.getPosition();
        const gy = this.groundAt(p.x);
        if (Math.abs(p.x - o.x) < 9 && (gy == null || p.y > gy - 2.5)) continue;
        this.events.push({ type: 'crumble', x: p.x, y: p.y, junk: true });
        this.world.destroyBody(b);
        o.bodies.splice(i, 1);
        this.dynamic.splice(this.dynamic.indexOf(b), 1);
      }
    }
  }

  checkCargo() {
    const killY = this.track.killY;
    for (const c of this.cargo) {
      if (c.lost) continue;
      const p = c.body.getPosition();
      const inside = this.inZone(c);
      if (!inside) c.outT += DT; else c.outT = 0;
      if (p.y < killY || this.belowPitRim(p, 1.6)) this.loseCargo(c, 'fell');
      else if (c.ground > 0 && !inside) {
        if (c.def.explosive) { this.pendingBreaks.push(c); }
        this.loseCargo(c, 'dropped');
      } else if (c.outT > 1.4) this.loseCargo(c, 'dropped');
    }
    if (this.pendingBreaks.length) {
      const list = this.pendingBreaks;
      this.pendingBreaks = [];
      for (const c of list) this.breakCargo(c);
    }
  }

  checkCoins() {
    const t = this.truck;
    const bodies = [t.chassis, t.rear, t.front];
    const cx = t.chassis.getPosition().x;
    for (const coin of this.coins) {
      if (coin.taken || Math.abs(coin.x - cx) > 3) continue;
      for (const b of bodies) {
        const p = b.getPosition();
        if (Math.hypot(p.x - coin.x, p.y + (b === t.chassis ? 0.4 : 0) - coin.y) < (b === t.chassis ? 1.5 : 0.9)) {
          coin.taken = true;
          this.coinsTaken++;
          this.events.push({ type: 'coin', x: coin.x, y: coin.y, n: this.coinsTaken });
          break;
        }
      }
    }
  }

  // deep inside a pit nothing can recover, so fail right away instead of a long drop to killY
  belowPitRim(p, depth) {
    for (const pt of this.track.pits) {
      if (p.x > pt.x0 + 0.2 && p.x < pt.x1 - 0.2 && p.y < Math.min(pt.y0, pt.y1) - depth) return true;
    }
    return false;
  }

  remaining() { return this.cargo.filter((c) => !c.lost).length; }

  checkEnd() {
    if (this.state !== 'play') {
      if (this.state === 'finished') this.afterFinishT = (this.afterFinishT || 0) + DT;
      return;
    }
    const ch = this.truck.chassis;
    const p = ch.getPosition();
    const req = this.level.required;
    if (p.x > this.track.finishX) {
      this.delivered = this.cargo.filter((c) => !c.lost && this.inZone(c)).length;
      if (this.delivered >= req) {
        this.state = 'finished';
        this.finishTime = this.runTime;
        this.events.push({ type: 'finish', delivered: this.delivered, total: this.cargo.length, time: this.runTime });
        return;
      }
    }
    if (p.y < this.track.killY || this.belowPitRim(p, 2.6)) { this.fail('fell'); return; }
    if (this.squashed) { this.fail('squashed'); return; }
    if (this.failTimer >= 0) {
      this.failTimer -= DT;
      if (this.failTimer <= 0) this.fail(this.pendingFail);
      return;
    }
    if (this.remaining() < req) { this.pendingFail = 'cargo'; this.failTimer = 1.0; return; }
    const up = Math.cos(ch.getAngle());
    const speed = ch.getLinearVelocity().length();
    if (up < -0.15 && speed < 4) this.flipT += DT; else this.flipT = Math.max(0, this.flipT - DT * 2);
    if (this.flipT > 1.1) { this.fail('flip'); return; }
    if (Math.abs(up) < 0.35 && speed < 0.6) this.stuckT += DT; else this.stuckT = 0;
    if (p.x > (this.bestX ?? -1e9) + 0.6) { this.bestX = p.x; this.idleT = 0; }
    else if (this.started) {
      this.idleT = (this.idleT || 0) + DT;
      if (this.idleT > 7 && !this.hinted) { this.hinted = true; this.events.push({ type: 'stuckhint' }); }
    }
    if (this.stuckT > 2.0) this.fail('stuck');
  }

  fail(reason) {
    if (this.state !== 'play') return;
    this.state = 'failed';
    this.failReason = reason;
    this.events.push({ type: 'fail', reason });
  }

  stars() {
    const par = this.level.par || 999;
    return [this.state === 'finished', this.state === 'finished' && this.delivered === this.cargo.length, this.state === 'finished' && this.finishTime <= par];
  }

  progress() {
    const x = this.truck.chassis.getPosition().x;
    return clamp(x / this.track.finishX, 0, 1);
  }
}

function smoothstep(t) { return t * t * (3 - 2 * t); }

export const METEOR_SPEED = 13;
