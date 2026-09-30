import { OUTLINE } from './themes.js';

// type: 0 dust, 1 chunk, 2 confetti, 3 spark, 4 drop, 5 smoke, 6 snow, 7 star, 8 ring, 9 streak
const MAX = 700;

export class Particles {
  constructor() {
    this.list = [];
  }

  clear() { this.list.length = 0; }

  add(p) {
    if (this.list.length >= MAX) this.list.shift();
    p.life = p.life ?? 1;
    p.max = p.life;
    p.vx = p.vx || 0; p.vy = p.vy || 0;
    p.rot = p.rot || 0; p.vr = p.vr || 0;
    p.g = p.g ?? 0;
    p.drag = p.drag ?? 0;
    this.list.push(p);
    return p;
  }

  dust(x, y, color, n = 4, spread = 1, up = 1) {
    for (let i = 0; i < n; i++) {
      this.add({ t: 0, x: x + (Math.random() - 0.5) * 0.4, y: y + Math.random() * 0.2, vx: (Math.random() - 0.5) * 2.2 * spread, vy: Math.random() * 1.5 * up, size: 0.18 + Math.random() * 0.22, grow: 0.9, color, life: 0.5 + Math.random() * 0.4, drag: 2.5 });
    }
  }

  chunks(x, y, colors, n = 8, speed = 5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.add({ t: 1, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 1, size: 0.07 + Math.random() * 0.12, color: colors[i % colors.length], life: 0.8 + Math.random() * 0.8, g: -14, vr: (Math.random() - 0.5) * 16 });
    }
  }

  confetti(x, y, n = 70) {
    const cols = ['#ff4d6d', '#ffd23f', '#4da6ff', '#4fd66b', '#9b6bff', '#ff8a3d'];
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.15 + Math.random() * 0.7);
      const s = 6 + Math.random() * 9;
      this.add({ t: 2, x: x + (Math.random() - 0.5), y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: 0.12 + Math.random() * 0.1, color: cols[i % cols.length], life: 2 + Math.random() * 1.5, g: -7, drag: 1.6, vr: (Math.random() - 0.5) * 20, rot: Math.random() * 6 });
    }
  }

  sparks(x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 5;
      this.add({ t: 3, x, y, vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s, size: 0.05, color: Math.random() < 0.5 ? '#ffe14d' : '#ff9a2f', life: 0.25 + Math.random() * 0.25, g: -10 });
    }
  }

  splat(x, y, colors, n = 18, vx = 0, vy = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 6;
      this.add({ t: 4, x, y, vx: Math.cos(a) * s + vx * 0.4, vy: Math.abs(Math.sin(a)) * s + 1 + vy * 0.2, size: 0.06 + Math.random() * 0.12, color: colors[i % colors.length], life: 0.8 + Math.random() * 0.7, g: -14 });
    }
  }

  smoke(x, y, n = 12, color = '#6b6680') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 3;
      this.add({ t: 5, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 1.5, size: 0.4 + Math.random() * 0.5, grow: 1.4, color, life: 1 + Math.random() * 0.8, drag: 1.5 });
    }
  }

  ring(x, y, size = 3, color = '#ffffff') {
    this.add({ t: 8, x, y, size: 0.2, grow: size * 3, color, life: 0.35 });
  }

  stars(x, y, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.add({ t: 7, x, y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, size: 0.14, color: '#ffe14d', life: 0.5, drag: 3, vr: 6 });
    }
  }

  update(dt) {
    const L = this.list;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.g * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      if (p.t === 2) p.vx += Math.sin(p.life * 7 + p.rot) * 6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.grow) p.size += p.grow * dt * (p.t === 8 ? 1 : p.size);
      L[j++] = p;
    }
    L.length = j;
  }

  draw(ctx, view) {
    for (const p of this.list) {
      if (p.x < view.x0 - 2 || p.x > view.x1 + 2) continue;
      const k = p.life / p.max;
      switch (p.t) {
        case 0: case 5: case 6:
          ctx.globalAlpha = Math.min(1, k * 1.4) * (p.t === 5 ? 0.75 : 0.8);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 1: case 2:
          ctx.globalAlpha = Math.min(1, k * 3);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          if (p.t === 2) ctx.fillRect(-p.size, -p.size * 0.5 * Math.abs(Math.cos(p.rot * 1.3)), p.size * 2, p.size * Math.abs(Math.cos(p.rot * 1.3)) + 0.02);
          else {
            ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2);
            ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.025; ctx.strokeRect(-p.size, -p.size, p.size * 2, p.size * 2);
          }
          ctx.restore();
          break;
        case 3:
          ctx.globalAlpha = k * 2;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.06;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          ctx.stroke();
          break;
        case 4:
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 7: {
          ctx.globalAlpha = k;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          starPath(ctx, p.size);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 8:
          ctx.globalAlpha = k * 2.5 > 1 ? 1 : k * 2.5;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.18 * k + 0.02;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 9:
          ctx.globalAlpha = Math.min(1, k * 2) * 0.55;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.05;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.12, p.y - p.vy * 0.12);
          ctx.stroke();
          break;
        default: break;
      }
    }
    ctx.globalAlpha = 1;
  }
}

export function starPath(ctx, r, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}
