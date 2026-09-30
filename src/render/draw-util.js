// Path helpers. All shape functions only build paths; callers fill/stroke.

export function roundPoly(ctx, pts, r) {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const rr = Array.isArray(r) ? r[i] : r;
    if (i === 0) {
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      ctx.moveTo(mx, my);
    }
    ctx.arcTo(p1[0], p1[1], p2[0], p2[1], rr);
  }
  ctx.closePath();
}

export function rrect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function fillStroke(ctx, fill, stroke, lw) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

// text in a y-up world transform. Browsers round glyph advances at sub-pixel font sizes,
// so the text is laid out at 100x size and scaled back down.
export function worldText(ctx, text, x, y, size, color, align = 'center', outline = null, ow = 0, maxW = 0) {
  const k = 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / k, -1 / k);
  ctx.font = `${size * k}px LilitaOne, "Lilita One", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = outline;
    ctx.lineWidth = ow * k;
    if (maxW) ctx.strokeText(text, 0, 0, maxW * k); else ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = color;
  if (maxW) ctx.fillText(text, 0, 0, maxW * k); else ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
