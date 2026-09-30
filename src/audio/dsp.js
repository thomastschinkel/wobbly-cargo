// Offline synthesis: every sound and instrument sample is rendered once into a Float32Array,
// then played back as an AudioBuffer. Rich timbres at runtime cost, and no audio files.
export const TAU = Math.PI * 2;

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const buf = (sr, dur) => new Float32Array(Math.max(1, Math.ceil(sr * dur)));

// RBJ cookbook biquad (bandpass has 0 dB peak gain)
export class Biquad {
  constructor(sr, type = 'lowpass', f = 1000, q = 0.707) {
    this.sr = sr;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, f, q);
  }

  set(type, f, q = 0.707) {
    const w = (TAU * Math.min(Math.max(f, 10), this.sr * 0.45)) / this.sr;
    const cw = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    else if (type === 'bandpass') { b0 = al; b1 = 0; b2 = -al; }
    else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cw) / a0; this.a2 = (1 - al) / a0;
  }

  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// attack ramp, exponential decay (time constant), linear release at the very end
function envAt(i, n, sr, o) {
  const t = i / sr;
  const att = o.attack ?? 0.002;
  let e = t < att ? t / att : 1;
  if (o.decay) e *= Math.exp(-Math.max(0, t - att) / o.decay);
  const rel = (o.release ?? 0.01) * sr;
  if (i > n - rel) e *= Math.max(0, (n - i) / rel);
  return e;
}

// sum of exponentially decaying sine partials: struck bars, blocks, bells, clangs
export function modal(out, sr, t0, parts, o = {}) {
  const i0 = Math.round(t0 * sr);
  const att = Math.max(1, (o.attack ?? 0.0012) * sr);
  const bend = o.bend || 0, bendT = o.bendT || 0.02;
  for (const p of parts) {
    if (p.f * (1 + bend) > sr * 0.45) continue;
    const n = Math.min(out.length - i0, Math.ceil(p.d * 7 * sr));
    const k = Math.exp(-1 / (p.d * sr));
    let ph = 0, env = p.a;
    for (let i = 0; i < n; i++) {
      const f = bend ? p.f * (1 + bend * Math.exp(-i / sr / bendT)) : p.f;
      ph += (TAU * f) / sr;
      out[i0 + i] += Math.sin(ph) * env * (i < att ? i / att : 1);
      env *= k;
    }
  }
}

// filtered noise burst; the filter can sweep from f to f1 (exponential)
export function noise(out, sr, t0, dur, o = {}) {
  const r = rng(o.seed ?? 7);
  const i0 = Math.round(t0 * sr);
  const n = Math.min(out.length - i0, Math.ceil(dur * sr));
  const bq = o.type ? new Biquad(sr, o.type, o.f, o.q) : null;
  const bq2 = o.type && o.steep ? new Biquad(sr, o.type, o.f, o.q) : null;
  const amp = o.amp ?? 1;
  for (let i = 0; i < n; i++) {
    if (bq && o.f1 && (i & 31) === 0) {
      const f = o.f * Math.pow(o.f1 / o.f, i / n);
      bq.set(o.type, f, o.q);
      if (bq2) bq2.set(o.type, f, o.q);
    }
    let x = r() * 2 - 1;
    if (bq) x = bq.run(x);
    if (bq2) x = bq2.run(x);
    out[i0 + i] += x * amp * envAt(i, n, sr, o);
  }
}

function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// oscillator with optional pitch function f(t), polyBLEP saw/square, optional lowpass (static or f(t))
export function osc(out, sr, t0, dur, o) {
  const i0 = Math.round(t0 * sr);
  const n = Math.min(out.length - i0, Math.ceil(dur * sr));
  const ff = typeof o.f === 'function' ? o.f : () => o.f;
  const lpf = o.lp == null ? null : typeof o.lp === 'function' ? o.lp : () => o.lp;
  const bq = lpf ? new Biquad(sr, 'lowpass', lpf(0), o.q ?? 0.9) : null;
  const w = o.width ?? 0.5, amp = o.amp ?? 1, wave = o.wave || 'sine';
  let ph = o.phase || 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const dt = Math.min(0.49, ff(t) / sr);
    ph += dt;
    if (ph >= 1) ph -= 1;
    let x;
    if (wave === 'sine') x = Math.sin(TAU * ph);
    else if (wave === 'tri') x = 1 - 4 * Math.abs(ph - 0.5);
    else if (wave === 'saw') x = 2 * ph - 1 - blep(ph, dt);
    else x = (ph < w ? 1 : -1) + blep(ph, dt) - blep((ph + 1 - w) % 1, dt);
    if (bq) {
      if ((i & 31) === 0 && typeof o.lp === 'function') bq.set('lowpass', lpf(t), o.q ?? 0.9);
      x = bq.run(x);
    }
    out[i0 + i] += x * amp * envAt(i, n, sr, o);
  }
}

// Karplus-Strong plucked string with fractional-delay tuning.
// s: loop filter weight (0.5 = darkest), bright: excitation brightness, pick: pluck position comb
export function pluck(out, sr, t0, f, dur, o = {}) {
  const S = o.s ?? 0.5;
  const P = sr / f;
  let N = Math.floor(P - S);
  let fr = P - S - N;
  if (fr < 0.1) { N -= 1; fr += 1; }
  const c = (1 - fr) / (1 + fr);
  const r = rng(o.seed ?? 3);
  const line = new Float32Array(N);
  const b = o.bright ?? 0.6;
  let lp = 0;
  for (let k = 0; k < 2; k++) for (let i = 0; i < N; i++) { lp += b * (r() * 2 - 1 - lp); line[i] = lp; }
  if (o.pick) {
    const d = Math.max(1, Math.round(N * o.pick));
    const cp = line.slice();
    for (let i = 0; i < N; i++) line[i] = cp[i] - cp[(i - d + N) % N];
  }
  let mean = 0, pk = 1e-9;
  for (let i = 0; i < N; i++) mean += line[i] / N;
  for (let i = 0; i < N; i++) { line[i] -= mean; pk = Math.max(pk, Math.abs(line[i])); }
  for (let i = 0; i < N; i++) line[i] /= pk;
  const rho = Math.pow(0.001, 1 / (f * (o.t60 ?? 1.5)));
  const i0 = Math.round(t0 * sr);
  const n = Math.min(out.length - i0, Math.ceil(dur * sr));
  const amp = o.amp ?? 1;
  let idx = 0, last = 0, apx = 0, apy = 0;
  for (let i = 0; i < n; i++) {
    const s = line[idx];
    out[i0 + i] += s * amp * envAt(i, n, sr, { attack: 0.0005, release: o.release ?? 0.02 });
    const y = rho * ((1 - S) * s + S * last);
    last = s;
    const ap = c * y + apx - c * apy;
    apx = y; apy = ap;
    line[idx] = ap;
    if (++idx >= N) idx = 0;
  }
}

// two-operator FM (electric piano, bells)
export function fm(out, sr, t0, dur, o) {
  const i0 = Math.round(t0 * sr);
  const n = Math.min(out.length - i0, Math.ceil(dur * sr));
  const amp = o.amp ?? 1;
  let ph = 0, mph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const I = o.index * Math.exp(-t / (o.indexDecay ?? 0.3));
    ph += (TAU * o.f) / sr;
    mph += (TAU * o.f * (o.ratio ?? 1)) / sr;
    out[i0 + i] += Math.sin(ph + I * Math.sin(mph)) * amp * envAt(i, n, sr, o);
  }
}

// static filter pass (returns a new array)
export function filt(src, sr, type, f, q = 0.707) {
  const bq = new Biquad(sr, type, f, q);
  const d = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) d[i] = bq.run(src[i]);
  return d;
}

export function mixInto(out, src, sr, t0 = 0, gain = 1) {
  const i0 = Math.round(t0 * sr);
  const n = Math.min(src.length, out.length - i0);
  for (let i = 0; i < n; i++) out[i0 + i] += src[i] * gain;
}

// trim silence, optional saturation, remove DC, loudness-normalise (loudest 30 ms window) with a peak ceiling
export function finish(d, sr, o = {}) {
  if (o.drive) { const k = Math.tanh(o.drive); for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * o.drive) / k; }
  let end = d.length;
  while (end > 1 && Math.abs(d[end - 1]) < 2e-4) end--;
  d = d.subarray(0, Math.min(d.length, end + Math.round(sr * 0.005)));
  let m = 0;
  for (let i = 0; i < d.length; i++) m += d[i];
  m /= d.length;
  const fade = Math.min(d.length, Math.round(sr * (o.fade ?? 0.006)));
  for (let i = 0; i < d.length; i++) {
    d[i] -= m;
    if (i >= d.length - fade) d[i] *= (d.length - i) / fade;
  }
  const win = Math.max(1, Math.round(sr * 0.03));
  let acc = 0, best = 0, pk = 1e-9;
  for (let i = 0; i < d.length; i++) {
    acc += d[i] * d[i];
    if (i >= win) acc -= d[i - win] * d[i - win];
    best = Math.max(best, acc);
    pk = Math.max(pk, Math.abs(d[i]));
  }
  const rms = Math.sqrt(best / win) || 1e-9;
  let g = (o.rms ?? 0.22) / rms;
  if (pk * g > (o.peak ?? 0.95)) g = (o.peak ?? 0.95) / pk;
  for (let i = 0; i < d.length; i++) d[i] *= g;
  return d;
}
