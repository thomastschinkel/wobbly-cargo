import { THEMES, OUTLINE } from './themes.js';
import { Particles, starPath } from './particles.js';
import { drawTruckBack, drawTruckFront, drawWheel } from './draw-truck.js';
import { drawCargo } from './draw-cargo.js';
import { rrect, circle, fillStroke, worldText, shade } from './draw-util.js';
import { mulberry32, clamp, damp, hashStr } from '../core/rng.js';
import { TRUCK } from '../game/vehicle.js';
import { geyserState, pistonHeight, PISTON_UP, GEYSER_ERUPT } from '../game/track.js';

const LOST_LINES = ['Nooo!', 'Bye!', 'Wheee!', 'Oops!', 'Help!', 'Waaah!', 'Ouch!', 'Aaah!', 'Not again!', 'Catch me!'];
const BREAK_LINES = ['SMASH!', 'SPLAT!', 'CRACK!', 'KRSSH!'];

const lerpA = (a, b, t) => a + (b - a) * t;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.cam = { x: 0, y: 0, zoom: 1 };
    // screen anchor of the camera point; menus push the truck into the free left third
    this.menuFrame = false;
    this.ax = 0.5;
    this.ay = 0.56;
    this.shake = 0;
    this.shakeOn = true;
    this.flash = 0;
    this.time = 0;
    this.particles = new Particles();
    this.floaters = [];
    this.faces = new Map();
    this.flakes = [];
    this.inputHint = 'keys';
    this.bobX = 0; this.bobY = 0; this.bvx = 0; this.bvy = 0;
    this.lastCV = null;
    this.exhaustT = 0;
    this.bounceT = -9;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.skyGrad = null;
    this.vignette = null;
  }

  baseScale() {
    const { w, h } = this;
    const aspect = w / h;
    if (aspect >= 1.15) return Math.min(w / 21, h / 11.2);
    return Math.min(w / 12.5, h / 11.2);
  }

  setScene(sim, themeId, skin, hat) {
    this.sim = sim;
    this.theme = THEMES[themeId] || THEMES.meadow;
    this.skin = skin;
    this.hat = hat;
    this.faces.clear();
    this.particles.clear();
    this.floaters.length = 0;
    this.skyGrad = null;
    const tr = sim.track;
    const rand = mulberry32(hashStr(themeId + ':' + (sim.level.seed || 1)));
    // stones in the dirt + surface tufts + props behind the road
    this.stones = [];
    this.tufts = [];
    this.props = [];
    const blocked = (x) => {
      for (const p of tr.pits) if (x > p.x0 - 3 && x < p.x1 + 3) return true;
      for (const o of tr.objects) {
        const ox = o.x ?? o.x0 ?? o.ax;
        if (ox != null && Math.abs(x - ox) < 7) return true;
      }
      for (const s of tr.signs) if (Math.abs(x - s.x) < 3) return true;
      if (Math.abs(x - tr.finishX - 8) < 14 || (x > -16 && x < 3)) return true;
      return false;
    };
    for (const pts of tr.chains) {
      const xa = pts[1].x, xb = pts[pts.length - 2].x;
      for (let x = xa + 0.5; x < xb - 0.5; x += 1.2 + rand() * 1.6) {
        const gy = sim.groundAt(x);
        if (gy == null) continue;
        const d = 0.9 + rand() * 5.5;
        this.stones.push({ x, y: gy - d, r: 0.14 + rand() * 0.34, a: rand() * 6, k: Math.floor(rand() * 1000) });
      }
      for (let x = xa + 0.3; x < xb - 0.3; x += 0.9 + rand() * 1.8) {
        const gy = sim.groundAt(x);
        if (gy == null) continue;
        this.tufts.push({ x, y: gy, s: 0.6 + rand() * 0.6, k: rand() });
      }
      for (let x = xa + 4; x < xb - 4; x += 5 + rand() * 9) {
        if (blocked(x)) continue;
        const gy = sim.groundAt(x);
        if (gy == null) continue;
        this.props.push({ x, y: gy, s: 0.75 + rand() * 0.5, k: rand(), kind: Math.floor(rand() * 4) });
      }
    }
    // screen-space snow
    this.flakes = [];
    if (this.theme.snowfall || this.theme.embers) {
      const n = this.theme.embers ? 34 : 70;
      for (let i = 0; i < n; i++) this.flakes.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 1.4, p: Math.random() * 6 });
    }
    this.snapCamera();
  }

  anchorTarget() {
    if (!this.menuFrame) return { x: 0.5, y: 0.56 };
    return this.w / this.h >= 1.15 ? { x: 0.2, y: 0.56 } : { x: 0.5, y: 0.8 };
  }

  snapCamera() {
    const ch = this.sim.truck.chassis.getPosition();
    const an = this.anchorTarget();
    this.ax = an.x; this.ay = an.y;
    this.cam.x = ch.x + (this.menuFrame ? 0.6 : 2.2);
    this.cam.y = ch.y + 0.9;
    this.cam.zoom = 1;
  }

  addShake(a) { if (this.shakeOn) this.shake = Math.min(1.2, this.shake + a); }

  float(x, y, text, opt = {}) {
    this.floaters.push({ x, y, text, color: opt.color || '#ffffff', size: opt.size || 26, life: opt.life || 1.1, max: opt.life || 1.1, vy: opt.vy ?? 1.4, bubble: !!opt.bubble, follow: opt.follow || null });
  }

  // ---------- events from the simulation ----------
  handleEvent(ev) {
    const th = this.theme;
    const P = this.particles;
    switch (ev.type) {
      case 'land':
        P.dust(ev.x, ev.y, th.dust, Math.round(4 + ev.s * 10), 1 + ev.s, 1);
        this.addShake(ev.s * 0.35);
        break;
      case 'scrape':
        P.sparks(ev.x, ev.y, 6);
        P.dust(ev.x, ev.y, th.dust, 5);
        this.addShake(ev.s * 0.3);
        break;
      case 'clunk':
        if (ev.s > 0.35) P.dust(ev.x, ev.y - 0.25, 'rgba(255,255,255,0.8)', 2, 0.5, 0.5);
        break;
      case 'lost': {
        const c = this.sim.cargo[ev.id];
        if (ev.reason === 'fell' && th.lava) P.smoke(ev.x, ev.y, 8, '#8a7a78');
        if (ev.reason !== 'broken') {
          this.float(ev.x, ev.y + 0.6, LOST_LINES[Math.floor(Math.random() * LOST_LINES.length)], { bubble: true, life: 1.5, vy: 0.4, follow: c && !c.broken ? c.body : null, size: 20 });
        }
        break;
      }
      case 'break': {
        const d = this.sim.cargo[ev.id].def;
        P.splat(ev.x, ev.y, d.splat || [d.color, d.dark], 22, ev.vx, ev.vy);
        P.chunks(ev.x, ev.y, [d.color, d.dark], 8, 5);
        P.ring(ev.x, ev.y, 1, '#ffffff');
        this.float(ev.x, ev.y + 0.5, BREAK_LINES[Math.floor(Math.random() * BREAK_LINES.length)], { color: '#ff5a5a', size: 30, life: 1 });
        this.addShake(0.35);
        break;
      }
      case 'explode':
        P.smoke(ev.x, ev.y, 18, '#5e5a70');
        P.splat(ev.x, ev.y, ['#ffe14d', '#ff9a2f', '#ff4d4d'], 40);
        P.sparks(ev.x, ev.y, 20);
        P.ring(ev.x, ev.y, 3, '#fff3b0');
        this.flash = 1;
        this.addShake(1.2);
        this.float(ev.x, ev.y + 1, 'KABOOM!', { color: '#ffcf3f', size: 44, life: 1.4 });
        break;
      case 'coin':
        P.stars(ev.x, ev.y, 5);
        this.float(ev.x, ev.y + 0.4, '+1', { color: '#ffe14d', size: 24, life: 0.8, vy: 2 });
        break;
      case 'bounce':
        this.bounceT = this.time;
        P.dust(ev.x, ev.y, th.dust, 8, 1.5);
        this.float(ev.x, ev.y + 2.5, 'BOING!', { color: '#ff5ea8', size: 30, life: 0.9 });
        break;
      case 'boost':
        this.float(ev.x, ev.y + 2, 'BOOST!', { color: '#ffb13d', size: 28, life: 0.8 });
        break;
      case 'bonk':
        P.stars(ev.x, ev.y + 0.5, 6);
        this.addShake(0.5);
        this.float(ev.x, ev.y + 1.2, 'BONK!', { color: '#ffffff', size: 30, life: 0.8 });
        break;
      case 'finish':
        P.confetti(this.sim.track.finishX, (this.sim.track.finishY || 0) + 4.8, 90);
        break;
      case 'rumble':
        this.addShake(0.4);
        break;
      case 'geyser':
        P.smoke(ev.x, ev.y + 0.5, 6, th.lava ? 'rgba(235,225,225,0.9)' : 'rgba(240,248,255,0.9)');
        this.addShake(0.12);
        break;
      case 'meteor':
        P.smoke(ev.x, ev.y, 9, th.dust);
        P.chunks(ev.x, ev.y, ['#5e4f5c', '#ff9a2f', th.stone], 10, 6);
        P.ring(ev.x, ev.y, 2, '#ffcf8a');
        this.addShake(0.4);
        break;
      case 'piston':
        P.dust(ev.x - 1.3, ev.y, th.dust, 4, 1.5);
        P.dust(ev.x + 1.3, ev.y, th.dust, 4, 1.5);
        this.addShake(0.22);
        break;
      case 'warp':
        this.float(ev.x, ev.y + 2.4, 'LOW GRAVITY!', { color: '#d4b4ff', size: 26, life: 1.3, vy: 0.6 });
        break;
      case 'crumble':
        if (ev.slab) {
          P.chunks(ev.x, ev.y, [th.stone, th.stoneDark, '#ff8a3d'], 5, 2.5);
          P.dust(ev.x, ev.y, th.dust, 3, 1);
        } else if (ev.junk) {
          P.smoke(ev.x, ev.y, 5, '#d8c7a4');
          P.chunks(ev.x, ev.y, ['#d9a86c', '#a8733d'], 5, 3);
        } else {
          P.chunks(ev.x, ev.y, [th.stone, th.stoneDark], 7, 3.5);
          P.dust(ev.x, ev.y - 0.3, th.dust, 5, 1.2);
        }
        break;
      case 'rockwarn':
        this.float(ev.x, ev.y + 5.5, 'LOOK OUT!', { color: '#ffcf3f', size: 28, life: 1.1, vy: 0.6 });
        this.addShake(0.2);
        break;
      case 'stuckhint': {
        const p = this.sim.truck.chassis.getPosition();
        this.float(p.x, p.y + 2.6, this.inputHint === 'touch' ? 'Stuck? Tap ↻ to retry!' : 'Stuck? Press R to retry!', { bubble: true, life: 3.2, vy: 0, follow: this.sim.truck.chassis, size: 20 });
        break;
      }
      default: break;
    }
  }

  // ---------- per-frame update ----------
  update(dt, alpha) {
    this.time += dt;
    this.particles.update(dt);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y += f.vy * dt;
      if (f.follow && f.follow.getPosition) {
        const p = f.follow.getPosition();
        f.x = p.x; f.y = Math.max(f.y, p.y + 0.6);
      }
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 3);
    const sim = this.sim;
    if (!sim) return;
    const ch = sim.truck.chassis;
    const cp = this.interp(ch, alpha);
    const v = ch.getLinearVelocity();
    // camera
    const lead = clamp(v.x, -4, 14) * 0.26;
    const tx = cp.x + (this.menuFrame ? 0.6 + lead * 0.3 : 2.2 + lead);
    const an = this.anchorTarget();
    this.ax = damp(this.ax, an.x, 2.5, dt);
    this.ay = damp(this.ay, an.y, 2.5, dt);
    const ty = cp.y + 0.9 + clamp(v.y, -10, 10) * 0.06;
    this.cam.x = damp(this.cam.x, tx, 3.2, dt);
    // falling into a pit: hold the camera at the rim and let the truck drop out of view
    if (!(sim.state === 'failed' && sim.failReason === 'fell')) this.cam.y = damp(this.cam.y, ty, 2.4, dt);
    const speed = Math.hypot(v.x, v.y);
    let zt = 1 - clamp((speed - 4) / 10, 0, 1) * 0.12;
    if (sim.state === 'finished') zt = 1.06;
    this.cam.zoom = damp(this.cam.zoom, zt, 1.5, dt);

    // driver head bob
    if (this.lastCV) {
      const ax = (v.x - this.lastCV.x) / Math.max(dt, 1e-3), ay = (v.y - this.lastCV.y) / Math.max(dt, 1e-3);
      this.bvx += (-ax * 0.0009 - this.bobX * 90 - this.bvx * 10) * dt;
      this.bvy += (-ay * 0.0009 - this.bobY * 90 - this.bvy * 10) * dt;
      this.bobX = clamp(this.bobX + this.bvx * dt * 10, -0.05, 0.05);
      this.bobY = clamp(this.bobY + this.bvy * dt * 10, -0.05, 0.05);
    }
    this.lastCV = { x: v.x, y: v.y };

    // wheel dust + exhaust
    const th = this.theme;
    const fwd = sim.fwdSpeed();
    for (const [w, g] of [[sim.truck.rear, sim.rearGrounded], [sim.truck.front, sim.frontGrounded]]) {
      if (!g) continue;
      const wp = w.getPosition();
      const spin = Math.abs(w.getAngularVelocity() * TRUCK.wheelR) - Math.abs(fwd);
      if ((spin > 1.5 || (Math.abs(fwd) > 7 && Math.random() < 0.3)) && Math.random() < 0.6) {
        this.particles.dust(wp.x - Math.sign(fwd || 1) * 0.3, wp.y - TRUCK.wheelR + 0.05, th.dust, 1, 0.8, 0.8);
      }
    }
    this.exhaustT -= dt;
    if (sim.input.gas > 0 && sim.state === 'play' && this.exhaustT <= 0) {
      this.exhaustT = 0.09;
      const p = ch.getWorldPoint({ x: -2.25, y: -0.38 });
      this.particles.add({ t: 5, x: p.x, y: p.y, vx: -1.5 - Math.random(), vy: 0.6 + Math.random() * 0.6, size: 0.08, grow: 1.5, color: 'rgba(200,200,215,0.9)', life: 0.5, drag: 1 });
    }
    // wind streaks
    for (const z of sim.track.zones) {
      if (z.type !== 'wind') continue;
      const x0 = Math.max(z.x0, this.cam.x - 14), x1 = Math.min(z.x1, this.cam.x + 14);
      if (x1 <= x0) continue;
      if (Math.random() < dt * 30) {
        const x = x0 + Math.random() * (x1 - x0);
        const gy = sim.groundAt(x) ?? cp.y;
        this.particles.add({ t: 9, x, y: gy + 0.5 + Math.random() * 5, vx: Math.sign(z.fx) * (10 + Math.random() * 6), vy: z.fy * 0.3, size: 0.05, color: '#ffffff', life: 0.6 });
      }
    }
    this.hazardParticles(dt, sim);
    // googly eyes
    for (const c of sim.cargo) this.updateFace(c, dt, sim);
  }

  hazardParticles(dt, sim) {
    const P = this.particles, th = this.theme;
    const x0 = this.cam.x - 16, x1 = this.cam.x + 16;
    for (const o of sim.objs) {
      if (o.type === 'geyser' && o.x > x0 && o.x < x1) {
        const st = geyserState(o, sim.time);
        if (st === 1 && Math.random() < dt * 9) {
          P.add({ t: 5, x: o.x + (Math.random() - 0.5) * 0.8, y: o.y + 0.4, vx: (Math.random() - 0.5), vy: 1.2 + Math.random(), size: 0.18, grow: 1.2, color: 'rgba(235,240,250,0.8)', life: 0.8, drag: 1 });
        } else if (st === 2 && Math.random() < dt * 30) {
          P.add({ t: 4, x: o.x + (Math.random() - 0.5) * 0.9, y: o.y + 1, vx: (Math.random() - 0.5) * 4, vy: 7 + Math.random() * 4, size: 0.08, color: th.lava ? '#ffe2c8' : '#d8f1ff', life: 1.1, g: -12 });
        }
      } else if ((o.type === 'meteors' || (o.type === 'rockfall' && th.lava)) && o.bodies.length) {
        for (const b of o.bodies) {
          const p = b.getPosition();
          if (p.x < x0 || p.x > x1 || Math.random() > dt * 35) continue;
          P.add({ t: 5, x: p.x, y: p.y, vx: (Math.random() - 0.5) * 0.6, vy: 0.4, size: 0.2, grow: 1, color: 'rgba(110,95,105,0.65)', life: 0.55, drag: 1 });
        }
      }
    }
    for (const z of sim.track.zones) {
      if (z.type !== 'lowgrav' || z.x1 < x0 || z.x0 > x1 || Math.random() > dt * 10) continue;
      const x = z.x0 + Math.random() * (z.x1 - z.x0);
      const gy = sim.groundAt(x) ?? 0;
      P.add({ t: 0, x, y: gy + Math.random() * 3, vx: 0, vy: 0.8 + Math.random() * 0.6, size: 0.1, color: 'rgba(210,180,255,0.9)', life: 2 });
    }
    if (th.lava) {
      for (const pt of sim.track.pits) {
        if (pt.x1 < x0 || pt.x0 > x1 || Math.random() > dt * 3) continue;
        const x = pt.x0 + Math.random() * (pt.x1 - pt.x0);
        P.add({ t: 3, x, y: Math.min(pt.y0, pt.y1) - 1.9, vx: (Math.random() - 0.5) * 1.5, vy: 2 + Math.random() * 2.5, size: 0.06, color: '#ffb03a', life: 0.9, g: -5 });
      }
    }
  }

  updateFace(c, dt, sim) {
    let f = this.faces.get(c.id);
    const body = c.body;
    if (c.broken) return;
    const v = body.getLinearVelocity();
    if (!f) {
      f = { e: [{ x: 0, y: -0.5, vx: 0, vy: 0 }, { x: 0, y: -0.5, vx: 0, vy: 0 }], lv: { x: v.x, y: v.y }, blink: 0, next: 1 + Math.random() * 3 };
      this.faces.set(c.id, f);
    }
    const ax = (v.x - f.lv.x) / Math.max(dt, 1e-3), ay = (v.y - f.lv.y) / Math.max(dt, 1e-3);
    f.lv.x = v.x; f.lv.y = v.y;
    const fx = clamp(-ax, -80, 80), fy = clamp(-12 - ay, -80, 80);
    for (const e of f.e) {
      e.vx += fx * dt * 0.9;
      e.vy += fy * dt * 0.9;
      const k = Math.exp(-2.2 * dt);
      e.vx *= k; e.vy *= k;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const d = Math.hypot(e.x, e.y);
      if (d > 1) {
        e.x /= d; e.y /= d;
        const vr = e.vx * e.x + e.vy * e.y;
        if (vr > 0) { e.vx -= 1.5 * vr * e.x; e.vy -= 1.5 * vr * e.y; }
      }
    }
    f.next -= dt;
    if (f.next <= 0) { f.blink = 0.13; f.next = 2 + Math.random() * 4; }
    f.blink = Math.max(0, f.blink - dt);
    const tv = sim.truck.chassis.getLinearVelocity();
    const rel = Math.hypot(v.x - tv.x, v.y - tv.y);
    f.mood = c.lost ? 'lost' : rel > 2.2 || sim.airT > 0.35 || Math.abs(Math.sin(sim.truck.chassis.getAngle())) > 0.45 || c.outT > 0 ? 'scared' : 'happy';
    if (f.mood === 'scared') f.scaredT = 0.4; else if (f.scaredT > 0) { f.scaredT -= dt; f.mood = 'scared'; }
  }

  interp(body, a) {
    const p = body.getPosition();
    if (body.px === undefined) return { x: p.x, y: p.y, a: body.getAngle() };
    return { x: lerpA(body.px, p.x, a), y: lerpA(body.py, p.y, a), a: lerpA(body.pa, body.getAngle(), a) };
  }

  // ---------- drawing ----------
  render(alpha) {
    const ctx = this.ctx;
    const sim = this.sim;
    const th = this.theme;
    const dpr = this.dpr;
    const s = this.baseScale() * this.cam.zoom;
    this.scale = s;
    const sh = this.shake * this.shake;
    const shx = (Math.random() - 0.5) * sh * 16, shy = (Math.random() - 0.5) * sh * 16;
    const cy = this.h * this.ay, cx = this.w * this.ax;
    this.view = {
      x0: this.cam.x - cx / s, x1: this.cam.x + (this.w - cx) / s,
      y0: this.cam.y - (this.h - cy) / s, y1: this.cam.y + cy / s,
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawBackground(ctx);

    const ox = cx - this.cam.x * s + shx, oy = cy + this.cam.y * s + shy;
    this.worldToScreen = (x, y) => ({ x: ox + x * s, y: oy - y * s });
    ctx.setTransform(dpr * s, 0, 0, -dpr * s, dpr * ox, dpr * oy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    this.drawProps(ctx, sim);
    this.drawBackObjects(ctx, sim, alpha);
    this.drawPits(ctx, sim);
    this.drawTerrain(ctx, sim);
    this.drawObjects(ctx, sim, alpha);
    this.drawCoins(ctx, sim);
    this.drawVehicle(ctx, sim, alpha);
    this.particles.draw(ctx, this.view);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawFloaters(ctx);
    this.drawSnow(ctx);
    if (!this.vignette) {
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.45, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.8);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(20,10,40,0.22)');
      this.vignette = g;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, this.w, this.h);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,250,230,${this.flash * 0.7})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    void th;
  }

  drawBackground(ctx) {
    const th = this.theme, w = this.w, h = this.h;
    if (!this.skyGrad) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, th.sky[0]);
      g.addColorStop(0.55, th.sky[1]);
      g.addColorStop(1, th.sky[2]);
      this.skyGrad = g;
    }
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, w, h);
    const s = this.scale;
    const camX = this.cam.x * s, camY = this.cam.y * s;
    if (th.stars) {
      const r = mulberry32(99);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 90; i++) {
        const x = ((r() * w * 1.5 - camX * 0.01) % w + w) % w, y = r() * h * 0.6;
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(this.time * (0.5 + r()) + i));
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (th.aurora) {
      for (let k = 0; k < 3; k++) {
        const ac = Array.isArray(th.aurora) ? th.aurora : ['rgba(90,220,255,0.10)', 'rgba(120,255,200,0.12)'];
        ctx.fillStyle = ac[k % 2];
        ctx.beginPath();
        ctx.moveTo(0, h * 0.1);
        for (let x = 0; x <= w; x += 20) {
          ctx.lineTo(x, h * (0.16 + k * 0.05) + Math.sin(x * 0.006 + this.time * 0.3 + k) * h * 0.05 - camX * 0);
        }
        for (let x = w; x >= 0; x -= 20) ctx.lineTo(x, h * (0.3 + k * 0.05) + Math.sin(x * 0.005 + this.time * 0.25 + k * 2) * h * 0.06);
        ctx.fill();
      }
    }
    // sun / moon
    const sx = w * 0.8 - (camX * 0.004) % 40, sy = h * 0.2;
    const sr = Math.min(w, h) * 0.075;
    ctx.fillStyle = th.sunGlow;
    circle(ctx, sx, sy, sr * 1.9); ctx.fill();
    if (th.earth) this.drawEarth(ctx, sx, sy, sr * 1.05);
    else {
      ctx.fillStyle = th.sun;
      circle(ctx, sx, sy, sr); ctx.fill();
    }
    if (th.moon) {
      ctx.fillStyle = th.sky[0];
      circle(ctx, sx + sr * 0.45, sy - sr * 0.25, sr * 0.85); ctx.fill();
    }
    // clouds
    const cr = mulberry32(7);
    for (let i = 0; i < (th.noClouds ? 0 : 7); i++) {
      const span = w + 500;
      const bx = cr() * span, by = h * (0.08 + cr() * 0.28), sz = (0.6 + cr() * 0.7) * Math.min(w, h) * 0.07;
      const x = (((bx - camX * 0.05 - this.time * (6 + i)) % span) + span) % span - 250;
      this.cloud(ctx, x, by - camY * 0.02, sz);
    }
    if (th.lava) {
      const g = ctx.createLinearGradient(0, h * 0.45, 0, h);
      g.addColorStop(0, 'rgba(255,120,50,0)');
      g.addColorStop(1, 'rgba(255,110,40,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.45, w, h * 0.55);
    }
    // parallax hill layers
    const layers = [
      { par: 0.1, base: 0.6, amp: 0.13, f: 0.0035, col: th.far, line: th.farLine, decor: false },
      { par: 0.22, base: 0.69, amp: 0.1, f: 0.005, col: th.mid, line: th.midLine, decor: true },
      { par: 0.4, base: 0.8, amp: 0.07, f: 0.007, col: th.near, line: th.nearLine, decor: true },
    ];
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const off = camX * L.par;
      const baseY = h * L.base + clamp(camY * L.par * 0.35, -h * 0.25, h * 0.25);
      const yAt = (x) => baseY - h * L.amp * this.shapeFn((x + off) * L.f * (720 / Math.max(h, 400)), li);
      ctx.beginPath();
      ctx.moveTo(-10, h + 10);
      for (let x = -10; x <= w + 12; x += 10) ctx.lineTo(x, yAt(x));
      ctx.lineTo(w + 12, h + 10);
      ctx.closePath();
      ctx.fillStyle = L.col;
      ctx.fill();
      if (th.shapes === 'peaks' && li === 0) {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        for (let x = -10; x <= w + 12; x += 16) ctx.lineTo(x, baseY - h * L.amp * 0.35 + Math.sin((x + off) * 0.05) * 5);
        ctx.lineTo(w + 12, 0);
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = L.line;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = -10; x <= w + 12; x += 10) { if (x === -10) ctx.moveTo(x, yAt(x)); else ctx.lineTo(x, yAt(x)); }
      ctx.stroke();
      if (th.lava && li === 0) {
        // glowing craters on the flat volcano tops
        ctx.fillStyle = '#ff8a3d';
        for (let x = -10; x <= w + 12; x += 6) {
          if (this.shapeFn((x + off) * L.f * (720 / Math.max(h, 400)), li) < 0.84) continue;
          ctx.globalAlpha = 0.55 + 0.25 * Math.sin(this.time * 2 + x * 0.05);
          ctx.fillRect(x - 3, yAt(x) - 1, 7, 4);
        }
        ctx.globalAlpha = 1;
      }
      if (L.decor) {
        const sp = li === 1 ? 120 : 170;
        const k0 = Math.floor((off - 60) / sp), k1 = Math.ceil((off + w + 60) / sp);
        for (let k = k0; k <= k1; k++) {
          const r = mulberry32(k * 131 + li * 7);
          if (r() < 0.35) continue;
          const x = k * sp + r() * sp * 0.7 - off;
          const sz = (li === 1 ? 0.035 : 0.055) * h * (0.7 + r() * 0.6);
          this.bgDecor(ctx, x, yAt(x) + 3, sz, li, r);
        }
      }
    }
  }

  drawEarth(ctx, x, y, r) {
    ctx.fillStyle = '#3f86e0';
    circle(ctx, x, y, r); ctx.fill();
    ctx.save();
    circle(ctx, x, y, r); ctx.clip();
    ctx.fillStyle = '#5cc27a';
    for (const [dx, dy, rr] of [[-0.35, -0.3, 0.38], [-0.1, -0.45, 0.25], [0.4, 0.25, 0.33], [0.2, 0.5, 0.22], [-0.5, 0.35, 0.2]]) {
      ctx.beginPath(); ctx.ellipse(x + dx * r, y + dy * r, rr * r, rr * r * 0.7, dx, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [dx, dy, rw] of [[-0.2, 0.05, 0.5], [0.3, -0.35, 0.35], [-0.1, 0.72, 0.4]]) {
      ctx.beginPath(); ctx.ellipse(x + dx * r, y + dy * r, rw * r, 0.07 * r, -0.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(4,6,20,0.45)';
    circle(ctx, x + r * 0.55, y + r * 0.2, r * 1.05); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(150,200,255,0.5)';
    ctx.lineWidth = 2;
    circle(ctx, x, y, r + 1); ctx.stroke();
  }

  shapeFn(u, li) {
    const t = this.theme.shapes;
    const tri = (x) => 1 - Math.abs(((x / Math.PI) % 2 + 2) % 2 - 1) * 2;
    if (t === 'volcano') {
      // steep cones, cut flat at the crater
      const c = Math.max(0, tri(u * 0.8 + li * 1.7));
      return Math.min(0.85, 1.25 * Math.pow(c, 1.6)) - 0.15 + 0.06 * Math.sin(u * 5.3);
    }
    if (t === 'craters') {
      const c = Math.cos(u * 2.6 + li * 1.3);
      const rim = 0.14 * Math.exp(-(((c - 0.7) / 0.1) ** 2));
      const bowl = c > 0.8 ? -0.3 * Math.sqrt((c - 0.8) / 0.2) : 0;
      return 0.3 * Math.sin(u * 0.8 + li) + 0.15 * Math.sin(u * 1.9 + 2) + rim + bowl;
    }
    if (t === 'mesa') {
      const v = Math.sin(u) * 1.6 + Math.sin(u * 2.3 + li) * 0.5;
      return clamp(v, -0.4, 0.9) + 0.1 * Math.sin(u * 7);
    }
    if (t === 'peaks') {
      const tri = (x) => 1 - Math.abs(((x / Math.PI) % 2 + 2) % 2 - 1) * 2;
      return 0.75 * tri(u + li) + 0.35 * tri(u * 2.7 + 1.3) - 0.1;
    }
    return 0.55 * Math.sin(u) + 0.3 * Math.sin(u * 2.1 + 1 + li) + 0.15 * Math.sin(u * 0.47 + 2);
  }

  cloud(ctx, x, y, s) {
    const th = this.theme;
    ctx.fillStyle = th.cloudShade;
    for (const [dx, dy, r] of [[-1.1, -0.1, 0.55], [0, -0.15, 0.8], [1.05, -0.1, 0.6], [0.4, 0.35, 0.6], [-0.5, 0.25, 0.55]]) {
      circle(ctx, x + dx * s, y - dy * s + s * 0.12, r * s); ctx.fill();
    }
    ctx.fillStyle = th.cloud;
    for (const [dx, dy, r] of [[-1.1, -0.1, 0.55], [0, -0.15, 0.8], [1.05, -0.1, 0.6], [0.4, 0.35, 0.6], [-0.5, 0.25, 0.55]]) {
      circle(ctx, x + dx * s, y - dy * s, r * s); ctx.fill();
    }
  }

  bgDecor(ctx, x, y, s, li, r) {
    const th = this.theme;
    const dim = li === 1 ? 0.75 : 1;
    ctx.save();
    ctx.globalAlpha = dim;
    if (th.decor === 'tree') {
      ctx.fillStyle = th.trunk;
      ctx.fillRect(x - s * 0.08, y - s * 0.9, s * 0.16, s * 0.9);
      ctx.fillStyle = r() < 0.5 ? th.treeA : th.treeB;
      circle(ctx, x, y - s * 1.2, s * 0.55); ctx.fill();
      circle(ctx, x - s * 0.3, y - s * 0.95, s * 0.38); ctx.fill();
      circle(ctx, x + s * 0.32, y - s * 0.98, s * 0.4); ctx.fill();
    } else if (th.decor === 'cactus') {
      ctx.fillStyle = r() < 0.5 ? th.treeA : th.treeB;
      rrect(ctx, x - s * 0.12, y - s * 1.3, s * 0.24, s * 1.3, s * 0.12); ctx.fill();
      rrect(ctx, x - s * 0.45, y - s * 0.95, s * 0.18, s * 0.5, s * 0.09); ctx.fill();
      rrect(ctx, x - s * 0.45, y - s * 0.62, s * 0.4, s * 0.16, s * 0.08); ctx.fill();
      rrect(ctx, x + s * 0.27, y - s * 1.1, s * 0.18, s * 0.55, s * 0.09); ctx.fill();
      rrect(ctx, x + s * 0.05, y - s * 0.72, s * 0.4, s * 0.16, s * 0.08); ctx.fill();
    } else if (th.decor === 'volcano') {
      ctx.strokeStyle = r() < 0.5 ? th.treeA : th.treeB;
      ctx.lineWidth = s * 0.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + s * 0.05, y - s * 1.25);
      ctx.moveTo(x, y - s * 0.6); ctx.lineTo(x - s * 0.38, y - s * 1.0);
      ctx.moveTo(x + s * 0.03, y - s * 0.85); ctx.lineTo(x + s * 0.34, y - s * 1.2);
      ctx.stroke();
    } else if (th.decor === 'moon') {
      if (r() < 0.55) {
        ctx.fillStyle = th.treeB;
        ctx.beginPath(); ctx.arc(x, y, s * 0.6, Math.PI, 0); ctx.fill();
        ctx.fillStyle = th.accent;
        ctx.fillRect(x - s * 0.1, y - s * 0.32, s * 0.2, s * 0.12);
      } else {
        ctx.strokeStyle = th.treeB;
        ctx.lineWidth = s * 0.07;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 1.1); ctx.stroke();
        ctx.fillStyle = th.treeA;
        ctx.beginPath(); ctx.ellipse(x, y - s * 1.1, s * 0.34, s * 0.14, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = th.accent;
        circle(ctx, x, y - s * 1.35, s * 0.06); ctx.fill();
      }
    } else {
      ctx.fillStyle = r() < 0.5 ? th.treeA : th.treeB;
      for (let i = 0; i < 3; i++) {
        const yy = y - s * (0.35 + i * 0.4), ww = s * (0.55 - i * 0.13);
        ctx.beginPath();
        ctx.moveTo(x - ww, yy); ctx.lineTo(x + ww, yy); ctx.lineTo(x, yy - s * 0.6);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = dim * 0.8;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.15, y - s * 1.3); ctx.lineTo(x + s * 0.15, y - s * 1.3); ctx.lineTo(x, y - s * 1.55);
      ctx.fill();
    }
    ctx.restore();
  }

  // trees, bushes, fences standing on the road side (behind terrain top)
  drawProps(ctx, sim) {
    const th = this.theme, v = this.view;
    for (const p of this.props) {
      if (p.x < v.x0 - 4 || p.x > v.x1 + 4) continue;
      const s = p.s;
      ctx.save();
      ctx.translate(p.x, p.y - 0.15);
      if (th.decor === 'tree') {
        if (p.kind === 0) {
          rrect(ctx, -0.12 * s, 0, 0.24 * s, 2.2 * s, 0.08);
          fillStroke(ctx, th.trunk, OUTLINE, 0.06);
          for (const [dx, dy, r] of [[0, 2.8, 1.0], [-0.7, 2.2, 0.7], [0.72, 2.25, 0.72]]) { circle(ctx, dx * s, dy * s, r * s); fillStroke(ctx, th.treeA, OUTLINE, 0.06); }
          circle(ctx, -0.25 * s, 3.05 * s, 0.35 * s); fillStroke(ctx, 'rgba(255,255,255,0.18)', null);
        } else if (p.kind === 1) {
          for (const [dx, r] of [[-0.55, 0.55], [0.45, 0.6], [0, 0.75]]) { circle(ctx, dx * s, 0.35 * s, r * s); fillStroke(ctx, th.treeB, OUTLINE, 0.06); }
        } else if (p.kind === 2) {
          this.fence(ctx, s, '#e9dcc0');
        } else {
          for (let i = 0; i < 4; i++) {
            const fx = (i - 1.5) * 0.4 * s;
            ctx.strokeStyle = th.topDark; ctx.lineWidth = 0.05;
            ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, 0.5 * s); ctx.stroke();
            circle(ctx, fx, 0.55 * s, 0.12 * s);
            fillStroke(ctx, ['#ff6b8b', '#ffd23f', '#ffffff', '#b18cff'][(i + Math.floor(p.k * 4)) % 4], OUTLINE, 0.03);
          }
        }
      } else if (th.decor === 'cactus') {
        if (p.kind <= 1) {
          rrect(ctx, -0.25 * s, 0, 0.5 * s, 2.3 * s, 0.25 * s); fillStroke(ctx, th.treeA, OUTLINE, 0.06);
          rrect(ctx, -0.95 * s, 0.9 * s, 0.35 * s, 0.9 * s, 0.17 * s); fillStroke(ctx, th.treeA, OUTLINE, 0.06);
          rrect(ctx, -0.95 * s, 0.9 * s, 0.8 * s, 0.32 * s, 0.16 * s); fillStroke(ctx, th.treeA, null);
          ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.05;
          ctx.beginPath(); ctx.moveTo(0, 0.2 * s); ctx.lineTo(0, 2.1 * s); ctx.stroke();
        } else if (p.kind === 2) {
          ctx.beginPath();
          ctx.moveTo(-1.1 * s, 0); ctx.lineTo(-0.8 * s, 0.9 * s); ctx.lineTo(0.2 * s, 1.1 * s); ctx.lineTo(0.9 * s, 0.6 * s); ctx.lineTo(1.1 * s, 0);
          ctx.closePath();
          fillStroke(ctx, th.stone, OUTLINE, 0.06);
        } else {
          this.fence(ctx, s, '#b98a5e');
        }
      } else if (th.decor === 'volcano') {
        this.volcanoProp(ctx, p, s);
      } else if (th.decor === 'moon') {
        this.moonProp(ctx, p, s);
      } else {
        if (p.kind <= 1) {
          rrect(ctx, -0.12 * s, 0, 0.24 * s, 0.6 * s, 0.05); fillStroke(ctx, th.trunk, OUTLINE, 0.05);
          for (let i = 0; i < 3; i++) {
            const yy = (0.5 + i * 0.75) * s, ww = (1.1 - i * 0.28) * s;
            ctx.beginPath(); ctx.moveTo(-ww, yy); ctx.lineTo(ww, yy); ctx.lineTo(0, yy + 1.1 * s); ctx.closePath();
            fillStroke(ctx, th.treeA, OUTLINE, 0.06);
            ctx.beginPath(); ctx.moveTo(-ww * 0.6, yy + 0.3 * s); ctx.lineTo(ww * 0.4, yy + 0.35 * s); ctx.lineTo(0, yy + 1.0 * s); ctx.closePath();
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
          }
        } else if (p.kind === 2) {
          // snowman
          circle(ctx, 0, 0.55 * s, 0.6 * s); fillStroke(ctx, '#ffffff', OUTLINE, 0.06);
          circle(ctx, 0, 1.4 * s, 0.42 * s); fillStroke(ctx, '#ffffff', OUTLINE, 0.06);
          ctx.fillStyle = OUTLINE;
          circle(ctx, -0.13 * s, 1.5 * s, 0.05 * s); ctx.fill();
          circle(ctx, 0.13 * s, 1.5 * s, 0.05 * s); ctx.fill();
          ctx.beginPath(); ctx.moveTo(0, 1.4 * s); ctx.lineTo(0.35 * s, 1.36 * s); ctx.lineTo(0, 1.32 * s); ctx.closePath();
          fillStroke(ctx, '#ff8a3d', null);
          rrect(ctx, -0.45 * s, 1.1 * s, 0.9 * s, 0.14 * s, 0.05); fillStroke(ctx, '#ff5a7a', OUTLINE, 0.04);
        } else {
          ctx.beginPath();
          ctx.moveTo(-1.0 * s, 0); ctx.lineTo(-0.6 * s, 0.7 * s); ctx.lineTo(0.3 * s, 0.9 * s); ctx.lineTo(1.0 * s, 0);
          ctx.closePath();
          fillStroke(ctx, th.stone, OUTLINE, 0.06);
          ctx.beginPath();
          ctx.moveTo(-0.75 * s, 0.45 * s); ctx.lineTo(-0.6 * s, 0.7 * s); ctx.lineTo(0.3 * s, 0.9 * s); ctx.lineTo(0.55 * s, 0.6 * s);
          ctx.closePath();
          fillStroke(ctx, '#ffffff', null);
        }
      }
      ctx.restore();
    }
    // tutorial / warning signs
    for (const sg of sim.track.signs) {
      if (sg.x < v.x0 - 4 || sg.x > v.x1 + 4) continue;
      this.drawSign(ctx, sg);
    }
    // start warehouse
    if (v.x0 < -2) this.drawWarehouse(ctx, -9.5, sim.groundAt(-9.5) ?? 0);
    const fx = sim.track.finishX;
    if (v.x1 > fx - 6 && v.x0 < fx + 30) this.drawDepot(ctx, fx, sim.track.finishY ?? 0);
  }

  volcanoProp(ctx, p, s) {
    const th = this.theme;
    if (p.kind === 0) {
      // charred tree
      ctx.lineCap = 'round';
      for (const [w, col] of [[0.34, OUTLINE], [0.22, th.treeA]]) {
        ctx.strokeStyle = col; ctx.lineWidth = w * s;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(0.1 * s, 2.4 * s);
        ctx.moveTo(0.04 * s, 1.1 * s); ctx.lineTo(-0.7 * s, 1.9 * s);
        ctx.moveTo(0.07 * s, 1.6 * s); ctx.lineTo(0.75 * s, 2.3 * s);
        ctx.stroke();
      }
    } else if (p.kind === 1) {
      // basalt boulder with glowing veins
      ctx.beginPath();
      ctx.moveTo(-1.0 * s, 0); ctx.lineTo(-0.7 * s, 0.8 * s); ctx.lineTo(0.1 * s, 1.05 * s); ctx.lineTo(0.85 * s, 0.6 * s); ctx.lineTo(1.0 * s, 0);
      ctx.closePath();
      fillStroke(ctx, th.stone, OUTLINE, 0.06);
      ctx.strokeStyle = '#ff8a3d';
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.time * 2.5 + p.k * 9);
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(-0.5 * s, 0.1 * s); ctx.lineTo(-0.2 * s, 0.5 * s); ctx.lineTo(0.2 * s, 0.6 * s);
      ctx.moveTo(0.3 * s, 0.1 * s); ctx.lineTo(0.5 * s, 0.45 * s);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (p.kind === 2) {
      // little steaming vent
      ctx.beginPath();
      ctx.moveTo(-0.9 * s, 0); ctx.quadraticCurveTo(-0.3 * s, 0.7 * s, 0, 0.55 * s); ctx.quadraticCurveTo(0.3 * s, 0.7 * s, 0.9 * s, 0);
      ctx.closePath();
      fillStroke(ctx, th.stoneDark, OUTLINE, 0.06);
      for (let i = 0; i < 3; i++) {
        const ph = (this.time * 0.45 + i / 3 + p.k) % 1;
        ctx.globalAlpha = 0.45 * (1 - ph);
        circle(ctx, Math.sin(ph * 5 + i) * 0.25 * s, (0.7 + ph * 2.6) * s, (0.22 + ph * 0.5) * s);
        ctx.fillStyle = '#d9cfd0'; ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      this.fence(ctx, s, '#6b4a3a');
    }
  }

  moonProp(ctx, p, s) {
    const th = this.theme;
    if (p.kind === 0) {
      // habitat dome
      rrect(ctx, -1.2 * s, 0, 2.4 * s, 0.35 * s, 0.08); fillStroke(ctx, '#8d95ad', OUTLINE, 0.05);
      ctx.beginPath(); ctx.arc(0, 0.35 * s, 1.0 * s, 0, Math.PI); ctx.closePath();
      fillStroke(ctx, 'rgba(170,220,255,0.55)', OUTLINE, 0.06);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.arc(0, 0.35 * s, 0.75 * s, 0.9, 1.6); ctx.stroke();
      circle(ctx, 0.3 * s, 0.75 * s, 0.12 * s); fillStroke(ctx, '#7de37a', null);
    } else if (p.kind === 1) {
      // satellite dish
      rrect(ctx, -0.07 * s, 0, 0.14 * s, 1.5 * s, 0.04); fillStroke(ctx, '#8d95ad', OUTLINE, 0.05);
      ctx.save();
      ctx.translate(0, 1.6 * s); ctx.rotate(0.5);
      ctx.beginPath(); ctx.ellipse(0, 0, 0.75 * s, 0.3 * s, 0, 0, Math.PI); ctx.closePath();
      fillStroke(ctx, '#e9edf6', OUTLINE, 0.05);
      ctx.restore();
      ctx.fillStyle = th.accent;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 3 + p.k * 7);
      circle(ctx, -0.2 * s, 2.05 * s, 0.09 * s); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.kind === 2) {
      // planted flag
      rrect(ctx, -0.05 * s, 0, 0.1 * s, 2.3 * s, 0.03); fillStroke(ctx, '#d9dde8', OUTLINE, 0.04);
      rrect(ctx, 0.05 * s, 1.55 * s, 1.0 * s, 0.65 * s, 0.04); fillStroke(ctx, '#ffd23f', OUTLINE, 0.05);
      rrect(ctx, 0.3 * s, 1.7 * s, 0.5 * s, 0.35 * s, 0.03); fillStroke(ctx, '#e0a352', null);
    } else {
      ctx.beginPath();
      ctx.moveTo(-1.0 * s, 0); ctx.lineTo(-0.6 * s, 0.6 * s); ctx.lineTo(0.3 * s, 0.8 * s); ctx.lineTo(1.0 * s, 0);
      ctx.closePath();
      fillStroke(ctx, th.stone, OUTLINE, 0.06);
      ctx.fillStyle = th.stoneDark;
      ctx.beginPath(); ctx.ellipse(-0.2 * s, 0.4 * s, 0.18 * s, 0.1 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.4 * s, 0.25 * s, 0.1 * s, 0.06 * s, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  fence(ctx, s, col) {
    for (let i = 0; i < 3; i++) {
      rrect(ctx, (-1.1 + i * 1.0) * s, 0, 0.18 * s, 1.1 * s, 0.05);
      fillStroke(ctx, col, OUTLINE, 0.05);
    }
    rrect(ctx, -1.25 * s, 0.55 * s, 2.3 * s, 0.16 * s, 0.05); fillStroke(ctx, col, OUTLINE, 0.05);
    rrect(ctx, -1.25 * s, 0.85 * s, 2.3 * s, 0.16 * s, 0.05); fillStroke(ctx, col, OUTLINE, 0.05);
  }

  signText(kind) {
    const touch = this.inputHint === 'touch';
    const T = {
      drive: touch ? ['HOLD', 'GAS  ▶'] : ['HOLD  →', 'TO DRIVE'],
      brake: touch ? ['◀ BRAKE', '& REVERSE'] : ['←  BRAKE', '& REVERSE'],
      tilt: touch ? ['IN THE AIR', 'GAS / BRAKE TILT'] : ['IN THE AIR', '← →  TILT'],
      careful: ['CARGO IS LOOSE', 'DRIVE GENTLY!'],
      fragile: ['FRAGILE!', 'SOFT LANDINGS'],
      slow: ['BUMPY ROAD', 'SLOW DOWN'],
      jump: ['JUMP AHEAD', 'SPEED UP!'],
      bridge: ['WOBBLY', 'BRIDGE'],
      seesaw: ['SEESAW', 'TAKE IT SLOW'],
      hammer: ['WATCH THE', 'SWING!'],
      wind: ['STRONG', 'WINDS'],
      ice: ['SLIPPERY', 'ICE!'],
      rocks: ['FALLING', 'ROCKS!'],
      boulder: ['DON\'T STOP!', 'RUN!!'],
      lift: ['STOP ON', 'THE LIFT'],
      ferry: ['STOP ON THE', 'PLATFORM'],
      boost: ['BOOST', 'PAD ▶▶'],
      bounce: ['BOUNCE', 'PAD!'],
      tnt: ['EXPLOSIVE!', 'DON\'T DROP IT'],
      retry: touch ? ['STUCK?', 'TAP ⟲ RETRY'] : ['STUCK?', 'PRESS R'],
      coins: ['GRAB THE', 'COINS!'],
      logs: ['LOGS', 'AHEAD'],
      stack: ['CRASH', 'THROUGH!'],
      home: ['ALMOST', 'THERE!'],
      lava: ['HOT LAVA!', 'DON\'T FALL IN'],
      geyser: ['GEYSERS!', 'WAIT FOR IT'],
      crumble: ['CRUMBLING', 'KEEP MOVING!'],
      piston: ['STAMPERS!', 'TIME IT RIGHT'],
      meteors: ['METEOR', 'SHOWER!'],
      lowgrav: ['LOW', 'GRAVITY'],
      moon: ['LOW GRAVITY', 'FLOATY JUMPS'],
    };
    return T[kind] || [kind.toUpperCase(), ''];
  }

  drawSign(ctx, sg) {
    const hazard = ['hammer', 'wind', 'ice', 'rocks', 'boulder', 'tnt', 'fragile', 'jump', 'slow', 'lava', 'geyser', 'crumble', 'piston', 'meteors'].includes(sg.kind);
    ctx.save();
    ctx.translate(sg.x, sg.y - 0.2);
    rrect(ctx, -0.09, 0, 0.18, 2.2, 0.05);
    fillStroke(ctx, '#8a5a3b', OUTLINE, 0.06);
    rrect(ctx, -1.35, 1.75, 2.7, 1.25, 0.14);
    fillStroke(ctx, hazard ? '#ffd23f' : '#f2dcb0', OUTLINE, 0.07);
    if (hazard) {
      ctx.save();
      rrect(ctx, -1.35, 1.75, 2.7, 1.25, 0.14);
      ctx.clip();
      ctx.fillStyle = OUTLINE;
      for (let i = -4; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(-1.4 + i * 0.4, 1.75); ctx.lineTo(-1.2 + i * 0.4, 1.75); ctx.lineTo(-1.0 + i * 0.4, 1.95); ctx.lineTo(-1.2 + i * 0.4, 1.95);
        ctx.fill();
      }
      ctx.restore();
    }
    const [a, b] = this.signText(sg.kind);
    worldText(ctx, a, 0, b ? 2.66 : 2.4, 0.36, OUTLINE, 'center', null, 0, 2.45);
    if (b) worldText(ctx, b, 0, 2.25, 0.32, hazard ? '#b53a2a' : '#8a4b2f', 'center', null, 0, 2.45);
    ctx.restore();
  }

  drawWarehouse(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y - 0.1);
    rrect(ctx, -4.2, 0, 8.4, 5.2, 0.15);
    fillStroke(ctx, '#e8d8c0', OUTLINE, 0.08);
    ctx.fillStyle = '#d6c2a4';
    for (let i = 0; i < 8; i++) ctx.fillRect(-4.1, 0.2 + i * 0.62, 8.2, 0.08);
    ctx.beginPath();
    ctx.moveTo(-4.7, 5.0); ctx.lineTo(4.7, 5.0); ctx.lineTo(3.9, 6.2); ctx.lineTo(-3.9, 6.2); ctx.closePath();
    fillStroke(ctx, '#e0584a', OUTLINE, 0.08);
    rrect(ctx, -2.2, 0, 4.4, 3.6, 0.1);
    fillStroke(ctx, '#8b94ad', OUTLINE, 0.07);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 6; i++) ctx.fillRect(-2.1, 0.3 + i * 0.55, 4.2, 0.08);
    rrect(ctx, -2.6, 3.95, 5.2, 0.85, 0.12);
    fillStroke(ctx, '#ffd23f', OUTLINE, 0.06);
    worldText(ctx, 'WOBBLY CO.', 0, 4.38, 0.55, OUTLINE);
    for (const [cx, cy] of [[-3.5, 0.35], [-3.5, 1.05], [3.4, 0.35]]) {
      rrect(ctx, cx - 0.35, cy - 0.35, 0.7, 0.7, 0.06);
      fillStroke(ctx, '#e0a352', OUTLINE, 0.05);
    }
    ctx.restore();
  }

  drawDepot(ctx, fx, y) {
    const t = this.time;
    ctx.save();
    ctx.translate(fx, y - 0.1);
    // arch posts
    for (const px of [-0.3, 5.3]) {
      rrect(ctx, px - 0.18, 0, 0.36, 5.4, 0.08);
      fillStroke(ctx, '#f5f5f5', OUTLINE, 0.07);
      ctx.fillStyle = '#ef4b4b';
      for (let i = 0; i < 5; i++) ctx.fillRect(px - 0.14, 0.4 + i * 1.0, 0.28, 0.45);
    }
    // banner with wave
    ctx.beginPath();
    const wv = (u) => Math.sin(t * 3 + u * 4) * 0.08;
    ctx.moveTo(-0.3, 5.3 + wv(0));
    for (let u = 0; u <= 1.001; u += 0.1) ctx.lineTo(-0.3 + u * 5.6, 5.3 + wv(u));
    for (let u = 1; u >= -0.001; u -= 0.1) ctx.lineTo(-0.3 + u * 5.6, 4.15 + wv(u));
    ctx.closePath();
    fillStroke(ctx, '#ffd23f', OUTLINE, 0.07);
    worldText(ctx, 'DELIVERY', 2.5, 4.75 + wv(0.5), 0.62, OUTLINE);
    // checkered finish line on ground
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 8; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#ffffff' : OUTLINE;
        ctx.fillRect(-0.25 + i * 0.25, 0.1 + j * 0.25, 0.25, 0.25);
      }
    }
    // depot house
    ctx.translate(15, 0);
    rrect(ctx, -3.8, 0, 9.5, 4.8, 0.15);
    fillStroke(ctx, '#7ec8e3', OUTLINE, 0.08);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 7; i++) ctx.fillRect(-3.7, 0.3 + i * 0.66, 9.3, 0.1);
    ctx.beginPath();
    ctx.moveTo(-4.4, 4.6); ctx.lineTo(6.3, 4.6); ctx.lineTo(4.8, 6.4); ctx.lineTo(-2.9, 6.4); ctx.closePath();
    fillStroke(ctx, '#3f6fd6', OUTLINE, 0.08);
    rrect(ctx, -2.8, 0, 4.2, 3.4, 0.1);
    fillStroke(ctx, '#3b3450', OUTLINE, 0.07);
    rrect(ctx, 2.2, 1.6, 2.4, 1.6, 0.1);
    fillStroke(ctx, '#fff3b0', OUTLINE, 0.06);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(3.4, 1.6); ctx.lineTo(3.4, 3.2); ctx.moveTo(2.2, 2.4); ctx.lineTo(4.6, 2.4); ctx.stroke();
    // parcel sign
    rrect(ctx, -1.6, 3.7, 1.8, 1.3, 0.1);
    fillStroke(ctx, '#ffffff', OUTLINE, 0.06);
    rrect(ctx, -1.15, 3.95, 0.9, 0.75, 0.06);
    fillStroke(ctx, '#e0a352', OUTLINE, 0.05);
    ctx.fillStyle = '#b8763a';
    ctx.fillRect(-0.76, 3.95, 0.12, 0.75);
    ctx.restore();
  }

  drawBackObjects(ctx, sim) {
    const v = this.view;
    for (const o of sim.objs) {
      if (o.type === 'hammer') {
        if (o.x < v.x0 - 8 || o.x > v.x1 + 8) continue;
        const py = o.y + 8.3;
        ctx.strokeStyle = OUTLINE;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(o.x + s * 3.6, o.y - 0.5);
          ctx.lineTo(o.x + s * 0.5, py + 0.3);
          ctx.lineWidth = 0.42; ctx.strokeStyle = OUTLINE; ctx.stroke();
          ctx.lineWidth = 0.28; ctx.strokeStyle = '#c9803f'; ctx.stroke();
        }
        rrect(ctx, o.x - 1.2, py, 2.4, 0.5, 0.1);
        fillStroke(ctx, '#c9803f', OUTLINE, 0.07);
      } else if (o.type === 'lift') {
        if (o.x < v.x0 - 8 || o.x > v.x1 + 8) continue;
        const top = Math.max(o.ay, o.by) + 3.2, bot = Math.min(o.ay, o.by) - 3;
        for (const s of [-1, 1]) {
          rrect(ctx, o.x + s * (o.w / 2 + 0.1) - 0.13, bot, 0.26, top - bot, 0.06);
          fillStroke(ctx, '#9aa3b8', OUTLINE, 0.05);
        }
        rrect(ctx, o.x - o.w / 2 - 0.4, top - 0.1, o.w + 0.8, 0.4, 0.08);
        fillStroke(ctx, '#ffd23f', OUTLINE, 0.06);
      } else if (o.type === 'ferry') {
        if (o.bx < v.x0 - 10 || o.ax > v.x1 + 10) continue;
        const h = o.y + 6.5;
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.06;
        ctx.beginPath(); ctx.moveTo(o.ax - o.w / 2 - 1, h); ctx.lineTo(o.bx + o.w / 2 + 1, h); ctx.stroke();
        for (const x of [o.ax - o.w / 2 - 1, o.bx + o.w / 2 + 1]) {
          rrect(ctx, x - 0.2, o.y - 0.5, 0.4, h - o.y + 1.0, 0.08);
          fillStroke(ctx, '#c9803f', OUTLINE, 0.06);
        }
        const p = o.body.getPosition();
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.moveTo(p.x - o.w / 2 + 0.2, p.y); ctx.lineTo(p.x, h);
        ctx.lineTo(p.x + o.w / 2 - 0.2, p.y);
        ctx.stroke();
        rrect(ctx, p.x - 0.35, h - 0.25, 0.7, 0.4, 0.1);
        fillStroke(ctx, '#ffd23f', OUTLINE, 0.05);
      } else if (o.type === 'bridge') {
        if (o.x1 < v.x0 - 4 || o.x0 > v.x1 + 4) continue;
        for (const x of [o.x0 - 0.2, o.x1 + 0.2]) {
          rrect(ctx, x - 0.15, o.y - 0.6, 0.3, 2.0, 0.06);
          fillStroke(ctx, '#8a5a3b', OUTLINE, 0.06);
        }
      } else if (o.type === 'piston') {
        if (o.x < v.x0 - 6 || o.x > v.x1 + 6) continue;
        const top = o.y + PISTON_UP + 1.9;
        for (const sx of [-1, 1]) {
          rrect(ctx, o.x + sx * (o.w / 2 + 0.35) - 0.16, o.y - 0.4, 0.32, top - o.y + 0.7, 0.06);
          fillStroke(ctx, '#8d95ad', OUTLINE, 0.06);
        }
        rrect(ctx, o.x - o.w / 2 - 0.8, top, o.w + 1.6, 0.6, 0.1);
        fillStroke(ctx, '#ffd23f', OUTLINE, 0.07);
        ctx.fillStyle = OUTLINE;
        for (let x = o.x - o.w / 2 - 0.6; x < o.x + o.w / 2 + 0.6; x += 0.5) {
          ctx.beginPath(); ctx.moveTo(x, top + 0.08); ctx.lineTo(x + 0.2, top + 0.08); ctx.lineTo(x + 0.4, top + 0.52); ctx.lineTo(x + 0.2, top + 0.52); ctx.fill();
        }
      }
    }
    for (const z of sim.track.zones) {
      if (z.type !== 'lowgrav' || z.x1 < v.x0 - 2 || z.x0 > v.x1 + 2) continue;
      const base = Math.min(sim.groundAt(z.x0 + 0.5) ?? 0, sim.groundAt(z.x1 - 0.5) ?? 0) - 1;
      const g = ctx.createLinearGradient(0, base, 0, base + 11);
      g.addColorStop(0, 'rgba(170,120,255,0.22)');
      g.addColorStop(1, 'rgba(170,120,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(z.x0, base, z.x1 - z.x0, 11);
      ctx.strokeStyle = 'rgba(210,180,255,0.5)';
      ctx.lineWidth = 0.05;
      for (let k = 0; k < 4; k++) {
        const ph = (this.time * 0.25 + k / 4) % 1;
        ctx.globalAlpha = 1 - ph;
        const yy = base + 1 + ph * 9;
        ctx.beginPath(); ctx.moveTo(z.x0, yy); ctx.lineTo(z.x1, yy); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const x of [z.x0, z.x1]) {
        const gy = sim.groundAt(x) ?? base;
        rrect(ctx, x - 0.18, gy - 0.3, 0.36, 2.5, 0.08);
        fillStroke(ctx, '#8d95ad', OUTLINE, 0.06);
        circle(ctx, x, gy + 2.35, 0.3);
        fillStroke(ctx, '#c9a2ff', OUTLINE, 0.05);
        ctx.fillStyle = 'rgba(200,160,255,0.35)';
        circle(ctx, x, gy + 2.35, 0.55 + 0.1 * Math.sin(this.time * 4)); ctx.fill();
      }
    }
  }

  drawPits(ctx, sim) {
    const v = this.view, th = this.theme;
    for (const p of sim.track.pits) {
      if (p.x1 < v.x0 || p.x0 > v.x1) continue;
      const top = Math.min(p.y0, p.y1) - 0.4;
      const g = ctx.createLinearGradient(0, top, 0, top - 9);
      g.addColorStop(0, th.dirtDark);
      g.addColorStop(1, th.pit);
      ctx.fillStyle = g;
      ctx.fillRect(p.x0 - 0.5, top - 60, p.x1 - p.x0 + 1, 60.01);
      // back wall rock stripes
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 4; i++) ctx.fillRect(p.x0, top - 1.2 - i * 1.6, p.x1 - p.x0, 0.35);
      if (th.lava) this.drawLava(ctx, p, top);
    }
  }

  drawLava(ctx, p, top) {
    const t = this.time;
    const ly = top - 1.5;
    const x0 = p.x0 - 0.5, x1 = p.x1 + 0.5;
    const glow = ctx.createLinearGradient(0, ly, 0, ly + 2.4);
    glow.addColorStop(0, 'rgba(255,140,50,0.55)');
    glow.addColorStop(1, 'rgba(255,140,50,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x0, ly, x1 - x0, 2.4);
    const g = ctx.createLinearGradient(0, ly, 0, ly - 4);
    g.addColorStop(0, '#ffc23a');
    g.addColorStop(0.35, '#ff6a1f');
    g.addColorStop(1, '#b3240f');
    ctx.beginPath();
    ctx.moveTo(x0, ly - 60);
    for (let x = x0; x <= x1 + 0.01; x += 0.4) ctx.lineTo(x, ly + 0.1 * Math.sin(x * 1.4 + t * 2.2) + 0.06 * Math.sin(x * 3.1 - t * 3));
    ctx.lineTo(x1, ly - 60);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    // cooler crust drifting on top
    ctx.fillStyle = 'rgba(120,30,10,0.45)';
    const w = x1 - x0;
    for (let i = 0; i < Math.ceil(w / 2.5); i++) {
      const x = x0 + ((i * 2.5 + t * 0.35 * (i % 2 ? 1 : -0.7)) % w + w) % w;
      ctx.beginPath(); ctx.ellipse(x, ly - 0.12, 0.5, 0.08, 0, 0, Math.PI * 2); ctx.fill();
    }
    // bubbles
    ctx.strokeStyle = '#ffe07a';
    ctx.lineWidth = 0.05;
    for (let i = 0; i < Math.ceil(w / 3); i++) {
      const ph = (t * 0.7 + i * 0.37) % 1;
      const bx = x0 + (((i * 0.618) % 1) * w);
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath(); ctx.arc(bx, ly, 0.08 + ph * 0.25, 0, Math.PI); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  surfacePath(ctx, pts, i0, i1, dy) {
    ctx.beginPath();
    ctx.moveTo(pts[i0].x, pts[i0].y + dy);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y + dy);
  }

  drawTerrain(ctx, sim) {
    const th = this.theme, v = this.view;
    const bottom = v.y0 - 2;
    for (const pts of sim.track.chains) {
      const n = pts.length;
      if (pts[n - 1].x < v.x0 - 1 || pts[0].x > v.x1 + 1) continue;
      let i0 = 1, i1 = n - 2;
      while (i0 < n - 2 && pts[i0 + 1].x < v.x0 - 1) i0++;
      while (i1 > i0 && pts[i1 - 1].x > v.x1 + 1) i1--;
      // dirt body
      ctx.beginPath();
      const startWall = i0 === 1;
      const endWall = i1 === n - 2;
      ctx.moveTo(pts[i0].x, Math.min(bottom, pts[i0].y - 1));
      for (let i = i0; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i1].x, Math.min(bottom, pts[i1].y - 1));
      ctx.closePath();
      ctx.fillStyle = th.dirt;
      ctx.fill();
      if (startWall || endWall) {
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        if (startWall) { ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[1].x, bottom); }
        if (endWall) { ctx.moveTo(pts[n - 2].x, pts[n - 2].y); ctx.lineTo(pts[n - 2].x, bottom); }
        ctx.stroke();
      }
      // strata band
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[i0].x, bottom);
      for (let i = i0; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i1].x, bottom);
      ctx.closePath();
      ctx.clip();
      this.surfacePath(ctx, pts, i0, i1, -1.6);
      ctx.strokeStyle = th.dirtBand;
      ctx.lineWidth = 0.9;
      ctx.stroke();
      this.surfacePath(ctx, pts, i0, i1, -3.6);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = th.dirtDark;
      ctx.stroke();
      // stones
      for (const st of this.stones) {
        if (st.x < pts[i0].x - 1 || st.x > pts[i1].x + 1 || st.y < bottom - 1) continue;
        ctx.save();
        ctx.translate(st.x, st.y);
        ctx.rotate(st.a);
        ctx.beginPath();
        const k = 6;
        for (let j = 0; j < k; j++) {
          const a = (j / k) * Math.PI * 2;
          const rr = st.r * (0.75 + ((st.k * (j + 3)) % 7) / 20);
          if (j === 0) ctx.moveTo(Math.cos(a) * rr * 1.3, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr * 1.3, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = th.lava && st.k % 6 === 0 ? '#e0602a' : th.stone;
        ctx.fill();
        ctx.strokeStyle = th.stoneDark;
        ctx.lineWidth = 0.05;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      // surface band
      this.surfacePath(ctx, pts, i0, i1, -0.24);
      ctx.strokeStyle = th.topDark;
      ctx.lineWidth = 0.56;
      ctx.stroke();
      this.surfacePath(ctx, pts, i0, i1, -0.19);
      ctx.strokeStyle = th.top;
      ctx.lineWidth = 0.4;
      ctx.stroke();
      // ice overlay
      for (let i = i0; i < i1; i++) {
        if (pts[i].m !== 'ice') continue;
        let j = i;
        while (j < i1 && pts[j].m === 'ice') j++;
        this.surfacePath(ctx, pts, i, j, -0.2);
        ctx.strokeStyle = th.ice;
        ctx.lineWidth = 0.44;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 0.06;
        ctx.setLineDash([0.5, 0.9]);
        this.surfacePath(ctx, pts, i, j, -0.12);
        ctx.stroke();
        ctx.setLineDash([]);
        i = j;
      }
      this.surfacePath(ctx, pts, i0, i1, -0.06);
      ctx.strokeStyle = th.topLight;
      ctx.lineWidth = 0.06;
      ctx.stroke();
      this.surfacePath(ctx, pts, i0, i1, 0);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.08;
      ctx.stroke();
    }
    // tufts
    const deco = th.decor;
    ctx.lineWidth = 0.05;
    for (const t of this.tufts) {
      if (t.x < v.x0 - 1 || t.x > v.x1 + 1) continue;
      if (deco === 'tree') {
        ctx.strokeStyle = th.topDark;
        ctx.beginPath();
        ctx.moveTo(t.x - 0.12 * t.s, t.y); ctx.lineTo(t.x - 0.18 * t.s, t.y + 0.22 * t.s);
        ctx.moveTo(t.x, t.y); ctx.lineTo(t.x, t.y + 0.3 * t.s);
        ctx.moveTo(t.x + 0.12 * t.s, t.y); ctx.lineTo(t.x + 0.2 * t.s, t.y + 0.2 * t.s);
        ctx.stroke();
        if (t.k > 0.85) {
          circle(ctx, t.x, t.y + 0.32 * t.s, 0.07);
          fillStroke(ctx, t.k > 0.93 ? '#ff6b8b' : '#ffffff', null);
        }
      } else if (deco === 'volcano') {
        if (t.k > 0.8) {
          ctx.fillStyle = '#ff8a3d';
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 3 + t.k * 40);
          circle(ctx, t.x, t.y - 0.1, 0.06 * t.s); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else if (deco === 'moon') {
        if (t.k > 0.72) {
          ctx.strokeStyle = th.topDark;
          ctx.beginPath(); ctx.ellipse(t.x, t.y - 0.14, 0.26 * t.s, 0.06 * t.s, 0, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (deco === 'cactus') {
        if (t.k > 0.7) {
          ctx.fillStyle = th.stone;
          circle(ctx, t.x, t.y + 0.02, 0.1 * t.s); ctx.fill();
        }
      } else if (t.k > 0.6) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(t.x, t.y + 0.02, 0.25 * t.s, 0.09 * t.s, 0, 0, Math.PI);
        ctx.fill();
      }
    }
  }

  drawObjects(ctx, sim, alpha) {
    const v = this.view, th = this.theme;
    for (const o of sim.objs) {
      switch (o.type) {
        case 'log': {
          if (o.x < v.x0 - 2 || o.x > v.x1 + 2) break;
          circle(ctx, o.x, o.y, o.r);
          fillStroke(ctx, '#8a5a3b', OUTLINE, 0.06);
          circle(ctx, o.x, o.y, o.r * 0.72);
          fillStroke(ctx, '#e8c088', null);
          circle(ctx, o.x, o.y, o.r * 0.4);
          ctx.strokeStyle = '#b8864f'; ctx.lineWidth = 0.035; ctx.stroke();
          break;
        }
        case 'bouncer': {
          if (o.x < v.x0 - 3 || o.x > v.x1 + 3) break;
          const k = clamp((this.time - this.bounceT) / 0.35, 0, 1);
          const ext = 0.15 + 0.25 * Math.sin(k * Math.PI) * (1 - k);
          rrect(ctx, o.x - o.w / 2, o.y - 0.05, o.w, 0.14, 0.05);
          fillStroke(ctx, '#4a4a5e', OUTLINE, 0.05);
          ctx.strokeStyle = '#c9ccd8';
          ctx.lineWidth = 0.06;
          ctx.beginPath();
          for (let i = 0; i <= 8; i++) ctx.lineTo(o.x - o.w / 2 + 0.2 + (i * (o.w - 0.4)) / 8, o.y + 0.1 + (i % 2 ? ext : 0));
          ctx.stroke();
          rrect(ctx, o.x - o.w / 2, o.y + 0.08 + ext, o.w, 0.14, 0.06);
          fillStroke(ctx, '#ff5ea8', OUTLINE, 0.05);
          break;
        }
        case 'boost': {
          if (o.x1 < v.x0 || o.x0 > v.x1) break;
          for (let x = o.x0; x < o.x1 - 0.4; x += 0.9) {
            const ph = (this.time * 3 - x * 0.6) % 1;
            ctx.fillStyle = ph < 0.5 ? '#ffb13d' : '#ffe14d';
            ctx.beginPath();
            ctx.moveTo(x, o.y + 0.02); ctx.lineTo(x + 0.35, o.y + 0.02); ctx.lineTo(x + 0.7, o.y + 0.2); ctx.lineTo(x + 0.35, o.y + 0.38); ctx.lineTo(x, o.y + 0.38); ctx.lineTo(x + 0.35, o.y + 0.2);
            ctx.closePath();
            fillStroke(ctx, null, OUTLINE, 0.03);
            ctx.fill();
          }
          break;
        }
        case 'bridge': {
          if (o.x1 < v.x0 - 2 || o.x0 > v.x1 + 2) break;
          const tops = [];
          for (const b of o.bodies) {
            const p = this.interp(b, alpha);
            const pw = (o.x1 - o.x0) / o.n;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.a);
            rrect(ctx, -pw / 2 + 0.02, -0.13, pw - 0.04, 0.26, 0.05);
            fillStroke(ctx, '#c9803f', OUTLINE, 0.05);
            ctx.fillStyle = '#8a5a3b';
            ctx.fillRect(-pw / 2 + 0.1, 0.02, 0.05, 0.05);
            ctx.fillRect(pw / 2 - 0.15, 0.02, 0.05, 0.05);
            ctx.restore();
            tops.push({ x: p.x, y: p.y + 0.9 });
          }
          ctx.strokeStyle = '#6b4a2f';
          ctx.lineWidth = 0.06;
          ctx.beginPath();
          ctx.moveTo(o.x0 - 0.2, o.y + 1.3);
          for (const t of tops) ctx.lineTo(t.x, t.y);
          ctx.lineTo(o.x1 + 0.2, o.y + 1.3);
          ctx.stroke();
          ctx.lineWidth = 0.03;
          ctx.beginPath();
          for (const t of tops) { ctx.moveTo(t.x, t.y); ctx.lineTo(t.x, t.y - 0.8); }
          ctx.stroke();
          break;
        }
        case 'ferry': case 'lift': {
          const p = this.interp(o.body, alpha);
          if (p.x < v.x0 - 6 || p.x > v.x1 + 6) break;
          rrect(ctx, p.x - o.w / 2, p.y - 0.22, o.w, 0.44, 0.08);
          fillStroke(ctx, '#6f7894', OUTLINE, 0.06);
          ctx.save();
          rrect(ctx, p.x - o.w / 2, p.y - 0.22, o.w, 0.44, 0.08);
          ctx.clip();
          ctx.fillStyle = '#ffd23f';
          ctx.fillRect(p.x - o.w / 2, p.y + 0.08, o.w, 0.14);
          ctx.fillStyle = OUTLINE;
          for (let x = p.x - o.w / 2; x < p.x + o.w / 2; x += 0.4) {
            ctx.beginPath(); ctx.moveTo(x, p.y + 0.08); ctx.lineTo(x + 0.18, p.y + 0.08); ctx.lineTo(x + 0.32, p.y + 0.22); ctx.lineTo(x + 0.14, p.y + 0.22); ctx.fill();
          }
          ctx.restore();
          break;
        }
        case 'seesaw': {
          if (o.x < v.x0 - 8 || o.x > v.x1 + 8) break;
          ctx.beginPath();
          ctx.moveTo(o.x - 0.7, o.y - 0.05); ctx.lineTo(o.x + 0.7, o.y - 0.05); ctx.lineTo(o.x, o.pivotY + 0.05);
          ctx.closePath();
          fillStroke(ctx, '#9aa3b8', OUTLINE, 0.06);
          const b = o.bodies[0];
          const p = this.interp(b, alpha);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.a);
          rrect(ctx, -o.len / 2, -0.14, o.len, 0.28, 0.08);
          fillStroke(ctx, '#e0a352', OUTLINE, 0.06);
          ctx.fillStyle = '#b8763a';
          for (let x = -o.len / 2 + 0.5; x < o.len / 2; x += 1.2) ctx.fillRect(x, -0.1, 0.06, 0.2);
          ctx.restore();
          circle(ctx, o.x, o.pivotY, 0.1);
          fillStroke(ctx, '#4a4a5e', OUTLINE, 0.04);
          break;
        }
        case 'roller': {
          const b = o.bodies[0];
          const p = this.interp(b, alpha);
          if (p.x < v.x0 - 2 || p.x > v.x1 + 2) break;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.a);
          circle(ctx, 0, 0, o.r);
          fillStroke(ctx, '#8a5a3b', OUTLINE, 0.06);
          circle(ctx, 0, 0, o.r * 0.72);
          fillStroke(ctx, '#e8c088', null);
          ctx.strokeStyle = '#b8864f'; ctx.lineWidth = 0.035;
          ctx.beginPath(); ctx.moveTo(-o.r * 0.5, 0); ctx.lineTo(o.r * 0.5, 0); ctx.stroke();
          ctx.restore();
          break;
        }
        case 'stack': {
          for (const b of o.bodies) {
            const p = this.interp(b, alpha);
            if (p.x < v.x0 - 2 || p.x > v.x1 + 2) continue;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.a);
            const s = o.size / 2;
            rrect(ctx, -s, -s, s * 2, s * 2, 0.06);
            fillStroke(ctx, '#a7b0c8', OUTLINE, 0.05);
            ctx.strokeStyle = '#7f89a6'; ctx.lineWidth = 0.05;
            ctx.strokeRect(-s + 0.08, -s + 0.08, s * 2 - 0.16, s * 2 - 0.16);
            ctx.restore();
          }
          break;
        }
        case 'hammer': {
          const p = this.interp(o.body, alpha);
          if (p.x < v.x0 - 8 || p.x > v.x1 + 8) break;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.a);
          ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.22;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -5.1); ctx.stroke();
          ctx.strokeStyle = '#9aa3b8'; ctx.lineWidth = 0.12;
          ctx.stroke();
          circle(ctx, 0, -5.7, 0.74);
          fillStroke(ctx, '#4a4a5e', OUTLINE, 0.08);
          circle(ctx, -0.22, -5.45, 0.2);
          fillStroke(ctx, 'rgba(255,255,255,0.3)', null);
          ctx.restore();
          circle(ctx, p.x, p.y, 0.18);
          fillStroke(ctx, '#ffd23f', OUTLINE, 0.05);
          break;
        }
        case 'chase': case 'rockfall': {
          for (const b of o.bodies) {
            const p = this.interp(b, alpha);
            if (p.x < v.x0 - 3 || p.x > v.x1 + 3) continue;
            const f = b.getFixtureList();
            const shape = f.getShape();
            if (o.type === 'rockfall') {
              // ground shadow grows as the rock drops, so players can read where it lands
              const gy = this.sim.groundAt(p.x);
              const hgt = gy == null ? 99 : p.y - gy;
              if (hgt > 0.8 && hgt < 16) {
                ctx.fillStyle = `rgba(20,10,30,${(0.45 * (1 - hgt / 16)).toFixed(3)})`;
                ctx.beginPath();
                ctx.ellipse(p.x, gy + 0.05, 0.9 * (1.2 - hgt / 26), 0.18, 0, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.a);
            if (o.type === 'chase') {
              const r = shape.getRadius();
              const snow = th.id.startsWith('snow');
              if (th.lava) { ctx.fillStyle = 'rgba(255,120,40,0.3)'; circle(ctx, 0, 0, r * 1.25); ctx.fill(); }
              circle(ctx, 0, 0, r);
              fillStroke(ctx, snow ? '#f4fbff' : th.lava ? '#4a2a24' : th.stone, OUTLINE, 0.08);
              ctx.strokeStyle = snow ? '#c3dcf0' : th.lava ? '#ff8a3d' : th.stoneDark;
              ctx.lineWidth = 0.08;
              ctx.beginPath();
              ctx.arc(0, 0, r * 0.6, 0.3, 1.6);
              ctx.moveTo(-r * 0.5, -r * 0.2); ctx.lineTo(-r * 0.1, r * 0.3);
              ctx.stroke();
              circle(ctx, -r * 0.35, r * 0.4, r * 0.18);
              fillStroke(ctx, 'rgba(255,255,255,0.3)', null);
            } else {
              const vs = shape.m_vertices;
              if (th.lava) { ctx.fillStyle = 'rgba(255,130,40,0.35)'; circle(ctx, 0, 0, 0.6); ctx.fill(); }
              ctx.beginPath();
              vs.forEach((vv, i) => (i ? ctx.lineTo(vv.x, vv.y) : ctx.moveTo(vv.x, vv.y)));
              ctx.closePath();
              fillStroke(ctx, th.lava ? '#3d2a2a' : th.stone, OUTLINE, 0.05);
              if (th.lava) {
                ctx.strokeStyle = '#ff9a2f'; ctx.lineWidth = 0.05;
                ctx.beginPath(); ctx.moveTo(vs[0].x * 0.6, vs[0].y * 0.6); ctx.lineTo(0, 0); ctx.lineTo(vs[3].x * 0.6, vs[3].y * 0.6); ctx.stroke();
              }
            }
            ctx.restore();
          }
          break;
        }
        case 'geyser': this.drawGeyser(ctx, sim, o); break;
        case 'crumble': this.drawSlabs(ctx, o, alpha); break;
        case 'piston': this.drawPiston(ctx, sim, o, alpha); break;
        case 'meteors': this.drawMeteors(ctx, o, alpha); break;
        default: break;
      }
    }
  }

  drawGeyser(ctx, sim, o) {
    const v = this.view, th = this.theme;
    if (o.x < v.x0 - 4 || o.x > v.x1 + 4) return;
    const st = geyserState(o, sim.time);
    const hw = o.w / 2;
    if (st === 2) {
      const u = ((((sim.time / o.period + o.phase) % 1) + 1) % 1) * o.period / GEYSER_ERUPT;
      const H = 8.5 * Math.min(1, u * 6) * (u > 0.8 ? (1 - u) / 0.2 : 1) * o.power;
      const g = ctx.createLinearGradient(0, o.y, 0, o.y + H);
      g.addColorStop(0, th.lava ? 'rgba(255,225,200,0.9)' : 'rgba(235,248,255,0.9)');
      g.addColorStop(1, 'rgba(235,248,255,0.25)');
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let y = 0; y <= H; y += 0.4) ctx.lineTo(o.x - hw * 0.6 - y * 0.05 + Math.sin(y * 1.7 - this.time * 14) * 0.12, o.y + y);
      for (let y = H; y >= 0; y -= 0.4) ctx.lineTo(o.x + hw * 0.6 + y * 0.05 + Math.sin(y * 1.9 - this.time * 13 + 1) * 0.12, o.y + y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(245,250,255,0.7)';
      for (const [dx, r] of [[-0.6, 0.55], [0.1, 0.75], [0.7, 0.5]]) { circle(ctx, o.x + dx, o.y + H + r * 0.3, r * Math.min(1, H / 4)); ctx.fill(); }
    }
    // vent mound
    ctx.beginPath();
    ctx.moveTo(o.x - hw - 0.5, o.y + 0.02);
    ctx.quadraticCurveTo(o.x - hw, o.y + 0.5, o.x - hw * 0.55, o.y + 0.42);
    ctx.lineTo(o.x + hw * 0.55, o.y + 0.42);
    ctx.quadraticCurveTo(o.x + hw, o.y + 0.5, o.x + hw + 0.5, o.y + 0.02);
    ctx.closePath();
    fillStroke(ctx, th.stoneDark, OUTLINE, 0.06);
    const warn = st === 1 ? 0.5 + 0.5 * Math.sin(this.time * 14) : st === 2 ? 1 : 0.15;
    ctx.fillStyle = th.lava ? `rgba(255,140,50,${warn.toFixed(2)})` : `rgba(160,220,255,${warn.toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(o.x, o.y + 0.4, hw * 0.55, 0.1, 0, 0, Math.PI * 2); ctx.fill();
  }

  drawSlabs(ctx, o, alpha) {
    const v = this.view, th = this.theme;
    if (o.x1 < v.x0 - 2 || o.x0 > v.x1 + 2) return;
    const pw = (o.x1 - o.x0) / o.n;
    for (const sl of o.slabs) {
      if (sl.gone) continue;
      const p = this.interp(sl.body, alpha);
      const warn = sl.fallAt && !sl.fell;
      const sx = warn ? Math.sin(this.time * 70 + p.x * 3) * 0.035 : 0;
      ctx.save();
      ctx.translate(p.x + sx, p.y);
      ctx.rotate(p.a);
      rrect(ctx, -pw / 2 + 0.03, -0.2, pw - 0.06, 0.4, 0.07);
      fillStroke(ctx, th.stone, OUTLINE, 0.05);
      ctx.fillStyle = th.top;
      ctx.fillRect(-pw / 2 + 0.08, 0.1, pw - 0.16, 0.07);
      ctx.strokeStyle = warn || sl.fell ? '#ff8a3d' : th.stoneDark;
      ctx.lineWidth = warn || sl.fell ? 0.06 : 0.04;
      ctx.beginPath();
      ctx.moveTo(-pw * 0.22, 0.2); ctx.lineTo(-pw * 0.05, 0.02); ctx.lineTo(-pw * 0.14, -0.2);
      ctx.moveTo(pw * 0.2, 0.2); ctx.lineTo(pw * 0.08, -0.04);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPiston(ctx, sim, o, alpha) {
    const v = this.view;
    const p = this.interp(o.body, alpha);
    if (p.x < v.x0 - 5 || p.x > v.x1 + 5) return;
    const hw = o.w / 2, top = o.y + PISTON_UP + 1.9;
    // shadow grows as the stamp comes down
    const hgt = p.y - 0.55 - o.y;
    ctx.fillStyle = `rgba(20,10,30,${(0.35 * (1 - clamp(hgt / PISTON_UP, 0, 1))).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(p.x, o.y + 0.04, hw * 1.05, 0.14, 0, 0, Math.PI * 2); ctx.fill();
    rrect(ctx, p.x - 0.24, p.y + 0.5, 0.48, Math.max(0.1, top - p.y - 0.5), 0.08);
    fillStroke(ctx, '#c9ccd8', OUTLINE, 0.05);
    rrect(ctx, p.x - hw, p.y - 0.55, o.w, 1.1, 0.12);
    fillStroke(ctx, '#6f7894', OUTLINE, 0.07);
    ctx.save();
    rrect(ctx, p.x - hw, p.y - 0.55, o.w, 1.1, 0.12);
    ctx.clip();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(p.x - hw, p.y - 0.55, o.w, 0.32);
    ctx.fillStyle = OUTLINE;
    for (let x = p.x - hw - 0.3; x < p.x + hw; x += 0.4) {
      ctx.beginPath(); ctx.moveTo(x, p.y - 0.55); ctx.lineTo(x + 0.18, p.y - 0.55); ctx.lineTo(x + 0.34, p.y - 0.23); ctx.lineTo(x + 0.16, p.y - 0.23); ctx.fill();
    }
    ctx.restore();
    // warning lamp blinks just before the slam
    const u = ((((sim.time / o.period + o.phase) % 1) + 1) % 1) * o.period;
    const soon = u > o.period - 0.9 || u < 0.3;
    circle(ctx, p.x, p.y + 0.2, 0.17);
    fillStroke(ctx, soon && Math.sin(this.time * 30) > 0 ? '#ff4d4d' : '#7a3a3a', OUTLINE, 0.04);
    void pistonHeight;
  }

  drawMeteors(ctx, o, alpha) {
    const v = this.view;
    for (const b of o.bodies) {
      const u = b.getFixtureList().getUserData();
      const p = this.interp(b, alpha);
      if (!u.dieAt && u.tx > v.x0 - 2 && u.tx < v.x1 + 2) {
        // landing marker
        const k = clamp(1 - (p.y - u.gy) / 15, 0, 1);
        ctx.strokeStyle = `rgba(255,70,70,${(0.35 + 0.6 * k).toFixed(3)})`;
        ctx.lineWidth = 0.08;
        ctx.beginPath(); ctx.ellipse(u.tx, u.gy + 0.06, 0.4 + 0.5 * k, 0.12 + 0.08 * k, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(u.tx - 0.25, u.gy - 0.02); ctx.lineTo(u.tx + 0.25, u.gy + 0.14);
        ctx.moveTo(u.tx - 0.25, u.gy + 0.14); ctx.lineTo(u.tx + 0.25, u.gy - 0.02);
        ctx.stroke();
      }
      if (p.x < v.x0 - 4 || p.x > v.x1 + 4) continue;
      const vel = b.getLinearVelocity();
      const sp = Math.hypot(vel.x, vel.y) || 1;
      const dx = -vel.x / sp, dy = -vel.y / sp;
      const r = u.r;
      ctx.fillStyle = 'rgba(255,170,80,0.5)';
      ctx.beginPath();
      ctx.moveTo(p.x - dy * r, p.y + dx * r);
      ctx.lineTo(p.x + dx * 3.4, p.y + dy * 3.4);
      ctx.lineTo(p.x + dy * r, p.y - dx * r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,200,120,0.35)';
      circle(ctx, p.x, p.y, r * 1.7); ctx.fill();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, rr = r * (0.85 + ((i * 37) % 5) * 0.05);
        if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      fillStroke(ctx, '#5e4f5c', OUTLINE, 0.05);
      ctx.strokeStyle = '#ff9a2f'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.1); ctx.lineTo(0, r * 0.2); ctx.lineTo(r * 0.35, -r * 0.25); ctx.stroke();
      ctx.restore();
    }
  }

  drawCoins(ctx, sim) {
    const v = this.view;
    for (const c of sim.coins) {
      if (c.taken || c.x < v.x0 - 1 || c.x > v.x1 + 1) continue;
      const sx = Math.cos(this.time * 3.2 + c.x * 0.4);
      ctx.save();
      ctx.translate(c.x, c.y + Math.sin(this.time * 2 + c.x) * 0.06);
      ctx.scale(Math.max(0.12, Math.abs(sx)), 1);
      circle(ctx, 0, 0, 0.3);
      fillStroke(ctx, '#ffcf3f', OUTLINE, 0.06);
      circle(ctx, 0, 0, 0.2);
      fillStroke(ctx, '#f0a818', null);
      ctx.fillStyle = '#fff1a8';
      starPath(ctx, 0.13);
      ctx.fill();
      ctx.restore();
    }
  }

  drawVehicle(ctx, sim, alpha) {
    const t = sim.truck;
    const cp = this.interp(t.chassis, alpha);
    const rp = this.interp(t.rear, alpha), fp = this.interp(t.front, alpha);
    const skin = this.skin, hat = this.hat;
    // suspension struts
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    const ca = Math.cos(cp.a), sa = Math.sin(cp.a);
    const toW = (lx, ly) => ({ x: cp.x + lx * ca - ly * sa, y: cp.y + lx * sa + ly * ca });
    for (const [wp, ax] of [[rp, TRUCK.rear.x], [fp, TRUCK.front.x]]) {
      const top = toW(ax, -0.3);
      ctx.moveTo(top.x, top.y); ctx.lineTo(wp.x, wp.y);
    }
    ctx.stroke();

    ctx.save();
    ctx.translate(cp.x, cp.y);
    ctx.rotate(cp.a);
    drawTruckBack(ctx, skin, hat, { time: this.time, bobX: this.bobX, bobY: this.bobY });
    ctx.restore();

    // cargo
    for (const c of sim.cargo) {
      if (c.broken) continue;
      const p = this.interp(c.body, alpha);
      if (p.x < this.view.x0 - 2 || p.x > this.view.x1 + 2) continue;
      const f = this.faces.get(c.id);
      let face = null;
      if (f) {
        const ca2 = Math.cos(-p.a), sa2 = Math.sin(-p.a);
        face = {
          mood: f.mood, blink: f.blink > 0 && f.mood !== 'scared',
          pupils: f.e.map((e) => ({ x: e.x * ca2 - e.y * sa2, y: e.x * sa2 + e.y * ca2 })),
        };
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      drawCargo(ctx, c.type, c.def, face, this.time);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cp.x, cp.y);
    ctx.rotate(cp.a);
    drawTruckFront(ctx, skin, { time: this.time });
    ctx.restore();
    drawWheel(ctx, rp.x, rp.y, rp.a, skin);
    drawWheel(ctx, fp.x, fp.y, fp.a, skin);
  }

  drawFloaters(ctx) {
    for (const f of this.floaters) {
      const p = this.worldToScreen(f.x, f.y);
      const k = f.life / f.max;
      const pop = Math.min(1, (1 - k) * 8);
      const sc = (0.6 + 0.4 * pop) * (f.size / 26) * clamp(this.scale / 45, 0.75, 1.5);
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.translate(p.x, p.y);
      ctx.scale(sc, sc);
      ctx.font = '26px LilitaOne, "Lilita One", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (f.bubble) {
        const tw = ctx.measureText(f.text).width + 22;
        rrect(ctx, -tw / 2, -20, tw, 38, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-8, 16); ctx.lineTo(0, 30); ctx.lineTo(6, 16);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = OUTLINE;
        rrect(ctx, -tw / 2, -20, tw, 38, 16);
        ctx.stroke();
        ctx.fillStyle = OUTLINE;
        ctx.fillText(f.text, 0, 0);
      } else {
        ctx.lineJoin = 'round';
        ctx.lineWidth = 7;
        ctx.strokeStyle = OUTLINE;
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, 0, 0);
      }
      ctx.restore();
    }
  }

  drawSnow(ctx) {
    if (!this.flakes.length) return;
    const w = this.w, h = this.h;
    if (this.theme.embers) {
      // glowing ash drifting up from the lava
      ctx.fillStyle = '#ffb35a';
      for (const f of this.flakes) {
        const x = ((f.x * w + Math.sin(this.time * 0.6 + f.p) * 26 - this.cam.x * this.scale * 0.3 * f.s) % w + w) % w;
        const y = ((f.y * h - this.time * 22 * f.s + this.cam.y * this.scale * 0.3) % h + h) % h;
        ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(this.time * 2.3 + f.p * 3));
        circle(ctx, x, y, 1.1 * f.s);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const f of this.flakes) {
      const x = ((f.x * w + Math.sin(this.time * 0.8 + f.p) * 20 - this.cam.x * this.scale * 0.6 * f.s * 0.5) % w + w) % w;
      const y = ((f.y * h + this.time * 30 * f.s + this.cam.y * this.scale * 0.3) % h + h) % h;
      circle(ctx, x, y, 1.5 * f.s);
      ctx.fill();
    }
  }
}

export { shade };
