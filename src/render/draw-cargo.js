import { OUTLINE } from './themes.js';
import { rrect, circle, fillStroke, worldText, roundPoly } from './draw-util.js';
import { OUTLINES } from '../game/cargoTypes.js';

const LW = 0.05;

function bodyPath(ctx, d) {
  if (d.shape === 'circle') { circle(ctx, 0, 0, d.r); return; }
  if (OUTLINES[d.shape]) { roundPoly(ctx, OUTLINES[d.shape].map(([x, y]) => [x * d.w, y * d.h]), 0.035); return; }
  if (d.shape === 'box') { rrect(ctx, -d.w / 2, -d.h / 2, d.w, d.h, Math.min(d.w, d.h) * 0.12); return; }
  if (d.shape === 'trap') {
    ctx.beginPath();
    ctx.moveTo(-d.w / 2, -d.h / 2); ctx.lineTo(d.w / 2, -d.h / 2); ctx.lineTo(d.w * 0.36, d.h / 2); ctx.lineTo(-d.w * 0.36, d.h / 2);
    ctx.closePath();
    return;
  }
  if (d.shape === 'egg') {
    ctx.beginPath();
    ctx.moveTo(0, -d.h / 2);
    ctx.bezierCurveTo(d.w * 0.62, -d.h / 2, d.w * 0.5, d.h * 0.5, 0, d.h / 2);
    ctx.bezierCurveTo(-d.w * 0.5, d.h * 0.5, -d.w * 0.62, -d.h / 2, 0, -d.h / 2);
    ctx.closePath();
    return;
  }
  if (d.shape === 'capsule') {
    const W = d.w, H = d.h;
    ctx.beginPath();
    ctx.moveTo(-0.36 * W, -0.5 * H);
    ctx.lineTo(0.36 * W, -0.5 * H);
    ctx.quadraticCurveTo(0.56 * W, -0.35 * H, 0.5 * W, 0.05 * H);
    ctx.quadraticCurveTo(0.46 * W, 0.5 * H, 0, 0.5 * H);
    ctx.quadraticCurveTo(-0.46 * W, 0.5 * H, -0.5 * W, 0.05 * H);
    ctx.quadraticCurveTo(-0.56 * W, -0.35 * H, -0.36 * W, -0.5 * H);
    ctx.closePath();
  }
}

// face: { pupils:[{x,y},{x,y}], mood:'happy'|'scared'|'lost', blink }
export function drawCargo(ctx, type, d, face, t = 0) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // extras behind body
  if (type === 'tv') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(-0.05, d.h / 2); ctx.lineTo(-0.2, d.h / 2 + 0.24);
    ctx.moveTo(0.05, d.h / 2); ctx.lineTo(0.2, d.h / 2 + 0.2);
    ctx.stroke();
    circle(ctx, -0.2, d.h / 2 + 0.24, 0.035); fillStroke(ctx, '#ff5a7a', null);
    circle(ctx, 0.2, d.h / 2 + 0.2, 0.035); fillStroke(ctx, '#ff5a7a', null);
  } else if (type === 'tnt') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(0, d.h / 2);
    ctx.quadraticCurveTo(0.08, d.h / 2 + 0.14, 0.18, d.h / 2 + 0.16);
    ctx.stroke();
    const f = 0.5 + 0.5 * Math.sin(t * 25);
    circle(ctx, 0.2, d.h / 2 + 0.17, 0.05 + f * 0.03);
    fillStroke(ctx, f > 0.5 ? '#ffe14d' : '#ff7a2f', null);
  } else if (type === 'alien') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.035;
    const sw = Math.sin(t * 4) * 0.04;
    ctx.beginPath();
    ctx.moveTo(-0.08, d.h * 0.4); ctx.quadraticCurveTo(-0.12, d.h / 2 + 0.1, -0.16 + sw, d.h / 2 + 0.2);
    ctx.moveTo(0.08, d.h * 0.4); ctx.quadraticCurveTo(0.12, d.h / 2 + 0.1, 0.16 - sw, d.h / 2 + 0.2);
    ctx.stroke();
    circle(ctx, -0.16 + sw, d.h / 2 + 0.2, 0.045); fillStroke(ctx, '#ffe14d', OUTLINE, 0.025);
    circle(ctx, 0.16 - sw, d.h / 2 + 0.2, 0.045); fillStroke(ctx, '#ffe14d', OUTLINE, 0.025);
  } else if (type === 'vase') {
    rrect(ctx, -d.w * 0.42, d.h / 2 - 0.03, d.w * 0.84, 0.08, 0.03);
    fillStroke(ctx, d.dark, OUTLINE, 0.03);
  } else if (type === 'jelly') {
    // wobbles like jelly does
    const k = Math.sin(t * 9) * 0.035;
    ctx.scale(1 + k, 1 - k);
  } else if (type === 'piano') {
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(-d.w / 2 + 0.08, -d.h / 2 - 0.0, 0.08, 0.02);
  }

  bodyPath(ctx, d);
  fillStroke(ctx, d.color, null);
  ctx.save();
  ctx.clip();
  drawDetail(ctx, type, d, t);
  ctx.restore();
  bodyPath(ctx, d);
  fillStroke(ctx, null, OUTLINE, LW);

  if (face) drawFace(ctx, d, face);
}

function drawDetail(ctx, type, d, t) {
  const w = d.w || d.r * 2, h = d.h || d.r * 2;
  switch (type) {
    case 'crate': {
      ctx.fillStyle = d.dark;
      ctx.fillRect(-w / 2, -h / 2, w, 0.09);
      ctx.fillRect(-w / 2, h / 2 - 0.09, w, 0.09);
      ctx.fillRect(-w / 2, -h / 2, 0.09, h);
      ctx.fillRect(w / 2 - 0.09, -h / 2, 0.09, h);
      ctx.strokeStyle = d.dark;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 0.05, -h / 2 + 0.05); ctx.lineTo(w / 2 - 0.05, h / 2 - 0.05);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(-w / 2, h / 2 - 0.05, w, 0.05);
      break;
    }
    case 'box': {
      ctx.fillStyle = d.dark;
      ctx.fillRect(-w / 2, -h / 2, w, 0.07);
      ctx.fillStyle = '#e9d3a8';
      ctx.fillRect(-0.07, -h / 2, 0.14, h);
      ctx.fillStyle = '#ffffff';
      rrect(ctx, w / 2 - 0.24, -h / 2 + 0.08, 0.16, 0.11, 0.02);
      ctx.fill();
      break;
    }
    case 'barrel': {
      ctx.strokeStyle = d.dark;
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(-d.r, -0.13); ctx.lineTo(d.r, -0.13);
      ctx.moveTo(-d.r, 0.13); ctx.lineTo(d.r, 0.13);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      circle(ctx, -d.r * 0.4, d.r * 0.45, d.r * 0.22); ctx.fill();
      break;
    }
    case 'melon': {
      ctx.strokeStyle = d.dark;
      ctx.lineWidth = 0.065;
      ctx.beginPath();
      for (const k of [-0.6, -0.2, 0.2, 0.6]) {
        ctx.moveTo(k * d.r, -d.r);
        ctx.quadraticCurveTo(k * d.r * 1.6, 0, k * d.r, d.r);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      circle(ctx, -d.r * 0.4, d.r * 0.45, d.r * 0.2); ctx.fill();
      break;
    }
    case 'egg': {
      ctx.fillStyle = d.dark;
      ctx.beginPath();
      ctx.ellipse(0.06, -h * 0.28, w * 0.45, h * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      circle(ctx, -w * 0.18, h * 0.22, 0.04); ctx.fill();
      break;
    }
    case 'tv': {
      rrect(ctx, -w / 2 + 0.07, -h / 2 + 0.07, w * 0.72, h - 0.14, 0.07);
      fillStroke(ctx, '#bfe7ff', OUTLINE, 0.035);
      ctx.fillStyle = d.dark;
      circle(ctx, w / 2 - 0.1, 0.1, 0.04); ctx.fill();
      circle(ctx, w / 2 - 0.1, -0.06, 0.04); ctx.fill();
      break;
    }
    case 'ball': {
      const cols = ['#ff4d6d', '#ffd23f', '#4da6ff', '#4fd66b'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, d.r, (i / 4) * Math.PI * 2 + 0.2, (i / 4) * Math.PI * 2 + 0.95);
        ctx.closePath();
        ctx.fill();
      }
      circle(ctx, 0, 0, d.r * 0.2);
      fillStroke(ctx, '#ffffff', null);
      break;
    }
    case 'gold': {
      ctx.fillStyle = '#fff1a8';
      ctx.fillRect(-w * 0.3, h * 0.1, w * 0.6, 0.05);
      ctx.fillStyle = d.dark;
      ctx.fillRect(-w / 2, -h / 2, w, 0.06);
      break;
    }
    case 'penguin': {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.08, w * 0.32, h * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff9a2f';
      ctx.fillRect(-w * 0.32, -h / 2, w * 0.22, 0.06);
      ctx.fillRect(w * 0.1, -h / 2, w * 0.22, 0.06);
      break;
    }
    case 'cake': {
      ctx.fillStyle = '#8a4b2f';
      ctx.fillRect(-w / 2, -h / 2, w, h * 0.42);
      ctx.fillStyle = '#fff6e6';
      ctx.fillRect(-w / 2, -h * 0.1, w, 0.07);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-w / 2, h / 2);
      for (let i = 0; i <= 6; i++) {
        const x = -w / 2 + (w * i) / 6;
        ctx.lineTo(x, h / 2 - 0.12 - (i % 2) * 0.07);
      }
      ctx.lineTo(w / 2, h / 2);
      ctx.fill();
      break;
    }
    case 'piano': {
      ctx.fillStyle = '#fdf8ee';
      ctx.fillRect(-w / 2, -0.02, w, 0.14);
      ctx.fillStyle = OUTLINE;
      for (let i = 0; i < 9; i++) ctx.fillRect(-w / 2 + 0.1 + i * 0.13, 0.04, 0.05, 0.08);
      ctx.fillStyle = d.dark;
      ctx.fillRect(-w / 2, -h / 2, w, 0.14);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(-w / 2, h / 2 - 0.08, w, 0.08);
      break;
    }
    case 'tnt': {
      ctx.fillStyle = d.dark;
      ctx.fillRect(-w / 2, -h / 2, w, 0.08);
      ctx.fillStyle = '#fff4dc';
      ctx.fillRect(-w / 2, -0.07, w, 0.19);
      worldText(ctx, 'TNT', 0, 0.025, 0.17, '#b52a2a');
      break;
    }
    case 'jelly': {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      rrect(ctx, -w / 2 + 0.06, h / 2 - 0.16, w * 0.55, 0.08, 0.04); ctx.fill();
      ctx.fillStyle = d.dark;
      ctx.fillRect(-w / 2, -h / 2, w, 0.08);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (const [bx, by, br] of [[-0.18, -0.12, 0.035], [0.2, 0.05, 0.03], [0.12, -0.16, 0.022]]) { circle(ctx, bx, by, br); ctx.fill(); }
      break;
    }
    case 'vase': {
      ctx.fillStyle = '#fdf2d8';
      ctx.fillRect(-w / 2, -0.2, w, 0.1);
      ctx.fillStyle = d.dark;
      ctx.fillRect(-w / 2, 0.24, w, 0.05);
      ctx.fillRect(-w / 2, -h / 2, w, 0.07);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(-w * 0.32, -0.3, 0.05, 0.62);
      break;
    }
    case 'alien': {
      ctx.fillStyle = d.dark;
      circle(ctx, -w * 0.3, -h * 0.25, 0.05); ctx.fill();
      circle(ctx, w * 0.28, -h * 0.3, 0.035); ctx.fill();
      circle(ctx, w * 0.33, h * 0.25, 0.03); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.ellipse(0, -h * 0.28, w * 0.22, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'crystal': {
      ctx.strokeStyle = d.dark;
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, h * 0.08); ctx.lineTo(w * 0.5, h * 0.08);
      ctx.moveTo(-w * 0.3, h * 0.5); ctx.lineTo(-w * 0.12, h * 0.08); ctx.lineTo(0, -h * 0.5);
      ctx.moveTo(w * 0.3, h * 0.5); ctx.lineTo(w * 0.12, h * 0.08); ctx.lineTo(0, -h * 0.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.moveTo(-w * 0.3, h * 0.5); ctx.lineTo(-w * 0.12, h * 0.08); ctx.lineTo(-w * 0.5, h * 0.08); ctx.closePath(); ctx.fill();
      break;
    }
    default: break;
  }
}

function drawFace(ctx, d, face) {
  const s = d.face.s;
  const ey = d.face.y + (d.shape === 'capsule' ? d.h * 0.12 : 0);
  const ex = 0.1 * s, er = 0.075 * s, pr = 0.042 * s;
  if (face.mood === 'lost') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.035 * s;
    ctx.beginPath();
    for (const sx of [-1, 1]) {
      const cx = sx * ex, cy = ey + 0.03;
      ctx.moveTo(cx - er * 0.7, cy - er * 0.7); ctx.lineTo(cx + er * 0.7, cy + er * 0.7);
      ctx.moveTo(cx - er * 0.7, cy + er * 0.7); ctx.lineTo(cx + er * 0.7, cy - er * 0.7);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, ey - 0.13 * s, 0.05 * s, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    return;
  }
  for (let i = 0; i < 2; i++) {
    const cx = (i ? 1 : -1) * ex, cy = ey + 0.03;
    circle(ctx, cx, cy, er);
    fillStroke(ctx, '#ffffff', OUTLINE, 0.028 * s);
    if (face.blink) {
      ctx.strokeStyle = OUTLINE;
      ctx.beginPath(); ctx.moveTo(cx - er * 0.8, cy); ctx.lineTo(cx + er * 0.8, cy); ctx.stroke();
    } else {
      const p = face.pupils[i];
      const k = (er - pr) * 0.95;
      circle(ctx, cx + p.x * k, cy + p.y * k, face.mood === 'scared' ? pr * 0.7 : pr);
      fillStroke(ctx, OUTLINE, null);
    }
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.03 * s;
  if (face.mood === 'scared') {
    ctx.beginPath();
    ctx.ellipse(0, ey - 0.1 * s, 0.035 * s, 0.05 * s, 0, 0, Math.PI * 2);
    fillStroke(ctx, OUTLINE, null);
  } else {
    ctx.beginPath();
    ctx.arc(0, ey - 0.06 * s, 0.045 * s, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
  }
}

export function drawCargoIcon(ctx, type, d, size) {
  // helper for UI canvases: fit into `size` px box, y-down canvas
  const w = d.w || d.r * 2, h = d.h || d.r * 2;
  const m = Math.max(w, h + (type === 'tv' ? 0.25 : 0));
  const sc = (size * 0.8) / m;
  ctx.save();
  ctx.translate(size / 2, size / 2 + (type === 'tv' ? sc * 0.1 : 0));
  ctx.scale(sc, -sc);
  drawCargo(ctx, type, d, { pupils: [{ x: 0.2, y: -0.3 }, { x: 0.2, y: -0.3 }], mood: 'happy' }, 0);
  ctx.restore();
}
