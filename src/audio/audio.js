// WebAudio engine: pre-rendered SFX and instrument samples (see sounds.js), a lookahead music
// sequencer (songs.js) with crossfades, reverb buses, and a looped engine sound. No audio files.
import { SFX, INSTR, DRUMS, engineLoop } from './sounds.js';
import { SONGS, compileSong } from './songs.js';
import { mtof, finish, rng } from './dsp.js';

const clampv = (v, a, b) => (v < a ? a : v > b ? b : v);

// playback level per sound (buffers are loudness-normalised when rendered)
const SFX_VOL = {
  click: 0.34, back: 0.3, tick: 0.2, whoosh: 0.25, coin: 0.3, star: 0.42, unlock: 0.42, deny: 0.34, win: 0.5, fail: 0.45,
  wood: 0.45, card: 0.42, squish: 0.45, metal: 0.34, glass: 0.36, rubber: 0.4, squeak: 0.32, piano: 0.4,
  land: 0.6, scrape: 0.3, bonk: 0.5, bounce: 0.45, boost: 0.38, rumble: 0.55, rockwarn: 0.36, lost: 0.38,
  break: 0.5, crack: 0.42, splat: 0.5, shatter: 0.42, boom: 0.7, horn: 0.38, quack: 0.42,
  geyser: 0.45, sizzle: 0.3, meteor: 0.55, piston: 0.5, crumble: 0.45, warp: 0.34,
};
// coin streaks climb a major pentatonic instead of a raw pitch ramp
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const JITTER = new Set(['wood', 'card', 'squish', 'metal', 'glass', 'rubber', 'land', 'scrape', 'break', 'crack', 'splat', 'shatter', 'bonk', 'piston', 'crumble', 'click', 'back', 'tick']);
const GAP = { coin: 0.035, click: 0.03, tick: 0.02 };
const IMPACT = { wood: 'wood', card: 'card', squish: 'squish', crack: 'card', metal: 'metal', rubber: 'rubber', glass: 'glass', squeak: 'squeak', gold: 'metal', piano: 'piano' };
// cut instruments at note end (seconds of release); unlisted sample instruments ring out naturally
const RELEASE = { nylon: 0.3, bass: 0.07, ep: 0.35, synpluck: 0.08 };
const SONG_IDS = ['title', 'meadow', 'canyon', 'snow', 'volcano', 'moon'];
const MUSIC_LEVEL = 0.5;
// evens out the measured loudness of the songs
const SONG_GAIN = { title: 1.04, meadow: 1.06, canyon: 1.07, snow: 1.21, volcano: 1.05, moon: 0.9 };

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxVol = 0.8;
    this.musicVol = 0.5;
    this.sdkMuted = false;
    this.adMuted = false;
    this.hidden = false;
    this.engine = null;
    this.lastPlay = {};
    this.buffers = {};
    this.samples = {};
    this.drums = {};
    this.compiled = {};
    this.cur = null;
    this.musicTimer = null;
    this.pending = [];
  }

  ensure(ctx = null) {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!ctx && !AC) return null;
    try {
      this.ctx = ctx || new AC();
    } catch (e) {
      return null;
    }
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.006;
    comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(c.destination);
    this.sfxGain = c.createGain();
    this.musicGain = c.createGain();
    // tame the top end so nothing sounds shrill on laptop speakers or earbuds
    const shelf = c.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 3500;
    shelf.gain.value = -7;
    const sfxLp = c.createBiquadFilter();
    sfxLp.type = 'lowpass';
    sfxLp.frequency.value = 9000;
    sfxLp.Q.value = 0.5;
    this.sfxGain.connect(shelf);
    shelf.connect(sfxLp);
    sfxLp.connect(this.master);
    const musicLp = c.createBiquadFilter();
    musicLp.type = 'lowpass';
    musicLp.frequency.value = 4500;
    musicLp.Q.value = 0.5;
    this.musicGain.connect(musicLp);
    musicLp.connect(this.master);
    const ir = this.makeIR(2.2, 0.38);
    this.sfxBus = c.createGain();
    this.sfxBus.connect(this.sfxGain);
    const send = c.createGain();
    send.gain.value = 0.1;
    this.sfxBus.connect(send);
    const sfxRev = c.createConvolver();
    sfxRev.buffer = this.makeIR(1.2, 0.18);
    send.connect(sfxRev);
    sfxRev.connect(this.sfxGain);
    this.musicRev = c.createConvolver();
    this.musicRev.buffer = ir;
    this.musicRev.connect(this.musicGain);
    this.applyVolumes();
    // render sounds, then every instrument and drum, in small idle slices so nothing hitches later
    this.pending = [
      ...Object.keys(SFX).map((k) => () => this.sfxBuf(k)),
      ...Object.keys(DRUMS).map((k) => () => this.drum(k)),
      ...Object.keys(INSTR).map((k) => () => this.sample(k, 60)),
    ];
    const work = () => {
      if (!this.ctx) return;
      const t0 = performance.now();
      while (this.pending.length && performance.now() - t0 < 6) this.pending.shift()();
      if (this.pending.length) setTimeout(work, 20);
    };
    setTimeout(work, 0);
    return c;
  }

  makeIR(dur, decay) {
    const c = this.ctx, sr = c.sampleRate, n = Math.round(sr * dur);
    const ir = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch), r = rng(500 + ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        lp += (0.85 - 0.7 * (t / dur)) * (r() * 2 - 1 - lp);
        d[i] = t < 0.011 ? 0 : lp * Math.exp(-t / decay);
      }
    }
    return ir;
  }

  unlock() {
    const c = this.ensure();
    if (c && c.state === 'suspended' && !this.hidden && !this.adMuted) c.resume().catch(() => {});
  }

  setVolumes(sfx, music) {
    this.sfxVol = sfx;
    this.musicVol = music;
    this.applyVolumes();
  }

  get muted() { return this.sdkMuted || this.adMuted || this.hidden; }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.sfxVol, t, 0.03);
    this.musicGain.gain.setTargetAtTime(this.musicVol * MUSIC_LEVEL, t, 0.05);
    if (!this.ctx.suspend) return;
    if (this.muted && this.ctx.state === 'running' && (this.adMuted || this.hidden)) {
      // keep the context alive for sdk mute (settings can flip quickly); suspend for ads / hidden tab
      this.ctx.suspend().catch(() => {});
    } else if (!this.muted && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setSdkMuted(v) { this.sdkMuted = !!v; this.applyVolumes(); }
  setAdMuted(v) { this.adMuted = !!v; this.applyVolumes(); }
  setHidden(v) { this.hidden = !!v; this.applyVolumes(); }

  ok(name, gap) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return false;
    const t = this.ctx.currentTime;
    if (this.lastPlay[name] && t - this.lastPlay[name] < gap) return false;
    this.lastPlay[name] = t;
    return true;
  }

  toBuffer(data) {
    const b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    b.getChannelData(0).set(data);
    return b;
  }

  sfxBuf(name) {
    let b = this.buffers[name];
    if (!b) {
      const r = SFX[name];
      if (!r) return null;
      const sr = this.ctx.sampleRate;
      b = this.buffers[name] = Array.isArray(r) ? r.map((f) => this.toBuffer(f(sr))) : this.toBuffer(r(sr));
    }
    return Array.isArray(b) ? b[Math.floor(Math.random() * b.length)] : b;
  }

  // ---------- sfx ----------
  play(name, s = 1, extra) {
    if (!this.ok(name, GAP[name] ?? 0.05)) return;
    const b = this.sfxBuf(name);
    if (!b) return;
    const c = this.ctx;
    let rate = 1;
    if (name === 'coin') rate = Math.pow(2, PENTA[Math.min(extra || 0, PENTA.length - 1)] / 12);
    else if (name === 'star') rate = [1, 1.26, 1.498][extra] ?? 1.498;
    else if (JITTER.has(name)) rate = 0.93 + Math.random() * 0.14;
    const src = c.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = (SFX_VOL[name] ?? 0.5) * clampv(s, 0.05, 1);
    src.connect(g);
    g.connect(this.sfxBus);
    src.start();
  }

  impact(sound, s) {
    this.play(IMPACT[sound] || 'wood', s);
  }

  // ---------- engine loop ----------
  startEngine() {
    const c = this.ctx;
    if (!c || this.engine) return;
    if (!this.engineBuf) this.engineBuf = this.toBuffer(engineLoop(c.sampleRate));
    const src = c.createBufferSource();
    src.buffer = this.engineBuf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    src.start();
    this.engine = { src, lp, g };
  }

  updateEngine(rpm, load, on) {
    const e = this.engine;
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    e.src.playbackRate.setTargetAtTime(0.75 + rpm * 1.9 + load * 0.12, t, 0.06);
    e.lp.frequency.setTargetAtTime(380 + rpm * 900 + load * 1100, t, 0.06);
    e.g.gain.setTargetAtTime(on ? 0.06 + load * 0.07 + rpm * 0.04 : 0, t, 0.08);
  }

  stopEngine() {
    const e = this.engine;
    if (!e) return;
    this.engine = null;
    try {
      const t = this.ctx.currentTime;
      e.g.gain.setTargetAtTime(0, t, 0.05);
      e.src.stop(t + 0.3);
    } catch (err) { /* ignore */ }
  }

  // ---------- music ----------
  sample(inst, n) {
    const def = INSTR[inst];
    let set = this.samples[inst];
    if (!set) {
      const sr = this.ctx.sampleRate;
      set = this.samples[inst] = def.roots.map((root) => ({ root, buf: this.toBuffer(finish(def.render(sr, mtof(root)), sr, { rms: 0.2, fade: 0.03 })) }));
    }
    let best = set[0];
    for (const s of set) if (Math.abs(s.root - n) < Math.abs(best.root - n)) best = s;
    return best;
  }

  drum(name) {
    return this.drums[name] || (this.drums[name] = this.toBuffer(DRUMS[name](this.ctx.sampleRate)));
  }

  startMusic(name = 'title') {
    if (!this.ctx) return;
    if (typeof name === 'number') name = SONG_IDS[name] || 'title';
    if (!SONGS[name] || (this.cur && this.cur.name === name)) return;
    const c = this.ctx;
    const song = this.compiled[name] || (this.compiled[name] = compileSong(SONGS[name]));
    // warm up every voice the song uses (a few ms, done once per song)
    for (const part of [song.intro, song.body]) {
      for (const e of part.events) {
        if (DRUMS[e.i]) this.drum(e.i);
        else if (INSTR[e.i] && !this.samples[e.i]) this.sample(e.i, 60);
      }
    }
    const now = c.currentTime;
    if (this.cur) {
      const o = this.cur;
      o.bus.gain.setTargetAtTime(0, now, 0.25);
      o.wet.gain.setTargetAtTime(0, now, 0.25);
      setTimeout(() => { try { o.bus.disconnect(); o.wet.disconnect(); } catch (e) { /* gone */ } }, 3000);
    }
    const bus = c.createGain(), wet = c.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    const lvl = SONG_GAIN[name] ?? 1;
    bus.gain.setTargetAtTime(lvl, now + 0.05, 0.12);
    wet.gain.setValueAtTime(0.0001, now);
    wet.gain.setTargetAtTime(lvl, now + 0.05, 0.12);
    bus.connect(this.musicGain);
    wet.connect(this.musicRev);
    this.cur = { name, song, bus, wet, t0: now + 0.2, part: song.intro.events.length ? 'intro' : 'body', ei: 0 };
    if (!this.musicTimer) {
      const tick = () => {
        this.scheduleMusic();
        this.musicTimer = setTimeout(tick, 70);
      };
      tick();
    }
  }

  stopMusic() {
    clearTimeout(this.musicTimer);
    this.musicTimer = null;
    if (this.cur) {
      const o = this.cur;
      o.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      o.wet.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    }
    this.cur = null;
  }

  scheduleMusic(horizon = 0.3) {
    const c = this.ctx, S = this.cur;
    if (!c || !S || c.state !== 'running') return;
    const sp = 60 / S.song.bpm / 4, sw = S.song.swing * sp;
    const now = c.currentTime, until = now + horizon;
    for (let guard = 0; guard < 4000; guard++) {
      const part = S.song[S.part];
      if (S.ei >= part.events.length) {
        S.t0 += part.steps * sp;
        S.part = 'body';
        S.ei = 0;
        continue;
      }
      const e = part.events[S.ei];
      const st = Math.floor(e.t);
      const when = S.t0 + (e.t + (st % 2 ? sw / sp : 0)) * sp + (e.off || 0);
      if (when > until) break;
      S.ei++;
      if (when < now - 0.03) continue; // the tab stalled: drop late notes instead of a burst
      this.note(e, when, sp, S);
    }
  }

  note(e, when, sp, S) {
    const c = this.ctx;
    const dur = Math.max(sp, e.l * sp);
    const out = c.createGain();
    out.gain.value = e.v;
    let node = out;
    if (e.p && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = e.p;
      out.connect(p);
      node = p;
    }
    node.connect(S.bus);
    if (e.rv) {
      const s = c.createGain();
      s.gain.value = e.rv;
      node.connect(s);
      s.connect(S.wet);
    }
    if (DRUMS[e.i]) {
      const src = c.createBufferSource();
      src.buffer = this.drum(e.i);
      src.connect(out);
      src.start(when);
      return;
    }
    if (INSTR[e.i]) {
      const smp = this.sample(e.i, e.n);
      const src = c.createBufferSource();
      src.buffer = smp.buf;
      src.playbackRate.value = Math.pow(2, (e.n - smp.root) / 12);
      src.connect(out);
      src.start(when);
      const rel = RELEASE[e.i];
      if (rel) {
        const end = when + dur;
        out.gain.setValueAtTime(e.v, end);
        out.gain.setTargetAtTime(0, end, rel / 3);
        src.stop(end + rel * 2);
      }
      return;
    }
    this.synthNote(e, when, dur, out);
  }

  // live oscillator voices: soft flute lead and warm pad
  synthNote(e, when, dur, out) {
    const c = this.ctx, f = mtof(e.n);
    const pad = e.i === 'pad';
    const att = pad ? 0.4 : 0.06;
    const rel = pad ? 0.7 : 0.2;
    const end = when + dur;
    const eg = c.createGain();
    eg.gain.setValueAtTime(0, when);
    eg.gain.linearRampToValueAtTime(1, when + att);
    eg.gain.setValueAtTime(1, Math.max(when + att, end - 0.01));
    eg.gain.linearRampToValueAtTime(0, end + rel);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = pad ? 900 : 1600;
    lp.Q.value = 0.5;
    lp.connect(eg);
    const oscs = [];
    const mk = (type, mul, gain, det = 0) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      o.detune.value = det;
      const g = c.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(lp);
      oscs.push(o);
      return o;
    };
    if (pad) {
      mk('sawtooth', 1, 0.22, -7);
      mk('sawtooth', 1, 0.22, 7);
      mk('sine', 0.5, 0.35);
    } else {
      const o = mk('sine', 1, 0.34);
      mk('triangle', 1, 0.06);
      mk('sine', 2, 0.02);
      // small scoop into the note, like a breath
      o.frequency.setValueAtTime(f * 0.985, when);
      o.frequency.exponentialRampToValueAtTime(f, when + 0.07);
      if (dur > 0.3) {
        const lfo = c.createOscillator();
        lfo.frequency.value = 4.8;
        const lg = c.createGain();
        lg.gain.setValueAtTime(0, when);
        lg.gain.linearRampToValueAtTime(10, when + Math.min(0.45, dur));
        lfo.connect(lg);
        for (const x of oscs) lg.connect(x.detune);
        oscs.push(lfo);
      }
    }
    eg.connect(out);
    for (const o of oscs) { o.start(when); o.stop(end + rel + 0.05); }
  }
}

export const audio = new AudioEngine();
