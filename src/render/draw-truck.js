import { OUTLINE } from './themes.js';
import { roundPoly, rrect, circle, fillStroke } from './draw-util.js';
import { TRUCK } from '../game/vehicle.js';

const LW = 0.065;
const CAB = [[0.4, -0.44], [2.0, -0.44], [2.02, 0.28], [1.76, 0.53], [1.5, 0.55], [1.15, 1.32], [0.5, 1.32], [0.4, 1.2]];
const WINDOW = [[0.6, 0.64], [1.37, 0.64], [1.09, 1.17], [0.6, 1.17]];

function arch(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 0.6, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = OUTLINE;
  ctx.fill();
}

// Everything behind the cargo: cab, inner bed wall, tailgate.
export function drawTruckBack(ctx, skin, hat, o = {}) {
  const t = o.time || 0;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // inner far wall of the bed
  rrect(ctx, -1.95, -0.1, 2.42, 0.58, 0.05);
  fillStroke(ctx, skin.bedDark, OUTLINE, LW);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(-1.9, 0.24); ctx.lineTo(0.42, 0.24);
  ctx.stroke();

  // cab body
  roundPoly(ctx, CAB, [0.12, 0.14, 0.12, 0.12, 0.06, 0.14, 0.1, 0.06]);
  fillStroke(ctx, skin.body, null);
  ctx.save();
  ctx.clip();
  // lower shade
  ctx.fillStyle = skin.dark;
  ctx.fillRect(0.3, -0.5, 1.9, 0.3);
  // deco layers inside the body
  drawDeco(ctx, skin, t);
  // accent stripe
  ctx.fillStyle = skin.accent;
  if (skin.deco !== 'checker' && skin.deco !== 'rainbow') ctx.fillRect(0.3, 0.02, 1.9, 0.12);
  // top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(0.3, 1.2, 1.2, 0.2);
  ctx.restore();
  roundPoly(ctx, CAB, [0.12, 0.14, 0.12, 0.12, 0.06, 0.14, 0.1, 0.06]);
  fillStroke(ctx, null, OUTLINE, LW);

  // window + driver
  roundPoly(ctx, WINDOW, 0.07);
  fillStroke(ctx, '#bfe9ff', null);
  ctx.save();
  ctx.clip();
  drawDuck(ctx, 0.86 + (o.bobX || 0), 0.8 + (o.bobY || 0), 0.17, hat, t);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(1.12, 1.2); ctx.lineTo(1.3, 1.2); ctx.lineTo(1.0, 0.6); ctx.lineTo(0.84, 0.6);
  ctx.fill();
  ctx.restore();
  roundPoly(ctx, WINDOW, 0.07);
  fillStroke(ctx, null, OUTLINE, LW * 0.8);

  // door + handle
  ctx.strokeStyle = 'rgba(42,31,61,0.45)';
  ctx.lineWidth = 0.035;
  rrect(ctx, 0.5, -0.3, 0.98, 0.84, 0.08);
  ctx.stroke();
  rrect(ctx, 0.6, 0.3, 0.18, 0.06, 0.03);
  fillStroke(ctx, skin.trim, null);
  // headlight
  ctx.beginPath();
  ctx.ellipse(1.93, 0.17, 0.07, 0.11, 0, 0, Math.PI * 2);
  fillStroke(ctx, '#fff3a0', OUTLINE, 0.04);
  // bumper
  rrect(ctx, 1.84, -0.46, 0.26, 0.26, 0.07);
  fillStroke(ctx, skin.trim, OUTLINE, 0.05);
  // front arch
  arch(ctx, TRUCK.front.x, -0.44);

  // roof decorations
  if (skin.deco === 'siren') {
    const on = Math.floor(t * 4) % 2 === 0;
    rrect(ctx, 0.62, 1.32, 0.4, 0.14, 0.05);
    fillStroke(ctx, on ? '#ff4040' : '#4d8bff', OUTLINE, 0.04);
  } else if (skin.deco === 'cone') {
    ctx.beginPath();
    ctx.moveTo(0.72, 1.33); ctx.lineTo(0.9, 1.33); ctx.lineTo(0.81, 1.6);
    ctx.closePath();
    ctx.save(); ctx.translate(0, 0);
    fillStroke(ctx, '#e8b56a', OUTLINE, 0.04);
    ctx.restore();
    circle(ctx, 0.81, 1.25 + 0.44, 0.13);
    fillStroke(ctx, '#ff9ecb', OUTLINE, 0.04);
    circle(ctx, 0.81, 1.25 + 0.6, 0.1);
    fillStroke(ctx, '#7ee0d2', OUTLINE, 0.04);
  }

  // tailgate
  rrect(ctx, -1.98, -0.46, 0.16, 0.95, 0.05);
  fillStroke(ctx, skin.bed, OUTLINE, LW);
}

// The low side panel drawn over the cargo so it looks like it sits inside the bed.
export function drawTruckFront(ctx, skin, o = {}) {
  const t = o.time || 0;
  rrect(ctx, -1.99, -0.46, 2.46, 0.76, 0.08);
  fillStroke(ctx, skin.bed, null);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = skin.bedDark;
  ctx.fillRect(-2.1, -0.5, 2.7, 0.2);
  if (skin.deco === 'rainbow') {
    const cols = ['#ff4d4d', '#ffa53d', '#ffe14d', '#4fd66b', '#4da6ff', '#9b6bff'];
    cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-2.1, 0.18 - i * 0.09, 2.7, 0.09); });
  } else if (skin.deco === 'neon') {
    ctx.fillStyle = skin.accent;
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
    ctx.fillRect(-2.1, -0.3, 2.7, 0.06);
    ctx.globalAlpha = 1;
  } else if (skin.deco === 'mail') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2.1, -0.02, 2.7, 0.08);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  for (const x of [-1.3, -0.6, 0.1]) { ctx.moveTo(x, -0.3); ctx.lineTo(x, 0.26); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-2.1, 0.19, 2.7, 0.06);
  ctx.restore();
  rrect(ctx, -1.99, -0.46, 2.46, 0.76, 0.08);
  fillStroke(ctx, null, OUTLINE, LW);
  // tail light
  rrect(ctx, -2.03, 0.02, 0.1, 0.16, 0.03);
  fillStroke(ctx, '#ff4d4d', OUTLINE, 0.035);
  // exhaust
  rrect(ctx, -2.2, -0.42, 0.26, 0.09, 0.04);
  fillStroke(ctx, '#8c8ca3', OUTLINE, 0.035);
  arch(ctx, TRUCK.rear.x, -0.46);
}

export function drawWheel(ctx, x, y, angle, skin) {
  const r = TRUCK.wheelR;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  circle(ctx, 0, 0, r);
  fillStroke(ctx, '#34304a', OUTLINE, 0.06);
  // tread
  ctx.strokeStyle = '#231f33';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
    ctx.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97);
  }
  ctx.stroke();
  circle(ctx, 0, 0, r * 0.56);
  fillStroke(ctx, '#e3e6f0', OUTLINE, 0.045);
  circle(ctx, 0, 0, r * 0.4);
  fillStroke(ctx, skin ? skin.accent === '#ffffff' ? skin.body : skin.accent : '#c9ccd8', null);
  ctx.fillStyle = OUTLINE;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    circle(ctx, Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25, 0.028);
    ctx.fill();
  }
  circle(ctx, 0, 0, 0.06);
  fillStroke(ctx, '#e3e6f0', OUTLINE, 0.03);
  ctx.restore();
}

function drawDeco(ctx, skin, t) {
  if (skin.deco === 'checker') {
    const s = 0.1;
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#2a1f3d' : '#ffffff';
        ctx.fillRect(0.3 + i * s, 0.02 + j * s, s, s);
      }
    }
  } else if (skin.deco === 'camo') {
    ctx.fillStyle = '#4f6a36';
    for (const [x, y, r] of [[0.7, 0.2, 0.18], [1.3, -0.1, 0.22], [1.7, 0.3, 0.15], [0.9, 1.1, 0.2], [0.5, -0.2, 0.14]]) {
      circle(ctx, x, y, r); ctx.fill();
    }
    ctx.fillStyle = '#8a7a52';
    for (const [x, y, r] of [[1.05, 0.35, 0.12], [1.55, -0.25, 0.12], [0.55, 0.7, 0.1]]) { circle(ctx, x, y, r); ctx.fill(); }
  } else if (skin.deco === 'shine') {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    const o = ((t * 0.8) % 3) - 1;
    ctx.beginPath();
    ctx.moveTo(o, -0.5); ctx.lineTo(o + 0.25, -0.5); ctx.lineTo(o + 0.85, 1.4); ctx.lineTo(o + 0.6, 1.4);
    ctx.fill();
  } else if (skin.deco === 'stripes') {
    ctx.fillStyle = skin.accent;
    ctx.fillRect(0.3, 0.25, 1.9, 0.07);
    ctx.fillRect(0.3, -0.1, 1.9, 0.07);
  } else if (skin.deco === 'rainbow') {
    const cols = ['#ff4d4d', '#ffa53d', '#ffe14d', '#4fd66b', '#4da6ff', '#9b6bff'];
    cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0.3, 0.32 - i * 0.07, 1.9, 0.07); });
  } else if (skin.deco === 'mail') {
    rrect(ctx, 0.72, -0.2, 0.4, 0.28, 0.03);
    fillStroke(ctx, '#ffffff', skin.accent, 0.035);
    ctx.beginPath();
    ctx.moveTo(0.72, 0.08); ctx.lineTo(0.92, -0.08); ctx.lineTo(1.12, 0.08);
    ctx.stroke();
  }
}

export function drawDuck(ctx, x, y, r, hat, t = 0) {
  // body hint
  circle(ctx, x - 0.02, y - r * 1.25, r * 0.9);
  fillStroke(ctx, '#ffc629', OUTLINE, 0.04);
  // head
  circle(ctx, x, y, r);
  fillStroke(ctx, '#ffd23f', OUTLINE, 0.045);
  // beak
  ctx.beginPath();
  ctx.ellipse(x + r * 1.0, y - r * 0.18, r * 0.42, r * 0.2, -0.1, 0, Math.PI * 2);
  fillStroke(ctx, '#ff8a3d', OUTLINE, 0.035);
  // blush
  ctx.fillStyle = 'rgba(255,120,120,0.45)';
  circle(ctx, x + r * 0.25, y - r * 0.35, r * 0.18); ctx.fill();
  // eye (blinks now and then)
  const blink = (t % 3.7) < 0.12;
  if (blink) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.28, y + r * 0.18); ctx.lineTo(x + r * 0.62, y + r * 0.18);
    ctx.stroke();
  } else {
    circle(ctx, x + r * 0.45, y + r * 0.2, r * 0.2);
    fillStroke(ctx, OUTLINE, null);
    circle(ctx, x + r * 0.5, y + r * 0.27, r * 0.07);
    fillStroke(ctx, '#ffffff', null);
  }
  if (hat) drawHat(ctx, hat.id || hat, x, y, r, t);
}

export function drawHat(ctx, id, x, y, r, t) {
  const top = y + r * 0.72;
  ctx.lineJoin = 'round';
  switch (id) {
    case 'cap':
      ctx.beginPath();
      ctx.arc(x - r * 0.05, top - r * 0.1, r * 0.78, 0, Math.PI);
      ctx.closePath();
      fillStroke(ctx, '#ef4b4b', OUTLINE, 0.035);
      rrect(ctx, x + r * 0.3, top - r * 0.18, r * 0.9, r * 0.2, r * 0.08);
      fillStroke(ctx, '#c23636', OUTLINE, 0.03);
      circle(ctx, x - r * 0.05, top + r * 0.2, r * 0.18);
      fillStroke(ctx, '#ffffff', null);
      break;
    case 'beanie':
      ctx.beginPath();
      ctx.arc(x, top - r * 0.12, r * 0.85, 0, Math.PI);
      ctx.closePath();
      fillStroke(ctx, '#4d8bff', OUTLINE, 0.035);
      rrect(ctx, x - r * 0.9, top - r * 0.28, r * 1.8, r * 0.3, r * 0.1);
      fillStroke(ctx, '#2f63d6', OUTLINE, 0.03);
      circle(ctx, x, top + r * 0.82, r * 0.2);
      fillStroke(ctx, '#ffffff', OUTLINE, 0.03);
      break;
    case 'party':
      ctx.beginPath();
      ctx.moveTo(x - r * 0.55, top - r * 0.1); ctx.lineTo(x + r * 0.45, top - r * 0.1); ctx.lineTo(x - r * 0.1, top + r * 1.3);
      ctx.closePath();
      fillStroke(ctx, '#ff5ea8', OUTLINE, 0.035);
      circle(ctx, x - r * 0.1, top + r * 1.35, r * 0.17);
      fillStroke(ctx, '#ffe14d', OUTLINE, 0.03);
      break;
    case 'cowboy':
      ctx.beginPath();
      ctx.ellipse(x, top - r * 0.05, r * 1.35, r * 0.2, 0, 0, Math.PI * 2);
      fillStroke(ctx, '#a0663a', OUTLINE, 0.035);
      rrect(ctx, x - r * 0.6, top, r * 1.2, r * 0.75, r * 0.25);
      fillStroke(ctx, '#b8773f', OUTLINE, 0.035);
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(x - r * 0.6, top + r * 0.1, r * 1.2, r * 0.14);
      break;
    case 'chef':
      rrect(ctx, x - r * 0.55, top - r * 0.1, r * 1.1, r * 0.45, r * 0.1);
      fillStroke(ctx, '#ffffff', OUTLINE, 0.03);
      for (const [dx, dy, rr] of [[-0.35, 0.65, 0.4], [0.3, 0.65, 0.4], [0, 0.95, 0.45]]) {
        circle(ctx, x + r * dx, top + r * dy, r * rr);
        fillStroke(ctx, '#ffffff', OUTLINE, 0.03);
      }
      break;
    case 'propeller': {
      ctx.beginPath();
      ctx.arc(x, top - r * 0.1, r * 0.78, 0, Math.PI);
      ctx.closePath();
      fillStroke(ctx, '#ffe14d', OUTLINE, 0.035);
      ctx.fillStyle = '#ff4d4d';
      ctx.fillRect(x - r * 0.05, top - r * 0.1, r * 0.1, r * 0.95);
      const s = Math.cos(t * 18);
      ctx.beginPath();
      ctx.ellipse(x, top + r * 0.9, r * 0.9 * Math.abs(s) + 0.01, r * 0.12, 0, 0, Math.PI * 2);
      fillStroke(ctx, '#4d8bff', OUTLINE, 0.03);
      break;
    }
    case 'tophat':
      rrect(ctx, x - r * 0.95, top - r * 0.1, r * 1.9, r * 0.22, r * 0.1);
      fillStroke(ctx, '#2a2438', OUTLINE, 0.03);
      rrect(ctx, x - r * 0.6, top, r * 1.2, r * 1.15, r * 0.1);
      fillStroke(ctx, '#2a2438', OUTLINE, 0.03);
      ctx.fillStyle = '#ef4b4b';
      ctx.fillRect(x - r * 0.6, top + r * 0.12, r * 1.2, r * 0.2);
      break;
    case 'viking':
      ctx.beginPath();
      ctx.arc(x, top - r * 0.15, r * 0.88, 0, Math.PI);
      ctx.closePath();
      fillStroke(ctx, '#9aa3b8', OUTLINE, 0.035);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + s * r * 0.7, top + r * 0.1);
        ctx.quadraticCurveTo(x + s * r * 1.45, top + r * 0.2, x + s * r * 1.3, top + r * 1.1);
        ctx.quadraticCurveTo(x + s * r * 1.1, top + r * 0.45, x + s * r * 0.55, top + r * 0.4);
        ctx.closePath();
        fillStroke(ctx, '#fff4dc', OUTLINE, 0.03);
      }
      break;
    case 'cone':
      ctx.beginPath();
      ctx.moveTo(x - r * 0.62, top - r * 0.1); ctx.lineTo(x + r * 0.62, top - r * 0.1); ctx.lineTo(x + r * 0.1, top + r * 1.4); ctx.lineTo(x - r * 0.1, top + r * 1.4);
      ctx.closePath();
      fillStroke(ctx, '#ff7a1f', OUTLINE, 0.035);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - r * 0.4, top + r * 0.45, r * 0.8, r * 0.22);
      break;
    case 'crown':
      ctx.beginPath();
      ctx.moveTo(x - r * 0.7, top - r * 0.1);
      ctx.lineTo(x + r * 0.7, top - r * 0.1);
      ctx.lineTo(x + r * 0.8, top + r * 0.75);
      ctx.lineTo(x + r * 0.4, top + r * 0.35);
      ctx.lineTo(x, top + r * 0.9);
      ctx.lineTo(x - r * 0.4, top + r * 0.35);
      ctx.lineTo(x - r * 0.8, top + r * 0.75);
      ctx.closePath();
      fillStroke(ctx, '#ffcf3f', OUTLINE, 0.035);
      circle(ctx, x, top + r * 0.15, r * 0.12);
      fillStroke(ctx, '#ff4d6d', null);
      break;
    case 'astro':
      // glass bubble over the whole head + antenna
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.03;
      ctx.beginPath(); ctx.moveTo(x + r * 0.5, y + r * 1.05); ctx.lineTo(x + r * 0.75, y + r * 1.75); ctx.stroke();
      circle(ctx, x + r * 0.75, y + r * 1.75, r * 0.13);
      fillStroke(ctx, (t * 2) % 1 < 0.5 ? '#ff4d6d' : '#ffb3c0', OUTLINE, 0.025);
      circle(ctx, x, y + r * 0.1, r * 1.32);
      fillStroke(ctx, 'rgba(190,230,255,0.28)', OUTLINE, 0.035);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = r * 0.12;
      ctx.beginPath(); ctx.arc(x, y + r * 0.1, r * 1.05, 2.0, 2.6); ctx.stroke();
      rrect(ctx, x - r * 1.05, y - r * 1.25, r * 2.1, r * 0.32, r * 0.1);
      fillStroke(ctx, '#d9dde8', OUTLINE, 0.03);
      break;
    default:
      break;
  }
}
