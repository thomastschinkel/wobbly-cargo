// Sound recipes. Each returns a mono Float32Array rendered at sample rate sr.
// Everything is kept soft and warm: fundamentals in the low/mid range, few bright partials,
// no piercing high-frequency noise.
import { TAU, mtof, rng, buf, modal, noise, osc, pluck, fm, filt, mixInto, finish, Biquad } from './dsp.js';

// ---------- instrument voices (also used by jingles) ----------
function marimbaNote(d, sr, t0, f, a = 1) {
  const dec = f < 300 ? 0.6 : f < 700 ? 0.45 : 0.32;
  modal(d, sr, t0, [{ f, a, d: dec }, { f: f * 3.93, a: a * 0.12, d: dec * 0.14 }], { attack: 0.003 });
  noise(d, sr, t0, 0.012, { type: 'lowpass', f: Math.min(f * 3, 2500), amp: a * 0.08, decay: 0.003, seed: Math.round(f) });
}

function epNote(d, sr, t0, f, a = 1, dur = 1.6) {
  fm(d, sr, t0, dur, { f, ratio: 1, index: 0.9, indexDecay: 0.25, attack: 0.006, decay: 0.8, amp: a });
}

function brassNote(d, sr, t0, f, dur, o = {}) {
  // sad-trombone style: saw through a lowpass that opens on the attack ("wah"), optional vibrato
  const i0 = Math.round(t0 * sr), n = Math.min(d.length - i0, Math.ceil(dur * sr));
  const bq = new Biquad(sr, 'lowpass', 300, 1.6), bq2 = new Biquad(sr, 'lowpass', 300, 0.7);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const vib = o.vib ? 1 + o.vib * Math.sin(TAU * 5.6 * t) * Math.min(1, t / 0.25) : 1;
    const ff = f * vib * (o.bend ? 1 - o.bend * Math.min(1, t / dur) : 1);
    const dt = ff / sr;
    ph += dt;
    if (ph >= 1) ph -= 1;
    let x = 2 * ph - 1;
    if (ph < dt) { const u = ph / dt; x -= u + u - u * u - 1; } else if (ph > 1 - dt) { const u = (ph - 1) / dt; x -= u * u + u + u + 1; }
    if ((i & 31) === 0) {
      const open = Math.min(1, t / 0.08) * (0.55 + 0.45 * Math.exp(-t / 0.18));
      const cut = 200 + 850 * open * (o.wah ? 0.6 + 0.4 * Math.sin(TAU * 4 * t) : 1);
      bq.set('lowpass', cut, 1.6); bq2.set('lowpass', cut * 1.3, 0.7);
    }
    const env = Math.min(1, t / 0.04) * (i > n - sr * 0.08 ? (n - i) / (sr * 0.08) : 1);
    d[i0 + i] += bq2.run(bq.run(x)) * env * (o.amp ?? 1);
  }
}

// ---------- SFX ----------
const S = {};

S.click = (sr) => {
  const d = buf(sr, 0.1);
  osc(d, sr, 0, 0.09, { f: (t) => 320 + 360 * Math.exp(-t / 0.012), attack: 0.002, decay: 0.028 });
  return finish(d, sr);
};

S.back = (sr) => {
  const d = buf(sr, 0.12);
  osc(d, sr, 0, 0.1, { f: (t) => 230 + 250 * Math.exp(-t / 0.016), attack: 0.002, decay: 0.032 });
  return finish(d, sr);
};

S.tick = (sr) => {
  const d = buf(sr, 0.05);
  modal(d, sr, 0, [{ f: 1150, a: 1, d: 0.008 }], { attack: 0.001 });
  return finish(d, sr);
};

S.whoosh = (sr) => {
  const d = buf(sr, 0.4);
  noise(d, sr, 0, 0.38, { type: 'bandpass', f: 250, f1: 900, q: 1, attack: 0.14, release: 0.2 });
  return finish(d, sr, { rms: 0.14 });
};

// soft kalimba plink; streaks walk up a pentatonic scale via playbackRate
S.coin = (sr) => {
  const d = buf(sr, 0.45);
  modal(d, sr, 0, [{ f: 587.3, a: 1, d: 0.1 }, { f: 1174.7, a: 0.1, d: 0.035 }, { f: 293.7, a: 0.2, d: 0.05 }], { attack: 0.004 });
  return finish(d, sr);
};

S.star = (sr) => {
  const d = buf(sr, 1.2);
  marimbaNote(d, sr, 0, 523.3, 1);
  epNote(d, sr, 0, 523.3, 0.35, 1.1);
  return finish(d, sr);
};

S.unlock = (sr) => {
  const d = buf(sr, 1.3);
  [523.3, 659.3, 784, 1046.5].forEach((f, i) => marimbaNote(d, sr, i * 0.08, f, 0.8));
  epNote(d, sr, 0.32, 523.3, 0.3, 0.9);
  return finish(d, sr);
};

S.deny = (sr) => {
  const d = buf(sr, 0.3);
  osc(d, sr, 0, 0.09, { f: 196, wave: 'tri', lp: 700, decay: 0.05 });
  osc(d, sr, 0.11, 0.15, { f: 165, wave: 'tri', lp: 600, decay: 0.07 });
  return finish(d, sr, { rms: 0.18 });
};

S.win = (sr) => {
  const d = buf(sr, 2.4);
  [523.3, 659.3, 784].forEach((f, i) => marimbaNote(d, sr, i * 0.12, f, 0.8));
  for (const f of [261.6, 329.6, 392, 493.9]) epNote(d, sr, 0.38, f, 0.3, 1.9);
  marimbaNote(d, sr, 0.38, 1046.5, 0.6);
  marimbaNote(d, sr, 0.38, 130.8, 0.5);
  return finish(d, sr, { rms: 0.22 });
};

S.fail = (sr) => {
  const d = buf(sr, 2.3);
  [233.1, 220, 207.7].forEach((f, i) => brassNote(d, sr, i * 0.38, f, 0.34, { amp: 0.8 }));
  brassNote(d, sr, 1.14, 196, 1.0, { amp: 0.9, vib: 0.03, wah: true, bend: 0.03 });
  return finish(d, sr, { rms: 0.2 });
};

// cargo impacts: a few variations each so repeats don't sound robotic
const wood = (v) => (sr) => {
  const d = buf(sr, 0.3), r = rng(11 + v), k = 0.88 + r() * 0.24;
  modal(d, sr, 0, [{ f: 180 * k, a: 1, d: 0.05 }, { f: 440 * k, a: 0.5, d: 0.03 }, { f: 960 * k, a: 0.2, d: 0.015 }], { bend: 0.1, bendT: 0.008, attack: 0.002 });
  noise(d, sr, 0, 0.05, { type: 'bandpass', f: 1200, q: 0.8, amp: 0.3, decay: 0.006, seed: 20 + v });
  return finish(d, sr);
};
const card = (v) => (sr) => {
  const d = buf(sr, 0.2), k = 0.9 + v * 0.1;
  noise(d, sr, 0, 0.15, { type: 'lowpass', f: 600 * k, amp: 1.2, decay: 0.035, seed: 30 + v });
  osc(d, sr, 0, 0.12, { f: (t) => 90 * k + 70 * Math.exp(-t / 0.02), decay: 0.04, amp: 0.7 });
  return finish(d, sr);
};
const squish = (v) => (sr) => {
  const d = buf(sr, 0.25), k = 0.9 + v * 0.12;
  noise(d, sr, 0, 0.2, { type: 'bandpass', f: 800 * k, f1: 280, q: 2, amp: 1.4, decay: 0.05, seed: 50 + v });
  osc(d, sr, 0, 0.14, { f: (t) => 80 + 110 * Math.exp(-t / 0.03), decay: 0.05, amp: 0.6 });
  return finish(d, sr);
};
const metal = (v) => (sr) => {
  const d = buf(sr, 0.7), k = 0.9 + v * 0.1;
  const f0 = 240 * k, ratios = [1, 2.32, 4.25, 6.63], amps = [1, 0.6, 0.3, 0.12], decs = [0.3, 0.2, 0.1, 0.05];
  modal(d, sr, 0, ratios.map((q, i) => ({ f: f0 * q, a: amps[i], d: decs[i] })), { attack: 0.002 });
  osc(d, sr, 0, 0.12, { f: (t) => 90 + 60 * Math.exp(-t / 0.02), decay: 0.04, amp: 0.9 });
  return finish(d, sr);
};
const glass = (v) => (sr) => {
  const d = buf(sr, 0.3), k = 0.92 + v * 0.08;
  noise(d, sr, 0, 0.1, { type: 'lowpass', f: 800, amp: 1, decay: 0.025, seed: 70 + v });
  modal(d, sr, 0, [{ f: 1180 * k, a: 0.3, d: 0.05 }, { f: 1870 * k, a: 0.1, d: 0.03 }], { attack: 0.002 });
  return finish(d, sr);
};
const rubber = (v) => (sr) => {
  const d = buf(sr, 0.3), k = 0.9 + v * 0.1;
  osc(d, sr, 0, 0.25, { f: (t) => 170 * k * (1 + 0.8 * (1 - Math.exp(-t / 0.02))) * (1 + 0.05 * Math.sin(TAU * 20 * t)), decay: 0.07, attack: 0.003 });
  noise(d, sr, 0, 0.05, { type: 'lowpass', f: 450, amp: 0.6, decay: 0.012, seed: 80 + v });
  return finish(d, sr);
};
const squeak = (v) => (sr) => {
  const d = buf(sr, 0.2), k = 0.92 + v * 0.1;
  osc(d, sr, 0, 0.15, { f: (t) => (640 + 220 * Math.sin((Math.PI * t) / 0.15)) * k, wave: 'tri', lp: 1400, attack: 0.015, decay: 0.07 });
  return finish(d, sr, { rms: 0.18 });
};
const piano = (v) => (sr) => {
  const d = buf(sr, 1.4), r = rng(90 + v);
  const root = 40 + Math.floor(r() * 5);
  for (const iv of [0, 1, 6, 13]) fm(d, sr, r() * 0.012, 1.3, { f: mtof(root + iv), ratio: 1, index: 1.6, indexDecay: 0.12, decay: 0.45, amp: 0.5 });
  noise(d, sr, 0, 0.08, { type: 'lowpass', f: 600, amp: 1, decay: 0.02, seed: 95 + v });
  return finish(d, sr);
};

const V3 = (f) => [f(0), f(1), f(2)];
S.wood = V3(wood);
S.card = V3(card);
S.squish = V3(squish);
S.metal = V3(metal);
S.glass = V3(glass);
S.rubber = V3(rubber);
S.squeak = V3(squeak);
S.piano = [piano(0), piano(1)];

S.land = (sr) => {
  const d = buf(sr, 0.45);
  osc(d, sr, 0, 0.4, { f: (t) => 42 + 75 * Math.exp(-t / 0.035), decay: 0.11, amp: 1.2 });
  noise(d, sr, 0, 0.2, { type: 'lowpass', f: 450, amp: 0.9, decay: 0.04, seed: 100 });
  modal(d, sr, 0.004, [{ f: 170, a: 0.35, d: 0.05 }, { f: 410, a: 0.15, d: 0.03 }]);
  return finish(d, sr, { drive: 1.3 });
};

S.scrape = (sr) => {
  const d = buf(sr, 0.35), r = rng(110);
  noise(d, sr, 0, 0.32, { type: 'bandpass', f: 1000, f1: 550, q: 1.8, amp: 1, attack: 0.02, release: 0.12 });
  let g = 1;
  for (let i = 0; i < d.length; i++) { if (i % Math.round(sr * 0.008) === 0) g = 0.35 + r() * 0.65; d[i] *= g; }
  return finish(d, sr, { rms: 0.14 });
};

S.bonk = (sr) => {
  const d = buf(sr, 0.5);
  modal(d, sr, 0, [{ f: 440, a: 1, d: 0.07 }, { f: 1100, a: 0.25, d: 0.03 }], { bend: 0.5, bendT: 0.012, attack: 0.002 });
  osc(d, sr, 0, 0.2, { f: (t) => 70 + 150 * Math.exp(-t / 0.025), decay: 0.07, amp: 0.9 });
  return finish(d, sr);
};

S.bounce = (sr) => {
  const d = buf(sr, 0.7);
  const f = (t) => (120 + 380 * (1 - Math.exp(-t / 0.07))) * (1 + 0.06 * Math.sin(TAU * 14 * t) * Math.exp(-t / 0.3));
  osc(d, sr, 0, 0.6, { f, attack: 0.005, decay: 0.2 });
  noise(d, sr, 0, 0.06, { type: 'lowpass', f: 380, amp: 0.8, decay: 0.015, seed: 120 });
  return finish(d, sr);
};

S.boost = (sr) => {
  const d = buf(sr, 0.65);
  noise(d, sr, 0, 0.6, { type: 'bandpass', f: 250, f1: 1200, q: 1.4, attack: 0.06, release: 0.3, amp: 1.2 });
  osc(d, sr, 0, 0.5, { f: (t) => 150 * Math.pow(2, t * 2.6), wave: 'saw', lp: 900, attack: 0.03, decay: 0.22, amp: 0.3 });
  return finish(d, sr, { rms: 0.18 });
};

S.rumble = (sr) => {
  const d = buf(sr, 1.9), r = rng(130);
  noise(d, sr, 0, 1.85, { type: 'lowpass', f: 150, q: 0.8, attack: 0.35, release: 0.6, amp: 1.5, steep: true });
  for (let i = 0; i < d.length; i++) d[i] *= 0.7 + 0.3 * Math.sin((TAU * 6.5 * i) / sr + Math.sin((TAU * 1.3 * i) / sr) * 2);
  for (let k = 0; k < 10; k++) modal(d, sr, 0.2 + r() * 1.4, [{ f: 160 + r() * 200, a: 0.15, d: 0.03 }]);
  return finish(d, sr, { rms: 0.2 });
};

S.rockwarn = (sr) => {
  const d = buf(sr, 1.0), r = rng(140);
  for (let k = 0; k < 16; k++) {
    const t = r() * 0.85;
    modal(d, sr, t, [{ f: 700 + r() * 1200, a: 0.2 + r() * 0.3, d: 0.01 + r() * 0.02 }, { f: 300 + r() * 250, a: 0.15, d: 0.02 }], { attack: 0.002 });
  }
  noise(d, sr, 0, 0.9, { type: 'lowpass', f: 300, amp: 0.4, attack: 0.25, release: 0.4, seed: 141 });
  return finish(d, sr, { rms: 0.14 });
};

S.lost = (sr) => {
  const d = buf(sr, 0.7);
  const f = (t) => 950 * Math.pow(260 / 950, Math.min(1, t / 0.6)) * (1 + 0.012 * Math.sin(TAU * 6 * t));
  osc(d, sr, 0, 0.64, { f, attack: 0.03, release: 0.1 });
  noise(d, sr, 0, 0.64, { type: 'bandpass', f: 950, f1: 260, q: 6, amp: 0.2, attack: 0.03, release: 0.1, seed: 150 });
  return finish(d, sr, { rms: 0.15 });
};

S.break = (sr) => {
  const d = buf(sr, 0.45), r = rng(160);
  for (let k = 0; k < 8; k++) {
    const t = k * 0.017 + r() * 0.01, f = 260 + r() * 500;
    modal(d, sr, t, [{ f, a: 0.4 + r() * 0.6, d: 0.02 + r() * 0.02 }, { f: f * 2.7, a: 0.12, d: 0.01 }], { attack: 0.002 });
  }
  noise(d, sr, 0, 0.3, { type: 'bandpass', f: 1000, q: 0.8, amp: 0.7, decay: 0.05, seed: 161 });
  osc(d, sr, 0, 0.15, { f: (t) => 50 + 50 * Math.exp(-t / 0.03), decay: 0.05, amp: 0.8 });
  return finish(d, sr, { rms: 0.22 });
};

S.crack = (sr) => {
  const d = buf(sr, 0.2);
  [[0, 1], [0.024, 0.75], [0.058, 0.5]].forEach(([t, a], i) => noise(d, sr, t, 0.014, { type: 'bandpass', f: 1000, q: 1.2, amp: a * 1.6, decay: 0.003, seed: 170 + i }));
  noise(d, sr, 0.01, 0.08, { type: 'lowpass', f: 900, amp: 0.4, decay: 0.02, seed: 175 });
  return finish(d, sr, { rms: 0.18 });
};

S.splat = (sr) => {
  const d = buf(sr, 0.45);
  noise(d, sr, 0, 0.35, { type: 'bandpass', f: 1100, f1: 200, q: 1.4, amp: 1.2, decay: 0.09, seed: 180 });
  [[0.02, 800], [0.06, 600], [0.11, 440], [0.17, 360]].forEach(([t, f], i) => noise(d, sr, t, 0.06, { type: 'bandpass', f, f1: f * 0.7, q: 4, amp: 1.3 - i * 0.25, decay: 0.018, seed: 181 + i }));
  osc(d, sr, 0, 0.2, { f: (t) => 50 + 80 * Math.exp(-t / 0.03), decay: 0.06, amp: 0.8 });
  return finish(d, sr, { rms: 0.22 });
};

S.shatter = (sr) => {
  const d = buf(sr, 0.7), r = rng(190);
  for (let k = 0; k < 20; k++) {
    const t = 0.3 * r() * r();
    modal(d, sr, t, [{ f: 900 + r() * 1400, a: 0.1 + r() * 0.2, d: 0.03 + r() * 0.08 }], { attack: 0.002 });
  }
  noise(d, sr, 0, 0.35, { type: 'bandpass', f: 1300, q: 0.8, amp: 0.4, decay: 0.08, seed: 191 });
  noise(d, sr, 0, 0.1, { type: 'lowpass', f: 600, amp: 0.8, decay: 0.03, seed: 192 });
  return finish(d, sr, { rms: 0.2 });
};

S.boom = (sr) => {
  const d = buf(sr, 1.8), r = rng(200);
  noise(d, sr, 0, 1.7, { type: 'lowpass', f: 1800, f1: 80, q: 0.8, amp: 1.2, decay: 0.42, attack: 0.003, seed: 201 });
  osc(d, sr, 0, 1.2, { f: (t) => 32 + 70 * Math.exp(-t / 0.12), decay: 0.4, amp: 1.4 });
  for (let k = 0; k < 40; k++) {
    const t = -Math.log(1 - r() * 0.95) * 0.25;
    noise(d, sr, t, 0.01, { type: 'bandpass', f: 600 + r() * 1600, q: 1, amp: 0.45 * r() * Math.exp(-t / 0.5), decay: 0.003, seed: 210 + k });
  }
  return finish(d, sr, { drive: 1.6, rms: 0.28 });
};

S.horn = (sr) => {
  const d = buf(sr, 0.6);
  for (const [t0, dur] of [[0, 0.17], [0.23, 0.27]]) {
    osc(d, sr, t0, dur, { f: 349.2, wave: 'square', width: 0.4, lp: 1200, attack: 0.015, release: 0.05, amp: 0.5 });
    osc(d, sr, t0, dur, { f: 440, wave: 'square', width: 0.4, lp: 1200, attack: 0.015, release: 0.05, amp: 0.4 });
  }
  return finish(d, sr, { rms: 0.18 });
};

S.quack = (sr) => {
  const d = buf(sr, 0.22), src = buf(sr, 0.2);
  osc(src, sr, 0, 0.17, { f: (t) => 400 - 100 * (t / 0.17), wave: 'saw', attack: 0.01, decay: 0.09 });
  mixInto(d, filt(src, sr, 'bandpass', 1000, 3), sr, 0, 1);
  mixInto(d, filt(src, sr, 'bandpass', 2100, 4), sr, 0, 0.35);
  return finish(d, sr, { rms: 0.2 });
};

// world 4/5 hazards
S.geyser = (sr) => {
  const d = buf(sr, 1.6), r = rng(230);
  noise(d, sr, 0, 1.5, { type: 'bandpass', f: 450, f1: 800, q: 0.7, steep: true, amp: 1, attack: 0.06, decay: 0.55, seed: 231 });
  noise(d, sr, 0, 0.8, { type: 'lowpass', f: 220, amp: 0.9, attack: 0.02, decay: 0.25, seed: 232 });
  for (let k = 0; k < 8; k++) osc(d, sr, r() * 0.5, 0.06, { f: (t) => (200 + r() * 200) * (1 + t * 6), attack: 0.006, decay: 0.02, amp: 0.2 });
  return finish(d, sr, { rms: 0.18 });
};

S.sizzle = (sr) => {
  const d = buf(sr, 0.9), r = rng(240);
  noise(d, sr, 0, 0.85, { type: 'bandpass', f: 800, q: 0.9, steep: true, amp: 0.5, attack: 0.05, release: 0.4, seed: 241 });
  for (let k = 0; k < 30; k++) noise(d, sr, r() * 0.8, 0.008, { type: 'bandpass', f: 650, q: 1, steep: true, amp: 0.7 * r(), decay: 0.004, seed: 242 + k });
  return finish(d, sr, { rms: 0.12 });
};

S.meteor = (sr) => {
  const d = buf(sr, 1.3);
  noise(d, sr, 0, 0.7, { type: 'bandpass', f: 1200, f1: 250, q: 1.6, amp: 1, attack: 0.35, release: 0.05, seed: 250 });
  noise(d, sr, 0.68, 0.6, { type: 'lowpass', f: 1000, f1: 90, amp: 1.3, decay: 0.15, seed: 251 });
  osc(d, sr, 0.68, 0.5, { f: (t) => 38 + 70 * Math.exp(-t / 0.06), decay: 0.15, amp: 1.2 });
  return finish(d, sr, { rms: 0.2, drive: 1.2 });
};

S.piston = (sr) => {
  const d = buf(sr, 0.7);
  noise(d, sr, 0, 0.22, { type: 'bandpass', f: 1400, f1: 500, q: 0.9, amp: 0.8, attack: 0.012, decay: 0.08, seed: 260 });
  modal(d, sr, 0.16, [{ f: 170, a: 1, d: 0.12 }, { f: 410, a: 0.45, d: 0.07 }, { f: 700, a: 0.2, d: 0.04 }], { attack: 0.002 });
  osc(d, sr, 0.16, 0.2, { f: (t) => 45 + 80 * Math.exp(-t / 0.02), decay: 0.06, amp: 1 });
  return finish(d, sr, { rms: 0.2 });
};

S.crumble = (sr) => {
  const d = buf(sr, 0.7), r = rng(270);
  for (let k = 0; k < 11; k++) modal(d, sr, r() * 0.45, [{ f: 140 + r() * 240, a: 0.4 + r() * 0.5, d: 0.02 + r() * 0.03 }, { f: 700 + r() * 500, a: 0.1, d: 0.01 }], { attack: 0.002 });
  noise(d, sr, 0, 0.55, { type: 'lowpass', f: 1000, amp: 0.5, decay: 0.18, seed: 271 });
  return finish(d, sr, { rms: 0.18 });
};

S.warp = (sr) => {
  const d = buf(sr, 1.0);
  const f = (t) => (380 + 200 * Math.sin(TAU * 1.1 * t - 1.2)) * (1 + 0.02 * Math.sin(TAU * 6 * t));
  osc(d, sr, 0, 0.95, { f, attack: 0.15, release: 0.3 });
  return finish(d, sr, { rms: 0.13 });
};

export const SFX = S;

// ---------- engine: seamless loop of exhaust pulses, pitched at runtime by playbackRate ----------
export function engineLoop(sr) {
  const f = 30, P = 24, len = Math.round((sr * P) / f), per = len / P, r = rng(99);
  const d = new Float32Array(len);
  for (let k = 0; k < P; k++) {
    const i0 = Math.round(k * per), a = 0.8 + r() * 0.4;
    const n = Math.round(per * 1.5);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const v = a * (0.2 * Math.exp(-t / 0.004) * (r() * 2 - 1) + Math.exp(-t / 0.012) * Math.sin(TAU * 90 * t) + 0.7 * Math.exp(-t / 0.022) * Math.sin(TAU * 45 * t));
      d[(i0 + i) % len] += v;
    }
  }
  let pk = 1e-9;
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
  for (let i = 0; i < len; i++) d[i] = Math.tanh((d[i] / pk) * 1.3) * 0.8;
  return d;
}

// ---------- music instruments: sample recipes rendered at a few root notes ----------
export const INSTR = {
  marimba: { roots: [48, 60, 72], render: (sr, f) => { const d = buf(sr, 1.6); marimbaNote(d, sr, 0, f); return d; } },
  nylon: { roots: [45, 57, 69], render: (sr, f) => { const d = buf(sr, 2.2); pluck(d, sr, 0, f, 2.2, { bright: 0.38, s: 0.48, t60: 1.8, pick: 0.22 }); return d; } },
  bass: {
    roots: [31, 38, 45],
    render: (sr, f) => {
      const d = buf(sr, 1.8);
      pluck(d, sr, 0, f, 1.8, { bright: 0.22, s: 0.5, t60: 1.4, pick: 0.3, amp: 0.6 });
      osc(d, sr, 0, 1.8, { f, attack: 0.006, decay: 0.6, amp: 0.7 });
      return d;
    },
  },
  ep: { roots: [48, 60, 72], render: (sr, f) => { const d = buf(sr, 2.4); epNote(d, sr, 0, f, 1, 2.4); return d; } },
  synpluck: {
    roots: [48, 60, 72],
    render: (sr, f) => {
      const d = buf(sr, 1.0);
      const lp = (t) => f * 1.2 + 1200 * Math.exp(-t / 0.06);
      osc(d, sr, 0, 1.0, { f, wave: 'saw', lp, q: 0.9, attack: 0.004, decay: 0.3 });
      osc(d, sr, 0, 1.0, { f, wave: 'sine', attack: 0.004, decay: 0.35, amp: 0.5 });
      return d;
    },
  },
};

export const DRUMS = {
  kick: (sr) => {
    const d = buf(sr, 0.45);
    osc(d, sr, 0, 0.45, { f: (t) => 45 + 85 * Math.exp(-t / 0.03), attack: 0.002, decay: 0.18 });
    return finish(d, sr, { drive: 1.3, rms: 0.36 });
  },
  // brushed snare: soft noise swish with a little body
  snare: (sr) => {
    const d = buf(sr, 0.3);
    noise(d, sr, 0, 0.26, { type: 'bandpass', f: 1500, q: 0.5, amp: 1, attack: 0.006, decay: 0.08, seed: 310 });
    osc(d, sr, 0, 0.1, { f: (t) => 170 + 40 * Math.exp(-t / 0.01), wave: 'tri', decay: 0.04, amp: 0.5 });
    return finish(d, sr, { rms: 0.24 });
  },
  rim: (sr) => {
    const d = buf(sr, 0.1);
    modal(d, sr, 0, [{ f: 820, a: 1, d: 0.025 }, { f: 1900, a: 0.2, d: 0.008 }], { attack: 0.002 });
    return finish(d, sr, { rms: 0.22 });
  },
  shaker: (sr) => {
    const d = buf(sr, 0.12);
    noise(d, sr, 0, 0.1, { type: 'bandpass', f: 3600, q: 0.9, amp: 1, attack: 0.015, decay: 0.03, seed: 340 });
    return finish(d, sr, { rms: 0.15 });
  },
  log: (sr) => {
    const d = buf(sr, 0.6);
    modal(d, sr, 0, [{ f: 175, a: 1, d: 0.16 }, { f: 420, a: 0.35, d: 0.06 }], { bend: 0.08, bendT: 0.01, attack: 0.003 });
    return finish(d, sr, { rms: 0.28 });
  },
};
